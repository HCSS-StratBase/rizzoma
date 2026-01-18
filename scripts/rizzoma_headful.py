#!/usr/bin/env python3
"""
Headful Playwright helper to log into Rizzoma manually (e.g., Google SSO).

How it works:
- Launches Chromium with a persistent user data dir so cookies/sessions survive.
- Opens the provided start URL and pauses for you to complete auth.
- On exit, writes storage state to a JSON file for reuse in automated runs.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Open a headed Chromium window for manual Rizzoma login."
    )
    parser.add_argument(
        "--start-url",
        default="https://www.rizzoma.com/topic/",
        help="URL to open first (default: %(default)s)",
    )
    parser.add_argument(
        "--user-data-dir",
        default=str(
            Path("C:/Users") if Path("C:/Users").exists() else Path("/tmp")
        )
        + "/rizzoma-headful-profile",
        help="Persistent Chromium profile dir to keep cookies/sessions (default: %(default)s)",
    )
    parser.add_argument(
        "--storage-state",
        default=str(Path("scripts/rizzoma-session-state.json")),
        help="Path to write Playwright storageState JSON on exit (default: %(default)s)",
    )
    parser.add_argument(
        "--width", type=int, default=1440, help="Viewport width (default: %(default)s)"
    )
    parser.add_argument(
        "--height", type=int, default=900, help="Viewport height (default: %(default)s)"
    )
    parser.add_argument(
        "--channel",
        choices=["chromium", "chrome"],
        default="chromium",
        help="Browser channel to launch (default: %(default)s). Use 'chrome' to leverage system Chrome for Google SSO.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    profile_path = Path(args.user_data_dir)
    storage_state_path = Path(args.storage_state)
    profile_path.mkdir(parents=True, exist_ok=True)
    storage_state_path.parent.mkdir(parents=True, exist_ok=True)

    print(
        f"\nLaunching headed Chromium with persistent profile at {profile_path}..."
        "\nIf you are on Linux without a display, start Xvfb first:"
        "\n  Xvfb :99 -screen 0 1440x900x24 & export DISPLAY=:99\n"
    )

    with sync_playwright() as p:
        launch_kwargs = {
            "user_data_dir": str(profile_path),
            "headless": False,
            "viewport": {"width": args.width, "height": args.height},
        }
        if args.channel != "chromium":
            launch_kwargs["channel"] = args.channel

        context = p.chromium.launch_persistent_context(**launch_kwargs)
        page = context.pages[0] if context.pages else context.new_page()
        try:
            print(f"Navigating to {args.start_url} ...")
            page.goto(args.start_url, wait_until="load", timeout=120_000)
        except PlaywrightTimeoutError:
            print("Warning: initial navigation timed out; you can still try manually.")

        print(
            "\nBrowser is ready. Complete your login (Google SSO, etc.) manually."
            "\nWhen you can see your waves, return here and press Enter to save the session."
        )
        try:
            input()
        except KeyboardInterrupt:
            print("\nInterrupted before saving session; exiting.")
            return 1

        print("\nSaving storage state...")
        context.storage_state(path=str(storage_state_path))
        print(
            f"Done. Profile persisted at {profile_path} and storageState at {storage_state_path}."
            "\nYou can reuse this session in Playwright like:"
            f"\n  const {{ chromium }} = require('playwright');"
            f"\n  const context = await chromium.launchPersistentContext('{profile_path}', {{ headless: false }});"
            f"\n  // or: await chromium.launch({{ headless: true }}) then context = await browser.newContext({{ storageState: '{storage_state_path}' }});"
        )

        print("\nClosing browser. Re-run this script anytime to refresh the session.")
        context.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
