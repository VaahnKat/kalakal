import asyncio
from playwright.async_api import async_playwright
B = "http://127.0.0.1:8787"; OUT = "/home/claude/kalakal-app/test/shots/"
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        host = await br.new_page(viewport={"width": 1440, "height": 900})
        await host.goto(B + "/"); await host.wait_for_timeout(800); await host.screenshot(path=OUT+"01-home.png")
        await host.goto(B + "/host.html"); await host.wait_for_timeout(500); await host.screenshot(path=OUT+"02-host-setup.png")
        await host.click("#openEditor"); await host.wait_for_timeout(300); await host.screenshot(path=OUT+"03-builder.png")
        await host.click("#backToSetup"); await host.click("#playDemo"); await host.wait_for_timeout(1000)
        pin = host.url.split("pin=")[1]
        phones = []
        for name in ["Spark Queen", "Kutty Star", "QuizNinja", "Malli", "Rocket Raj"]:
            ph = await br.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            await ph.goto(f"{B}/play.html?pin={pin}"); await ph.fill("#nick", name); await ph.click("#joinBtn")
            phones.append(ph)
        await phones[0].wait_for_timeout(1000)
        await phones[0].screenshot(path=OUT+"04-phone-wait.png")
        await host.screenshot(path=OUT+"05-host-lobby.png")
        await host.click("#startBtn"); await host.wait_for_timeout(1200)
        await host.screenshot(path=OUT+"06-host-question.png"); await phones[0].screenshot(path=OUT+"07-phone-question.png")
        for i, ph in enumerate(phones): await ph.click(f'#pAnswers button[data-i="{0 if i < 3 else 2}"]')
        await phones[0].wait_for_timeout(300); 
        await host.wait_for_selector('[data-screen="reveal"]:not([hidden])', timeout=10000); await host.wait_for_timeout(1200)
        await host.screenshot(path=OUT+"08-host-reveal.png"); await phones[0].screenshot(path=OUT+"09-phone-correct.png"); await phones[4].screenshot(path=OUT+"10-phone-wrong.png")
        await host.click("#toBoard"); await host.wait_for_timeout(900); await host.screenshot(path=OUT+"11-host-board.png")
        host.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await host.click("#endBtn"); await host.wait_for_timeout(2600)
        await host.screenshot(path=OUT+"12-host-podium.png"); await phones[0].screenshot(path=OUT+"13-phone-final.png")
        await br.close()
asyncio.run(main())
