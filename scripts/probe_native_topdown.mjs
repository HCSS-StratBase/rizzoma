import { chromium } from 'playwright';
const base='https://138-201-62-161.nip.io', topic='18fd97812660e69bf157d9dc5a04da07';
const log=m=>console.log(`[td] ${m}`); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:950},ignoreHTTPSErrors:true}); const page=await ctx.newPage();
page.on('pageerror',e=>log(`PAGEERROR: ${String(e).slice(0,140)}`));
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.evaluate(async()=>{await fetch('/api/auth/csrf',{credentials:'include'});const raw=document.cookie.split('; ').find(e=>e.startsWith('XSRF-TOKEN='));const csrf=raw?decodeURIComponent(raw.split('=')[1]||''):'';await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'include',body:JSON.stringify({email:'try-owner+try-1783562412806@example.com',password:'Try!Owner-try-1783562412806'})});});
await page.goto(`${base}/?layout=rizzoma&render=native#/topic/${topic}`,{waitUntil:'domcontentloaded'});
await sleep(9000);
// top-down: click the FIRST *visible* folded thread's fold button, repeat
for(let i=0;i<14;i++){
  const did=await page.evaluate(()=>{
    const t=Array.from(document.querySelectorAll('.blip-thread.folded')).find(el=>el.offsetParent!==null);
    if(!t)return false;
    const fb=t.querySelector('.js-fold-button,.fold-button');
    fb?.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return true;
  });
  if(!did)break; await sleep(800);
}
const st=await page.evaluate(()=>({
  labels:[1,2,3,4,5,6,7,8,9,10].filter(i=>document.body.innerText.includes(`L${i} label`)),
  containers:document.querySelectorAll('.blip-container').length,
  threads:document.querySelectorAll('.blip-thread').length,
}));
log(`native top-down unfold: ${JSON.stringify(st)}`);
await page.screenshot({path:'/mnt/c/Rizzoma/screenshots/260715-native-topdown.png'});
await browser.close();
