#!/usr/bin/env python3
"""Canonical Rizzoma POSTING engine — spec-driven, battle-tested mechanics.

DO NOT hand-roll Playwright for Rizzoma posting. This engine carries every
hard-won guard from the 2026-06-12 sessions (HTU Progress entry + repairs):
  - scope-checked edit entry (aborts on wrong blip — has saved live team content)
  - thread-safe LI insertion ONLY via S12 split-at-START (Enter at end of a
    thread-bearing LI STEALS its reply thread — that bug hit Hryhorii's reply)
  - LI-text-rect clicking (container-edge clicks activate neighboring blips)
  - VIEW-state Ctrl+Enter with pixel caret guard + x/Backspace unblock
  - bullet-toggle verification BEFORE typing (else children become <div>s)
  - fold-by-default (Hide) on the new child; reload-verify as ground truth

Usage:
  python3 rizzoma_post.py spec.json

Operations (one spec = one mode; all idempotent):
1. CORE — edit an existing subblip (the original battle-tested path):
   {"topic": "...", "unfold_path": ["Progress","260612"], "target_first_li": "first LI text...",
    "insert_li": {"text": "new line", "before": "existing LI"},      // thread-safe split-at-start
    "child": {"on": "an LI", "bullets": ["...", "..."]},             // folded [+] child
    "verify": ["needle", ...]}
2. NEW-TOPIC SKELETON (added by Codex 2026-06-12, reviewed+blessed by Claude same day):
   {"topic": "...", "template": "standard-topic", "hashtags": ["#HCSS","#RuBase"],
    "children": {"Oneliner": ["..."], ...}}      // seeds root labels + folded [+] children
3. HASHTAGS ONLY:  {"topic": "...", "operation": "hashtags", "hashtags": [...]}
4. POPULATE EXISTING SKELETON:  {"topic": "...", "operation": "populate-standard-topic",
    "labels": ["Progress"], "children": {"Progress": ["..."]}}
Run content_gate.py on bullets BEFORE any write; run structure_probe.py on the topic AFTER.
Per SECTION CONTRACTS: the default skeleton has NO Methodology section (house topics fold
method into Research design); pass explicit labels to add one deliberately.
"""
import json, sys
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

STATE = "/mnt/c/Rizzoma/scripts/rizzoma-session-state.json"
# Default skeleton per SECTION CONTRACTS: NO Methodology (Research design IS the methodology).
STANDARD_TOPIC_LABELS = ["Oneliner", "Relevant links", "Research design", "Progress"]
ALLOWED_TOPIC_LABELS = STANDARD_TOPIC_LABELS + ["Background", "Methodology"]
STANDARD_TOPIC_CHILDREN = {lbl: ["To be filled."] for lbl in STANDARD_TOPIC_LABELS}
def special(t): return any(c in t for c in '#@~$*<>')

DIRECT_TEXT = """const directText=(li)=>{let s='';for(const c of li.childNodes){if(c.nodeType===1&&c.classList?.contains('blip-thread'))break;s+=c.textContent||'';}return s.trim();};"""
ROOT_LIS = """const rootLis=(ed)=>[...(ed?.querySelectorAll('li')||[])].filter(li=>{let p=li.parentElement;while(p&&p!==ed){if(p.classList?.contains('blip-thread'))return false;p=p.parentElement;}return true;});"""

def main():
    spec = json.load(open(sys.argv[1]))
    TOPIC = spec["topic"]; FIRST = spec.get("target_first_li")
    ins = spec.get("insert_li"); child = spec.get("child")

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(storage_state=STATE, viewport={"width": 1500, "height": 1700})
        pg = ctx.new_page()
        pg.on("dialog", lambda d: d.accept())

        def nav_unfold():
            ok = False
            last_state = None
            for attempt in range(4):
                try:
                    pg.goto(TOPIC, wait_until="domcontentloaded", timeout=60000)
                except PlaywrightTimeoutError:
                    last_state = {"title": pg.title() if not pg.is_closed() else "", "hasRoot": False,
                                  "maintenance": False, "bodyStart": "goto timeout"}
                    pg.wait_for_timeout(2500)
                    continue
                pg.wait_for_timeout(9000 + attempt * 2500)
                last_state = pg.evaluate("""()=>({
                    title: document.title,
                    hasRoot: !!document.querySelector('.root-blip'),
                    maintenance: document.body.innerText.includes('small maintenance'),
                    bodyStart: document.body.innerText.slice(0,120)
                })""")
                ok = bool(last_state["hasRoot"] and not last_state["maintenance"])
                if ok:
                    break
                pg.wait_for_timeout(1500)
            assert ok, f"topic did not load into editable Rizzoma view: {last_state}"
            for lbl in spec.get("unfold_path", []):
                r = pg.evaluate("""(L)=>{""" + DIRECT_TEXT + """
                    const li=[...document.querySelectorAll('li')].find(l=>directText(l)===L);
                    const th=li?.querySelector(':scope .blip-thread');
                    if(!th) return 'fail';
                    if(th.classList.contains('folded')) th.querySelector('.js-fold-button')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
                    return 'ok';
                }""", lbl)
                assert r == 'ok', f"unfold_path label not found: {lbl}"
                pg.wait_for_timeout(1800)
            # defensive: close any stray edit-mode blips left by earlier runs
            pg.evaluate("""()=>{[...document.querySelectorAll('.blip-container.edit-mode')].forEach(bc=>{bc.querySelector('button[title^="Done"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});}""")
            pg.wait_for_timeout(1000)

        def root_labels():
            return pg.evaluate("""()=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const root=document.querySelector('.root-blip');
                const ed=root?.querySelector('.js-editor.editor');
                return rootLis(ed).map(li=>directText(li));
            }""")

        def click_visible_change_mode(prefix):
            box = pg.evaluate("""(prefix)=>{
                const btn=[...document.querySelectorAll('button.js-change-mode')]
                  .filter(b=>b.offsetParent!==null)
                  .find(b=>(b.getAttribute('title')||'').startsWith(prefix));
                if(!btn) return null;
                btn.scrollIntoView({block:'center'});
                const r=btn.getBoundingClientRect();
                return {x:r.left+r.width/2,y:r.top+r.height/2,title:btn.getAttribute('title'),text:btn.innerText};
            }""", prefix)
            assert box, f"visible change-mode button not found: {prefix}"
            pg.mouse.click(box["x"], box["y"])
            pg.wait_for_timeout(2200)

        def enter_root_edit():
            click_visible_change_mode("To edit mode")
            ed = pg.evaluate("""()=>{
                const e=[...document.querySelectorAll('.js-editor.editor')]
                  .find(x=>x.getAttribute('contenteditable')==='true' && !x.classList.contains('container-blip-editor'));
                return e ? {tag:e.tagName, text:(e.innerText||'').trim().slice(0,200)} : null;
            }""")
            assert ed, "root editable editor not found after Edit"

        def done_root_edit():
            click_visible_change_mode("Done")
            pg.wait_for_timeout(3500)

        def ensure_root_hashtags(tags):
            if not tags:
                return
            line = " ".join(tags)
            nav_unfold()
            if pg.evaluate("(line)=>document.querySelector('.root-blip')?.innerText.includes(line)", line):
                print("template: hashtags already exist — skip", flush=True)
                return
            enter_root_edit()
            pg.evaluate("""()=>{
                const ed=[...document.querySelectorAll('.js-editor.editor')]
                  .find(x=>x.getAttribute('contenteditable')==='true' && !x.classList.contains('container-blip-editor'));
                const w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);
                const first=w.nextNode();
                if(!first) throw new Error('no root title text node');
                const r=document.createRange(); r.selectNodeContents(first); r.collapse(false);
                const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
                ed.focus();
            }""")
            pg.keyboard.press("Enter")
            pg.wait_for_timeout(250)
            pg.keyboard.insert_text(line)
            pg.wait_for_timeout(250)
            done_root_edit()
            nav_unfold()
            ok = pg.evaluate("(line)=>document.querySelector('.root-blip')?.innerText.includes(line)", line)
            assert ok, f"hashtags did not persist: {line}"
            print(f"template: inserted hashtags {line}", flush=True)

        def seed_standard_root_labels(labels):
            existing = root_labels()
            if all(lbl in existing for lbl in labels):
                print("template: root labels already exist — skip seed", flush=True)
                return
            assert not existing, f"root already has non-template LIs; refusing to overwrite: {existing}"
            enter_root_edit()
            pg.evaluate("""()=>{
                const ed=[...document.querySelectorAll('.js-editor.editor')]
                  .find(x=>x.getAttribute('contenteditable')==='true' && !x.classList.contains('container-blip-editor'));
                const w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);
                let last=null,n; while((n=w.nextNode())) last=n;
                if(!last) throw new Error('no root title text node');
                const r=document.createRange(); r.selectNodeContents(last); r.collapse(false);
                const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
                ed.focus();
            }""")
            pg.keyboard.press("Enter"); pg.wait_for_timeout(300)
            pg.evaluate("""()=>{
                const b=[...document.querySelectorAll('button.js-make-bulleted-list')]
                  .filter(x=>x.offsetParent!==null && !/hidden/.test(x.className))[0];
                if(!b) throw new Error('visible bulleted-list button not found');
                b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""")
            pg.wait_for_timeout(700)
            for i, label in enumerate(labels):
                pg.keyboard.type(label, delay=10)
                pg.wait_for_timeout(100)
                if i < len(labels) - 1:
                    pg.keyboard.press("Enter")
                    pg.wait_for_timeout(100)
            got = pg.evaluate("""()=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const ed=[...document.querySelectorAll('.js-editor.editor')]
                  .find(x=>x.getAttribute('contenteditable')==='true' && !x.classList.contains('container-blip-editor'));
                return rootLis(ed).map(li=>directText(li));
            }""")
            assert got[-len(labels):] == labels, f"root seed scope failed: {got}"
            done_root_edit()
            nav_unfold()
            got = root_labels()
            assert got[-len(labels):] == labels, f"root labels did not persist cleanly: {got}"
            print("template: seeded root labels", flush=True)

        def label_caret_point(label):
            return pg.evaluate("""(label)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const root=document.querySelector('.root-blip');
                const ed=root?.querySelector('.js-editor.editor');
                const li=rootLis(ed).find(l=>directText(l)===label);
                if(!li) return null;
                if(li.querySelector(':scope .blip-thread')) return {exists:true};
                const texts=[]; const w=document.createTreeWalker(li,NodeFilter.SHOW_TEXT);
                let n; while((n=w.nextNode())) {
                    const t=n.parentElement.closest('.blip-thread');
                    if(t && li.contains(t)) continue;
                    if(n.textContent.trim()) texts.push(n);
                }
                const tn=texts[texts.length-1];
                if(!tn) return null;
                li.scrollIntoView({block:'center'});
                const r=document.createRange();
                r.setStart(tn,Math.max(0,tn.textContent.length-1));
                r.setEnd(tn,tn.textContent.length);
                const rect=r.getBoundingClientRect();
                return {exists:false,x:rect.right-1,y:rect.top+rect.height/2};
            }""", label)

        def populate_existing_root_child(label, bullets):
            print(f"template: populate start {label}", flush=True)
            nav_unfold()
            info = pg.evaluate("""(label)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const root=document.querySelector('.root-blip');
                const ed=root?.querySelector('.js-editor.editor');
                const li=rootLis(ed).find(l=>directText(l)===label);
                const th=li?.querySelector(':scope .blip-thread');
                if(!li || !th) return {ok:false, reason:'missing li/thread'};
                if(th.classList.contains('folded')) {
                    const fb=th.querySelector('.js-fold-button,.fold-button');
                    if(!fb) return {ok:false, reason:'missing fold button'};
                    fb.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                }
                return {ok:true};
            }""", label)
            assert info.get("ok"), f"cannot unfold root child for {label}: {info}"
            print(f"template: unfolded {label}", flush=True)
            pg.wait_for_timeout(3500)

            marked = None
            for _ in range(6):
                marked = pg.evaluate("""(label)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                    document.querySelectorAll('[data-rz-populate-target]').forEach(e=>e.removeAttribute('data-rz-populate-target'));
                    const root=document.querySelector('.root-blip');
                    const ed=root?.querySelector('.js-editor.editor');
                    const li=rootLis(ed).find(l=>directText(l)===label);
                    const th=li?.querySelector(':scope .blip-thread');
                    const bcs=[...(th?.querySelectorAll('.blip-container')||[])].filter(bc=>!bc.classList.contains('root-blip'));
                    const bc=bcs[0];
                    if(!bc) return {ok:false, reason:'no child blip rendered', count:bcs.length, html:th?.innerHTML.slice(0,300)};
                    bc.setAttribute('data-rz-populate-target','1');
                    const ed2=[...bc.querySelectorAll('.js-editor.editor')].find(e=>{
                        let c=e.parentElement;
                        while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                        return true;
                    });
                    const r=(ed2||bc).getBoundingClientRect();
                    return {ok:true, text:(ed2?.innerText||bc.innerText||'').trim(), x:r.left+Math.min(20, Math.max(2,r.width/2)), y:r.top+Math.min(20, Math.max(2,r.height/2))};
                }""", label)
                if marked.get("ok"):
                    break
                pg.wait_for_timeout(1500)
            assert marked and marked.get("ok"), f"child blip did not render for {label}: {marked}"
            print(f"template: child rendered {label}: {marked.get('text','')[:80]!r}", flush=True)
            # "already populated" must be STRUCTURAL (proper LIs), never substring: autosaved
            # debris from aborted runs can hold the text as flat <div>s and still need repair.
            n_lis = pg.evaluate("""()=>{
                const bc=document.querySelector('[data-rz-populate-target]');
                const ed=[...(bc?.querySelectorAll('.js-editor.editor')||[])].find(e=>{
                    let c=e.parentElement;
                    while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                    return true;
                });
                return ed ? ed.querySelectorAll(':scope > li').length : 0;
            }""")
            if n_lis >= len(bullets) and bullets[0] in (marked.get("text") or ""):
                print(f"template: {label} child already populated — skip", flush=True)
                # Re-fold the parent section if needed.
                pg.evaluate("""(label)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                    const root=document.querySelector('.root-blip');
                    const ed=root?.querySelector('.js-editor.editor');
                    const li=rootLis(ed).find(l=>directText(l)===label);
                    const th=li?.querySelector(':scope .blip-thread');
                    if(th && !th.classList.contains('folded')) th.querySelector('.js-fold-button,.fold-button')?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                }""", label)
                pg.wait_for_timeout(1500)
                return

            pg.mouse.click(marked["x"], marked["y"])
            pg.wait_for_timeout(1500)
            print(f"template: clicked child {label}", flush=True)
            pg.evaluate("""()=>{
                const bc=document.querySelector('[data-rz-populate-target]');
                if(!bc) throw new Error('target child missing');
                const btn=[...bc.querySelectorAll('button.js-change-mode')]
                  .find(b=>(b.getAttribute('title')||'').startsWith('To edit mode'));
                if(!btn) throw new Error('child Edit button missing');
                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""")
            pg.wait_for_timeout(2500)
            print(f"template: edit mode {label}", flush=True)
            state = pg.evaluate("""()=>{
                const bc=document.querySelector('[data-rz-populate-target]');
                const ed=[...(bc?.querySelectorAll('.js-editor.editor')||[])].find(e=>{
                    let c=e.parentElement;
                    while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                    return true;
                });
                return ed ? {text:(ed.innerText||'').trim(), tag:ed.tagName, html:ed.innerHTML.slice(0,300)} : null;
            }""")
            assert state is not None, f"child editor missing for {label}"
            if state["text"] and bullets[0] not in state["text"]:
                raise AssertionError(f"refusing to overwrite non-empty {label} child: {state['text'][:120]!r}")
            if not state["text"]:
                pg.evaluate("""()=>{
                    const bc=document.querySelector('[data-rz-populate-target]');
                    const ed=[...(bc?.querySelectorAll('.js-editor.editor')||[])].find(e=>{
                        let c=e.parentElement;
                        while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                        return true;
                    });
                    ed.focus();
                    const r=document.createRange(); r.selectNodeContents(ed); r.collapse(true);
                    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
                    const btn=[...bc.querySelectorAll('button.js-make-bulleted-list,button[title="Bulleted list"]')]
                      .filter(x=>!x.className.includes('hidden'))[0] || bc.querySelector('button.js-make-bulleted-list,button[title="Bulleted list"]');
                    if(!btn) throw new Error('child bullet button missing');
                    btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                }""")
                pg.wait_for_timeout(700)
                print(f"template: bullets enabled {label}", flush=True)
                ul = pg.evaluate("""()=>{
                    const bc=document.querySelector('[data-rz-populate-target]');
                    const ed=[...(bc?.querySelectorAll('.js-editor.editor')||[])].find(e=>{
                        let c=e.parentElement;
                        while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                        return true;
                    });
                    return ed ? {tag:ed.tagName, first:ed.firstElementChild?.tagName, text:(ed.innerText||'').trim()} : null;
                }""")
                assert ul and (ul["tag"] == "UL" or ul["first"] == "LI"), f"bullets not active for existing child of {label}: {ul}"
                for i, bullet in enumerate(bullets):
                    if special(bullet): pg.keyboard.insert_text(bullet)
                    else: pg.keyboard.type(bullet, delay=8)
                    if i < len(bullets) - 1:
                        pg.keyboard.press("Enter")
                    pg.wait_for_timeout(120)
                print(f"template: typed {label}", flush=True)

            n_ok = pg.evaluate("""(first)=>{
                const bc=document.querySelector('[data-rz-populate-target]');
                const ed=[...(bc?.querySelectorAll('.js-editor.editor')||[])].find(e=>{
                    let c=e.parentElement;
                    while(c&&c!==bc){ if(c.classList?.contains('blip-container')) return false; c=c.parentElement; }
                    return true;
                });
                return ed ? {n:ed.querySelectorAll(':scope > li').length, text:(ed.innerText||'').trim()} : null;
            }""", bullets[0])
            assert n_ok and n_ok["n"] == len(bullets), f"typed child count failed for {label}: {n_ok}"
            pg.evaluate("""()=>{
                const bc=document.querySelector('[data-rz-populate-target]');
                const done=[...bc.querySelectorAll('button[title^="Done"]')][0];
                if(!done) throw new Error('child Done not found');
                done.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""")
            pg.wait_for_timeout(3000)
            print(f"template: done clicked {label}", flush=True)
            # Hide/fold the child itself by default, then fold the root section closed again.
            pg.evaluate("""(label)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const bc=document.querySelector('[data-rz-populate-target]');
                const hide=[...bc.querySelectorAll('button.js-is-folded-by-default')]
                  .filter(x=>!x.className.includes('hidden'))[0] || bc.querySelector('button.js-is-folded-by-default');
                if(hide) hide.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
                const root=document.querySelector('.root-blip');
                const ed=root?.querySelector('.js-editor.editor');
                const li=rootLis(ed).find(l=>directText(l)===label);
                const th=li?.querySelector(':scope .blip-thread');
                if(th && !th.classList.contains('folded')) th.querySelector('.js-fold-button,.fold-button')?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""", label)
            pg.wait_for_timeout(2500)
            print(f"template: populated existing child for {label}", flush=True)

        def create_root_child(label, bullets):
            pt = None
            seen = []
            for attempt in range(4):
                nav_unfold()
                seen = root_labels()
                pt = label_caret_point(label)
                if pt:
                    break
                pg.wait_for_timeout(2500)
            assert pt, f"template label not found: {label}; root labels seen: {seen}"
            if pt.get("exists"):
                populate_existing_root_child(label, bullets)
                return
            ok = False
            for _ in range(2):
                pg.mouse.click(pt["x"], pt["y"])
                pg.wait_for_timeout(500)
                guard = pg.evaluate("""()=>{const s=window.getSelection(); return s?.focusNode ? {off:s.focusOffset,len:(s.focusNode.textContent||'').length} : null;}""")
                if guard and guard["off"] == guard["len"]:
                    ok = True
                    break
                pt = label_caret_point(label)
            assert ok, f"caret-at-end guard failed for root label: {label}"
            pg.keyboard.press("Control+Enter")
            pg.wait_for_timeout(2600)
            fresh = pg.evaluate("""()=>[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')].some(e=>(e.innerText||'').trim()==='')""")
            if not fresh:
                pg.keyboard.type("x"); pg.wait_for_timeout(150)
                pg.keyboard.press("Backspace"); pg.wait_for_timeout(150)
                pg.keyboard.press("Control+Enter"); pg.wait_for_timeout(2600)
                fresh = pg.evaluate("""()=>[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')].some(e=>(e.innerText||'').trim()==='')""")
            assert fresh, f"Ctrl+Enter refused for root label: {label}"
            pg.evaluate("""()=>{
                const bc=[...document.querySelectorAll('.blip-container.edit-mode')]
                  .find(b=>((b.querySelector(':scope .js-editor.editor')?.innerText)||'').trim()==='');
                if(!bc) throw new Error('empty child edit-mode not found');
                const btn=[...bc.querySelectorAll('button.js-make-bulleted-list,button[title="Bulleted list"]')]
                  .filter(x=>!x.className.includes('hidden'))[0] || bc.querySelector('button.js-make-bulleted-list,button[title="Bulleted list"]');
                if(!btn) throw new Error('child bulleted-list button not found');
                btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""")
            pg.wait_for_timeout(700)
            ul = pg.evaluate("""()=>{const e=[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')].find(x=>(x.innerText||'').trim()===''); return e ? {tag:e.tagName, first:e.firstElementChild?.tagName} : null;}""")
            assert ul and (ul["tag"] == "UL" or ul["first"] == "LI"), f"bullets not active for child of {label}"
            for i, bullet in enumerate(bullets):
                if special(bullet): pg.keyboard.insert_text(bullet)
                else: pg.keyboard.type(bullet, delay=8)
                if i < len(bullets) - 1:
                    pg.keyboard.press("Enter")
                pg.wait_for_timeout(100)
            n_ok = pg.evaluate("""(first)=>{const ed=[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')].find(x=>(x.innerText||'').trim().startsWith(first)); return ed ? ed.querySelectorAll(':scope > li').length : 0;}""", bullets[0])
            assert n_ok == len(bullets), f"typed {n_ok} child bullets for {label}, expected {len(bullets)}"
            pg.evaluate("""(first)=>{
                const bc=[...document.querySelectorAll('.blip-container.edit-mode')]
                  .find(b=>((b.querySelector(':scope .js-editor.editor')?.innerText)||'').trim().startsWith(first));
                const done=[...bc.querySelectorAll('button[title^="Done"]')][0];
                if(!done) throw new Error('child Done not found');
                done.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""", bullets[0])
            pg.wait_for_timeout(2200)
            pg.evaluate("""(first)=>{
                const bc=[...document.querySelectorAll('.blip-container')]
                  .find(b=>((b.querySelector(':scope .js-editor.editor')?.innerText)||'').trim().startsWith(first));
                const hide=[...bc.querySelectorAll('button.js-is-folded-by-default')]
                  .filter(x=>!x.className.includes('hidden'))[0] || bc.querySelector('button.js-is-folded-by-default');
                if(!hide) throw new Error('child Hide not found');
                hide.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
            }""", bullets[0])
            pg.wait_for_timeout(2500)
            print(f"template: created folded [+] for {label}", flush=True)

        def verify_standard_template(labels):
            nav_unfold()
            result = pg.evaluate("""(labels)=>{""" + DIRECT_TEXT + ROOT_LIS + """
                const root=document.querySelector('.root-blip');
                const ed=root?.querySelector('.js-editor.editor');
                return labels.map(label=>{
                    const li=rootLis(ed).find(l=>directText(l)===label);
                    const th=li?.querySelector(':scope .blip-thread');
                    return {label, hasLi:!!li, hasThread:!!th, folded:th?th.classList.contains('folded'):null, text:li?directText(li):null};
                });
            }""", labels)
            bad = [r for r in result if not (r["hasLi"] and r["hasThread"] and r["folded"])]
            assert not bad, f"template verify failed: {bad}"
            print("TEMPLATE VERIFIED:", json.dumps(result, ensure_ascii=False), flush=True)

        def click_target_blip():
            """Activate the target subblip by clicking its FIRST LI's text rect (never the container edge)."""
            bbox = pg.evaluate("""(first)=>{
                const bcs=[...document.querySelectorAll('.blip-container')];
                for(const bc of bcs){
                    const ed=[...bc.querySelectorAll('.js-editor.editor')].find(e=>{let c=e.parentElement;while(c&&c!==bc){if(c.classList?.contains('blip-container'))return false;c=c.parentElement;}return true;});
                    const f=(ed?.querySelector(':scope > li')?.textContent||'').trim();
                    if(f.startsWith(first.slice(0,30))){
                        const li=ed.querySelector(':scope > li');
                        li.scrollIntoView({block:'center'});
                        const tn=document.createTreeWalker(li,NodeFilter.SHOW_TEXT).nextNode();
                        const rg=document.createRange(); rg.setStart(tn,2); rg.setEnd(tn,8);
                        const r=rg.getBoundingClientRect();
                        return {x:r.left+2,y:Math.max(r.top,60)+r.height/2};
                    }
                }
                return null;
            }""", FIRST)
            assert bbox, "target subblip not found"
            pg.mouse.click(bbox['x'], bbox['y']); pg.wait_for_timeout(1800)

        def enter_edit_and_scope_check():
            pg.evaluate("""()=>{
                const ac=document.querySelector('.blip-container.active');
                const btns=ac?.querySelectorAll('button.js-change-mode')||[];
                for(const b2 of btns){
                    let cur=b2.parentElement,nested=false;
                    while(cur&&cur!==ac){if(cur.classList?.contains('blip-container')){nested=true;break;}cur=cur.parentElement;}
                    if(!nested){b2.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return;}
                }
            }""")
            pg.wait_for_timeout(2200)
            sc = pg.evaluate("""()=>{
                const ed=document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
                return ed?[...ed.querySelectorAll(':scope > li')].map(l=>l.textContent.trim().slice(0,30)):null;
            }""")
            assert sc and sc[0].startswith(FIRST[:25]), f"SCOPE FAIL — wrong editor {sc and sc[0]!r}, ABORT before damage"

        def done_all():
            pg.evaluate("""()=>{[...document.querySelectorAll('.blip-container.edit-mode')].forEach(bc=>{bc.querySelector('button[title^="Done"]')?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));});}""")
            pg.wait_for_timeout(3500)

        # ===== hashtags-only root update =====
        if spec.get("operation") == "hashtags":
            nav_unfold()
            ensure_root_hashtags(spec.get("hashtags", []))
            b.close()
            return

        if spec.get("operation") == "populate-standard-topic":
            children = spec.get("children", {})
            labels = spec.get("labels") or [lbl for lbl in STANDARD_TOPIC_LABELS if lbl in children]
            assert labels, "populate-standard-topic requires labels or children"
            nav_unfold()
            for label in labels:
                assert label in ALLOWED_TOPIC_LABELS, f"not a canonical topic label: {label}"
                assert label in children, f"missing children for {label}"
                create_root_child(label, children[label])
            verify_standard_template(labels)
            b.close()
            return

        # ===== standard root skeleton =====
        if spec.get("template") in ("standard-topic", "standard_topic"):
            labels = spec.get("labels", STANDARD_TOPIC_LABELS)
            children = spec.get("children", STANDARD_TOPIC_CHILDREN)
            assert labels == STANDARD_TOPIC_LABELS, "standard-topic currently only accepts the canonical five labels"
            nav_unfold()
            ensure_root_hashtags(spec.get("hashtags", []))
            seed_standard_root_labels(labels)
            for label in labels:
                create_root_child(label, children.get(label, ["To be filled."]))
            verify_standard_template(labels)
            b.close()
            return

        assert FIRST, "target_first_li is required unless using template=standard-topic"

        # ===== insert_li: THREAD-SAFE split-at-start of `before` =====
        if ins:
            nav_unfold()
            if pg.evaluate("(t)=>document.body.innerText.includes(t)", ins["text"]):
                print("insert_li: exists — skip")
            else:
                assert ins.get("before"), ("insert_li REQUIRES 'before' (an existing LI label). Appending after the "
                    "last LI is FORBIDDEN: if it carries a reply thread, Enter steals the thread (2026-06-12 incident).")
                click_target_blip(); enter_edit_and_scope_check()
                ck = pg.evaluate("""(bef)=>{
                    const ed=document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
                    """ + DIRECT_TEXT + """
                    const li=[...ed.querySelectorAll(':scope > li')].find(l=>directText(l)===bef);
                    if(!li) return 'before-LI not found';
                    const tn=document.createTreeWalker(li,NodeFilter.SHOW_TEXT).nextNode();
                    li.scrollIntoView({block:'center'});
                    const r=document.createRange(); r.setStart(tn,0); r.setEnd(tn,0);
                    const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
                    return 'ok:atStart='+(s.focusOffset===0);
                }""", ins["before"])
                assert ck == 'ok:atStart=true', ck
                pg.keyboard.press('Enter'); pg.wait_for_timeout(300)
                pg.keyboard.press('ArrowUp'); pg.wait_for_timeout(300)
                if special(ins["text"]): pg.keyboard.insert_text(ins["text"])
                else: pg.keyboard.type(ins["text"], delay=12)
                pg.wait_for_timeout(300)
                v = pg.evaluate("""()=>{
                    const ed=document.querySelector('.blip-container.active.edit-mode .js-editor.editor');
                    """ + DIRECT_TEXT + """
                    return [...ed.querySelectorAll(':scope > li')].map(l=>directText(l).slice(0,45));
                }""")
                i = v.index(ins["text"][:45]) if ins["text"][:45] in v else -1
                assert i >= 0 and v[i+1] == ins["before"][:45], f"insert wrong: {v}"
                done_all()
                print("insert_li: done")

        # ===== child: folded [+] with bullets =====
        if child:
            nav_unfold()
            tgt = child["on"]; kids = child["bullets"]
            st = pg.evaluate("""(args)=>{
                const [first,tgt]=args;
                """ + DIRECT_TEXT + """
                const bcs=[...document.querySelectorAll('.blip-container')];
                for(const bc of bcs){
                    const ed=[...bc.querySelectorAll('.js-editor.editor')].find(e=>{let c=e.parentElement;while(c&&c!==bc){if(c.classList?.contains('blip-container'))return false;c=c.parentElement;}return true;});
                    const f=(ed?.querySelector(':scope > li')?.textContent||'').trim();
                    if(f.startsWith(first.slice(0,30))){
                        const li=[...ed.querySelectorAll(':scope > li')].find(l=>directText(l)===tgt);
                        return {found:!!li, has:!!li?.querySelector(':scope .blip-thread')};
                    }
                }
                return null;
            }""", [FIRST, tgt])
            assert st and st['found'], f"child target LI not found: {tgt!r}"
            if st['has']:
                print("child: exists — skip")
            else:
                click_target_blip()
                ok = False
                for _ in range(2):
                    pt = pg.evaluate("""(tgt)=>{
                        const ac=document.querySelector('.blip-container.active');
                        const ed=[...(ac?.querySelectorAll('.js-editor.editor')||[])].find(e=>{let c=e.parentElement;while(c&&c!==ac){if(c.classList?.contains('blip-container'))return false;c=c.parentElement;}return true;});
                        const li=[...(ed?.querySelectorAll(':scope > li')||[])].find(l=>l.textContent.trim().startsWith(tgt.slice(0,25)));
                        if(!li) return null;
                        let tn=null;
                        const w=document.createTreeWalker(li,NodeFilter.SHOW_TEXT);
                        let n; while((n=w.nextNode())){
                            const t=n.parentElement.closest('.blip-thread');
                            if(t&&li.contains(t)) continue;
                            if(n.parentElement.closest('li')!==li) continue;
                            tn=n;
                        }
                        li.scrollIntoView({block:'center'});
                        const r=document.createRange();
                        r.setStart(tn,Math.max(0,tn.textContent.length-1)); r.setEnd(tn,tn.textContent.length);
                        const rect=r.getBoundingClientRect();
                        return {x:rect.right-1,y:rect.top+rect.height/2};
                    }""", tgt)
                    assert pt, "caret target missing"
                    pg.mouse.click(pt['x'], pt['y']); pg.wait_for_timeout(600)
                    g = pg.evaluate("""()=>{const s=window.getSelection();if(!s.focusNode)return null;return {off:s.focusOffset,len:(s.focusNode.textContent||'').length};}""")
                    if g and g['off'] == g['len'] and g['len'] > 0: ok = True; break
                assert ok, "caret guard failed"
                pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(2200)
                fresh = pg.evaluate("""()=>{const eds=[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')];return eds.some(e=>(e.innerText||'').trim()==='');}""")
                if not fresh:
                    pg.keyboard.type('x'); pg.wait_for_timeout(150); pg.keyboard.press('Backspace'); pg.wait_for_timeout(150)
                    pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(2200)
                    fresh = pg.evaluate("""()=>{const eds=[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')];return eds.some(e=>(e.innerText||'').trim()==='');}""")
                assert fresh, "Ctrl+Enter refused twice"
                pg.evaluate("""()=>{
                    const eds=[...document.querySelectorAll('.blip-container.edit-mode')];
                    for(const bc of eds){
                        const ed=bc.querySelector(':scope .js-editor.editor');
                        if((ed?.innerText||'').trim()===''){
                            const btns=bc.querySelectorAll('button[title="Bulleted list"], button.js-make-bulleted-list');
                            for(const b2 of btns){
                                let cur=b2.parentElement,nested=false;
                                while(cur&&cur!==bc){if(cur.classList?.contains('blip-container')){nested=true;break;}cur=cur.parentElement;}
                                if(!nested){b2.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return;}
                            }
                        }
                    }
                }""")
                pg.wait_for_timeout(700)
                ul = pg.evaluate("""()=>{const eds=[...document.querySelectorAll('.blip-container.edit-mode .js-editor.editor')];const e=eds.find(x=>(x.innerText||'').trim()==='');return e?{tag:e.tagName,first:e.firstElementChild?.tagName}:null;}""")
                assert ul and (ul['tag'] == 'UL' or ul['first'] == 'LI'), "bullets not active — would type <div>s"
                for i, kid in enumerate(kids):
                    if special(kid): pg.keyboard.insert_text(kid)
                    else: pg.keyboard.type(kid, delay=8)
                    pg.wait_for_timeout(100)
                    if i < len(kids)-1: pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
                pg.wait_for_timeout(300)
                n_ok = pg.evaluate("""(kf)=>{const eds=[...document.querySelectorAll('.blip-container.edit-mode')];for(const bc of eds){const ed=bc.querySelector(':scope .js-editor.editor');const lis=[...(ed?.querySelectorAll(':scope > li')||[])].map(l=>l.textContent.trim());if(lis.length&&lis[0].startsWith(kf.slice(0,20))) return lis.length;}return 0;}""", kids[0])
                assert n_ok == len(kids), f"typed {n_ok} != {len(kids)} bullets"
                # Done on the child, then Hide (fold-by-default)
                for sel in ['button[title^="Done"]', 'button.js-is-folded-by-default']:
                    pg.evaluate("""(args)=>{
                        const [kf,sel]=args;
                        const bcs=[...document.querySelectorAll('.blip-container')];
                        for(const bc of bcs){
                            const ed=[...bc.querySelectorAll('.js-editor.editor')].find(e=>{let c=e.parentElement;while(c&&c!==bc){if(c.classList?.contains('blip-container'))return false;c=c.parentElement;}return true;});
                            const lis=[...(ed?.querySelectorAll(':scope > li')||[])].map(l=>l.textContent.trim());
                            if(lis.length&&lis[0].startsWith(kf.slice(0,20))){
                                const btns=bc.querySelectorAll(sel);
                                for(const b2 of btns){
                                    let cur=b2.parentElement,nested=false;
                                    while(cur&&cur!==bc){if(cur.classList?.contains('blip-container')){nested=true;break;}cur=cur.parentElement;}
                                    if(!nested){b2.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));return;}
                                }
                            }
                        }
                    }""", [kids[0], sel])
                    pg.wait_for_timeout(1800)
                done_all()
                print("child: done")

        # ===== reload-verify (ground truth) =====
        nav_unfold()
        if child:
            chk = pg.evaluate("""(t)=>{
                """ + DIRECT_TEXT + """
                const li=[...document.querySelectorAll('li')].find(l=>directText(l)===t);
                if(!li) return {li:false};
                const th=li.querySelector(':scope .blip-thread');
                return {li:true, thread:!!th, folded:th?th.classList.contains('folded'):null};
            }""", child["on"])
            print("FOLD-CHECK:", json.dumps(chk))
            assert chk.get('li') and chk.get('thread') and chk.get('folded'), f"fold-check failed: {chk}"
        for _ in range(20):
            n = pg.evaluate("""()=>{const fs=[...document.querySelectorAll('.blip-thread.folded .js-fold-button')];fs.forEach(f=>f.dispatchEvent(new MouseEvent('click',{bubbles:true})));return fs.length;}""")
            pg.wait_for_timeout(700)
            if n == 0: break
        needles = ([ins["text"]] if ins else []) + ([child["on"]] + [k[:50] for k in child["bullets"]] if child else []) + spec.get("verify", [])
        bad = [nd for nd in needles if not pg.evaluate("(n)=>document.body.innerText.includes(n)", nd)]
        assert not bad, f"VERIFY FAILED for: {bad}"
        print(f"ALL VERIFIED ({len(needles)} needles)")
        b.close()

if __name__ == "__main__":
    main()
