# Changelog

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
