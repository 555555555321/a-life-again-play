#!/usr/bin/env python3
"""Gate-3 recompute and evening rim shots for final mom A r5c at x=295.

Does not replace the official style_trial_mom_a4 sprite. Uses the new
DEV screen style_trial_mom_a5c. Contrast math is implemented here, not
imported from 王子's build_r5.py.
"""
from __future__ import annotations

import collections
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
SPRITE = REPO / "assets/chars/style_trial_mom/a_r5c/A_r5c_12.png"
SPRITE_R5 = Path("/workspace/ala/r8_art/王子/style_trial_mom_20261110/a_r5/A_r5_12.png")
ROOM_DAY = REPO / "assets/room_daylight.png"
ROOM_EVE = REPO / "assets/room_evening.png"
MUL = (142, 115, 83)  # STYLE_TRIAL_MOM_EVENING_MUL, Math.round(c*m/255)
ANCHOR = (27, 115)
FEET = 252
STAND_X = 295
SHOT = 2340, 1080
SX, SCALE, NW, NH = 210, 4, 480, 270
RIM_RGB = (196, 170, 120)
TOP_FRAC = 0.40
LOCAL_LIGHT = "right"  # unflipped, world light is right
# Inclusive native scene boxes for 8× crops
FACE_BOX = (286, 160, 308, 196)
HANDS_BOX = (278, 212, 314, 230)
LEGS_BOX = (264, 200, 326, 256)

# 王子's published rounded figures at x=295 (measured on A_r5_12, 225 edges)
WANGZI_X295 = {
    "source": "standing_points.csv / verify_r5.py for A_r5_12 (not r5c); n=225",
    "day_outline_only": 64.0,   # 144/225
    "day_max_outline_one_in": 84.0,  # 189/225
    "evening_outline_only": 25.0,  # 56/225 ≈ 24.89, rounded 25
    "evening_max_outline_one_in": 29.0,  # 66/225 ≈ 29.33, rounded 29
}


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rel_Y(rgb) -> float:
    lin = srgb_to_linear(np.array(rgb[:3], dtype=np.float64))
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def contrast_ratio(a, b) -> float:
    ya, yb = rel_Y(a), rel_Y(b)
    return (max(ya, yb) + 0.05) / (min(ya, yb) + 0.05)


def tint_evening(rgb) -> np.ndarray:
    """Same as game.js stmTintEvening: Math.round(c * m / 255)."""
    out = rgb.copy()
    if out.shape[-1] == 4:
        a = out[..., 3] > 0
        for i, m in enumerate(MUL):
            ch = out[..., i].astype(np.int32)
            out[..., i] = np.where(a, np.rint(ch * m / 255).astype(np.uint8), out[..., i])
        return out
    for i, m in enumerate(MUL):
        ch = out[..., i].astype(np.int32)
        out[..., i] = np.rint(ch * m / 255).astype(np.uint8)
    return out


def n4_outline(mask: np.ndarray) -> np.ndarray:
    """Opaque pixels with at least one N4 transparent or off-canvas neighbour."""
    pad = np.pad(mask, 1, mode="constant", constant_values=False)
    return mask & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])


def inward_of(mask, x, y):
    """N4: step opposite each transparent/off-canvas neighbour; majority if several."""
    h, w = mask.shape
    cands = []
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        nx, ny = x + dx, y + dy
        ox, oy = x - dx, y - dy
        is_out = (not (0 <= nx < w and 0 <= ny < h)) or (not mask[ny, nx])
        is_in = (0 <= ox < w and 0 <= oy < h) and mask[oy, ox]
        if is_out and is_in:
            cands.append((ox, oy))
    if not cands:
        return None
    return collections.Counter(cands).most_common(1)[0][0]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def share_at(stand_x, room, spr, outline_pts, inward, mask):
    ox = stand_x - ANCHOR[0]
    oy = FEET - ANCHOR[1]
    n = n_out = n_max = 0
    ratios_out, ratios_max = [], []
    for x, y in outline_pts:
        rx, ry = ox + x, oy + y
        if not (0 <= rx < 480 and 0 <= ry < 270):
            continue
        bg = room[ry, rx, :3]
        fg = spr[y, x, :3]
        cr_o = contrast_ratio(fg, bg)
        inn = inward[(x, y)]
        cr_i = contrast_ratio(spr[inn[1], inn[0], :3], bg)
        cr_m = max(cr_o, cr_i)
        n += 1
        ratios_out.append(cr_o)
        ratios_max.append(cr_m)
        if cr_o >= 2:
            n_out += 1
        if cr_m >= 2:
            n_max += 1
    return {
        "n": n,
        "outline_only_ge2": n_out,
        "outline_only_pct": round(100.0 * n_out / n, 2) if n else None,
        "max_outline_one_in_ge2": n_max,
        "max_outline_one_in_pct": round(100.0 * n_max / n, 2) if n else None,
        "outline_min": round(min(ratios_out), 4) if ratios_out else None,
        "max_min": round(min(ratios_max), 4) if ratios_max else None,
        "outline_mean": round(sum(ratios_out) / n, 4) if n else None,
        "max_mean": round(sum(ratios_max) / n, 4) if n else None,
    }


def gate3_for(sprite_path: Path) -> dict:
    spr = np.array(Image.open(sprite_path).convert("RGBA"))
    mask = spr[:, :, 3] > 0
    bd = n4_outline(mask)
    ys, xs = np.where(bd)
    outline_pts = [(int(x), int(y)) for y, x in zip(ys, xs)]
    inward = {p: inward_of(mask, *p) for p in outline_pts}
    missing = [p for p, v in inward.items() if v is None]
    day_room = np.array(Image.open(ROOM_DAY).convert("RGBA"))
    eve_room = np.array(Image.open(ROOM_EVE).convert("RGBA"))
    spr_day = spr
    spr_eve = tint_evening(spr)
    day = share_at(STAND_X, day_room, spr_day, outline_pts, inward, mask)
    eve = share_at(STAND_X, eve_room, spr_eve, outline_pts, inward, mask)
    ys_o, xs_o = np.where(mask)
    return {
        "sprite": str(sprite_path),
        "sha256": sha256(sprite_path),
        "canvas": list(spr.shape[1::-1]),
        "opaque": int(mask.sum()),
        "opaque_bbox": [int(xs_o.min()), int(ys_o.min()), int(xs_o.max()), int(ys_o.max())],
        "outline_n": len(outline_pts),
        "inward_missing": len(missing),
        "stand_x": STAND_X,
        "feet": FEET,
        "anchor": list(ANCHOR),
        "placement": {"left": STAND_X - ANCHOR[0], "top": FEET - ANCHOR[1]},
        "rooms": {
            "daylight": str(ROOM_DAY.relative_to(REPO)),
            "evening": str(ROOM_EVE.relative_to(REPO)),
            "day_sha256": sha256(ROOM_DAY),
            "eve_sha256": sha256(ROOM_EVE),
        },
        "evening_multiply": list(MUL),
        "inward_rule": "N4: step opposite each transparent/off-canvas neighbour; if several, the majority inward pixel",
        "contrast_equation": "(Ymax+0.05)/(Ymin+0.05) WCAG relative luminance; background is the actual room pixel at the outline coordinate",
        "day": day,
        "evening": eve,
        "four_numbers_pct": {
            "day_outline_only": day["outline_only_pct"],
            "day_max_outline_one_in": day["max_outline_one_in_pct"],
            "evening_outline_only": eve["outline_only_pct"],
            "evening_max_outline_one_in": eve["max_outline_one_in_pct"],
        },
    }


def predicted_rim(sprite: np.ndarray, local_light: str = "right"):
    a = sprite[:, :, 3] > 0
    h, w = a.shape
    pad = 1
    H, W = h + 2, w + 2
    op = np.zeros((H, W), dtype=bool)
    op[1:h + 1, 1:w + 1] = a
    ys, xs = np.where(a)
    y0, y1 = int(ys.min()), int(ys.max())
    ext = np.zeros((H, W), dtype=bool)
    stack, seen = [], set()
    for x in range(W):
        stack += [(0, x), (H - 1, x)]
    for y in range(H):
        stack += [(y, 0), (y, W - 1)]
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
    ring = np.zeros((H, W), dtype=bool)
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
    return {"rim": rim, "ring": ring, "y0": y0, "y1": y1, "cutoff": cutoff, "pad": pad, "H": H, "W": W}


def summarize(crs):
    if not crs:
        return {"n": 0, "pct_ge_2": None, "pct_ge_1_5": None, "min": None, "mean": None, "max": None}
    n = len(crs)
    return {
        "n": n,
        "pct_ge_2": round(100.0 * sum(c >= 2.0 for c in crs) / n, 2),
        "pct_ge_1_5": round(100.0 * sum(c >= 1.5 for c in crs) / n, 2),
        "min": round(min(crs), 4),
        "mean": round(sum(crs) / n, 4),
        "max": round(max(crs), 4),
    }


def measure_rim(off, on, sprite):
    left = STAND_X - ANCHOR[0]
    top = FEET - ANCHOR[1]
    pred = predicted_rim(sprite, LOCAL_LIGHT)
    pad = pred["pad"]
    light_crs = []
    n_pred = n_match = extra = feet_hit = 0
    for Y, X in zip(*np.where(pred["rim"])):
        sx, sy = left + (X - pad), top + (Y - pad)
        if not (0 <= sx < NW and 0 <= sy < NH):
            continue
        n_pred += 1
        on_px, off_px = on[sy, sx], off[sy, sx]
        is_rim = tuple(int(v) for v in on_px) == RIM_RGB and not np.array_equal(on_px, off_px)
        if is_rim:
            n_match += 1
            light_crs.append(contrast_ratio(on_px, off_px))
    feet_y = top + pred["y1"]
    for sy in range(max(0, top - pad), min(NH, top + 116 + pad + 1)):
        for sx in range(max(0, left - pad), min(NW, left + 56 + pad + 1)):
            on_px, off_px = on[sy, sx], off[sy, sx]
            if tuple(int(v) for v in on_px) != RIM_RGB or np.array_equal(on_px, off_px):
                continue
            if sy >= feet_y:
                feet_hit += 1
            X, Y = (sx - left) + pad, (sy - top) + pad
            if not (0 <= Y < pred["H"] and 0 <= X < pred["W"] and pred["rim"][Y, X]):
                extra += 1
    ring_n = int(pred["ring"].sum())
    rim_n = int(pred["rim"].sum())
    return {
        "light_side_and_top": summarize(light_crs),
        "whole_silhouette_coverage": {
            "rim_pixels": rim_n,
            "outer_ring_candidates": ring_n,
            "percent": round(100.0 * rim_n / ring_n, 2) if ring_n else None,
        },
        "shot_vs_predicted": {
            "predicted_in_frame": n_pred,
            "shot_matched": n_match,
            "extra_shot_rim_not_predicted": extra,
            "shot_rim_on_or_below_feet_row": feet_hit,
        },
        "feet_row_native": feet_y,
        "top_cutoff_src_y": round(pred["cutoff"], 2),
        "light_side": LOCAL_LIGHT,
    }


def crop_x8(full, box):
    x0, y0, x1, y1 = box
    L, T = SX + x0 * SCALE, y0 * SCALE
    R, B = SX + (x1 + 1) * SCALE, (y1 + 1) * SCALE
    crop = full[T:B, L:R]
    im = Image.fromarray(crop)
    return im.resize((im.width * 2, im.height * 2), Image.Resampling.NEAREST)


def url(lit, rim):
    q = ["shot", "dev=1", "orient=landscape", "screen=style_trial_mom_a5c", "drawer=0"]
    if lit:
        q.append(f"lit={lit}")
    if rim is not None:
        q.append(f"rim={rim}")
    return f"{BASE}/?{'&'.join(q)}"


def sha_arr(arr):
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()[:16]


def main() -> int:
    OUT.mkdir(exist_ok=True)
    report = {
        "sprite_final": "A_r5c_12.png",
        "official_a4_untouched": True,
        "wangzi_claimed_x295": WANGZI_X295,
        "clean_stand_range": "x=291–327 from a_r5/standing_points.csv; x=295 is is_recommended",
    }
    g_r5c = gate3_for(SPRITE)
    report["gate3_r5c"] = g_r5c
    if SPRITE_R5.is_file():
        g_r5 = gate3_for(SPRITE_R5)
        report["gate3_r5_for_comparison"] = {
            "note": "A_r5_12.png, the sprite 王子's CSV was built from. Alpha matches r5c; 300 colour pixels differ.",
            "sha256": g_r5["sha256"],
            "four_numbers_pct": g_r5["four_numbers_pct"],
            "day": g_r5["day"],
            "evening": g_r5["evening"],
        }

    pages = {
        "evening_off": url("evening", "0"),
        "evening_on": url("evening", "1"),
        "day_off": url(None, "0"),
        "day_on": url(None, "1"),
    }
    shots, meta, errors = {}, {}, {}
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": SHOT[0], "height": SHOT[1]})
        for key, u in pages.items():
            cons, page_err = [], []

            def on_console(msg, cons=cons):
                if msg.type in ("error", "warning"):
                    cons.append({"type": msg.type, "text": msg.text})

            def on_err(err, page_err=page_err):
                page_err.append(str(err))

            page.on("console", on_console)
            page.on("pageerror", on_err)
            page.goto(u, wait_until="networkidle")
            page.wait_for_timeout(800)
            js = page.evaluate(
                """() => ({
                    ready: !!(window.STYLE_TRIAL_MOM_A5C),
                    lighting: window.STYLE_TRIAL_MOM_A5C && window.STYLE_TRIAL_MOM_A5C.lighting,
                    versions: window.STYLE_TRIAL_MOM_A5C && window.STYLE_TRIAL_MOM_A5C.versions
                      && window.STYLE_TRIAL_MOM_A5C.versions.map(v => ({id:v.id,x:v.x,src:v.src})),
                    rimFlag: window.RIM,
                    rimActive: typeof window.rimActive === 'function' ? window.rimActive() : null,
                    lightSide: typeof window.worldLightSide === 'function' ? window.worldLightSide() : null,
                    charRim: window.CHAR_RIM || null,
                    a4_still_r4: true
                })"""
            )
            png = page.locator("#sceneL").screenshot(type="png")
            im = Image.open(io.BytesIO(png)).convert("RGB")
            dest = OUT / f"rim_a5c_{key}.png"
            im.save(dest)
            arr = np.array(im)
            shots[key] = {
                "url": u, "path": str(dest.relative_to(REPO)),
                "size": list(im.size), "sha256_16": sha_arr(arr),
                "js": js, "console": cons, "pageerror": page_err,
            }
            meta[key] = arr
            errors[key] = {"console": cons, "pageerror": page_err}
            page.remove_listener("console", on_console)
            page.remove_listener("pageerror", on_err)
        browser.close()

    report["shots"] = shots
    report["identity"] = {
        "day_rim0_vs_rim1_identical": bool(np.array_equal(meta["day_off"], meta["day_on"])),
        "day_off_sha": shots["day_off"]["sha256_16"],
        "day_on_sha": shots["day_on"]["sha256_16"],
        "evening_rim0_vs_rim1_differ": not bool(np.array_equal(meta["evening_off"], meta["evening_on"])),
        "evening_off_sha": shots["evening_off"]["sha256_16"],
        "evening_on_sha": shots["evening_on"]["sha256_16"],
    }

    def native(full):
        scene = full[:, SX : SX + NW * SCALE]
        return scene.reshape(NH, SCALE, NW, SCALE, 3)[:, 0, :, 0, :].copy()

    sprite = np.array(Image.open(SPRITE).convert("RGBA"))
    report["rim_evening_x295"] = measure_rim(native(meta["evening_off"]), native(meta["evening_on"]), sprite)

    crops = {}
    for tag, box in (("face", FACE_BOX), ("hands", HANDS_BOX), ("legs", LEGS_BOX)):
        off_im = crop_x8(meta["evening_off"], box)
        on_im = crop_x8(meta["evening_on"], box)
        po = OUT / f"rim_a5c_evening_off_{tag}_x8.png"
        pn = OUT / f"rim_a5c_evening_on_{tag}_x8.png"
        off_im.save(po)
        on_im.save(pn)
        crops[tag] = {
            "native_box_inclusive": list(box),
            "evening_off": str(po.relative_to(REPO)),
            "evening_on": str(pn.relative_to(REPO)),
            "size": list(on_im.size),
        }
    report["crops_x8"] = crops
    report["js_ok"] = all(
        not v["pageerror"] and not any(c["type"] == "error" for c in v["console"])
        for v in errors.values()
    )
    report["js_errors"] = errors
    report["light_side"] = {
        "value": "right",
        "why": (
            "Living-room evening: the window is dusk-dark; lamps are on at both sides. "
            "The tall floor lamp on the right is the brightest region of room_evening "
            "and sits at head/shoulder height. The left table lamp is lower and smaller. "
            "x=295 is left of that floor lamp (and left of the table), so the character's "
            "lit side is still the right. World direction; a flip would keep the world-right side."
        ),
    }

    (OUT / "rim_a5c_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    brief = {
        "gate3_r5c": g_r5c["four_numbers_pct"] | {"n": g_r5c["outline_n"], "day_n": g_r5c["day"]["n"]},
        "gate3_r5_comparison": (report.get("gate3_r5_for_comparison") or {}).get("four_numbers_pct"),
        "wangzi_claimed": WANGZI_X295,
        "rim": report["rim_evening_x295"],
        "identity": report["identity"],
        "js_ok": report["js_ok"],
        "lightSide_js": shots["evening_on"]["js"].get("lightSide"),
        "versions": shots["evening_on"]["js"].get("versions"),
        "crops": {k: v["evening_on"] for k, v in crops.items()},
        "shots": {k: v["path"] for k, v in shots.items()},
    }
    print(json.dumps(brief, indent=2, ensure_ascii=False))
    ok = (
        report["js_ok"]
        and report["identity"]["day_rim0_vs_rim1_identical"]
        and report["identity"]["evening_rim0_vs_rim1_differ"]
        and report["rim_evening_x295"]["shot_vs_predicted"]["shot_rim_on_or_below_feet_row"] == 0
    )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
