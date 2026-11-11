#!/usr/bin/env python3
"""Freeze small-car A-pack frames f00/f02/f06, save 1x and 8x vehicle crops."""
import asyncio, json, socket, io
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

REPO = Path("/workspace/a-life-again-play")
OUT = REPO / "shots"
OUT.mkdir(exist_ok=True)
PORT = 8779
BASE = f"http://127.0.0.1:{PORT}"
BASE_Q = "dev=1&shot&orient=landscape&screen=commute&drawer=820&art=a&event=none&force=1"

# Second animation loop so intro (350ms) is over and we are mid-road.
# frame i is shown for elapsed in [i*125, i*125+125).
def elapsed_for(frame: int) -> int:
    return 1000 + frame * 125

VARIANTS = [
    ("commute_a_bob_m0_partner", BASE_Q + "&vehicle=car&model=0&driver=dad&riders=partner", 0),
    ("commute_a_bob_m0_kid", BASE_Q + "&vehicle=car&model=0&driver=dad&riders=kid_seat", 0),
    ("commute_a_bob_m1_parents", BASE_Q + "&vehicle=car&model=1&driver=dad&riders=parents", 1),
    ("commute_a_bob_m2_kid", BASE_Q + "&vehicle=car&model=2&driver=dad&riders=kid_seat", 2),
]
FRAMES = (0, 2, 6)


def nn_scale(im: Image.Image, k: int) -> Image.Image:
    return im.resize((im.width * k, im.height * k), Image.Resampling.NEAREST)


async def main():
    errs = []
    report = {"frames": {}, "js_errors": [], "js_error_count": 0}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 2340, "height": 1080})
        page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        for name, query, model in VARIANTS:
            url = f"{BASE}/?{query}"
            await page.goto(url, wait_until="domcontentloaded")
            try:
                await page.wait_for_function("() => window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.t0", timeout=20000)
            except Exception as e:
                errs.append(f"timeout {name}: {e}")
                continue
            await page.wait_for_timeout(200)
            for frame in FRAMES:
                elapsed = elapsed_for(frame)
                info = await page.evaluate(
                    """(elapsed) => {
                      const errs = [];
                      const c = document.createElement('canvas');
                      c.width = 480; c.height = 270;
                      const g = c.getContext('2d');
                      g.imageSmoothingEnabled = false;
                      window.drawCommuteNative(g, window.COMMUTE.t0 + elapsed);
                      const box = (window.COMMUTE.boxes || []).find(b => b.name === 'vehicle') || null;
                      const plan = window.COMMUTE.state && window.COMMUTE.state.artPlan;
                      const fi = Math.floor((elapsed / 1000) * 8) % 8;
                      const bob = plan && plan.body_bob_px ? plan.body_bob_px[fi] : null;
                      return {
                        dataUrl: c.toDataURL('image/png'),
                        box,
                        compose: plan && plan.compose,
                        canvas: plan && plan.canvas,
                        ground_row: plan && plan.ground_row,
                        body_bob_px: plan && plan.body_bob_px,
                        body_bob_missing: plan && plan.body_bob_missing,
                        labels: plan && plan.labels,
                        layers: plan && plan.layers && plan.layers.map(l => l.role),
                        frameComputed: fi,
                        bobAtFrame: bob,
                        missing: window.COMMUTE.imgs && window.COMMUTE.imgs.missing,
                      };
                    }""",
                    elapsed,
                )
                raw = info.pop("dataUrl")
                import base64
                blob = base64.b64decode(raw.split(",", 1)[1])
                scene = Image.open(io.BytesIO(blob)).convert("RGBA")
                scene_path = OUT / f"{name}_f{frame:02d}_scene.png"
                scene.save(scene_path)
                box = info.get("box") or {"x": 0, "y": 0, "w": scene.width, "h": scene.height}
                pad = 4
                x0 = max(0, int(box["x"]) - pad)
                y0 = max(0, int(box["y"]) - pad)
                x1 = min(scene.width, int(box["x"] + box["w"]) + pad)
                y1 = min(scene.height, int(box["y"] + box["h"]) + pad)
                crop = scene.crop((x0, y0, x1, y1))
                p1 = OUT / f"{name}_f{frame:02d}_1x.png"
                p8 = OUT / f"{name}_f{frame:02d}_8x.png"
                crop.save(p1)
                nn_scale(crop, 8).save(p8)
                rec = dict(info)
                rec.update({
                    "elapsed_ms": elapsed,
                    "frame": frame,
                    "crop_box": [x0, y0, x1, y1],
                    "paths": {"scene": str(scene_path.relative_to(REPO)),
                              "x1": str(p1.relative_to(REPO)),
                              "x8": str(p8.relative_to(REPO))},
                })
                report["frames"][f"{name}_f{frame:02d}"] = rec
                print("shot", name, "f%02d" % frame, "bob=", rec.get("bobAtFrame"),
                      "compose=", rec.get("compose"), "box=", box)

        await browser.close()

    js_errs = [e for e in errs if not e.startswith("warning:")]
    report["errors"] = errs
    report["js_errors"] = js_errs
    report["js_error_count"] = len(js_errs)
    (OUT / "commute_a_bob_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("js_error_count", len(js_errs))
    for e in js_errs[:20]:
        print(" ", e)
    if js_errs:
        print("JS ERROR FAIL")

if __name__ == "__main__":
    asyncio.run(main())
