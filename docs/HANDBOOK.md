# Kalakal Handbook

The one document that explains what Kalakal is, how it is built, and how to change it.
Version 0.7 · November 2026 · Owner: Prabha

**Live site:** https://kalakal.se (the old address kalakal.prabhuwinz17.workers.dev forwards visitors here)
**Code:** https://github.com/VaahnKat/kalakal (branch `main` deploys automatically)
**Files and originals:** Google Drive → `Kalakal`

---

## Contents

1. [What Kalakal is](#1-what-kalakal-is)
2. [Where everything lives](#2-where-everything-lives)
3. [How it works](#3-how-it-works)
4. [Change guide: how to change common things](#4-change-guide)
5. [Brand and design system](#5-brand-and-design-system)
6. [Mascots and characters](#6-mascots-and-characters)
7. [Test, deploy and roll back](#7-test-deploy-and-roll-back)
8. [Rules of the game (reference)](#8-rules-of-the-game-reference)
9. [Known limits and roadmap](#9-known-limits-and-roadmap)
10. [Decision log](#10-decision-log)

---

## 1. What Kalakal is

A free, browser-based live quiz and audience-engagement app. The host shows a big screen; everyone else joins on their phone with a 6-digit PIN or QR code. No app, no account.

| Mode | What it is like | Slide types |
|---|---|---|
| **Kalakal Play** | Kahoot-style quiz game: timer, points, streaks, podium | Quiz question |
| **Kalakal Pulse** | Mentimeter-style live feedback: anonymous, no scores | Poll, Word cloud, Open question, Scale, Q&A |
| **Vizha** (planned) | Big events and festivals, teams and houses | — |

The name: *kalakal* is Tamil slang for "awesome". *Vizha* means "festival". The feedback mode was first called *Kural* ("voice" in Tamil) and renamed **Pulse** in v0.6 so everyone understands it at once; in the code its id is still `kural`.

**Business model (planned):** free core forever; a paid tier later for saved quiz libraries, larger audiences, branding and reports. Running cost today: zero (Cloudflare free plan).

---

## 2. Where everything lives

### GitHub repository (source of truth for code and design sources)

```
kalakal/
├── README.md                 Short overview and quick start
├── CHANGELOG.md              What changed in each version
├── docs/
│   └── HANDBOOK.md           This document
├── src/
│   ├── index.js              The server: API + live game rooms (Cloudflare Worker + Durable Object)
│   ├── ai.js                 AI quiz generator: prompts, model calls, daily allowance (AiQuota)
│   ├── auth.js               Google sign-in, sessions, admin check
│   ├── db.js                 Database (D1) tables, created automatically; add changes to MIGRATIONS
│   ├── library.js            Saved quizzes, library, pictures (R2), likes, reports, admin, account data
│   ├── quiz.js               Quiz validation shared by games and saved quizzes
│   └── text.js               Shared text cleaning and the blocked-words filter
├── public/                   Everything the browser downloads (no build step)
│   ├── index.html            Home page with "Join a game"
│   ├── host.html             Host: choose mode, build, lobby, big-screen game
│   ├── play.html             Player's phone screens
│   ├── create.html           "Create your own quiz" guide: 5 ways, step GIFs, FAQ
│   ├── library.html          Public quiz library (search, categories, popular, trending)
│   ├── quiz.html             A quiz's public page: Host, Copy and edit, Like, Share, Report
│   ├── me.html               My quizzes, first-time welcome (13+, terms), account, export, delete
│   ├── creator.html          A creator's public quizzes
│   ├── admin.html            Admin: approvals, reports, numbers
│   ├── privacy.html, terms.html  Legal pages
│   ├── _headers              Security headers (CSP, HSTS…) for every page
│   ├── avatars.html          Gallery of mascots and player characters
│   ├── css/kalakal.css       All styles and brand tokens (colours, fonts, animations)
│   ├── js/
│   │   ├── host.js           Host screen logic
│   │   ├── play.js           Player screen logic
│   │   ├── common.js         Shared helpers: connection, timer, confetti, shapes
│   │   ├── avatar.js         Player character builder (SVG), shared with the server
│   │   ├── names.js          Fun-name generator, shared with the server
│   │   ├── quizzes.js        Slide types and the two ready-made sessions
│   │   ├── quicktype.js      Quick-type text + spreadsheet import/export, AI prompt
│   │   ├── ai-ui.js          "Create with AI" window: settings, PDF reading, review
│   │   ├── account.js        Top menu with sign-in, footer, API helper, quiz cards
│   │   └── media.js          Picture compression, YouTube embeds
│   ├── img/                  Logo, icon, mascots, guide/ (step GIFs)
│   ├── templates/            Downloadable spreadsheet template (CSV)
│   ├── fonts/                Self-hosted Unbounded + Catamaran (Tamil support)
│   └── vendor/               qrcode.js (MIT), pdfjs/ (Mozilla pdf.js, Apache-2.0, loaded only for PDFs)
├── design/                   Original artwork (not served to users)
│   ├── logo/                 Logo and icon SVG masters
│   └── mascots/source/       Full-size mascot PNGs + expression sheet
├── tools/
│   ├── build_mascots.py      Rebuilds public/img/mascots/*.webp from design/mascots/source
│   └── record_guides.py      Re-records the step GIFs on create.html
├── test/                     Automated tests (bots and screenshots)
├── wrangler.jsonc            Cloudflare configuration
└── package.json              Scripts: dev, deploy, test, mascots
```

### Google Drive → `Kalakal`

```
Kalakal/
├── 00 Kalakal Handbook                (this document as a Google Doc)
├── 01 Brand/
│   └── Logo/                          Logo pack ZIP, PNG logo and icon
├── 02 Mascots/
│   ├── Originals/                     Full-size PNGs exactly as generated
│   └── Expressions (cut out)/         Transparent PNGs of the 9 expressions
└── 03 App releases/
    └── (release snapshots)            Code archives; GitHub holds the full history
```

**Rule:** new artwork goes in Drive `02 Mascots/Originals` *and* in the repo `design/mascots/source`. The repo copy is what the build uses; Drive is the backup and the place to share with designers.

### Accounts

| Service | Used for | Account |
|---|---|---|
| GitHub | Code, history | VaahnKat |
| Cloudflare | Hosting (Workers, free plan) | Prabha's Cloudflare account |
| Google Drive | Originals, handbook, releases | Prabha's Google account |

---

## 3. How it works

```
Phones (play.html)     ──┐
                         ├── WebSocket ──> GameRoom (one per PIN: players, scores, timers)
Big screen (host.html) ──┘
Host browser ── POST /api/games ──> Worker (src/index.js) ──> new room, PIN + host key
```

1. The host picks a session and the browser sends it to `POST /api/games`. The server checks it, creates a room with a random 6-digit PIN and returns a secret **host key** (kept in the host's browser, so only that browser can control the game).
2. Host and players connect to the room over a WebSocket. All game rules run on the server: the correct answer never reaches phones before the reveal.
3. The room moves through phases: `lobby → question → reveal → leaderboard → … → podium → finished`. Pulse slides use the `engage` phase.
4. If a phone refreshes or loses Wi-Fi it rejoins with the same player id and keeps its score. The host can refresh too.

**Why this stack:** Cloudflare Workers + Durable Objects give real-time rooms for free, with no server to maintain. Plain HTML/CSS/JS means no build step: what is in `public/` is what users get.

### Messages (for developers)

| From → to | Messages |
|---|---|
| Host → server | `host_hello`, `start`, `next`, `skip`, `kick`, `lock`, `fun_names`, `hide`, `answered`, `update_quiz` (lobby only), `end` |
| Player → server | `join`, `answer`, `respond`, `avatar` |
| Server → host | `snapshot` (includes the quiz), `quiz_updated`, `update_error`, `lobby`, `question`, `answer_count`, `reveal`, `leaderboard`, `engage`, `results`, `podium`, `finished` |
| Server → player | `joined`, `lobby_wait`, `question`, `answer_ack`, `result`, `final`, `engage`, `respond_ack`, `respond_error`, `qa_list`, `thanks`, `kicked`, `between` |

API: `POST /api/games` → `{pin, hostKey}` · `GET /api/games/:pin` → `{exists, phase, locked, funNames, players}` · `GET /ws/:pin?role=host|player`.

---

## 4. Change guide

Each recipe says which file to open and what to change. After any change: test locally (section 7), commit, push. The live site updates in about a minute.

### Text and content

| I want to… | Open | Change |
|---|---|---|
| Change the ready-made quiz | `public/js/quizzes.js` | Edit `DEMO_QUIZ.questions`. Each question: `text`, `answers` (2–4), `correct` (0-based index), `time` (10–60 s) |
| Change the ready-made meeting session | `public/js/quizzes.js` | Edit `DEMO_MEETING.questions` |
| Change slide type names or hints | `public/js/quizzes.js` | `SLIDE_TYPES` |
| Change home page wording | `public/index.html` | Edit the text directly |
| Change the mode cards ("What do you want to run?") | `public/host.html` | Search for `mode-play` / `mode-kural` |
| Change milestone messages on phones | `public/js/play.js` | `MILESTONE_TEXT` |
| Add or remove fun names | `public/js/names.js` | `TITLES` and `THINGS` lists (names are combined; keep each result ≤ 16 characters) |
| Block more words | `src/index.js` | `BLOCKED` list |

### Quiz creation (editor, quick-type, spreadsheet)

| I want to… | Open | Change |
|---|---|---|
| Change the quick-type format (`*`, `-`, `time:`…) | `public/js/quicktype.js` | `parseText`; update the cheat sheet in `public/create.html` too |
| Change spreadsheet columns | `public/js/quicktype.js` | `COLUMNS`, `parseRows`, `TEMPLATE_CSV`; then regenerate `public/templates/kalakal-quiz-template.csv` |
| Change the AI prompt | `public/js/quicktype.js` | `aiPrompt` |
| Change picture size limits | `public/js/media.js` | `MAX_SIDE`, `TARGET_BYTES`, GIF limit in `compressImage` |
| Edit the guide page or FAQ | `public/create.html` | Plain HTML; each way is a `<section class="way">`, each FAQ a `<details>` |
| Change the invite text or share buttons | `public/js/host.js` | `invite()` and `setupShare()`; buttons in the lobby in `public/host.html` (`.share`) |
| Change how editing a live game works | `public/js/host.js` (`editQuizBtn`, `quizToDraft`) and `src/index.js` (`update_quiz`, lobby only) |
| Re-record the step GIFs after a UI change | `tools/record_guides.py` | `npm run dev`, then `npm run guides` (or `python3 tools/record_guides.py paste` for one) |

How pictures work today: uploads are shrunk in the browser and saved with the draft (browser storage, ~5 MB in total). During a game they stay in the host's tab and show on the big screen only; phones get just the answers. Server storage (Cloudflare R2) comes with accounts.

### AI quiz generator (`src/ai.js`)

| I want to… | Change |
|---|---|
| Use a different AI model | `MODELS` (first is used, second is the fallback). Model list and prices: Cloudflare docs → Workers AI → Models |
| Change how many free AI quizzes people get | `LIMITS.quizzesPerPerson`, `LIMITS.tweaksPerPerson` |
| Change the site-wide daily budget | `LIMITS.siteUnits` (1 unit = 1 quiz ≈ 90 Neurons; keep the total under the free 10,000 Neurons a day) |
| Change what the AI is told | `systemPrompt`, `quizPrompt`, `tweakPrompt` |
| Add a language to the menu | `public/host.html`, the `aiLang` select (any language also works via "Other…") |
| Change options (counts, audiences, levels) | `COUNTS`, `AUDIENCES`, `LEVELS` in `src/ai.js` and the matching selects in `public/host.html` |
| See AI usage and cost | Cloudflare dashboard → AI → Workers AI (Neurons used per day) and Workers & Pages → kalakal → Logs |

How it works: the browser sends the topic/notes and options to `POST /api/ai/quiz`. The Worker checks the daily allowance (`AiQuota` Durable Object, keyed by a daily-salted hash of the IP address, so no personal data is stored), asks the model for questions in the quick-type format, cleans and parses them with the same parser as pasted text, shuffles the answers, and returns slides. Nothing is added to the quiz until the host reviews it. If the model fails, the allowance is refunded. When the allowance runs out, people are offered **Copy AI prompt** instead.

Local development uses fake AI replies (`npm run dev`, `AI_MOCK=1`), so it works without a Cloudflare login. `npm run dev:ai` uses the real model (needs `npx wrangler login`).

### Accounts, saved quizzes and the library

| I want to… | Change |
|---|---|
| Add or rename a category | `CATEGORIES` in `src/library.js`, `CAT_ORDER` in `public/js/account.js`, `CATS` in `public/js/host.js` |
| Change when a quiz needs approval | `publicStatus()` in `src/library.js` (today: a creator's first public quiz, or the AI safety check says "unsafe") |
| Change how many reports hide a quiz | `REPORTS_TO_HIDE` in `src/library.js` |
| Change "popular" / "trending" | the `score` SQL in the `/api/library` route (`src/library.js`) |
| Change what counts as a play | `showEnd()` in `src/index.js` (today: saved quiz, 3+ players, once per game) |
| Change picture limits | `MEDIA_MAX` (per picture) and `MEDIA_PER_USER` in `src/library.js` |
| Change the database | add a new list to `MIGRATIONS` in `src/db.js` (never edit an old one); it runs automatically |
| Make someone an admin | add their Google email to the `ADMIN_EMAILS` secret in Cloudflare |
| Edit the privacy policy or terms | `public/privacy.html`, `public/terms.html` (update the date at the top) |
| Allow a new outside service on pages | `public/_headers` → `Content-Security-Policy` |

**How it fits together**

- **Sign-in:** Google only. `src/auth.js` redirects to Google, gets the email and name, creates the user and a session (random id in an HttpOnly cookie, row in D1, 30 days). New users see the welcome step (display name, 13+, terms) before they can save.
- **Saved quizzes** live in D1 (`quizzes` table; questions as JSON). Each quiz is Private, Unlisted or Public. Public quizzes are `ok`, `review` (waiting for admin) or `hidden` (3 reports, or hidden by admin).
- **Pictures:** uploaded on save to R2 at `u/<user>/<random>.<ext>`, served at `/media/...`. Saved quizzes keep `/media/...` links, so phones show pictures too. If R2 isn't switched on, pictures stay in the host's browser (big screen only).
- **Library pages never get the answers.** Hosting a library quiz starts the game on the server from the stored copy. The host sees the answers, as in any quiz app.
- **Plays** are counted per quiz per day when a game with 3+ players finishes. Popular = last 30 days, trending = last 7 days weighted towards today.
- **Security:** requests that change something must come from Kalakal's own pages (Origin check); every quiz call checks the owner; SVG uploads are refused; strict Content-Security-Policy; GDPR export and delete in My quizzes.

### Setup that needs the Cloudflare/Google dashboards (one time)

| # | What | Where |
|---|---|---|
| 1 | **Google sign-in keys.** Google Cloud Console → APIs & Services → OAuth consent screen (External, app name Kalakal, support email, logo, links to /privacy.html and /terms.html) → Credentials → Create OAuth client ID → Web application. Authorised redirect URIs: `https://kalakal.prabhuwinz17.workers.dev/auth/google/callback` and `https://kalakal.se/auth/google/callback`. | console.cloud.google.com |
| 2 | **Secrets in Cloudflare:** Workers & Pages → kalakal → Settings → Variables and Secrets → add as **Secret**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ADMIN_EMAILS` (your Google email). Secrets survive deploys. | dash.cloudflare.com |
| 3 | **Picture storage:** R2 → Get started (may ask for a card; usage within the free allowance costs nothing). Then uncomment the `r2_buckets` line in `wrangler.jsonc` and push: the bucket is created on deploy. | dash.cloudflare.com |
| 4 | **Email** `hello@kalakal.se`: once kalakal.se is on Cloudflare: Email → Email Routing → forward to your inbox. | dash.cloudflare.com |
| 5 | The **database** (D1, `kalakal-db`) is created automatically on the first deploy; nothing to do. If a deploy ever fails with a D1 error, create a D1 database called `kalakal-db` in the dashboard and redeploy. | |

### Rules and limits (all in `src/index.js`, top of file)

| Setting | Constant | Today |
|---|---|---|
| Players per game | `MAX_PLAYERS` | 200 |
| Slides per session | `MAX_SLIDES` | 50 |
| Nickname length | `NAME_MAX` | 16 |
| Answers per person (word cloud, open, Q&A) | `LIMITS` | 3, 3, 5 |
| Text length | `TEXT_MAX` | 25 / 200 / 200 |
| Speed points and streak bonus | search `a.points =` | 500–1,000 (× 2 on Double, 0 on No points) + up to 500 |

### Look and feel

| I want to… | Open | Change |
|---|---|---|
| Change a brand colour everywhere | `public/css/kalakal.css` | The `--marigold`, `--coral`… variables at the top. Player characters use the same colours in `public/js/avatar.js` (`BODY_COLORS`, `RAY_COLORS`) |
| Change fonts | `public/css/kalakal.css` | `@font-face` rules and `--display` / `--body`; put new woff2 files in `public/fonts/` |
| Change animations (bounce, fire, dance) | `public/css/kalakal.css` | Search `.react-` and `@keyframes` |
| Change the logo or icon | `design/logo/*.svg` is the master; copy to `public/img/logo.svg` / `icon.svg` |

### Mascots and characters

| I want to… | Do this |
|---|---|
| Replace a mascot or add a new expression | Put the PNG in `design/mascots/source/`, add it to `SINGLES` or `SHEET_CELLS` in `tools/build_mascots.py`, run `npm run mascots`, check `/avatars.html` |
| Change which expression shows when | `public/js/host.js`: search `M("host-` (question = thinking, last 5 s = surprised, reveal = happy, Pulse waiting = explorer-thinking) |
| Add a player outfit | `public/js/avatar.js`: add to `OUTFITS` + `OUTFIT_NAMES` and draw it in the outfit function. **Add at the end of the list**, otherwise saved player looks change |

### Bigger changes

- **New slide type:** add to `SLIDE_TYPES` (quizzes.js) → validation in `validateSession` and handling in the `respond` message (index.js) → big-screen view in host.js (search `engage`) → phone input in play.js (search `engage`) → a test in `test/engage-test.mjs`.
- **Custom domain:** Cloudflare dashboard → Workers & Pages → kalakal → Settings → Domains & Routes → Add custom domain.

---

## 5. Brand and design system

### Colours

| Name | Hex | Use |
|---|---|---|
| Ink | `#160B2A` | Background; all text on bright colours |
| Night | `#24143F` | Cards and panels |
| Line | `#3A2660` | Borders |
| Cream | `#FFF8EC` | Main text on dark |
| Mist | `#C9BEDF` | Secondary text |
| Marigold | `#FFB627` | Primary buttons, answer 1, mascot body |
| Coral | `#FF5D73` | Answer 3, alerts |
| Teal | `#19D3C5` | Answer 2, success |
| Lilac | `#A78BFA` | Answer 4, Pulse accents |

Rule: text on Marigold, Coral, Teal or Lilac is always Ink (contrast). Answers always pair a colour with a shape (circle, square, triangle, spark) for colour-blind players.

### Type

- **Unbounded** (500–800): headings, PIN, numbers.
- **Catamaran** (400–800): body text; includes Tamil.
- Both are self-hosted (SIL Open Font License), so Tamil always renders correctly.

### Logo

- **Wordmark** "kalakal" with a spark: `design/logo/kalakal-logo-on-dark.svg` / `-on-light.svg`.
- **App icon** "k" in a voice bubble: `design/logo/kalakal-icon-*.svg`.
- Full PNG pack (favicons, app-store 1024, social 800): Drive `01 Brand/Logo/Kalakal-Logo-Pack.zip`.

---

## 6. Mascots and characters

### The crew (illustrated, from Prabha's artwork)

| Mascot | Role in the app | Files |
|---|---|---|
| **Quiz-show Host** (top hat, bow tie) | Kalakal Play: home page, lobby, question screen, reveal | `host.webp`, `host-happy/thinking/surprised.webp` |
| **Sparkle Explorer** (goggles, cape) | Kalakal Pulse: mode card, waiting for answers, end screen | `explorer.webp`, `explorer-*.webp` |
| **Arcade Champion** (laurel, medal) | Podium and winners | `champion.webp`, `champion-*.webp` |

Where expressions appear today:

| Moment | Image |
|---|---|
| Question running | Host thinking |
| Last 5 seconds | Host surprised |
| Answer revealed | Host happy |
| Pulse slide, no answers yet | Explorer thinking |
| Error or "not your game" | Host surprised |

### Player characters (code-drawn)

Every player gets a character from `public/js/avatar.js`: 2 bodies (Minni the spark, Bubbi the voice bubble) × 4 colours × 5 ray colours × 14 outfits × eyewear = **2,800 looks**, stored as one number. Moods: ready, happy, sad, hurry, fire, wink.

### Image quality notes

- The single mascots are crisp up to about 600 px.
- The expression sprites come from one sheet and are only about 160 × 230 px. They look good up to about 130 px wide (how they are used today). For bigger use, generate each expression as its own transparent PNG at 1024 px or more and put it in `design/mascots/source/`.
- Keep the same character sheet when generating new art: on the large Host, one eye is a sparkle and the other plain; in the expressions both are plain. Pick one and keep it.

### Prompt for new expressions (image generator)

> Cute 3D sticker-style mascot, round marigold-yellow (#FFB627) body with four coral (#FF5D73) star points, big glossy black eyes, rosy cheeks, thick dark-purple outline, [OUTFIT]. Expression: [EXPRESSION]. Full body, centred, transparent background, no text, no shadow on the ground, 1024 × 1024.

Outfits: *purple top hat with gold star, teal tailcoat, purple bow tie* (Host) · *teal goggles, purple cape with gold clasp* (Explorer) · *gold laurel crown with star, gold medal on striped ribbon* (Champion).
Expressions to add next: cheering with both arms up, sad (for "wrong answer"), sleeping (for "waiting for host"), drumroll (for podium).

---

## 7. Test, deploy and roll back

### Run locally

Needs Node.js 20 or newer.

```bash
npm install
npm run dev            # http://localhost:8787 (fake AI replies, no login needed)
npm run dev:ai         # same, with the real AI model (needs: npx wrangler login)
```

Host in one tab, join in another tab or from a phone on the same Wi-Fi (use the computer's IP address).

### Tests (run while `npm run dev` is running)

```bash
npm test                                     # characters, names, milestones, question features, AI, accounts & library, quiz + Pulse bots
node test/load-test.mjs http://localhost:8787 150   # 150 simulated players
python3 test/screens.py                      # screenshots (needs Playwright + Chrome)
```

Checklist before pushing a visible change: home, host setup, lobby, a question, reveal, scoreboard, podium, and one phone screen look right; Tamil text renders; nothing overlaps on a 390 px wide phone.

### Deploy

Push to `main` on GitHub. Cloudflare Workers Builds deploys automatically (about a minute). Check the build under Cloudflare → Workers & Pages → kalakal → Deployments.

Manual deploy (if ever needed): `npx wrangler login` then `npm run deploy`.

### Own domain: kalakal.se

1. Cloudflare dashboard → **Add a domain** → `kalakal.se` → Free plan. Cloudflare shows two nameservers (like `ana.ns.cloudflare.com`).
2. At the registrar where kalakal.se was bought, replace the nameservers with Cloudflare's two. Takes from minutes to a few hours; Cloudflare emails when the domain is active.
3. Workers & Pages → **kalakal** → Settings → **Domains & Routes** → Add → **Custom domain** → `kalakal.se`. Repeat for `www.kalakal.se`. Cloudflare creates the DNS records and the HTTPS certificate.
4. Optional: Rules → Redirect Rules → send `www.kalakal.se/*` to `https://kalakal.se/${1}` so there is one address.

**Status: live since 14 Nov 2026.** The app uses whatever address it is opened on, so the lobby shows "Join at kalakal.se". Pages opened on the old workers.dev address or on www.kalakal.se forward to kalakal.se (`MAIN_HOST` at the top of `public/js/common.js`); a host page with a running game is left alone. `public/robots.txt` and `public/sitemap.xml` help search engines; add new public pages to the sitemap.

### Roll back

Cloudflare → Workers & Pages → kalakal → Deployments → choose an earlier version → **Rollback**. Then fix forward in GitHub (`git revert <commit>` and push).

### Release routine

1. Update `CHANGELOG.md` and the version in `package.json`.
2. Commit and push; check the live site.
3. Optional: download the release ZIP from GitHub (Code → Download ZIP) and put it in Drive `03 App releases`.
4. Update this handbook if anything in sections 2–6 changed, and copy it to the Drive Google Doc.

---

## 8. Rules of the game (reference)

**Scoring (Play):** correct answers score 500–1,000 points by speed: `1000 × (1 − time used ÷ time allowed ÷ 2)`. Streak bonus: +100 for each correct answer in a row after the first, up to +500. Wrong or no answer: 0 and the streak resets.

**Question options:** several answers can be marked right (any one of them scores; the reveal highlights all). Points per question: Normal, Double (speed points × 2) or No points (warm-up: no score, streak unchanged, not counted for "perfect game"). True or false is a quiz question with two answers.

**Milestones** (animated on phones, pop-ups on the big screen): on fire at 3, 5, 7, 10 in a row (then every 5) · took the lead · entered the top 3 · comeback · perfect game. Rank-based milestones start after the first question.

**Pulse:** anonymous on screen. Poll votes can be changed. Word cloud merges the same word in any case. Q&A upvotes toggle and you cannot upvote your own question. The host can hide any text and mark questions answered.

**Editing and inviting:** questions and right answers can be edited in the AI review window, in the editor, and from the lobby (**Edit questions**) until the game starts; the PIN stays the same and waiting players stay. Ready-made quizzes have "edit first" links. The lobby has Share invite (device share menu), WhatsApp and Copy link; the link is `/play.html?pin=123456`, so players only type a name.

**Safety:** nickname and text filter, duplicate names get a number, one answer per question, host-only controls via the secret host key, host can remove players and lock the lobby, "fun names only" switch.

**Results:** CSV download with quiz ranking and per-slide results.

---

## 9. Known limits and roadmap

**Limits today**

- No accounts: sessions are drafts saved in the host's browser.
- Game state is in memory for the length of a game.
- Up to 200 players per game (tested to 150).
- Privacy policy and terms needed before wide public launch.

**Next (suggested order)**

1. Sound effects and music (with a mute button).
3. Team / house battles (Vizha mode).
4. GIF search, picture reveal effects, co-editing, audience-submitted questions.
5. Redraw player characters in the 3D-sticker mascot style.
6. Mobile app (wraps the same web app).

---

## 10. Decision log

| Date | Decision | Why |
|---|---|---|
| Nov 2026 | Name **Kalakal** | Short, Tamil + global, free in searches |
| Nov 2026 | Cloudflare Workers + Durable Objects | Real-time rooms on the free plan, no servers |
| Nov 2026 | No build step (plain HTML/CSS/JS) | Anyone can edit and deploy; fewer things to break |
| Nov 2026 | Deploy from GitHub | Cloudflare upload cannot deploy Durable Objects; Git gives history and rollback |
| Nov 2026 | Self-hosted fonts | Tamil shaping was broken with fallback fonts |
| Nov 2026 | Two modes on the start screen (Play / Pulse) | Users must understand the quiz vs feedback choice immediately |
| Nov 2026 | Illustrated mascots for the crew, code-drawn characters for players | Brand quality where it matters, 2,800 unique looks at zero cost |
| Nov 2026 | Originals in `design/` + rebuild script | Any designer can replace art without touching code |
