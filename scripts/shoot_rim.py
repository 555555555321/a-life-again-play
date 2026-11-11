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
    "r3_A": {"x": 222, "feet": 252, "ax": 27, "ay": 115, "cw": 56, "ch": 116,
             "sprite": REPO / "assets/chars/style_trial_mom/r3/A.png"},
    "a4_12": {"x": 406, "feet": 252, "ax": 27, "ay": 115, "cw": 56, "ch": 116,
              "sprite": REPO / "assets/chars/style_trial_mom/a_r4/A_r4_12.png"},
}
FACE_NATIVE = (392, 160, 424, 210)  # A r4 head and shoulders, inclusive
# Legs: mid-thigh through a few px of floor, both characters.
LEGS = {
    "r3_A": (192, 200, 254, 256),
    "a4_12": (376, 200, 438, 256),
}
TOP_FRAC = 0.40
LOCAL_LIGHT = "right"  # style_trial_mom_a4 is unflipped; world light is right


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


def url(lit: str | None, rim: str | None) -> str:
    q = ["shot", "dev=1", "orient=landscape", "screen=style_trial_mom_a4", "drawer=0"]
    if lit:
        q.append(f"lit={lit}")
    if rim is not None:
        q.append(f"rim={rim}")
    return f"{BASE}/?{'&'.join(q)}"


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


def predicted_rim(sprite: np.ndarray, local_light: str = "right"):
    """Same rule as game.js applyCharRim. Returns padded-space masks."""
    a = sprite[:, :, 3] > 0
    h, w = a.shape
    pad = 1
    H, W = h + 2, w + 2
    op = np.zeros((H, W), dtype=bool)
    op[1:h + 1, 1:w + 1] = a
    ys, xs = np.where(a)
    y0, y1 = int(ys.min()), int(ys.max())
    ext = np.zeros((H, W), dtype=bool)
    stack = []
    for x in range(W):
        stack += [(0, x), (H - 1, x)]
    for y in range(H):
        stack += [(y, 0), (y, W - 1)]
    seen = set()
    while stack:
        y, x = stack.pop()
        if not (0 <= y < H and 0 <= x < W) or (y, x) in seen:
            continue
        seen.add((y, x))
        if op[y, x]:
            continue
        ext[y, x] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            stack.append((y + dy, x + dx))
    N8 = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]
    side_dirs = ((0, -1), (-1, -1), (1, -1)) if local_light == "right" else ((0, 1), (-1, 1), (1, 1))
    cutoff = y0 + TOP_FRAC * (y1 - y0)
    rim = np.zeros((H, W), dtype=bool)
    ring = np.zeros((H, W), dtype=bool)  # full outer ring, no feet, no channels/holes
    for y in range(H):
        for x in range(W):
            if op[y, x] or not ext[y, x]:
                continue
            srcy = y - 1
            horiz = (x > 0 and op[y, x - 1]) and (x + 1 < W and op[y, x + 1])
            vert = (y > 0 and op[y - 1, x]) and (y + 1 < H and op[y + 1, x])
            if horiz or vert:
                continue
            if not any(0 <= y + dy < H and 0 <= x + dx < W and op[y + dy, x + dx] for dy, dx in N8):
                continue
            if srcy >= y1:
                continue
            ring[y, x] = True
            is_top = srcy <= cutoff and (y + 1 < H and op[y + 1, x])
            is_side = any(
                0 <= y + dy < H and 0 <= x + dx < W and op[y + dy, x + dx]
                for dy, dx in side_dirs
            )
            if is_top or is_side:
                rim[y, x] = True
    return {
        "rim": rim, "ring": ring, "op": op, "y0": y0, "y1": y1,
        "cutoff": cutoff, "pad": pad, "H": H, "W": W,
    }


def measure_char(name: str, ch: dict, off: np.ndarray, on: np.ndarray) -> dict:
    left = int(round(ch["x"] - ch["ax"]))
    top = int(round(ch["feet"] - ch["ay"]))
    sprite = np.array(Image.open(ch["sprite"]).convert("RGBA"))
    pred = predicted_rim(sprite, LOCAL_LIGHT)
    pad = pred["pad"]

    # Map padded sprite coords -> native scene, then inspect shots.
    # padded (X,Y) corresponds to scene (left + (X-pad), top + (Y-pad)).
    RIM = np.array(RIM_RGB, dtype=np.uint8)
    light_crs = []
    n_pred = 0
    n_shot = 0
    n_match = 0
    n_on_or_below_feet = 0
    n_in_channel_or_hole = 0
    pred_ys, pred_xs = np.where(pred["rim"])
    for Y, X in zip(pred_ys, pred_xs):
        sx, sy = left + (X - pad), top + (Y - pad)
        if not (0 <= sx < NW and 0 <= sy < NH):
            continue
        n_pred += 1
        on_px = on[sy, sx]
        off_px = off[sy, sx]
        is_rim = tuple(int(v) for v in on_px) == RIM_RGB and not np.array_equal(on_px, off_px)
        if is_rim:
            n_shot += 1
            n_match += 1
            light_crs.append(contrast_ratio(on_px, off_px))
        # also if shot is rim but we already counted via pred

    # any shot rim in the padded box that is not predicted?
    extra = 0
    feet_scene_y = top + pred["y1"]
    box_x0, box_y0 = left - pad, top - pad
    box_x1, box_y1 = left + ch["cw"] + pad, top + ch["ch"] + pad
    x0c, y0c = max(0, box_x0), max(0, box_y0)
    x1c, y1c = min(NW, box_x1 + 1), min(NH, box_y1 + 1)
    for sy in range(y0c, y1c):
        for sx in range(x0c, x1c):
            on_px = on[sy, sx]
            off_px = off[sy, sx]
            if tuple(int(v) for v in on_px) != RIM_RGB:
                continue
            if np.array_equal(on_px, off_px):
                continue
            if sy >= feet_scene_y:
                n_on_or_below_feet += 1
            X, Y = (sx - left) + pad, (sy - top) + pad
            if 0 <= Y < pred["H"] and 0 <= X < pred["W"]:
                if pred["rim"][Y, X]:
                    continue
                extra += 1
                if not pred["ring"][Y, X]:
                    n_in_channel_or_hole += 1
            else:
                extra += 1

    ring_n = int(pred["ring"].sum())
    rim_n = int(pred["rim"].sum())
    coverage = round(100.0 * rim_n / ring_n, 2) if ring_n else None

    return {
        "char": name,
        "box_native": [left, top, left + ch["cw"], top + ch["ch"]],
        "feet_row_native": feet_scene_y,
        "top_cutoff_src_y": round(pred["cutoff"], 2),
        "light_side_and_top": summarize(light_crs),
        "whole_silhouette_coverage": {
            "rim_pixels": rim_n,
            "outer_ring_candidates": ring_n,
            "percent": coverage,
            "note": "Painted light-side+top rim pixels as a share of the full exterior ring (excluding the floor-contact row, enclosed holes, and 1 px channels).",
        },
        "shot_vs_predicted": {
            "predicted_in_frame": n_pred,
            "shot_matched": n_match,
            "extra_shot_rim_not_predicted": extra,
            "shot_rim_on_or_below_feet_row": n_on_or_below_feet,
            "shot_rim_in_hole_or_channel": n_in_channel_or_hole,
        },
    }


def crop_x8(full: np.ndarray, box) -> Image.Image:
    x0, y0, x1, y1 = box
    L = SX + x0 * SCALE
    T = SY + y0 * SCALE
    R = SX + (x1 + 1) * SCALE
    B = SY + (y1 + 1) * SCALE
    crop = full[T:B, L:R]
    im = Image.fromarray(crop)
    return im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST)


def main() -> int:
    OUT.mkdir(exist_ok=True)
    pages = {
        "evening_off": url("evening", "0"),
        "evening_on": url("evening", "1"),
        "evening_default": url("evening", None),
        "day_off": url(None, "0"),
        "day_on": url(None, "1"),
    }
    shots = {}
    meta = {}
    errors = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": SHOT[0], "height": SHOT[1]})
        for key, u in pages.items():
            cons, page_err = [], []

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
                    lightSide: typeof window.worldLightSide === 'function' ? window.worldLightSide() : null,
                    charRim: window.CHAR_RIM || null,
                    canvas: (() => { const c=document.getElementById('sceneL'); return c ? [c.width,c.height] : null; })(),
                })"""
            )
            canv = page.locator("#sceneL")
            png = canv.screenshot(type="png")
            im = Image.open(io.BytesIO(png)).convert("RGB")
            dest = OUT / f"rim_a4_{key}.png"
            im.save(dest)
            arr = np.array(im)
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

    report = {"shots": shots}

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

    def native_scene(full):
        scene = full[:, SX : SX + NW * SCALE]
        # take the top-left of each 4× block (integer nearest)
        return scene.reshape(NH, SCALE, NW, SCALE, 3)[:, 0, :, 0, :].copy()

    scene_off = native_scene(meta["evening_off"])
    scene_on = native_scene(meta["evening_on"])

    report["contrast"] = {}
    for name, ch in CHARS.items():
        report["contrast"][name] = measure_char(name, ch, scene_off, scene_on)

    face_off = crop_x8(meta["evening_off"], FACE_NATIVE)
    face_on = crop_x8(meta["evening_on"], FACE_NATIVE)
    p_off = OUT / "rim_a4_evening_off_face_x8.png"
    p_on = OUT / "rim_a4_evening_on_face_x8.png"
    face_off.save(p_off)
    face_on.save(p_on)
    report["face_x8"] = {
        "native_box_inclusive": list(FACE_NATIVE),
        "note": "A r4 head and shoulders, nearest-neighbour 8× from native pixels.",
        "evening_off": str(p_off.relative_to(REPO)),
        "evening_on": str(p_on.relative_to(REPO)),
        "size": list(face_off.size),
    }

    report["legs_x8"] = {}
    for name, box in LEGS.items():
        off_im = crop_x8(meta["evening_off"], box)
        on_im = crop_x8(meta["evening_on"], box)
        po = OUT / f"rim_a4_evening_off_legs_{name}_x8.png"
        pn = OUT / f"rim_a4_evening_on_legs_{name}_x8.png"
        off_im.save(po)
        on_im.save(pn)
        report["legs_x8"][name] = {
            "native_box_inclusive": list(box),
            "evening_off": str(po.relative_to(REPO)),
            "evening_on": str(pn.relative_to(REPO)),
            "size": list(on_im.size),
        }

    report["js_ok"] = all(
        not v["pageerror"] and not any(c["type"] == "error" for c in v["console"])
        for v in errors.values()
    )
    report["js_errors"] = errors
    report["colour"] = {
        "hex": "#c4aa78",
        "rgb": list(RIM_RGB),
        "palette": "family palette grandpa_khaki light; also in 3349 palette",
        "placement": "exterior top/shoulders (upward-facing, upper 40% of opaque bbox) plus light-facing side; no floor-contact row; no enclosed holes; no 1 px channels",
        "light_side": "right",
        "light_side_why": (
            "Living-room evening: the window is dusk-dark; lamps are on at both sides. "
            "The tall floor lamp on the right is the brightest region of room_evening "
            "and sits at head/shoulder height. The left table lamp is lower and smaller. "
            "A r4 at x=406 stands just left of that floor lamp, so her lit side is the right. "
            "Light side is a world direction (manifest/scenes light_side) and flips with the sprite."
        ),
    }

    (OUT / "rim_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    brief = {
        "identity": report["identity"],
        "contrast": report["contrast"],
        "js_ok": report["js_ok"],
        "js_errors_brief": {k: v for k, v in errors.items() if v["pageerror"] or v["console"]},
        "light_side": shots["evening_on"]["js"].get("lightSide"),
        "charRim": shots["evening_on"]["js"].get("charRim"),
        "face": report["face_x8"],
        "legs": report["legs_x8"],
        "shots": {k: v["path"] for k, v in shots.items()},
    }
    print(json.dumps(brief, indent=2, ensure_ascii=False))
    ok = report["js_ok"] and day_same and eve_default_same and eve_changed
    for rec in report["contrast"].values():
        if rec["shot_vs_predicted"]["shot_rim_on_or_below_feet_row"]:
            ok = False
        if rec["shot_vs_predicted"]["extra_shot_rim_not_predicted"]:
            # don't hard-fail on extras until we inspect, but print
            pass
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
