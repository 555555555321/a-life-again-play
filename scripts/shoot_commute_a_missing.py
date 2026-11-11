#!/usr/bin/env python3
"""Dev screens + 8x crops for §12 missing vehicle art (night p1, family m1/m2, car 3-person)."""
import argparse, asyncio, base64, io, json
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image

def nn_scale(im, k):
    return im.resize((im.width * k, im.height * k), Image.Resampling.NEAREST)

def elapsed_for(frame: int) -> int:
    return 1000 + frame * 125

BASE_Q = "dev=1&shot&orient=landscape&screen=commute&drawer=820&art=a&event=none&force=1"

# Mid-road page shots (2340×1080) for new scooter combos.
PAGE_SHOTS = []
for model in (0, 1, 2):
    for driver in ("dad", "mom"):
        PAGE_SHOTS.append((
            f"commute_a_missing_scooter_m{model}_night_p1_{driver}",
            BASE_Q + f"&vehicle=scooter&model={model}&driver={driver}&riders=partner&lit=evening",
            1400,
        ))
for model in (1, 2):
    for lit, litq in (("day", ""), ("night", "&lit=evening")):
        for driver in ("dad", "mom"):
            PAGE_SHOTS.append((
                f"commute_a_missing_scooter_m{model}_family_{lit}_{driver}",
                BASE_Q + f"&vehicle=scooter&model={model}&driver={driver}&riders=family{litq}",
                1400,
            ))

# Freeze-frame 1x/8x for the same combos plus small-car 3 passengers.
CROP_SHOTS = []
for model in (0, 1, 2):
    for driver in ("dad", "mom"):
        CROP_SHOTS.append((
            f"commute_a_missing_scooter_m{model}_night_p1_{driver}",
            BASE_Q + f"&vehicle=scooter&model={model}&driver={driver}&riders=partner&lit=evening",
            (2,),
        ))
for model in (1, 2):
    for lit, litq in (("day", ""), ("night", "&lit=evening")):
        for driver in ("dad", "mom"):
            CROP_SHOTS.append((
                f"commute_a_missing_scooter_m{model}_family_{lit}_{driver}",
                BASE_Q + f"&vehicle=scooter&model={model}&driver={driver}&riders=family{litq}",
                (2,),
            ))
for model in (0, 1, 2):
    CROP_SHOTS.append((
        f"commute_a_missing_car3_m{model}",
        BASE_Q + f"&vehicle=car&model={model}&driver=dad&riders=partner&kidseat=1",
        (2, 6),
    ))


async def eval_scene(page, elapsed):
    return await page.evaluate(
        """(elapsed) => {
          const c = document.createElement('canvas');
          c.width = 480; c.height = 270;
          const g = c.getContext('2d');
          g.imageSmoothingEnabled = false;
          window.drawCommuteNative(g, window.COMMUTE.t0 + elapsed);
          const box = (window.COMMUTE.boxes || []).find(b => b.name === 'vehicle') || null;
          const plan = window.COMMUTE.state && window.COMMUTE.state.artPlan;
          const fi = Math.floor((elapsed / 1000) * 8) % 8;
          return {
            dataUrl: c.toDataURL('image/png'),
            box,
            compose: plan && plan.compose,
            canvas: plan && plan.canvas,
            ground_row: plan && plan.ground_row,
            variant: plan && plan.variant,
            assetDir: plan && plan.assetDir,
            family: plan && plan.family,
            labels: plan && plan.labels,
            pending: plan && plan.pending,
            layers: plan && plan.layers && plan.layers.map(l => l.folder || l.role),
            body_bob_px: plan && plan.body_bob_px,
            metricsSource: plan && plan.metricsSource,
            missing: window.COMMUTE.imgs && window.COMMUTE.imgs.missing,
            frameComputed: fi,
          };
        }""",
        elapsed,
    )


def save_crop(repo, out, name, frame, info):
    raw = info.pop("dataUrl")
    blob = base64.b64decode(raw.split(",", 1)[1])
    scene = Image.open(io.BytesIO(blob)).convert("RGBA")
    scene_path = out / f"{name}_f{frame:02d}_scene.png"
    scene.save(scene_path)
    box = info.get("box") or {"x": 0, "y": 0, "w": scene.width, "h": scene.height}
    pad = 4
    x0 = max(0, int(box["x"]) - pad)
    y0 = max(0, int(box["y"]) - pad)
    x1 = min(scene.width, int(box["x"] + box["w"]) + pad)
    y1 = min(scene.height, int(box["y"] + box["h"]) + pad)
    crop = scene.crop((x0, y0, x1, y1))
    p1 = out / f"{name}_f{frame:02d}_1x.png"
    p8 = out / f"{name}_f{frame:02d}_8x.png"
    crop.save(p1)
    nn_scale(crop, 8).save(p8)
    rec = dict(info)
    rec.update({
        "elapsed_ms": elapsed_for(frame) if frame in (0, 2, 6) else None,
        "frame": frame,
        "crop_box": [x0, y0, x1, y1],
        "paths": {
            "scene": str(scene_path.relative_to(repo)),
            "x1": str(p1.relative_to(repo)),
            "x8": str(p8.relative_to(repo)),
        },
    })
    return rec, p8


def contact_sheet(paths, dest, cols):
    ims = [Image.open(p).convert("RGBA") for p in paths]
    if not ims:
        return
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 255))
    for i, im in enumerate(ims):
        if im.size != (w, h):
            canvas = Image.new("RGBA", (w, h), (0, 0, 0, 255))
            canvas.paste(im, (0, 0))
            im = canvas
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(dest)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default="/workspace/a-life-again-play-pr6")
    ap.add_argument("--port", type=int, default=8785)
    args = ap.parse_args()
    repo = Path(args.repo)
    out = repo / "shots"
    out.mkdir(exist_ok=True)
    base = f"http://127.0.0.1:{args.port}"

    errs = []
    report = {"pages": {}, "crops": {}, "js_errors": [], "js_error_count": 0}
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = await browser.new_page(viewport={"width": 2340, "height": 1080})
        page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))

        for name, query, wait_ms in PAGE_SHOTS:
            url = f"{base}/?{query}"
            await page.goto(url, wait_until="domcontentloaded")
            try:
                await page.wait_for_function("() => window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.t0", timeout=20000)
            except Exception as e:
                errs.append(f"timeout page {name}: {e}")
                continue
            await page.wait_for_timeout(wait_ms)
            info = await page.evaluate("""() => {
              const plan = window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.artPlan;
              return {
                art: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.art,
                mode: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.mode,
                driver: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.driver,
                model: window.COMMUTE && window.COMMUTE.state && window.COMMUTE.state.model,
                variant: plan && plan.variant,
                compose: plan && plan.compose,
                canvas: plan && plan.canvas,
                ground_row: plan && plan.ground_row,
                assetDir: plan && plan.assetDir,
                family: plan && plan.family,
                labels: plan && plan.labels,
                pending: plan && plan.pending,
                layers: plan && plan.layers && plan.layers.map(l => l.folder || l.role),
                missing: window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.imgs.missing,
              };
            }""")
            dest = out / f"{name}.png"
            await page.screenshot(path=str(dest))
            info["path"] = str(dest.relative_to(repo))
            report["pages"][name] = info
            print("page", name, "variant=", info.get("variant"), "canvas=", info.get("canvas"),
                  "labels=", info.get("labels"), "pending=", info.get("pending"),
                  "assetDir=", info.get("assetDir"))

        for name, query, frames in CROP_SHOTS:
            url = f"{base}/?{query}"
            await page.goto(url, wait_until="domcontentloaded")
            try:
                await page.wait_for_function("() => window.COMMUTE && window.COMMUTE.imgs && window.COMMUTE.t0", timeout=20000)
            except Exception as e:
                errs.append(f"timeout crop {name}: {e}")
                continue
            await page.wait_for_timeout(200)
            for frame in frames:
                elapsed = elapsed_for(frame)
                info = await eval_scene(page, elapsed)
                rec, _p8 = save_crop(repo, out, name, frame, info)
                rec["elapsed_ms"] = elapsed
                report["crops"][f"{name}_f{frame:02d}"] = rec
                print("crop", name, "f%02d" % frame, "variant=", rec.get("variant"),
                      "canvas=", rec.get("canvas"), "bob=", rec.get("body_bob_px"),
                      "labels=", rec.get("labels"), "layers=", rec.get("layers"))

        await browser.close()

    # Contact sheets (8x crops)
    night_p1 = [out / f"commute_a_missing_scooter_m{m}_night_p1_{d}_f02_8x.png"
                for m in (0, 1, 2) for d in ("dad", "mom")]
    contact_sheet(night_p1, out / "commute_a_missing_night_p1_f02_8x.png", 2)
    family = [out / f"commute_a_missing_scooter_m{m}_family_{lit}_{d}_f02_8x.png"
              for m in (1, 2) for lit in ("day", "night") for d in ("dad", "mom")]
    contact_sheet(family, out / "commute_a_missing_family_m1_m2_f02_8x.png", 4)
    car3 = [out / f"commute_a_missing_car3_m{m}_f{fr:02d}_8x.png"
            for m in (0, 1, 2) for fr in (2, 6)]
    contact_sheet(car3, out / "commute_a_missing_car3_f02_f06_8x.png", 2)

    js_errs = [e for e in errs if not e.startswith("warning:")]
    report["errors"] = errs
    report["js_errors"] = js_errs
    report["js_error_count"] = len(js_errs)
    leftover = []
    for rec in list(report["pages"].values()) + list(report["crops"].values()):
        for lab in (rec.get("labels") or []):
            if "待王子" in lab:
                leftover.append(lab)
    report["leftover_pending_labels"] = leftover
    (out / "commute_a_missing_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print("js_error_count", len(js_errs))
    for e in js_errs[:20]:
        print(" ", e)
    if leftover:
        print("LEFTOVER LABELS", leftover)
    if js_errs:
        print("JS ERROR FAIL")


if __name__ == "__main__":
    asyncio.run(main())
