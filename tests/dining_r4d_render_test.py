#!/usr/bin/env python3
"""dining_r4d in game: every frame, day and evening, equals an independent 4-layer composite pixel for pixel."""
from __future__ import annotations

import base64
import http.server
import io
import json
import socketserver
import threading
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("/usr/bin/google-chrome")
CFG = json.loads((ROOT / "data/dining_r4d.json").read_text(encoding="utf-8"))
MUL = (142, 115, 83)  # game.js STYLE_TRIAL_MOM_EVENING_MUL / stmTintEvening


def load(rel: str) -> np.ndarray:
    return np.array(Image.open(ROOT / rel).convert("RGBA"))


def tint(a: np.ndarray) -> np.ndarray:
    out = a.copy()
    m = out[:, :, 3] > 0
    for i, k in enumerate(MUL):
        out[:, :, i] = np.where(m, np.rint(a[:, :, i].astype(np.int32) * k / 255).astype(np.uint8), a[:, :, i])
    return out


def composite(lit: str, frame: int) -> np.ndarray:
    base = load(CFG["plate"][lit]).copy()
    fg = load(CFG["dining_fg"][lit])
    lay = []
    for p in CFG["poses"]:
        i = frame % p["frames"]
        s, m = load(f"{p['dir']}/frames/f{i:02d}.png"), load(f"{p['dir']}/front_mask/f{i:02d}.png")
        if lit == "evening":
            s, m = tint(s), tint(m)
        lay.append((s, m, p["x"] - p["anchor"][0], p["feet"] - p["anchor"][1]))
    for layer in CFG["layer_order"]:
        if layer == "plate":
            continue
        if layer == "dining_fg":
            o = fg[:, :, 3] == 255
            base[o] = fg[o]
            continue
        for s, m, left, top in lay:
            a = s if layer == "sprite" else m
            reg = base[top:top + a.shape[0], left:left + a.shape[1]]
            o = a[:, :, 3] == 255
            reg[o] = a[o]
    return base[:, :, :3]


def serve(root: Path):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def log_message(self, *args, **kwargs):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def main() -> int:
    httpd, port = serve(ROOT)
    errors: list[str] = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=str(CHROME) if CHROME.exists() else None, args=["--force-color-profile=srgb"])
            for lit in ("daylight", "evening"):
                for frame in range(8):
                    page = browser.new_page(viewport={"width": 1080, "height": 2340})
                    page.on("pageerror", lambda e: errors.append(str(e)))
                    url = f"http://127.0.0.1:{port}/?dev=1&orient=portrait&screen=dining_r4d&frame={frame}" + ("&lit=evening" if lit == "evening" else "")
                    page.goto(url)
                    page.wait_for_function("() => window.DINING_R4D && window.DINING_R4D.frames", timeout=20000)
                    page.wait_for_timeout(200)
                    info = page.evaluate("() => window.DINING_R4D")
                    assert info["layer_order"] == CFG["layer_order"]
                    assert [(q["x"], q["feet"]) for q in info["poses"]] == [(200, 252), (319, 252)], info["poses"]
                    assert info["frames"] == [frame % 4, frame % 8], info["frames"]
                    data = page.evaluate("() => document.getElementById('sceneP').toDataURL('image/png')")
                    got = np.array(Image.open(io.BytesIO(base64.b64decode(data.split(",")[1]))).convert("RGB"))
                    want = composite(lit, frame)
                    diff = int(np.any(got != want, axis=2).sum())
                    assert diff == 0, (lit, frame, diff)
                    page.close()
            browser.close()
    finally:
        httpd.shutdown()
    assert not errors, errors
    print("PASS dining_r4d in game: 16 renders (day/evening × frame 0–7) equal the 4-layer composite, 0 px diff")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
