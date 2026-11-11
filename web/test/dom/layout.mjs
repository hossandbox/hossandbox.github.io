// Patch 19, Part B — the phone-layout lane (a REAL browser: layout cannot be read from the
// DOM shim the other lanes use). Field report, Pixel, 2026-11-10: while a tab's content
// scrolled, the header and the status dock / tab bar rode up and down with the browser's own
// chrome, and a sideways drag shifted the whole screen.
//
// What this lane asserts, at 412x915 and 360x640, on Now / Log / Split / More:
//   (a) no horizontal overflow — the document's scrollWidth never exceeds its clientWidth,
//       the shell's neither, no element reaches past the viewport's right or left edge, and
//       a programmatic sideways scroll moves nothing;
//   (b) the document itself never scrolls (that scroll is what makes a phone browser hide
//       and show its chrome and drag the fixed panels with it): the shell is the one
//       scroller, its COMPUTED height is the viewport's, and the header (top slot), the tab
//       bar (bottom slot) and — on Now — the status dock sit at the same pixels before and
//       after the content is scrolled.
// The stable-unit rule itself (.app { height: 100vh; height: 100dvh }) is pinned in SOURCE by
// the smoke suite; this lane checks what the browser computed from it.
//
// usage: node test/dom/layout.mjs [--root dist] [--json out.json]
// The browser is not a package dependency: point HOS_BROWSER at a Chrome / Chrome Headless
// Shell binary and HOS_PLAYWRIGHT at a directory whose node_modules holds playwright-core.
// A missing browser is a FAILURE of this lane (exit 2), never a silent pass.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = resolve(arg('--root', 'dist')) + '/';
const PW = process.env.HOS_PLAYWRIGHT || '/home/hatch/workspace/hos-patch/p18-scratch/';
const CHROME = process.env.HOS_BROWSER || '/home/hatch/workspace/hos-patch/p18-scratch/chrome-headless-shell-linux64/chrome-headless-shell';
let chromium;
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`LAYOUT LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`LAYOUT LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`LAYOUT LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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

// A real working day behind an On-duty status (so Now shows the dock, not the driving view),
// long enough that every main tab has more content than one screen.
const nowMinute = Math.floor(Date.now() / 60000);
const t0 = nowMinute - 60 * 30;
const seedRecord = (nowCard) => ({
  segments: [
    { status: 'OFF', start: t0 - 600, end: t0, createdAt: 1 },
    { status: 'ON', start: t0, end: t0 + 30, createdAt: 2 },
    { status: 'D', start: t0 + 30, end: t0 + 330, createdAt: 3 },
    { status: 'OFF', start: t0 + 330, end: t0 + 360, note: 'break:30-min break', createdAt: 4 },
    { status: 'D', start: t0 + 360, end: t0 + 600, createdAt: 5 },
    { status: 'ON', start: t0 + 600, end: t0 + 630, note: 'YM', createdAt: 6 },
    { status: 'SB', start: t0 + 630, end: t0 + 1230, createdAt: 7 },
    { status: 'OFF', start: t0 + 1230, end: t0 + 1260, note: 'PC', createdAt: 8 },
    { status: 'ON', start: t0 + 1260, end: t0 + 1290, createdAt: 9 },
    { status: 'D', start: t0 + 1290, end: t0 + 1560, createdAt: 10 },
    { status: 'OFF', start: t0 + 1560, end: t0 + 1600, createdAt: 11 },
    { status: 'D', start: t0 + 1600, end: nowMinute - 20, createdAt: 12 },
  ],
  current: { status: 'ON', since: nowMinute - 20, createdAt: 13 },
  historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard, nowCardAsked: true,
});

const SIZES = [[412, 915], [360, 640]];
const TABS = ['Now', 'Log', 'Split', 'More'];
const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const report = [];

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
for (const [W, H] of SIZES) {
  for (const nowCard of ['dial', 'timeline']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => { try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ } }, JSON.stringify(seedRecord(nowCard)));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForSelector('#root *');
    await page.waitForTimeout(300);
    const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
    if (await ack.count()) await ack.first().click();
    await page.evaluate(() => document.fonts && document.fonts.ready);
    for (const tab of TABS) {
      // DOM clicks, not pointer clicks: on a build whose layout is broken a panel can sit over
      // the tab bar, and the lane must still reach every tab to report it.
      const tap = (sel, text) => page.evaluate(([q, t]) => { const b = [...document.querySelectorAll(q)].find((x) => x.textContent.includes(t)); if (!b) throw new Error('no ' + q + ' with ' + t); b.click(); }, [sel, text]);
      if (tab === 'Split') { await tap('nav.tabs button', 'Plan'); await page.waitForTimeout(100); await tap('main button', 'Plan a sleeper split'); }
      else await tap('nav.tabs button', tab);
      await page.waitForTimeout(250);
      const m = await page.evaluate(async () => {
        const de = document.documentElement, body = document.body;
        const app = document.querySelector('.app'), header = document.querySelector('header.top'), nav = document.querySelector('nav.tabs'), dock = document.querySelector('.dock'), main = document.querySelector('main');
        const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 100) / 100, bottom: Math.round(r.bottom * 100) / 100, left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100 }; };
        const vw = de.clientWidth, vh = window.innerHeight, innerW = window.innerWidth;
        // every element reaching past the viewport's side edges (screen-reader-only clips excluded)
        const wide = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 0.5 || r.left < -0.5) {
            const cs = getComputedStyle(el);
            if (cs.position === 'absolute' && el.classList.contains('vh')) continue;
            wide.push(`${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).replace(/\s+/g, '.')} [${Math.round(r.left * 10) / 10}..${Math.round(r.right * 10) / 10}]`);
          }
        }
        // the scroller: whichever of document / shell actually has overflow to scroll
        const docScrollable = de.scrollHeight - de.clientHeight;
        const before = { header: rect(header), nav: rect(nav), dock: rect(dock) };
        // try to scroll everything, both axes, the way a thumb would
        window.scrollTo(200, 100000);
        if (app) { app.scrollTop = 100000; app.scrollLeft = 200; }
        if (main) { main.scrollLeft = 200; }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const after = { header: rect(header), nav: rect(nav), dock: rect(dock) };
        const moved = { winX: window.scrollX, winY: window.scrollY, appX: app ? app.scrollLeft : null, appY: app ? app.scrollTop : null, mainX: main ? main.scrollLeft : null, vvX: window.visualViewport ? window.visualViewport.offsetLeft + window.visualViewport.pageLeft : 0 };
        const out = {
          vw, vh, innerW, docScrollW: de.scrollWidth, docClientW: de.clientWidth, bodyScrollW: body.scrollWidth,
          appScrollW: app ? app.scrollWidth : null, appClientW: app ? app.clientWidth : null,
          appScrollH: app ? app.scrollHeight : null, appClientH: app ? app.clientHeight : null,
          appComputedH: app ? getComputedStyle(app).height : null, appOverflowY: app ? getComputedStyle(app).overflowY : null,
          docScrollable, wide: wide.slice(0, 12), wideCount: wide.length, before, after, moved,
          slots: { header: !!header && header.parentElement === app, nav: !!nav && nav.parentElement === app, dockInMain: !dock || (!!main && main.contains(dock)), mainInApp: !!main && main.parentElement === app },
        };
        window.scrollTo(0, 0); if (app) { app.scrollTop = 0; app.scrollLeft = 0; } if (main) main.scrollLeft = 0;
        return out;
      });
      const tag = `[${W}x${H} ${nowCard} ${tab}]`;
      report.push({ size: `${W}x${H}`, nowCard, tab, ...m });
      // (a) no horizontal overflow
      ok(`${tag} (a) document scrollWidth <= clientWidth`, m.docScrollW <= m.docClientW && m.bodyScrollW <= m.docClientW, `doc ${m.docScrollW}/${m.docClientW}, body ${m.bodyScrollW}`);
      ok(`${tag} (a) the page is not zoomed out to fit something wider (innerWidth == ${W})`, m.innerW === W && m.vw === W, `innerWidth ${m.innerW}, clientWidth ${m.vw}`);
      ok(`${tag} (a) shell scrollWidth <= clientWidth`, m.appScrollW !== null && m.appScrollW <= m.appClientW, `shell ${m.appScrollW}/${m.appClientW}`);
      ok(`${tag} (a) no element reaches past the viewport's side edges`, m.wideCount === 0, m.wide.join(' ; '));
      ok(`${tag} (a) a sideways scroll moves nothing`, m.moved.winX === 0 && m.moved.appX === 0 && m.moved.mainX === 0, JSON.stringify(m.moved));
      // (b) shell slots + stable height
      ok(`${tag} (b) header, main and tab bar are the shell's own children`, m.slots.header && m.slots.nav && m.slots.mainInApp && m.slots.dockInMain, JSON.stringify(m.slots));
      ok(`${tag} (b) shell computed height == viewport height`, m.appComputedH === `${m.vh}px`, `computed ${m.appComputedH}, viewport ${m.vh}px`);
      ok(`${tag} (b) the document itself cannot scroll (the shell is the scroller)`, m.docScrollable <= 0 && m.moved.winY === 0 && (m.appOverflowY === 'auto' || m.appOverflowY === 'scroll'), `doc overflow ${m.docScrollable}px, window.scrollY after scroll ${m.moved.winY}, shell overflow-y ${m.appOverflowY}`);
      ok(`${tag} (b) the content really scrolled under the panels`, m.appScrollH > m.appClientH ? m.moved.appY > 0 : true, `shell ${m.appScrollH}/${m.appClientH}, scrolled ${m.moved.appY}`);
      const same = (a, b) => (!a && !b) || (a && b && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right);
      // The dock is sticky INSIDE the scroller: at a fractional scroll offset the browser reports it a
      // fraction of a pixel off its slot, so for the dock "stays put" means within 1px; the header
      // and the tab bar are held to the exact pixel.
      const near = (a, b) => a && b && Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1 && a.left === b.left && a.right === b.right;
      ok(`${tag} (b) header stays at the top edge while content scrolls`, m.before.header && m.before.header.top === 0 && same(m.before.header, m.after.header), `${JSON.stringify(m.before.header)} → ${JSON.stringify(m.after.header)}`);
      ok(`${tag} (b) tab bar stays at the bottom edge while content scrolls`, m.before.nav && m.before.nav.bottom === m.vh && same(m.before.nav, m.after.nav), `${JSON.stringify(m.before.nav)} → ${JSON.stringify(m.after.nav)} (viewport ${m.vh})`);
      if (tab === 'Now') {
        ok(`${tag} (b) status dock sits on the tab bar and stays put while content scrolls`, m.after.dock && m.after.nav && Math.abs(m.after.dock.bottom - m.after.nav.top) <= 1 && m.after.dock.left === 0 && m.after.dock.right === m.vw && near(m.before.dock, m.after.dock), `${JSON.stringify(m.before.dock)} → ${JSON.stringify(m.after.dock)}; nav ${JSON.stringify(m.after.nav)}`);
        ok(`${tag} (b) status dock is pinned from the first frame (no scroll needed)`, m.before.dock && Math.abs(m.before.dock.bottom - m.before.nav.top) <= 1, `${JSON.stringify(m.before.dock)}; nav ${JSON.stringify(m.before.nav)}`);
      }
    }
    ok(`[${W}x${H} ${nowCard}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}
await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
console.log(fails ? 'LAYOUT FAIL' : 'LAYOUT OK');
process.exit(fails ? 1 : 0);
