import { chromium } from 'playwright';
const base='https://138-201-62-161.nip.io', topic='18fd97812660e69bf157d9dc5a06130e';
const log=m=>console.log(`[t] ${m}`); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},ignoreHTTPSErrors:true});
const page=await ctx.newPage();
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.evaluate(async()=>{await fetch('/api/auth/csrf',{credentials:'include'});const raw=document.cookie.split('; ').find(e=>e.startsWith('XSRF-TOKEN='));const csrf=raw?decodeURIComponent(raw.split('=')[1]||''):'';await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'include',body:JSON.stringify({email:'try-owner+try-1783562412806@example.com',password:'Try!Owner-try-1783562412806'})});});
await page.goto(`${base}/?layout=rizzoma#/topic/${topic}`,{waitUntil:'domcontentloaded'});
await sleep(8000);
for(let i=0;i<4;i++){await page.evaluate(()=>{const m=Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el=>el.offsetParent!==null&&(el.textContent||'').trim()==='+').pop();m?.click();});await sleep(1000);}
const before=await page.evaluate(()=>document.querySelectorAll('.blip-container').length);
// activate L3's blip by clicking its container, then find its Edit button and click it
await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('.blip-container')).find(x=>((x.querySelector('.blip-text')?.textContent)||'').trim().startsWith('L3 label'));(c?.querySelector('.blip-content')||c)?.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
await sleep(1500);
const menus=await page.evaluate(()=>Array.from(document.querySelectorAll('.blip-menu')).filter(e=>e.offsetParent!==null).map(m=>m.closest('.blip-container') && ((m.closest('.blip-container').querySelector('.blip-text')?.textContent)||'').slice(0,10)));
log(`active menus on: ${JSON.stringify(menus)}`);
// click that blip's Edit
const clickedEdit=await page.evaluate(()=>{const c=Array.from(document.querySelectorAll('.blip-container')).find(x=>x.querySelector('.blip-menu')&&((x.querySelector('.blip-text')?.textContent)||'').trim().startsWith('L3'));const btn=c&&Array.from(c.querySelectorAll('.blip-menu button')).find(b=>/edit/i.test(b.textContent||''));if(btn){btn.dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;}return false;});
log(`clicked Edit on L3 blip: ${clickedEdit}`);
await sleep(2000);
const st=await page.evaluate(()=>({editable:Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e=>e.offsetParent!==null).length,focused:(document.activeElement?.className||'').toString().includes('ProseMirror')}));
log(`edit state: ${JSON.stringify(st)}`);
// place cursor end of the editable, Ctrl+Enter
await page.evaluate(()=>{const ed=Array.from(document.querySelectorAll('.ProseMirror[contenteditable="true"]')).filter(e=>e.offsetParent!==null).pop();ed?.focus();const li=ed?.querySelector('li')||ed;const r=document.createRange();r.selectNodeContents(li);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);});
await page.keyboard.press('Control+Enter');
await sleep(4000);
const after=await page.evaluate(()=>document.querySelectorAll('.blip-container').length);
log(`after edit+Ctrl+Enter: containers ${before}→${after} — ${after>before?'CHILD CREATED (edit-mode path works)':'still no child'}`);
await browser.close();
