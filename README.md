# Kalakal

Live quizzes and audience interaction anyone can join with a PIN. Host on a big screen, play on phones. No app, no account.

**Live:** https://kalakal.prabhuwinz17.workers.dev · **Version:** 0.4 · **Full documentation:** [docs/HANDBOOK.md](docs/HANDBOOK.md)

| Mode | Like | What players do |
|---|---|---|
| **Kalakal Play** | Kahoot | Answer timed quiz questions for points, streaks and the podium |
| **Kalakal Kural** | Mentimeter | Polls, word clouds, open questions, 1–5 scales and live Q&A, anonymously |

Every player gets a character (2,800 looks), can take a fun name like *Captain Dosa*, and sees animated reactions for streaks, taking the lead and reaching the top 3.

## Quick start

```bash
npm install
npm run dev        # http://localhost:8787
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
| `test/` | Bot tests (quiz, Kural, characters) and screenshot scripts |
| `docs/` | Handbook: architecture, change guide, brand, deploy, roadmap |

How to change content, rules, colours or mascots: see the **Change guide** in [docs/HANDBOOK.md](docs/HANDBOOK.md#4-change-guide).

## Credits and licences

Fonts: Unbounded and Catamaran (SIL Open Font License). QR codes: qrcode-generator by Kazuhiko Arase (MIT). Mascot artwork © Kalakal.
