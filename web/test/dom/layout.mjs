// Patch 19, Part B — the phone-layout lane (a REAL browser: layout cannot be read from the
// DOM shim the other lanes use). Field report, Pixel, 2026-11-10: while a tab's content
// scrolled, the header and the status dock / tab bar rode up and down with the browser's own
// chrome, and a sideways drag shifted the whole screen.
//
// What this lane asserts, at 412x915 and 360x640, on Now / Log / Split / More:
//   (a) no horizontal overflow — the document's scrollWidth never exceeds its clientWidth,
//       the shell's neither, no element OF THE SCREEN IN VIEW reaches past the viewport's
//       right or left edge, and a programmatic sideways scroll moves nothing but the
//       panel strip (which is supposed to move — see below);
//   (b) the document itself never scrolls (that scroll is what makes a phone browser hide
//       and show its chrome and drag the fixed panels with it): the shell's COMPUTED
//       height is the viewport's, the active strip page is the vertical scroller, and
//       the header (top slot), the tab bar (bottom slot) and — on Now — the status dock
//       sit at the same pixels before and after the content is scrolled.
//
// Panel strip (2026-11-18): the four panels now sit side by side in a scroll-snap strip
// (The Daily Number's mechanism), each page its own vertical scroller. Patch 19's
// sideways invariants are re-aimed, not dropped: elements on the strip's OTHER pages
// are supposed to sit outside the viewport (the strip clips them), so the side-edge
// scan reads the active page and the shell chrome only; a sideways scroll may move
// the strip — never the document, the shell or the visual viewport; and "the content
// scrolled" now means the ACTIVE PAGE scrolled under the panels. The sideways probe
// restores the strip's seat inside the same task, before the app's own settle timer
// (120ms) can read the probe offset as a page change.
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
      // a tab tap now ANIMATES the strip to the page (smooth scroll): measure at rest,
      // not mid-flight — wait for the strip to seat on the active page's snap point.
      await page.waitForFunction(() => { const m = document.querySelector('main'), p = document.querySelector('.page.is-active'); return !m || !p || Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2000 }).catch(() => {});
      const m = await page.evaluate(async () => {
        const de = document.documentElement, body = document.body;
        const app = document.querySelector('.app'), header = document.querySelector('header.top'), nav = document.querySelector('nav.tabs'), dock = document.querySelector('.dock'), main = document.querySelector('main');
        const page = document.querySelector('.page.is-active');
        const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 100) / 100, bottom: Math.round(r.bottom * 100) / 100, left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100 }; };
        const vw = de.clientWidth, vh = window.innerHeight, innerW = window.innerWidth;
        // every element of the screen in view reaching past the viewport's side edges
        // (screen-reader-only clips excluded; the strip's other pages are supposed to
        // sit outside the viewport, clipped by the strip — they are not this screen)
        const wide = [];
        for (const el of document.querySelectorAll('body *')) {
          const pg = el.closest('.page');
          if (pg && pg !== page) continue;
          // the page frame itself is the strip's own box: Chromium seats a snap up to
          // a pixel off the exact point, which is the strip working, not overflow —
          // the page's CONTENTS are still scanned below.
          if (el.classList.contains('page')) continue;
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
        // try to scroll everything, both axes, the way a thumb would. The strip itself
        // may move sideways — that is its job — so its seat is restored in the same
        // task, before the app's settle timer can read the probe as a page change.
        window.scrollTo(200, 100000);
        if (app) { app.scrollTop = 100000; app.scrollLeft = 200; }
        if (page) page.scrollTop = 100000;
        if (main) { main.scrollLeft = 200; }
        const stripMoved = main ? main.scrollLeft : null;
        if (main && page) main.scrollLeft = page.offsetLeft;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const after = { header: rect(header), nav: rect(nav), dock: rect(dock) };
        const moved = { winX: window.scrollX, winY: window.scrollY, appX: app ? app.scrollLeft : null, appY: app ? app.scrollTop : null, pageY: page ? page.scrollTop : null, stripMoved, vvX: window.visualViewport ? window.visualViewport.offsetLeft + window.visualViewport.pageLeft : 0 };
        const out = {
          vw, vh, innerW, docScrollW: de.scrollWidth, docClientW: de.clientWidth, bodyScrollW: body.scrollWidth,
          appScrollW: app ? app.scrollWidth : null, appClientW: app ? app.clientWidth : null,
          appScrollH: app ? app.scrollHeight : null, appClientH: app ? app.clientHeight : null,
          appComputedH: app ? getComputedStyle(app).height : null, appOverflowY: app ? getComputedStyle(app).overflowY : null,
          pageScrollH: page ? page.scrollHeight : null, pageClientH: page ? page.clientHeight : null, pageOverflowY: page ? getComputedStyle(page).overflowY : null,
          docScrollable, wide: wide.slice(0, 12), wideCount: wide.length, before, after, moved,
          slots: { header: !!header && header.parentElement === app, nav: !!nav && nav.parentElement === app, dockInMain: !dock || (!!main && main.contains(dock)), mainInApp: !!main && main.parentElement === app },
        };
        window.scrollTo(0, 0); if (app) { app.scrollTop = 0; app.scrollLeft = 0; } if (page) page.scrollTop = 0; if (main && page) main.scrollLeft = page.offsetLeft;
        return out;
      });
      const tag = `[${W}x${H} ${nowCard} ${tab}]`;
      report.push({ size: `${W}x${H}`, nowCard, tab, ...m });
      // (a) no horizontal overflow
      ok(`${tag} (a) document scrollWidth <= clientWidth`, m.docScrollW <= m.docClientW && m.bodyScrollW <= m.docClientW, `doc ${m.docScrollW}/${m.docClientW}, body ${m.bodyScrollW}`);
      ok(`${tag} (a) the page is not zoomed out to fit something wider (innerWidth == ${W})`, m.innerW === W && m.vw === W, `innerWidth ${m.innerW}, clientWidth ${m.vw}`);
      ok(`${tag} (a) shell scrollWidth <= clientWidth`, m.appScrollW !== null && m.appScrollW <= m.appClientW, `shell ${m.appScrollW}/${m.appClientW}`);
      ok(`${tag} (a) no element reaches past the viewport's side edges`, m.wideCount === 0, m.wide.join(' ; '));
      ok(`${tag} (a) a sideways scroll moves nothing but the strip`, m.moved.winX === 0 && m.moved.appX === 0 && m.moved.vvX === 0, JSON.stringify(m.moved));
      // (b) shell slots + stable height
      ok(`${tag} (b) header, main and tab bar are the shell's own children`, m.slots.header && m.slots.nav && m.slots.mainInApp && m.slots.dockInMain, JSON.stringify(m.slots));
      ok(`${tag} (b) shell computed height == viewport height`, m.appComputedH === `${m.vh}px`, `computed ${m.appComputedH}, viewport ${m.vh}px`);
      ok(`${tag} (b) the document itself cannot scroll (the strip page is the scroller)`, m.docScrollable <= 0 && m.moved.winY === 0 && (m.appOverflowY === 'auto' || m.appOverflowY === 'scroll') && m.pageOverflowY === 'auto', `doc overflow ${m.docScrollable}px, window.scrollY after scroll ${m.moved.winY}, shell overflow-y ${m.appOverflowY}, page overflow-y ${m.pageOverflowY}`);
      ok(`${tag} (b) the content really scrolled under the panels`, m.pageScrollH > m.pageClientH ? m.moved.pageY > 0 : true, `page ${m.pageScrollH}/${m.pageClientH}, scrolled ${m.moved.pageY}`);
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
// (c) Feel round 2 (2026-11-19, Lorico's on-device report on the live strip): a horizontal
// swipe that STARTS ON PANEL CONTENT pages the strip — on every panel, from a Plan row
// button, a log entry and a settings label alike — and a settle onto a new panel gives one
// haptic click. Real touch drags through CDP (touchStart, 20 touchMoves, touchEnd): the
// browser's own gesture detector and compositor scroll latching decide, as under a finger.
// The cause was `.page { overscroll-behavior: none }`: each page is a vertical scroller, it
// latched the sideways gesture and, with overscroll-behavior-x none, would not hand it up
// to the strip (diagnosis: test/dom/diag-swipe-touch.mjs, HANDOFF-FEEL.md).
for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((save) => {
    try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ }
    window.__vib = [];
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: function (p) { window.__vib.push({ p, t: performance.now() }); return true; } });
  }, JSON.stringify(seedRecord('dial')));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('#root *');
  await page.waitForTimeout(300);
  const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
  if (await ack.count()) await ack.first().click();
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);
  const drag = async (x, y, dx, dy) => {
    const N = 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= N; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * i / N, y: y + dy * i / N }] }); await new Promise((r) => setTimeout(r, 10)); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const seated = () => page.waitForFunction(() => { const m = document.querySelector('main.pages'), p = document.querySelector('.page.is-active'); return m && p && Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2500 }).then(() => true, () => false);
  const st = () => page.evaluate(() => ({ active: document.querySelector('.page.is-active')?.className.match(/page-(\w+)/)?.[1], bar: document.querySelector('nav.tabs button.on')?.textContent.trim(), vib: window.__vib.length, top: document.querySelector('.page.is-active')?.scrollTop }));
  // the first element matching `sel` on the active page whose centre is on screen, between
  // the header and the tab bar / dock: where a finger on that content would land
  const spot = (sel) => page.evaluate((q) => {
    const pg = document.querySelector('.page.is-active');
    const hb = document.querySelector('header.top')?.getBoundingClientRect().bottom ?? 0;
    const dock = pg.querySelector('.dock'), nav = document.querySelector('nav.tabs');
    const lim = Math.min(nav.getBoundingClientRect().top, dock ? dock.getBoundingClientRect().top : Infinity);
    for (const el of pg.querySelectorAll(q)) {
      const r = el.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
      if (r.width && r.height && y > hb + 8 && y < lim - 8) {
        const hit = document.elementFromPoint(x, y);
        if (hit && pg.contains(hit) && hit !== pg) return { x, y, hit: `${hit.tagName.toLowerCase()}${hit.className && typeof hit.className === 'string' ? '.' + hit.className.split(' ')[0] : ''}`, inControl: !!hit.closest('button, a, input, select, textarea, label') };
      }
    }
    return null;
  }, sel);
  const tag = `[${W}x${H} swipe]`;
  const css = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.page')); return `${c.overscrollBehaviorX}/${c.overscrollBehaviorY}`; });
  ok(`${tag} (c) a page hands sideways overscroll up to the strip (overscroll-behavior x auto), and keeps vertical closed (y none)`, css === 'auto/none', css);
  await seated();
  // [from-panel, content selector, dx, expected panel, label]
  const legs = [
    ['now', '.hero, .card, section', -1, 'plan', 'Now content'],
    ['plan', 'button.plan-item b, button.plan-item', -1, 'log', 'a Plan row (button)'],
    ['log', 'button.entry', -1, 'settings', 'a Log entry (button)'],
    ['settings', 'label, .card', 1, 'log', 'a More/Settings row'],
    ['log', 'button.entry', 1, 'plan', 'a Log entry, rightward'],
    ['plan', 'button.plan-item b, button.plan-item', 1, 'now', 'a Plan row, rightward'],
  ];
  for (const [from, sel, dir, want, label] of legs) {
    const b = await st();
    if (b.active !== from) { ok(`${tag} (c) leg setup on ${from}`, false, `active ${b.active}`); break; }
    const at = await spot(sel);
    if (!at) { ok(`${tag} (c) a swipe starting on ${label} pages ${from} → ${want}`, false, `no on-screen ${sel}`); break; }
    await drag(at.x, at.y, dir * Math.round(W * 0.7), 0);
    await page.waitForTimeout(400); await seated(); await page.waitForTimeout(250);
    const a = await st();
    ok(`${tag} (c) a swipe starting on ${label} pages ${from} → ${want}`, a.active === want && a.bar === { now: 'Now', plan: 'Plan', log: 'Log', settings: 'More' }[want], `start on ${at.hit} (in a control: ${at.inControl}) → active ${a.active}, bar ${a.bar}`);
    ok(`${tag} (c) …and its settle gives exactly one haptic click`, a.vib - b.vib === 1, `vibrate calls +${a.vib - b.vib}`);
  }
  // a slightly diagonal swipe (thumbs are not rulers) still pages
  {
    const b = await st(); const at = await spot('.hero, .card, section');
    if (at) { await drag(at.x, at.y, -Math.round(W * 0.7), 40); await page.waitForTimeout(400); await seated(); await page.waitForTimeout(250); }
    const a = await st();
    ok(`${tag} (c) a slightly diagonal swipe on Now content still pages to Plan`, b.active === 'now' && a.active === 'plan', `${b.active} → ${a.active}`);
  }
  // vertical scrolling is untouched: a vertical drag on Log scrolls the page, never the strip
  {
    await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes('Log')).click());
    await page.waitForTimeout(300); await seated(); await page.waitForTimeout(200);
    const b = await st(); const at = await spot('button.entry');
    if (at) { await drag(at.x, at.y, 0, -300); await page.waitForTimeout(500); }
    const a = await st();
    ok(`${tag} (c) a vertical drag on Log content scrolls the page and leaves the strip on Log`, b.active === 'log' && a.active === 'log' && a.top > b.top && a.vib === b.vib, `${b.active}/${b.top} → ${a.active}/${a.top}, vibrate +${a.vib - b.vib}`);
  }
  // a tab-bar tap glides the strip but gives no settle click (only the bar button's own
  // pre-existing tap tick, which fires on the click itself — never 120ms+ later at the settle)
  {
    const b = await st();
    const box = await page.evaluate(() => { const r = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes('More')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const t0 = await page.evaluate(() => performance.now());
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(500); await seated(); await page.waitForTimeout(400);
    const a = await st();
    const late = await page.evaluate((t) => window.__vib.filter((v) => v.t - t > 100).length, t0);
    ok(`${tag} (c) a tab-bar tap moves the strip with no settle haptic`, a.active === 'settings' && late === 0 && a.vib - b.vib <= 1, `active ${a.active}; vibrate +${a.vib - b.vib}, ${late} of them after the tap itself`);
  }
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
// (d) Gemini round (2026-11-19): Gemini's live-site breakdown, the layout items, in Gemini's own
// state — DEMO, then one status tap: Off Duty for 1h59 with nothing behind it ("History incomplete").
//   D  the Log's live row keeps its duration on the title's line, right-aligned (it wrapped under
//      the dot: the live row had a 2-column grid for 4 children); A rides along (count = rows).
//   F  the meter's segments are whole (the tile rounds to the bar — a fixed 12px tile left a cut
//      sliver at the right end), and nothing on a Timeline axis track reaches past either end
//      (the 70-hr cap hung 1.5px out, its run-past arrow 2px).
//   E  the "History incomplete" banner holds its button inside its border on Plan, the load
//      check and More (Gemini saw it overflow on Plan; not reproduced at any size — a guard).
//   C  content scrolled into view lands clear of the fixed bars: the pages' scroll padding now
//      covers the tab bar (and on Now the status dock), so scrollIntoView / focus no longer park
//      a target behind them; and at the end of the scroll everything clears (guard).
const geminiSeed = (nowCard) => ({ segments: [], current: { status: 'OFF', since: nowMinute - 119, createdAt: 1 }, historyAcknowledged: false, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard, nowCardAsked: true });
for (const [W, H] of SIZES) {
  for (const nowCard of ['dial', 'timeline']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => { try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ } }, JSON.stringify(geminiSeed(nowCard)));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForSelector('#root *');
    await page.waitForTimeout(300);
    const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
    if (await ack.count()) await ack.first().click();
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const tag = `[${W}x${H} ${nowCard} gemini]`;
    const tap = (sel, text) => page.evaluate(([q, t]) => { const b = [...document.querySelectorAll(q)].find((x) => x.textContent.includes(t)); if (!b) throw new Error('no ' + q + ' with ' + t); b.click(); }, [sel, text]);
    const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => { const m = document.querySelector('main'), p = document.querySelector('.page.is-active'); return !m || !p || Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2000 }).catch(() => {}); };
    // ---- Now
    const now = await page.evaluate(async () => {
      const two = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const pg = document.querySelector('.page.is-active');
      const dock = pg.querySelector('.dock');
      const meters = [...pg.querySelectorAll('.meter-bar')].map((b) => { const a = getComputedStyle(b, '::after'); return { repeat: a.backgroundRepeat, size: a.backgroundSize, img: a.backgroundImage.slice(0, 26) }; });
      const over = [];
      for (const t of pg.querySelectorAll('.taxis-track:not(.taxis-track-head)')) {
        const tb = t.getBoundingClientRect();
        for (const c of t.querySelectorAll('*')) { const r = c.getBoundingClientRect(); if (!r.width) continue; if (r.right - tb.right > 0.05 || tb.left - r.left > 0.05) over.push(`${c.className} ${(r.left - tb.left).toFixed(2)}..${(r.right - tb.right).toFixed(2)}`); }
      }
      const arrows = pg.querySelectorAll('.taxis-arrow').length;
      // C: scroll the Last-24h card into view at the bottom edge — the browser honours scroll-padding
      const card = [...pg.querySelectorAll('.card')].find((c) => /Last 24 hours/i.test(c.textContent));
      card.scrollIntoView({ block: 'end' }); await two();
      const intoView = { cardBottom: card.getBoundingClientRect().bottom, dockTop: dock.getBoundingClientRect().top };
      pg.scrollTop = 1e6; await two();
      const rest = [...pg.querySelectorAll('.now-rest > *')].filter((e) => !e.classList.contains('dock') && e.getBoundingClientRect().height > 0);
      const atEnd = { lastBottom: rest[rest.length - 1].getBoundingClientRect().bottom, dockTop: dock.getBoundingClientRect().top, lastText: rest[rest.length - 1].textContent.slice(0, 30) };
      pg.scrollTop = 0; await two();
      return { meters, over, arrows, intoView, atEnd, dockH: getComputedStyle(document.documentElement).getPropertyValue('--dock-h') };
    });
    if (nowCard === 'dial') {
      ok(`${tag} (d) F: every meter's segment tile rounds to the bar (whole segments, no cut sliver)`, now.meters.length === 4 && now.meters.every((m) => m.repeat === 'round' && /^12px/.test(m.size)), JSON.stringify(now.meters[0]));
    } else {
      ok(`${tag} (d) F: nothing on a Timeline axis track reaches past either end (cap, walls, run-past arrow)`, now.over.length === 0 && now.arrows > 0, `${now.arrows} arrow(s); ${now.over.join(' ; ')}`);
    }
    ok(`${tag} (d) C: the Last-24h card scrolled into view (block end) lands clear of the status dock`, now.intoView.cardBottom <= now.intoView.dockTop + 0.5, `card bottom ${now.intoView.cardBottom.toFixed(1)}, dock top ${now.intoView.dockTop.toFixed(1)} (--dock-h ${now.dockH})`);
    ok(`${tag} (d) C: at the end of Now's scroll the last row ("Exceptions this shift") clears the dock`, now.atEnd.lastBottom <= now.atEnd.dockTop && /Exceptions this shift/.test(now.atEnd.lastText), `${now.atEnd.lastText} bottom ${now.atEnd.lastBottom.toFixed(1)}, dock top ${now.atEnd.dockTop.toFixed(1)}`);
    if (nowCard === 'dial') {
      // ---- E: the banner on Plan / the load check / More
      const banner = () => page.evaluate(() => { const pg = document.querySelector('.page.is-active'); const box = [...pg.querySelectorAll('.warnbox')].find((b) => b.textContent.includes('History incomplete')); if (!box) return null; const btn = box.querySelector('button'); const cs = getComputedStyle(box); return +(btn.getBoundingClientRect().bottom - (box.getBoundingClientRect().bottom - parseFloat(cs.borderBottomWidth))).toFixed(1); });
      await tap('nav.tabs button', 'Plan'); await settle();
      const eHub = await banner();
      await tap('.page.is-active button', 'Can I take this load?'); await settle();
      const eLoad = await banner();
      // ---- C: the load check's step 2 Next, scrolled into view, clears the tab bar
      await tap('.page.is-active button', 'Next: when you leave'); await page.waitForTimeout(250);
      const step2 = await page.evaluate(async () => {
        const two = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const pg = document.querySelector('.page.is-active'); const nav = document.querySelector('nav.tabs'); const next = pg.querySelector('button.flow-next');
        next.scrollIntoView({ block: 'end' }); await two();
        const a = { bottom: next.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top };
        pg.scrollTop = 1e6; await two();
        const b = { bottom: next.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top };
        pg.scrollTop = 0; await two();
        return { a, b, head: pg.querySelector('.flow-head').textContent };
      });
      ok(`${tag} (d) C: load step 2's Next scrolled into view lands clear of the tab bar`, step2.a.bottom <= step2.a.navTop + 0.5, `next bottom ${step2.a.bottom.toFixed(1)}, bar top ${step2.a.navTop.toFixed(1)}`);
      ok(`${tag} (d) C: …and at the end of the scroll it clears the bar`, step2.b.bottom <= step2.b.navTop, `next bottom ${step2.b.bottom.toFixed(1)}, bar top ${step2.b.navTop.toFixed(1)}`);
      await tap('nav.tabs button', 'More'); await settle();
      const eMore = await banner();
      ok(`${tag} (d) E: the "History incomplete" button sits inside its banner on Plan, the load check and More`, [eHub, eLoad, eMore].every((x) => x !== null && x <= 0), `plan ${eHub}, load ${eLoad}, more ${eMore} (px past the inner bottom edge)`);
      // ---- D (+A): the Log's live row
      await tap('nav.tabs button', 'Log'); await settle();
      const log = await page.evaluate(() => {
        const pg = document.querySelector('.page.is-active');
        const live = pg.querySelector('.entry.live'); if (!live) return null;
        const len = live.querySelector('.entry-len').getBoundingClientRect(), name = live.querySelector('b').getBoundingClientRect(), row = live.getBoundingClientRect(), ico = live.querySelector('svg').getBoundingClientRect();
        return { sameLine: len.top < name.bottom && len.bottom > name.top, rightOfTitle: len.left >= name.right, chevronLast: ico.left >= len.right && ico.right <= row.right + 0.5, lenLines: Math.round(len.height / parseFloat(getComputedStyle(live.querySelector('.entry-len')).lineHeight || '20')), title: (pg.textContent.match(/Entries on this day \(\d+\)/) || [''])[0], rows: pg.querySelectorAll('.entry').length };
      });
      ok(`${tag} (d) D: the live row's duration stays on the title's line, right of it, before the chevron`, log && log.sameLine && log.rightOfTitle && log.chevronLast, JSON.stringify(log));
      ok(`${tag} (d) A: the Log title counts the live row it draws`, log && log.title === `Entries on this day (${log.rows})` && log.rows === 1, JSON.stringify(log && { title: log.title, rows: log.rows }));
    }
    ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
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
