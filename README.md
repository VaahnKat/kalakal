# Kalakal — live quizzes anyone can join with a PIN

Version 0.2. Host quizzes **and** live audience interaction on a big screen; players join on their phones with a 6-digit PIN or QR code. No app, no account.

## What works today
**Kalakal Kural (new in 0.2): audience interaction, mixable with quiz questions in one session**
- **Poll:** live bar chart with percentages; players can change their vote
- **Word cloud:** up to 3 words each; same words (any case) merge and grow
- **Open question:** up to 3 answers each, shown as a card wall; host can hide any card
- **Scale:** rate 1–4 statements from 1 to 5; live average and distribution
- **Q&A:** up to 5 questions each, upvotes (toggle, not your own), sorted live; host marks answered or hides
- Anonymous on screen, rude-word filter on every text, results summary in the CSV download
- Ready-made "Team meeting warm-up" session; builder has a slide-type picker and reorder

**Kalakal Play (quiz)**
- **Host:** ready-made 10-question quiz, or build your own (up to 50 questions, 2–4 answers, 10–60 s each; draft saved in the browser)
- **Lobby:** big PIN, QR code, players appear live, tap a name to remove someone, lock the lobby
- **Game:** countdown ring, live "answered" counter, auto-reveal when everyone has answered, answer chart, scoreboard, podium with confetti, results download (CSV)
- **Players:** join with PIN + nickname, big shape+colour answer buttons, instant feedback (points, streak, rank), final placing
- **Scoring:** up to 1,000 points for speed (at least 500 for any correct answer) + streak bonus (+100 per correct answer in a row, max +500)
- **Safety:** nickname filter, duplicate names get a number, one answer per question, the correct answer never reaches phones before the reveal, only the host's browser can control the game
- **Reliability:** players who refresh or lose Wi-Fi rejoin with their score; the host can refresh and continue
- **Tested:** full games with 25, 50 and 150 simulated players (`npm run loadtest`) and every interaction type with 40 players (`node test/engage-test.mjs`)

## Run it on your computer
Needs [Node.js 20+](https://nodejs.org).
```bash
npm install
npm run dev
```
Open http://localhost:8787 — host on one tab, join from another tab or from your phone (same Wi-Fi: use your computer's IP address instead of localhost).

Load test (while `npm run dev` is running):
```bash
node test/load-test.mjs http://localhost:8787 25
```

## Put it online (free, about 10 minutes)
1. Create a free account at **dash.cloudflare.com/sign-up**.
2. In this folder run:
   ```bash
   npx wrangler login      # opens the browser, click Allow
   npm run deploy
   ```
3. Wrangler prints your live address, like `https://kalakal.<your-name>.workers.dev`. That's it: share it and play.

**Your own domain later** (e.g. kalakal.app): add the domain to Cloudflare, then in the dashboard go to Workers & Pages → kalakal → Settings → Domains & Routes → Add custom domain.

## How it's built
| Part | Where |
|---|---|
| Website (home, host, player screens) | `public/` — plain HTML, CSS and JavaScript, no build step |
| API + live game rooms | `src/index.js` — one Cloudflare Worker; each PIN is a Durable Object holding the game in memory |
| Brand | `public/css/kalakal.css`, logos in `public/img/`, fonts self-hosted in `public/fonts/` (SIL OFL) |
| QR codes | `public/vendor/qrcode.js` (MIT, Kazuhiko Arase) |
| Tests | `test/load-test.mjs` (quiz bots), `test/engage-test.mjs` (interaction bots), `test/screens*.py` (screenshots with Playwright) |

Runs on Cloudflare's free Workers plan (SQLite-backed Durable Objects). Limits per game: 200 players, 50 questions.

## Known limits in 0.1 (next steps)
- Quizzes live in the host's browser; there are no accounts or saved quiz library yet
- Game state is kept in memory for the length of a game; very long idle games may be cleared
- Avatars, power-ups, team mode and image slides are planned next
- Add a privacy policy and terms before opening it to the public
