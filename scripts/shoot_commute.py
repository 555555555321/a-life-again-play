#!/usr/bin/env python3
"""Shoot Phone B commute variants (local server) and a half-speed gif."""
import asyncio, json, shutil
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

PORT = 8778
BASE = f'http://127.0.0.1:{PORT}'
REPO = Path('/workspace/a-life-again-play')
OUT = REPO / 'shots'
OUT.mkdir(exist_ok=True)
COPY = Path('/workspace/phone_b_20261109/shots')
COPY.mkdir(exist_ok=True)

# Mid-road (~1.2s) shows wheels / scroll; also grab arrival.
VARIANTS = [
    ('commute_day_car_p2', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&passengers=2&force=1', 1400),
    ('commute_evening_car_p2', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&passengers=2&lit=evening&force=1', 1400),
    ('commute_bike', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=bike&force=1', 1400),
    ('commute_none_bike', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=none&seed=shot:1&force=1', 1400),
    ('commute_day_car_p2_arrive', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&passengers=2&force=1&cut=1', 600),
    ('commute_evening_car_p2_arrive', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&passengers=2&lit=evening&force=1&cut=1', 600),
    ('commute_weekend_beach', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&trip=weekend&dest=beach&riders=partner&force=1&cut=1', 600),
    ('commute_wear_old', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&wear=old&event=breakdown&force=1', 2000),
    ('commute_scooter_rain', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=scooter&rain=1&force=1', 1400),
    ('commute_bus', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=bus&force=1', 1400),
    ('commute_going_out', 'dev=1&shot&orient=landscape&screen=going_out&drawer=820', 500),
    ('commute_kid_seat', 'dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&riders=kid_seat&force=1&cut=1', 600),
]

async def main():
    errs = []
    overlaps = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 2340, 'height': 1080})
        page.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))

        async def shot(name, query, wait_ms):
            url = f'{BASE}/?{query}'
            await page.goto(url, wait_until='domcontentloaded')
            try:
                await page.wait_for_function('() => window.COMMUTE && window.COMMUTE.imgs', timeout=8000)
            except Exception as e:
                errs.append(f'timeout {name}: {e}')
            await page.wait_for_timeout(wait_ms)
            info = await page.evaluate('''() => ({
              ready: document.body.dataset.ready,
              mode: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.mode,
              play: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.play,
              headlights: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.headlights,
              missing: window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.imgs.missing,
              overlaps: (typeof commuteOverlapReport === 'function') ? commuteOverlapReport() : [],
              boxes: window.COMMUTE && window.COMMUTE.boxes,
            })''')
            dest = OUT / f'{name}.png'
            await page.screenshot(path=str(dest))
            shutil.copy2(dest, COPY / dest.name)
            overlaps[name] = info
            print('shot', name, 'ready=', info.get('ready'), 'mode=', info.get('mode'), 'overlaps=', info.get('overlaps'), 'missing=', info.get('missing'))
            return info

        for name, q, w in VARIANTS:
            await shot(name, q, w)

        # half-speed gif of day car with 2 passengers: capture ~8 fps for 3s, write at 4 fps
        url = f'{BASE}/?dev=1&shot&orient=landscape&screen=commute&drawer=820&vehicle=car&passengers=2&force=1'
        await page.goto(url, wait_until='domcontentloaded')
        await page.wait_for_function('() => window.COMMUTE && window.COMMUTE.imgs', timeout=8000)
        await page.evaluate('window.COMMUTE.t0 = performance.now()')
        frames = []
        gif_dir = OUT / 'commute_gif_frames'
        if gif_dir.exists():
            shutil.rmtree(gif_dir)
        gif_dir.mkdir()
        for i in range(24):  # 3s at 8 fps
            await page.evaluate(f'window.COMMUTE.t0 = performance.now() - {i * 125}')
            await page.wait_for_timeout(40)
            fp = gif_dir / f'f{i:02d}.png'
            await page.screenshot(path=str(fp))
            frames.append(Image.open(fp).convert('RGB'))
        gif_path = OUT / 'commute_day_car_p2_0.5x.gif'
        # half speed: 125ms source frame shown for 250ms
        frames[0].save(gif_path, save_all=True, append_images=frames[1:], duration=250, loop=0, optimize=False)
        shutil.copy2(gif_path, COPY / gif_path.name)
        print('gif', gif_path, 'frames', len(frames))

        await browser.close()

    report = {'overlaps': {k: v.get('overlaps') for k, v in overlaps.items()},
              'modes': {k: v.get('mode') for k, v in overlaps.items()},
              'missing': {k: v.get('missing') for k, v in overlaps.items()},
              'errors': errs}
    (OUT / 'commute_shot_report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    shutil.copy2(OUT / 'commute_shot_report.json', COPY / 'commute_shot_report.json')
    print('errors', len(errs))
    for e in errs[:30]:
        print(' ', e)

if __name__ == '__main__':
    asyncio.run(main())
