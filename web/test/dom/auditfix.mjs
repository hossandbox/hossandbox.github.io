// Audit-fix lane (2026-11-20): pins the fixes for the first-time-user UX audit (AUDIT.md), in a
// REAL browser (layout, stickiness, hit boxes and native dialogs cannot be read from the DOM
// shim). Each pin is named by its audit id. Run with TZ=America/Chicago against a built dist:
//   TZ=America/Chicago node test/dom/auditfix.mjs [--root dist]
// The browser is not a package dependency (same as layout.mjs): HOS_BROWSER / HOS_PLAYWRIGHT.
// A missing browser is a FAILURE of this lane (exit 2), never a silent pass.
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { wrapDriverSeed, unlockSplashInBrowser } from './driver-test-seed.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = resolve(arg('--root', 'dist')) + '/';
const PW = process.env.HOS_PLAYWRIGHT || '/home/hatch/workspace/hos-patch/p18-scratch/';
const CHROME = process.env.HOS_BROWSER || '/home/hatch/workspace/hos-patch/p18-scratch/chrome-headless-shell-linux64/chrome-headless-shell';
let chromium;
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`AUDITFIX LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`AUDITFIX LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`AUDITFIX LANE CANNOT RUN: no built app under ${ROOT} (build first)`); process.exit(2); }
if (process.env.TZ !== 'America/Chicago') { console.log('AUDITFIX LANE CANNOT RUN: set TZ=America/Chicago (the pins read wall-clock times)'); process.exit(2); }

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

// A fixed wall clock: Fri Nov 20 2026, 23:00 Chicago. Every page runs on it (Date is replaced
// before the app loads), so the seeds below are deterministic.
const NOW_MS = new Date(2026, 10, 20, 23, 0).getTime();
const N = Math.floor(NOW_MS / 60000);
const base = { historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard: 'dial', nowCardAsked: true, speechAsked: true, speakAsked: true };
// A working day: On Duty for 20 min after a drive, so the dock is up (not the driving view).
const DAY = { ...base, segments: [
  { status: 'OFF', start: N - 1000, end: N - 400, createdAt: 1 },
  { status: 'ON', start: N - 400, end: N - 370, createdAt: 2 },
  { status: 'D', start: N - 370, end: N - 20, createdAt: 3 },
], current: { status: 'ON', since: N - 20, createdAt: 4 } };
// The audit's D8 record: Off Duty 08:00→18:00 (exactly 10h), On Duty 18:00→18:50, Driving 18:50→22:50,
// a long shift before the rest, now Off Duty since 22:50.
const D8 = { ...base, segments: [
  { status: 'OFF', start: N - 2400, end: N - 1400, createdAt: 1 },
  { status: 'ON', start: N - 1400, end: N - 1370, createdAt: 2 },
  { status: 'D', start: N - 1370, end: N - 900, createdAt: 3 },
  { status: 'OFF', start: N - 900, end: N - 300, createdAt: 4 },
  { status: 'ON', start: N - 300, end: N - 250, createdAt: 5 },
  { status: 'D', start: N - 250, end: N - 10, createdAt: 6 },
], current: { status: 'OFF', since: N - 10, createdAt: 7 } };
// Rows the ELD quick start would have built (note "ELD clocks").
const ELD = { ...base, seededAt: N - 30, segments: [
  { status: 'OFF', start: N - 900, end: N - 300, note: 'ELD clocks', createdAt: 1 },
  { status: 'D', start: N - 300, end: N - 30, note: 'ELD clocks', createdAt: 1 },
], current: { status: 'OFF', since: N - 30, createdAt: 2 } };

const res = []; const ok = (name, cond, info = '') => res.push({ pass: !!cond, name, info: typeof info === 'string' ? info : JSON.stringify(info) });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });

const OPEN = new Set();
/** One audit section: a throw (a control that is not there) is a FAIL of that section, never a crash of the lane. */
async function section(f) {
  try { await f(); } catch (e) { ok(`section threw: ${String(e && e.message || e).split('\n')[0]}`, false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  finally { for (const c of OPEN) { await c.close().catch(() => {}); } OPEN.clear(); }
}
async function open(seed, W = 412, H = 915) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript((t) => { const D = Date; const off = t - D.now(); class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } } globalThis.Date = F; }, NOW_MS);
  const wrapped = wrapDriverSeed(seed ?? { segments: [], tentative: [], current: null, disclaimerAcked: true });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('af-seeded')) { sessionStorage.setItem('af-seeded', '1'); localStorage.clear(); if (s) localStorage.setItem('hos-sandbox-v1', s); } }, wrapped);
  const page = await ctx.newPage();
  page.errors = []; page.dialogs = 0;
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('dialog', (d) => { page.dialogs++; d.dismiss().catch(() => {}); });
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('#root *');
  await unlockSplashInBrowser(page);
  await page.waitForTimeout(200);
  const ack = page.locator('button', { hasText: /I understand|Understood — don't show again/ });
  if (await ack.count()) { await ack.first().click(); await page.waitForTimeout(300); }
  page.ctx = ctx; OPEN.add(ctx);
  return page;
}
const wait = (p, ms = 250) => p.waitForTimeout(ms);
/** DOM click on the first visible-in-tree element matching sel whose text matches. */
const tap = async (p, sel, text, ms = 300) => {
  await p.evaluate(([q, t]) => {
    const re = t ? new RegExp(t) : null;
    const b = [...document.querySelectorAll(q)].find((x) => !re || re.test(x.textContent.replace(/\s+/g, ' ').trim()) || re.test(x.getAttribute('aria-label') || ''));
    if (!b) throw new Error(`no ${q} matching ${t}`);
    b.click();
  }, [sel, text ? text.source ?? text : null]);
  await wait(p, ms);
};
// Re-aimed (2026-11-21 nav-gear + transitions + plan-dissolve, Lorico): Settings and Plan tools open
// as full-screen rooms (main chrome hidden/inert while in a room); exit the active room first.
const exitRoom = async (p) => {
  for (let i = 0; i < 6; i++) {
    const mode = await p.evaluate(() => {
      const app = document.querySelector('.app');
      if (!app) return null;
      if (app.classList.contains('in-settings')) return 'settings';
      if (app.classList.contains('in-plan-tool')) return 'plan-tool';
      return null;
    });
    if (!mode) return;
    if (mode === 'settings') await tap(p, 'section.page-settings button.settings-back', null, 350);
    else await tap(p, 'section.page-tool button.back, section.page-tool .flow-head button', null, 350);
  }
};
const go = async (p, tab) => {
  await exitRoom(p);
  if (tab === 'More' || tab === 'Settings') {
    await tap(p, 'header.top button[aria-label="Settings"]', null, 400);
    return;
  }
  await tap(p, 'nav.tabs button', new RegExp(tab), 900);
};
const sheetText = (p) => p.evaluate(() => document.querySelector('.sheet')?.innerText ?? '');
const pageText = (p) => p.evaluate(() => document.querySelector('.page.is-active')?.innerText ?? document.body.innerText);
const rect = (p, sel) => p.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, sel);
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}'));
const closeSheet = async (p) => { await p.keyboard.press('Escape'); await wait(p, 200); };

/* ---------------- D1: the first-run hero at its real height ---------------- */
await section(async () => {
  const p = await open(null);
  const m = await p.evaluate(() => {
    const h = document.querySelector('.hero'); if (!h) return null;
    const r = h.getBoundingClientRect();
    const kids = [...h.children].map((c) => c.getBoundingClientRect().bottom);
    return { h: r.height, bottom: r.bottom, maxKid: Math.max(...kids), demo: document.querySelector('.app.is-demo') !== null, flexShrink: getComputedStyle(h).flexShrink };
  });
  ok('D1 empty log (demo): the hero renders at its real height, not a 30px sliver', m && m.demo && m.h > 300, m);
  ok('D1 empty log: every hero child sits inside the hero box (nothing painted over it)', m && m.maxKid <= m.bottom + 1, m);
  ok('D1 .page children never shrink (flex-shrink 0)', m && m.flexShrink === '0', m);
  ok('D1 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

/* ---------------- D2 / D3: status-tap undo on screen for all four statuses ---------------- */
for (const [label, st] of [['Off Duty', 'OFF'], ['Sleeper', 'SB']]) await section(async () => {
  const p = await open(DAY);
  await p.evaluate(() => { const pg = document.querySelector('.page.is-active'); if (pg) pg.scrollTop = 0; });
  await p.locator('.status-buttons button', { hasText: label }).click({ timeout: 5000 }); await wait(p, 300);
  const chip = await rect(p, '.status-undo'); const nav = await rect(p, 'nav.tabs');
  const txt = await p.evaluate(() => document.querySelector('.status-undo')?.textContent ?? '');
  ok(`D2 ${label} tap: the undo chip is on screen, above the tab bar, with the page at the top`, chip && chip.top >= 0 && chip.bottom <= nav.top + 0.5, { chip, nav });
  ok(`D2 ${label} tap: the chip names the tap ("${label} since HH:MM")`, new RegExp(`^${label} since \\d\\d:\\d\\d\\.`).test(txt), txt);
  ok(`D2 ${label} tap: the chip rides the sticky dock (inside .dock)`, await p.evaluate(() => !!document.querySelector('.dock > .status-undo')));
  await p.locator('.status-undo button', { hasText: 'Undo' }).click({ timeout: 5000 }); await wait(p, 300);
  ok(`D2 ${label} tap: Undo restores On Duty`, (await state(p)).current?.status === 'ON', (await state(p)).current);
  await p.ctx.close();
});
await section(async () => {
  // On Duty: from Off Duty
  const p = await open({ ...DAY, segments: DAY.segments.slice(0, 1), current: { status: 'OFF', since: N - 400, createdAt: 2 } });
  await p.locator('.status-buttons button', { hasText: 'On Duty' }).click({ timeout: 5000 }); await wait(p, 300);
  const chip = await rect(p, '.status-undo'); const nav = await rect(p, 'nav.tabs');
  ok('D2 On Duty tap: the undo chip is on screen above the tab bar', chip && chip.top >= 0 && chip.bottom <= nav.top + 0.5, { chip, nav });
  await p.locator('.status-undo button', { hasText: 'Undo' }).click({ timeout: 5000 }); await wait(p, 300);
  ok('D2 On Duty tap: Undo restores Off Duty', (await state(p)).current?.status === 'OFF');
  await p.ctx.close();
});
await section(async () => {
  const p = await open(DAY);
  await p.locator('.status-buttons button', { hasText: 'Driving' }).click({ timeout: 5000 }); await wait(p, 400);
  const dlg = await p.locator('button', { hasText: /^(Not now|No thanks|No)$/ });
  if (await dlg.count()) { await dlg.first().click(); await wait(p, 200); }
  const inDrive = await p.evaluate(() => !!document.querySelector('main.drive'));
  const chip = await rect(p, '.drive-undo'); const stop = await rect(p, 'button.drive-stop');
  const txt = await p.evaluate(() => document.querySelector('.drive-undo')?.textContent ?? '');
  ok('D3 Driving tap: the driving view shows an undo chip on screen, above "I\'ve stopped"', inDrive && chip && chip.top >= 0 && chip.bottom <= stop.top, { inDrive, chip, stop });
  ok('D3 Driving tap: the chip reads "Driving since HH:MM."', /^Driving since \d\d:\d\d\./.test(txt), txt);
  await p.locator('.drive-undo button', { hasText: 'Undo' }).click({ timeout: 5000 }); await wait(p, 400);
  ok('D3 Driving undo: back to On Duty and the normal Now (dock showing)', (await state(p)).current?.status === 'ON' && await p.evaluate(() => !document.querySelector('main.drive') && !!document.querySelector('.dock')));
  ok('D2/D3 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

/* ---------------- D4 / D5: the status sheet asks when first; one order everywhere ---------------- */
await section(async () => {
  const p = await open(DAY);
  const ORDER = ['Off Duty', 'Sleeper', 'Driving', 'On Duty'];
  const dock = await p.evaluate(() => [...document.querySelectorAll('.status-buttons button')].map((b) => b.textContent.trim()));
  ok('D5 dock order: Off Duty · Sleeper · Driving · On Duty', JSON.stringify(dock) === JSON.stringify(ORDER), dock);
  await tap(p, 'button.dock-more');
  const m = await p.evaluate(() => {
    const sh = document.querySelector('.sheet');
    const h3 = [...sh.querySelectorAll('h3')].find((x) => /When did it start\?/.test(x.textContent));
    const box = sh.querySelector('input[aria-label="Started this many minutes ago"]');
    const first = sh.querySelector('.big-status button');
    return { when: h3?.getBoundingClientRect().top, box: box?.getBoundingClientRect().top, status: first?.getBoundingClientRect().top, order: [...sh.querySelectorAll('.big-status button')].map((b) => b.textContent.trim()), focus: document.activeElement?.textContent };
  });
  ok('D4 status sheet: "When did it start?" and the minutes box sit ABOVE the status buttons', m.when < m.status && m.box < m.status, m);
  ok('D4 status sheet: focus lands on "When did it start?"', /When did it start\?/.test(m.focus || ''), m.focus);
  ok('D5 status sheet order: Off Duty · Sleeper · Driving · On Duty', JSON.stringify(m.order) === JSON.stringify(ORDER), m.order);
  // D4: the typed minutes are honoured by the status tap
  await p.fill('.sheet input[aria-label="Started this many minutes ago"]', '7'); await wait(p, 100);
  await tap(p, '.sheet .big-status button', /^Off Duty$/);
  ok('D4 a typed "7 min ago" then a status tap commits at now − 7', (await state(p)).current?.since === N - 7, (await state(p)).current);
  await go(p, 'Log');
  await tap(p, 'button.addbtn');
  const what = await p.evaluate(() => [...document.querySelectorAll('.sheet button.opt b')].slice(0, 4).map((b) => b.textContent.trim()));
  ok('D5 Log add order and names: Off Duty · Sleeper · Driving · On Duty', JSON.stringify(what) === JSON.stringify(ORDER), what);
  await p.ctx.close();
});

/* ---------------- D19: End my day asks Off Duty or Sleeper; one control once closed ---------------- */
await section(async () => {
  const p = await open(DAY);
  await tap(p, 'button.wide', /^End my day$/);
  const ask = await p.evaluate(() => [...document.querySelectorAll('.endday-ask button')].map((b) => b.textContent.trim()));
  ok('D19 End my day asks first: [Off Duty] [Sleeper] [Not yet]; nothing closed yet', JSON.stringify(ask) === '["Off Duty","Sleeper","Not yet"]' && (await state(p)).current?.status === 'ON', ask);
  await tap(p, '.endday-ask button', /^Sleeper$/);
  const st = await state(p);
  const t = await pageText(p);
  ok('D19 "Sleeper" closes the day IN the sleeper', st.current?.status === 'SB' && st.dayCloses?.length === 1, { cur: st.current, closes: st.dayCloses });
  ok('D19 closed: ONE row (Day closed · HH:MM · Sleeper · Reopen), no second "Closed the day at … Undo" row', /Day closed · \d\d:\d\d · Sleeper/.test(t) && !/Closed the day at/.test(t) && /Reopen/.test(t), t.slice(t.indexOf('Day closed') - 40, t.indexOf('Day closed') + 80));
  await tap(p, 'button.mini', /^Reopen$/);
  ok('D19 Reopen brings End my day back', /End my day/.test(await pageText(p)));
  await p.ctx.close();
});

/* ---------------- D6 / D7: one clock behaviour; no 12-hour field; date in the app's words ---------------- */
const pickerOnly = (p) => p.evaluate(() => {
  const sh = document.querySelector('.sheet'); if (!sh) return null;
  const pick = sh.querySelector('.ed-clock-pick input[type=time]');
  const txt = sh.innerText;
  return {
    picker: !!pick, keypadBox: !!sh.querySelector('.ed-type, input[placeholder="0641"]'), tapToType: !!sh.querySelector('.ed-clock-tap'),
    exactTime: /Exact time|Exact start time|Exact departure time/.test(txt), typeCaption: /tap the time to type it/.test(txt), pickCaption: /tap the time to pick it/.test(txt),
    ampm: /\b\d{1,2}:\d\d\s?(AM|PM)\b/.test(txt), timeInputs: sh.querySelectorAll('input[type=time]').length, minutesAgo: /Or minutes ago/.test(txt),
    day: sh.querySelector('.ed-day-val')?.textContent ?? null,
  };
});
await section(async () => {
  const p = await open(DAY);
  await tap(p, 'button.rowbtn', /Fix the start time/);
  const fs = await pickerOnly(p);
  ok('D6 Fix the start time: the big clock IS the picker (no keypad, no tap-to-type, one time input)', fs && fs.picker && !fs.keypadBox && !fs.tapToType && fs.timeInputs === 1 && fs.pickCaption && !fs.typeCaption, fs);
  ok('D6 Fix the start time: no "Exact time" row, no "Or minutes ago" box', fs && !fs.exactTime && !fs.minutesAgo, fs);
  ok('D7 Fix the start time: no 12-hour AM/PM text; "Another day" reads like "Fri Nov 20"', fs && !fs.ampm && /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/.test(fs.day || ''), fs);
  await closeSheet(p);
  // Declutter (Lorico, 2026-11-20): load check entry moved off Now; enter via Plan.
  await go(p, 'Plan');
  await tap(p, '.page-plan button.plan-item', /Can I take this load\?/, 700);
  await tap(p, 'button.flow-next', null);
  await tap(p, 'button.pick-time', /Pick a time/);
  const lv = await pickerOnly(p);
  ok('D6 load check "leave" time: the same picker clock, no keypad, no "Exact time"', lv && lv.picker && !lv.keypadBox && !lv.tapToType && !lv.exactTime && lv.timeInputs === 1, lv);
  await closeSheet(p);
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Plan a run/, 700);
  await tap(p, 'button.trip-dep', null);
  const tr = await pickerOnly(p);
  ok('D6 trip departure: the same picker clock, no keypad, no "Exact time"', tr && tr.picker && !tr.keypadBox && !tr.tapToType && !tr.exactTime, tr);
  ok('D7 trip departure: "Another day" in the app\'s words', tr && /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/.test(tr.day || ''), tr);
  await closeSheet(p);
  // P4: the trip planner names the tab by its name
  const trip = await pageText(p);
  ok('P4 trip planner: "under More", never "in Settings"', /under More/.test(trip) && !/in Settings/.test(trip), trip.match(/[^.]*speed[^.]*\./i)?.[0]);
  ok('D6/D7/P4 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

/* ---------------- D8 (+A1, P1, D9, D10, D12-adjacent, A2, A3): the audit's edit, disclosed ---------------- */
await section(async () => {
  const p = await open(D8);
  await go(p, 'Log');
  await p.locator('.page.is-active button.entry', { hasText: 'On Duty' }).first().click({ timeout: 5000 }); await wait(p);
  const menu = await sheetText(p);
  ok('D9 edit menu: says only the last change can be undone (no "Every change can be undone")', /only the last one/.test(menu) && !/Every change can be undone/.test(menu), menu.slice(-120));
  ok('A2 edit menu: no step counter on the menu', !/Step \d of \d/.test(menu));
  await tap(p, '.sheet button.act', /The times are wrong/);
  const when = await sheetText(p);
  ok('A3 edit start step: the context keeps the original times ("On Duty · was Fri 18:00 → 18:50")', /On Duty · was Fri 18:00 → 18:50/.test(when), when.slice(0, 160));
  ok('A2 edit start step: "Step 1 of 3"', /Step 1 of 3/.test(when));
  await tap(p, '.sheet button', /^15 minutes earlier$/, 200);
  await tap(p, '.sheet button.ed-go', /Next: when it ended/);
  const endS = await sheetText(p);
  ok('A2 edit end step: "Step 2 of 3" and "Next: check it"', /Step 2 of 3/.test(endS) && /Next: check it/.test(endS), endS.slice(0, 120));
  ok('A3 edit end step: the context keeps the original times', /was Fri 18:00 → 18:50/.test(endS), endS.slice(0, 160));
  await tap(p, '.sheet button.ed-go', /Next: check it/, 500);
  const chk = await sheetText(p);
  ok('A2 edit check: "Step 3 of 3 — Check"; rows What / Starts / Ends', /Step 3 of 3 — Check/.test(chk) && /\nStarts\n/.test(chk) && /\nEnds\n/.test(chk) && !/\nLength\n/.test(chk), chk.slice(0, 260));
  ok('D8 check: the edited row ends where it always did ("Ends 18:50 · 1h 05m" — end fixed, length absorbed the nudge)', /Ends\n18:50 · 1h 05m/.test(chk), chk);
  ok('D8 check lists the knock-on row: Off Duty 08:00 → 18:00 becomes 08:00 → 17:45 (the end-fixed edit runs into the break, not the drive)', /This runs into another entry/.test(chk) && /your Off Duty Fri 08:00 → Fri 18:00 would become Fri 08:00 → Fri 17:45/.test(chk) && !/would become Fri 18:35/.test(chk), chk);
  ok('D8 check says the 10-hour break stops being a reset (10h 00m → 9h 45m)', /Your 10h 00m break \(Fri 08:00 → Fri 18:00\) would become 9h 45m — under 10 hours, so it would no longer reset/.test(chk), chk);
  ok('D8 check says a violation appears (14-hour window)', /A violation would appear: 14-hour window/.test(chk), chk);
  ok('D8 check says what it does to drive time now (→ out of hours)', /Drive time left now: 4h 00m → none — out of hours/.test(chk), chk);
  ok('D12 check: one overlap warning (the absorb list), not two', !/This takes over part of your/.test(chk) && /This runs into another entry/.test(chk), chk);
  ok('P1 check: no "Absorb" anywhere; the button reads "Change the others and save"', !/absorb/i.test(chk) && /Change the others and save/.test(chk), chk);
  ok('D9 check: "Undo is on the Log until your next change." once, no "You can undo it from the Log"', (chk.match(/Undo is on the Log until your next change\./g) || []).length === 1 && !/You can undo it from the Log/.test(chk), chk.slice(-200));
  const a1 = await p.evaluate(() => {
    const sh = document.querySelector('.sheet'); const go = sh.querySelector('button.ed-go');
    const boxes = [...sh.querySelectorAll('.warnbox')]; const last = boxes[boxes.length - 1];
    sh.scrollTop = 0;
    return { pos: getComputedStyle(go).position, goTop: go.getBoundingClientRect().top + sh.scrollTop, lastBottom: last.getBoundingClientRect().bottom + sh.scrollTop, overlapAtTop: (() => { const g = go.getBoundingClientRect(); return boxes.some((b) => { const r = b.getBoundingClientRect(); return r.bottom > g.top && r.top < g.bottom; }); })() };
  });
  ok('A1 the confirm button is not sticky over the warnings it confirms (static, below the last warning, overlapping none)', a1.pos === 'static' && a1.goTop >= a1.lastBottom && !a1.overlapAtTop, a1);
  await tap(p, '.sheet button.ed-go', /Change the others and save/, 500);
  const st = await state(p);
  const drv = st.segments.find((x) => x.status === 'D' && x.end === N - 10);
  ok('D8 what was disclosed is what was saved: Driving unchanged, still starts 18:50 (the end-fixed edit never reached it)', drv && drv.start === N - 250, drv);
  const onRow = st.segments.find((x) => x.status === 'ON' && x.end === N - 250);
  ok('D8 the edited row saved with its end fixed: On Duty 17:45 → 18:50', !!onRow && onRow.start === N - 315, onRow);
  // Re-aimed (2026-11-21 removals): Log undo row removed from .log-scroll; undo machinery (hos-sandbox-undo-v1) still records the D10 "was" label.
  const d10 = await p.evaluate(() => ({
    logUndoEl: !!document.querySelector('.page.is-active .row.undo'),
    storedLabel: (() => { try { return JSON.parse(localStorage.getItem('hos-sandbox-undo-v1') || 'null')?.label ?? ''; } catch { return ''; } })(),
  }));
  ok('D10 Log undo row is absent after log edit while undo machinery still records NEW times and "was"', !d10.logUndoEl && /^Changed to On Duty Fri 17:45 → Fri 18:50 · was Fri 18:00 → Fri 18:50$/.test(d10.storedLabel), d10);
  ok('D8 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});
await section(async () => {
  // D8 negative: an edit that moves nothing else and breaks nothing shows no knock-on box
  const p = await open(D8);
  await go(p, 'Log');
  await p.locator('.page.is-active button.entry', { hasText: 'Driving' }).first().click({ timeout: 5000 }); await wait(p);
  await tap(p, '.sheet button.act', /The times are wrong/);
  await tap(p, '.sheet button.ed-go', /Next: when it ended/);
  await tap(p, '.sheet button', /^15 minutes earlier$/, 200);
  await tap(p, '.sheet button.ed-go', /Next: check it/, 500);
  const chk = await sheetText(p);
  ok('D8 an edit that only shortens a row discloses the knock-on (live status start) and the drive-time change, and raises no violation line', !/A violation would appear/.test(chk) && /Drive time left now:/.test(chk), chk);
  await p.ctx.close();
});
await section(async () => {
  // D8 on Fix the start time: the same disclosure, and A1 there
  const p = await open(D8);
  await tap(p, 'button.rowbtn', /Fix the start time/);
  for (let i = 0; i < 5; i++) await tap(p, '.sheet button', /^5 minutes earlier$/, 60);
  const t = await sheetText(p);
  ok('D8 Fix the start time discloses what it does to the hours (drive time now)', /Drive time left now:/.test(t), t.slice(-400));
  ok('D8 Fix the start time names the row before it that moves', /It also moves another entry:[\s\S]*your Driving Fri 18:50 → Fri 22:50 would become Fri 18:50 → Fri 22:25 \(25m shorter\)/.test(t), t.slice(-500));
  await p.ctx.close();
});

/* ---------------- A2 (add flow), D12 (add check) ---------------- */
await section(async () => {
  const p = await open(DAY);
  await go(p, 'Log');
  await tap(p, 'button.addbtn');
  ok('A2 add step 1: "Step 1 of 4"', /Step 1 of 4/.test(await sheetText(p)));
  await tap(p, '.sheet button.opt', /^On Duty/);
  const w = await sheetText(p);
  ok('A2 add step 2: "Step 2 of 4" and "Next: when it ended"', /Step 2 of 4/.test(w) && /Next: when it ended/.test(w));
  await tap(p, '.sheet button.ed-go', /Next: when it ended/);
  const l = await sheetText(p);
  ok('A2 add step 3: "Step 3 of 4" and "Next: check it"', /Step 3 of 4/.test(l) && /Next: check it/.test(l));
  await tap(p, '.sheet button.ed-go', /Next: check it/, 500);
  const c = await sheetText(p);
  ok('A2 add check: "Step 4 of 4 — Check"', /Step 4 of 4 — Check/.test(c), c.slice(0, 120));
  ok('D12 add check over other rows: the per-row absorb list only, not the general overlap sentence too', /This runs into/.test(c) && !/This takes over part of your/.test(c) && !/This goes inside your/.test(c), c);
  await p.ctx.close();
});

/* ---------------- D11: ELD quick-start rows are marked ---------------- */
await section(async () => {
  const p = await open(ELD);
  await go(p, 'Log');
  const m = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.page.is-active button.entry:not(.live)')];
    return { tags: rows.map((r) => r.querySelector('.eld-tag')?.textContent ?? null), dots: rows.map((r) => r.querySelector('.dot')?.classList.contains('eld-dot')), dashed: [...document.querySelectorAll('.page.is-active svg.grid line.s-D, .page.is-active svg.grid line.s-OFF')].map((l) => l.getAttribute('stroke-dasharray')) };
  });
  ok('D11 every ELD-built row carries "Estimate from your ELD clocks" and the hollow dot', m.tags.length >= 2 && m.tags.every((t) => t === 'Estimate from your ELD clocks') && m.dots.every(Boolean), m);
  ok('D11 the day grid draws ELD-built rows dotted', m.dashed.length > 0 && m.dashed.some((d) => d === '2 2'), m.dashed);
  await p.ctx.close();
});

/* ---------------- P2: a deleted row's hole is said, not blank ---------------- */
await section(async () => {
  const p = await open(D8);
  await go(p, 'Log');
  await p.locator('.page.is-active button.entry', { hasText: 'On Duty' }).first().click({ timeout: 5000 }); await wait(p);
  await tap(p, '.sheet button.act', /It never happened/, 400);
  const m = await p.evaluate(() => {
    const pg = document.querySelector('.page.is-active');
    const g = pg.querySelector('.gap-row');
    return { gap: g?.innerText.replace(/\s+/g, ' ') ?? null, isButton: g?.tagName === 'BUTTON', title: (pg.textContent.match(/Entries on this day \((\d+)\)/) || [])[1], rows: pg.querySelectorAll('button.entry').length };
  });
  ok('P2 the hole reads "No entry 18:00 → 18:50 · 50m" and says how the clocks treat it', m.gap && /No entry Fri 18:00 → Fri 18:50/.test(m.gap) && /count unlogged time as off duty/.test(m.gap) && /50m/.test(m.gap), m);
  ok('P2 the hole is not a button and is not counted as an entry', !m.isButton && String(m.rows) === m.title, m);
  await p.ctx.close();
});

/* ---------------- Plan: D13, D14, D15, A4, P3 ---------------- */
// 8h of driving already in this shift: the stock example's 5h drive would run over the 11.
const SPLIT = { ...base, segments: [
  { status: 'OFF', start: N - 1200, end: N - 540, createdAt: 1 },
  { status: 'ON', start: N - 540, end: N - 510, createdAt: 2 },
  { status: 'D', start: N - 510, end: N - 30, createdAt: 3 },
], current: { status: 'ON', since: N - 30, createdAt: 4 } };
await section(async () => {
  const p = await open(SPLIT);
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Plan a sleeper split/, 900);
  const line = await p.evaluate(() => document.querySelector('.sna-line')?.textContent ?? '');
  const st = await state(p);
  ok('D14 the split planner opens on a plan that does not run over (no ✕)', !/✕/.test(line), line);
  ok('D14 the example was fitted: drive shortened from the stock 5h', st.split && st.split.drive < 300 && st.split.b1 === 180 && st.split.b2 === 420, st.split);
  const btns = await p.evaluate(() => [...document.querySelectorAll('.page.is-active button')].map((b) => b.textContent.trim()));
  ok('D14 "Start over with an example" (no "Try an example split")', btns.includes('Start over with an example') && !btns.includes('Try an example split'));
  // P3: one Drive tile when the two agree
  const tiles = await p.evaluate(() => [...document.querySelectorAll('.page.is-active .clocks .stat')].map((s) => s.innerText.replace(/\s+/g, ' ')));
  const left = tiles.find((t) => /^Drive left/i.test(t)), nowT = tiles.find((t) => /^Drive now/i.test(t));
  ok('P3 "Drive now" shows only when it differs from "Drive left"', left && (!nowT || left.split(' ').slice(2, 4).join(' ') !== nowT.split(' ').slice(2, 4).join(' ')), tiles);
  // A4: block sheet exact length as hours + minutes
  await tap(p, 'button.pblock-drive', null);
  const ex = await p.evaluate(() => { const sh = document.querySelector('.sheet'); return { h: !!sh.querySelector('input[aria-label$=", hours"]'), m: !!sh.querySelector('input[aria-label$=", minutes"]'), raw: /Exact length · min/.test(sh.innerText) }; });
  ok('A4 block sheet: exact length is hours + minutes boxes, no raw-minutes box', ex.h && ex.m && !ex.raw, ex);
  await p.fill('.sheet input[aria-label$=", hours"]', '2'); await p.fill('.sheet input[aria-label$=", minutes"]', '15'); await wait(p, 200);
  ok('A4 typing 2 h 15 m sets the drive to 135 minutes', (await state(p)).split.drive === 135, (await state(p)).split);
  await p.fill('.sheet input[aria-label$=", minutes"]', '75'); await wait(p, 200);
  ok('A4 75 minutes is refused, visibly; the old value stands', (await state(p)).split.drive === 135 && /Minutes go 0 to 59/.test(await sheetText(p)));
  await closeSheet(p);
  const fine = await p.evaluate(() => [...document.querySelectorAll('.page.is-active details.fine input[type=number]')].map((i) => i.getAttribute('aria-label')));
  ok('A4 Fine-tune: every minutes slider is typed as hours + minutes', fine.length === 8 && fine.every((a) => /, (hours|minutes)$/.test(a)), fine);
  // D13
  await tap(p, '.page.is-active button.primary', /^Put plan on log as what-if$/, 400);
  const d13 = await p.evaluate(() => ({ chip: [...document.querySelectorAll('.page.is-active .row.undo')].map((r) => r.textContent).join('|'), btn: [...document.querySelectorAll('.page.is-active button.primary')].map((b) => [b.textContent.trim(), b.disabled]) }));
  ok('D13 putting the plan on the log answers back: an undo row + "Plan is on your log ✓"', /Plan added to your log as what-if\./.test(d13.chip) && d13.btn.some(([t, d]) => t === 'Plan is on your log ✓' && d), d13);
  ok('D13 the what-if rows are on the record', (await state(p)).tentative.length === 4);
  ok('Plan lane no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

/* ---------------- D15 on the audit's shape: a 12px on-duty block between two wide blocks ---------------- */
await section(async () => {
  const p = await open(DAY);
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Plan a sleeper split/, 900);
  const hit = await p.evaluate(() => {
    const b = document.querySelector('button.pblock-dwell'); if (!b) return null;
    const r = b.getBoundingClientRect(); const cy = r.top + r.height / 2;
    let n = 0; for (let x = Math.floor(r.left) - 40; x <= Math.ceil(r.right) + 40; x++) if (document.elementFromPoint(x, cy)?.closest('button.pblock')?.dataset.block === 'dwell') n++;
    const nb = ['b1', 'drive'].map((k) => document.querySelector(`button.pblock-${k}`)?.classList.contains('short'));
    return { w: r.width, short: b.classList.contains('short'), hitWidth: n, neighboursShort: nb };
  });
  ok('D15 setup: the on-duty block is drawn narrow (short) between two wide blocks', hit && hit.short && hit.w < 20 && hit.neighboursShort.every((x) => !x), hit);
  ok('D15 the narrow on-duty block takes taps across ≥ 44px', hit && hit.hitWidth >= 44, hit);
  const lab = await p.evaluate(() => { const l = document.querySelector('button.pblock-drive .pblock-in'); return l ? getComputedStyle(l).zIndex : null; });
  ok('D15 block labels sit above the 14-hour markers (z-index above the marker\'s 3)', Number(lab) > 3, lab);
  await p.ctx.close();
});

/* ---------------- A5: Recap ---------------- */
await section(async () => {
  const p = await open(D8);
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Hours coming back/, 900);
  const t = await pageText(p);
  const bars = await p.evaluate(() => [...document.querySelectorAll('.page.is-active .wk-label')].map((b) => b.textContent));
  ok('A5 Recap lists no "+0m" days', !/\+0m/.test(t), t.slice(0, 400));
  ok('A5 Recap: no "D-7", no ISO dates, no "engine", "Set"/"Edit" capitalised', !/\bD-\d/.test(t) && !/\d{4}-\d\d-\d\d/.test(t) && !/engine/.test(t) && !/\b(set|edit)\b(?! a past)/.test(t.replace(/“Set”/g, '')), t.match(/D-\d|\d{4}-\d\d-\d\d|engine/g));
  ok('A5 every bar is labelled "Ddd N" (one style)', bars.length >= 7 && bars.every((b) => /^[A-Z][a-z]{2} \d{1,2}$/.test(b)), bars);
  ok('A5 the header names the next day that gives hours back (or says none do)', /next back: \+\d+h? ?\d*m? at [A-Z][a-z]{2} [A-Z][a-z]{2} \d+|nothing comes back/.test(t), t.match(/hours: [^\n]*/)?.[0]);
  await p.ctx.close();
});

/* ---------------- D16, D18, A8, A9 ---------------- */
await section(async () => {
  const p = await open(DAY);
  // Declutter (Lorico, 2026-11-20): load check entry moved off Now onto Plan; check D16 wording on Plan.
  await go(p, 'Plan');
  const plan = await pageText(p);
  ok('D16 Plan: "Four quick questions" (the flow has four screens)', /Four quick questions, get a yes or no\./.test(plan) && !/three questions/.test(plan));
  await go(p, 'More');
  const more = await pageText(p);
  ok('D18 More: no migration banner, no changelog line, no filler', !/has moved to Plan/.test(more) && !/Moved here from/.test(more) && !/Your HOS what-if planner/.test(more), more.slice(0, 200));
  ok('A8 More → Rules: a button to "Exceptions this shift", not directions', !/scroll to the bottom/.test(more) && await p.evaluate(() => [...document.querySelectorAll('.page.is-active button.rowbtn')].some((b) => /Exceptions this shift/.test(b.textContent))));
  await tap(p, '.page.is-active button.rowbtn', /Exceptions this shift/);
  ok('A8 the button opens the Exceptions sheet', await p.evaluate(() => !!document.querySelector('.sheet')) && /Adverse|16-hour/.test(await sheetText(p)));
  await closeSheet(p);
  await tap(p, '.page.is-active button.danger', /^Erase all data$/);
  const er = await sheetText(p);
  ok('A9 Erase opens the app\'s own sheet: can\'t be undone, Export a copy first, Keep my data', /can't be undone/.test(er) && /Export a copy first/.test(er) && /Keep my data/.test(er) && p.dialogs === 0, { er, dialogs: p.dialogs });
  await tap(p, '.sheet button', /^Keep my data$/);
  ok('A9 "Keep my data" keeps it', (await state(p)).segments.length === 3);
  await tap(p, '.page.is-active button.danger', /^Start over/);
  const so = await sheetText(p);
  ok('A9 Start over opens the app\'s own sheet (no native confirm)', /Start over\?/.test(so) && /Keep my log/.test(so) && p.dialogs === 0, { so, dialogs: p.dialogs });
  await tap(p, '.sheet button.danger', /^Start over$/, 600);
  const st = await state(p);
  ok('A9 "Start over" does what it always did (fresh 10h rest, on duty from now)', st.segments.length === 1 && st.segments[0].status === 'OFF' && st.segments[0].end - st.segments[0].start === 600 && st.current?.status === 'ON');
  await go(p, 'More');
  await tap(p, '.page.is-active button.danger', /^Erase all data$/);
  await tap(p, '.sheet button.danger', /^Erase everything$/, 500);
  const st2 = await state(p);
  ok('A9 "Erase everything" erases, with no native dialog anywhere', st2.segments.length === 0 && st2.current === null && p.dialogs === 0, { segs: st2.segments.length, cur: st2.current, dialogs: p.dialogs });
  ok('More lane no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

/* ---------------- A11 + P5 at 360×740 ---------------- */
await section(async () => {
  const p = await open(DAY, 360, 740);
  const m = await p.evaluate(() => {
    const r = (q) => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; };
    const mon = document.querySelector('.hero-stop .sd-mon');
    return { pill: r('header.top .pill')?.height, pillWs: getComputedStyle(document.querySelector('header.top .pill')).whiteSpace, dock: r('.dock')?.height, more: r('button.dock-more')?.width, moreName: document.querySelector('button.dock-more')?.textContent, mon: mon ? getComputedStyle(mon).display : 'absent', over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  ok('A11 360px: the header pill stays one line (nowrap, ≤ 44px)', m.pill <= 44 && m.pillWs === 'nowrap', m);
  ok('A11 360px: the dock is one row (< 120px tall) with a compact 44px "…" key that keeps its full name', m.dock < 120 && m.more <= 48 && /PC, yard move, or started earlier/.test(m.moreName), m);
  ok('A11 360px: the stop date drops the month ("FRI 20")', m.mon === 'none', m);
  ok('A11 360px: no horizontal overflow', !m.over, m);
  await tap(p, 'button.rowbtn', /Fix the start time/);
  const chips = await p.evaluate(() => [...document.querySelectorAll('.sheet .ed-days button')].map((b) => ({ t: b.textContent, fits: b.scrollWidth <= b.clientWidth + 0.5, top: Math.round(b.getBoundingClientRect().top) })));
  ok('P5 360px: every day chip holds its word ("Yesterday" included) on one row', chips.length === 4 && chips.every((c) => c.fits) && Math.max(...chips.map((c) => c.top)) - Math.min(...chips.map((c) => c.top)) <= 3, chips);
  await closeSheet(p);
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Plan a sleeper split/, 900);
  const sp = await p.evaluate(() => ({ pos: getComputedStyle(document.querySelector('.page.is-active .split-now-after')).position, over: document.documentElement.scrollWidth > document.documentElement.clientWidth, iw: innerWidth }));
  ok('A11 360×740: the Split plan strip scrolls with the page (not sticky) and nothing widens the page', sp.pos === 'relative' && !sp.over && sp.iw === 360, sp);
  await p.ctx.close();
});

/* ---------------- Multi-driver startup splash, registration disclosure, PIN, recovery, separation, migration + C1 (real browser) ---------------- */
await section(async () => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript((t) => { const D = Date; const off = t - D.now(); class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } } globalThis.Date = F; }, NOW_MS);
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('af-c6')) { sessionStorage.setItem('af-c6', '1'); localStorage.clear(); } });
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  OPEN.add(ctx);
  await p.goto(ORIGIN + '/', { waitUntil: 'load' });
  await p.waitForSelector('[data-splash-screen="1"]'); await wait(p, 300);
  const tapPin = async (digits) => {
    for (const ch of digits) {
      await p.locator(`[data-pin-pad="1"] button[data-pin-digit="${ch}"]`).click();
    }
    await wait(p, 200);
  };

  // Re-aimed (drivers1): fresh launch shows Startup Splash (logo + "Clock 14" + "Add a driver") with zero overflow.
  const splash0 = await p.evaluate(() => ({
    splash: !!document.querySelector('[data-splash-screen="1"]'),
    logo: !!document.querySelector('img.splash-logo[src="./icon-512.png"]'),
    title: document.querySelector('h1.splash-title')?.textContent?.trim() ?? '',
    addBtn: document.querySelector('button[data-add-driver="1"]')?.textContent?.trim() ?? '',
    over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  ok('Drivers1 fresh launch: startup splash renders logo, "Clock 14", and "Add a driver" with no horizontal overflow',
    splash0.splash && splash0.logo && splash0.title === 'Clock 14' && /Add a driver/.test(splash0.addBtn) && !splash0.over, splash0);

  // Register Driver 1 ("Marcus"): name -> mandatory disclosure popup -> PIN -> recovery questions.
  await p.locator('button[data-add-driver="1"]').click(); await wait(p, 200);
  await p.locator('input[data-reg-name="1"]').fill('Marcus');
  await p.locator('button[data-reg-next="1"]').click(); await wait(p, 260);

  const discModal = await p.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-labelledby="disclaimer-title"]');
    const modal = dlg?.querySelector('.modal');
    const btns = [...(dlg?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim());
    const modalText = modal?.querySelector('p')?.textContent?.trim() ?? '';
    const mr = modal?.getBoundingClientRect();
    return {
      hasDialog: !!dlg,
      ariaModal: dlg?.getAttribute('aria-modal') ?? null,
      btns,
      modalText,
      shellInert: document.querySelector('.splash-shell')?.hasAttribute('inert') ?? false,
      fitsViewport: !!mr && mr.left >= 0 && mr.right <= window.innerWidth && mr.top >= 0 && mr.bottom <= window.innerHeight,
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  ok('Disclaimer on new-driver registration: pop-up renders with Clock 14 notice, single "Understood — don\'t show again" button, inert background, and fits viewport cleanly',
    discModal.hasDialog && discModal.ariaModal === 'true' && /Clock 14 — HOS What-If Planner\. It is not an ELD/.test(discModal.modalText)
    && discModal.btns.length === 1 && discModal.btns[0] === "Understood — don't show again" && discModal.shellInert && discModal.fitsViewport && !discModal.over, discModal);

  // Narrow phone (360×740): modal still fits cleanly with no horizontal overflow.
  await p.setViewportSize({ width: 360, height: 740 }); await wait(p, 200);
  const narrow = await p.evaluate(() => {
    const mr = document.querySelector('[role="dialog"][aria-labelledby="disclaimer-title"] .modal')?.getBoundingClientRect();
    return { fits: !!mr && mr.left >= 0 && mr.right <= window.innerWidth && mr.top >= 0 && mr.bottom <= window.innerHeight, over: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  ok('Disclaimer modal at 360×740: fits viewport with no horizontal overflow', narrow.fits && !narrow.over, narrow);
  await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 200);

  // Accept disclosure -> set PIN 1357 + confirm -> set 2 recovery questions -> enters Now.
  await p.locator('[role="dialog"][aria-labelledby="disclaimer-title"] button', { hasText: "Understood — don't show again" }).click({ timeout: 5000 });
  await wait(p, 300);
  await tapPin('1357');
  await tapPin('1357');
  await p.locator('input[data-rec-a="0"]').fill('Peterbilt');
  await p.locator('input[data-rec-a="1"]').fill('Memphis');
  await p.locator('button[data-reg-finish="1"]').click();
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 });
  await wait(p, 250);

  const afterReg = await p.evaluate(() => {
    const aboutCard = [...document.querySelectorAll('section.page-settings .card')].find((c) => c.querySelector('h2')?.textContent?.trim() === 'About');
    const aboutText = aboutCard?.querySelector('p.small')?.textContent?.trim() ?? '';
    return {
      hasDialog: !!document.querySelector('[role="dialog"][aria-labelledby="disclaimer-title"]'),
      persistedAck: JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').disclaimerAcked === true,
      aboutText,
      oldHeaderLine: !!document.querySelector('header.top details.disclaimer-line') || /Planning only — not a log, not an ELD/.test(document.querySelector('header.top')?.textContent ?? ''),
      driverStrip: document.querySelector('button[data-driver-strip="1"]')?.textContent?.trim() ?? '',
    };
  });
  ok('Registration completes: disclosure persists & matches Settings -> About verbatim, active driver shown, and Now has no header disclaimer line',
    !afterReg.hasDialog && afterReg.persistedAck && afterReg.aboutText === discModal.modalText && !afterReg.oldHeaderLine && /Marcus/.test(afterReg.driverStrip), afterReg);

  // Reload with 1 driver: Startup Splash MUST render (no straight-in shortcut); wrong PIN stays locked; right PIN enters without re-showing disclosure.
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-splash-screen="1"]'); await wait(p, 250);
  const splash1 = await p.evaluate(() => ({
    splash: !!document.querySelector('[data-splash-screen="1"]'),
    drivers: [...document.querySelectorAll('button.driver-tile')].map((b) => b.getAttribute('data-driver-name')),
    hasAdd: !!document.querySelector('button[data-add-driver="1"]'),
    over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  ok('Drivers1 reload (1 driver): splash ALWAYS renders with registered driver and "Add a driver" (no straight-in shortcut)',
    splash1.splash && JSON.stringify(splash1.drivers) === '["Marcus"]' && splash1.hasAdd && !splash1.over, splash1);

  // Splashlogo geometry pins (1 driver): large phone (412x915) and small phone (360x640).
  await wait(p, 400); // let splash entrance animation finish so bounding box reflects resting size
  const logo412 = await p.evaluate(() => {
    const app = document.querySelector('.splash-app');
    const fr = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
    const tr = document.querySelector('h1.splash-title')?.getBoundingClientRect();
    const tSize = parseFloat(getComputedStyle(document.querySelector('h1.splash-title')).fontSize);
    const tile = document.querySelector('button.driver-tile')?.getBoundingClientRect();
    const add = document.querySelector('button[data-add-driver="1"]')?.getBoundingClientRect();
    return {
      w: fr?.width ?? 0, h: fr?.height ?? 0, left: fr?.left ?? -1, right: fr?.right ?? 9999, top: fr?.top ?? -1, bottom: fr?.bottom ?? 0,
      tSize, titleBelow: !!tr && !!fr && tr.top >= fr.bottom,
      tileBottom: tile?.bottom ?? 9999, addBottom: add?.bottom ?? 9999,
      overX: document.documentElement.scrollWidth > document.documentElement.clientWidth || (app?.scrollWidth ?? 0) > (app?.clientWidth ?? 0),
    };
  });
  ok('Splashlogo 412×915 (1 driver): hero logo >= 360px square, unclipped bezel, Clock 14 below logo, picker + Add above fold',
    logo412.w >= 360 && Math.abs(logo412.w - logo412.h) <= 1 && logo412.left >= 0 && logo412.right <= 412 && logo412.top >= 0
    && logo412.tSize >= 28 && logo412.titleBelow && logo412.tileBottom <= 915 && logo412.addBottom <= 915 && !logo412.overX, logo412);

  await p.setViewportSize({ width: 360, height: 640 }); await wait(p, 200);
  const logo360 = await p.evaluate(() => {
    const app = document.querySelector('.splash-app');
    const fr = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
    const tr = document.querySelector('h1.splash-title')?.getBoundingClientRect();
    const tSize = parseFloat(getComputedStyle(document.querySelector('h1.splash-title')).fontSize);
    const tile = document.querySelector('button.driver-tile')?.getBoundingClientRect();
    const add = document.querySelector('button[data-add-driver="1"]')?.getBoundingClientRect();
    return {
      w: fr?.width ?? 0, h: fr?.height ?? 0, left: fr?.left ?? -1, right: fr?.right ?? 9999, top: fr?.top ?? -1, bottom: fr?.bottom ?? 0,
      tSize, titleBelow: !!tr && !!fr && tr.top >= fr.bottom,
      tileBottom: tile?.bottom ?? 9999, addBottom: add?.bottom ?? 9999,
      overX: document.documentElement.scrollWidth > document.documentElement.clientWidth || (app?.scrollWidth ?? 0) > (app?.clientWidth ?? 0),
    };
  });
  ok('Splashlogo 360×640 (1 driver): hero logo >= 300px square, unclipped bezel, Clock 14 below logo, picker + Add fully visible above fold',
    logo360.w >= 300 && Math.abs(logo360.w - logo360.h) <= 1 && logo360.left >= 0 && logo360.right <= 360 && logo360.top >= 0
    && logo360.tSize >= 24 && logo360.titleBelow && logo360.tileBottom <= 640 && logo360.addBottom <= 640 && !logo360.overX, logo360);
  await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 150);

  await p.locator('button.driver-tile[data-driver-name="Marcus"]').click(); await wait(p, 200);
  await tapPin('0000');
  const wrongPin = await p.evaluate(() => ({
    stillOnPin: !!document.querySelector('[data-pin-screen="1"]'),
    err: document.querySelector('[data-pin-error="1"]')?.textContent?.trim() ?? '',
    inApp: !!document.querySelector('nav.tabs'),
  }));
  ok('Drivers1 wrong PIN: rejected with alert, stays locked on PIN screen', wrongPin.stillOnPin && /Wrong PIN/i.test(wrongPin.err) && !wrongPin.inApp, wrongPin);

  await tapPin('1357');
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 });
  await wait(p, 250);
  const afterReloadUnlock = await p.evaluate(() => ({
    hasDialog: !!document.querySelector('[role="dialog"][aria-labelledby="disclaimer-title"]'),
    persistedAck: JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').disclaimerAcked === true,
    oldHeaderLine: !!document.querySelector('header.top details.disclaimer-line') || /Planning only — not a log, not an ELD/.test(document.querySelector('header.top')?.textContent ?? ''),
  }));
  ok('Disclaimer reload with persisted ack: no disclosure pop-up after PIN unlock and no old header line on Now',
    !afterReloadUnlock.hasDialog && afterReloadUnlock.persistedAck && !afterReloadUnlock.oldHeaderLine, afterReloadUnlock);

  // Home-terminal timezone picker stays reachable under More → Rules.
  await go(p, 'More');
  const tzMore = await p.evaluate(() => {
    const more = document.querySelector('section.page-settings');
    const inp = more?.querySelector('input[aria-label="Home terminal time zone"]');
    const r = inp?.getBoundingClientRect();
    return { present: !!inp, value: inp?.value ?? null, visible: !!r && r.width > 0 && r.height > 0 };
  });
  ok('Home-terminal timezone picker is reachable and visible under More → Rules', tzMore.present && tzMore.visible && !!tzMore.value, tzMore);
  await go(p, 'Now');

  // C1 (taste, 2026-11-20): first Driving tap must NEVER pop the read-aloud dialog; first non-Driving tap on Now pops it once.
  await p.locator('.status-buttons button', { hasText: 'Driving' }).click({ timeout: 5000 }); await wait(p, 350);
  const c1Drive = await p.evaluate(() => ({ inDrive: !!document.querySelector('main.drive'), dlg: /Want the alerts read out loud\?/.test(document.body.innerText) }));
  ok('C1 first tap Driving: enters DrivingView and never pops read-aloud dialog', c1Drive.inDrive && !c1Drive.dlg, c1Drive);
  await tap(p, 'button.drive-stop', /I.?ve stopped/);
  await tap(p, '.sheet .big-status button', /^Off Duty$/, 350);
  const c1Parked = await p.evaluate(() => ({ inDrive: !!document.querySelector('main.drive'), dlg: /Want the alerts read out loud\?/.test(document.body.innerText) }));
  ok('C1 first non-Driving tap on Now: asks "Want the alerts read out loud?" once while parked', !c1Parked.inDrive && c1Parked.dlg, c1Parked);
  await tap(p, 'button', /^No thanks$/, 250);
  await p.locator('.status-buttons button', { hasText: 'Sleeper' }).click({ timeout: 5000 }); await wait(p, 250);
  ok('C1 answered once: subsequent non-Driving tap never re-asks', !/Want the alerts read out loud\?/.test(await p.evaluate(() => document.body.innerText)));

  // Switch driver mid-session via Now's active driver strip, register Driver 2 ("Elena"), verify 2-driver splash + isolation + Forgot-PIN recovery.
  await go(p, 'More');
  await p.locator('section.page-settings label', { hasText: 'Cycle' }).locator('button', { hasText: '60 hr / 7 days' }).click();
  await wait(p, 200);
  await p.locator('button[data-switch-driver="1"]').click();
  await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 });
  await p.locator('button[data-add-driver="1"]').click(); await wait(p, 200);
  await p.locator('input[data-reg-name="1"]').fill('Elena');
  await p.locator('button[data-reg-next="1"]').click(); await wait(p, 260);
  const elenaHasDisc = await p.locator('[role="dialog"][aria-labelledby="disclaimer-title"]').count();
  await p.locator('[role="dialog"][aria-labelledby="disclaimer-title"] button').click(); await wait(p, 300);
  await tapPin('2468');
  await tapPin('2468');
  await p.locator('input[data-rec-a="0"]').fill('Kenworth');
  await p.locator('input[data-rec-a="1"]').fill('Dallas');
  await p.locator('button[data-reg-finish="1"]').click();
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 }); await wait(p, 250);

  const elenaCheck = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
    return {
      segs: (st.segments || []).length,
      cur: st.current,
      cycle: st.config?.cycle,
      strip: document.querySelector('button[data-driver-strip="1"]')?.textContent?.trim() ?? '',
    };
  });
  ok('Drivers1 per-driver separation: Driver 2 sees disclosure at registration and enters a clean world (0 of Driver 1 logs, 70/8 cycle)',
    elenaHasDisc === 1 && elenaCheck.segs === 0 && elenaCheck.cur === null && elenaCheck.cycle === '70/8' && /Elena/.test(elenaCheck.strip), { elenaHasDisc, elenaCheck });

  // Verify 2-driver splash at 360x640 (zero overflow) + Forgot-PIN recovery for Marcus.
  await p.locator('button[data-driver-strip="1"]').click();
  await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 });
  await p.setViewportSize({ width: 360, height: 640 }); await wait(p, 600);
  const splash2 = await p.evaluate(() => {
    const app = document.querySelector('.splash-app');
    const fr = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
    const tiles = [...document.querySelectorAll('button.driver-tile')];
    const addBtn = document.querySelector('button[data-add-driver="1"]');
    const maxScroll = Math.max(0, (app?.scrollHeight ?? 0) - (app?.clientHeight ?? 0));
    if (app) app.scrollTop = maxScroll;
    const addAfterScroll = addBtn?.getBoundingClientRect();
    if (app) app.scrollTop = 0;
    const frAtTop = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
    return {
      drivers: tiles.map((b) => b.getAttribute('data-driver-name')),
      hasAdd: !!addBtn,
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth || (app?.scrollWidth ?? 0) > (app?.clientWidth ?? 0),
      logoW: fr?.width ?? 0,
      logoH: fr?.height ?? 0,
      bezelOk: !!frAtTop && frAtTop.left >= 0 && frAtTop.right <= 360 && frAtTop.top >= 0,
      addReachable: !!addAfterScroll && addAfterScroll.top >= 0 && addAfterScroll.bottom <= 640,
    };
  });
  ok('Drivers1 2-driver splash at 360×640: lists both drivers + "Add a driver" with zero horizontal overflow, hero logo >= 300px, and full reachability',
    JSON.stringify(splash2.drivers) === '["Marcus","Elena"]' && splash2.hasAdd && !splash2.over
    && splash2.logoW >= 300 && Math.abs(splash2.logoW - splash2.logoH) <= 1 && splash2.bezelOk && splash2.addReachable, splash2);
  await p.setViewportSize({ width: 412, height: 915 }); await wait(p, 150);

  await p.locator('button.driver-tile[data-driver-name="Marcus"]').click(); await wait(p, 200);
  await p.locator('button[data-forgot-pin="1"]').click(); await wait(p, 200);
  await p.locator('input[data-recovery-answer="0"]').fill('peterbilt');
  await p.locator('input[data-recovery-answer="1"]').fill('MEMPHIS');
  await p.locator('button[data-recovery-submit="1"]').click(); await wait(p, 200);
  await tapPin('4321');
  await tapPin('4321');
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 }); await wait(p, 200);
  const marcusBack = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
    return { cycle: st.config?.cycle, status: st.current?.status, strip: document.querySelector('button[data-driver-strip="1"]')?.textContent?.trim() ?? '' };
  });
  ok('Drivers1 Forgot-PIN recovery: resets Marcus PIN and restores his Sleeper status + 60/7 cycle intact',
    marcusBack.cycle === '60/7' && marcusBack.status === 'SB' && /Marcus/.test(marcusBack.strip), marcusBack);

  // Drivers1fix P1 + P2 + Cooldown in real Chromium:
  // 1) Arm an undo by deleting a log entry, then hard-reload (swipe-away) without locking -> undo MUST survive reload + PIN unlock!
  await go(p, 'Log');
  const firstEditBtn = p.locator('section.page-log button.entry').first();
  if (await firstEditBtn.count()) {
    await firstEditBtn.click(); await wait(p, 200);
    const delBtn = p.locator('.sheet button.danger', { hasText: /Delete/ }).first();
    if (await delBtn.count()) {
      await delBtn.click(); await wait(p, 250);
    }
  }
  const undoBeforeReload = await p.evaluate(() => localStorage.getItem('hos-sandbox-undo-v1'));
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 }); await wait(p, 200);
  // Test PIN cooldown on Elena (5 wrong PINs -> 30s cooldown & disabled keypad), while Marcus remains unlocked-able!
  await p.locator('button.driver-tile[data-driver-name="Elena"]').click(); await wait(p, 150);
  for (const bad of ['0000', '0001', '0002', '0003', '0004']) await tapPin(bad);
  const cdCheck = await p.evaluate(() => ({
    err: document.querySelector('[data-pin-error="1"]')?.textContent?.trim() ?? '',
    disabledCount: [...document.querySelectorAll('[data-pin-pad="1"] button[data-pin-digit]')].filter((b) => b.disabled).length,
  }));
  ok('Drivers1fix PIN cooldown (real browser): 5 wrong PINs disable keypad and show honest 30-second wait',
    /Too many wrong PINs.*Wait \d+ seconds/i.test(cdCheck.err) && cdCheck.disabledCount === 10, cdCheck);

  // Switch back to picker and unlock Marcus (per-driver cooldown: Marcus unaffected!) -> verify undo survived reload!
  await p.locator('.splash-flow-head button.back').click(); await wait(p, 150);
  await p.locator('button.driver-tile[data-driver-name="Marcus"]').click(); await wait(p, 150);
  await tapPin('4321');
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 }); await wait(p, 200);
  const undoAfterReload = await p.evaluate(() => localStorage.getItem('hos-sandbox-undo-v1'));
  ok('Drivers1fix P1 (real browser): pending Undo survives hard reload + PIN unlock (not wiped on unlock)',
    !!undoBeforeReload && undoAfterReload === undoBeforeReload, { hadBefore: !!undoBeforeReload, hadAfter: !!undoAfterReload });

  // 2) Drivers1fix P2 (real browser): arm simulated clock + sim write, hard-reload without locking -> unlock -> Use real clock discards sim write!
  await go(p, 'More');
  const simSetup = await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
    return { segCount: (raw.segments || []).length };
  });
  // Long-press the build line in Settings -> About to reveal the Testing card.
  const buildLine = p.locator('section.page-settings [data-build-line]').first();
  await buildLine.dispatchEvent('pointerdown', { pointerId: 1 });
  await wait(p, 700);
  await buildLine.dispatchEvent('pointerup', { pointerId: 1 });
  await wait(p, 200);
  const simInput = p.locator('section.page-settings input[type="datetime-local"]').first();
  if (await simInput.count()) {
    await simInput.fill('2026-11-26T14:30');
    await simInput.dispatchEvent('change');
    await wait(p, 250);
    await go(p, 'Now');
    await p.locator('.status-buttons button', { hasText: 'On Duty' }).click({ timeout: 5000 }); await wait(p, 250);
    const simBeforeReload = await p.evaluate(() => ({
      simKey: !!localStorage.getItem('hos-sandbox-v1-sim'),
      curStatus: JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').current?.status,
    }));
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 }); await wait(p, 200);
    await p.locator('button.driver-tile[data-driver-name="Marcus"]').click(); await wait(p, 150);
    await tapPin('4321');
    await p.waitForSelector('section.page-now.is-active', { timeout: 5000 }); await wait(p, 200);
    const simAfterReload = await p.evaluate(() => !!localStorage.getItem('hos-sandbox-v1-sim'));
    await p.locator('section.page-now.is-active .warnbox button', { hasText: /Use real clock/ }).click(); await wait(p, 250);
    const afterRealClock = await p.evaluate(() => {
      const st = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
      return {
        nowOverride: st.nowOverride,
        curStatus: st.current?.status,
        segCount: (st.segments || []).length,
        simKey: !!localStorage.getItem('hos-sandbox-v1-sim'),
      };
    });
    ok('Drivers1fix P2 (real browser): simulated-clock quarantine survives hard reload and Use real clock discards sim writes',
      simBeforeReload.simKey && simBeforeReload.curStatus === 'ON' && simAfterReload
      && afterRealClock.nowOverride === null && afterRealClock.curStatus === 'SB' && afterRealClock.segCount === simSetup.segCount && !afterRealClock.simKey,
      { simBeforeReload, simAfterReload, afterRealClock, simSetup });
  } else {
    ok('Drivers1fix P2 (real browser): Testing simulated-clock input reachable', false, 'Testing input did not open');
  }

  ok('Disclaimer/Drivers1/C1 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await ctx.close();
});

/* ---------------- Drivers1 legacy single-driver migration (real browser) ---------------- */
await section(async () => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript((t) => { const D = Date; const off = t - D.now(); class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } } globalThis.Date = F; }, NOW_MS);
  const rawLegacy = JSON.stringify({
    ...DAY,
    config: { cycle: '60/7', dayStartHour: 5, dayStartMinute: 30, timeZone: 'America/Denver', shortHaul: false, adverseShifts: [], sixteenHourShifts: [] },
  });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('af-leg')) { sessionStorage.setItem('af-leg', '1'); localStorage.clear(); localStorage.setItem('hos-sandbox-v1', s); } }, rawLegacy);
  const p = await ctx.newPage();
  p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
  OPEN.add(ctx);
  await p.goto(ORIGIN + '/', { waitUntil: 'load' });
  await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 }); await wait(p, 250);
  const legSplash = await p.evaluate(() => ({
    tiles: [...document.querySelectorAll('button.driver-tile')].map((b) => ({ name: b.getAttribute('data-driver-name'), text: b.textContent.trim() })),
  }));
  ok('Drivers1 legacy migration: pre-drivers1 save appears automatically as first driver with Finish setup prompt',
    legSplash.tiles.length === 1 && /Finish setup/.test(legSplash.tiles[0].text), legSplash);

  await p.locator('button.driver-tile').first().click(); await wait(p, 200);
  await p.locator('input[data-reg-name="1"]').fill('Lorico');
  await p.locator('button[data-reg-next="1"]').click(); await wait(p, 200);
  for (const ch of '7788') await p.locator(`[data-pin-pad="1"] button[data-pin-digit="${ch}"]`).click();
  await wait(p, 150);
  for (const ch of '7788') await p.locator(`[data-pin-pad="1"] button[data-pin-digit="${ch}"]`).click();
  await wait(p, 150);
  await p.locator('input[data-rec-a="0"]').fill('Mack');
  await p.locator('input[data-rec-a="1"]').fill('Denver');
  await p.locator('button[data-reg-finish="1"]').click();
  await p.waitForSelector('section.page-now.is-active', { timeout: 5000 }); await wait(p, 250);

  const afterMig = await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
    return {
      segs: (st.segments || []).length,
      cur: st.current?.status,
      cycle: st.config?.cycle,
      dayStart: `${st.config?.dayStartHour}:${st.config?.dayStartMinute}`,
      tz: st.config?.timeZone,
      strip: document.querySelector('button[data-driver-strip="1"]')?.textContent?.trim() ?? '',
      keys: Object.keys(localStorage).sort(),
    };
  });
  ok('Drivers1 legacy migration: guided PIN + recovery setup preserves 100% of legacy logs & rules and uses zero new storage keys',
    afterMig.segs === DAY.segments.length && afterMig.cur === 'ON' && afterMig.cycle === '60/7' && afterMig.dayStart === '5:30' && afterMig.tz === 'America/Denver' && /Lorico/.test(afterMig.strip)
    && afterMig.keys.every((k) => ['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1'].includes(k)) && p.errors.length === 0,
    { afterMig, errors: p.errors });
  await ctx.close();
});

/* ---------------- Splashlogo: 4 drivers across Night / Day / Wind-down at 360x640 ---------------- */
await section(async () => {
  for (const theme of ['night', 'day', 'winddown']) {
    const baseVault = JSON.parse(wrapDriverSeed({ ...base, theme, themeChosen: true }, 'Marcus'));
    const tmpl = baseVault.__drivers.profiles['driver-1'];
    for (const [idx, nm] of [[2, 'Elena'], [3, 'Derrick'], [4, 'Sofia']]) {
      const id = `driver-${idx}`;
      baseVault.__drivers.order.push(id);
      baseVault.__drivers.profiles[id] = { ...tmpl, id, name: nm, createdAt: tmpl.createdAt + idx * 1000 };
    }
    const seedStr = JSON.stringify(baseVault);
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: theme === 'day' ? 'light' : 'dark', serviceWorkers: 'block' });
    await ctx.addInitScript((s) => { localStorage.clear(); localStorage.setItem('hos-sandbox-v1', s); }, seedStr);
    const p = await ctx.newPage();
    p.errors = []; p.on('pageerror', (e) => p.errors.push(String(e)));
    OPEN.add(ctx);
    await p.goto(ORIGIN + '/', { waitUntil: 'load' });
    await p.waitForSelector('[data-splash-screen="1"]', { timeout: 5000 });
    await wait(p, 650);
    const res4 = await p.evaluate(() => {
      const app = document.querySelector('.splash-app');
      const fr = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
      const tiles = [...document.querySelectorAll('button.driver-tile')];
      const addBtn = document.querySelector('button[data-add-driver="1"]');
      const maxScroll = Math.max(0, (app?.scrollHeight ?? 0) - (app?.clientHeight ?? 0));
      if (app) app.scrollTop = maxScroll;
      const lastTileR = tiles[tiles.length - 1]?.getBoundingClientRect();
      const addR = addBtn?.getBoundingClientRect();
      if (app) app.scrollTop = 0;
      const frTop = document.querySelector('.splash-logo-frame')?.getBoundingClientRect();
      return {
        theme: document.documentElement.dataset.theme ?? 'night',
        count: tiles.length,
        w: fr?.width ?? 0, h: fr?.height ?? 0,
        bezelOk: !!frTop && frTop.left >= 0 && frTop.right <= 360 && frTop.top >= 0,
        overX: document.documentElement.scrollWidth > document.documentElement.clientWidth || (app?.scrollWidth ?? 0) > (app?.clientWidth ?? 0),
        lastReachable: !!lastTileR && lastTileR.top >= 0 && lastTileR.bottom <= 640,
        addReachable: !!addR && addR.top >= 0 && addR.bottom <= 640,
      };
    });
    // Also prove 4th driver tile is genuinely interactive on 360x640 by tapping Sofia -> opens PIN screen.
    await p.locator('button.driver-tile[data-driver-name="Sofia"]').scrollIntoViewIfNeeded();
    await p.locator('button.driver-tile[data-driver-name="Sofia"]').click();
    await wait(p, 200);
    const openedPin = await p.evaluate(() => !!document.querySelector('[data-pin-screen="1"]') && /Sofia/.test(document.querySelector('.splash-flow-title')?.textContent ?? ''));
    ok(`Splashlogo 360×640 (${theme}, 4 drivers): hero logo >= 300px, unclipped bezel, zero overflow, 4th driver + Add reachable & interactive`,
      res4.count === 4 && res4.w >= 300 && Math.abs(res4.w - res4.h) <= 1 && res4.bezelOk && !res4.overX && res4.lastReachable && res4.addReachable && openedPin && p.errors.length === 0,
      { res4, openedPin, errors: p.errors });
    await ctx.close();
  }
});

await section(async () => {
  // C2 + A10 (taste, 2026-11-20): QuickStartSheet opens at scrollTop 0 with grabber visible,
  // orders Import → type, prints "6h 20m → 6h 00m" on strict adjustment, and ends with 4 status buttons.
  const p = await open(null);
  await tap(p, 'button', /Start from my ELD clocks/, 350);
  const a10 = await p.evaluate(() => {
    const sh = document.querySelector('.sheet');
    const imp = [...sh.querySelectorAll('button')].find((b) => /Import from a screenshot/.test(b.textContent));
    const firstBox = sh.querySelector('input[aria-label="Drive time left, hours"]');
    const handle = sh.querySelector('.sheet-handle');
    return {
      scrollTop: sh.scrollTop,
      handleTop: handle?.getBoundingClientRect().top ?? null,
      shTop: sh.getBoundingClientRect().top,
      impTop: imp?.getBoundingClientRect().top ?? null,
      boxTop: firstBox?.getBoundingClientRect().top ?? null,
    };
  });
  ok('A10 quick-start sheet: opens at top (scrollTop 0, grabber visible) with Import above manual boxes', a10.scrollTop === 0 && a10.handleTop >= a10.shTop && a10.impTop < a10.boxTop, a10);
  await p.fill('.sheet input[aria-label="Drive time left, hours"]', '6');
  await p.fill('.sheet input[aria-label="Drive time left, minutes"]', '20');
  await p.fill('.sheet input[aria-label="Shift time left, hours"]', '8');
  await p.fill('.sheet input[aria-label="Shift time left, minutes"]', '0');
  await p.fill('.sheet input[aria-label="Break due in, hours"]', '3');
  await p.fill('.sheet input[aria-label="Break due in, minutes"]', '0');
  await p.fill('.sheet input[aria-label="Cycle time left, hours"]', '50');
  await p.fill('.sheet input[aria-label="Cycle time left, minutes"]', '0');
  await tap(p, '.sheet button.primary', /^Set my clocks$/, 350);
  const c2 = await p.evaluate(() => {
    const sh = document.querySelector('.sheet');
    return {
      txt: sh?.innerText ?? '',
      btns: [...(sh?.querySelectorAll('.big-status button') ?? [])].map((b) => b.textContent.trim()),
    };
  });
  ok('C2 quick-start result: prints adjusted value "6h 20m → 6h 00m", asks "What are you doing right now?", 4 status buttons (no "See my clocks")', /Drive time left:\s*6h 20m → 6h 00m/.test(c2.txt) && /What are you doing right now\?/.test(c2.txt) && !/See my clocks/.test(c2.txt) && JSON.stringify(c2.btns) === '["Off Duty","Sleeper","Driving","On Duty"]', c2);
  await tap(p, '.sheet .big-status button', /^On Duty$/, 300);
  ok('C2 tapping On Duty closes the sheet and sets current status to ON', (await state(p)).current?.status === 'ON' && await p.evaluate(() => !document.querySelector('.sheet')));
  ok('C2/A10 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

await section(async () => {
  // C5 (taste, 2026-11-20): Testing card hidden on More until long-press on the build line.
  const p = await open(DAY);
  await go(p, 'More');
  const before = await pageText(p);
  ok('C5 More: Testing card and Simulated "now" hidden by default', !/Simulated "now"/.test(before) && /Build /.test(before));
  const bl = p.locator('.page.is-active [data-build-line]');
  await bl.scrollIntoViewIfNeeded(); await wait(p, 150);
  const box = await bl.boundingBox();
  // Short tap (100ms) must NOT unlock it.
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await wait(p, 100); await p.mouse.up(); await wait(p, 200);
  ok('C5 More: casual short tap on build line keeps Testing hidden', !/Simulated "now"/.test(await pageText(p)));
  // Long-press (750ms) reveals Testing card.
  await p.mouse.down(); await wait(p, 750); await p.mouse.up(); await wait(p, 200);
  ok('C5 More: long-press on build line reveals Testing card ("Simulated \\"now\\" (testing)")', /Simulated "now" \(testing\)/.test(await pageText(p)));
  ok('C5 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

await section(async () => {
  // C3 + A6 + A7 (taste, 2026-11-20): hero break wording, load-check order/defaults/counter, trip planner controls.
  const p = await open(DAY);
  const heroTxt = await p.evaluate(() => document.querySelector('.page.is-active .limit-plate')?.textContent ?? '');
  ok('C3 hero break plate reads "30-min break due in …" (never "limited by 8 hours of driving")', /^30-min break due in \d/.test(heroTxt) && !/limited by/.test(heroTxt), heroTxt);
  // Declutter (Lorico, 2026-11-20): verify load check is ABSENT on Now and PRESENT on Plan, then enter via Plan.
  const nowHasLoad = await p.evaluate(() => /Can I take this load\?/.test(document.querySelector('.page-now')?.innerText ?? ''));
  ok('Declutter: "Can I take this load?" is ABSENT on Now', !nowHasLoad);
  await go(p, 'Plan');
  const planHasLoad = await p.evaluate(() => [...document.querySelectorAll('.page-plan button.plan-item')].some((b) => /Can I take this load\?/.test(b.textContent ?? '')));
  ok('Declutter: "Can I take this load?" is PRESENT on Plan', planHasLoad);
  await tap(p, '.page-plan button.plan-item', /Can I take this load\?/, 600);
  const s1 = await pageText(p);
  ok('A6 Load check step 1: defaults to 550 mi and shows "Step 1 of 4" under the bar', /550\s*mi/.test(s1) && /Step 1 of 4/.test(s1), s1.slice(0, 220));
  await tap(p, 'button.flow-next', /Next: when you leave/, 250);
  await tap(p, 'button.flow-next', /Next: appointment time/, 250);
  const s3 = await pageText(p);
  ok('A6 Load check step 3: asks Appointment BEFORE receiver dwell ("Step 3 of 4 — Optional")', /Step 3 of 4 — Optional/.test(s3) && /Appointment at the receiver\?/.test(s3), s3.slice(0, 220));
  await tap(p, '.page.is-active button', /^Pick a time$/, 250);
  const apptBtn = await p.evaluate(() => document.querySelector('.sheet button.ed-go')?.textContent ?? '');
  ok('A6 Appointment picker defaults to computed arrival rounded up to a future whole hour (:00)', /Appointment [A-Z][a-z]{2} [A-Z][a-z]{2} \d+, \d\d:00$/.test(apptBtn), apptBtn);
  await closeSheet(p);
  await tap(p, 'button.flow-next', /Next: time at the receiver/, 250);
  const s4 = await pageText(p);
  ok('A6 Load check step 4: asks "How long at the receiver?" ("Step 4 of 4")', /Step 4 of 4/.test(s4) && /How long at the receiver\?/.test(s4), s4.slice(0, 220));
  await go(p, 'Plan'); await tap(p, 'main button.plan-item', /Plan a run/, 600);
  const a7 = await p.evaluate(() => {
    const pg = document.querySelector('.page.is-active');
    return {
      sliders: pg.querySelectorAll('input[type=range]').length,
      departPresets: [...pg.querySelectorAll('[aria-label="Depart"] button')].map((b) => b.textContent.trim()),
      distPresets: [...pg.querySelectorAll('[aria-label="Distance presets"] button')].map((b) => b.textContent.trim()),
    };
  });
  ok('A7 Plan a run: zero sliders, uses Depart + Distance presets and steppers', a7.sliders === 0 && a7.departPresets.length === 4 && JSON.stringify(a7.distPresets) === '["250","400","550","700","900"]', a7);
  await tap(p, '[aria-label="Distance presets"] button', /^700$/, 250);
  ok('A7 tapping 700 preset updates trip miles to 700', (await state(p)).trip?.miles === 700, (await state(p)).trip);
  ok('C3/A6/A7 no page errors', p.errors.length === 0, p.errors.join(' | '));
  await p.ctx.close();
});

await section(async () => {
  // D17 (label patch, 2026-11-20): load-check answer shows "Could be unloaded by (if they take you on arrival)"
  // instead of bare "Unloaded by", with zero horizontal overflow or clipping at 412x915 and 360x640.
  const NEW_LABEL = 'Could be unloaded by (if they take you on arrival)';
  for (const [W, H] of [[412, 915], [360, 640]]) {
    const p = await open({
      ...DAY,
      loadCheck: { miles: 550, leaveIn: 60, waitOff: false, dwell: 120, dwellOff: false, appt: N + 60 * 17, answered: true },
    }, W, H);
    await go(p, 'Plan');
    await tap(p, '.page-plan button.plan-item', /Can I take this load\?/, 600);
    const m = await p.evaluate(() => {
      const pg = document.querySelector('.page.is-active');
      const vw = document.documentElement.clientWidth;
      const verdictSub = pg?.querySelector('.verdict-sub')?.textContent?.trim() ?? '';
      const statLabels = [...(pg?.querySelectorAll('.clocks .stat-label') ?? [])].map((e) => e.textContent?.trim() ?? '');
      const checkEls = [...(pg?.querySelectorAll('.verdict, .verdict-sub, .clocks, .clocks .stat, .clocks .stat-label, .clocks .stat-value') ?? [])];
      const clipped = checkEls.filter((el) => {
        const r = el.getBoundingClientRect();
        return el.scrollWidth > el.clientWidth + 1 || r.right > vw + 0.5 || r.left < -0.5;
      }).map((el) => ({ cls: el.className, sw: el.scrollWidth, cw: el.clientWidth, right: Math.round(el.getBoundingClientRect().right), vw }));
      return {
        verdictSub, statLabels,
        pageText: pg?.innerText ?? '',
        docW: document.documentElement.scrollWidth, vw,
        clipped,
      };
    });
    ok(`D17 [${W}x${H}] verdict-sub leads with "${NEW_LABEL}"`, m.verdictSub.startsWith(`${NEW_LABEL} `), m.verdictSub);
    ok(`D17 [${W}x${H}] Stat label reads "${NEW_LABEL}"`, m.statLabels.includes(NEW_LABEL), m.statLabels);
    ok(`D17 [${W}x${H}] no bare "Unloaded by" remains on load-check answer`, !/Unloaded by/.test(m.pageText), m.pageText.slice(0, 300));
    ok(`D17 [${W}x${H}] no horizontal overflow or clipping in verdict-sub / Stat cards`, m.docW <= m.vw && m.clipped.length === 0, { docW: m.docW, vw: m.vw, clipped: m.clipped });
    ok(`D17 [${W}x${H}] no page errors`, p.errors.length === 0, p.errors.join(' | '));
    await p.ctx.close();
  }
});

/* ---------------- BUG-2026-11-20: Fix the start time on live entries (all 4 statuses) + closed entry ---------------- */
await section(async () => {
  const makeLive = (status, extra = {}) => ({
    ...base,
    drivingView: true,
    ...extra,
    segments: [
      { status: 'OFF', start: N - 1000, end: N - 400, createdAt: 1 },
      { status: status === 'D' ? 'ON' : 'D', start: N - 400, end: N - 30, createdAt: 2 },
    ],
    current: { status, since: N - 30, createdAt: 3 },
  });
  const btnVis = (p, sel) => p.evaluate((q) => {
    const sh = document.querySelector('.sheet');
    const b = sh?.querySelector(q);
    if (!sh || !b) return null;
    const sr = sh.getBoundingClientRect(), r = b.getBoundingClientRect();
    return {
      text: b.textContent.trim(),
      disabled: b.disabled,
      pos: getComputedStyle(b).position,
      inSheetView: r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1,
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight + 1,
      sheetText: sh.innerText,
      driveUp: !!document.querySelector('main.drive'),
    };
  }, sel);
  const pickTime = async (p, hhmm) => {
    await p.evaluate((v) => {
      const inp = document.querySelector('.sheet input[type="time"]');
      if (!inp) throw new Error('no time input');
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    }, hhmm);
    await wait(p, 200);
  };

  // 1. Live Driving (drivingView=true, via Details -> Fix the start time) at 412x915 and 360x640
  for (const [W, H] of [[412, 915], [360, 640]]) {
    const p = await open(makeLive('D'), W, H);
    await tap(p, 'button.drive-details', /Details/);
    await tap(p, 'button.rowbtn', /Fix the start time/);
    await pickTime(p, '22:20');
    const beforeConfirm = await btnVis(p, 'button.ed-go');
    ok(`BUG-2026-11-20 Driving [${W}x${H}]: picking time does not save before confirm and shows visible enabled "Set start to Fri 22:20"`,
      (await state(p)).current?.since === N - 30 && beforeConfirm && !beforeConfirm.disabled && /Set start to Fri 22:20/.test(beforeConfirm.text) && beforeConfirm.inSheetView && beforeConfirm.inViewport,
      beforeConfirm);
    // Pressing X without confirming must NOT save
    await tap(p, '.sheet button[aria-label="Close"]', null);
    ok(`BUG-2026-11-20 Driving [${W}x${H}]: X without confirming leaves start time unchanged`, (await state(p)).current?.since === N - 30, (await state(p)).current);
    // Re-open, pick, apply via confirm button -> must save AND show confirmation screen + See my clocks (never stall on disabled picker)
    await tap(p, 'button.rowbtn', /Fix the start time/);
    await pickTime(p, '22:20');
    await tap(p, '.sheet button.ed-go', /Set start to Fri 22:20/);
    const afterApply = await btnVis(p, 'button.primary');
    ok(`BUG-2026-11-20 Driving [${W}x${H}]: applying saves start time and shows confirmation + visible "See my clocks" (no remount stall)`,
      (await state(p)).current?.since === N - 40 && afterApply && !afterApply.driveUp && afterApply.text === 'See my clocks' && !afterApply.disabled && afterApply.inSheetView && afterApply.inViewport && /Start time fixed — Driving since Fri 22:20/.test(afterApply.sheetText) && !/Pick the real start time/.test(afterApply.sheetText),
      afterApply);
    await tap(p, '.sheet button.primary', /^See my clocks$/);
    const closed = await p.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), drive: !!document.querySelector('main.drive'), txt: document.querySelector('.page.is-active')?.innerText ?? '' }));
    ok(`BUG-2026-11-20 Driving [${W}x${H}]: "See my clocks" closes cleanly back to Now with updated start`, !closed.sheet && !closed.drive && /Driving since Fri 22:20/.test(closed.txt), closed);
    ok(`BUG-2026-11-20 Driving [${W}x${H}]: no page errors`, p.errors.length === 0, p.errors.join(' | '));
    await p.ctx.close();
  }

  // 2. All 4 statuses' live entries at 412x750 (typical phone Chrome height) and 360x640
  for (const [st, label] of [['D', 'Driving'], ['ON', 'On Duty'], ['SB', 'Sleeper'], ['OFF', 'Off Duty']]) {
    for (const [W, H] of [[412, 750], [360, 640]]) {
      const p = await open(makeLive(st), W, H);
      if (st === 'D') await tap(p, 'button.drive-details', /Details/);
      await tap(p, 'button.rowbtn', /Fix the start time/);
      await pickTime(p, '22:20');
      const go = await btnVis(p, 'button.ed-go');
      ok(`BUG-2026-11-20 ${label} [${W}x${H}]: apply affordance visible in sheet + viewport after picking time, not saved yet`,
        (await state(p)).current?.since === N - 30 && go && !go.disabled && /Set start to Fri 22:20/.test(go.text) && go.inSheetView && go.inViewport,
        go);
      await tap(p, '.sheet button[aria-label="Close"]', null);
      ok(`BUG-2026-11-20 ${label} [${W}x${H}]: X without confirm does not change start`, (await state(p)).current?.since === N - 30);
      await tap(p, 'button.rowbtn', /Fix the start time/);
      await pickTime(p, '22:20');
      await tap(p, '.sheet button.ed-go', /Set start to Fri 22:20/);
      const done = await btnVis(p, 'button.primary');
      ok(`BUG-2026-11-20 ${label} [${W}x${H}]: confirm saves time and shows confirmation + visible "See my clocks"`,
        (await state(p)).current?.since === N - 40 && done && done.text === 'See my clocks' && done.inSheetView && done.inViewport && new RegExp(`Start time fixed — ${label} since Fri 22:20`).test(done.sheetText),
        done);
      await tap(p, '.sheet button.primary', /^See my clocks$/);
      ok(`BUG-2026-11-20 ${label} [${W}x${H}]: sheet closes cleanly`, await p.evaluate(() => !document.querySelector('.sheet')));
      await p.ctx.close();
    }
  }

  // 3. Non-live (closed) entry on Log at 412x750
  {
    const p = await open(makeLive('ON'), 412, 750);
    await go(p, 'Log');
    await tap(p, '.page-log button.entry:not(.live)', /Driving/);
    await tap(p, '.sheet button.act', /The times are wrong/);
    await pickTime(p, '16:15');
    const nxt = await btnVis(p, 'button.ed-go');
    ok('BUG-2026-11-20 Closed entry [412x750]: visible forward button after picking start', nxt && !nxt.disabled && /Next: when it ended/.test(nxt.text) && nxt.inSheetView && nxt.inViewport, nxt);
    await tap(p, '.sheet button[aria-label="Close"]', null);
    ok('BUG-2026-11-20 Closed entry [412x750]: X without saving leaves entry unchanged', (await state(p)).segments[1].start === N - 400);
    await tap(p, '.page-log button.entry:not(.live)', /Driving/);
    await tap(p, '.sheet button.act', /The times are wrong/);
    await pickTime(p, '16:15');
    await tap(p, '.sheet button.ed-go', /Next: when it ended/);
    await tap(p, '.sheet button.ed-go', /Next: check it/);
    await tap(p, '.sheet button.ed-go', /Change the others and save|Save the change/);
    ok('BUG-2026-11-20 Closed entry [412x750]: saving updates start time and closes sheet', (await state(p)).segments[1].start === N - 405 && await p.evaluate(() => !document.querySelector('.sheet')));
    await p.ctx.close();
  }
});

await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'AUDITFIX FAIL' : 'AUDITFIX OK');
process.exit(fails ? 1 : 0);
