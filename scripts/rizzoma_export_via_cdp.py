#!/usr/bin/env python3
"""
Connect to an already running Chrome via CDP and export storage state.
Assumes Chrome was started with --remote-debugging-port (e.g., 9222) and the target page is open.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export storageState by connecting to Chrome over CDP.")
    parser.add_argument("--cdp-url", required=True, help="CDP URL, e.g., http://localhost:9222")
    parser.add_argument(
        "--out",
        default="scripts/rizzoma-session-state.json",
        help="Path to write storageState JSON (default: %(default)s)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(args.cdp_url)
        if not browser.contexts:
            print("No contexts found on the connected browser.")
            return 1
        context = browser.contexts[0]
        try:
            page = context.pages[0] if context.pages else context.new_page()
            print("URL:", page.url)
            print("Title:", page.title())
            try:
                print("Body snippet:", page.inner_text("body")[:200])
            except Exception:
                pass
        except Exception as e:  # noqa: BLE001
            print("Navigation check error:", e)
        context.storage_state(path=str(out_path))
        browser.close()
    print(f"Saved storage state to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
