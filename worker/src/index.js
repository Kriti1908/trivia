// Kriti trivia backend (Cloudflare Worker). Answers, clue, math and email all live here.
const LIMITS = { start: 10, submit: 15, retry: 40 };   // per IP per hour
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rid = () => [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const GEN = [
  () => { const a = rnd(213, 989), b = rnd(23, 89), c = rnd(112, 799), d = rnd(31, 97), e = rnd(41, 99);
    return { t: `Evaluate: <b>${a} × ${b} + ${c} × ${d} − ${e}²</b>`, a: a * b + c * d - e * e, int: true }; },
  () => { const u = rnd(5, 20), a = [1.5, 2.5, 3.5, 4.5][rnd(0, 3)], t = rnd(12, 25);
    return { t: `A car moving at ${u} m/s accelerates uniformly at ${a} m/s² for ${t} s. How far (in metres) does it travel in this time? <span class="small">(s = ut + ½at²)</span>`, a: u * t + .5 * a * t * t }; },
  () => { const r1 = rnd(12, 47), r2 = rnd(20, 90), r3 = rnd(20, 90), V = rnd(12, 48), rt = r1 + r2 * r3 / (r2 + r3);
    return { t: `A ${r1} Ω resistor is in series with two resistors (${r2} Ω and ${r3} Ω) in parallel, across a ${V} V supply. Find the total <b>power</b> dissipated, in watts. <span class="small">(2 decimal places)</span>`, a: V * V / rt }; },
  () => { const a = rnd(3, 25), d = rnd(2, 9), n = 2 * rnd(14, 30), k = rnd(3, 9);
    return { t: `An arithmetic series has first term ${a} and common difference ${d}. Find the sum of its first ${n} terms, then multiply by ${k}.`, a: k * (n / 2) * (2 * a + (n - 1) * d), int: true }; },
  () => { const v = rnd(18, 45), h = rnd(5, 40), vy = v * Math.sin(Math.PI / 6);
    return { t: `A ball is thrown at ${v} m/s at 30° above horizontal from a cliff ${h} m high. Taking g = 9.8 m/s², how long (in seconds) until it hits the ground below? <span class="small">(2 decimal places)</span>`, a: (vy + Math.sqrt(vy * vy + 2 * 9.8 * h)) / 9.8 }; },
  () => { const r = rnd(4, 12), n = rnd(5, 9);
    return { t: `A bag contains ${r} red and ${n} blue counters. Two counters are drawn without replacement. What is the probability that both are red? Give your answer as a percentage. <span class="small">(2 decimal places)</span>`, a: 100 * r * (r - 1) / ((r + n) * (r + n - 1)) }; },
  () => { const radius = rnd(6, 18), angle = rnd(45, 135);
    return { t: `Find the area of a sector with radius ${radius} cm and angle ${angle}°. Use π = 3.14159. <span class="small">(2 decimal places)</span>`, a: 3.14159 * radius * radius * angle / 360 }; },
  () => { const price = rnd(120, 480), discount = rnd(12, 28), tax = rnd(5, 18);
    return { t: `An item costs $${price}. A ${discount}% discount is applied, followed by ${tax}% sales tax on the discounted price. What is the final price in dollars? <span class="small">(2 decimal places)</span>`, a: price * (1 - discount / 100) * (1 + tax / 100) }; },
  () => { const workers = rnd(4, 9), days = rnd(8, 18), extra = rnd(2, 5);
    return { t: `${workers} workers can complete a job in ${days} days. At the same rate, how many days would ${workers + extra} workers take? <span class="small">(2 decimal places)</span>`, a: workers * days / (workers + extra) }; },
];

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '';
    const ok = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).includes(origin.toLowerCase());
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' } : {};
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let quiz;
    try { quiz = JSON.parse(env.QUIZ_JSON); } catch { return out({ error: 'server not configured' }, 500); }
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const path = new URL(req.url).pathname;

    const limited = async kind => {
      const k = `r:${kind}:${ip}`, n = +(await env.KV.get(k) || 0);
      if (n >= LIMITS[kind]) return true;
      await env.KV.put(k, String(n + 1), { expirationTtl: 3600 });
      return false;
    };
    const newAttempt = async () => {
      const attempt = rid();
      await env.KV.put('a:' + attempt, '1', { expirationTtl: 3600 });
      return { attempt, questions: quiz.questions.map(q => ({ q: q.q, options: q.shuffle === false ? q.options : shuffle(q.options) })) };
    };
    const newChallenge = async () => {
      const p = GEN[rnd(0, GEN.length - 1)](), id = rid();
      await env.KV.put('c:' + id, JSON.stringify({ a: p.a, int: !!p.int }), { expirationTtl: 1800 });
      return { id, text: p.t };
    };

    if (path === '/api/start' && req.method === 'POST') {
      if (await limited('start')) return out({ error: 'slow down, try again later 🥺' }, 429);
      const b = await req.json().catch(() => ({}));
      const given = String(b.password || '').trim().toLowerCase();
      const real = String(quiz.password || '').trim().toLowerCase();
      if (!real || given !== real) return out({ error: 'wrong password 🥺' }, 401);   // no password configured = locked
      return out(await newAttempt());
    }

    if (path === '/api/submit' && req.method === 'POST') {
      if (await limited('submit')) return out({ error: 'slow down, try again later 🥺' }, 429);
      const b = await req.json().catch(() => ({}));
      const key = 'a:' + String(b.attempt);
      if (!(await env.KV.get(key))) return out({ error: 'expired', expired: true }, 400);
      await env.KV.delete(key);                                   // each attempt is single-use
      const n = quiz.questions.length;
      if (!Array.isArray(b.answers) || b.answers.length !== n) return out({ error: 'bad request' }, 400);
      const good = quiz.questions.filter((q, i) => b.answers[i] === q.correct).length;
      const msg = `kriti trivia attempted ${good}/${n} correct`;
      ctx.waitUntil(fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', headers: { 'api-key': env.BREVO_API_KEY || '', 'content-type': 'application/json' },
        body: JSON.stringify({ sender: { email: quiz.mail.from, name: 'Kriti Trivia' }, to: quiz.mail.to.map(email => ({ email })), subject: msg, textContent: msg }),
      }).catch(() => {}));
      if (good === n) return out({ correct: true, clue: quiz.clue });
      return out({ correct: false, wrong: n - good, total: n, challenge: await newChallenge() });
    }

    if (path === '/api/retry' && req.method === 'POST') {
      if (await limited('retry')) return out({ error: 'slow down, try again later 🥺' }, 429);
      const b = await req.json().catch(() => ({}));
      const key = 'c:' + String(b.challenge), raw = await env.KV.get(key);
      if (!raw) return out({ error: 'expired', expired: true }, 400);
      const c = JSON.parse(raw), v = parseFloat(String(b.answer).replace(',', '.'));
      const tol = c.int ? 0 : Math.max(.01, Math.abs(c.a) * .004);
      if (isNaN(v) || Math.abs(v - c.a) > tol) return out({ ok: false });
      await env.KV.delete(key);
      return out({ ok: true, ...(await newAttempt()) });
    }
    return out({ error: 'not found' }, 404);
  },
};
