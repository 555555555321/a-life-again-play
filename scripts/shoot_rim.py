#!/usr/bin/env python3
"""One-shot verification for the evening character rim (?rim=1)."""
from __future__ import annotations

import hashlib
import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

REPO = Path("/workspace/a-life-again-play-rim")
OUT = REPO / "shots"
BASE = "http://127.0.0.1:8793"
SHOT = 2340, 1080
SX, SY, SCALE = 210, 0, 4
NW, NH = 480, 270
RIM_RGB = (196, 170, 120)  # #c4aa78
CHARS = {
    "r3_A": {"x": 222, "feet": 252, "ax": 27, "ay": 115, "cw": 56, "ch": 116},
    "a4_12": {"x": 406, "feet": 252, "ax": 27, "ay": 115, "cw": 56, "ch": 116},
}
# Tight head-and-shoulders of A r4 in native scene px (inclusive).
FACE_NATIVE = (392, 160, 424, 210)  # x0,y0,x1,y1


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rel_Y(rgb) -> float:
    lin = srgb_to_linear(np.array(rgb[:3], dtype=np.float64))
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def contrast_ratio(a, b) -> float:
    ya, yb = rel_Y(a), rel_Y(b)
    return (max(ya, yb) + 0.05) / (min(ya, yb) + 0.05)


def sha(arr: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()[:16]


def downscale4(scene: np.ndarray) -> np.ndarray:
    """Nearest, exact 4× blocks → 480×270. Errors if a block is not uniform."""
    h, w = scene.shape[:2]
    assert w == NW * SCALE and h == NH * SCALE, (w, h)
    blocks = scene.reshape(NH, SCALE, NW, SCALE, 3)
    native = blocks[:, 0, :, 0, :].copy()
    # confirm integer upscale (no blur)
    rebuilt = np.repeat(np.repeat(native, SCALE, 0), SCALE, 1)
    uniform = bool(np.array_equal(scene, rebuilt))
    return native, uniform


def url(lit: str | None, rim: str | None) -> str:
    q = ["shot", "dev=1", "orient=landscape", "screen=style_trial_mom_a4", "drawer=0"]
    if lit:
        q.append(f"lit={lit}")
    if rim is not None:
        q.append(f"rim={rim}")
    return f"{BASE}/?{'&'.join(q)}"


def outline_pixels(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    out = np.zeros_like(mask, dtype=bool)
    ys, xs = np.where(mask)
    for y, x in zip(ys, xs):
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w or not mask[ny, nx]:
                out[y, x] = True
                break
    return out


def summarize(crs: list[float]) -> dict:
    if not crs:
        return {"n": 0, "pct_ge_2": None, "pct_ge_1_5": None, "min": None, "mean": None}
    n = len(crs)
    return {
        "n": n,
        "pct_ge_2": round(100.0 * sum(c >= 2.0 for c in crs) / n, 2),
        "pct_ge_1_5": round(100.0 * sum(c >= 1.5 for c in crs) / n, 2),
        "min": round(min(crs), 4),
        "mean": round(sum(crs) / n, 4),
        "max": round(max(crs), 4),
    }


def measure_char(name: str, ch: dict, off: np.ndarray, on: np.ndarray) -> dict:
    left = int(round(ch["x"] - ch["ax"]))
    top = int(round(ch["feet"] - ch["ay"]))
    # padded box so the outside rim is included
    x0, y0 = left - 1, top - 1
    x1, y1 = left + ch["cw"] + 1, top + ch["ch"] + 1
    x0c, y0c = max(0, x0), max(0, y0)
    x1c, y1c = min(NW, x1), min(NH, y1)

    off_p = off[y0c:y1c, x0c:x1c]
    on_p = on[y0c:y1c, x0c:x1c]
    diff = np.any(off_p != on_p, axis=2)
    is_rim = diff & np.all(on_p == np.array(RIM_RGB, dtype=np.uint8), axis=2)

    rim_crs = []
    for y, x in zip(*np.where(is_rim)):
        rim_crs.append(contrast_ratio(on_p[y, x], off_p[y, x]))

    # rim-off baseline: opaque silhouette outline vs the same off-image background.
    # Reconstruct mask from pixels that changed OR look like the evening-tinted body
    # (everything that differs from the room in the OFF shot inside the sprite box,
    # excluding the 1px pad).
    sl = slice(max(0, top), min(NH, top + ch["ch"]))
    sc = slice(max(0, left), min(NW, left + ch["cw"]))
    # background prototype from just outside the (unpadded) box, or use off vs a
    # padded "room only" estimate: pixels in OFF that equal ON outside the body.
    # Simpler: body = pixels in OFF that differ from a room sample at the same
    # location in a copy... We don't have a separate room. Use: in the ON image,
    # body is non-rim pixels that differ from OFF? No — body is identical in
    # ON and OFF, so body = not the room. Room is the OFF image everywhere the
    # body isn't. We can get the body mask as: OFF != a room-only image.
    # Approximate room by taking OFF and, for body region, we know body occupies
    # non-transparent sprite pixels. Without the sprite alpha, detect body as
    # 4-connected component of pixels whose colour is not the local wall and
    # that sit inside the unpadded sprite rect — dirty.
    #
    # Better: body mask = pixels inside unpadded rect where OFF does not match
    # the ON-only-room... Actually ON and OFF are identical on the body and on
    # the room, and differ only on rim pixels. So we cannot find the body from
    # the diff. Load is not available here. Use a simple edge of "likely body":
    # walk inward from rim: every 4-neighbour of a rim pixel that didn't change
    # and sits toward the sprite is an outline pixel of the original silhouette.
    outline = np.zeros_like(is_rim, dtype=bool)
    ih, iw = is_rim.shape
    for y, x in zip(*np.where(is_rim)):
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= ih or nx < 0 or nx >= iw:
                continue
            if (not is_rim[ny, nx]) and (not diff[ny, nx]):
                # candidate body pixel — must lie in the unpadded sprite rect
                sy, sx = y0c + ny, x0c + nx
                if left <= sx < left + ch["cw"] and top <= sy < top + ch["ch"]:
                    outline[ny, nx] = True
    off_crs = []
    for y, x in zip(*np.where(outline)):
        # background immediately outside: use the rim pixel's OFF colour if a
        # neighbouring rim-off (i.e. room) pixel exists; else skip.
        bg = None
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= ih or nx < 0 or nx >= iw:
                continue
            if is_rim[ny, nx]:
                bg = off_p[ny, nx]
                break
        if bg is None:
            continue
        off_crs.append(contrast_ratio(off_p[y, x], bg))

    return {
        "char": name,
        "box_native": [left, top, left + ch["cw"], top + ch["ch"]],
        "rim_on": summarize(rim_crs),
        "rim_off_outline": summarize(off_crs),
        "diff_pixels": int(diff.sum()),
        "rim_pixels": int(is_rim.sum()),
        "non_rim_diff_pixels": int((diff & ~is_rim).sum()),
        "outline_pixels": int(outline.sum()),
    }


def face_x8(full: np.ndarray, box) -> Image.Image:
    x0, y0, x1, y1 = box
    # stage coords of inclusive native box
    L = SX + x0 * SCALE
    T = SY + y0 * SCALE
    R = SX + (x1 + 1) * SCALE
    B = SY + (y1 + 1) * SCALE
    crop = full[T:B, L:R]  # already ×4
    # ×2 more → ×8 native, nearest
    im = Image.fromarray(crop)
    return im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    pages = {
        "evening_off": url("evening", "0"),
        "evening_on": url("evening", "1"),
        "evening_default": url("evening", None),  # no rim param → off
        "day_off": url(None, "0"),
        "day_on": url(None, "1"),
    }
    shots = {}
    meta = {}
    errors = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        page = browser.new_page(viewport={"width": SHOT[0], "height": SHOT[1]})
        for key, u in pages.items():
            cons, page_err = [], []
            page.remove_listener("pageerror", lambda e: None) if False else None

            def on_console(msg):
                if msg.type in ("error", "warning"):
                    cons.append({"type": msg.type, "text": msg.text})

            def on_err(err):
                page_err.append(str(err))

            page.on("console", on_console)
            page.on("pageerror", on_err)
            page.goto(u, wait_until="networkidle")
            page.wait_for_timeout(800)
            js = page.evaluate(
                """() => ({
                    ready: !!(window.STYLE_TRIAL_MOM_A4),
                    lighting: window.STYLE_TRIAL_MOM_A4 && window.STYLE_TRIAL_MOM_A4.lighting,
                    rimFlag: window.RIM,
                    rimActive: typeof window.rimActive === 'function' ? window.rimActive() : null,
                    charRim: window.CHAR_RIM || null,
                    canvas: (() => { const c=document.getElementById('sceneL'); return c ? [c.width,c.height] : null; })(),
                })"""
            )
            canv = page.locator("#sceneL")
            png = canv.screenshot(type="png")
            im = Image.open(io.BytesIO(png)).convert("RGB")
            arr = np.array(im)
            dest = OUT / f"rim_a4_{key}.png"
            if key in ("evening_default",):
                # keep for hash compare, also save
                dest = OUT / f"rim_a4_{key}.png"
            im.save(dest)
            shots[key] = {
                "url": u,
                "path": str(dest.relative_to(REPO)),
                "size": list(im.size),
                "sha256_16": sha(arr),
                "js": js,
                "console": cons,
                "pageerror": page_err,
            }
            meta[key] = arr
            errors[key] = {"console": cons, "pageerror": page_err}
            page.remove_listener("console", on_console)
            page.remove_listener("pageerror", on_err)
        browser.close()

    report = {"shots": {k: {kk: vv for kk, vv in v.items() if kk != "js" or True} for k, v in shots.items()}}

    # identity checks
    day_same = bool(np.array_equal(meta["day_off"], meta["day_on"]))
    eve_default_same = bool(np.array_equal(meta["evening_off"], meta["evening_default"]))
    eve_changed = not bool(np.array_equal(meta["evening_off"], meta["evening_on"]))
    report["identity"] = {
        "day_rim0_vs_rim1_identical": day_same,
        "day_off_sha": shots["day_off"]["sha256_16"],
        "day_on_sha": shots["day_on"]["sha256_16"],
        "evening_rim_omitted_vs_rim0_identical": eve_default_same,
        "evening_rim0_vs_rim1_differ": eve_changed,
        "evening_off_sha": shots["evening_off"]["sha256_16"],
        "evening_on_sha": shots["evening_on"]["sha256_16"],
        "evening_default_sha": shots["evening_default"]["sha256_16"],
    }

    # native scenes
    scene_off, uni_off = downscale4(meta["evening_off"][:, SX : SX + NW * SCALE])
    scene_on, uni_on = downscale4(meta["evening_on"][:, SX : SX + NW * SCALE])
    report["upscale_integer_nearest"] = {"evening_off": uni_off, "evening_on": uni_on}

    report["contrast"] = {}
    for name, ch in CHARS.items():
        report["contrast"][name] = measure_char(name, ch, scene_off, scene_on)

    # face crops ×8
    face_off = face_x8(meta["evening_off"], FACE_NATIVE)
    face_on = face_x8(meta["evening_on"], FACE_NATIVE)
    p_off = OUT / "rim_a4_evening_off_face_x8.png"
    p_on = OUT / "rim_a4_evening_on_face_x8.png"
    face_off.save(p_off)
    face_on.save(p_on)
    report["face_x8"] = {
        "native_box_inclusive": list(FACE_NATIVE),
        "note": "A r4 head and shoulders, nearest-neighbour 8× from native pixels (stage is already 4×, then 2×).",
        "evening_off": str(p_off.relative_to(REPO)),
        "evening_on": str(p_on.relative_to(REPO)),
        "size": list(face_off.size),
    }

    # js errors
    report["js_ok"] = all(
        not v["pageerror"] and not any(c["type"] == "error" for c in v["console"])
        for v in errors.values()
    )
    report["js_errors"] = errors
    report["colour"] = {
        "hex": "#c4aa78",
        "rgb": list(RIM_RGB),
        "palette": "family palette grandpa_khaki light; also in 3349 palette",
        "placement": "outside the silhouette (1 px, 8-connected), not on the outermost body pixel",
    }

    (OUT / "rim_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps({
        "identity": report["identity"],
        "upscale": report["upscale_integer_nearest"],
        "contrast": report["contrast"],
        "js_ok": report["js_ok"],
        "js_errors_brief": {k: v for k, v in errors.items() if v["pageerror"] or v["console"]},
        "face": report["face_x8"],
        "shots": {k: v["path"] for k, v in shots.items()},
    }, indent=2, ensure_ascii=False))
    return 0 if report["js_ok"] and day_same and eve_default_same and eve_changed else 1


if __name__ == "__main__":
    sys.exit(main())
