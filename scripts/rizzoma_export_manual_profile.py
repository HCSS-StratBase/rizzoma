#!/usr/bin/env python3
"""
Export Playwright storage state from an existing Chrome profile (manual login).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Playwright storageState from an existing Chrome profile.")
    parser.add_argument("--profile-dir", required=True, help="Path to the Chrome profile directory that already contains a logged-in session.")
    parser.add_argument("--out", required=True, help="Path to write storageState JSON.")
    parser.add_argument(
        "--channel",
        choices=["chrome", "chromium"],
        default="chrome",
        help="Browser channel to use (default: %(default)s)",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run headless (default: headed, which is more reliable for Chrome with persistent profiles).",
    )
    parser.add_argument(
        "--url",
        default="https://www.rizzoma.com/topic/",
        help="URL to open to validate session (default: %(default)s)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    profile_path = Path(args.profile_dir)
    out_path = Path(args.out)
    if not profile_path.exists():
        print(f"Profile directory not found: {profile_path}")
        return 1
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_path),
            headless=args.headless is True,
            channel=args.channel if args.channel != "chromium" else None,
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            page.goto(args.url, wait_until="networkidle", timeout=60_000)
            print("URL:", page.url)
            print("Title:", page.title())
            try:
                print("Body snippet:", page.inner_text("body")[:200])
            except Exception:
                pass
        except Exception as e:  # noqa: BLE001
            print("Navigation error:", e)
        context.storage_state(path=str(out_path))
        context.close()
    print(f"Saved storage state to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
