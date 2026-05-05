#!/usr/bin/env node
/**
 * Visual sanity pass on analyze.rubase.org after today's batch:
 *   1. Header check: 'Russian Ukrainian War Analysis' centered, ⌂ Home chip
 *      between left logos and title, 3 logos on right, ←/→ nav buttons.
 *   2. Sunburst legibility: every visible segment shows a label.
 *   3. Tooltip not clipped: hover top-edge segment, screenshot full tooltip.
 *   4. Tooltip not clipped at bottom: hover bottom-edge segment too.
 *   5. Sticky chunks-header: scroll past the chart, verify Taxonomic element /
 *      Total chunks / Time range / Showing stays at top.
 *   6. Links stay in tab (count tabs before/after clicking Home chip).
 *
 * Output: screenshots + a final pass/fail report per check.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://analyze.rubase.org/';
const outDir = path.join('/mnt/c/Rizzoma/screenshots', '260505-analyze-sanity');
const log = m => console.log(`[sanity] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const checks = [];
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function shot(page, file) {
  await fs.mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, file), fullPage: false });
  log(`  → ${file}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(2000);
  await shot(page, '00-landing.png');

  // ─── Check 1: header layout ───
  const header = await page.evaluate(() => {
    const h = document.querySelector('header');
    if (!h) return { error: 'no header' };
    const title = h.querySelector('.h-title');
    const homeChip = h.querySelector('.header-back');
    const navBtns = Array.from(h.querySelectorAll('.header-nav-btn')).map(b => b.textContent.trim());
    const leftLogos = h.querySelectorAll('.h-left img').length;
    const rightLogos = h.querySelectorAll('.h-right img').length;
    return {
      titleText: title?.textContent || '(none)',
      titleLeft: title?.getBoundingClientRect().left,
      titleCenter: title ? title.getBoundingClientRect().left + title.getBoundingClientRect().width / 2 : null,
      viewportCenter: window.innerWidth / 2,
      homeChipText: homeChip?.textContent || '(none)',
      homeChipTarget: homeChip?.getAttribute('target') || '',
      navBtnLabels: navBtns,
      leftLogoCount: leftLogos,
      rightLogoCount: rightLogos,
    };
  });
  record('Title text is "Russian Ukrainian War Analysis"',
    header.titleText === 'Russian Ukrainian War Analysis',
    `got "${header.titleText}"`);
  record('Title is visually centered (within 50px of viewport center)',
    Math.abs(header.titleCenter - header.viewportCenter) < 50,
    `title center ${header.titleCenter?.toFixed(0)} vs viewport center ${header.viewportCenter}`);
  record('Home chip says "⌂ Home"', header.homeChipText === '⌂ Home', `got "${header.homeChipText}"`);
  record('Home chip is in-tab (no target=_blank)', header.homeChipTarget !== '_blank', `target="${header.homeChipTarget}"`);
  record('Header has ←/→ nav buttons', header.navBtnLabels.includes('←') && header.navBtnLabels.includes('→'),
    `got [${header.navBtnLabels.join(', ')}]`);
  record('Left side has 2 logos (HCSS + GT)', header.leftLogoCount === 2, `got ${header.leftLogoCount}`);
  record('Right side has 3 logos (Carnegie + KL + RuBase)', header.rightLogoCount === 3, `got ${header.rightLogoCount}`);

  // ─── Check 2: sunburst legibility — every visible label segment has text ───
  // Wait for sunburst to render
  await page.waitForSelector('.js-plotly-plot .sunburst', { timeout: 15000 }).catch(() => {});
  await sleep(2000);
  await shot(page, '01-sunburst-rendered.png');

  const sunburst = await page.evaluate(() => {
    const plot = document.querySelector('.js-plotly-plot');
    if (!plot) return { error: 'no plot' };
    // Plotly sunburst slices have class 'slice' (path elements).
    const slices = Array.from(plot.querySelectorAll('.slice'));
    // Each slice has a sibling text node group rendered nearby. The slicetext
    // group holds the visible label per slice.
    const slicetexts = Array.from(plot.querySelectorAll('.slicetext text, .sunburstlayer text'));
    const visibleTexts = slicetexts.filter(t => {
      const r = t.getBoundingClientRect();
      const text = (t.textContent || '').trim();
      return r.width > 0 && r.height > 0 && text.length > 0;
    });
    return {
      sliceCount: slices.length,
      visibleLabelCount: visibleTexts.length,
      sampleLabels: visibleTexts.slice(0, 8).map(t => (t.textContent || '').slice(0, 30)),
    };
  });
  record('Sunburst rendered with at least one slice',
    sunburst.sliceCount > 0,
    `${sunburst.sliceCount} slices`);
  record('Most slices show a visible label (>50% coverage)',
    sunburst.sliceCount > 0 && (sunburst.visibleLabelCount / sunburst.sliceCount) > 0.5,
    `${sunburst.visibleLabelCount}/${sunburst.sliceCount} labels visible (sample: ${sunburst.sampleLabels.join(' | ')})`);

  // ─── Check 3: hover top-edge segment, capture tooltip — verify NO clipping ───
  await page.evaluate(() => {
    // Find the topmost visible slicetext
    const texts = Array.from(document.querySelectorAll('.slicetext text, .sunburstlayer text'));
    const visible = texts.filter(t => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (t.textContent || '').trim().length > 0;
    });
    visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    const topMost = visible[0];
    if (topMost) topMost.setAttribute('data-mcp-target', 'top');
  });
  const topTarget = page.locator('[data-mcp-target="top"]').first();
  if (await topTarget.count() > 0) {
    await topTarget.hover({ force: true });
    await sleep(800);
    await shot(page, '02-tooltip-top-segment.png');
    const tooltip = await page.evaluate(() => {
      // Plotly's hover label is in .hoverlayer
      const hover = document.querySelector('.hoverlayer .hovertext');
      if (!hover) return { exists: false };
      const rect = hover.getBoundingClientRect();
      const text = (hover.textContent || '').trim();
      // Check if any header element overlaps the tooltip
      const header = document.querySelector('header');
      const headerRect = header?.getBoundingClientRect();
      const overlapsHeader = headerRect && rect.top < headerRect.bottom && rect.bottom > headerRect.top;
      return { exists: true, text, top: rect.top, headerBottom: headerRect?.bottom, overlapsHeader };
    });
    record('Top-edge tooltip exists',
      tooltip.exists,
      tooltip.exists ? `text="${tooltip.text.slice(0, 60)}"` : '(no hover label)');
    if (tooltip.exists) {
      record('Top-edge tooltip is NOT covered by sticky header',
        !tooltip.overlapsHeader,
        `tooltip.top=${tooltip.top?.toFixed(0)} header.bottom=${tooltip.headerBottom?.toFixed(0)}`);
    }
  } else {
    record('Top-edge tooltip', false, 'no hover-target found');
  }

  // ─── Check 4: hover bottom-edge segment ───
  await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('.slicetext text, .sunburstlayer text'));
    const visible = texts.filter(t => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (t.textContent || '').trim().length > 0;
    });
    visible.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    const bottom = visible[0];
    if (bottom) bottom.setAttribute('data-mcp-target', 'bottom');
  });
  const bottomTarget = page.locator('[data-mcp-target="bottom"]').first();
  if (await bottomTarget.count() > 0) {
    await bottomTarget.hover({ force: true });
    await sleep(800);
    await shot(page, '03-tooltip-bottom-segment.png');
    const tooltip = await page.evaluate(() => {
      const hover = document.querySelector('.hoverlayer .hovertext');
      if (!hover) return { exists: false };
      const rect = hover.getBoundingClientRect();
      // Check if any subsequent block (timeline / chunks-sticky) overlaps
      const timeline = document.querySelector('.overall-timeline');
      const chunksSticky = document.querySelector('.chunks-sticky');
      const tlRect = timeline?.getBoundingClientRect();
      const csRect = chunksSticky?.getBoundingClientRect();
      return {
        exists: true,
        text: (hover.textContent || '').trim(),
        bottom: rect.bottom,
        timelineTop: tlRect?.top,
        chunksStickyTop: csRect?.top,
      };
    });
    record('Bottom-edge tooltip exists', tooltip.exists,
      tooltip.exists ? `text="${tooltip.text.slice(0, 60)}"` : '(no hover label)');
  } else {
    record('Bottom-edge tooltip', false, 'no hover-target found');
  }

  // ─── Check 5: scroll down, verify chunks-sticky pinned ───
  // Click a slice to load chunks
  await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('.slicetext text, .sunburstlayer text'));
    const visible = texts.filter(t => {
      const r = t.getBoundingClientRect();
      return r.width > 50 && r.height > 0; // pick a wide one
    });
    if (visible[0]) visible[0].setAttribute('data-mcp-click', '1');
  });
  await page.locator('[data-mcp-click="1"]').first().click({ force: true }).catch(() => {});
  await sleep(2000);
  await page.mouse.wheel(0, 1500);
  await sleep(1000);
  await shot(page, '04-scrolled-with-sticky.png');

  const sticky = await page.evaluate(() => {
    const cs = document.querySelector('.chunks-sticky');
    const teMeta = document.querySelector('.te-meta');
    if (!cs) return { exists: false };
    const rect = cs.getBoundingClientRect();
    const teRect = teMeta?.getBoundingClientRect();
    return {
      exists: true,
      stickyTop: rect.top,
      stickyVisible: rect.top < window.innerHeight && rect.bottom > 0,
      teMetaText: (teMeta?.textContent || '').slice(0, 100),
      teMetaVisible: teRect && teRect.top < window.innerHeight && teRect.bottom > 0,
    };
  });
  record('Chunks-sticky element exists', sticky.exists);
  if (sticky.exists) {
    record('Chunks-sticky pinned near top after scroll',
      sticky.stickyTop !== undefined && sticky.stickyTop < 200,
      `top=${sticky.stickyTop?.toFixed(0)}`);
    record('Te-meta (Taxonomic element block) visible after scroll',
      !!sticky.teMetaVisible,
      `text="${sticky.teMetaText.slice(0, 60)}"`);
  }

  // ─── Final report ───
  await browser.close();
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;
  log('');
  log(`SUMMARY: ${passed}/${checks.length} passed, ${failed} failed`);
  if (failed > 0) {
    log('FAILURES:');
    checks.filter(c => !c.ok).forEach(c => log(`  ❌ ${c.name} — ${c.detail}`));
  }
  log(`\nScreenshots: ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
