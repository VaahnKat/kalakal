import asyncio
from playwright.async_api import async_playwright
B = "http://127.0.0.1:8787"; OUT = "/home/claude/kalakal-repo/test/shots/k-"
WORDS = [["Busy","Fun"],["Busy","Calm"],["Hectic"],["Fun","Busy"],["Productive"],["Calm","Busy"]]
async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
        host = await br.new_page(viewport={"width": 1440, "height": 900})
        host.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await host.goto(B + "/host.html"); await host.wait_for_timeout(400)
        await host.screenshot(path=OUT+"01-setup.png")
        await host.click("#openEditor"); await host.click('[data-type="scale"]'); await host.wait_for_timeout(300)
        await host.screenshot(path=OUT+"02-builder.png", full_page=True)
        await host.click("#backToSetup"); await host.click("#playMeeting"); await host.wait_for_timeout(800)
        pin = host.url.split("pin=")[1]
        ph = []
        for i, n in enumerate(["Spark Queen","Kutty Star","QuizNinja","Malli","Rocket Raj","Nila"]):
            pg = await br.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            await pg.goto(f"{B}/play.html?pin={pin}"); await pg.fill("#nick", n); await pg.click("#joinBtn"); ph.append(pg)
        await ph[0].wait_for_timeout(800)
        await host.click("#startBtn"); await host.wait_for_timeout(700)
        # word cloud
        for i, pg in enumerate(ph):
            for w in WORDS[i]:
                await pg.fill("#eInput", w); await pg.click("#eSend"); await pg.wait_for_timeout(250)
        await host.wait_for_timeout(900)
        await host.screenshot(path=OUT+"03-host-wordcloud.png"); await ph[0].screenshot(path=OUT+"04-phone-wordcloud.png")
        # poll
        await host.click("#eNext"); await host.wait_for_timeout(600)
        for i, pg in enumerate(ph): await pg.click(f'#eBox [data-i="{[0,2,2,1,2,0][i]}"]')
        await host.wait_for_timeout(900)
        await host.screenshot(path=OUT+"05-host-poll.png"); await ph[1].screenshot(path=OUT+"06-phone-poll.png")
        # scale
        await host.click("#eNext"); await host.wait_for_timeout(600)
        for i, pg in enumerate(ph):
            for k, v in enumerate([[4,3,5],[5,2,4],[3,3,4],[4,2,5],[5,3,5],[4,4,4]][i]):
                await pg.click(f'#eBox [data-k="{k}"][data-v="{v}"]')
            await pg.click("#eRate")
        await host.wait_for_timeout(900)
        await host.screenshot(path=OUT+"07-host-scale.png"); await ph[0].screenshot(path=OUT+"08-phone-scale.png")
        # quiz
        await host.click("#eNext"); await host.wait_for_timeout(600)
        for pg in ph: await pg.click('#pAnswers button[data-i="0"]')
        await host.wait_for_selector('[data-screen="reveal"]:not([hidden])', timeout=10000); await host.wait_for_timeout(500)
        await host.click("#toBoard"); await host.wait_for_timeout(400); await host.click("#nextBtn"); await host.wait_for_timeout(600)
        # open
        ideas = ["Shorter stand-ups","Demo Fridays","More pair programming","Clearer sprint goals","Fika every Thursday","Rotate who runs retros"]
        for i, pg in enumerate(ph): await pg.fill("#eInput", ideas[i]); await pg.click("#eSend"); await pg.wait_for_timeout(150)
        await host.wait_for_timeout(900); await host.screenshot(path=OUT+"09-host-open.png")
        # qa
        await host.click("#eNext"); await host.wait_for_timeout(600)
        qs = ["When is the next release?","Can we get standing desks?","Who decides the roadmap?"]
        for i in range(3): await ph[i].fill("#eInput", qs[i]); await ph[i].click("#eSend"); await ph[i].wait_for_timeout(300)
        await ph[5].wait_for_timeout(600)
        for pg in ph[3:]: 
            btns = await pg.query_selector_all("#qaList [data-vote]")
            await btns[1].click(); await pg.wait_for_timeout(150)
        await ph[0].click("#qaList [data-vote]")
        await host.wait_for_timeout(900)
        await host.screenshot(path=OUT+"10-host-qa.png"); await ph[4].screenshot(path=OUT+"11-phone-qa.png")
        await br.close()
asyncio.run(main())
