#!/usr/bin/env python3
"""Shoot A-pack commute variants at 2340×1080. Overlap + JS error check."""
import asyncio, json, socket
from pathlib import Path
from playwright.async_api import async_playwright

REPO = Path('/workspace/a-life-again-play')
OUT = REPO / 'shots'
OUT.mkdir(exist_ok=True)
PORT = 8779
BASE = f'http://127.0.0.1:{PORT}'

# Mid-road (~1.4s) shows wheels / travel. event=none keeps the road clean.
# Each model: day + dusk. Passengers where the vehicle supports them.
BASE_Q = 'dev=1&shot&orient=landscape&screen=commute&drawer=820&art=a&event=none&force=1'
VARIANTS = [
    ('commute_a_bicycle_m0_day',  BASE_Q + '&vehicle=bike&model=0&driver=dad', 1400),
    ('commute_a_bicycle_m0_dusk', BASE_Q + '&vehicle=bike&model=0&driver=dad&lit=evening', 1400),
    ('commute_a_bicycle_m1_day',  BASE_Q + '&vehicle=bike&model=1&driver=dad', 1400),
    ('commute_a_bicycle_m1_dusk', BASE_Q + '&vehicle=bike&model=1&driver=dad&lit=evening', 1400),
    ('commute_a_bicycle_m2_day',  BASE_Q + '&vehicle=bike&model=2&driver=dad', 1400),
    ('commute_a_bicycle_m2_dusk', BASE_Q + '&vehicle=bike&model=2&driver=dad&lit=evening', 1400),
    ('commute_a_scooter_m0_day_p1',  BASE_Q + '&vehicle=scooter&model=0&driver=dad&riders=partner', 1400),
    ('commute_a_scooter_m0_dusk_p1', BASE_Q + '&vehicle=scooter&model=0&driver=dad&riders=partner&lit=evening&headlights=0', 1400),
    ('commute_a_scooter_m1_day_p1',  BASE_Q + '&vehicle=scooter&model=1&driver=dad&riders=partner', 1400),
    ('commute_a_scooter_m1_dusk_p1', BASE_Q + '&vehicle=scooter&model=1&driver=dad&riders=partner&lit=evening&headlights=0', 1400),
    ('commute_a_scooter_m2_day_p1',  BASE_Q + '&vehicle=scooter&model=2&driver=dad&riders=partner', 1400),
    ('commute_a_scooter_m2_dusk_p1', BASE_Q + '&vehicle=scooter&model=2&driver=dad&riders=partner&lit=evening&headlights=0', 1400),
    ('commute_a_scooter_m0_family_day',  BASE_Q + '&vehicle=scooter&model=0&driver=dad&riders=family', 1400),
    ('commute_a_scooter_m0_family_dusk', BASE_Q + '&vehicle=scooter&model=0&driver=mom&riders=family&lit=evening', 1400),
    ('commute_a_smallcar_m0_day_partner',  BASE_Q + '&vehicle=car&model=0&driver=dad&riders=partner', 1400),
    ('commute_a_smallcar_m0_dusk_partner', BASE_Q + '&vehicle=car&model=0&driver=dad&riders=partner&lit=evening', 1400),
    ('commute_a_smallcar_m1_day_parents',  BASE_Q + '&vehicle=car&model=1&driver=dad&riders=parents', 1400),
    ('commute_a_smallcar_m1_dusk_parents', BASE_Q + '&vehicle=car&model=1&driver=dad&riders=parents&lit=evening', 1400),
    ('commute_a_smallcar_m2_day_kid',  BASE_Q + '&vehicle=car&model=2&driver=dad&riders=kid_seat', 1400),
    ('commute_a_smallcar_m2_dusk_kid', BASE_Q + '&vehicle=car&model=2&driver=dad&riders=kid_seat&lit=evening', 1400),
    ('commute_a_smallcar_m0_mom_day_partner', BASE_Q + '&vehicle=car&model=0&driver=mom&riders=partner', 1400),
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
                await page.wait_for_function('() => window.COMMUTE && window.COMMUTE.imgs', timeout=12000)
            except Exception as e:
                errs.append(f'timeout {name}: {e}')
            await page.wait_for_timeout(wait_ms)
            info = await page.evaluate('''() => ({
              ready: document.body.dataset.ready,
              art: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.art,
              mode: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.mode,
              driver: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.driver,
              model: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.model,
              variant: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.variant,
              compose: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.compose,
              canvas: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.canvas,
              assetDir: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.assetDir,
              labels: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.labels,
              px: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan && window.COMMUTE.state.artPlan.px_per_frame,
              card: (document.getElementById('ltext') || {}).innerText || (document.getElementById('text') || {}).innerText || '',
              missing: window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.imgs.missing,
              overlaps: (typeof commuteOverlapReport === 'function') ? commuteOverlapReport() : [],
              boxes: window.COMMUTE && window.COMMUTE.boxes,
            })''')
            dest = OUT / f'{name}.png'
            await page.screenshot(path=str(dest))
            overlaps[name] = info
            print('shot', name, 'art=', info.get('art'), 'mode=', info.get('mode'),
                  'compose=', info.get('compose'), 'canvas=', info.get('canvas'),
                  'variant=', info.get('variant'), 'overlaps=', info.get('overlaps'),
                  'labels=', info.get('labels'))
            return info

        for name, q, w in VARIANTS:
            await shot(name, q, w)

        await browser.close()

    js_errs = [e for e in errs if not e.startswith('warning:')]
    report = {
        'overlaps': {k: v.get('overlaps') for k, v in overlaps.items()},
        'art': {k: v.get('art') for k, v in overlaps.items()},
        'compose': {k: v.get('compose') for k, v in overlaps.items()},
        'canvas': {k: v.get('canvas') for k, v in overlaps.items()},
        'modes': {k: v.get('mode') for k, v in overlaps.items()},
        'variants': {k: v.get('variant') for k, v in overlaps.items()},
        'labels': {k: v.get('labels') for k, v in overlaps.items()},
        'cards': {k: v.get('card') for k, v in overlaps.items()},
        'missing': {k: v.get('missing') for k, v in overlaps.items()},
        'errors': errs,
        'js_error_count': len(js_errs),
        'overlap_hits': {k: len(v.get('overlaps') or []) for k, v in overlaps.items()},
    }
    (OUT / 'commute_a_report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    print('errors', len(errs))
    for e in errs[:30]:
        print(' ', e)
    if any(report['overlap_hits'].values()):
        print('OVERLAP FAIL', report['overlap_hits'])
    if js_errs:
        print('JS ERROR FAIL')

if __name__ == '__main__':
    asyncio.run(main())
