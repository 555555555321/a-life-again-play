#!/usr/bin/env python3
"""Shoot Phone B Messages app fixtures. Portrait 1080×2340, integer NN scale."""
import asyncio
import http.server
import shutil
import socketserver
import threading
from pathlib import Path

from playwright.async_api import async_playwright
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
PORT = 8875
BASE = f"http://127.0.0.1:{PORT}"
OUT_REPO = REPO / "artifacts" / "messages"
OUT_ALA = Path("/workspace/ala/小兵/2026-11-11/msgapp_shots_r2")

SHOTS = [
    ("flip_list", "dev=1&shot&orient=portrait&screen=messages&fixture=list", None),
    ("flip_compose", "dev=1&shot&orient=portrait&screen=messages&fixture=compose", None),
    ("chat_list", "dev=1&shot&orient=portrait&screen=messages&fixture=list&gen=smart", None),
    ("chat_thread_photo", "dev=1&shot&orient=portrait&screen=messages&fixture=photo", None),
    ("insufficient_savings", "dev=1&shot&orient=portrait&screen=messages&fixture=nosavings", "insufficient"),
    ("dead_readonly", "dev=1&shot&orient=portrait&screen=messages&fixture=dead", None),
    ("fade_label", "dev=1&shot&orient=portrait&screen=messages&fixture=fade", None),
    ("incoming", "dev=1&shot&orient=portrait&screen=messages&fixture=incoming&gen=smart", None),
    ("smart_compose", "dev=1&shot&orient=portrait&screen=messages&fixture=compose&gen=smart", None),
]


def start_server():
    handler = http.server.SimpleHTTPRequestHandler

    class Quiet(handler):
        def log_message(self, *args):
            pass

    class Reuse(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = Reuse(("127.0.0.1", PORT), Quiet)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def nn_ok(im: Image.Image, box):
    """True if a high-contrast region only contains solid SCALE×SCALE blocks (no blur)."""
    # Sample the 96×144 app area at 10× inside the 1080×2340 phone: left 60, top 120, 960×1440.
    x0, y0, w, h = box
    crop = im.crop((x0, y0, x0 + w, y0 + h)).convert("RGB")
    px = crop.load()
    scale = 10
    mismatches = 0
    checked = 0
    # Walk every 10th origin; all 10×10 children must equal the top-left of the block.
    for by in range(0, h - scale, scale):
        for bx in range(0, w - scale, scale):
            origin = px[bx, by]
            for dy in range(scale):
                for dx in range(scale):
                    checked += 1
                    if px[bx + dx, by + dy] != origin:
                        mismatches += 1
                        if mismatches > 8:
                            return False, checked, mismatches
    return mismatches == 0, checked, mismatches


async def main():
    OUT_REPO.mkdir(parents=True, exist_ok=True)
    OUT_ALA.mkdir(parents=True, exist_ok=True)
    httpd = start_server()
    errs = []
    reports = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--font-render-hinting=none"],
        )
        page = await browser.new_page(viewport={"width": 1080, "height": 2340}, device_scale_factor=1)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)

        for name, query, action in SHOTS:
            url = f"{BASE}/?{query}"
            await page.goto(url, wait_until="domcontentloaded")
            try:
                await page.wait_for_function(
                    "() => window.MESSAGES && window.MESSAGES.ready && document.body.dataset.ready === 'messages'",
                    timeout=15000,
                )
            except Exception as e:
                errs.append(f"timeout {name}: {e}")
                print("TIMEOUT", name, e)
                continue
            await page.wait_for_timeout(200)
            if action == "insufficient":
                await page.evaluate("() => window.MESSAGES.trySend()")
                await page.wait_for_timeout(80)
            dest = OUT_REPO / f"{name}.png"
            # full phone, 1:1 pixels
            phone = page.locator("#phone")
            await phone.screenshot(path=str(dest))
            shutil.copy2(dest, OUT_ALA / dest.name)
            im = Image.open(dest)
            ok, checked, mismatches = nn_ok(im, (60, 120, 960, 1440))
            info = await page.evaluate(
                """() => ({
                  ready: document.body.dataset.ready,
                  gen: window.MESSAGES && window.MESSAGES.app && window.MESSAGES.app.state.phone.gen,
                  view: window.MESSAGES && window.MESSAGES.app && window.MESSAGES.app.view,
                  banner: window.MESSAGES && window.MESSAGES.app && window.MESSAGES.app.banner,
                  fixture: window.MESSAGES && window.MESSAGES.app && window.MESSAGES.app.fixture,
                  size: [document.getElementById('sceneP').width, document.getElementById('sceneP').height], fontBaseline: window.MESSAGES.fontBaseline,
                })"""
            )
            reports.append({"name": name, "nn_ok": ok, "checked": checked, "mismatches": mismatches, "info": info, "path": str(dest)})
            print("shot", name, "nn_ok=", ok, "mismatches=", mismatches, "info=", info)

        await browser.close()
    httpd.shutdown()
    if errs:
        print("ERRS")
        for e in errs:
            print(" ", e)
    return reports, errs


if __name__ == "__main__":
    import os
    os.chdir(REPO)
    reports, errs = asyncio.run(main())
    bad = [r for r in reports if not r["nn_ok"]]
    if len(reports) < len(SHOTS) or bad:
        raise SystemExit("shoot failed")
    print("OK", len(reports), "shots")
