#!/usr/bin/env python3
"""Copy old-style 240×135 vehicle art into Phone B and make labelled placeholders.
Does not modify originals. All copied art is 舊畫風; engine scales 2× nearest-neighbour.
Placeholder backgrounds have no sign text (王子 will redraw).
"""
from __future__ import annotations
import json, shutil
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path("/workspace/a-life-again-play")
DEST = ROOT / "assets/vehicles"
CAR1 = Path("/workspace/ala/r8_art/小弟/車子_v1/cleaned")
OVER = Path("/workspace/ala/r8_art/小弟/車子疊圖_v1/cleaned")
SCENES = Path("/workspace/ala/publish_r4_f09505f/assets/pixel/scenes")

# Default watchable set: m0 / c0 (red). compact in phone-stock == smallcar files.
VEHS = {
    "bike": "bicycle_m0_c0",
    "scooter": "scooter_m0_c0",
    "car": "smallcar_m0_c0",
}
TIMES = ("noon", "evening", "night")
SOURCES = []  # (dest_rel, src)

def cp(src: Path, dest: Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    SOURCES.append((str(dest.relative_to(ROOT)), str(src)))

def copy_vehicle_art():
    missing = []
    for key, stem in VEHS.items():
        kind = stem.split("_")[0]
        for t in TIMES:
            road = CAR1 / "road" / f"{stem}_{t}_strip.png"
            js = CAR1 / "road" / f"{stem}_{t}_strip.json"
            parked = CAR1 / "parked" / f"{stem}_{t}.png"
            for p, sub in ((road, "road"), (js, "road"), (parked, "parked")):
                if p.exists():
                    cp(p, DEST / sub / p.name)
                else:
                    missing.append(str(p))
            lights = CAR1 / "parked" / f"{stem}_{t}_lights.png"
            if lights.exists():
                cp(lights, DEST / "parked" / lights.name)
        # overlays (color-independent stems)
        if kind == "smallcar":
            for ov in ("passengers_p1", "passengers_p2", "passengers_p3", "wear"):
                for t in TIMES:
                    png = OVER / f"smallcar_m0_{ov}_{t}.png"
                    js = OVER / f"smallcar_m0_{ov}_{t}.json"
                    for p in (png, js):
                        if p.exists():
                            cp(p, DEST / "overlay" / p.name)
                        else:
                            missing.append(str(p))
        if kind == "scooter":
            for t in TIMES:
                png = OVER / f"scooter_m0_passengers_p1_{t}.png"
                js = OVER / f"scooter_m0_passengers_p1_{t}.json"
                for p in (png, js):
                    if p.exists():
                        cp(p, DEST / "overlay" / p.name)
                    else:
                        missing.append(str(p))
        if kind == "bicycle":
            for t in TIMES:
                for ov in ("wear",):
                    png = OVER / f"bicycle_m0_{ov}_{t}.png"
                    js = OVER / f"bicycle_m0_{ov}_{t}.json"
                    for p in (png, js):
                        if p.exists():
                            cp(p, DEST / "overlay" / p.name)
    # real backgrounds
    for name in (
        "street_normal_noon", "street_normal_evening", "street_normal_night",
        "menwai_normal_noon", "menwai_normal_evening", "menwai_normal_night",
    ):
        p = SCENES / f"{name}.png"
        if p.exists():
            cp(p, DEST / "bg" / f"{name}.png")
        else:
            missing.append(str(p))
    return missing

def fill(im, box, color):
    ImageDraw.Draw(im).rectangle(box, fill=color)

def pal(tod):
    if tod == "evening":
        return dict(sky=(152, 85, 71), sky2=(176, 110, 80), ground=(90, 70, 66),
                    road=(52, 40, 43), road2=(42, 31, 34), line=(120, 100, 80),
                    build=(88, 60, 58), trim=(64, 42, 40), water=(80, 70, 90),
                    sand=(160, 120, 90), tree=(50, 60, 40), stall=(120, 70, 50))
    if tod == "night":
        return dict(sky=(28, 30, 48), sky2=(40, 36, 60), ground=(48, 46, 52),
                    road=(30, 30, 36), road2=(20, 20, 26), line=(90, 80, 50),
                    build=(40, 38, 50), trim=(28, 26, 36), water=(30, 36, 60),
                    sand=(80, 70, 60), tree=(24, 32, 24), stall=(90, 50, 40))
    return dict(sky=(131, 191, 225), sky2=(150, 200, 230), ground=(128, 122, 116),
                road=(78, 78, 84), road2=(42, 40, 46), line=(200, 200, 190),
                build=(150, 130, 120), trim=(110, 90, 85), water=(70, 140, 180),
                sand=(210, 190, 150), tree=(60, 110, 70), stall=(180, 90, 70))

def base_scene(tod):
    p = pal(tod)
    im = Image.new("RGB", (240, 135), p["sky"])
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 239, 70), fill=p["sky"])
    # far band
    d.rectangle((0, 70, 239, 99), fill=p["build"] if tod != "noon" else (140, 160, 150))
    d.rectangle((0, 100, 239, 114), fill=p["road"])  # road / parking band (vehicle bottom ~102–114)
    d.rectangle((0, 115, 239, 134), fill=p["ground"])  # standing band, keep clear
    # dashed road line
    for x in range(4, 236, 16):
        d.rectangle((x, 106, x + 8, 107), fill=p["line"])
    return im, p

def make_office(tod):
    im, p = base_scene(tod)
    d = ImageDraw.Draw(im)
    # building block (no sign text)
    d.rectangle((8, 18, 100, 99), fill=p["build"])
    d.rectangle((8, 18, 100, 24), fill=p["trim"])
    for r in range(3):
        for c in range(4):
            d.rectangle((16 + c * 20, 32 + r * 18, 28 + c * 20, 44 + r * 18), fill=p["sky2"])
    # parking stalls (lines only, no numbers)
    d.rectangle((110, 100, 239, 114), fill=p["road2"])
    for x in range(118, 230, 24):
        d.line((x, 100, x, 114), fill=p["line"])
    return im

def make_beach(tod):
    im, p = base_scene(tod)
    d = ImageDraw.Draw(im)
    d.rectangle((0, 70, 239, 99), fill=p["water"])
    d.rectangle((0, 88, 239, 114), fill=p["sand"])
    d.rectangle((0, 115, 239, 134), fill=tuple(max(0, c - 20) for c in p["sand"]))
    # simple umbrella shapes, no text
    d.polygon([(40, 80), (20, 92), (60, 92)], fill=p["stall"])
    d.line((40, 92, 40, 110), fill=p["trim"])
    return im

def make_mountain(tod):
    im, p = base_scene(tod)
    d = ImageDraw.Draw(im)
    d.polygon([(0, 99), (50, 30), (110, 99)], fill=p["tree"])
    d.polygon([(80, 99), (150, 20), (220, 99)], fill=tuple(min(255, c + 20) for c in p["tree"]))
    d.polygon([(140, 20), (150, 8), (162, 24)], fill=(240, 240, 245) if tod != "night" else (200, 200, 210))
    d.rectangle((0, 100, 239, 114), fill=p["road"])
    return im

def make_market(tod):
    # night market is typically evening/night; still provide noon
    im, p = base_scene(tod if tod != "noon" else "evening")
    d = ImageDraw.Draw(im)
    # stall awnings as blank color blocks — no glyphs
    cols = [(180, 70, 60), (70, 120, 90), (80, 90, 170), (170, 130, 60), (140, 80, 120)]
    for i, c in enumerate(cols):
        x = 8 + i * 46
        d.rectangle((x, 58, x + 40, 99), fill=p["trim"])
        d.polygon([(x - 2, 58), (x + 20, 46), (x + 42, 58)], fill=c)
        if tod != "noon":
            d.rectangle((x + 8, 70, x + 14, 74), fill=(243, 200, 123))
    return im

def make_friend(tod):
    im, p = base_scene(tod)
    d = ImageDraw.Draw(im)
    # a different house from menwai, no nameplate text
    d.rectangle((140, 40, 220, 99), fill=p["build"])
    d.polygon([(134, 42), (180, 16), (226, 42)], fill=p["trim"])
    d.rectangle((168, 70, 188, 99), fill=p["road2"])
    d.rectangle((150, 52, 164, 66), fill=p["sky2"])
    d.rectangle((196, 52, 210, 66), fill=p["sky2"])
    d.rectangle((20, 80, 70, 99), fill=p["tree"])
    return im

def make_rain():
    im = Image.new("RGBA", (240, 135), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # sparse diagonal streaks
    for i, x0 in enumerate(range(-20, 260, 7)):
        y0 = (i * 13) % 20
        for y in range(y0, 135, 22):
            d.line((x0, y, x0 + 3, y + 8), fill=(200, 210, 220, 140))
    return im

def make_bus():
    # 6-frame strip, 56×20 each, facing right, no plate text
    fw, fh, n = 56, 20, 6
    im = Image.new("RGBA", (fw * n, fh), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(n):
        x = i * fw
        d.rounded_rectangle((x + 2, 2, x + 54, 16), radius=2, fill=(60, 90, 70))
        d.rectangle((x + 8, 4, x + 50, 10), fill=(160, 200, 210))
        # wheels rotate by shifting hub
        for wx in (x + 12, x + 40):
            d.ellipse((wx, 12, wx + 8, 19), fill=(30, 30, 34), outline=(80, 80, 84))
            if i % 2:
                d.point((wx + 4, 14), fill=(180, 180, 180))
            else:
                d.point((wx + 2, 16), fill=(180, 180, 180))
    return im, {"frames": 6, "frame_w": fw, "frame_h": fh, "fps": 8, "loop": True, "facing": "right", "placeholder": True}

def make_rider():
    im = Image.new("RGBA", (12, 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((3, 0, 8, 5), fill=(90, 60, 50))  # head
    d.rectangle((3, 6, 8, 13), fill=(50, 80, 120))  # torso
    d.rectangle((2, 13, 5, 17), fill=(40, 40, 50))
    d.rectangle((6, 13, 9, 17), fill=(40, 40, 50))
    d.rectangle((1, 7, 2, 11), fill=(90, 60, 50))  # arm to handlebar
    d.rectangle((9, 7, 11, 9), fill=(90, 60, 50))
    return im

def make_kid_seat():
    # overlay sized to smallcar 48×21, seat in the back (left side, facing right)
    im = Image.new("RGBA", (48, 21), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((8, 6, 16, 14), fill=(50, 70, 90, 220))
    d.rectangle((9, 4, 15, 8), fill=(70, 90, 110, 220))
    d.ellipse((10, 2, 14, 6), fill=(90, 60, 50, 230))  # child's head
    return im

def make_dents():
    im = Image.new("RGBA", (48, 21), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # small dark nicks along the body
    for box in ((18, 12, 21, 14), (30, 10, 33, 12), (40, 13, 42, 15), (12, 11, 14, 13)):
        d.rectangle(box, fill=(30, 20, 22, 180))
    return im

def darken_note_preview():
    pass

def save_ph(im, rel):
    p = DEST / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p)
    SOURCES.append((str(p.relative_to(ROOT)), "GENERATED_PLACEHOLDER"))

def make_placeholders():
    makers = {
        "office_park": make_office,
        "beach": make_beach,
        "mountain": make_mountain,
        "night_market": make_market,
        "friend_home": make_friend,
    }
    for name, fn in makers.items():
        for tod in TIMES:
            save_ph(fn(tod), f"bg/{name}_{tod}.png")
    save_ph(make_rain(), "placeholders/rain.png")
    bus, meta = make_bus()
    save_ph(bus, "placeholders/bus_strip.png")
    (DEST / "placeholders/bus_strip.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    SOURCES.append(("assets/vehicles/placeholders/bus_strip.json", "GENERATED_PLACEHOLDER"))
    save_ph(make_rider(), "placeholders/rider.png")
    save_ph(make_kid_seat(), "placeholders/kid_seat.png")
    save_ph(make_dents(), "placeholders/dents.png")

def write_config(missing):
    cfg = {
        "note": "舊畫風 240×135 素材。畫面以 2 倍最近鄰放大到 480×270。王子稍後會用 A 版重畫腳踏車、機車、小型車；路徑集中在這裡，方便整包替換。",
        "style": "old_240",
        "native": {"w": 240, "h": 135},
        "scale": 2,
        "fps": 8,
        "art_fps_authored": 10,
        "road_bottom_y_240": 102,
        "parked_bottom_y_240": 114,
        "type_map": {
            "bicycle": "bike",
            "scooter": "scooter",
            "compact": "car",
            "smallcar": "car",
            "hatchback": "car",
            "sedan": "car",
            "truck": "car",
            "van": "car",
            "suv": "car",
            "ev": "car",
            "sports": "car",
            "luxury": "car",
        },
        "default_art": {
            "bike": {"kind": "bicycle", "model": 0, "color": 0, "file_stem": "bicycle_m0_c0"},
            "scooter": {"kind": "scooter", "model": 0, "color": 0, "file_stem": "scooter_m0_c0"},
            "car": {"kind": "smallcar", "model": 0, "color": 0, "file_stem": "smallcar_m0_c0", "phone_stock_type": "compact"},
            "bus": {"kind": "bus", "placeholder": True, "file_stem": "bus"},
        },
        "paths": {
            "road": "assets/vehicles/road/{stem}_{time}_strip.png",
            "road_json": "assets/vehicles/road/{stem}_{time}_strip.json",
            "parked": "assets/vehicles/parked/{stem}_{time}.png",
            "parked_lights": "assets/vehicles/parked/{stem}_{time}_lights.png",
            "overlay": "assets/vehicles/overlay/{kind}_m{model}_{overlay}_{time}.png",
            "bg_street": "assets/vehicles/bg/street_normal_{time}.png",
            "bg_home": "assets/vehicles/bg/menwai_normal_{time}.png",
            "bg_office": "assets/vehicles/bg/office_park_{time}.png",
            "bg_weekend": "assets/vehicles/bg/{dest}_{time}.png",
            "rain": "assets/vehicles/placeholders/rain.png",
            "bus_strip": "assets/vehicles/placeholders/bus_strip.png",
            "rider": "assets/vehicles/placeholders/rider.png",
            "kid_seat": "assets/vehicles/placeholders/kid_seat.png",
            "dents": "assets/vehicles/placeholders/dents.png",
        },
        "placeholders": {
            "office_park": "辦公室停車場背景尚未有圖，占位（無招牌字）。王子會畫。",
            "beach": "海邊背景占位（無招牌字）。",
            "mountain": "山上背景占位（無招牌字）。",
            "night_market": "夜市背景占位（棚布無字）。",
            "friend_home": "朋友家背景占位（無門牌字）。",
            "bus": "公車尚未有行駛圖，占位。",
            "rider": "主角騎乘／等車尚無成人騎姿，占位小人。",
            "kid_seat": "後座兒童座椅尚無正式圖，占位。",
            "dents": "舊車凹痕占位疊圖。",
            "rain": "雨絲占位。車輛沒有雨刷格。",
            "smoke": "拋錨／舊車煙由程式畫，標「煙（占位）」。",
            "card_slot": "抵達後的卡片格是占位，文案等公主。",
        },
        "missing_originals": missing,
        "weekend_dests": ["beach", "mountain", "night_market", "friend"],
        "headlights": "evening uses night road strips / parked_*_lights when present (bicycle has no lights).",
        "wipers": False,
    }
    (DEST / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    lines = ["# Vehicle asset sources for Phone B commute (copies; originals untouched)", ""]
    for dest, src in SOURCES:
        lines.append(f"{dest}\t{src}")
    (DEST / "SOURCES.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("copied", len([s for s in SOURCES if s[1] != "GENERATED_PLACEHOLDER"]), "files")
    print("placeholders", len([s for s in SOURCES if s[1] == "GENERATED_PLACEHOLDER"]))
    print("missing", len(missing))
    for m in missing:
        print("  MISSING", m)

if __name__ == "__main__":
    missing = copy_vehicle_art()
    make_placeholders()
    write_config(missing)
