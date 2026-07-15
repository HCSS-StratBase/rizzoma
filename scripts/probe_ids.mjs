import { chromium } from 'playwright';
const base='https://138-201-62-161.nip.io', topic='18fd97812660e69bf157d9dc5a04da07';
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({ignoreHTTPSErrors:true}); const page=await ctx.newPage();
await page.goto(base,{waitUntil:'domcontentloaded'});
await page.evaluate(async()=>{await fetch('/api/auth/csrf',{credentials:'include'});const raw=document.cookie.split('; ').find(e=>e.startsWith('XSRF-TOKEN='));const csrf=raw?decodeURIComponent(raw.split('=')[1]||''):'';await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},credentials:'include',body:JSON.stringify({email:'try-owner+try-1783562412806@example.com',password:'Try!Owner-try-1783562412806'})});});
const data=await page.evaluate(async(t)=>{
  const tr=await (await fetch(`/api/topics/${t}`,{credentials:'include'})).json();
  const br=await (await fetch(`/api/blips?waveId=${t}&limit=500`,{credentials:'include'})).json();
  const blips=(br.blips||br);
  const markers=(tr.content||'').match(/data-blip-thread="([^"]+)"/g)||[];
  return {
    topicContentMarkers: markers.slice(0,3),
    blipIds: blips.slice(0,4).map(b=>b.id||b._id),
    firstBlipContentMarkers: ((blips[0]?.content)||'').match(/data-blip-thread="([^"]+)"/g)||[],
  };
},topic);
console.log(JSON.stringify(data,null,1));
await browser.close();
