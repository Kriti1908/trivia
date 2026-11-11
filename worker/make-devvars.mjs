// Run:  node make-devvars.mjs   -> writes worker/.dev.vars for LOCAL testing (git-ignored)
import fs from 'fs';
const quiz = JSON.parse(fs.readFileSync(new URL('./quiz.json', import.meta.url)));
fs.writeFileSync(new URL('./.dev.vars', import.meta.url),
`QUIZ_JSON=\`${JSON.stringify(quiz)}\`
ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost:8001,http://127.0.0.1:8001
# BREVO_API_KEY=paste-a-key-here-only-if-you-want-REAL-emails-while-testing
`);
console.log('wrote .dev.vars  (emails are skipped unless you add BREVO_API_KEY)');
