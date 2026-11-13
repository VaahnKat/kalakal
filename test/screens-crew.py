import asyncio
from playwright.async_api import async_playwright
B = "http://127.0.0.1:8787"; OUT = "/home/claude/kalakal-repo/test/shots/c-"
CORRECT = [0, 1, 2, 1, 2, 0, 1, 2, 0, 0]
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        host = await br.new_page(viewport={"width": 1440, "height": 900})
        host.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await host.goto(B + "/host.html"); await host.wait_for_timeout(500)
        await host.screenshot(path=OUT+"01-setup.png")
        await host.click("#buildKural"); await host.wait_for_timeout(400); await host.screenshot(path=OUT+"02-builder-kural.png")
        await host.click("#backToSetup"); await host.click("#playDemo"); await host.wait_for_timeout(800)
        pin = host.url.split("pin=")[1]
        ph = []
        for i in range(5):
            pg = await br.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            await pg.goto(f"{B}/play.html?pin={pin}"); await pg.wait_for_timeout(300)
            if i == 0: await pg.screenshot(path=OUT+"03-phone-join.png")
            await pg.click("#surprise"); await pg.click("#joinBtn"); ph.append(pg)
        await ph[0].wait_for_timeout(900)
        await ph[0].screenshot(path=OUT+"04-phone-wait.png"); await host.screenshot(path=OUT+"05-host-lobby.png")
        await host.click("#startBtn")
        for q in range(4):
            await host.wait_for_selector('[data-screen="question"]:not([hidden])', timeout=10000); await host.wait_for_timeout(500)
            for i, pg in enumerate(ph):
                choice = CORRECT[q] if (i == 0 or (i + q) % 2 == 0) else (CORRECT[q] + 1) % 4
                await pg.click(f'#pAnswers button[data-i="{choice}"]')
            await host.wait_for_selector('[data-screen="reveal"]:not([hidden])', timeout=12000); await host.wait_for_timeout(700)
            if q == 2: await ph[0].wait_for_timeout(600); await ph[0].screenshot(path=OUT+"06-phone-streak.png")
            await host.click("#toBoard"); await host.wait_for_timeout(1600)
            if q == 2: await host.screenshot(path=OUT+"07-host-board.png")
            await host.click("#nextBtn")
        await host.wait_for_selector('[data-screen="question"]:not([hidden])', timeout=10000)
        await host.click("#skipBtn"); await host.wait_for_selector('[data-screen="reveal"]:not([hidden])'); await host.click("#toBoard"); await host.wait_for_timeout(400)
        await host.click("#endBtn"); await host.wait_for_timeout(2600)
        await host.screenshot(path=OUT+"08-host-podium.png"); await ph[0].screenshot(path=OUT+"09-phone-final.png")
        await br.close()
asyncio.run(main())
