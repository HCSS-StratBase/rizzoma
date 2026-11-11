# Skill: How to Post on Rizzoma

## Prerequisites
- You must use the authenticated browser session state located at: `/mnt/c/Rizzoma/scripts/rizzoma-session-state.json`. Do not attempt interactive SSO.
- Rizzoma heavily relies on **Fractal Bullets (BLB)**. Flat paragraphs are strictly forbidden. Every blip, node, or section must be a bulleted list of further atomic labels, recursively.

## Core Rules for Posting
1. **Fractal Bullet Structure Required:**
   - In the Rizzoma editor, a freshly-`Ctrl+Enter`'d subblip starts as `<div><br></div>`.
   - **The FIRST action must be the bullet-list toggle.** Click the `≡` toolbar button before typing.
   - Verify the HTML shows `<ul><li>` before clicking Done.
   - `[+]` subblips can only anchor to list items that become their Label. Paragraphs have no anchor.

2. **Interacting with the UI:**
   - Slowness is per-Playwright-launch, not Rizzoma. Reuse the page across multiple actions.
   - For CSS-hidden Rizzoma toolbar buttons, use `dispatch_event('click')` instead of `.click(force=True)` (which will be rejected).
   - If Rizzoma asks "Delete reply?", auto-accept the dialog: 
     ```python
     page.on("dialog", lambda d: d.accept())
     ```

3. **Autosave Timing:**
   - Rizzoma autosaves on-the-fly.
   - Wait ~1.5s after making changes to ensure the autosave completes and state (like the is-folded-by-default flag) persists.

## Execution Pattern (Python Playwright Example)
```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(storage_state="/mnt/c/Rizzoma/scripts/rizzoma-session-state.json")
    page = context.new_page()
    
    # Auto-accept dialogs
    page.on("dialog", lambda d: d.accept())
    
    page.goto("https://rizzoma.com/topic/TARGET_TOPIC_ID/")
    page.wait_for_timeout(5000)
    
    # Example: Creating a new bulleted reply
    # 1. Trigger reply (Ctrl+Enter or click)
    # 2. Toggle Bullet List! (CRITICAL)
    page.locator('button.toolbar-bullet-list').dispatch_event('click')
    
    # 3. Type content
    page.keyboard.type("My new bullet point")
    
    # 4. Wait for autosave
    page.wait_for_timeout(1500)
    
    browser.close()
```
