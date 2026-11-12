// Polish pass (2026-11-11) — the real-browser lane for Fable's tactile design pass.
// Implements the pin list Fable specified in package-polish/HANDOFF-POLISH.md ("NEXT (a)")
// before its session hit the 5-hour limit; written by Ada to that spec, design unchanged.
// Pins: compact Timeline|Dial switch geometry + no overlap (412 + 360, five hero variants);
// toggle lamp + chosen-key contrast in both themes (night colours exact); latched status
// key; the one control scale (56 keys/fields, 64 rows/commit, 48 inline floor) across
// screens; press state (sink 2px + inset shadow; reduced-motion = no transform); checkbox
// hit box 56x48; slider --fill + grip size; no horizontal overflow anywhere visited.
// Fail-before: every design pin here fails on the L2 tree (work-quickfix) — run there with
// --root ../work-quickfix/web/dist to see it. usage: node test/dom/polish.mjs [--root dist]
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
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`POLISH BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`POLISH BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`POLISH BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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

const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const lum = (rgb) => { const m = String(rgb).match(/[\d.]+/g); if (!m) return NaN; const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (saved, { width = 412, reducedMotion } = {}) => {
  const opts = { viewport: { width, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' };
  if (reducedMotion) opts.reducedMotion = reducedMotion;
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('polseeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('polseeded', '1'); } } catch { /* ignore */ } }, saved);
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
const click = (sel) => async (p) => { const l = typeof sel === 'string' ? p.locator(sel) : sel(p); await l.first().click({ timeout: 3000 }); await p.waitForTimeout(350); };
const tab = (t) => click((p) => p.locator('nav.tabs button', { hasText: new RegExp(t + '$') }));
const planItem = (i) => click((p) => p.locator('main button.plan-item').nth(i));
const noOverflow = async (page, name) => {
  const o = await page.evaluate(() => ({ sw: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0), iw: window.innerWidth }));
  ok(`${name}: no horizontal overflow`, o.sw <= o.iw + 1, `scrollWidth ${o.sw} vs inner ${o.iw}`);
};

/* ---------- 1. the compact switch: geometry + no overlap, five heroes, two widths ---------- */
const HEROES = [
  ['timeline', 'ON', {}],
  ['dial', 'ON', { nowCard: 'dial' }],
  ['rest', 'OFF', { segments: [{ status: 'OFF', start: N - 1500, end: N - 700, createdAt: 1 }, { status: 'D', start: N - 700, end: N - 40, createdAt: 2 }], current: { status: 'OFF', since: N - 40, createdAt: 4 } }],
  ['out', 'ON', { segments: [{ status: 'OFF', start: N - 1500, end: N - 700, createdAt: 1 }, { status: 'D', start: N - 700, end: N - 40, createdAt: 2 }], current: { status: 'ON', since: N - 40, createdAt: 4 } }],
  ['brk', 'D', { segments: [{ status: 'OFF', start: N - 1500, end: N - 485, createdAt: 1 }], current: { status: 'D', since: N - 485, createdAt: 4 } }],
];
const heroGeom = (page) => page.evaluate(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const hero = document.querySelector('.hero');
  if (!hero) return null;
  const sw = hero.querySelector(':scope > .card-switch');
  const out = { hero: R(hero), sw: sw ? R(sw) : null, pos: sw ? getComputedStyle(sw).position : null };
  if (sw) {
    out.keys = [...sw.querySelectorAll('.toggle button')].map((k) => ({ text: k.textContent.trim(), rect: R(k) }));
    const lab = sw.querySelector('.card-switch-l');
    out.labelW = lab ? lab.getBoundingClientRect().width : null;
  }
  // overlap is judged on the label's TEXT (Range rect), not its border box: the label
  // element spans the band full-width by design, its glyphs stop at the 158px padding.
  out.labels = [...hero.querySelectorAll('.hero-label, .hero-lead')].map((el) => { const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
  const val = hero.querySelector('.hero-value, .bignum');
  out.value = val ? R(val) : null;
  return out;
});
const hit = (a, b) => a && b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
for (const width of [412, 360]) {
  for (const [name, cur, over] of HEROES) {
    const { ctx, page, errors } = await open(save('day', cur, over), { width });
    const g = await heroGeom(page);
    const tag = `${width}/${name}`;
    ok(`${tag}: hero carries the switch`, !!g && !!g.sw);
    if (g && g.sw) {
      ok(`${tag}: switch is compact-positioned (absolute)`, g.pos === 'absolute', `position ${g.pos}`);
      ok(`${tag}: switch sits in the panel's top-right corner`, g.sw.t - g.hero.t >= 8 && g.sw.t - g.hero.t <= 18 && g.hero.r - g.sw.r >= 8 && g.hero.r - g.sw.r <= 18, `top gap ${Math.round(g.sw.t - g.hero.t)}, right gap ${Math.round(g.hero.r - g.sw.r)}`);
      ok(`${tag}: switch stays inside the panel`, g.sw.l >= g.hero.l - 1 && g.sw.b <= g.hero.b + 1, '');
      ok(`${tag}: keys read Timeline|Dial`, g.keys.length === 2 && g.keys[0].text === 'Timeline' && g.keys[1].text === 'Dial', g.keys.map((k) => k.text).join('|'));
      ok(`${tag}: switch keys keep the floor (>=48 tall, >=56 wide)`, g.keys.every((k) => k.rect.h >= 48 && k.rect.w >= 56), g.keys.map((k) => `${Math.round(k.rect.w)}x${Math.round(k.rect.h)}`).join(', '));
      ok(`${tag}: "Show as" label is kept in the DOM but visually clipped`, g.labelW !== null && g.labelW <= 2, `label width ${g.labelW}`);
      ok(`${tag}: switch overlaps no hero label`, g.labels.every((l) => !hit(l, g.sw)), `${g.labels.length} labels checked`);
      ok(`${tag}: switch overlaps no hero readout`, !g.value || !hit(g.value, g.sw), '');
    }
    await noOverflow(page, tag);
    ok(`${tag}: no page errors`, errors.length === 0, errors.join('; ').slice(0, 200));
    await ctx.close();
  }
}

/* ---------- 2. toggles: the lamp + chosen-key contrast, both themes ---------- */
const toggleInfo = (page) => page.evaluate(() => [...document.querySelectorAll('.toggle')].map((t) => {
  const on = t.querySelector('button.on');
  if (!on) return null;
  const cs = getComputedStyle(on); const af = getComputedStyle(on, '::after');
  return { label: (t.getAttribute('aria-label') || t.textContent.trim().replace(/\s+/g, ' ')).slice(0, 40), track: getComputedStyle(t).backgroundColor, onBg: cs.backgroundColor, keyMinH: parseFloat(cs.minHeight) || 0, lampContent: af.content, lampW: af.width, lampH: af.height, lampBg: af.backgroundColor, lampShadow: af.boxShadow };
}).filter(Boolean));
const checkToggles = async (theme, where, steps = []) => {
  const { ctx, page, errors } = await open(save(theme, 'ON'));
  for (const st of steps) await st(page);
  const ts = await toggleInfo(page);
  ok(`${theme}/${where}: screen carries toggles`, ts.length >= 1, `found ${ts.length}`);
  for (const t of ts) {
    ok(`${theme}/${where}: "${t.label}" chosen key carries the lit lamp (22x3, lit, glowing)`, t.lampContent !== 'none' && t.lampContent !== 'normal' && t.lampW === '22px' && t.lampH === '3px' && t.lampBg !== 'rgba(0, 0, 0, 0)' && t.lampBg !== 'transparent' && t.lampShadow !== 'none', `content ${t.lampContent}, ${t.lampW}x${t.lampH}, bg ${t.lampBg}, shadow ${t.lampShadow}`);
    if (theme === 'day') { const r = ratio(t.onBg, t.track); ok(`${theme}/${where}: "${t.label}" chosen key contrast >= 1.2:1`, r >= 1.2, `${r.toFixed(3)}:1 (${t.onBg} on ${t.track})`); }
    else ok(`${theme}/${where}: "${t.label}" night colours exact`, t.onBg === 'rgb(25, 33, 42)' && t.track === 'rgb(9, 12, 16)', `on ${t.onBg}, track ${t.track}`);
    ok(`${theme}/${where}: "${t.label}" keys keep the 48 floor`, t.keyMinH >= 48, `min-height ${t.keyMinH}`);
  }
  ok(`${theme}/${where}: no page errors`, errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
  return ts;
};
await checkToggles('day', 'now');
await checkToggles('day', 'more', [tab('More')]);
await checkToggles('night', 'now');

/* ---------- 3. the latched status key + 4. press state ---------- */
const latchInfo = (page) => page.evaluate(() => {
  const btns = [...document.querySelectorAll('.status-buttons button, .big-status button')];
  const one = (b) => { if (!b) return null; const cs = getComputedStyle(b); let ty = 0; try { ty = new DOMMatrixReadOnly(cs.transform).m42; } catch { /* none */ } return { ty, shadow: cs.boxShadow, transform: cs.transform }; };
  return { on: one(btns.find((b) => b.classList.contains('on'))), off: one(btns.find((b) => !b.classList.contains('on'))), heights: btns.map((b) => b.getBoundingClientRect().height) };
});
for (const theme of ['day', 'night']) {
  const { ctx, page, errors } = await open(save(theme, 'ON'));
  const li = await latchInfo(page);
  ok(`${theme}: a status key is latched`, !!li.on, '');
  if (li.on) {
    ok(`${theme}: latched key sits sunk 2px with an inset (pressed) shadow`, li.on.ty === 2 && li.on.shadow.includes('inset'), `ty ${li.on.ty}, shadow ${li.on.shadow}`);
    ok(`${theme}: unlatched keys sit raised (no sink)`, !!li.off && li.off.ty === 0, li.off ? `ty ${li.off.ty}` : 'no unlatched key found');
  }
  ok(`${theme}: status keys are full-size keys (heights >= 56)`, li.heights.length >= 4 && li.heights.every((h) => h >= 56), li.heights.map((h) => Math.round(h)).join(','));
  ok(`${theme}: no page errors`, errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
}
const pressCheck = async (reducedMotion) => {
  const { ctx, page, errors } = await open(save('day', 'ON'), { reducedMotion });
  const loc = page.locator('.status-buttons button:not(.on)').first();
  await loc.evaluate((el) => el.setAttribute('data-press', '1'));
  const box = await loc.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => { const el = document.querySelector('[data-press="1"]'); const cs = getComputedStyle(el); let ty = null; try { ty = new DOMMatrixReadOnly(cs.transform).m42; } catch { /* none */ } return { ty, transform: cs.transform, shadow: cs.boxShadow }; });
  await page.mouse.up();
  if (reducedMotion) ok('press (reduced motion): the key does not sink', st.transform === 'none' || st.ty === 0, `transform ${st.transform}`);
  else ok('press: a held key sinks 2px onto its skirt with an inset shadow', st.ty === 2 && st.shadow.includes('inset'), `ty ${st.ty}, shadow ${st.shadow}`);
  ok(`press${reducedMotion ? ' (reduced motion)' : ''}: no page errors`, errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
};
await pressCheck(undefined);
await pressCheck('reduce');

/* ---------- 5. the control scale + checkbox + slider, swept across screens ---------- */
const scaleInfo = (page) => page.evaluate(() => {
  const q = (sel) => [...document.querySelectorAll(sel)];
  const minH = (e) => parseFloat(getComputedStyle(e).minHeight) || 0;
  const ranges = q('input[type=range]').map((el) => ({ fill: (el.style.getPropertyValue('--fill') || '').trim(), h: el.getBoundingClientRect().height }));
  return {
    wide: q('button.wide').map(minH), rowbtn: q('button.rowbtn:not(.moved)').map(minH), rowbtnMoved: q('button.rowbtn.moved').map(minH), lever: q('.lever').map(minH),
    edlen: q('.ed-len button').map(minH), steps4: q('.steps4 button').map(minH),
    fields: q('label input:not([type=checkbox]):not([type=range]):not([type=hidden]), label select').map(minH),
    fine: q('.ed-fine button, .ed-fine output, .tstep-value').map(minH),
    checks: q('label.check input').map((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; }),
    ranges,
  };
});
const acc = { wide: [], rowbtn: [], rowbtnMoved: [], lever: [], edlen: [], steps4: [], fields: [], fine: [], checks: [], ranges: [] };
const sweep = async (name, steps) => {
  const { ctx, page, errors } = await open(save('day', 'ON'));
  for (const st of steps) { try { await st(page); } catch { /* scene step failed; pins below report what was found */ } }
  const s = await scaleInfo(page);
  for (const k of Object.keys(acc)) acc[k].push(...s[k]);
  await noOverflow(page, `sweep/${name}`);
  ok(`sweep/${name}: no page errors`, errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
};
await sweep('now', []);
await sweep('status-sheet', [click('button.dock-more')]);
await sweep('lever-sheet', [click('button.lever')]);
await sweep('log-edit', [tab('Log'), click('button.entry')]);
await sweep('log-edit2', [tab('Log'), click('button.entry'), click('.sheet button.act')]);
await sweep('log-add2', [tab('Log'), click('button.addbtn'), click('.sheet button.opt')]);
await sweep('log-add3', [tab('Log'), click('button.addbtn'), click('.sheet button.opt'), click('.sheet button.ed-go')]);
await sweep('plan-1', [tab('Plan'), planItem(0)]);
await sweep('plan-2', [tab('Plan'), planItem(1)]);
await sweep('plan-3', [tab('Plan'), planItem(2)]);
await sweep('plan-4', [tab('Plan'), planItem(3)]);
await sweep('plan-list', [tab('Plan')]);
await sweep('more', [tab('More')]);
const scalePin = (key, floor, label) => {
  ok(`scale: ${label} found on some screen`, acc[key].length >= 1, `found ${acc[key].length}`);
  ok(`scale: every ${label} keeps its floor (>= ${floor}px)`, acc[key].length >= 1 && acc[key].every((h) => h >= floor), `min seen ${acc[key].length ? Math.min(...acc[key]) : 'none'}`);
};
scalePin('wide', 64, 'commit keys (.wide)');
scalePin('rowbtn', 64, 'rows (.rowbtn)');
// Fable's own CSS deliberately keeps the recap ".moved" row at the 56 standard (tactile.css
// names button.rowbtn.moved in the --ctl group) — pinned at its designed floor, not 64.
scalePin('rowbtnMoved', 56, 'recap rows (.rowbtn.moved, designed 56)');
// Levers are computed from the driver's situation and may not be on offer under a test
// seed; when one is, it must sit at 64 like every row — and its rule is source-pinned below.
if (acc.lever.length) scalePin('lever', 64, 'rows (.lever, when on offer)');
scalePin('edlen', 64, 'length choices (.ed-len)');
scalePin('steps4', 64, 'stepper rows (.steps4)');
scalePin('fields', 56, 'fields (label input/select)');
scalePin('fine', 56, 'fine steppers + readouts (.ed-fine/.tstep-value)');
ok('checkbox: a settings checkbox exists', acc.checks.length >= 1, `found ${acc.checks.length}`);
ok('checkbox: hit box is the 56x48 slide switch', acc.checks.length >= 1 && acc.checks.every((c) => Math.abs(c.w - 56) <= 1 && Math.abs(c.h - 48) <= 1), acc.checks.slice(0, 4).map((c) => `${Math.round(c.w)}x${Math.round(c.h)}`).join(', '));
ok('slider: a slider exists', acc.ranges.length >= 1, `found ${acc.ranges.length}`);
for (const [i, r] of acc.ranges.entries()) {
  ok(`slider ${i + 1}: --fill is set inline (groove shows its level)`, /^\d+(\.\d+)?%$/.test(r.fill), `--fill "${r.fill}"`);
  ok(`slider ${i + 1}: groove rides at key height (56)`, Math.abs(r.h - 56) <= 1, `h ${Math.round(r.h)}`);
}

/* ---------- 6. source pins on the shipped stylesheet ----------
   Two things a browser lane cannot measure honestly: the slider grip's box (headless
   Chrome will not hand a pseudo-element's size to getComputedStyle — it answers with
   the track box) and the .lever row when no lever is on offer under a test seed.
   Both are pinned on the tactile block's text in the shipped styles.css, the same
   way smoke.mjs pins CSS. */
{
  const css = readFileSync(join(ROOT, 'styles.css'), 'utf8');
  const block = css.slice(css.indexOf('TACTILE PASS'));
  ok('css: the tactile block is present in the shipped stylesheet', block.length > 1000, `block ${block.length} bytes`);
  ok('css: the control scale tokens are 48 / 56 / 64', /--ctl-floor:\s*48px;\s*--ctl:\s*56px;\s*--ctl-lg:\s*64px;/.test(block), '');
  ok('css: .lever rows share the 64 row rule with .wide/.rowbtn/.ed-len/.steps4', /button\.wide,\s*button\.rowbtn,\s*\.lever,\s*\.ed-len button,\s*\.steps4 button\s*\{\s*min-height:\s*var\(--ctl-lg\);?\s*\}/.test(block), '');
  ok('css: the slider grip is a 36x44 thumb (webkit + moz)', /::-webkit-slider-thumb\s*\{[^}]*width:\s*36px;[^}]*height:\s*44px;/.test(block) && /::-moz-range-thumb\s*\{[^}]*width:\s*36px;\s*height:\s*44px;/.test(block), '');
}

await browser.close();
server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'POLISH FAIL' : 'POLISH OK');
process.exit(fails ? 1 : 0);
