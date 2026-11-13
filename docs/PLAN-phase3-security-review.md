# Kalakal: Phase 3, Budget, Security & Week-End Review Plan

13 November 2026 · Owner: Prabha · Status: draft for decision

---

## 1. Summary

**Where we are:** Kalakal v0.6.1 is live with quizzes (Play), polls and feedback (Pulse), the AI generator (tested live: works), editing everywhere, invite links and the Create-your-own-quiz guide. kalakal.se is bought; DNS is being connected.

**This plan covers**

- **Phase 3:** accounts, saved quizzes, a public quiz library with categories, popular and trending lists, moderation.
- **Budget:** what the paid Cloudflare and GitHub plans add, and four budget levels for Kalakal.
- **Security and professionalism:** a prioritised checklist to finish before public promotion.
- **End-of-week review with Fable 5.2:** scope, method, ready-to-paste prompts, deliverables.

**Recommended path**

1. **Now:** stay on free plans. Build Phase 3 on Cloudflare D1 (database) and R2 (picture storage), both with free allowances.
2. **Before public launch:** the P0 items in section 4 (privacy policy, terms, abuse protection, moderation, backups, security headers).
3. **Upgrade Cloudflare to Workers Paid (USD 5/month)** the day you start promoting widely, or when daily usage passes half of a free limit. GitHub can stay free.
4. **End of week:** full audit with Fable 5.2, then fix findings in priority order.

**Decisions needed from you** (section 7)

1. Sign-in: Google only to start (recommended), or Google + email link?
2. Public library: publish instantly after automatic checks (recommended), or hold every quiz for your approval?
3. Approve or change the starting categories (section 2.4).
4. Minimum age for accounts: 13+ (recommended; players without accounts can be any age).

---

## 2. Phase 3: accounts, saved quizzes and a public library

### 2.1 What users get

| Feature | What it does |
|---|---|
| **Sign in** | "Continue with Google". No passwords stored. Players still join games without an account. |
| **My quizzes** | Every quiz saved to the account, on any device: list, search, duplicate, delete, export. Browser drafts are imported on first sign-in. |
| **Visibility per quiz** | **Private** (only me) · **Unlisted** (anyone with the link) · **Public** (in the library) |
| **Pictures on phones** | Uploaded pictures move to Cloudflare R2, so phones can show them too (option per question). |
| **Public library** (`/library`) | Search; filter by category, language and age group; sort by **Popular**, **Trending**, **Newest**, **Top rated**. |
| **Quiz page** | Title, cover, creator, category, language, number of questions, times played, likes. Buttons: **Host this quiz**, **Copy and edit**. Answers are never shown on the public page. |
| **Likes and reports** | Signed-in users like quizzes; anyone can report one (reason + note). |
| **Creator profile** (opt-in) | Public page with that person's public quizzes. |
| **Game history** | Past games per quiz with results (the CSV export, saved). |
| **Account controls (GDPR)** | Download my data, delete my account and all quizzes. |

### 2.2 How popularity works

- A **play** is counted when a game with at least 3 players finishes. One count per game; replays by the same host within an hour don't count twice.
- **Popular:** plays in the last 30 days. **Trending:** plays in the last 7 days, weighted towards recent days. **Top rated:** likes ÷ plays with a minimum number of plays.
- Counts are stored per quiz per day, so lists are fast and cheap to compute.
- Category pages show the most popular quizzes per category; the home page gets a "Popular this week" row.

### 2.3 Data model (Cloudflare D1)

| Table | Main fields |
|---|---|
| `users` | id, google_id, display name, avatar look, created, role (user / admin), status |
| `quizzes` | id, owner, title, description, category, language, age group, visibility, status (draft / published / hidden), slides (JSON), cover, plays, likes, created, updated, copied_from |
| `quiz_plays_daily` | quiz, day, plays |
| `likes` | user, quiz |
| `reports` | id, quiz, reporter, reason, note, status, handled_by |
| `sessions` | id (random), user, expires: kept in an HttpOnly, Secure, SameSite cookie |

Pictures in R2 at `quizzes/<quiz-id>/<file>`. They're served through the Worker, which checks that the quiz is public or that the visitor is allowed to see it.

### 2.4 Starting categories (proposal)

1. General knowledge
2. Tamil culture & language
3. Sweden & Swedish (incl. SFI)
4. Festivals & celebrations
5. Movies, music & TV
6. Sports & cricket
7. Science & nature
8. History & geography
9. Kids & school
10. Language learning
11. Work & icebreakers
12. Fun & party

Plus **language** (English, Tamil, Swedish, …) and **age group** (kids, teens, adults, everyone) as filters, and free tags.

### 2.5 Keeping the library safe

| Layer | How |
|---|---|
| Automatic text check | The existing blocked-words filter, plus an AI safety check on title and questions before a quiz goes public (Workers AI has the Llama Guard safety model). |
| New accounts | First public quiz of a new account held for review (optional: your decision). |
| Reports | "Report" on every quiz page; 3 reports from different people hide a quiz automatically until reviewed. |
| Admin page | `/admin`, for admins only: report queue, hide/restore quiz, suspend account, site stats. |
| Pictures | Only on quizzes from signed-in accounts; size limits; reported pictures hidden with the quiz. |
| Answers | Public pages never show the answers. People who copy a quiz do see the answers, which is normal (same as other quiz apps). |

### 2.6 Rollout

| Step | Contents | Size |
|---|---|---|
| **3a** | Google sign-in, sessions, My quizzes, import drafts, R2 pictures on phones, account delete/export | 1–2 sessions |
| **3b** | Visibility, public library, quiz pages, categories, search, likes, popularity counts, Copy and edit | 1–2 sessions |
| **3c** | Reports, safety check, admin page, creator profiles, game history | 1 session |

---

## 3. Budget options: Cloudflare and GitHub

### 3.1 Cloudflare: Free vs Workers Paid

| | Workers Free (today) | Workers Paid (USD 5/month minimum) |
|---|---|---|
| Requests | 100,000 a day | 10 million a month included, then USD 0.30 per million |
| CPU time | 10 ms per request | 30 million CPU-ms a month included, longer per request |
| D1 database | 5 million rows read / 100,000 written per day, 5 GB | 25 billion rows read / 50 million written per month, 5 GB included |
| Durable Objects (game rooms) | Free allowance; above it, requests fail with an error | Included allowance, then pay per use (no hard stop) |
| Workers AI | 10,000 Neurons a day, then requests fail | Same 10,000 a day, then USD 0.011 per 1,000 Neurons |
| Logs | 200,000 events a day, 3-day retention | 20 million a month, 7-day retention |
| R2 pictures | 10 GB, free downloads | Same, then about USD 0.015 per GB-month |
| Turnstile (bot check) | Free | Free |
| Static files (the website) | Free and unlimited | Free and unlimited |

**What the upgrade really buys for Kalakal:** no hard stops. On Free, a busy day (a viral quiz, a big school event) hits a daily limit and parts of the app stop until midnight UTC. On Paid, it keeps running and costs a few cents more. It also lets us raise the AI allowance: one AI quiz is about 90 Neurons, which works out at roughly USD 0.001 per quiz.

### 3.2 GitHub

| | Free (today) | Team (USD 4 per user/month) | Add-ons |
|---|---|---|---|
| Private repos | Unlimited | Unlimited | |
| Automation (Actions) | 2,000 minutes a month | More minutes | |
| Dependabot (dependency alerts) | Yes | Yes | |
| Branch protection / required reviews on private repos | Limited | Yes | |
| Secret scanning with push protection, code scanning on private repos | No | No | GitHub Secret Protection: USD 19 per active committer/month; Code Security priced separately |

**Recommendation:** GitHub Free is enough. With one developer, Team adds little. The useful extras (dependency alerts, automatic tests on every push with Actions) are free. Advanced Security is enterprise-priced and not worth it at this stage. We can do the same checks with free tools inside GitHub Actions.

### 3.3 Four budget levels for Kalakal

| Level | Monthly cost | What you get | When |
|---|---|---|---|
| **0 · Free** | SEK 0 (+ the yearly kalakal.se renewal) | Everything built so far; daily limits; ~90 AI quizzes a day site-wide | Now, during build and testing |
| **1 · Launch** | ~USD 5–10 (≈ SEK 55–110) | Workers Paid: no hard stops, room for thousands of games; AI raised to e.g. 1,000 quizzes a day (≈ USD 1/day at full use, capped by our limits) | From the day of public promotion |
| **2 · Professional** | ~USD 15–40 (≈ SEK 165–440) | Level 1 + transactional email (sign-in links, notifications) + error monitoring + uptime checks + a bigger AI budget | When accounts are live and you have regular users |
| **3 · Growth** | Usage-based, ~USD 50–200 | Thousands of daily games, AI for paying users, support tools. Should be covered by the paid plan's revenue | After the paid tier launches |

**Cost guard rails (all levels):** a Cloudflare billing alert at USD 10 and 25; the site-wide AI budget in `src/ai.js` (`LIMITS.siteUnits`); per-person limits; a monthly cost review.

### 3.4 Paying for it: the Kalakal paid tier (outline)

- **Free forever:** hosting games, up to ~50 players, saved quizzes, public library, 5 AI quizzes a day.
- **Kalakal Plus (individual, e.g. SEK 49/month):** unlimited AI, up to 200 players, video uploads, branding, reports.
- **Kalakal for teams/schools (per seat):** shared libraries, team folders, admin, invoices.
- Payments with Stripe (no monthly fee, per-transaction pricing). Sold through Nexvik Consulting as the legal seller until there's a company.

---

## 4. Security and professionalism checklist

Priority: **P0** before public promotion · **P1** within the first month · **P2** later.

### 4.1 Security

| # | Item | Priority | Status |
|---|---|---|---|
| S1 | **2-factor sign-in** on GitHub, Cloudflare, Google and the domain registrar | P0 | You |
| S2 | **Security headers** on every page: Content-Security-Policy, HSTS, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy | P0 | To build |
| S3 | **Rate limits** on game creation, joining, answers, AI and sign-in (per IP and per account), and per WebSocket message rate | P0 | Partly done (AI) |
| S4 | **Turnstile** invisible bot check on sign-up, AI generation and publishing | P0 | To build |
| S5 | **Secrets** (Google sign-in keys, session key) only as Cloudflare secrets, never in code; rotation note in the handbook | P0 | With 3a |
| S6 | **Sessions:** random IDs, HttpOnly, Secure, SameSite=Lax cookies, 30-day expiry, sign-out everywhere | P0 | With 3a |
| S7 | **Authorisation checks** on every quiz/API call (owner, visibility, admin), with tests for "user A can't edit user B's quiz" | P0 | With 3a/3b |
| S8 | **Moderation** for public content (section 2.5) | P0 | With 3c |
| S9 | **Backups:** D1 point-in-time restore + weekly export to R2; restore tested once | P0 | With 3a |
| S10 | **GitHub:** protect `main` (no force-push), Dependabot alerts on, tests run automatically on every push (Actions) | P0 | To set up |
| S11 | **AI safety:** user text is always treated as data in prompts; output checked and filtered (done); length caps (done) | P1 | Mostly done |
| S12 | Error monitoring and an uptime check (free tiers) with email alerts | P1 | To set up |
| S13 | `security.txt` and a security contact address | P1 | To build |
| S14 | OWASP Top 10 review (part of the Fable audit) | P1 | Section 5 |
| S15 | Dependency and licence review (pdf.js, qrcode, fonts: all permissive) | P2 | Done once |

### 4.2 Privacy and legal (Sweden / EU, GDPR)

| # | Item | Priority |
|---|---|---|
| L1 | **Privacy policy** (what is stored, why, how long, where, who processes it: Cloudflare, Google sign-in, Workers AI) | P0 |
| L2 | **Terms of use** (acceptable use, user content licence for public quizzes, takedown, no warranty) | P0 |
| L3 | **No tracking cookies:** only the sign-in cookie, which is strictly necessary, so no cookie banner is needed. Cookie-free analytics (Cloudflare Web Analytics) | P0 |
| L4 | **Children:** accounts 13+ (Swedish age for digital consent); players need no account; no personal data from players beyond a nickname | P0 |
| L5 | **Data rights:** download my data, delete my account (built in 3a) | P0 |
| L6 | Records of processing and data-processing terms with Cloudflare and Google (accept their standard terms; keep copies) | P1 |
| L7 | Copyright notice for uploads + takedown contact | P1 |

### 4.3 Professional look and feel

| # | Item | Priority |
|---|---|---|
| P1 | kalakal.se as the only address (redirect workers.dev and www) | P0 |
| P2 | **Link previews:** title, description and a branded image when kalakal.se or an invite is shared on WhatsApp, LinkedIn or Facebook | P0 |
| P3 | Footer on every page: About, Help/FAQ, Privacy, Terms, Contact | P0 |
| P4 | Branded 404 and error pages; "game not found" and "connection lost" states reviewed | P0 |
| P5 | Contact email `hello@kalakal.se` (free email forwarding through Cloudflare) | P0 |
| P6 | Accessibility check (WCAG 2.2 AA): contrast, keyboard, screen-reader labels, reduced motion | P1 |
| P7 | Performance: Lighthouse 90+ on home, create, play; picture sizes; font loading | P1 |
| P8 | Swedish and Tamil interface languages (English first) | P2 |
| P9 | Status page and a public changelog | P2 |
| P10 | Brand assets kit (logo pack, mascots, colours) for press and partners | P2 |

---

## 5. End-of-week full review with Fable 5.2

### 5.1 Goal

An independent, fresh-eyes audit of the whole app by Claude Fable 5.2, the strongest model available to you. The output is a **findings register** you can act on, not general advice.

### 5.2 When and how

| Step | When | What |
|---|---|---|
| 1. Freeze | Thu 19 Nov evening | Merge everything, tag `v0.7-rc`, update the handbook and changelog. |
| 2. Set up the session | Fri 20 Nov | New Claude conversation, select **Fable 5.2** in the model picker, attach the GitHub repo **VaahnKat/kalakal**, share the live URL and the handbook. |
| 3. Run the audit | Fri 20 Nov | Paste the master prompt (5.4), then one area prompt at a time (5.5). Ask for findings in the register format (5.6). |
| 4. Triage together | Sat 21 Nov | Sort by severity × effort; agree what gets fixed now vs later. |
| 5. Fix sprint | Sat–Sun 21–22 Nov | Fix Critical and High findings; re-run the tests; deploy. |
| 6. Re-check | Sun 22 Nov | Ask Fable to verify each fixed finding; tag `v0.7`. |

Tip: keep the audit in **one** conversation, so Fable sees the whole picture. Start a fresh conversation for the fix sprint, with the findings register attached.

### 5.3 Audit areas

| # | Area | What gets checked |
|---|---|---|
| A1 | Architecture & code quality | Structure, duplication, error handling, naming, comments, dead code, maintainability |
| A2 | Security | OWASP Top 10, WebSocket abuse, host-key handling, authorisation, rate limits, CSP, prompt injection, secrets |
| A3 | Privacy & legal | GDPR data flows, retention, children, privacy policy accuracy |
| A4 | Reliability & scale | Reconnects, Durable Object limits, 200-player games, AI failures, quota edge cases |
| A5 | Performance | Load time, picture sizes, fonts, JS size, Lighthouse on 3 key pages |
| A6 | Accessibility | WCAG 2.2 AA on host, phone and create screens |
| A7 | UX & visual design | Every screen against the brand: hierarchy, consistency, empty/error states, mobile layout, copy |
| A8 | Gamification & engagement | Scoring fairness, milestones, pacing, what would make people come back |
| A9 | AI quality | Sample quizzes in English, Tamil and Swedish: accuracy, difficulty, distractors, safety |
| A10 | Tests & docs | Coverage gaps, missing tests, handbook accuracy |
| A11 | Cost & limits | Free-tier headroom, cost per 1,000 games, alerts |
| A12 | Product & market | Gaps vs Kahoot/Mentimeter, differentiators, paid-tier readiness |

### 5.4 Master prompt (paste first)

> You are auditing Kalakal, a live quiz and audience-engagement web app (Kahoot + Mentimeter style) built on Cloudflare Workers, Durable Objects, D1, R2 and Workers AI, with a vanilla HTML/CSS/JS front end. The repository VaahnKat/kalakal is attached; the live site is https://kalakal.se; docs/HANDBOOK.md explains the architecture.
>
> Act as a senior staff engineer, security reviewer, UX lead and product manager. Review the whole app area by area when I ask. For every problem, give a finding in this exact format: ID, Area, Severity (Critical / High / Medium / Low), Title, Where (file and line, or screen), What's wrong, Why it matters, Fix (concrete code or design change), Effort (S / M / L). Don't list strengths unless I ask. Be specific and verify claims against the code. When unsure, say so and say how to check. Start by reading the handbook and the file tree, then confirm you understand the architecture in 10 lines before the first area.

### 5.5 Area prompts (one at a time)

- **A2 Security:** "Review security: OWASP Top 10, WebSocket messages (can a player act as host, flood messages, crash a room?), host key, sessions and authorisation, rate limits, input validation, CSP and headers, AI prompt injection through notes or PDFs, secrets. Try to break it on paper: list concrete attack steps and the fix for each."
- **A7 UX & design:** "Walk through every screen as a first-time host on a laptop and a first-time player on a phone. For each screen, list problems with hierarchy, clarity, consistency with the Kalakal brand (colours, Unbounded/Catamaran type, mascots), empty, error and loading states, and mobile layout. Suggest the exact change."
- **A9 AI quality:** "Generate (or ask me to generate) 3 quizzes each in English, Tamil and Swedish through Create with AI. Judge factual accuracy, language quality, difficulty fit and the quality of wrong answers. Propose prompt changes in src/ai.js with before/after."
- *(Similar one-line prompts for A1, A3–A6, A8, A10–A12: "Review <area>: <what gets checked, from table 5.3>. Findings in the register format.")*

### 5.6 Deliverables

1. **Findings register** (spreadsheet): ID, area, severity, title, where, fix, effort, owner, status.
2. **Audit summary** (one page): top 10 risks, overall scores per area (1–5), what to do this week vs later.
3. **Fix plan:** Critical/High fixed in the sprint, the rest scheduled into Phases 3c–4.
4. **Updated handbook and changelog** after the fixes, and a tagged `v0.7` release.

**Done means:** no open Critical or High findings, all tests green, Lighthouse 90+ on the key pages, and the privacy policy matching what the code actually does.

---

## 6. Timeline (proposal)

| Day | Work |
|---|---|
| Fri 13 Nov | This plan · you: 2-factor on all accounts (S1), finish the kalakal.se DNS |
| Sat 14 – Sun 15 | Phase 3a: Google sign-in, My quizzes, pictures on phones, account delete/export, backups |
| Mon 16 – Tue 17 | Phase 3b: public library, categories, popularity, likes, Copy and edit |
| Wed 18 | Phase 3c: reports, safety check, admin page · P0 security items (headers, rate limits, Turnstile) |
| Thu 19 | Privacy policy, terms, footer, link previews, kalakal.se switch-over · freeze and tag `v0.7-rc` |
| Fri 20 – Sun 22 | Fable 5.2 audit → triage → fix sprint → re-check → `v0.7` |
| Mon 23+ | Upgrade to Workers Paid, soft launch (STK IF and community groups), marketing plan |

---

## 7. Open questions for you

| # | Question | Recommendation |
|---|---|---|
| Q1 | Sign-in method? | Google only first; add email links in Phase 2 of accounts |
| Q2 | Publish to the library instantly or after your approval? | Instantly after automatic checks; hold only a new account's first quiz |
| Q3 | Categories OK? | List in 2.4 |
| Q4 | Account minimum age? | 13+ |
| Q5 | Show creator names on public quizzes? | Yes, with opt-out (display name only) |
| Q6 | When to switch to Workers Paid? | The day public promotion starts |
| Q7 | Who else will work on the code? | If someone joins, revisit GitHub Team |

---

## Sources

- Cloudflare Workers, D1 and Durable Objects pricing: developers.cloudflare.com/workers/platform/pricing, developers.cloudflare.com/d1/platform/pricing, developers.cloudflare.com/durable-objects/platform/pricing
- Workers AI pricing: developers.cloudflare.com/workers-ai/platform/pricing
- R2 pricing: developers.cloudflare.com/r2/pricing
- Turnstile plans: developers.cloudflare.com/turnstile/plans
- GitHub plans: github.com/pricing; docs.github.com "About GitHub's plans"
