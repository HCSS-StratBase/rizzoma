#!/usr/bin/env python3
"""Read a rizzoma.com topic/blip using the DOCUMENTED legacy-editor technique.

Usage:  python3 rizzoma_read.py "<topic-or-blip-URL>" ["label to focus, e.g. feedback"]

Handles the gotchas that make naive Playwright fail:
  - .click()/force-click SILENTLY FAIL on Rizzoma's CSS-hidden buttons -> native in-page click.
  - content is folded by default -> unfold .js-fold-button (looped).
  - focus the SMALLEST .blip-thread containing the label (parents include children recursively).
  - mine embedded JSON {"t":"..."} runs as a fallback for content that won't unfold.
Outputs to stdout + /tmp/rizzoma_read_out.txt ; link map to /tmp/rizzoma_read_links.txt
"""
import sys, re, html
from playwright.sync_api import sync_playwright
SS = "/mnt/c/Rizzoma/scripts/rizzoma-session-state.json"

def main():
    if len(sys.argv) < 2:
        print("usage: rizzoma_read.py <url> [label]"); return 1
    url = sys.argv[1]; label = sys.argv[2] if len(sys.argv) > 2 else None
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(storage_state=SS, viewport={"width": 1500, "height": 1700})
        pg = ctx.new_page()
        pg.goto(url, wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(9000)
        # focus the smallest blip-thread containing the label (documented recipe)
        if label:
            found = pg.evaluate("""(lbl)=>{
              const ts=Array.from(document.querySelectorAll('.blip-thread'));
              const cs=ts.filter(t=>(t.innerText||'').includes(lbl))
                         .sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
              if(cs[0]){cs[0].scrollIntoView({block:'center'}); cs[0].click(); return true;}
              return false;}""", label)
            sys.stderr.write(f"focus '{label}': {found}\n"); pg.wait_for_timeout(1500)
        # unfold everything via NATIVE in-page click (Playwright .click() would fail)
        for _ in range(15):
            n = pg.evaluate("""()=>{let c=0;
              document.querySelectorAll('.js-fold-button.fold-button,.fold-button.folded,.js-fold-button.folded')
                .forEach(b=>{try{b.click();c++;}catch(e){}}); return c;}""")
            pg.wait_for_timeout(700)
            if not n: break
        pg.wait_for_timeout(2000)
        # readable text: focused thread if a label was given, else the content pane
        if label:
            txt = pg.evaluate("""(lbl)=>{
              const ts=Array.from(document.querySelectorAll('.blip-thread'))
                .filter(t=>(t.innerText||'').includes(lbl))
                .sort((a,b)=>(a.innerText||'').length-(b.innerText||'').length);
              return ts.slice(0,3).map(t=>t.innerText).join('\\n\\n--- next matching thread ---\\n\\n');}""", label)
        else:
            txt = pg.inner_text("body")
        # JSON-run mining fallback (full content even if folds resist)
        raw = pg.content()
        runs = re.findall(r'\{"t":"((?:[^"\\\\]|\\\\.)*)"', raw)
        mined = []
        for r in runs:
            try: s = bytes(r, "utf-8").decode("unicode_escape")
            except Exception: s = r
            s = html.unescape(s)
            if s.strip(): mined.append(s)
        links = re.findall(r'href="(/topic/[^"]+|https?://[^"]+)"', raw)
        open("/tmp/rizzoma_read_out.txt", "w", encoding="utf-8").write(txt + "\n\n===== MINED RUNS =====\n" + "\n".join(mined))
        open("/tmp/rizzoma_read_links.txt", "w", encoding="utf-8").write("\n".join(sorted(set(links))))
        print("=== TITLE:", (pg.title() or "")[:100])
        print("=== focused/visible text (chars %d) ===" % len(txt)); print(txt[:4000])
        print("\n(full mined content -> /tmp/rizzoma_read_out.txt ; links -> /tmp/rizzoma_read_links.txt)")
        b.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
