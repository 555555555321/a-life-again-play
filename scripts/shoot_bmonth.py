#!/usr/bin/env python3
"""Screenshot Phone B corner labels for birth months 1, 5, 9, 10, 12 (day 0 / naming)."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

PORT = 8781
BASE = f'http://127.0.0.1:{PORT}'
REPO = Path(__file__).resolve().parents[1]
OUT_REPO = REPO / 'artifacts' / 'bmonth_shots'
OUT_SHARED = Path('/workspace/ala/小兵/2026-11-11/bmonth_shots')
OUT_REPO.mkdir(parents=True, exist_ok=True)
OUT_SHARED.mkdir(parents=True, exist_ok=True)

# Day 0 of this life = birthday (2000, month, 1). Naming-style corner.
SEASON = {1: '冬', 5: '春', 9: '秋', 10: '秋', 12: '冬'}
YEAR_DIGIT = '〇一二三四五六七八九'

def cn_year(year):
    return ''.join(YEAR_DIGIT[int(ch)] for ch in str(year))

DATES = []
for month in (1, 5, 9, 10, 12):
    expected = f'{cn_year(2000)}年・{SEASON[month]}・你零歲'
    DATES.append((f'play_naming_m{month:02d}', month, expected))

async def main():
    report = {'shots': [], 'errors': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--disable-gpu'],
        )
        page = await browser.new_page(viewport={'width': 1080, 'height': 2340})
        page.on('pageerror', lambda e: report['errors'].append('pageerror: ' + str(e)))
        page.on('console', lambda m: report['errors'].append(f'{m.type}: {m.text}')
                if m.type in ('error',) else None)

        for name, month, expected in DATES:
            url = f'{BASE}/?dev=1&shot&orient=portrait&screen=elders_stand&birthMonth={month}'
            await page.goto(url, wait_until='domcontentloaded')
            await page.wait_for_function("() => document.body.dataset.ready", timeout=20000)
            await page.wait_for_timeout(400)
            info = await page.evaluate('''() => ({
              ready: document.body.dataset.ready,
              corner: (document.getElementById('corner') || {}).textContent || '',
              stamp: window.ALACalendar ? window.ALACalendar.cornerStamp(0, { year: 2000, month: Number(new URLSearchParams(location.search).get('birthMonth')), day: 1 }).label : null,
            })''')
            if info['corner'] != expected:
                report['errors'].append(f"{name} corner={info['corner']!r} expected={expected!r}")
            dest = OUT_REPO / f'{name}.png'
            await page.screenshot(path=str(dest), full_page=False)
            im = Image.open(dest)
            crop = im.crop((40, 100, 700, 280))
            crop_path = OUT_REPO / f'{name}_crop.png'
            crop.save(crop_path)
            rec = {
                'name': name,
                'month': month,
                'expected': expected,
                'corner': info['corner'],
                'stamp': info['stamp'],
                'full': str(dest),
                'crop': str(crop_path),
            }
            report['shots'].append(rec)
            # also copy to shared folder
            for src in (dest, crop_path):
                target = OUT_SHARED / src.name
                target.write_bytes(src.read_bytes())

        await browser.close()

    (OUT_REPO / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (OUT_SHARED / 'play_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if report['errors']:
        raise SystemExit('screenshot errors:\n' + '\n'.join(report['errors']))
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    asyncio.run(main())
