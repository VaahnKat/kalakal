# Kalakal

Live quizzes and audience interaction anyone can join with a PIN. Host on a big screen, play on phones. No app, no account.

**Live:** https://kalakal.se · **Version:** 0.7 · **Full documentation:** [docs/HANDBOOK.md](docs/HANDBOOK.md)

| Mode | Like | What players do |
|---|---|---|
| **Kalakal Play** | Kahoot | Answer timed quiz questions for points, streaks and the podium |
| **Kalakal Pulse** | Mentimeter | Polls, word clouds, open questions, 1–5 scales and live Q&A, anonymously |

Hosts can sign in with Google to save quizzes and share them in the public **library**, where anyone can host or copy them.

Every player gets a character (2,800 looks), can take a fun name like *Captain Dosa*, and sees animated reactions for streaks, taking the lead and reaching the top 3.

Hosts can create quizzes with the built-in AI (topic, notes or PDF), by typing or pasting plain text, importing a spreadsheet, using their own AI chat, or question by question with pictures and YouTube clips. See `/create.html`.

## Quick start

```bash
npm install
npm run dev        # http://localhost:8787 (fake AI replies; npm run dev:ai for the real model)
npm test           # in a second terminal, while dev is running
```

Push to `main` and Cloudflare deploys automatically.

## Project map

| Folder | What is in it |
|---|---|
| `src/` | Server: API and live game rooms (Cloudflare Worker + Durable Object) |
| `public/` | Website: home, host and player screens, styles, images, fonts |
| `design/` | Original artwork: logo SVGs, full-size mascot PNGs |
| `tools/` | `build_mascots.py`: rebuilds web images from `design/` (`npm run mascots`) |
| `test/` | Bot tests (quiz, Pulse, characters) and screenshot scripts |
| `docs/` | Handbook: architecture, change guide, brand, deploy, roadmap |

How to change content, rules, colours or mascots: see the **Change guide** in [docs/HANDBOOK.md](docs/HANDBOOK.md#4-change-guide).

## Credits and licences

Fonts: Unbounded and Catamaran (SIL Open Font License). QR codes: qrcode-generator by Kazuhiko Arase (MIT). Mascot artwork © Kalakal.
