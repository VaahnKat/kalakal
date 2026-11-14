# Changelog

## 0.7.1 — 14 Nov 2026
- kalakal.se is the main address: workers.dev and www forward to it; robots.txt and sitemap.xml

## 0.7 — 14 Nov 2026
- **Accounts:** Sign in with Google; welcome step (display name, 13+, terms); My quizzes (host, edit, page, duplicate, delete); download my data; delete account
- **Save & share** in the editor: description, category, language, age group; Private / Unlisted / Public; Save to My quizzes; open saved quizzes for editing
- **Quiz library** (`/library.html`): search, 12 categories, language and age filters, Popular / Trending / Newest / Top rated; quiz pages with Host this quiz, Copy and edit, Like, Share, Report (answers never shown); creator pages; Popular this week on the home page
- **Moderation:** blocked words, AI safety check, a new creator's first public quiz waits for approval, 3 reports hide a quiz; admin page with approvals, reports and numbers
- **Pictures on phones** for saved quizzes (R2 storage, once switched on)
- **Security & professionalism:** Content-Security-Policy and security headers, cross-site request check, inline scripts removed, privacy policy and terms, site menu and footer, link-preview image
- Plays counted per quiz (finished games with 3+ players); `test/accounts-test.mjs`

## 0.6.1 — 13 Nov 2026
- Edit questions and right answers everywhere: AI review (tap an answer to mark it right, Edit to change wording), and **Edit questions** in the lobby for a created game (same PIN, players stay; locked once the game starts)
- "Edit first" links for the ready-made quiz and meeting warm-up
- Lobby invite: Share invite, WhatsApp and Copy link, with the PIN in the link
- Two new FAQ answers on the guide page

## 0.6 — 13 Nov 2026
- **Create with AI** in the quiz builder: topic, or your own notes / PDF / text file; 5–20 questions; difficulty, audience, language (English, Tamil, Swedish and more), time, optional true/false
- Review before adding: untick questions; New question, Harder, Easier, Better wrong answers on any question
- Cloudflare Workers AI (Gemma 4 26B, fallback Llama 4 Scout); 5 free AI quizzes and 40 edits per person per day, site-wide budget inside the free tier; Copy AI prompt offered when it runs out
- Feedback mode renamed **Kalakal Pulse** (was Kural)
- Guide page: Way 4 is now Create with AI, new GIF, 4 new FAQ answers
- Local development uses fake AI replies (`npm run dev`); `npm run dev:ai` for the real model; `test/ai-test.mjs`

## 0.5 — 13 Nov 2026
- "Create your own quiz" page (`/create.html`), linked from the home page: five ways to create, each with a step-by-step GIF, a quick-type cheat sheet, spreadsheet column guide and FAQ
- Paste or type questions: plain-text format (`*` right, `-` wrong) with live preview; also accepts rows copied from Excel / Google Sheets
- Spreadsheet: downloadable template, CSV import, export as spreadsheet
- Copy AI prompt for ChatGPT, Claude or Gemini; the reply pastes straight back in
- Editor: tap Right to mark answers (several allowed), Enter to move to the next box, duplicate, Normal / Double / No points per question, True or false questions
- Pictures (upload, drag, paste, link, GIF) and YouTube clips with start/end on the big screen
- `test/editor-test.mjs`, `tools/record_guides.py`

## 0.4 — 13 Nov 2026
- Mascot expressions on the big screen: the Host thinks during a question, gasps in the last 5 seconds and cheers on the reveal; the Explorer thinks while a Kural slide waits for answers
- Illustrated crew (Quiz-show Host, Sparkle Explorer, Arcade Champion) on the home page, mode cards, lobby, podium and end screen
- Project organised: `design/` holds original artwork, `tools/build_mascots.py` rebuilds web images, `docs/HANDBOOK.md` documents everything
- `npm test` and `npm run mascots` scripts

## 0.3 — 13 Nov 2026
- Two clear modes when creating a session: Kalakal Play (quiz) and Kalakal Kural (polls & feedback)
- Player characters: 2 bodies, 4 colours, 14 outfits, eyewear (2,800 looks); gallery at `/avatars.html`
- Fun names ("Surprise me", name ideas, host switch for fun names only)
- Milestones with animated reactions: streaks, took the lead, top 3, comeback, perfect game

## 0.2 — 12 Nov 2026
- Kalakal Kural: poll, word cloud, open question, scale, Q&A; mixable with quiz questions
- Results CSV with per-slide summary

## 0.1 — 12 Nov 2026
- First playable quiz: PIN + QR join, lobby, timer, reveal, scoreboard, podium
- Deployed on Cloudflare Workers from GitHub
