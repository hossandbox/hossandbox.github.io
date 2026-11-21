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
        // Re-aimed (2026-11-20 logpin): on Log the vertical scroller is .log-scroll inside non-scrolling .page-log; other pages scroll on .page.
        const isLog = !!(page && page.classList.contains('page-log'));
        const scroller = isLog ? (page.querySelector('.log-scroll') || page) : page;
        // try to scroll everything, both axes, the way a thumb would. The strip itself
        // may move sideways — that is its job — so its seat is restored in the same
        // task, before the app's settle timer can read the probe as a page change.
        window.scrollTo(200, 100000);
        if (app) { app.scrollTop = 100000; app.scrollLeft = 200; }
        if (page) page.scrollTop = 100000;
        if (scroller && scroller !== page) scroller.scrollTop = 100000;
        if (main) { main.scrollLeft = 200; }
        const stripMoved = main ? main.scrollLeft : null;
        if (main && page) main.scrollLeft = page.offsetLeft;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const after = { header: rect(header), nav: rect(nav), dock: rect(dock) };
        const moved = { winX: window.scrollX, winY: window.scrollY, appX: app ? app.scrollLeft : null, appY: app ? app.scrollTop : null, pageY: page ? page.scrollTop : null, scrollerY: scroller ? scroller.scrollTop : null, stripMoved, vvX: window.visualViewport ? window.visualViewport.offsetLeft + window.visualViewport.pageLeft : 0 };
        const out = {
          vw, vh, innerW, docScrollW: de.scrollWidth, docClientW: de.clientWidth, bodyScrollW: body.scrollWidth,
          appScrollW: app ? app.scrollWidth : null, appClientW: app ? app.clientWidth : null,
          appScrollH: app ? app.scrollHeight : null, appClientH: app ? app.clientHeight : null,
          appComputedH: app ? getComputedStyle(app).height : null, appOverflowY: app ? getComputedStyle(app).overflowY : null,
          pageScrollH: page ? page.scrollHeight : null, pageClientH: page ? page.clientHeight : null, pageOverflowY: page ? getComputedStyle(page).overflowY : null,
          scrollerScrollH: scroller ? scroller.scrollHeight : null, scrollerClientH: scroller ? scroller.clientHeight : null, scrollerOverflowY: scroller ? getComputedStyle(scroller).overflowY : null,
          isLog,
          docScrollable, wide: wide.slice(0, 12), wideCount: wide.length, before, after, moved,
          slots: { header: !!header && header.parentElement === app, nav: !!nav && nav.parentElement === app, dockInMain: !dock || (!!main && main.contains(dock)), mainInApp: !!main && main.parentElement === app },
        };
        window.scrollTo(0, 0); if (app) { app.scrollTop = 0; app.scrollLeft = 0; } if (page) page.scrollTop = 0; if (scroller && scroller !== page) scroller.scrollTop = 0; if (main && page) main.scrollLeft = page.offsetLeft;
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
      // Re-aimed (2026-11-20 logpin): on Log .page-log has overflow-y:hidden and .log-scroll is the overflow-y:auto scroller; other pages keep overflow-y:auto on .page.
      ok(`${tag} (b) the document itself cannot scroll (active screen scroller is overflow-y auto)`, m.docScrollable <= 0 && m.moved.winY === 0 && (m.appOverflowY === 'auto' || m.appOverflowY === 'scroll') && m.scrollerOverflowY === 'auto' && (!m.isLog || (m.pageOverflowY === 'hidden' && m.moved.pageY === 0)), `doc overflow ${m.docScrollable}px, window.scrollY ${m.moved.winY}, shell ${m.appOverflowY}, page ${m.pageOverflowY}, scroller ${m.scrollerOverflowY}, pageY ${m.moved.pageY}`);
      ok(`${tag} (b) the content really scrolled under the panels`, m.scrollerScrollH > m.scrollerClientH ? m.moved.scrollerY > 0 : true, `scroller ${m.scrollerScrollH}/${m.scrollerClientH}, scrolled ${m.moved.scrollerY}`);
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
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: function (p) { const m = document.querySelector('main.pages'); window.__vib.push({ p, t: performance.now(), sl: m ? m.scrollLeft : -1, w: m ? m.clientWidth : 0 }); return true; } });
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
  // Re-aimed (2026-11-20 logpin): Log's vertical scroll lives on .log-scroll inside non-scrolling .page-log.
  const st = () => page.evaluate(() => {
    const pg = document.querySelector('.page.is-active');
    const sc = pg && pg.classList.contains('page-log') ? (pg.querySelector('.log-scroll') || pg) : pg;
    return { active: pg?.className.match(/page-(\w+)/)?.[1], bar: document.querySelector('nav.tabs button.on')?.textContent.trim(), vib: window.__vib.length, top: sc?.scrollTop, pageTop: pg?.scrollTop };
  });
  // the first element matching `sel` on the active page whose centre is on screen, between
  // the header/pinned top and the tab bar / dock / pinned footer: where a finger on that content would land
  const spot = (sel) => page.evaluate((q) => {
    const pg = document.querySelector('.page.is-active');
    const hb = Math.max(document.querySelector('header.top')?.getBoundingClientRect().bottom ?? 0, pg.querySelector('.log-pin')?.getBoundingClientRect().bottom ?? 0);
    const dock = pg.querySelector('.dock'), foot = pg.querySelector('.log-foot'), nav = document.querySelector('nav.tabs');
    const lim = Math.min(nav.getBoundingClientRect().top, dock ? dock.getBoundingClientRect().top : Infinity, foot ? foot.getBoundingClientRect().top : Infinity);
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
  // Re-aimed (2026-11-20 nowplain): bar order Plan(0) — Now(1) — Log(2) — More(3) (opens on Now at index 1).
  // [from-panel, content selector, dx, expected panel, label]
  const legs = [
    ['now', '.hero, .card, section', -1, 'log', 'Now content'],
    ['log', 'button.entry', -1, 'settings', 'a Log entry (button)'],
    ['settings', 'label, .card', 1, 'log', 'a More/Settings row'],
    ['log', 'button.entry', 1, 'now', 'a Log entry, rightward'],
    ['now', '.hero, .card, section', 1, 'plan', 'Now content, rightward'],
    ['plan', 'button.plan-item b, button.plan-item', -1, 'now', 'a Plan row (button)'],
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
  // Re-aimed (2026-11-20 nowplain): leftward diagonal swipe from Now pages to Log (index 2).
  // a slightly diagonal swipe (thumbs are not rulers) still pages
  {
    const b = await st(); const at = await spot('.hero, .card, section');
    if (at) { await drag(at.x, at.y, -Math.round(W * 0.7), 40); await page.waitForTimeout(400); await seated(); await page.waitForTimeout(250); }
    const a = await st();
    ok(`${tag} (c) a slightly diagonal swipe on Now content still pages to Log`, b.active === 'now' && a.active === 'log', `${b.active} → ${a.active}`);
  }
  // vertical scrolling is untouched: a vertical drag on Log scrolls the page, never the strip
  {
    await page.evaluate(() => [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes('Log')).click());
    await page.waitForTimeout(300); await seated(); await page.waitForTimeout(200);
    // Near midnight the seed record's current carrier day is nearly empty (its 30 h span sits
    // mostly in yesterday), leaving .log-scroll nothing to scroll; step back a day so the drag
    // always has a genuinely overflowing list (Ada rerun 2026-11-21 ~00:01 CT: top 0 → 0).
    const overflows = await page.evaluate(() => { const sc = document.querySelector('.page-log .log-scroll'); return !!sc && sc.scrollHeight > sc.clientHeight + 4; });
    if (!overflows) { await page.click('.page-log button[aria-label="Previous day"]'); await page.waitForTimeout(300); }
    const b = await st(); const at = await spot('button.entry');
    if (at) { await drag(at.x, at.y, 0, -300); await page.waitForTimeout(500); }
    const a = await st();
    ok(`${tag} (c) a vertical drag on Log content scrolls the page and leaves the strip on Log`, b.active === 'log' && a.active === 'log' && a.top > b.top && a.vib === b.vib, `${b.active}/${b.top} → ${a.active}/${a.top}, vibrate +${a.vib - b.vib}`);
  }
  // Re-aimed (2026-11-20 nowplain): from Log(2), Now(1) is the adjacent tab.
  // a tab-bar tap glides the strip and ticks ONCE, when it locks onto the new panel — never on
  // the tap itself (haptic timing, 2026-11-20: "The haptic feedback should happen only when the
  // screen locks into place. Both the swiping and the tapping."). A tap on the tab of the panel
  // already showing never ticks at all.
  {
    const b = await st();
    const box = await page.evaluate(() => { const r = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes('Now')).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const t0 = await page.evaluate(() => performance.now());
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(500); await seated(); await page.waitForTimeout(400);
    const a = await st();
    const early = await page.evaluate((t) => window.__vib.filter((v) => v.t >= t && v.t - t <= 100).length, t0);
    const late = await page.evaluate((t) => window.__vib.filter((v) => v.t - t > 100).length, t0);
    ok(`${tag} (c) a tab-bar tap to another panel: no tick on the tap, exactly one when the strip locks on`, a.active === 'now' && early === 0 && late === 1 && a.vib - b.vib === 1, `active ${a.active}; vibrate +${a.vib - b.vib} (${early} within 100ms of the tap, ${late} after)`);
    const b2 = await st();
    await page.touchscreen.tap(box.x, box.y);
    await page.waitForTimeout(500); await seated(); await page.waitForTimeout(400);
    const a2 = await st();
    ok(`${tag} (c) a tap on the tab of the panel already showing never ticks`, a2.active === 'now' && a2.vib === b2.vib, `active ${a2.active}; vibrate +${a2.vib - b2.vib}`);
  }
  // Re-aimed (2026-11-20 nowplain): Plan(0)–Now(1)–Log(2)–More(3); Now↔More is 2 ticks (pass Log),
  // Plan↔More is 3 ticks, Plan→Log is 2 ticks, Now→Plan and Now→Log are 1 tick each.
  {
    const tabBox = (label) => page.evaluate((l) => { const r = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.includes(l)).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, label);
    const glide = async (label) => {
      const box = await tabBox(label);
      const n0 = await page.evaluate(() => window.__vib.length);
      const t0 = await page.evaluate(() => performance.now());
      await page.touchscreen.tap(box.x, box.y);
      await page.waitForTimeout(700); await seated(); await page.waitForTimeout(400);
      const got = await page.evaluate((n) => window.__vib.slice(n), n0);
      const a = await st();
      const early = got.filter((v) => v.t - t0 <= 100).length;
      return { a, got, early, t0 };
    };
    const where = (g) => g.got.map((v) => `${Math.round(v.t - g.t0)}ms@${(v.sl / (v.w || 1)).toFixed(2)}`).join(' ');
    // Now(1) → More(3): pass Log(2), lock More(3) = 2 ticks
    const g1 = await glide('More');
    const pos1 = g1.got.map((v) => v.sl / (v.w || 1));
    ok(`${tag} (c) amendment A (nowplain): Now → More ticks 2 times (pass Log, lock More), none at press`, g1.a.active === 'settings' && g1.got.length === 2 && g1.early === 0 && pos1[0] >= 1.99 && pos1[0] < 2.5 && pos1[1] >= 2.99, `active ${g1.a.active}; ${g1.got.length} ticks, ${g1.early} early: ${where(g1)}`);
    // More(3) → Now(1): pass Log(2), lock Now(1) = 2 ticks
    const g2 = await glide('Now');
    const pos2 = g2.got.map((v) => v.sl / (v.w || 1));
    ok(`${tag} (c) amendment A (nowplain): More → Now ticks 2 times (pass Log, lock Now), none at press`, g2.a.active === 'now' && g2.got.length === 2 && g2.early === 0 && pos2[0] <= 2.01 && pos2[0] > 1.5 && Math.abs(pos2[1] - 1) <= 0.02, `active ${g2.a.active}; ${g2.got.length} ticks, ${g2.early} early: ${where(g2)}`);
    // Now(1) → Plan(0): adjacent = 1 tick at lock
    const g3 = await glide('Plan');
    ok(`${tag} (c) amendment A (nowplain): Now → Plan ticks once, at the lock`, g3.a.active === 'plan' && g3.got.length === 1 && g3.early === 0 && g3.got[0].sl / (g3.got[0].w || 1) <= 0.02, `active ${g3.a.active}; ${g3.got.length} ticks: ${where(g3)}`);
    // Plan(0) → More(3): pass Now(1), pass Log(2), lock More(3) = 3 ticks
    const g4 = await glide('More');
    const pos4 = g4.got.map((v) => v.sl / (v.w || 1));
    ok(`${tag} (c) amendment A (nowplain): Plan → More ticks 3 times (Now, Log, lock More), none at press`, g4.a.active === 'settings' && g4.got.length === 3 && g4.early === 0 && pos4[0] >= 0.99 && pos4[0] < 1.5 && pos4[1] >= 1.99 && pos4[1] < 2.5 && pos4[2] >= 2.99, `active ${g4.a.active}; ${g4.got.length} ticks, ${g4.early} early: ${where(g4)}`);
    // More(3) → Plan(0): pass Log(2), pass Now(1), lock Plan(0) = 3 ticks
    const g5 = await glide('Plan');
    const pos5 = g5.got.map((v) => v.sl / (v.w || 1));
    ok(`${tag} (c) amendment A (nowplain): More → Plan ticks 3 times (Log, Now, lock Plan), none at press`, g5.a.active === 'plan' && g5.got.length === 3 && g5.early === 0 && pos5[0] <= 2.01 && pos5[0] > 1.5 && pos5[1] <= 1.01 && pos5[1] > 0.5 && pos5[2] <= 0.02, `active ${g5.a.active}; ${g5.got.length} ticks, ${g5.early} early: ${where(g5)}`);
    // Plan(0) → Log(2): pass Now(1), lock Log(2) = 2 ticks
    const g6 = await glide('Log');
    const pos6 = g6.got.map((v) => v.sl / (v.w || 1));
    ok(`${tag} (c) amendment A (nowplain): Plan → Log ticks 2 times (Now, lock Log), none at press`, g6.a.active === 'log' && g6.got.length === 2 && g6.early === 0 && pos6[0] >= 0.99 && pos6[0] < 1.5 && Math.abs(pos6[1] - 2) <= 0.02, `active ${g6.a.active}; ${g6.got.length} ticks, ${g6.early} early: ${where(g6)}`);
    await glide('Now');
    // Now(1) → Log(2): adjacent = 1 tick at lock
    const g7 = await glide('Log');
    ok(`${tag} (c) amendment A (nowplain): Now → Log ticks once, at the lock`, g7.a.active === 'log' && g7.got.length === 1 && g7.early === 0 && Math.abs(g7.got[0].sl / (g7.got[0].w || 1) - 2) <= 0.02, `active ${g7.a.active}; ${g7.got.length} ticks: ${where(g7)}`);
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
// (e) DESIGN-NAV + nowplain (2026-11-20): browser-verified pins for the equal-width bar
// (Plan — Now — Log — More), open-on-Now at frame 1 (R2), driving-view return (R1), Now-only
// dock & --dock-h stability, plain Now button (no tab-now class or plate), TimeHead headers
// traveling with Log/Plan, and zero overflow across both sizes & themes.
for (const [W, H] of SIZES) {
  for (const theme of ['day', 'night']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => {
      try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ }
      window.__firstFrame = null;
      const obs = new MutationObserver(() => {
        const m = document.querySelector('main.pages');
        if (!m || window.__firstFrame) return;
        obs.disconnect();
        requestAnimationFrame(() => {
          const p = document.querySelector('.page.is-active');
          const np = document.querySelector('.page-now');
          window.__firstFrame = {
            sl: m.scrollLeft,
            iw: window.innerWidth,
            active: p ? p.className : null,
            nowLeft: np ? Math.round(np.getBoundingClientRect().left * 10) / 10 : null,
          };
        });
      });
      obs.observe(document, { childList: true, subtree: true });
    }, JSON.stringify({ ...seedRecord('dial'), theme }));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForSelector('main.pages');
    await page.waitForFunction(() => window.__firstFrame !== null, null, { timeout: 2000 });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(150);
    const tag = `[${W}x${H} ${theme} nav]`;
    const tapNav = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('no tab ' + l); b.click(); }, label);
    const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => { const m = document.querySelector('main.pages'), p = document.querySelector('.page.is-active'); return !m || !p || Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2500 }).catch(() => {}); };

    // 1 + 2. Order & Open-on-Now at the first animation frame after load (R2)
    // Re-aimed (2026-11-20 nowplain): Log and Plan swapped — bar is Plan/Now/Log/More and strip is page-plan/page-now/page-log/page-settings.
    const open = await page.evaluate(() => {
      const bar = [...document.querySelectorAll('nav.tabs button')].map((b) => b.textContent.trim());
      const strip = [...document.querySelectorAll('main.pages > section.page')].map((s) => [...s.classList].find((c) => c.startsWith('page-')));
      return { ff: window.__firstFrame, bar, strip };
    });
    ok(`${tag} (e) order: bar is Plan/Now/Log/More and strip is page-plan/page-now/page-log/page-settings`, JSON.stringify(open.bar) === '["Plan","Now","Log","More"]' && JSON.stringify(open.strip) === '["page-plan","page-now","page-log","page-settings"]', JSON.stringify(open));
    ok(`${tag} (e) open on Now at first animation frame (R2): scrollLeft === innerWidth and page-now visible`, open.ff && open.ff.sl === W && open.ff.iw === W && /\bpage-now\b/.test(open.ff.active || '') && Math.abs(open.ff.nowLeft) <= 1, JSON.stringify(open.ff));

    // 6. Equal-width tabs & plain Now treatment (active)
    // Re-aimed (2026-11-20 nowplain): four equal-width columns (1fr 1fr 1fr 1fr) spanning exact viewport width; Now carries no tab-now class and no ::after plate background.
    const nowStyle = await page.evaluate(() => {
      const nav = document.querySelector('nav.tabs');
      const btns = [...nav.querySelectorAll('button')];
      const nowBtns = [...nav.querySelectorAll('button.tab-now')];
      const nb = btns[1];
      const rects = btns.map((b) => { const r = b.getBoundingClientRect(); return { left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, top: Math.round(r.top * 10) / 10 }; });
      const navR = nav.getBoundingClientRect();
      const cs = getComputedStyle(nb), aft = getComputedStyle(nb, '::after'), bef = getComputedStyle(nb, '::before');
      const svgCol = getComputedStyle(nb.querySelector('svg')).color;
      return {
        tabNowCount: nowBtns.length,
        nowHasTabNow: nb.classList.contains('tab-now'),
        on: nb.classList.contains('on'),
        widths: rects.map((r) => r.width),
        sumWidth: Math.round(rects.reduce((a, r) => a + r.width, 0) * 10) / 10,
        firstLeft: rects[0].left,
        lastRight: rects[rects.length - 1].right,
        heights: rects.map((r) => r.height),
        tops: rects.map((r) => r.top),
        navTop: Math.round(navR.top * 10) / 10,
        aftContent: aft.content,
        aftBg: aft.backgroundColor,
        befBg: bef.backgroundColor,
        bgImg: cs.backgroundImage,
        color: cs.color,
        svgCol,
      };
    });
    const wantText = theme === 'day' ? 'rgb(11, 17, 23)' : 'rgb(243, 238, 228)';
    const wantMuted = theme === 'day' ? 'rgb(69, 82, 95)' : 'rgb(170, 167, 157)';
    const wantAccent = theme === 'day' ? 'rgb(11, 95, 168)' : 'rgb(124, 200, 255)';
    const maxW = Math.max(...nowStyle.widths), minW = Math.min(...nowStyle.widths);
    ok(`${tag} (e) equal-width tabs: all four measure equal width (${W / 4}px), span [0..${W}], 60px height, nothing raised`,
      maxW - minW <= 0.5
      && Math.abs(nowStyle.sumWidth - W) <= 0.5
      && Math.abs(nowStyle.firstLeft) <= 0.5
      && Math.abs(nowStyle.lastRight - W) <= 0.5
      && nowStyle.heights.every((h) => Math.abs(h - 60) <= 1)
      && nowStyle.tops.every((t) => Math.abs(t - nowStyle.tops[0]) <= 0.5 && t >= nowStyle.navTop),
      JSON.stringify(nowStyle));
    ok(`${tag} (e) Now active button matches standard .on styling: no tab-now class, no ::after plate, standard text/accent/bar`,
      nowStyle.tabNowCount === 0 && !nowStyle.nowHasTabNow && nowStyle.on
      && nowStyle.aftContent === 'none' && nowStyle.aftBg === 'rgba(0, 0, 0, 0)'
      && nowStyle.color === wantText && nowStyle.svgCol === wantAccent && nowStyle.befBg === wantAccent
      && /linear-gradient/.test(nowStyle.bgImg),
      JSON.stringify(nowStyle));

    // 4 + 5. Dock Now-only geometry & --dock-h stability across all 4 panels, plus TimeHead & overflow
    const dockNow = await page.evaluate(() => {
      const docks = [...document.querySelectorAll('.dock')];
      const nowPg = document.querySelector('section.page-now');
      const nav = document.querySelector('nav.tabs');
      const dr = docks[0]?.getBoundingClientRect(), nr = nav.getBoundingClientRect();
      return {
        count: docks.length,
        inNow: !!nowPg && nowPg.contains(docks[0]),
        inNav: nav.contains(docks[0]),
        hasDockClasses: [...document.querySelectorAll('main.pages > section.has-dock')].map((s) => [...s.classList].find((c) => c.startsWith('page-'))),
        dockH: getComputedStyle(document.documentElement).getPropertyValue('--dock-h').trim(),
        dockBottom: dr ? Math.round(dr.bottom * 10) / 10 : null,
        navTop: Math.round(nr.top * 10) / 10,
        dockLeft: dr ? Math.round(dr.left * 10) / 10 : null,
        dockRight: dr ? Math.round(dr.right * 10) / 10 : null,
        nowInert: nowPg.inert || nowPg.hasAttribute('inert'),
        nowHidden: nowPg.getAttribute('aria-hidden'),
      };
    });
    ok(`${tag} (e) dock on Now: unique in page-now, flush on bar, full width, not inert`,
      dockNow.count === 1 && dockNow.inNow && !dockNow.inNav
      && JSON.stringify(dockNow.hasDockClasses) === '["page-now"]'
      && Math.abs(dockNow.dockBottom - dockNow.navTop) <= 1
      && dockNow.dockLeft === 0 && dockNow.dockRight === W
      && !dockNow.nowInert && dockNow.nowHidden !== 'true',
      JSON.stringify(dockNow));

    const offChecks = [];
    for (const label of ['Plan', 'Log', 'More', 'Now']) {
      await tapNav(label); await settle();
      const snap = await page.evaluate((lbl) => {
        const de = document.documentElement;
        const pg = document.querySelector('.page.is-active');
        const nowPg = document.querySelector('section.page-now');
        const dock = document.querySelector('.dock');
        const dr = dock.getBoundingClientRect();
        const navBtns = [...document.querySelectorAll('nav.tabs button')];
        const nb = navBtns[1];
        const tabClips = navBtns.filter((b) => b.scrollWidth > b.clientWidth + 0.5 || b.getBoundingClientRect().height > 61.5).map((b) => `${b.textContent.trim()}:${b.scrollWidth}/${b.clientWidth}h${b.getBoundingClientRect().height}`);
        const th = pg.querySelectorAll('p.timehead');
        const thRect = th[0]?.getBoundingClientRect() ?? null;
        const pgRect = pg.getBoundingClientRect();
        const csPg = getComputedStyle(pg);
        const nbCs = getComputedStyle(nb), nbAft = getComputedStyle(nb, '::after');
        const otherInactive = navBtns.find((b) => b !== nb && !b.classList.contains('on'));
        const otherCs = otherInactive ? getComputedStyle(otherInactive) : null;
        return {
          lbl,
          activePage: [...pg.classList].find((c) => c.startsWith('page-')),
          litBar: navBtns.find((b) => b.classList.contains('on'))?.textContent.trim() ?? null,
          docOverflow: de.scrollWidth !== window.innerWidth,
          pageOverflow: pg.scrollWidth !== pg.clientWidth,
          tabClips,
          dockH: getComputedStyle(de).getPropertyValue('--dock-h').trim(),
          scrollPadBottom: csPg.scrollPaddingBottom,
          dockRect: { left: Math.round(dr.left * 10) / 10, right: Math.round(dr.right * 10) / 10 },
          nowInert: nowPg.inert || nowPg.hasAttribute('inert'),
          nowHidden: nowPg.getAttribute('aria-hidden'),
          nowBtnOn: nb.classList.contains('on'),
          nowHasTabNow: nb.classList.contains('tab-now'),
          otherOn: navBtns.some((b) => b !== nb && b.classList.contains('on')),
          nowAftContent: nbAft.content,
          nowAftBg: nbAft.backgroundColor,
          nowBg: nbCs.backgroundColor,
          nowBgImg: nbCs.backgroundImage,
          nowColor: nbCs.color,
          otherInactiveColor: otherCs?.color ?? null,
          otherInactiveBgImg: otherCs?.backgroundImage ?? null,
          thCount: th.length,
          thText: th[0] ? th[0].textContent.replace(/\u2019/g, "'").trim() : null,
          thInBox: thRect ? (thRect.left >= pgRect.left - 0.5 && thRect.right <= pgRect.right + 0.5) : true,
          thBeforeTarget: lbl === 'Log'
            ? (th[0] && pg.querySelector('.daynav') ? !!(th[0].compareDocumentPosition(pg.querySelector('.daynav')) & Node.DOCUMENT_POSITION_FOLLOWING) : false)
            : lbl === 'Plan'
              ? (th[0] && pg.querySelector('h1.screen-title') ? !!(th[0].compareDocumentPosition(pg.querySelector('h1.screen-title')) & Node.DOCUMENT_POSITION_FOLLOWING) : false)
              : true,
        };
      }, label);
      offChecks.push(snap);
    }
    const wantPage = { Plan: 'page-plan', Now: 'page-now', Log: 'page-log', More: 'page-settings' };
    ok(`${tag} (e) each tab in Plan/Now/Log/More opens its own screen and lights only itself`,
      offChecks.every((s) => s.activePage === wantPage[s.lbl] && s.litBar === s.lbl),
      JSON.stringify(offChecks.map((s) => ({ l: s.lbl, pg: s.activePage, lit: s.litBar }))));
    const offNow = offChecks.filter((s) => s.lbl !== 'Now');
    ok(`${tag} (e) dock off Now: completely outside [0, ${W}) and page-now inert + aria-hidden on Plan/Log/More`,
      offNow.every((s) => (s.dockRect.right <= 0.5 || s.dockRect.left >= W - 0.5) && s.nowInert && s.nowHidden === 'true'),
      JSON.stringify(offNow.map((s) => ({ l: s.lbl, r: s.dockRect, inert: s.nowInert, hid: s.nowHidden }))));
    ok(`${tag} (e) --dock-h unchanged off Now (${dockNow.dockH}) and other pages scroll-padding-bottom independent (73px)`,
      offNow.every((s) => s.dockH === dockNow.dockH && s.scrollPadBottom === '73px'),
      JSON.stringify(offNow.map((s) => ({ l: s.lbl, h: s.dockH, spb: s.scrollPadBottom }))));
    const logSnap = offChecks.find((s) => s.lbl === 'Log');
    const planSnap = offChecks.find((s) => s.lbl === 'Plan');
    const moreSnap = offChecks.find((s) => s.lbl === 'More');
    const nowSnap = offChecks.find((s) => s.lbl === 'Now');
    // Re-aimed (2026-11-20 nowplain): inactive Now button matches other inactive tabs (no tab-now, no ::after plate, --muted text, no bg).
    ok(`${tag} (e) Now inactive on Log: no tab-now, no ::after plate, matches other inactive tabs (--muted, transparent bg)`,
      !logSnap.nowBtnOn && !logSnap.nowHasTabNow && logSnap.otherOn
      && logSnap.nowAftContent === 'none' && logSnap.nowAftBg === 'rgba(0, 0, 0, 0)'
      && logSnap.nowBg === 'rgba(0, 0, 0, 0)' && logSnap.nowBgImg === 'none'
      && logSnap.nowColor === wantMuted && logSnap.nowColor === logSnap.otherInactiveColor && logSnap.nowBgImg === logSnap.otherInactiveBgImg,
      JSON.stringify({ aftC: logSnap.nowAftContent, aftBg: logSnap.nowAftBg, bg: logSnap.nowBg, bgImg: logSnap.nowBgImg, col: logSnap.nowColor, wantMuted, otherCol: logSnap.otherInactiveColor }));
    ok(`${tag} (e) TimeHead travels with Log & Plan (placed & within content box) and absent on Now & More`,
      logSnap.thCount === 1 && logSnap.thText === "The past — what's already done" && logSnap.thBeforeTarget && logSnap.thInBox
      && planSnap.thCount === 1 && planSnap.thText === "The future — what's still ahead" && planSnap.thBeforeTarget && planSnap.thInBox
      && nowSnap.thCount === 0 && moreSnap.thCount === 0,
      JSON.stringify(offChecks.map((s) => ({ l: s.lbl, n: s.thCount, t: s.thText, before: s.thBeforeTarget, box: s.thInBox }))));
    ok(`${tag} (e) no horizontal overflow, no tab wrap/clip on any of the 4 panels`,
      offChecks.every((s) => !s.docOverflow && !s.pageOverflow && s.tabClips.length === 0),
      JSON.stringify(offChecks.map((s) => ({ l: s.lbl, doc: s.docOverflow, pg: s.pageOverflow, clips: s.tabClips }))));

    // Check TimeHead absence on a Plan sub-screen (Split Lab)
    await tapNav('Plan'); await settle();
    await page.evaluate(() => { const b = [...document.querySelectorAll('.page-plan button.plan-item')].find((x) => x.textContent.includes('Plan a sleeper split')); if (b) b.click(); });
    await page.waitForTimeout(150);
    const subTh = await page.evaluate(() => document.querySelectorAll('.page-plan p.timehead').length);
    ok(`${tag} (e) TimeHead absent on Plan sub-screen (Split Lab)`, subTh === 0, `count=${subTh}`);
    ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // 3. Return from DrivingView (R1): seeded Driving + drivingView: true, tap Details → lands on Now (scrollLeft === W) with dock visible
  {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.addInitScript((save) => {
      try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ }
      window.__vib = [];
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: function (p) { window.__vib.push(p); return true; } });
    }, JSON.stringify({ ...seedRecord('dial'), current: { status: 'D', since: nowMinute - 20, createdAt: 13 }, drivingView: true, tab: 'now' }));
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(ORIGIN + '/', { waitUntil: 'load' });
    await page.waitForSelector('main.drive');
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vib.length = 0; });
    await page.click('button.drive-details');
    await page.waitForSelector('main.pages');
    // Measure right on the next rAF (before any settle timer could run) to verify instant mount placement.
    const ret = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
      const m = document.querySelector('main.pages');
      const nowPg = document.querySelector('section.page-now');
      const dock = document.querySelector('.dock');
      const nav = document.querySelector('nav.tabs');
      const dr = dock?.getBoundingClientRect(), nr = nav?.getBoundingClientRect();
      r({
        sl: m?.scrollLeft,
        iw: window.innerWidth,
        nowActive: !!nowPg && nowPg.classList.contains('is-active'),
        nowLeft: nowPg ? Math.round(nowPg.getBoundingClientRect().left * 10) / 10 : null,
        dockOnScreen: !!dr && !!nr && dr.left === 0 && dr.right === window.innerWidth && Math.abs(dr.bottom - nr.top) <= 1,
        bar: document.querySelector('nav.tabs button.on')?.textContent.trim(),
      });
    })));
    ok(`[${W}x${H} nav] (e) driving-view return via Details (R1): lands immediately on Now (scrollLeft === ${W}) with dock`,
      ret.sl === W && ret.nowActive && Math.abs(ret.nowLeft) <= 1 && ret.dockOnScreen && ret.bar === 'Now',
      JSON.stringify(ret));
    ok(`[${W}x${H} nav] (e) driving-view return no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
}

// (f) logpin (2026-11-20, Lorico): pinned Log top block (daynav + graph card), scrolling list
// strictly between pinned graph and pinned bottom addbtn, day navigation updating both, Now-only
// header disclaimer with no gap on other screens, and Report a bug removed from Log (kept on More).
const longLogSeed = () => {
  // Build 12 segments inside Today's carrier day + 2 segments on Yesterday so Log overflows heavily
  // and Previous day is enabled at both 412x915 and 360x640.
  // "Now" is anchored to 20:00 on the displayed carrier day via nowOverride so the fixture is
  // identical at any wall-clock time: anchored to the real now, the 12 segments straddle
  // midnight in the small hours and the displayed day comes up nearly empty (Ada rerun
  // 2026-11-21 ~00:01 CT measured entryCount 1).
  const d = new Date(nowMinute * 60000);
  const startOfToday = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime() / 60000);
  const fakeNow = startOfToday + 1200;
  const segs = [
    { status: 'OFF', start: startOfToday - 900, end: startOfToday - 360, createdAt: 1 },
    { status: 'D', start: startOfToday - 360, end: startOfToday - 60, createdAt: 2 },
  ];
  const statuses = ['OFF', 'ON', 'D', 'OFF', 'D', 'ON', 'SB', 'OFF', 'D', 'ON', 'OFF', 'D'];
  const span = Math.max(120, fakeNow - startOfToday - 20);
  const step = Math.max(10, Math.floor(span / statuses.length));
  let cur = Math.min(startOfToday, fakeNow - step * statuses.length - 20);
  for (let i = 0; i < statuses.length; i++) {
    segs.push({ status: statuses[i], start: cur, end: cur + step, createdAt: 10 + i });
    cur += step;
  }
  return {
    segments: segs,
    current: { status: 'ON', since: cur, createdAt: 99 },
    nowOverride: fakeNow,
    historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard: 'dial', nowCardAsked: true,
  };
};
for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((save) => { try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ } }, JSON.stringify(longLogSeed()));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('main.pages');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  const tag = `[${W}x${H} logpin]`;
  const tapNav = (label) => page.evaluate((l) => { const b = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.trim() === l); if (!b) throw new Error('no tab ' + l); b.click(); }, label);
  const settle = async () => { await page.waitForTimeout(250); await page.waitForFunction(() => { const m = document.querySelector('main.pages'), p = document.querySelector('.page.is-active'); return !m || !p || Math.abs(m.scrollLeft - p.offsetLeft) <= 1; }, null, { timeout: 2500 }).catch(() => {}); };

  // Header disclaimer Now-only + no gap on Log, Plan, Split, More
  const hdrCheck = async (label) => {
    if (label !== 'Now') { await tapNav(label); await settle(); }
    return page.evaluate((lbl) => {
      const hdr = document.querySelector('header.top');
      const pg = document.querySelector('.page.is-active');
      const disc = hdr.querySelector('details.disclaimer-line');
      const hr = hdr.getBoundingClientRect(), pr = pg.getBoundingClientRect();
      return {
        lbl,
        hasDisc: !!disc,
        discText: disc?.querySelector('.disclaimer-text')?.textContent?.trim() ?? null,
        discMore: disc?.querySelector('.disclaimer-more')?.textContent?.trim() ?? null,
        hdrH: Math.round(hr.height * 10) / 10,
        hdrBottom: Math.round(hr.bottom * 10) / 10,
        pgTop: Math.round(pr.top * 10) / 10,
        over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    }, label);
  };
  const hNow = await hdrCheck('Now');
  const hPlan = await hdrCheck('Plan');
  const hMore = await hdrCheck('More');
  const hLog = await hdrCheck('Log');
  ok(`${tag} (f) header disclaimer ("Planning only" + Details) present on Now and absent on Plan/More/Log`,
    hNow.hasDisc && hNow.discText === 'Planning only — not a log, not an ELD' && hNow.discMore === 'Details'
    && !hPlan.hasDisc && !hMore.hasDisc && !hLog.hasDisc,
    JSON.stringify({ now: hNow, plan: hPlan, more: hMore, log: hLog }));
  ok(`${tag} (f) no leftover gap or overlap when header disclaimer is absent on Plan/More/Log`,
    [hPlan, hMore, hLog].every((x) => Math.abs(x.pgTop - x.hdrBottom) <= 1 && !x.over),
    JSON.stringify([hPlan, hMore, hLog].map((x) => ({ l: x.lbl, hdrB: x.hdrBottom, pgT: x.pgTop, over: x.over }))));

  // BugButton absent on Log, present on More
  const bugCheck = await page.evaluate(() => {
    const logPg = document.querySelector('section.page-log');
    const morePg = document.querySelector('section.page-settings');
    return {
      logBug: /Report a bug \(GitHub\)/.test(logPg.textContent),
      moreBug: /Bug reports/.test(morePg.textContent) && /Report a bug \(GitHub\)/.test(morePg.textContent),
    };
  });
  ok(`${tag} (f) Log screen has no "Report a bug (GitHub)" button; More screen keeps it`, !bugCheck.logBug && bugCheck.moreBug, JSON.stringify(bugCheck));

  // Pinned graph + daynav, scrolling middle list, pinned bottom addbtn
  const geom = await page.evaluate(async () => {
    const two = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    const pg = document.querySelector('section.page-log');
    const pin = pg.querySelector('.log-pin');
    const daynav = pin.querySelector('.daynav');
    const graphCard = pin.querySelector('.log-graph-card');
    const svg = graphCard.querySelector('svg.grid');
    const totals = graphCard.querySelector('.daytotals');
    const scroll = pg.querySelector('.log-scroll');
    const foot = pg.querySelector('.log-foot');
    const addBtn = foot.querySelector('button.addbtn');
    const nav = document.querySelector('nav.tabs');
    const hdr = document.querySelector('header.top');
    const entries = [...scroll.querySelectorAll('button.entry')];
    const firstEntry = entries[0];
    const lastEntry = entries[entries.length - 1];

    scroll.scrollTop = 0; await two();
    const before = {
      pin: R(pin), daynav: R(daynav), graphCard: R(graphCard), svg: R(svg), totals: R(totals),
      scroll: R(scroll), foot: R(foot), addBtn: R(addBtn), nav: R(nav), hdr: R(hdr),
      firstEntry: R(firstEntry),
      labelsInsideSvg: [...svg.querySelectorAll('.grid-label, .grid-hour')].every((t) => {
        const sr = svg.getBoundingClientRect(), tr = t.getBoundingClientRect();
        return tr.left >= sr.left - 1 && tr.right <= sr.right + 1 && tr.top >= sr.top - 1 && tr.bottom <= sr.bottom + 1;
      }),
      scrollH: scroll.scrollHeight, clientH: scroll.clientHeight,
      pgOverflowY: getComputedStyle(pg).overflowY,
      scrollOverflowY: getComputedStyle(scroll).overflowY,
      scrollOverscroll: `${getComputedStyle(scroll).overscrollBehaviorX}/${getComputedStyle(scroll).overscrollBehaviorY}`,
    };

    // Scroll list to the very bottom
    pg.scrollTop = 100000;
    scroll.scrollTop = 100000;
    await two();
    const lastCard = scroll.lastElementChild;
    const after = {
      pgScrollTop: pg.scrollTop,
      scrollTop: scroll.scrollTop,
      pin: R(pin), daynav: R(daynav), graphCard: R(graphCard), svg: R(svg), totals: R(totals),
      foot: R(foot), addBtn: R(addBtn),
      lastEntry: R(lastEntry),
      lastCard: R(lastCard),
    };

    // Bring last entry into view if violations card pushed it above viewport, verify it can sit fully above addbtn
    lastEntry.scrollIntoView({ block: 'end' }); await two();
    const lastEntryIntoView = R(lastEntry);
    const ab = addBtn.getBoundingClientRect();
    const addHit = document.elementFromPoint(Math.round(ab.left + ab.width / 2), Math.round(ab.top + ab.height / 2));
    const addTappable = !!addHit && (addHit === addBtn || addBtn.contains(addHit));
    return { vw: document.documentElement.clientWidth, vh: window.innerHeight, entryCount: entries.length, before, after, lastEntryIntoView, addTappable };
  });

  const eq = (a, b) => a && b && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
  ok(`${tag} (f) long log list overflows .log-scroll (${geom.entryCount} entries) while .page-log does not scroll`,
    geom.entryCount >= 10 && geom.before.scrollH > geom.before.clientH && geom.after.scrollTop > 0
    && geom.before.pgOverflowY === 'hidden' && geom.after.pgScrollTop === 0 && geom.before.scrollOverflowY === 'auto'
    && geom.before.scrollOverscroll === 'auto/none',
    JSON.stringify({ entries: geom.entryCount, scrollH: geom.before.scrollH, clientH: geom.before.clientH, scrollTop: geom.after.scrollTop, pgTop: geom.after.pgScrollTop, pgOv: geom.before.pgOverflowY, scOv: geom.before.scrollOverflowY, ob: geom.before.scrollOverscroll }));
  ok(`${tag} (f) pinned daynav + graph card bounding box is unchanged when list scrolls to bottom`,
    eq(geom.before.pin, geom.after.pin) && eq(geom.before.daynav, geom.after.daynav)
    && eq(geom.before.graphCard, geom.after.graphCard) && eq(geom.before.svg, geom.after.svg) && eq(geom.before.totals, geom.after.totals),
    JSON.stringify({ pinB: geom.before.pin, pinA: geom.after.pin, svgB: geom.before.svg, svgA: geom.after.svg }));
  ok(`${tag} (f) pinned graph stays fully inside viewport with unclipped axis labels and clean boundary above scroll list`,
    geom.before.pin.top >= geom.before.hdr.bottom - 0.5 && geom.before.pin.bottom <= geom.before.scroll.top + 0.5
    && geom.before.svg.left >= 0 && geom.before.svg.right <= geom.vw && geom.before.svg.h >= 60 && geom.before.labelsInsideSvg
    && geom.before.firstEntry.top >= geom.before.pin.bottom - 0.5,
    JSON.stringify({ hdrB: geom.before.hdr.bottom, pin: geom.before.pin, scrollT: geom.before.scroll.top, svg: geom.before.svg, labels: geom.before.labelsInsideSvg, firstEntry: geom.before.firstEntry }));
  ok(`${tag} (f) pinned bottom addbtn sits directly above tab bar, never moves on scroll, and is fully tappable`,
    eq(geom.before.foot, geom.after.foot) && eq(geom.before.addBtn, geom.after.addBtn)
    && Math.abs(geom.before.foot.bottom - geom.before.nav.top) <= 1
    && geom.before.scroll.bottom <= geom.before.foot.top + 0.5
    && geom.after.addBtn.bottom <= geom.before.nav.top + 0.5 && geom.after.addBtn.top >= geom.before.foot.top - 0.5
    && geom.addTappable,
    JSON.stringify({ foot: geom.after.foot, addBtn: geom.after.addBtn, navT: geom.before.nav.top, scrollB: geom.before.scroll.bottom, tap: geom.addTappable }));
  ok(`${tag} (f) last log entry and end of list scroll fully into view cleanly above pinned addbtn`,
    geom.after.lastCard.bottom <= geom.after.foot.top + 0.5
    && geom.lastEntryIntoView.bottom <= geom.after.foot.top + 0.5 && geom.lastEntryIntoView.top >= geom.before.pin.bottom - 0.5,
    JSON.stringify({ lastCard: geom.after.lastCard, lastEntry: geom.lastEntryIntoView, footT: geom.after.foot.top, pinB: geom.before.pin.bottom }));

  // Day navigation updates BOTH pinned graph/daynav AND list together
  const dayBefore = await page.evaluate(() => ({
    title: document.querySelector('.page-log .daynav-title')?.textContent?.trim(),
    totals: document.querySelector('.page-log .daytotals')?.textContent?.trim(),
    entriesTitle: [...document.querySelectorAll('.page-log .log-scroll h2')].find((h) => /Entries on this day/.test(h.textContent))?.textContent?.trim(),
  }));
  await page.click('.page-log button[aria-label="Previous day"]');
  await page.waitForTimeout(150);
  const dayPrev = await page.evaluate(() => ({
    title: document.querySelector('.page-log .daynav-title')?.textContent?.trim(),
    totals: document.querySelector('.page-log .daytotals')?.textContent?.trim(),
    entriesTitle: [...document.querySelectorAll('.page-log .log-scroll h2')].find((h) => /Entries on this day/.test(h.textContent))?.textContent?.trim(),
  }));
  await page.click('.page-log button[aria-label="Next day"]');
  await page.waitForTimeout(150);
  const dayBack = await page.evaluate(() => ({
    title: document.querySelector('.page-log .daynav-title')?.textContent?.trim(),
    entriesTitle: [...document.querySelectorAll('.page-log .log-scroll h2')].find((h) => /Entries on this day/.test(h.textContent))?.textContent?.trim(),
  }));
  ok(`${tag} (f) Previous/Next day updates both pinned daynav+totals and scrolled list together`,
    dayPrev.title !== dayBefore.title && dayPrev.entriesTitle !== dayBefore.entriesTitle
    && dayBack.title === dayBefore.title && dayBack.entriesTitle === dayBefore.entriesTitle,
    JSON.stringify({ dayBefore, dayPrev, dayBack }));

  // Clicking pinned addbtn opens the add sheet
  await page.click('.page-log .log-foot button.addbtn');
  await page.waitForTimeout(200);
  const addSheet = await page.evaluate(() => ({
    open: !!document.querySelector('.sheet'),
    text: document.querySelector('.sheet')?.textContent?.slice(0, 120) ?? '',
  }));
  ok(`${tag} (f) clicking pinned addbtn opens the add sheet`, addSheet.open && /Step 1 of 4/.test(addSheet.text), JSON.stringify(addSheet));
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// (g) log summary PDF follow-on (2026-11-20, Lorico): More → Data Days field (default 14) +
// "Log summary (PDF)" button, validation (0 / blank / 500), 8-day & 14-day print-media output
// with Grid graphs, engine-matching totals, no-duty day handling, header+footer disclaimers,
// and unchanged normal on-screen UI.
const pdfSeed = () => {
  const d = new Date(nowMinute * 60000);
  const d0 = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).getTime() / 60000);
  const d1 = d0 - 1440;
  const d2 = d1 - 1440; // empty no-duty day
  const d3 = d2 - 1440;
  return {
    segments: [
      { status: 'OFF', start: d3, end: d3 + 480, createdAt: 1 },
      { status: 'D', start: d3 + 480, end: d3 + 720, createdAt: 2 },
      { status: 'SB', start: d1, end: d1 + 600, createdAt: 3 },
      { status: 'ON', start: d1 + 600, end: d1 + 660, createdAt: 4 },
      { status: 'D', start: d1 + 660, end: d1 + 960, createdAt: 5 },
      { status: 'OFF', start: d0, end: d0 + 60, createdAt: 6 },
      { status: 'D', start: d0 + 60, end: d0 + 180, createdAt: 7 },
    ],
    current: { status: 'ON', since: d0 + 180, createdAt: 8 },
    nowOverride: d0 + 300, // 05:00 local -> Today: D 2h, ON 2h, OFF 1h, SB 0m
    historyAcknowledged: true, disclaimerAcked: true, tzChosen: true, themeChosen: true, theme: 'day', nowCard: 'dial', nowCardAsked: true,
    config: { cycle: '70/8', dayStartHour: 0, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago', shortHaul: false },
  };
};
for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((save) => {
    try { localStorage.setItem('hos-sandbox-v1', save); } catch { /* ignore */ }
    window.__printCalls = 0;
    window.print = () => { window.__printCalls++; };
  }, JSON.stringify(pdfSeed()));
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('main.pages');
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  const tag = `[${W}x${H} pdf]`;
  await page.evaluate(() => { const b = [...document.querySelectorAll('nav.tabs button')].find((x) => x.textContent.trim() === 'More'); b.click(); });
  await page.waitForTimeout(300);

  const init = await page.evaluate(() => {
    const more = document.querySelector('section.page-settings');
    const dataCard = [...more.querySelectorAll('section.card')].find((c) => c.querySelector('h2')?.textContent?.trim() === 'Data');
    const daysInp = dataCard?.querySelector('label.pdf-days input');
    const pdfBtn = dataCard?.querySelector('button.pdf-btn');
    return {
      hasExport: /Export JSON/.test(dataCard?.textContent ?? ''),
      daysVal: daysInp?.value ?? null,
      daysH: daysInp ? Math.round(daysInp.getBoundingClientRect().height) : 0,
      btnText: pdfBtn?.textContent?.trim() ?? null,
      btnH: pdfBtn ? Math.round(pdfBtn.getBoundingClientRect().height) : 0,
      hasReport: !!document.querySelector('.print-report'),
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  ok(`${tag} (g) More Data card has Days (default 14, >=56px) and "Log summary (PDF)" with zero overflow and no report initially`,
    init.hasExport && init.daysVal === '14' && init.daysH >= 56 && init.btnText === 'Log summary (PDF)' && init.btnH >= 56 && !init.hasReport && !init.over,
    JSON.stringify(init));

  // Invalid inputs: 0, blank, 500 -> visible feedback, no report, no window.print()
  const badResults = [];
  for (const val of ['0', '', '500']) {
    await page.fill('section.page-settings label.pdf-days input', val);
    await page.click('section.page-settings button.pdf-btn');
    await page.waitForTimeout(80);
    const st = await page.evaluate((v) => {
      const alert = document.querySelector('section.page-settings [role="alert"]');
      return { v, alert: alert?.textContent?.trim() ?? null, hasRep: !!document.querySelector('.print-report'), prints: window.__printCalls };
    }, val);
    badResults.push(st);
  }
  ok(`${tag} (g) invalid inputs (0, blank, 500) produce visible feedback, no report, and zero print calls`,
    badResults.every((r) => !!r.alert && !r.hasRep && r.prints === 0),
    JSON.stringify(badResults));

  // Valid 8 days: triggers window.print, stays display:none on screen, shows cleanly under @media print
  await page.fill('section.page-settings label.pdf-days input', '8');
  await page.click('section.page-settings button.pdf-btn');
  await page.waitForTimeout(150);
  const screenAfter8 = await page.evaluate(() => {
    const rep = document.querySelector('.print-report');
    return {
      prints: window.__printCalls,
      repDisplay: rep ? getComputedStyle(rep).display : null,
      headerDisplay: getComputedStyle(document.querySelector('header.top')).display,
      navDisplay: getComputedStyle(document.querySelector('nav.tabs')).display,
      over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  ok(`${tag} (g) after 8-day trigger, window.print fired and on-screen UI stays unchanged (.print-report display:none)`,
    screenAfter8.prints === 1 && screenAfter8.repDisplay === 'none' && screenAfter8.headerDisplay !== 'none' && screenAfter8.navDisplay !== 'none' && !screenAfter8.over,
    JSON.stringify(screenAfter8));

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(80);
  const print8 = await page.evaluate(() => {
    const DISC = 'Planning only — not a log, not an ELD. This printout is not an official record of duty status.';
    const rep = document.querySelector('.print-report');
    const secs = [...rep.querySelectorAll('section.pr-day')];
    const head = rep.querySelector('header.pr-head');
    const foot = rep.querySelector('footer.pr-foot');
    const cellsOf = (sec) => [...sec.querySelectorAll('.daytotals > div')].map((d) => d.textContent.trim());
    return {
      repDisplay: getComputedStyle(rep).display,
      appHeaderDisplay: getComputedStyle(document.querySelector('header.top')).display,
      appNavDisplay: getComputedStyle(document.querySelector('nav.tabs')).display,
      appMainDisplay: getComputedStyle(document.querySelector('main.pages')).display,
      secCount: secs.length,
      svgCount: secs.filter((s) => { const g = s.querySelector('svg.grid'); return g && g.getBoundingClientRect().height > 30; }).length,
      newestFirst: secs.every((s, i) => i === 0 || Number(s.dataset.dayStart) < Number(secs[i - 1].dataset.dayStart)),
      day0Totals: cellsOf(secs[0]),
      day1Totals: cellsOf(secs[1]),
      day2NoDuty: /no-duty day/i.test(secs[2].textContent) && secs[2].querySelectorAll('li.pr-entry').length === 0,
      day3Totals: cellsOf(secs[3]),
      headOk: head.textContent.includes('Split Decision') && head.textContent.includes('8 days') && head.textContent.includes('Generated') && head.textContent.includes(DISC),
      footOk: foot.textContent.includes(DISC),
    };
  });
  ok(`${tag} (g) @media print hides app chrome and shows 8-day report (newest-first) with visible Grids, exact engine totals, no-duty day, and header+footer disclaimers`,
    print8.repDisplay === 'block' && print8.appHeaderDisplay === 'none' && print8.appNavDisplay === 'none' && print8.appMainDisplay === 'none'
    && print8.secCount === 8 && print8.svgCount === 8 && print8.newestFirst
    && JSON.stringify(print8.day0Totals) === JSON.stringify(['Driving2h 00m', 'On Duty2h 00m', 'Off Duty1h 00m', 'Sleeper0m'])
    && JSON.stringify(print8.day1Totals) === JSON.stringify(['Driving5h 00m', 'On Duty1h 00m', 'Off Duty0m', 'Sleeper10h 00m'])
    && print8.day2NoDuty
    && JSON.stringify(print8.day3Totals) === JSON.stringify(['Driving4h 00m', 'On Duty0m', 'Off Duty8h 00m', 'Sleeper0m'])
    && print8.headOk && print8.footOk,
    JSON.stringify(print8));

  // Switch back to screen, request 14 days
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(80);
  await page.fill('section.page-settings label.pdf-days input', '14');
  await page.click('section.page-settings button.pdf-btn');
  await page.waitForTimeout(150);
  const count14 = await page.evaluate(() => ({
    prints: window.__printCalls,
    secCount: document.querySelectorAll('.print-report section.pr-day').length,
    repDisplay: getComputedStyle(document.querySelector('.print-report')).display,
  }));
  ok(`${tag} (g) entering 14 triggers window.print again with 14 day sections while screen remains untouched`,
    count14.prints === 2 && count14.secCount === 14 && count14.repDisplay === 'none',
    JSON.stringify(count14));
  ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
if (arg('--json')) writeFileSync(arg('--json'), JSON.stringify(report, null, 1));
console.log(fails ? 'LAYOUT FAIL' : 'LAYOUT OK');
process.exit(fails ? 1 : 0);
