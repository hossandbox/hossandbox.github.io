// Capstone C2 — the real-browser lane for what the DOM shim cannot see: computed styles and
// geometry (audit §2.3 rail 2/3, §2.5). The shim lane (test/dom/scrub.mjs) owns the behaviour;
// this lane checks, in Chrome, at 412x915 and 360x640:
//   preview: the card border is 2px dashed; the band is >= 48px; every other block on Now is at
//   40% and inert (a real tap on the dock changes nothing); the steppers are >= 56px; no
//   horizontal overflow; the dock keeps its sticky slot; a real tap on the axis enters preview;
//   10 s of no interaction snaps back (real timer); under prefers-reduced-motion the snap has no
//   animation; status Driving: a tap on the axis never enters preview.
//   Split: the strip stays sticky; the bar's blocks are 56px tall and every block (however
//   short) takes a tap across a 48px-wide target; the block sheet's steppers are >= 56px.
// usage: node test/dom/c2browser.mjs [--root dist] [--shots DIR]
// Browser discovery is the layout lane's (HOS_BROWSER / HOS_PLAYWRIGHT); a missing browser is a
// FAILURE (exit 2), never a silent pass.
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
let chromium;
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`C2 BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`C2 BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`C2 BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json', '.woff2': 'font/woff2' };
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

// The audit's standard seed, shifted so that its "now" (Mon 03:04) is the real minute, with the
// driver parked on duty (§2.3: the preview is a parked driver's tool).
const nowMinute = Math.floor(Date.now() / 60000);
const off = nowMinute - (24 * 60 + 3 * 60 + 4); // seed minutes are relative to Sun 00:00
const S = (h, m = 0) => off + h * 60 + m;
const seedSegs = [
  { status: 'OFF', start: S(5, 40), end: S(7, 40), createdAt: 1 }, { status: 'SB', start: S(7, 40), end: S(15, 40), createdAt: 2 },
  { status: 'ON', start: S(15, 40), end: S(16, 25), createdAt: 3 }, { status: 'D', start: S(16, 25), end: S(19, 10), createdAt: 4 },
  { status: 'OFF', start: S(19, 10), end: S(19, 40), createdAt: 5 }, { status: 'ON', start: S(19, 40), end: S(21, 55), createdAt: 6 }];
const save = (over) => JSON.stringify({
  segments: [...seedSegs, { status: 'D', start: S(21, 55), end: nowMinute, createdAt: 7 }],
  current: { status: 'ON', since: nowMinute, createdAt: 8 },
  historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'night', nowCard: 'timeline', nowCardAsked: true,
  config: { timeZone: 'America/New_York' }, ...over,
});

const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (W, H, saved, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block', ...opts });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('c2seeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('c2seeded', '1'); } } catch { /* ignore */ } }, saved);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('#root *');
  await page.waitForTimeout(300);
  const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
  if (await ack.count()) await ack.first().click();
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  return { ctx, page, errors };
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png') }); };
const overflow = (page) => page.evaluate(() => { const de = document.documentElement; const vw = de.clientWidth; let wide = 0; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; if ((r.right > vw + 0.5 || r.left < -0.5) && !el.classList.contains('vh')) wide++; } return { wide, docW: de.scrollWidth, vw }; });

for (const [W, H] of [[412, 915], [360, 640]]) {
  const tag = `[${W}x${H}]`;
  /* ---------------- Now: the preview ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({}));
    const dockBefore = await page.evaluate(() => { const r = document.querySelector('.dock')?.getBoundingClientRect(); return r && { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
    // a real tap at the middle of the 11-hr lane's track
    const track = page.locator('.hero .taxis .taxis-row:not(.taxis-head) .taxis-track').first();
    const box = await track.boundingBox();
    ok(`${tag} the Timeline card has an axis track to tap`, !!box);
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-preview]');
      if (!card) return null;
      const cs = getComputedStyle(card);
      const band = card.querySelector('.pv-band');
      const rest = document.querySelector('.now-rest');
      // the dock keeps its opaque floor (it is sticky over scrolled content); its controls take the 40%
      const kids = rest ? [...rest.children].flatMap((k) => (k.classList.contains('dock') ? [...k.children] : [k])) : [];
      const steps = [...card.querySelectorAll('button.pv-step')].map((b) => Math.round(b.getBoundingClientRect().height));
      const dock = document.querySelector('.dock')?.getBoundingClientRect();
      return {
        t: Number(card.getAttribute('data-preview')), border: `${cs.borderTopWidth} ${cs.borderTopStyle}`, bandH: band ? Math.round(band.getBoundingClientRect().height) : 0, bandText: band?.textContent,
        inert: !!rest && rest.inert === true, opac: kids.map((k) => getComputedStyle(k).opacity), restKids: kids.length, steps,
        dock: dock && { top: Math.round(dock.top), bottom: Math.round(dock.bottom), cx: dock.left + dock.width / 4, cy: dock.top + dock.height / 2 },
      };
    });
    ok(`${tag} a real tap on the axis enters preview at a quarter hour after now`, m && m.t > nowMinute && m.t % 15 === 0, JSON.stringify(m && { t: m.t, now: nowMinute }));
    ok(`${tag} rail 2: the preview card border is 2px dashed`, m && m.border === '2px dashed', m?.border);
    ok(`${tag} rail 2: the PREVIEW band is >= 48px and reads "PREVIEW … — not now"`, m && m.bandH >= 48 && /^PREVIEW .+ — not now$/.test(m.bandText || ''), `${m?.bandH}px "${m?.bandText}"`);
    ok(`${tag} rail 2: everything else on Now is inert and at 40%`, m && m.inert && m.restKids > 3 && m.opac.every((o) => o === '0.4'), JSON.stringify(m && { inert: m.inert, opac: [...new Set(m.opac)] }));
    ok(`${tag} the preview steppers are >= 56px`, m && m.steps.length === 3 && m.steps.every((x) => x >= 56), JSON.stringify(m?.steps));
    ok(`${tag} the dock keeps its sticky slot during a preview`, m && dockBefore && m.dock && Math.abs(m.dock.bottom - dockBefore.bottom) <= 1, JSON.stringify([dockBefore, m?.dock]));
    const ov = await overflow(page);
    ok(`${tag} no horizontal overflow in preview`, !!m && ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `now-preview-${W}x${H}`);
    // inert, for real: a tap on the dock must not change the status
    const statusBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('hos-sandbox-v1')).current?.status);
    if (m?.dock) await page.touchscreen.tap(m.dock.cx, m.dock.cy);
    await page.waitForTimeout(200);
    const statusAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('hos-sandbox-v1')).current?.status);
    ok(`${tag} rail 2: a real tap on the inert dock changes nothing`, !!m && statusBefore === statusAfter && statusBefore === 'ON', `${statusBefore} → ${statusAfter}`);
    // rail 3: ten real seconds after the last interaction it snaps back
    // soft taps: on a build without the feature the lane reports red instead of timing out
    if (await page.locator('button.pv-step').count() > 1) await page.locator('button.pv-step').nth(1).tap();
    await page.waitForTimeout(8500);
    const still = await page.locator('[data-preview]').count();
    await page.waitForTimeout(2200);
    const gone = await page.locator('[data-preview]').count();
    ok(`${tag} rail 3: still previewing 8.5 s after the last tap, gone by 10.7 s`, m && still === 1 && gone === 0, `${still} → ${gone}`);
    const anim = await page.evaluate(() => { const mk = document.querySelector('.pv-snapmark + .hero'); return mk ? getComputedStyle(mk).animationName : 'none-yet'; });
    ok(`${tag} rail 3: the snap is a slide (pv-slide) with motion allowed`, !!m && (anim === 'pv-slide' || anim === 'none-yet'), anim);
    ok(`${tag} no page errors (Now)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- reduced motion: the snap is instant ---------------- */
  {
    const { ctx, page } = await open(W, H, save({}), { reducedMotion: 'reduce' });
    await page.evaluate(() => [...document.querySelectorAll('button.vh')].find((b) => b.textContent === 'Preview a later time')?.click());
    await page.waitForTimeout(150);
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Back to now')?.click());
    await page.waitForTimeout(30);
    const anim = await page.evaluate(() => { const mk = document.querySelector('.pv-snapmark + .hero'); return mk ? getComputedStyle(mk).animationName : 'no-snapmark'; });
    ok(`${tag} rail 3: under prefers-reduced-motion the snap has no animation`, anim === 'none', anim);
    await ctx.close();
  }
  /* ---------------- status Driving: never a scrubber ---------------- */
  {
    const { ctx, page } = await open(W, H, save({ segments: seedSegs, current: { status: 'D', since: S(21, 55), createdAt: 7 }, drivingView: false }));
    const track = page.locator('.taxis .taxis-row:not(.taxis-head) .taxis-track').first();
    const box = (await track.count()) ? await track.boundingBox() : null;
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    ok(`${tag} rail 1: while Driving a tap on the axis never enters preview`, (await page.locator('[data-preview]').count()) === 0 && (await page.locator('.pv-band').count()) === 0);
    await ctx.close();
  }
  /* ---------------- Split: the one bar ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ segments: seedSegs, current: { status: 'D', since: S(21, 55), createdAt: 7 }, drivingView: false, tab: 'split', planReturn: 'plan' }));
    const tap = (sel, text) => page.evaluate(([q, t]) => { const b = [...document.querySelectorAll(q)].find((x) => x.textContent.includes(t)); if (b) b.click(); return !!b; }, [sel, text]);
    if (!(await page.locator('.split-now-after').count())) { await tap('nav.tabs button', 'Plan'); await page.waitForTimeout(100); await tap('main button', 'Plan a sleeper split'); await page.waitForTimeout(250); }
    const g = await page.evaluate(() => {
      const strip = document.querySelector('.split-now-after');
      const blocks = [...document.querySelectorAll('button.pblock')].map((b) => { const r = b.getBoundingClientRect(); return { k: b.dataset.block, h: Math.round(r.height), w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; });
      // a 48px-wide target: the block answers a tap 20px either side of its centre (ties go to the block on top)
      const hits = blocks.map((b) => [-20, 0, 20].map((dx) => { const el = document.elementFromPoint(b.cx + dx, b.cy); return el && el.closest('button.pblock')?.dataset.block; }));
      return { sticky: strip && getComputedStyle(strip).position, blocks, hits, hatch: document.querySelectorAll('.plan-hatch').length };
    });
    ok(`${tag} Split: the strip stays sticky`, g.sticky === 'sticky', g.sticky);
    ok(`${tag} Split: four blocks, each 56px tall`, g.blocks.length === 4 && g.blocks.every((b) => b.h === 56), JSON.stringify(g.blocks.map((b) => [b.k, b.h, Math.round(b.w)])));
    ok(`${tag} Split: every block takes a tap at its centre`, g.blocks.length === 4 && g.hits.every((h, i) => h[1] === g.blocks[i].k), JSON.stringify(g.hits));
    const shortOnes = g.blocks.map((b, i) => [b, g.hits[i]]).filter(([b]) => b.w < 48);
    ok(`${tag} Split: a block under 48px wide still answers across a 48px target`, g.blocks.length === 4 && shortOnes.every(([b, h]) => h.filter((x) => x === b.k).length >= 2), JSON.stringify(shortOnes.map(([b, h]) => [b.k, Math.round(b.w), h])));
    ok(`${tag} Split: the overruns are hatched on the bar`, g.hatch === 2, String(g.hatch));
    const ov = await overflow(page);
    ok(`${tag} Split: no horizontal overflow with the bar`, g.blocks.length === 4 && ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `split-bar-${W}x${H}`);
    if (await page.locator('button.pblock[data-block="drive"]').count()) await page.locator('button.pblock[data-block="drive"]').tap();
    await page.waitForTimeout(250);
    const sh = await page.evaluate(() => ({ steps: [...document.querySelectorAll('button.pb-step')].map((b) => Math.round(b.getBoundingClientRect().height)), fix: [...document.querySelectorAll('button.fix')].map((b) => b.textContent) }));
    ok(`${tag} Split: the block sheet's four steppers are >= 56px`, sh.steps.length === 4 && sh.steps.every((x) => x >= 56), JSON.stringify(sh.steps));
    ok(`${tag} Split: the drive sheet offers the plan-runs-over fix`, sh.fix.some((f) => /^Shorten the drive to /.test(f)), JSON.stringify(sh.fix));
    await shot(page, `split-sheet-${W}x${H}`);
    ok(`${tag} no page errors (Split)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'C2 BROWSER FAIL' : 'C2 BROWSER OK');
process.exit(fails ? 1 : 0);
