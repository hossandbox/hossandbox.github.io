// Feel round 2 (2026-11-19) — diagnosis instrument for Lorico's on-device report: on the
// live snap strip, a swipe works only when it starts on the tab bar; a swipe starting on
// panel content does not page. The DOM shim cannot answer this (it has no compositor, no
// scroll chaining, no overscroll-behavior), so this drives REAL touch scroll gestures in
// Chrome (CDP Input.synthesizeScrollGesture, gestureSourceType 'touch' — the same
// gesture-detector → compositor scroll-latching path a finger takes) at chosen screen
// points, and reads where the strip ended up.
//
// usage: node test/dom/diag-swipe-touch.mjs [--root dist] [--inject '<css>'] [--mode touch|synth]
// (--mode synth: CDP synthesizeScrollGesture — it does NOT deliver touch scrolls in
// chrome-headless-shell (even the vertical control fails), so raw touch events are the default.)
// Not wired into any suite chain; the pinned regression lives in the layout lane.
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = resolve(arg('--root', 'dist')) + '/';
const PW = process.env.HOS_PLAYWRIGHT || '/home/hatch/workspace/hos-patch/p18-scratch/';
const CHROME = process.env.HOS_BROWSER || '/home/hatch/workspace/hos-patch/p18-scratch/chrome-headless-shell-linux64/chrome-headless-shell';
const { chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://localhost:${server.address().port}`;
const nowMinute = Math.floor(Date.now() / 60000);
const t0 = nowMinute - 60 * 30;
const seed = {
  segments: [
    { status: 'OFF', start: t0 - 600, end: t0, createdAt: 1 },
    { status: 'ON', start: t0, end: t0 + 30, createdAt: 2 },
    { status: 'D', start: t0 + 30, end: t0 + 330, createdAt: 3 },
    { status: 'OFF', start: t0 + 330, end: t0 + 360, note: 'break:30-min break', createdAt: 4 },
    { status: 'D', start: t0 + 360, end: t0 + 600, createdAt: 5 },
    { status: 'SB', start: t0 + 600, end: t0 + 1230, createdAt: 7 },
    { status: 'D', start: t0 + 1230, end: nowMinute - 20, createdAt: 12 },
  ],
  current: { status: 'ON', since: nowMinute - 20, createdAt: 13 },
  historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard: 'dial', nowCardAsked: true,
};
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
await ctx.addInitScript((s) => { try { localStorage.setItem('hos-sandbox-v1', s); } catch { /* */ } }, JSON.stringify(seed));
const page = await ctx.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'load' });
await page.waitForSelector('#root *');
await page.waitForTimeout(300);
const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
if (await ack.count()) await ack.first().click();
const cdp = await ctx.newCDPSession(page);
// A finger: touchStart, 20 touchMoves over ~200ms, touchEnd — raw touch points, so the
// browser's own gesture detector decides scroll vs tap and the compositor latches the scroll.
const MODE = arg('--mode', 'touch');
async function drag(x, y, dx, dy) {
  if (MODE === 'synth') { await cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: dx, yDistance: dy, gestureSourceType: 'touch', speed: 1200 }); return; }
  const N = 20;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= N; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / N, y: y + dy * i / N }] });
    await new Promise((r) => setTimeout(r, 10));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// --inject "<css>": add a stylesheet before measuring (to test a candidate fix on the same build)
const INJECT = arg('--inject', '');
if (INJECT) await page.addStyleTag({ content: INJECT });
// control: a vertical touch scroll on Now must move the Now page (proves gestures arrive)
{ const b = await page.evaluate(() => document.querySelector('.page.is-active').scrollTop);
  await drag(206, 600, 0, -300);
  await page.waitForTimeout(600);
  const a = await page.evaluate(() => document.querySelector('.page.is-active').scrollTop);
  console.log(`control: vertical touch scroll on Now page scrollTop ${b} -> ${a}`);
  await page.evaluate(() => { document.querySelector('.page.is-active').scrollTop = 0; }); }
const state = () => page.evaluate(() => {
  const m = document.querySelector('main.pages'), a = document.querySelector('.page.is-active');
  return { left: Math.round(m.scrollLeft), active: a?.className.match(/page-(\w+)/)?.[1], bar: document.querySelector('nav.tabs button.on')?.textContent.trim() };
});
const seat = async (tab) => {
  await page.evaluate((t) => {
    if (document.querySelector('.app.in-settings') && t !== 'More' && t !== 'Settings') {
      document.querySelector('section.page-settings button.settings-back')?.click();
    }
    const b = (t === 'More' || t === 'Settings')
      ? document.querySelector('header.top button[aria-label="Settings"]')
      : [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes(t));
    b?.click();
  }, tab);
  await page.waitForTimeout(900);
};
const swipe = async (x, y, dx, dy = 0) => {
  await drag(x, y, dx, dy);
  await page.waitForTimeout(700);
};
const what = (x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName.toLowerCase()}.${String(e.className?.baseVal ?? e.className).split(' ')[0]}` : null; }, [x, y]);
const css = await page.evaluate(() => { const p = getComputedStyle(document.querySelector('.page')), m = getComputedStyle(document.querySelector('main.pages')); return { pageOB: `${p.overscrollBehaviorX}/${p.overscrollBehaviorY}`, pageOverflow: `${p.overflowX}/${p.overflowY}`, pageTA: p.touchAction, stripOB: `${m.overscrollBehaviorX}/${m.overscrollBehaviorY}`, stripTA: m.touchAction }; });
console.log('computed:', JSON.stringify(css));
const rows = [];
for (const [from, label, x, y, dx, dy] of [
  ['Now', 'Now content (mid-panel)', 206, 450, -300, 0],
  ['Plan', 'Plan row (button)', 206, 300, -300, 0],
  ['Log', 'Log content (mid-panel)', 206, 450, 300, 0],
  ['Now', 'Now content, slight diagonal', 206, 450, -300, 40],
  ['Plan', 'Tab bar (icons)', 206, 885, -300, 0],
]) {
  await seat(from);
  const b = await state();
  const hit = await what(x, y);
  const pageScrollable = await page.evaluate(() => { const p = document.querySelector('.page.is-active'); return p.scrollHeight > p.clientHeight; });
  await swipe(x, y, dx, dy);
  const a = await state();
  rows.push({ label, hit, from: b.active, to: a.active, moved: a.left !== b.left, pageScrollable });
}
console.table(rows);
await browser.close(); server.close();
process.exit(0);
