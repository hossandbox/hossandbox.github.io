// Capstone C3 — the real-browser lane for what the DOM shim cannot see (audit §3 M7, M8 + D10-A,
// M5, M14): computed geometry of the new screens and the browser's own URL / history handling.
// The shim lane (test/dom/c3.mjs) owns the behaviour; this lane checks, in Chrome, at 412x915 and
// 360x640:
//   Load: question 3½ and the big-clock sheet (keys >= 56px), the answer with an appointment line
//   and [Text dispatch] (>= 48px), no horizontal overflow;
//   Hours coming back: reached through a real ?go=recap address, which is cleaned to "./" with the
//   back-nav marker kept in history.state; the week strip's 8 bars (each a tap target >= 48px
//   tall), the hatch drawn as a stripe, no overflow; the phone's Back from it lands on Plan;
//   Plan hub: 4 items; More: the pointer row >= 48px;
//   welcome back: the chip and its two keys (>= 48px) under the answer; none in the driving view;
//   ?go=stopped opens the status panel; the served manifest carries the three shortcuts.
// usage: node test/dom/c3browser.mjs [--root dist] [--shots DIR]
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
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`C3 BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`C3 BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`C3 BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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

// The audit's standard seed with its "now" (Mon 03:04) at the real minute, shifted back by `late`
// minutes (late 0 = the seed; late 190 = the 14 ended 40 minutes ago).
const nowMinute = Math.floor(Date.now() / 60000);
const seed = (late = 0) => {
  const off = nowMinute - (24 * 60 + 3 * 60 + 4) - late;
  const S = (h, m = 0) => off + h * 60 + m;
  return { S, segs: [
    { status: 'OFF', start: S(5, 40), end: S(7, 40), createdAt: 1 }, { status: 'SB', start: S(7, 40), end: S(15, 40), createdAt: 2 },
    { status: 'ON', start: S(15, 40), end: S(16, 25), createdAt: 3 }, { status: 'D', start: S(16, 25), end: S(19, 10), createdAt: 4 },
    { status: 'OFF', start: S(19, 10), end: S(19, 40), createdAt: 5 }, { status: 'ON', start: S(19, 40), end: S(21, 55), createdAt: 6 }] };
};
const save = (over, late = 0) => {
  const { S, segs } = seed(late);
  return JSON.stringify({
    segments: segs, current: { status: 'D', since: S(21, 55), createdAt: 7 }, drivingView: false,
    historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'night', nowCard: 'timeline', nowCardAsked: true,
    config: { timeZone: 'America/New_York' }, ...over,
  });
};

const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (W, H, saved, path = '/') => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('c3seeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('c3seeded', '1'); } } catch { /* ignore */ } }, saved);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + path, { waitUntil: 'load' });
  await page.waitForSelector('#root *');
  await page.waitForTimeout(300);
  const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
  if (await ack.count()) await ack.first().click();
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  return { ctx, page, errors };
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: false }); };
const overflow = (page) => page.evaluate(() => { const de = document.documentElement; const vw = de.clientWidth; let wide = 0; for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; if ((r.right > vw + 0.5 || r.left < -0.5) && !el.classList.contains('vh')) wide++; } return { wide, docW: de.scrollWidth, vw }; });
const tapText = (page, sel, re) => page.evaluate(([q, src]) => { const r = new RegExp(src); const b = [...document.querySelectorAll(q)].find((x) => r.test(x.textContent.trim())); if (b) b.click(); return !!b; }, [sel, re.source]);
/** A relaunch opens on Now (the tab is not restored), so the lane walks to the load question. */
const toLoad = async (page) => { if (!(await page.locator('.flow-head').count())) { await tapText(page, 'nav.tabs button', /Plan$/); await page.waitForTimeout(120); await tapText(page, 'button.plan-item', /Can I take this load\?/); await page.waitForTimeout(250); } };
const heights = (page, sel) => page.evaluate((q) => [...document.querySelectorAll(q)].map((b) => Math.round(b.getBoundingClientRect().height)), sel);

for (const [W, H] of [[412, 915], [360, 640]]) {
  const tag = `[${W}x${H}]`;
  /* ---------------- Load: question 3½, the big clock, the answer with an appointment ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'load', planReturn: 'plan', loadCheck: { miles: 300, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false, answered: false } }));
    await toLoad(page);
    await tapText(page, 'button', /^Next: when you leave/); await page.waitForTimeout(120);
    const pick = await heights(page, 'button.pick-time');
    ok(`${tag} Load q2: [Pick a time] is a >= 56px key`, pick.length === 1 && pick[0] >= 56, JSON.stringify(pick));
    await tapText(page, 'button', /^Pick a time$/); await page.waitForTimeout(200);
    const keys = await heights(page, '.sheet .ed-keys button');
    ok(`${tag} Load: the big clock's keys are >= 56px`, keys.length === 6 && keys.every((x) => x >= 56), JSON.stringify(keys));
    let ov = await overflow(page);
    ok(`${tag} Load: no horizontal overflow with the clock sheet`, keys.length === 6 && ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `load-clock-${W}x${H}`);
    await tapText(page, 'button', /^Close$/); await page.evaluate(() => document.querySelector('.sheet-backdrop')?.click()); await page.waitForTimeout(150);
    await tapText(page, 'button', /^Next: time at the receiver/); await page.waitForTimeout(120);
    await tapText(page, 'button', /^Next: appointment time/); await page.waitForTimeout(150);
    const q35 = await page.evaluate(() => ({ q: document.querySelector('h1.flow-q')?.textContent, chips: [...document.querySelectorAll('.chips button')].map((b) => [b.textContent, Math.round(b.getBoundingClientRect().height)]) }));
    ok(`${tag} Load q3½: "Appointment at the receiver?" with two >= 56px answers`, q35.q === 'Appointment at the receiver?' && q35.chips.length === 2 && q35.chips.every(([, h]) => h >= 56), JSON.stringify(q35));
    ov = await overflow(page);
    ok(`${tag} Load q3½: no horizontal overflow`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `load-appt-q-${W}x${H}`);
    ok(`${tag} no page errors (Load questions)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  for (const [label, apptOff] of [['late', 60 * 9], ['on time', 60 * 30]]) {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'load', planReturn: 'plan', loadCheck: { miles: 300, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false, answered: true, appt: nowMinute + apptOff } }));
    await toLoad(page);
    const a = await page.evaluate(() => { const s = document.querySelector('section.verdict.appt'); const d = document.querySelector('.row.dispatch button'); return { text: s?.textContent, cls: s?.className, dispatch: d && [d.textContent.trim(), Math.round(d.getBoundingClientRect().height)] }; });
    const want = label === 'late' ? /Late by .+ — earliest arrival / : /On time — .+ to spare/;
    ok(`${tag} Load answer (${label}): the appointment line shows in the ${label === 'late' ? 'No' : 'Yes'} look`, !!a.text && want.test(a.text) && a.cls.includes(label === 'late' ? 'no' : 'yes'), JSON.stringify(a));
    ok(`${tag} Load answer (${label}): [Text dispatch] is a >= 48px key`, a.dispatch && a.dispatch[0] === 'Text dispatch' && a.dispatch[1] >= 48, JSON.stringify(a.dispatch));
    const ov = await overflow(page);
    ok(`${tag} Load answer (${label}): no horizontal overflow`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await page.evaluate(() => document.querySelector('section.verdict.appt')?.scrollIntoView({ block: 'center' }));
    await shot(page, `load-answer-${label.replace(' ', '')}-${W}x${H}`);
    ok(`${tag} no page errors (Load answer, ${label})`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- Hours coming back, through a real shortcut address ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'now' }), '/?go=recap');
    const r = await page.evaluate(() => ({
      search: location.search, path: location.pathname, marker: history.state && history.state.app,
      title: document.querySelector('h1.screen-title')?.textContent,
      bars: [...document.querySelectorAll('button.wk-day')].map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }),
      hatch: (() => { const e = document.querySelector('.wk-hatch'); return e ? getComputedStyle(e).backgroundImage : 'none'; })(),
      sentence: document.querySelector('.hours-back')?.textContent,
    }));
    ok(`${tag} ?go=recap lands on Hours coming back`, r.title === 'Hours coming back', r.title);
    ok(`${tag} the address is cleaned to "./" and history.state keeps the back-nav marker`, r.search === '' && r.path === '/' && r.marker === 'hos-sandbox', JSON.stringify(r));
    ok(`${tag} the week strip: 8 bars, each a tap target >= 48px tall and > 0 wide`, r.bars.length === 8 && r.bars.every(([w, h]) => w > 0 && h >= 48), JSON.stringify(r.bars));
    ok(`${tag} the one sentence leads the screen`, /^70 hours: .+ left · \+.+ back at .+ \(midnight Eastern\)$/.test(r.sentence || ''), r.sentence);
    const ov = await overflow(page);
    ok(`${tag} Hours coming back: no horizontal overflow`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `hours-back-${W}x${H}`);
    // a real bar tap opens History at that day
    const bar = page.locator('button.wk-day').nth(6);
    if (await bar.count()) await bar.tap();
    await page.waitForTimeout(250);
    const hist = await page.evaluate(() => ({ title: document.querySelector('h1.screen-title')?.textContent, focus: !!document.querySelector('.hist-focus') }));
    ok(`${tag} a real tap on a bar opens that day in History`, hist.title === 'Your last 8 days' && hist.focus, JSON.stringify(hist));
    ok(`${tag} no page errors (Hours coming back)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- a week of work: the roll-off is hatched ---------------- */
  {
    const day0 = Math.floor(nowMinute / 1440) * 1440;
    const week = [];
    for (let d = 7; d >= 1; d--) { const b = day0 - d * 1440; week.push({ status: 'ON', start: b + 600, end: b + 660, createdAt: 100 - d }, { status: 'D', start: b + 660, end: b + 1140, createdAt: 200 - d }, { status: 'OFF', start: b + 1140, end: b + 1440 + 600, createdAt: 300 - d }); }
    const last = week[week.length - 1]; last.end = nowMinute - 1;
    const { ctx, page, errors } = await open(W, H, JSON.stringify({ segments: week, current: { status: 'OFF', since: nowMinute - 1, createdAt: 999 }, historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'night', nowCard: 'timeline', nowCardAsked: true, config: { timeZone: 'America/New_York' } }), '/?go=recap');
    const hz = await page.evaluate(() => { const e = document.querySelector('.wk-hatch'); return e ? { bg: getComputedStyle(e).backgroundImage, h: Math.round(e.getBoundingClientRect().height), drops: e.getAttribute('data-drops'), first: e.closest('button') === document.querySelector('button.wk-day') } : null; });
    ok(`${tag} the roll-off is drawn as a stripe (a shape, not a colour) on the oldest bar`, hz && /repeating-linear-gradient/.test(hz.bg) && hz.h > 0 && Number(hz.drops) > 0 && hz.first, JSON.stringify(hz));
    await shot(page, `hours-back-week-${W}x${H}`);
    ok(`${tag} no page errors (week of work)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- Plan hub → Hours coming back → the phone's Back ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'now' }));
    await tapText(page, 'nav.tabs button', /Plan$/); await page.waitForTimeout(150);
    const items = await page.evaluate(() => [...document.querySelectorAll('button.plan-item')].map((b) => b.querySelector('b')?.textContent));
    ok(`${tag} the Plan hub lists 4 items, Hours coming back 4th`, items.length === 4 && items[3] === 'Hours coming back', JSON.stringify(items));
    const ov = await overflow(page);
    ok(`${tag} Plan hub: no horizontal overflow`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await shot(page, `plan-hub-${W}x${H}`);
    await tapText(page, 'button.plan-item', /Hours coming back/); await page.waitForTimeout(200);
    await page.goBack(); await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelector('h1.screen-title')?.textContent);
    ok(`${tag} the phone's Back from Hours coming back lands on Plan`, after === 'Plan', after);
    await tapText(page, 'nav.tabs button', /More$/); await page.waitForTimeout(150);
    const moved = await page.evaluate(() => { const b = [...document.querySelectorAll('button.rowbtn')].find((x) => x.textContent.trim() === 'Hours coming back has moved to Plan ›'); return b ? Math.round(b.getBoundingClientRect().height) : 0; });
    ok(`${tag} More: the pointer row is a >= 48px row`, moved >= 48, String(moved));
    ok(`${tag} no page errors (Plan / More)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- welcome back ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'now' }, 190));
    const w = await page.evaluate(() => { const c = document.querySelector('.welcome'); return c && { text: c.textContent, min: Math.floor(Date.now() / 60000), keys: [...c.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)) }; });
    // The seed's live D started 8h 19m before the lane's start minute; the page reads its own
    // clock, so the expected span follows the page's minute (a rollover mid-lane is not a fail).
    const span = w ? 8 * 60 + 19 + (w.min - nowMinute) : 0;
    ok(`${tag} welcome back: "Still Driving?" under the answer, two >= 48px keys`, w && new RegExp(`^Still Driving\\? Since \\d\\d:\\d\\d — ${Math.floor(span / 60)}h ${String(span % 60).padStart(2, '0')}m\\.`).test(w.text) && w.keys.length === 2 && w.keys.every((x) => x >= 48), JSON.stringify(w));
    const ov = await overflow(page);
    ok(`${tag} welcome back: no horizontal overflow`, !!w && ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await page.evaluate(() => document.querySelector('.welcome')?.scrollIntoView({ block: 'center' }));
    await shot(page, `welcome-${W}x${H}`);
    ok(`${tag} no page errors (welcome back)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
    const dv = await open(W, H, save({ tab: 'now', drivingView: true }, 190));
    ok(`${tag} welcome back: never in the driving view`, (await dv.page.locator('.welcome').count()) === 0 && (await dv.page.locator('main.drive').count()) === 1);
    await dv.ctx.close();
  }
  /* ---------------- ?go=stopped and the served manifest ---------------- */
  {
    const { ctx, page, errors } = await open(W, H, save({ tab: 'now', drivingView: true }), '/?go=stopped');
    const s = await page.evaluate(async () => ({ sheet: document.querySelector('#sheet-title')?.textContent, search: location.search, man: await (await fetch('./manifest.webmanifest')).json() }));
    ok(`${tag} ?go=stopped opens the status panel (over the driving view)`, s.sheet === 'What are you doing now?' && s.search === '', JSON.stringify({ sheet: s.sheet, search: s.search }));
    ok(`${tag} the served manifest carries the three shortcuts`, (s.man.shortcuts || []).map((x) => x.url).join(' ') === './?go=load ./?go=stopped ./?go=recap', JSON.stringify(s.man.shortcuts));
    ok(`${tag} no page errors (shortcuts)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'C3 BROWSER FAIL' : 'C3 BROWSER OK');
process.exit(fails ? 1 : 0);
