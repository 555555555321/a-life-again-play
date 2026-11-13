#!/usr/bin/env python3
"""dining_r4d art: frame count, size, anchor/ground row, front_mask alignment, palette 3349, binary alpha, sources."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / "data/dining_r4d.json").read_text(encoding="utf-8"))
PAL = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in (ROOT / "data/palette_3349.txt").read_text().split() if h.startswith("#")}


def load(rel: str) -> np.ndarray:
    return np.array(Image.open(ROOT / rel).convert("RGBA"))


def colours(a: np.ndarray) -> set:
    m = a[:, :, 3] > 0
    return {tuple(int(v) for v in px) for px in a[m][:, :3]}


def ok(name: str) -> None:
    print("PASS", name)


def main() -> int:
    assert len(PAL) == 3349, len(PAL)
    for kind in ("plate", "dining_fg"):
        for lit, rel in CFG[kind].items():
            a = load(rel)
            assert a.shape == (270, 480, 4), (rel, a.shape)
            assert set(np.unique(a[:, :, 3])) <= {0, 255}, rel
            if kind == "plate":
                assert (a[:, :, 3] == 255).all(), rel
            if lit == "daylight":
                off = colours(a) - PAL
                assert not off, (rel, sorted(off)[:5])
    day_fg, eve_fg = load(CFG["dining_fg"]["daylight"]), load(CFG["dining_fg"]["evening"])
    assert np.array_equal(day_fg[:, :, 3], eve_fg[:, :, 3])
    ok("plate/fg 480×270, binary alpha, day colours in 3349, evening fg has the day fg shape")

    for pose in CFG["poses"]:
        w, h = pose["canvas"]
        ax, ay = pose["anchor"]
        props = {tuple(int(x[i:i + 2], 16) for i in (1, 3, 5)) for x in (ROOT / pose["dir"] / "prop_colors.txt").read_text().split()}
        frames = sorted((ROOT / pose["dir"] / "frames").glob("f*.png"))
        fronts = sorted((ROOT / pose["dir"] / "front_mask").glob("f*.png"))
        assert len(frames) == pose["frames"] and [p.name for p in frames] == [p.name for p in fronts], pose["id"]
        spec = json.loads((ROOT / pose["dir"] / "person_spec.json").read_text(encoding="utf-8"))
        for fp, mp in zip(frames, fronts):
            s, m = load(str(fp.relative_to(ROOT))), load(str(mp.relative_to(ROOT)))
            tag = f"{pose['id']}/{fp.name}"
            assert s.shape == (h, w, 4) and m.shape == s.shape, tag
            assert set(np.unique(s[:, :, 3])) <= {0, 255} and set(np.unique(m[:, :, 3])) <= {0, 255}, tag + " semi-transparent"
            so, mo = s[:, :, 3] == 255, m[:, :, 3] == 255
            ys, xs = np.where(so)
            assert ys.max() == ay, (tag, "ground row", ys.max())
            assert ys.max() - ys.min() + 1 == spec["height_px"], (tag, "height")
            assert not so[:, 0].any() and not so[:, -1].any() and not so[0].any(), tag + " touches canvas side/top"
            assert so[ay, ax] or so[ay].any(), tag
            assert not (mo & ~so).any(), tag + " front_mask outside sprite"
            assert np.array_equal(m[mo][:, :3], s[mo][:, :3]), tag + " front_mask colours differ from sprite"
            off = (colours(s) | colours(m)) - PAL
            assert not off, (tag, sorted(off)[:5])
            char = colours(s) - props
            assert len(char) <= spec["max_colors"], (tag, len(char))
    ok("12 frames + 12 front_masks: sizes, ground row = anchor y, height, no edge contact, mask ⊆ sprite with equal colours, 3349, ≤ max_colors, binary alpha")

    mom = next(p for p in CFG["poses"] if p["id"] == "mom_place_chopsticks")
    chop = {(0x60, 0x40, 0x2C), (0x91, 0x7B, 0x51)}
    for i in range(mom["frames"]):
        s = load(f"{mom['dir']}/frames/f{i:02d}.png")
        longest = 0
        for y in range(60, 90):
            run = 0
            for x in range(s.shape[1]):
                run = run + 1 if s[y, x, 3] == 255 and tuple(int(v) for v in s[y, x, :3]) in chop else 0
                longest = max(longest, run)
        assert longest == 12, (i, longest)
    ok("mom chopsticks are 12 px in all 8 frames")

    src = ROOT / "assets/chars/SOURCES_dining_r4d_signed.txt"
    n = 0
    for line in src.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        _, rel, sha, _ = line.split("\t")
        assert hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() == sha, rel
        n += 1
    assert n == 33, n  # 4 rooms + you 10 + mom 18 + palette
    ok(f"SOURCES_dining_r4d_signed.txt sha256 matches {n} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
