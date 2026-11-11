import { chromium } from 'playwright';
const base='https://138-201-62-161.nip.io', topic=process.env.T||'18fd97812660e69bf157d9dc5a06130e';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},ignoreHTTPSErrors:true});
const page=await ctx.newPage();
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.evaluate(async()=>{await fetch('/api/auth/csrf',{credentials:'include'});const raw=document.cookie.split('; ').find(e=>e.startsWith('XSRF-TOKEN='));const csrf=raw?decodeURIComponent(raw.split('=')[1]||''):'';await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'include',body:JSON.stringify({email:'try-owner+try-1783562412806@example.com',password:'Try!Owner-try-1783562412806'})});});
await page.goto(`${base}/?layout=rizzoma#/topic/${topic}`,{waitUntil:'domcontentloaded'});
await new Promise(r=>setTimeout(r,8000));
for(let i=0;i<4;i++){await page.evaluate(()=>{const m=Array.from(document.querySelectorAll('.blip-thread-marker')).filter(el=>el.offsetParent!==null&&(el.textContent||'').trim()==='+').pop();m?.click();});await new Promise(r=>setTimeout(r,1000));}
await page.screenshot({path:process.env.OUT||'/mnt/c/Rizzoma/screenshots/260715-user-repro/after-css-fix.png'});
console.log('shot saved');
await browser.close();
