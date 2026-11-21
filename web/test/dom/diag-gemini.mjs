// Gemini round (2026-11-19) — diagnosis instrument, NOT in any chain. Measures, in a real
// browser, the layout claims of Gemini's live-site bug breakdown (items C, D, E, F, H) so each
// can be confirmed or refuted against a given build.
// usage: node test/dom/diag-gemini.mjs [--root dist] [--shots dir]
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = resolve(arg('--root', 'dist')) + '/';
const SHOTS = arg('--shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PW = process.env.HOS_PLAYWRIGHT || '/home/hatch/workspace/hos-patch/p18-scratch/';
const CHROME = process.env.HOS_BROWSER || '/home/hatch/workspace/hos-patch/p18-scratch/chrome-headless-shell-linux64/chrome-headless-shell';
const { chromium } = createRequire(PW)('playwright-core');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://localhost:${server.address().port}`;
const nowMinute = Math.floor(Date.now() / 60000);
// Gemini's state: DEMO, then one status tap -> a current status with nothing behind it ("History incomplete").
const incomplete = (nowCard) => ({ segments: [], current: { status: 'OFF', since: nowMinute - 119, createdAt: 1 }, historyAcknowledged: false, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard, nowCardAsked: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const out = {};
if (process.argv.includes('--sweep')) {
  const sw = {};
  for (const [W, H, mobile] of [[320, 568, 1], [360, 640, 1], [375, 667, 1], [390, 844, 1], [412, 915, 1], [430, 932, 1], [768, 1024, 1], [1280, 720, 0], [1440, 900, 0], [1024, 600, 0]]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => { localStorage.setItem('hos-sandbox-v1', save); }, JSON.stringify(incomplete('dial')));
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/'); await page.waitForSelector('#root *'); await page.waitForTimeout(400);
    const tap = (sel, text) => page.evaluate(([q, t]) => { const b = [...document.querySelectorAll(q)].find((x) => x.textContent.includes(t)); if (!b) throw new Error('no ' + q + ' ' + t); b.click(); }, [sel, text]);
    const ack = page.getByRole('button', { name: /^I understand/ }); if (await ack.count()) await ack.first().click();
    const settle = async () => { await page.waitForTimeout(300); };
    const banner = () => page.evaluate(() => { const pg = document.querySelector('.page.is-active'); const box = [...pg.querySelectorAll('.warnbox')].find((b) => b.textContent.includes('History incomplete')); if (!box) return 'none'; const btn = box.querySelector('button'); const cs = getComputedStyle(box); return +(btn.getBoundingClientRect().bottom - (box.getBoundingClientRect().bottom - parseFloat(cs.borderBottomWidth))).toFixed(1); });
    const r = { size: `${W}x${H}${mobile ? '' : ' desktop'}` };
    await tap('nav.tabs button', 'Plan'); await settle(); r.planHub = await banner();
    await tap('.page.is-active button', 'Plan a sleeper split'); await settle(); r.split = await banner();
    await page.evaluate(() => document.querySelector('.page.is-active .flow-head button, .page.is-active button.back, .page.is-active .icon-btn')?.click()); await settle();
    await tap('nav.tabs button', 'Plan'); await settle();
    try { await tap('.page.is-active button', 'Plan a run'); await settle(); r.trip = await banner(); } catch (e) { r.trip = 'n/a ' + e.message; }
    await tap('nav.tabs button', 'Plan'); await settle();
    await page.evaluate(() => { const b = [...document.querySelectorAll('.page.is-active button')].find((x) => x.textContent.includes('Can I take this load?')); b.click(); }); await settle(); r.load = await banner();
    await tap('.page.is-active button', 'Next: when you leave'); await settle();
    r.step2 = await page.evaluate(async () => { const pg = document.querySelector('.page.is-active'); const nav = document.querySelector('nav.tabs'); const nb = () => pg.querySelector('button.flow-next').getBoundingClientRect().bottom; const top = nav.getBoundingClientRect().top; const at0 = nb() - top; pg.scrollTop = 1e6; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); const atMax = nb() - top; pg.scrollTop = 0; return { overNavAt0: +at0.toFixed(1), overNavAtMax: +atMax.toFixed(1), scrollable: pg.scrollHeight - pg.clientHeight, navH: +nav.getBoundingClientRect().height.toFixed(1) }; });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sweep-step2-${W}x${H}.png` });
    await page.evaluate(() => document.querySelector('header.top button[aria-label="Settings"]')?.click()); await settle(); r.more = await banner();
    await page.evaluate(() => document.querySelector('section.page-settings button.settings-back')?.click()); await settle();
    await tap('nav.tabs button', 'Now'); await settle();
    r.now = await page.evaluate(async () => { const pg = document.querySelector('.page.is-active'); const dock = pg.querySelector('.dock'); const card = [...pg.querySelectorAll('.card')].find((c) => /Last 24 hours/i.test(c.textContent)); const d0 = dock.getBoundingClientRect(), c0 = card.getBoundingClientRect(); const at0 = { cardTop: +c0.top.toFixed(1), cardBottom: +c0.bottom.toFixed(1), dockTop: +d0.top.toFixed(1), coveredPx: +Math.max(0, Math.min(c0.bottom, d0.bottom) - Math.max(c0.top, d0.top)).toFixed(1) }; card.scrollIntoView({ block: 'end' }); await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); const c1 = card.getBoundingClientRect(), d1 = dock.getBoundingClientRect(); pg.scrollTop = 1e6; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))); const rest = [...pg.querySelectorAll('.now-rest > *')].filter((e) => !e.classList.contains('dock') && e.getBoundingClientRect().height > 0); const last = rest[rest.length - 1].getBoundingClientRect(); const d2 = dock.getBoundingClientRect(); pg.scrollTop = 0; return { at0, cardFullyClearAfterScrollIntoView: c1.bottom <= d1.top + 0.5, lastClearsDockAtMax: +(d2.top - last.bottom).toFixed(1) }; });
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sweep-now-${W}x${H}.png` });
    sw[r.size] = r; await ctx.close();
  }
  console.log(JSON.stringify(sw, null, 0).replace(/\},"/g, '},\n"'));
  await browser.close(); server.close(); process.exit(0);
}
for (const [W, H] of [[412, 915], [360, 640]]) for (const nowCard of ['dial', 'timeline']) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((save) => { localStorage.setItem('hos-sandbox-v1', save); }, JSON.stringify(incomplete(nowCard)));
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/'); await page.waitForSelector('#root *'); await page.waitForTimeout(400);
  { const ack = page.getByRole('button', { name: /^I understand/ }); if (await ack.count()) { await ack.first().click(); await page.waitForTimeout(200); } }
  const tag = `${W}x${H} ${nowCard}`;
  const tap = (sel, text) => page.evaluate(([q, t]) => { const b = [...document.querySelectorAll(q)].find((x) => x.textContent.includes(t)); if (!b) throw new Error('no ' + q + ' ' + t); b.click(); }, [sel, text]);
  const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => { const m = document.querySelector('main'), p = document.querySelector('.page.is-active'); return !m || !p || Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2000 }).catch(() => {}); };
  // ---- NOW
  const now = await page.evaluate(async () => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), w: +b.width.toFixed(2) }; };
    const pg = document.querySelector('.page.is-active');
    const dock = pg.querySelector('.dock'), nav = document.querySelector('nav.tabs');
    const card24 = [...pg.querySelectorAll('.card')].find((c) => /Last 24 hours/i.test(c.textContent));
    const hero = pg.querySelector('.hero');
    const exc = [...pg.querySelectorAll('button.rowbtn')].find((b) => b.textContent.includes('Exceptions this shift'));
    const at0 = { dock: r(dock), nav: r(nav), hero: r(hero), card24: r(card24), exc: r(exc), pageClientH: pg.clientHeight, pageScrollH: pg.scrollHeight };
    // meter bars: the tile period is 12px (10 seg + 2 gap)
    const meters = [...pg.querySelectorAll('.meter')].map((m) => { const bar = m.querySelector('.meter-bar'); const mb = m.getBoundingClientRect(), bb = bar.getBoundingClientRect(); const cs = getComputedStyle(m); return { label: m.querySelector('.meter-label').textContent, barW: +bb.width.toFixed(2), lastTilePx: +(bb.width % 12).toFixed(2), barRightVsContent: +(bb.right - (mb.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth))).toFixed(2), after: getComputedStyle(bar, '::after').backgroundImage.slice(0, 90), afterRepeat: getComputedStyle(bar, '::after').backgroundRepeat }; });
    const tracks = [...pg.querySelectorAll('.taxis-track:not(.taxis-track-head)')].map((t) => { const tb = t.getBoundingClientRect(); const over = [...t.querySelectorAll('*')].map((c) => ({ c: c.className, o: +(c.getBoundingClientRect().right - tb.right).toFixed(2), l: +(c.getBoundingClientRect().left - tb.left).toFixed(2) })).filter((x) => x.o > 0.01 || x.l < -0.01); const row = t.closest('.taxis-row'); return { row: row ? row.textContent.slice(0, 40) : '', over }; }).filter((x) => x.over.length);
    pg.scrollTop = 1e6; await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    // at max scroll: the last content in the Now column (above the dock) must clear the dock
    const rest = [...pg.querySelectorAll('.now-rest > *')].filter((e) => !e.classList.contains('dock') && e.getBoundingClientRect().height > 0);
    const last = rest[rest.length - 1];
    const atMax = { dock: r(dock), exc: r(exc), last: last ? { cls: last.className, ...r(last) } : null, scrollTop: pg.scrollTop };
    pg.scrollTop = 0;
    return { at0, atMax, meters, tracks };
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/now-${W}-${nowCard}.png` });
  // ---- PLAN: load wizard step 2 and the incomplete banner
  await tap('nav.tabs button', 'Plan'); await settle();
  const banner = async (where) => page.evaluate((where) => {
    const pg = document.querySelector('.page.is-active');
    const box = [...pg.querySelectorAll('.warnbox')].find((b) => b.textContent.includes('History incomplete'));
    if (!box) return { where, none: true };
    const btn = [...box.querySelectorAll('button')].find((b) => b.textContent.includes('really does start'));
    const bb = box.getBoundingClientRect(), tb = btn.getBoundingClientRect(); const cs = getComputedStyle(box);
    return { where, boxBottom: +bb.bottom.toFixed(1), btnBottom: +tb.bottom.toFixed(1), overflowPx: +(tb.bottom - (bb.bottom - parseFloat(cs.borderBottomWidth))).toFixed(1), box: { h: +bb.height.toFixed(1), display: cs.display, lh: cs.lineHeight, pad: cs.padding, fs: cs.fontSize, cls: box.className }, btn: { h: +tb.height.toFixed(1), display: getComputedStyle(btn).display, minH: getComputedStyle(btn).minHeight } };
  }, where);
  const bannerPlan = await banner('plan hub');
  await tap('.page.is-active button', 'Can I take this load?'); await settle();
  const bannerLoad = await banner('plan load');
  const step1 = await page.evaluate(() => document.querySelector('.page.is-active .flow-head')?.textContent);
  await tap('.page.is-active button', 'Next: when you leave'); await page.waitForTimeout(250);
  const step2 = await page.evaluate(() => {
    const pg = document.querySelector('.page.is-active'); const nav = document.querySelector('nav.tabs');
    const next = pg.querySelector('button.flow-next'); const nb = next.getBoundingClientRect(), tb = nav.getBoundingClientRect();
    const cs = getComputedStyle(pg);
    return { head: pg.querySelector('.flow-head')?.textContent, nextTop: +nb.top.toFixed(1), nextBottom: +nb.bottom.toFixed(1), navTop: +tb.top.toFixed(1), hiddenByNav: nb.bottom > tb.top, pagePadBottom: cs.paddingBottom, scrollable: pg.scrollHeight - pg.clientHeight };
  });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/plan-step2-${W}-${nowCard}.png` });
  // ---- MORE banner
  await page.evaluate(() => document.querySelector('header.top button[aria-label="Settings"]')?.click()); await settle();
  const bannerMore = await banner('more');
  if (SHOTS && nowCard === 'dial') await page.screenshot({ path: `${SHOTS}/more-${W}.png` });
  // ---- LOG
  await page.evaluate(() => document.querySelector('section.page-settings button.settings-back')?.click()); await settle();
  await tap('nav.tabs button', 'Log'); await settle();
  const log = await page.evaluate(() => {
    const pg = document.querySelector('.page.is-active');
    const title = [...pg.querySelectorAll('h2, .card-title, .card h3, .card > b')].map((x) => x.textContent).find((t) => /Entries on this day/.test(t)) || (pg.textContent.match(/Entries on this day \(\d+\)/) || [null])[0];
    const live = pg.querySelector('.entry.live'); if (!live) return { title, live: null };
    const len = live.querySelector('.entry-len'), dot = live.querySelector('.dot'), name = live.querySelector('b');
    const lr = len.getBoundingClientRect(), dr = dot.getBoundingClientRect(), nr = name.getBoundingClientRect(), rr = live.getBoundingClientRect();
    return { title, rows: pg.querySelectorAll('.entry').length, cols: getComputedStyle(live).gridTemplateColumns, lenTop: +lr.top.toFixed(1), nameTop: +nr.top.toFixed(1), lenLeft: +lr.left.toFixed(1), dotLeft: +dr.left.toFixed(1), rowRight: +rr.right.toFixed(1), lenRight: +lr.right.toFixed(1), wrapped: lr.top > nr.bottom - 2 };
  });
  if (SHOTS && nowCard === 'dial') await page.screenshot({ path: `${SHOTS}/log-${W}.png` });
  out[tag] = { now, bannerPlan, bannerLoad, bannerMore, step1, step2, log };
  await ctx.close();
}
await browser.close(); server.close();
console.log(JSON.stringify(out, null, 1));
process.exit(0);
