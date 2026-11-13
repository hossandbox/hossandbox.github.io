// Reimagine pass (2026-11-12) — the real-browser lane for the "road signs by day, dash lights
// by night" redesign. Pins: a state sign opens every answer card (kind + word per state, both
// themes, 412 + 360, legend contrast, no collision with the Timeline|Dial switch); the status
// dock (icon keys ≥ 76px, one lit key with a check badge); the tab bar's 60px slot; the
// four-clock gauge cluster under the answer; the paper-log graph (stair-steps + hour ruler);
// More's folded explanations (safety line never folded); the driving view's sign and its
// 104px+ key; the sign tokens' ink contrast. usage: node test/dom/reimagine.mjs [--root dist]
// A missing browser is a FAILURE (exit 2), never a silent pass.
import { createServer } from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, normalize, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = resolve(arg('--root', 'dist')) + '/';
const PW = process.env.HOS_PLAYWRIGHT || '/home/hatch/workspace/hos-patch/p18-scratch/';
const CHROME = process.env.HOS_BROWSER || '/home/hatch/workspace/hos-patch/p18-scratch/chrome-headless-shell-linux64/chrome-headless-shell';
let chromium;
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`REIMAGINE BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`REIMAGINE BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`REIMAGINE BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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

const N = Math.floor(Date.now() / 60000);
const save = (theme, cur, over = {}) => JSON.stringify({
  segments: [{ status: 'OFF', start: N - 1500, end: N - 480, createdAt: 1 }, { status: 'D', start: N - 480, end: N - 120, createdAt: 2 }, { status: 'ON', start: N - 120, end: N - 30, createdAt: 3 }],
  current: { status: cur, since: N - 30, createdAt: 4 }, drivingView: false, historyAcknowledged: true, disclaimerAcked: true, tzChosen: true,
  themeChosen: true, theme, nowCard: 'timeline', nowCardAsked: true, tab: 'now', config: { timeZone: 'America/Chicago' }, ...over,
});


const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info: typeof info === 'string' ? info : JSON.stringify(info) }); };
// computed colours arrive as rgb()/rgba() or, out of color-mix(), as color(srgb r g b) with 0–1 channels
const chan = (c) => { const s = String(c); const m = s.match(/-?[\d.]+(e-?\d+)?/g); if (!m) return null; const k = s.startsWith('color(') ? 255 : 1; return m.slice(0, 3).map((v) => Number(v) * k); };
const lum = (c) => { const p = chan(c); if (!p) return NaN; const [r, g, b] = p.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (saved, width = 412) => {
  const ctx = await browser.newContext({ viewport: { width, height: width === 360 ? 640 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('rmseeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('rmseeded', '1'); } } catch { /* ignore */ } }, saved);
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForSelector('#root *');
  const ack = page.getByRole('button', { name: /^(I understand|Got it|OK|Continue)/ });
  if (await ack.count()) { await ack.first().click(); await page.waitForTimeout(200); }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(350);
  return { ctx, page, errors };
};
const tab = async (page, t) => { await page.locator('nav.tabs button', { hasText: new RegExp(t + '$') }).first().click(); await page.waitForTimeout(300); };

// ---- seeds: one per state the sign has to name
const OFF0 = { status: 'OFF', start: N - 1500, end: N - 640, createdAt: 1 };
const lowSegs = [OFF0, { status: 'D', start: N - 640, end: N - 340, createdAt: 2 }, { status: 'OFF', start: N - 340, end: N - 310, createdAt: 3 }, { status: 'D', start: N - 310, end: N - 5, createdAt: 4 }];
const STATES = [
  { name: 'hours left / timeline', cur: 'ON', over: {}, kind: 'go', word: 'Hours left' },
  { name: 'hours left / dial', cur: 'ON', over: { nowCard: 'dial' }, kind: 'go', word: 'Hours left' },
  { name: 'under an hour / timeline', cur: 'ON', over: { segments: lowSegs, current: { status: 'ON', since: N - 5, createdAt: 5 } }, kind: 'warn', word: 'Under 1 hour' },
  { name: 'under an hour / dial', cur: 'ON', over: { nowCard: 'dial', segments: lowSegs, current: { status: 'ON', since: N - 5, createdAt: 5 } }, kind: 'warn', word: 'Under 1 hour' },
  { name: 'resting', cur: 'OFF', over: { segments: [{ status: 'OFF', start: N - 1500, end: N - 700, createdAt: 1 }, { status: 'D', start: N - 700, end: N - 40, createdAt: 2 }], current: { status: 'OFF', since: N - 40, createdAt: 4 } }, kind: 'rest', word: 'Resting' },
  { name: 'out of hours, on duty', cur: 'ON', over: { segments: [{ status: 'OFF', start: N - 1500, end: N - 700, createdAt: 1 }, { status: 'D', start: N - 700, end: N - 40, createdAt: 2 }], current: { status: 'ON', since: N - 40, createdAt: 4 } }, kind: 'stop', word: 'Out of hours' },
  { name: 'break due, still driving (Details peek)', cur: 'D', over: { segments: [{ status: 'OFF', start: N - 1500, end: N - 485, createdAt: 1 }], current: { status: 'D', since: N - 485, createdAt: 4 } }, kind: 'stop', word: 'Out of hours' },
  { name: 'break due, on duty', cur: 'ON', over: { segments: [{ status: 'OFF', start: N - 1500, end: N - 490, createdAt: 1 }, { status: 'D', start: N - 490, end: N - 5, createdAt: 2 }], current: { status: 'ON', since: N - 5, createdAt: 4 } }, kind: 'warn', word: 'Break due' },
];

for (const theme of ['day', 'night']) for (const width of [412, 360]) {
  const T = `${theme}/${width}`;
  for (const st of STATES) {
    const { ctx, page, errors } = await open(save(theme, st.cur, st.over), width);
    const m = await page.evaluate(() => {
      const hero = document.querySelector('main section.hero'); if (!hero) return null;
      const sign = hero.querySelector(':scope > .sign'); if (!sign) return { noSign: true };
      const r = sign.getBoundingClientRect(), h = hero.getBoundingClientRect(); const sw = hero.querySelector('.card-switch .toggle')?.getBoundingClientRect();
      const cs = getComputedStyle(sign); const face = getComputedStyle(sign.querySelector('.sign-face')), mark = getComputedStyle(sign.querySelector('.sign-mark'));
      return { first: hero.firstElementChild === sign, cls: sign.className, word: sign.querySelector('.sign-word').textContent, r: { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }, hero: { l: h.left, r: h.right }, sw: sw ? { l: sw.left, t: sw.top, b: sw.bottom } : null,
        color: cs.color, bg: cs.backgroundColor, face: face.fill, mark: mark.stroke, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.app').scrollWidth > window.innerWidth + 1 };
    });
    const n = `${T} ${st.name}`;
    if (!m || m.noSign) { ok(`${n}: the answer card opens with a state sign`, false, m); await ctx.close(); continue; }
    ok(`${n}: the sign is the first thing in the answer card`, m.first);
    ok(`${n}: sign kind = ${st.kind}, word = "${st.word}"`, m.cls === `sign sign-${st.kind}` && m.word === st.word, { cls: m.cls, word: m.word });
    ok(`${n}: sign is at least 40px tall and inside the card`, m.r.h >= 40 && m.r.l >= m.hero.l && m.r.r <= m.hero.r, m.r);
    ok(`${n}: sign does not run under the Timeline|Dial switch`, !m.sw || m.r.r <= m.sw.l - 4 || m.r.b <= m.sw.t || m.r.t >= m.sw.b, { sign: m.r, sw: m.sw });
    ok(`${n}: sign legend ≥ 4.5:1 on its plate`, ratio(m.color, m.bg) >= 4.5, `${ratio(m.color, m.bg).toFixed(2)} ${m.color} on ${m.bg}`);
    ok(`${n}: the shape glyph reads on the plate (face ≥ 3:1 vs plate, mark ≥ 3:1 vs face)`, ratio(m.face, m.bg) >= 3 && ratio(m.mark, m.face) >= 3, `face ${ratio(m.face, m.bg).toFixed(2)}, mark ${ratio(m.mark, m.face).toFixed(2)}`);
    ok(`${n}: no sideways overflow, no page errors`, !m.overflow && errors.length === 0, errors.join('|'));
    await ctx.close();
  }

  // ---- the dock, the tab bar, the gauge cluster, the log graph (dial card so the cluster shows)
  {
    const { ctx, page, errors } = await open(save(theme, 'ON', { nowCard: 'dial' }), width);
    const d = await page.evaluate(() => {
      const keys = [...document.querySelectorAll('.dock .status-buttons button')].map((b) => { const r = b.getBoundingClientRect(); const cs = getComputedStyle(b); return { w: r.width, h: r.height, ico: !!b.querySelector('.dock-ico svg'), pressed: b.getAttribute('aria-pressed'), check: !!b.querySelector(':scope > svg'), color: cs.color, border: cs.borderTopColor, text: b.textContent }; });
      const dock = document.querySelector('.dock').getBoundingClientRect(), nav = document.querySelector('nav.tabs').getBoundingClientRect();
      const probe = document.createElement('span'); probe.style.color = 'var(--chip-ink)'; document.body.appendChild(probe); const ink = getComputedStyle(probe).color; probe.remove();
      const meters = [...document.querySelectorAll('.meters .meter')].map((e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), h: r.height, on: e.classList.contains('on'), vw: e.querySelector('.meter-value').scrollWidth, cw: e.clientWidth }; });
      const hero = document.querySelector('main section.hero').getBoundingClientRect(), load = document.querySelector('main button.plan-item').getBoundingClientRect(), mt = document.querySelector('.meters').getBoundingClientRect();
      const grid = document.querySelector('main svg.grid');
      return { keys, dockBottom: dock.bottom, navTop: nav.top, navH: nav.height, ink, meters, order: { heroB: hero.bottom, mT: mt.top, mB: mt.bottom, loadT: load.top }, steps: grid.querySelectorAll('.grid-step').length, hours: [...grid.querySelectorAll('.grid-hour')].map((e) => e.textContent) };
    });
    ok(`${T} dock: four status keys, each ≥ 76px tall and ≥ 72px wide, each with its icon`, d.keys.length === 4 && d.keys.every((k) => k.h >= 76 && k.w >= 72 && k.ico), d.keys);
    const on = d.keys.filter((k) => k.pressed === 'true');
    ok(`${T} dock: exactly one key is lit — pressed, with a check badge (not colour alone), ink on its face`, on.length === 1 && on[0].check && /On Duty/.test(on[0].text) && on[0].color === d.ink && d.keys.filter((k) => k.check).length === 1, { on, ink: d.ink });
    ok(`${T} tab bar keeps its 60px slot and the dock sits on it without overlap`, Math.abs(d.navH - 61) <= 1.5 && d.dockBottom <= d.navTop + 0.5, { navH: d.navH, dockBottom: d.dockBottom, navTop: d.navTop });
    ok(`${T} clocks: a 2-column cluster, exactly one clock marked as setting the stop, no figure clipped`, d.meters.length >= 3 && new Set(d.meters.map((m) => m.l)).size === 2 && d.meters.filter((m) => m.on).length === 1 && d.meters.every((m) => m.vw <= m.cw && m.h >= 88), d.meters);
    ok(`${T} clocks sit directly under the answer card, above the load question`, d.order.mT >= d.order.heroB && d.order.mB <= d.order.loadT, d.order);
    ok(`${T} log graph: status changes are joined by stair-steps and the ruler carries hour labels`, d.steps >= 2 && d.hours.length >= 3, { steps: d.steps, hours: d.hours });
    await tab(page, 'Log');
    const lg = await page.evaluate(() => [...document.querySelectorAll('main svg.grid .grid-hour')].map((e) => e.textContent));
    ok(`${T} Log day graph: the ruler reads like the paper log (M … N …)`, lg[0] === 'M' && lg.includes('N') && lg.includes('6') && lg.includes('18'), lg);
    // ---- More: the explanations fold, the safety line does not
    await tab(page, 'More');
    const mo = await page.evaluate(() => {
      const ds = [...document.querySelectorAll('main details.help')];
      const safety = [...document.querySelectorAll('main p')].find((p) => /Your ELD is your official warning/.test(p.textContent));
      return { n: ds.length, open: ds.filter((x) => x.open).length, sumH: ds.map((x) => x.querySelector('summary').getBoundingClientRect().height), safetyShown: !!safety && !safety.closest('details') && safety.getBoundingClientRect().height > 0 };
    });
    ok(`${T} More: at least 5 explanations are folded (closed) behind ≥48px rows`, mo.n >= 5 && mo.open === 0 && mo.sumH.every((h) => h >= 48), mo);
    ok(`${T} More: the alert safety line ("Your ELD is your official warning") is never folded`, mo.safetyShown, mo);
    await page.locator('main details.help summary').first().click(); await page.waitForTimeout(200);
    const opened = await page.evaluate(() => { const d = document.querySelector('main details.help'); return d.open && d.querySelector('p').getBoundingClientRect().height > 0; });
    ok(`${T} More: a tap unfolds the explanation`, opened);
    ok(`${T} dock/log/More: no page errors`, errors.length === 0, errors.join('|'));
    await ctx.close();
  }

  // ---- the driving view wears the same sign; its one key is the biggest on any screen
  for (const [label, segs, since, kind, word] of [
    ['calm', [{ status: 'OFF', start: N - 1500, end: N - 480, createdAt: 1 }], N - 30, 'go', 'Hours left'],
    ['under an hour', [OFF0, { status: 'D', start: N - 640, end: N - 340, createdAt: 2 }, { status: 'OFF', start: N - 340, end: N - 310, createdAt: 3 }], N - 310, 'warn', 'Under 1 hour'],
    ['out of time', [{ status: 'OFF', start: N - 1500, end: N - 700, createdAt: 1 }, { status: 'D', start: N - 700, end: N - 400, createdAt: 2 }, { status: 'OFF', start: N - 400, end: N - 370, createdAt: 3 }], N - 370, 'stop', 'Out of hours'],
  ]) {
    const { ctx, page, errors } = await open(save(theme, 'D', { drivingView: true, segments: segs, current: { status: 'D', since, createdAt: 9 } }), width);
    const v = await page.evaluate(() => { const s = document.querySelector('main.drive .drive-body > .sign'); const k = document.querySelector('button.drive-stop'); if (!s || !k) return null; const cs = getComputedStyle(s); const sr = s.getBoundingClientRect(); return { cls: s.className, word: s.textContent, color: cs.color, bg: cs.backgroundColor, keyH: k.getBoundingClientRect().height, inside: sr.left >= 0 && sr.right <= window.innerWidth }; });
    ok(`${T} driving view (${label}): sign-${kind} "${word}", legend ≥ 4.5:1, inside the screen`, v && v.cls === `sign sign-${kind}` && v.word === word && ratio(v.color, v.bg) >= 4.5 && v.inside, v);
    ok(`${T} driving view (${label}): "I've stopped" is ≥ 104px tall; no page errors`, v && v.keyH >= 104 && errors.length === 0, v);
    await ctx.close();
  }
}

// ---- stylesheet facts
{
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const at = css.indexOf('REIMAGINE (2026-11-12)');
  ok('css: the REIMAGINE layer is present, after the TACTILE PASS layer', at > 0 && at > css.indexOf('TACTILE PASS'));
  const tok = Object.fromEntries([...css.slice(at).matchAll(/(--sign-[a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
  const hex = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
  for (const k of ['go', 'warn', 'stop', 'rest']) {
    const r = tok[`--sign-${k}`] && tok[`--sign-${k}-ink`] ? ratio(hex(tok[`--sign-${k}`]), hex(tok[`--sign-${k}-ink`])) : 0;
    ok(`css: --sign-${k} carries its ink at ≥ 4.5:1`, r >= 4.5, r.toFixed(2));
  }
  // the four signs must stay apart for a colour-blind driver by SHAPE: four different glyph paths in the bundle
  const js = readFileSync(join(ROOT, 'app.js'), 'utf8');
  ok('bundle: the four sign shapes are four different outlines (rectangle, diamond, octagon, square)', ['M4 6.5h16', 'M12 2.2 21.8 12', 'M8.1 2.5h7.8', 'M5 3h14a2 2'].every((p) => js.includes(p)));
}

await browser.close();
server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'REIMAGINE FAIL' : 'REIMAGINE OK');
process.exit(fails ? 1 : 0);
