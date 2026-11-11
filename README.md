# 🎀 How well do you know Kriti? — trivia

A cute pastel quiz. **Front end** is static (GitHub Pages). **Back end** is a tiny Cloudflare Worker that holds
the answers, the secret clue, the math "try again" puzzles and sends the emails.

```
docs/      → the website (GitHub Pages). Contains NO answers, NO clue, NO emails.
worker/    → the API (Cloudflare Worker, free tier). Real quiz content lives here as a *secret*.
```

## Project structure (put files exactly here)

If your download shows the files flat, recreate these folders. Two filenames repeat (`index.html`, `index.js`)
but they live in different folders and are different files.

```
kriti-quiz/                     ← the repo root (what you push to GitHub)
├── .gitignore                  ← keeps your secret files out of git (don't delete)
├── README.md                   ← this file
│
├── docs/                       ← THE WEBSITE (GitHub Pages serves this folder)
│   ├── index.html              ← the pages/UI. Edit for colours, text, image paths
│   ├── config.js               ← EDIT: paste your Worker URL here
│   └── img/
│       ├── cheer.gif           ← happy cat (front page + yayyy). Swap in your own gifs here
│       └── cry.gif             ← sad cat (SOB page + math page)
│
└── worker/                     ← THE BACKEND (deployed to Cloudflare, NOT to GitHub Pages)
    ├── wrangler.toml           ← EDIT: your KV id + your GitHub Pages origin
    ├── quiz.example.json       ← template. Don't put real answers in it
    ├── quiz.json               ← YOU CREATE THIS (copy of the example with real content). Git-ignored
    ├── .dev.vars               ← OPTIONAL, only for local testing. Git-ignored
    └── src/
        └── index.js            ← server logic: scoring, clue, math puzzles, emails (limits at top)
```

**What to add / edit where**

| I want to… | File |
|---|---|
| Change the password, questions, options, correct answers, the clue, recipient emails | `worker/quiz.json` (then re-run the `wrangler secret put QUIZ_JSON` command) |
| Set the sender email for notifications | `"from"` inside `worker/quiz.json` |
| Add the Brevo API key | Not in any file: `npx wrangler secret put BREVO_API_KEY` |
| Point the website at the server | `docs/config.js` |
| Allow my GitHub Pages site to call the server | `ALLOWED_ORIGINS` in `worker/wrangler.toml` |
| Change gifs | replace files in `docs/img/` (or edit the `img/...` paths in `docs/index.html`) |
| Change colours, fonts, wording | `docs/index.html` |
| Change math puzzles or rate limits | `worker/src/index.js` |

Only `docs/` is public. Only `worker/` is uploaded to Cloudflare. `worker/quiz.json` must never be committed.

## Why it's built this way (security)

Anything in a static site is readable via View Source / DevTools. So the browser only ever gets
questions + shuffled options. The server decides everything else:

| Thing | Where it lives |
|---|---|
| Password, correct answers, the clue, recipient emails | Worker **secret** `QUIZ_JSON` (never in git, never sent to the browser) |
| Scoring | Server. Browser sends its picks, gets back only "n wrong" |
| The "yayyy + next clue" screen | The clue only arrives in the response to a perfect submission. No client-side flag can unlock it |
| Math puzzle before retry | Generated and checked server-side; a new attempt is only issued after a correct solution |
| Emails | Sent by the server on every submitted attempt |
| Option order | Shuffled by the server on every attempt |

Extra protection: attempt tickets are single-use, and each IP is rate-limited per hour
(start 10, submit 15, retry 40 — edit `LIMITS` at the top of `worker/src/index.js`).

**Honest limits:** because the site tells players "n wrong", a determined script could probe answers one at a time.
The math gate, shuffling, single-use attempts and rate limits make that slow and annoying, and you'll see every
attempt in your inbox, but nothing public-and-free can make it mathematically impossible.

## 1. Edit your questions, answers, clue, emails

Copy the example and edit your copy (it is git-ignored, so it never gets published):

```
cp worker/quiz.example.json worker/quiz.json
```

```json
{
  "password": "momentofinertia",
  "clue": "next clue: <your string>",
  "mail": { "from": "verified-sender@gmail.com", "to": ["a@x.com", "b@y.com"] },
  "questions": [
    { "q": "Question text?", "options": ["A", "B", "C", "D"], "correct": "C" }
  ]
}
```

- **`password`** is asked when someone clicks *Start trivia* (case-insensitive). It is checked on the server, so it never appears
  in the website's code. If `password` is missing from `quiz.json`, the quiz stays locked.
- **`correct` is the option's text, not a number.** It must match one of the `options` exactly.
- Options are shuffled automatically on every attempt, so the correct answer is *never* stuck in the same
  position. You don't need to balance A/B/C/D yourself. Just don't write options like "All of the above"; if you must,
  add `"shuffle": false` to that question to keep its order.
- Keep 4 options per question, no duplicate options, and any number of questions (the "n/10" text and progress bar adapt;
  the intro text on the front page says "10", edit `docs/index.html` if you change the count).
- Make wrong options believable, since your audience are engineers who will guess cleverly.

After any edit, push it live (no redeploy of the website needed):

```
cd worker
npx wrangler secret put QUIZ_JSON < quiz.json          # macOS / Linux / Git Bash
# PowerShell:  Get-Content quiz.json | npx wrangler secret put QUIZ_JSON
```

## 2. Email setup (Brevo, free: 300 emails/day)

The server sends `kriti trivia attempted n/10 correct` to your two addresses after **every** attempt.

1. Sign up at brevo.com → **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Use an email you own and
   verify it. That address goes in `"from"` in `quiz.json`.
2. **SMTP & API → API Keys → Generate a key.**
3. Store it as a secret: `cd worker && npx wrangler secret put BREVO_API_KEY` and paste the key.
4. Put the two recipient addresses in `"to"`. Check spam the first time.

Never put the API key in any file in the repo.

## 3. Deploy (one time)

**Back end**

```
cd worker
npx wrangler login
npx wrangler kv namespace create KV         # copy the printed id into wrangler.toml (id = "...")
# set ALLOWED_ORIGINS in wrangler.toml to https://<your-github-username>.github.io
npx wrangler secret put QUIZ_JSON < quiz.json
npx wrangler secret put BREVO_API_KEY
npx wrangler deploy                          # prints https://kriti-trivia-api.<you>.workers.dev
```

**Front end**

1. Put that Worker URL in `docs/config.js`.
2. Push the repo to GitHub (`worker/quiz.json` is git-ignored, double-check `git status` before pushing).
3. Repo → **Settings → Pages → Deploy from branch → `main` / `/docs`**.
4. Open `https://<you>.github.io/<repo>/` and play.

If the page says it can't reach the server, the usual causes are a wrong URL in `config.js`, or `ALLOWED_ORIGINS`
not matching your Pages origin exactly (no trailing slash, no repo path).

## 4. Other tweaks

- **Images:** `docs/img/cheer.gif` (front page + yayyy) and `docs/img/cry.gif` (SOB + math screen). Replace the
  files, or change the `img/...` paths in `docs/index.html`. If an image fails to load, an emoji shows instead.
- **Colours / fonts:** CSS variables at the top of `docs/index.html`.
- **Math puzzles:** the `GEN` list in `worker/src/index.js`. Each returns `{ t: text, a: answer, int: true/false }`.
  Decimal answers accept a small tolerance, integer answers must be exact.
- **Test locally (no Cloudflare login needed):** see "Testing locally" in the root of this zip's `TESTING-LOCALLY.md`
  (short version: `cd worker && cp quiz.example.json quiz.json` if needed, `node make-devvars.mjs`, `npx wrangler dev --port 8787`,
  serve `docs/` on port 8000, and put `window.API_URL = "http://localhost:8787";` in `docs/config.local.js`).
- **Free-tier note:** Cloudflare KV allows ~1000 writes/day on the free plan. That's plenty for a friends quiz.
