import { chromium } from 'playwright';
const base='https://138-201-62-161.nip.io';
// a React-built hand-build d10 topic (has real depth-10 content stored)
const topic=process.env.T||'18fd97812660e69bf157d9dc5a04da07';
const log=m=>console.log(`[nd] ${m}`); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},ignoreHTTPSErrors:true});
const page=await ctx.newPage();
page.on('pageerror',e=>log(`PAGEERROR: ${String(e).slice(0,140)}`));
page.on('console',m=>{const t=m.text();if(/native|blip|render|error/i.test(t)&&!/vite|SW Hook/.test(t))log(`console: ${t.slice(0,120)}`);});
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.evaluate(async()=>{await fetch('/api/auth/csrf',{credentials:'include'});const raw=document.cookie.split('; ').find(e=>e.startsWith('XSRF-TOKEN='));const csrf=raw?decodeURIComponent(raw.split('=')[1]||''):'';await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'include',body:JSON.stringify({email:'try-owner+try-1783562412806@example.com',password:'Try!Owner-try-1783562412806'})});});
await page.goto(`${base}/?layout=rizzoma&render=native#/topic/${topic}`,{waitUntil:'domcontentloaded'});
await sleep(9000);
const st=await page.evaluate(()=>({
  nativeMode:!!document.querySelector('.rizzoma-native-mode,.rizzoma-native-wave-host,.wave-view'),
  blipContainers:document.querySelectorAll('.blip-container').length,
  blipThreads:document.querySelectorAll('.blip-thread').length,
  folded:document.querySelectorAll('.blip-thread.folded').length,
  labels:[1,2,3,4,5,6,7,8,9,10].filter(i=>document.body.innerText.includes(`L${i} label`)),
}));
log(`native render of stored d10: ${JSON.stringify(st)}`);
// try to unfold natively (CSS-class fold buttons)
for(let i=0;i<12;i++){const did=await page.evaluate(()=>{const fb=Array.from(document.querySelectorAll('.blip-thread.folded .fold-button,.blip-thread.folded .js-fold-button, .blip-thread.folded [class*="fold"]'));if(fb.length){fb[fb.length-1].dispatchEvent(new MouseEvent('click',{bubbles:true}));return true;}return false;});if(!did)break;await sleep(900);}
const st2=await page.evaluate(()=>({labels:[1,2,3,4,5,6,7,8,9,10].filter(i=>document.body.innerText.includes(`L${i} label`)),threads:document.querySelectorAll('.blip-thread').length}));
log(`after native unfold: ${JSON.stringify(st2)}`);
await page.screenshot({path:'/mnt/c/Rizzoma/screenshots/260715-native-depth.png'});
await browser.close();
