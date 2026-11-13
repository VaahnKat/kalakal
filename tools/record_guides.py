#!/usr/bin/env python3
"""Record the step-by-step GIFs shown on /create.html.

    npm run dev                      # in one terminal
    python3 tools/record_guides.py   # in another (needs: pip install playwright pillow; Chrome)

Writes public/img/guide/<name>.gif plus a still <name>.webp (first useful frame) for
people who prefer reduced motion. Re-run after changing the editor so the guides stay true.
"""
import asyncio, io, os, sys
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "img" / "guide"
BASE = os.environ.get("KALAKAL_URL", "http://127.0.0.1:8787")
CHROME = os.environ.get("CHROME", "/usr/bin/google-chrome")
VIEW = {"width": 1120, "height": 700}
GIF_WIDTH = 840
PICTURE = ROOT / "design" / "mascots" / "source" / "champion.png"

OVERLAY = """
(() => {
  if (document.getElementById('kk-cur')) return;
  const st = document.createElement('style');
  st.textContent = `
    #kk-cur { position: fixed; z-index: 99999; left: 0; top: 0; width: 30px; height: 30px; pointer-events: none;
      transition: transform .32s cubic-bezier(.3,.7,.2,1); }
    #kk-cur svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
    #kk-ring { position: fixed; z-index: 99998; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      border: 4px solid #FFB627; pointer-events: none; opacity: 0; }
    #kk-ring.on { animation: kkring .45s ease-out; }
    @keyframes kkring { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(1.4); } }
    #kk-cap { position: fixed; z-index: 99997; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: 92%;
      background: #FFB627; color: #160B2A; font: 800 22px Catamaran, system-ui, sans-serif; padding: 10px 22px;
      border-radius: 99px; box-shadow: 0 8px 30px rgba(0,0,0,.45); white-space: nowrap; }
    #kk-cap:empty { display: none; }`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'kk-cur';
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.3 3.9 7.2-2.8 1.5-3.9-7.2L4 19z" fill="#FFF8EC" stroke="#160B2A" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  c.style.transform = 'translate(560px, 380px)';
  const r = document.createElement('div'); r.id = 'kk-ring';
  const cap = document.createElement('div'); cap.id = 'kk-cap';
  document.body.append(c, r, cap);
})();
"""


class Rec:
    def __init__(self, page):
        self.page, self.frames = page, []

    async def ready(self):
        await self.page.evaluate(OVERLAY)
        # An open <dialog> sits in the browser's top layer: move the overlay inside it so it stays visible
        await self.page.evaluate("""() => { const host = document.querySelector('dialog[open]') || document.body;
            for (const id of ['kk-cur', 'kk-ring', 'kk-cap', 'kk-ai']) { const el = document.getElementById(id); if (el && el.parentNode !== host) host.appendChild(el); } }""")
        await self.page.evaluate("""() => { const h = document.getElementById('joinHost'); if (h) h.textContent = 'kalakal.prabhuwinz17.workers.dev';
            const e = document.getElementById('eJoin'); if (e) e.textContent = e.textContent.replace(/Join at \\S+/, 'Join at kalakal.prabhuwinz17.workers.dev'); }""")

    async def shot(self, ms=120):
        png = await self.page.screenshot(type="png")
        self.frames.append((Image.open(io.BytesIO(png)).convert("RGB"), ms))

    async def hold(self, ms):
        await self.shot(ms)

    async def caption(self, text, ms=900):
        await self.ready()
        await self.page.evaluate("t => document.getElementById('kk-cap').textContent = t", text)
        await self.shot(ms)

    async def move(self, selector):
        await self.ready()
        el = self.page.locator(selector).first
        await el.scroll_into_view_if_needed()
        box = await el.bounding_box()
        x, y = box["x"] + min(box["width"] * 0.5, 120), box["y"] + box["height"] * 0.55
        await self.page.evaluate("([x, y]) => document.getElementById('kk-cur').style.transform = `translate(${x}px, ${y}px)`", [x, y])
        for _ in range(3):
            await self.page.wait_for_timeout(110)
            await self.shot(90)
        return x, y

    async def click(self, selector, after=500):
        x, y = await self.move(selector)
        await self.page.evaluate("""([x, y]) => { const r = document.getElementById('kk-ring');
            r.style.left = x + 'px'; r.style.top = y + 'px'; r.classList.remove('on'); void r.offsetWidth; r.classList.add('on'); }""", [x, y])
        await self.shot(90)
        await self.page.locator(selector).first.click()
        await self.page.wait_for_timeout(after)
        await self.shot(500)

    async def type(self, selector, text, chunk=5, enter=False):
        await self.move(selector)
        el = self.page.locator(selector).first
        await el.click()
        for i in range(0, len(text), chunk):
            await el.press_sequentially(text[i:i + chunk])
            await self.shot(110 if "\n" not in text[i:i + chunk] else 160)
        if enter:
            await el.press("Enter")
            await self.shot(200)

    def save(self, name, poster_index=None):
        OUT.mkdir(parents=True, exist_ok=True)
        h = round(VIEW["height"] * GIF_WIDTH / VIEW["width"])
        imgs = [f.resize((GIF_WIDTH, h), Image.LANCZOS) for f, _ in self.frames]
        durs = [d for _, d in self.frames]
        # Merge identical consecutive frames to keep the file small
        merged, mdurs = [], []
        for im, d in zip(imgs, durs):
            if merged and im.tobytes() == merged[-1].tobytes():
                mdurs[-1] += d
            else:
                merged.append(im); mdurs.append(d)
        # One shared palette from a sample of frames keeps colours stable
        sample = Image.new("RGB", (GIF_WIDTH, h * 4))
        for i, idx in enumerate([0, len(merged) // 3, 2 * len(merged) // 3, len(merged) - 1]):
            sample.paste(merged[idx], (0, h * i))
        pal = sample.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
        frames = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in merged]
        mdurs[-1] = max(mdurs[-1], 2200)   # pause on the result before looping
        path = OUT / f"{name}.gif"
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=mdurs, loop=0, optimize=True, disposal=1)
        still = merged[poster_index if poster_index is not None else len(merged) - 1]
        still.save(OUT / f"{name}.webp", "WEBP", quality=85)
        print(f"  {path.relative_to(ROOT)}  {len(frames)} frames  {path.stat().st_size // 1024} KB")


async def builder(ctx):
    page = await ctx.new_page()
    await page.goto(BASE + "/host.html")
    await page.evaluate("localStorage.clear()")
    await page.goto(BASE + "/host.html?build=play")
    await page.wait_for_timeout(400)
    return page


PASTE_TEXT = """What is the capital of Sweden?
* Stockholm
- Gothenburg
- Malmö

Which festival marks the Tamil harvest?
* Pongal
- Holi
- Midsummer
points: double

The Thirukkural has 1330 couplets.
* True
- False"""


async def rec_paste(ctx):
    page = await builder(ctx); r = Rec(page)
    await r.ready(); await page.fill("#quizTitle", "Friday fun quiz")
    await r.caption("1 · Press “Paste or type questions”", 1100)
    await r.click("#openPaste", 700)
    await r.caption("2 · Type or paste. * marks the right answer", 900)
    await r.type("#pasteText", PASTE_TEXT, chunk=9)
    await r.caption("3 · Check the preview, then Add to quiz", 1200)
    await r.click("#pasteAdd", 600)
    await page.evaluate("window.scrollTo(0, 260)")
    await r.caption("Done: 3 questions ready to edit or play", 2600)
    r.save("paste", poster_index=None)


async def rec_editor(ctx):
    page = await builder(ctx); r = Rec(page)
    await r.ready(); await page.evaluate("window.scrollTo(0, 240)")
    await r.caption("1 · Type the question, press Enter", 1000)
    await r.type('[data-q="0"] [data-f="text"]', "Which festival is in January?", chunk=6, enter=True)
    await r.caption("2 · Type the answers, Enter after each", 900)
    for i, a in enumerate(["Diwali", "Pongal", "Onam", "Holi"]):
        await r.type(f'[data-q="0"] [data-f="ans"][data-a="{i}"]', a, chunk=4)
    await r.caption("3 · Tap Right on the correct answer", 1000)
    await r.click('[data-q="0"] [data-f="mark"][data-a="1"]', 400)
    await r.click('[data-q="0"] [data-f="mark"][data-a="0"]', 600)
    await r.caption("4 · Pick time and points (Double for a bonus round)", 1100)
    await r.move('[data-q="0"] [data-f="points"]')
    await page.select_option('[data-q="0"] [data-f="points"]', "2"); await r.shot(700)
    await r.caption("5 · Create game: your PIN appears on the big screen", 1100)
    await r.click("#playCustom", 1400)
    await r.caption("", 2400)
    r.save("editor")


SHEET_ROWS = [
    ["Type", "Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Correct", "Time"],
    ["Quiz", "Capital of Norway?", "Oslo", "Bergen", "Tromsø", "", "1", "20"],
    ["Quiz", "Largest planet?", "Mars", "Jupiter", "Venus", "Earth", "2", "20"],
    ["True or false", "Pongal is in January.", "True", "False", "", "", "1", "15"],
    ["Poll", "Best snack?", "Samosa", "Kanelbulle", "Pizza", "", "", ""],
]


async def rec_sheet(ctx):
    sheet = await ctx.new_page(); await sheet.set_viewport_size(VIEW)
    rows = "".join("<tr><th>%d</th>%s</tr>" % (i + 1, "".join(f"<td>{c}</td>" for c in r)) for i, r in enumerate(SHEET_ROWS))
    await sheet.set_content(f"""<html><head><style>
      body {{ margin: 0; background: #f4f5f7; font: 15px Arial, sans-serif; color: #222; }}
      .bar {{ height: 52px; background: #fff; border-bottom: 1px solid #ddd; display: flex; align-items: center; padding: 0 18px; font-weight: 700; gap: 10px; }}
      .bar span {{ background: #e8f0fe; border-radius: 6px; padding: 4px 10px; font-weight: 400; }}
      table {{ border-collapse: collapse; margin: 18px; background: #fff; }}
      th {{ background: #eef0f3; color: #666; font-weight: 400; width: 34px; }}
      td, th {{ border: 1px solid #d6d9de; padding: 9px 12px; white-space: nowrap; }}
      tr:first-child td {{ font-weight: 700; background: #fafafa; }}
      table.sel td {{ background: #d7e6ff !important; outline: 0; }}
    </style></head><body><div class="bar">kalakal-quiz-template.csv <span>any spreadsheet app</span></div><table id="t">{rows}</table></body></html>""")
    r = Rec(sheet); await r.ready()
    await r.caption("1 · Fill in the template (Excel, Google Sheets, Numbers…)", 1800)
    await r.move("#t tr:nth-child(1) td:nth-child(2)")
    await sheet.evaluate("document.getElementById('t').classList.add('sel')")
    await r.move("#t tr:nth-child(5) td:last-child")
    await r.caption("2 · Select the rows and copy (Ctrl/Cmd + C)", 1500)
    page = await builder(ctx); r.page = page; await r.ready()
    await r.caption("3 · In Kalakal, open Paste and paste the rows", 1000)
    await r.click("#openPaste", 600)
    await page.fill("#pasteText", "\n".join("\t".join(x) for x in SHEET_ROWS))
    await page.dispatch_event("#pasteText", "input"); await r.shot(1600)
    await r.caption("4 · Add to quiz. Or use “Import spreadsheet” for a CSV file", 1400)
    await r.click("#pasteAdd", 700)
    await page.evaluate("window.scrollTo(0, 240)"); await r.caption("Done: 4 slides from your sheet", 2400)
    r.save("spreadsheet")


AI_REPLY = """Which planet is closest to the Sun?
* Mercury
- Venus
- Mars
- Earth

How many legs does a spider have?
- Six
* Eight
- Ten

Which gas do plants take in?
* Carbon dioxide
- Oxygen
- Helium"""


async def rec_ai(ctx):
    page = await builder(ctx); r = Rec(page); await r.ready()
    await page.fill("#quizTitle", "Science for kids")
    await r.click("#openPaste", 600)
    await r.caption("1 · Press “Copy AI prompt”", 1000)
    await r.click("#copyPrompt", 900)
    # A neutral stand-in for any AI chat app
    await page.evaluate("""() => { const d = document.createElement('div'); d.id = 'kk-ai';
      d.style.cssText = 'position:fixed;inset:60px 140px 90px;z-index:9000;background:#fff;color:#222;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:26px;font:16px/1.45 system-ui,sans-serif;overflow:hidden';
      d.innerHTML = '<p style="font-weight:700;margin:0 0 14px">Your AI chat (ChatGPT, Claude, Gemini…)</p><div style="background:#eef0f4;border-radius:12px;padding:12px 14px;margin:0 0 14px 120px">Write 3 multiple-choice quiz questions about science for kids… (the copied prompt)</div><pre id="kk-ai-out" style="white-space:pre-wrap;font:15px/1.45 ui-monospace,monospace;margin:0"></pre>';
      (document.querySelector('dialog[open]') || document.body).appendChild(d); }""")
    await r.ready()
    await r.caption("2 · Paste it into your AI chat and get the questions", 900)
    for i in range(0, len(AI_REPLY), 24):
        await page.evaluate("t => document.getElementById('kk-ai-out').textContent = t", AI_REPLY[:i + 24]); await r.shot(110)
    await r.caption("3 · Copy the reply", 1200)
    await page.evaluate("document.getElementById('kk-ai').remove()")
    await r.caption("4 · Paste it back into Kalakal and check the facts", 900)
    await page.fill("#pasteText", AI_REPLY); await page.dispatch_event("#pasteText", "input"); await r.shot(1800)
    await r.click("#pasteAdd", 700)
    await page.evaluate("window.scrollTo(0, 240)"); await r.caption("Done: questions ready to edit", 2400)
    r.save("ai")


async def rec_media(ctx, browser):
    page = await builder(ctx); r = Rec(page); await r.ready()
    await page.fill("#quizTitle", "Guess the mascot")
    await page.fill('[data-q="0"] [data-f="text"]', "Who is this?")
    for i, a in enumerate(["Arcade Champion", "Quiz Host", "Explorer"]):
        await page.fill(f'[data-q="0"] [data-f="ans"][data-a="{i}"]', a)
    await page.evaluate("window.scrollTo(0, 240)")
    await r.caption("1 · Press Add picture, or drag one onto the question", 1100)
    await r.move('[data-q="0"] [data-f="upload"]')
    async with page.expect_file_chooser() as fc:
        await page.locator('[data-q="0"] [data-f="upload"]').click()
    await (await fc.value).set_files(str(PICTURE)); await page.wait_for_timeout(1200); await r.shot(1400)
    await r.caption("2 · Or paste a GIF or YouTube link, and set start and end", 1100)
    await r.click('[data-q="0"] [data-f="unmedia"]', 300)
    await r.type('[data-q="0"] [data-f="link"]', "https://youtu.be/dQw4w9WgXcQ?t=30", chunk=8)
    await page.locator('[data-q="0"] [data-f="link"]').press("Tab"); await page.wait_for_timeout(500); await r.shot(400)
    await r.type('[data-q="0"] [data-f="ytend"]', "0:45", chunk=4)
    await r.shot(900)
    # put the picture back for the big-screen shot
    await page.locator('[data-q="0"] [data-f="unmedia"]').click()
    async with page.expect_file_chooser() as fc:
        await page.locator('[data-q="0"] [data-f="upload"]').click()
    await (await fc.value).set_files(str(PICTURE)); await page.wait_for_timeout(1000)
    await r.caption("3 · It shows on the big screen during the question", 900)
    await page.click("#playCustom"); await page.wait_for_timeout(1200)
    pin = page.url.split("pin=")[1]
    phone = await browser.new_page(viewport={"width": 390, "height": 844})
    await phone.goto(f"{BASE}/play.html?pin={pin}"); await phone.fill("#nick", "Malli"); await phone.click("#joinBtn")
    await page.wait_for_timeout(900); await r.ready()
    await page.click("#startBtn"); await page.wait_for_timeout(4200); await r.ready()
    await page.evaluate("document.getElementById('kk-cap').textContent = 'Phones show the answer buttons'")
    await r.shot(2600)
    await phone.close()
    r.save("media")


async def main():
    only = set(sys.argv[1:])
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, args=["--no-proxy-server"])
        ctx = await browser.new_context(viewport=VIEW, device_scale_factor=1)
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=BASE)
        jobs = {"paste": rec_paste, "editor": rec_editor, "spreadsheet": rec_sheet, "ai": rec_ai}
        for name, fn in jobs.items():
            if not only or name in only:
                await fn(ctx)
        if not only or "media" in only:
            await rec_media(ctx, browser)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
