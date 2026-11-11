#!/usr/bin/env python3
"""Changing data/standing_points.csv must move the mom A r5c sprite."""
from __future__ import annotations

import http.server
import re
import shutil
import socketserver
import tempfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path("/usr/bin/google-chrome")
SKIP = {".git", "shots", "tests", "node_modules"}


def copy_tree(dst: Path) -> None:
    # Full tree: game boot pre-scans every screen in scenes.json and will
    # hang if fonts or cast assets are missing.
    for src in ROOT.iterdir():
        if src.name in SKIP:
            continue
        dest = dst / src.name
        if src.is_dir():
            shutil.copytree(src, dest, dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git"))
        else:
            shutil.copy2(src, dest)


def serve(root: Path):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def log_message(self, *args, **kwargs):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    port = httpd.server_address[1]
    return httpd, port


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="standing-points-"))
    try:
        copy_tree(tmp)
        httpd, port = serve(tmp)
        url = f"http://127.0.0.1:{port}/?dev=1&orient=landscape&screen=style_trial_mom_a5c"
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=str(CHROME) if CHROME.exists() else None,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("console", lambda msg: errors.append(f"console:{msg.type}:{msg.text}") if msg.type == "error" else None)
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            try:
                page.wait_for_function(
                    "() => window.STYLE_TRIAL_MOM_A5C && window.STYLE_TRIAL_MOM_A5C.versions && window.STYLE_TRIAL_MOM_A5C.versions[0]",
                    timeout=45000,
                )
            except Exception:
                print("page errors:", errors)
                print("activeKey", page.evaluate("() => window.activeKey || document.title"))
                raise
            x_before = page.evaluate("() => window.STYLE_TRIAL_MOM_A5C.versions[0].x")
            assert x_before == 295, f"expected CSV x=295 before edit, got {x_before}"

            csv_path = tmp / "data" / "standing_points.csv"
            text = csv_path.read_text(encoding="utf-8")
            new, n = re.subn(
                r"^mom_A_r5c,([^,]+),([^,]+),295,",
                r"mom_A_r5c,\1,\2,310,",
                text,
                count=1,
                flags=re.M,
            )
            assert n == 1, "failed to rewrite mom_A_r5c x in the temp CSV"
            csv_path.write_text(new, encoding="utf-8")

            page.reload(wait_until="networkidle", timeout=30000)
            page.wait_for_function(
                "() => window.STYLE_TRIAL_MOM_A5C && window.STYLE_TRIAL_MOM_A5C.versions && window.STYLE_TRIAL_MOM_A5C.versions[0]",
                timeout=20000,
            )
            x_after = page.evaluate("() => window.STYLE_TRIAL_MOM_A5C.versions[0].x")
            assert x_after == 310, f"after CSV edit, expected sprite x=310, got {x_after}"
            browser.close()
        httpd.shutdown()
        print("PASS changing the CSV moves the sprite on style_trial_mom_a5c (295 → 310)")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
