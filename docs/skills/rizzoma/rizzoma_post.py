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

Spec (JSON):
{
  "topic": "https://rizzoma.com/topic/<id>/",
  "unfold_path": ["Progress", "260612"],          // labels to unfold, outermost first (optional)
  "target_first_li": "first test: Claude ...",    // identifies target subblip by its FIRST LI
  "insert_li": {"text": "new line", "before": "loops"},   // optional; split-at-start of `before`
  "child": {"on": "new line", "bullets": ["...", "..."]}, // optional; folded [+] child
  "verify": ["needle", "..."]                     // extra reload-verify needles (optional)
}
Run content_gate.py on your bullets BEFORE this. Both ops are idempotent.
"""
import json, sys
from playwright.sync_api import sync_playwright

STATE = "/mnt/c/Rizzoma/scripts/rizzoma-session-state.json"
def special(t): return any(c in t for c in '#@~$*<>')

DIRECT_TEXT = """const directText=(li)=>{let s='';for(const c of li.childNodes){if(c.nodeType===1&&c.classList?.contains('blip-thread'))break;s+=c.textContent||'';}return s.trim();};"""

def main():
    spec = json.load(open(sys.argv[1]))
    TOPIC = spec["topic"]; FIRST = spec["target_first_li"]
    ins = spec.get("insert_li"); child = spec.get("child")

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(storage_state=STATE)
        pg = ctx.new_page()
        pg.on("dialog", lambda d: d.dismiss())

        def nav_unfold():
            pg.goto(TOPIC, wait_until="load", timeout=60000); pg.wait_for_timeout(6000)
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
