#!/usr/bin/env python3
"""Screenshot Phone B corner labels on three calendar dates (dev=1)."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

PORT = 8780
BASE = f'http://127.0.0.1:{PORT}'
REPO = Path('/workspace/a-life-again-play-year')
OUT = REPO / 'shots'
OUT.mkdir(exist_ok=True)

# day 0 = 2000-05-01 birthday; day 244 = 2000-12-31; day 1825 = 2005-05-01 (age-5 birthday)
DATES = [
    ('corner_day0_2000-05-01', 0, '二〇〇〇年・春・你零歲'),
    ('corner_dec31_2000-12-31', 244, '二〇〇〇年・冬・你零歲'),
    ('corner_birthday_2005-05-01', 1825, '二〇〇五年・春・你五歲'),
]

async def main():
    report = {'shots': [], 'errors': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--disable-gpu'],
        )
        # Portrait: the phone #corner is the actual corner label.
        page = await browser.new_page(viewport={'width': 1080, 'height': 2340})
        page.on('pageerror', lambda e: report['errors'].append('pageerror: ' + str(e)))
        page.on('console', lambda m: report['errors'].append(f'{m.type}: {m.text}')
                if m.type in ('error',) else None)

        for name, day, expected in DATES:
            url = f'{BASE}/?dev=1&shot&orient=portrait&screen=talent&day={day}'
            await page.goto(url, wait_until='domcontentloaded')
            await page.wait_for_function("() => document.body.dataset.ready", timeout=20000)
            await page.wait_for_timeout(400)
            info = await page.evaluate('''() => ({
              ready: document.body.dataset.ready,
              corner: (document.getElementById('corner') || {}).textContent || '',
              stamp: window.ALACalendar ? window.ALACalendar.cornerStamp(Number(new URLSearchParams(location.search).get('day'))).label : null,
              jsErrors: window._errs || null,
            })''')
            if info['corner'] != expected:
                report['errors'].append(f'{name} corner={info["corner"]!r} expected={expected!r}')
            dest = OUT / f'{name}.png'
            await page.screenshot(path=str(dest), full_page=False)
            im = Image.open(dest)
            # Crop the phone corner label (left:72, top:130, font ~30px)
            crop = im.crop((40, 100, 700, 280))
            crop_path = OUT / f'{name}_crop.png'
            crop.save(crop_path)
            rec = {
                'name': name,
                'day': day,
                'expected': expected,
                'corner': info['corner'],
                'stamp': info['stamp'],
                'ready': info['ready'],
                'full': str(dest),
                'crop': str(crop_path),
                'size': list(im.size),
                'ok': info['corner'] == expected,
            }
            report['shots'].append(rec)
            print('SHOT', rec)

        await browser.close()

    (OUT / 'corner_date_shots.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if report['errors']:
        print('ERRORS', report['errors'])
        raise SystemExit(1)
    print('ALL SHOTS OK')

if __name__ == '__main__':
    asyncio.run(main())
