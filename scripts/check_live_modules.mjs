import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
await page.goto('https://138-201-62-161.nip.io', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const td = await (await fetch('/components/RizzomaTopicDetail.tsx')).text();
  const rb = await (await fetch('/components/blip/RizzomaBlip.tsx')).text();
  const css = await (await fetch('/components/blip/RizzomaBlip.css')).text();
  return { bridge: td.includes('topic-editor:'), claimOnEdit: rb.includes('EDIT SURFACES'), blbCss: css.includes('DEEP-BLB PARITY') };
});
console.log(JSON.stringify(r));
await browser.close();
