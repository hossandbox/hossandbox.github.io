// Patch L1 — the real-browser lane for the two Now-card items the DOM shim cannot see:
//   item 6: the Timeline card's axis head. On the live C3 build the hour labels (08 10 12 …) and the
//     "STOP hh:mm" tag were stamped on top of each other above the lanes, and the cycle lane's long
//     value crushed the track so the hour labels packed into one blob. Pinned here as geometry:
//     no tag/hour overlap, no hour/hour overlap, no head text over a lane, bar or the stop line.
//   item 5: the on-card Timeline / Dial switch. It is on the Now card, its keys meet the 48px floor,
//     and it and More → Planning → "Main card on Now" are ONE setting: flipping either moves the other
//     and survives a reload. None in the driving view (that view keeps the dial).
// Checked at 412x915 and 360x640, day + night, parked Off Duty and On Duty.
// usage: node test/dom/lebrowser.mjs [--root dist] [--shots DIR]
// A missing browser is a FAILURE (exit 2), never a silent pass.
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
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`LOGEDIT BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`LOGEDIT BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`LOGEDIT BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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

// Parked after ~6h of driving: a STOP wall a few hours out, the cycle lane showing "62h …m left".
const N = Math.floor(Date.now() / 60000);
const save = (theme, cur, over = {}) => JSON.stringify({
  segments: [{ status: 'OFF', start: N - 1500, end: N - 480, createdAt: 1 }, { status: 'D', start: N - 480, end: N - 120, createdAt: 2 }, { status: 'ON', start: N - 120, end: N - 30, createdAt: 3 }],
  current: { status: cur, since: N - 30, createdAt: 4 }, drivingView: false, historyAcknowledged: true, disclaimerAcked: true, tzChosen: true,
  themeChosen: true, theme, nowCard: 'timeline', nowCardAsked: true, tab: 'now', config: { timeZone: 'America/Chicago' }, ...over,
});

const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (W, H, saved) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('leseeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('leseeded', '1'); } } catch { /* ignore */ } }, saved);
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
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: false }); };
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('.taxis, .taxis *, .card-switch, .card-switch *')].filter((e) => e.getBoundingClientRect().right > vw + 0.5).length;
  return { vw, docW: document.documentElement.scrollWidth, wide };
});
const geom = (page) => page.evaluate(() => {
  const r = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, txt: el.textContent.trim().slice(0, 24), cls: String(el.className) }; };
  const q = (s) => [...document.querySelectorAll(s)].map(r).filter((x) => x.w > 0);
  const hit = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  const hours = q('.taxis-hour'), tags = q('.taxis-tag'), lanes = q('.taxis-row:not(.taxis-head)'), bars = q('.taxis-bar'), stop = q('.hero-stop');
  const head = document.querySelector('.taxis-track-head');
  const pairs = (A, B, same) => { const o = []; A.forEach((a, i) => B.forEach((b, j) => { if ((!same || i < j) && hit(a, b)) o.push(`${a.txt}×${b.txt}`); })); return o; };
  return {
    taxis: !!document.querySelector('.taxis'), nHours: hours.length, nTags: tags.length, headTag: head ? head.classList.contains('has-tag') : null,
    tagHour: pairs(tags, hours), hourHour: pairs(hours, hours, true), overLanes: pairs([...hours, ...tags], [...lanes, ...bars, ...stop]),
    minClear: hours.length > 1 ? Math.min(...[...hours].sort((x, y) => x.l - y.l).slice(1).map((h, i, _a) => h.l - [...hours].sort((x, y) => x.l - y.l)[i].r)) : null,
  };
});
const switchInfo = (page) => page.evaluate(() => {
  const c = document.querySelector('.card-switch');
  if (!c) return null;
  const card = c.closest('.card, section, article');
  return { inCard: !!card && !!card.querySelector('.taxis, .dial'), keys: [...c.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height), on: b.getAttribute('aria-pressed') })) };
});
const pressed = (loc) => loc.evaluateAll((bs) => bs.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim()));
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}').nowCard; } catch { return 'unreadable'; } });

for (const [W, H] of [[412, 915], [360, 640]]) {
  /* ---------------- item 6: the axis head, every theme × parked status ---------------- */
  for (const theme of ['day', 'night']) for (const cur of ['OFF', 'ON']) {
    const tag = `${W}x${H} ${theme} ${cur}`;
    const { ctx, page, errors } = await open(W, H, save(theme, cur));
    const g = await geom(page);
    ok(`${tag} item 6: the Timeline card is drawn with its hour labels and a STOP tag`, g.taxis && g.nHours >= 3 && g.nTags >= 1, JSON.stringify(g));
    ok(`${tag} item 6: the STOP tag and the hour labels never sit on each other`, g.taxis && g.tagHour.length === 0, JSON.stringify(g.tagHour));
    ok(`${tag} item 6: the hour labels are apart (no packed blob)`, g.taxis && g.hourHour.length === 0, JSON.stringify(g.hourHour));
    ok(`${tag} item 6: neighbouring hour labels keep >= 4px clear (the track is not crushed by a lane value)`, g.minClear != null && g.minClear >= 4, String(g.minClear));
    ok(`${tag} item 6: no hour label or STOP tag over a lane, a bar or the stop line`, g.taxis && g.overLanes.length === 0, JSON.stringify(g.overLanes));
    ok(`${tag} item 6: the head carries has-tag when a STOP wall is tagged`, g.headTag === true, String(g.headTag));
    const ov = await overflow(page);
    ok(`${tag} no horizontal overflow on the card`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    await page.evaluate(() => document.querySelector('.taxis')?.scrollIntoView({ block: 'center' }));
    await shot(page, `axis-${W}x${H}-${theme}-${cur}`);
    ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  /* ---------------- item 5: the on-card switch is the More setting ---------------- */
  {
    const tag = `${W}x${H}`;
    const { ctx, page, errors } = await open(W, H, save('night', 'ON'));
    const s0 = await switchInfo(page);
    ok(`${tag} item 5: the Now card carries a "Show as Timeline | Dial" switch inside the card`, s0 && s0.inCard && s0.keys.map((k) => k.t).join('|') === 'Timeline|Dial', JSON.stringify(s0));
    ok(`${tag} item 5: both switch keys meet the 48px floor`, s0 && s0.keys.length === 2 && s0.keys.every((k) => k.h >= 48), JSON.stringify(s0));
    ok(`${tag} item 5: the switch shows the stored choice (Timeline)`, s0 && s0.keys.find((k) => k.on === 'true')?.t === 'Timeline', JSON.stringify(s0));
    if (!s0) {
      // No switch on the card (e.g. the base build): every interaction pin below is a FAIL, reported, not a crash.
      for (const n of ['tapping Dial on the card swaps the card to the dial and stores it', 'More → "Main card on Now" shows Dial (the card\'s choice)', 'Timeline picked in More → the Now card is the timeline and its switch says so', 'the card\'s choice survives a reload']) ok(`${tag} item 5: ${n}`, false, 'no .card-switch on the Now card');
      await ctx.close();
    } else {
    await page.locator('.card-switch').scrollIntoViewIfNeeded();
    await shot(page, `switch-${W}x${H}-timeline`);
    await page.locator('.card-switch button', { hasText: 'Dial' }).click(); await page.waitForTimeout(200);
    const s1 = await switchInfo(page);
    const card1 = await page.evaluate(() => ({ dial: !!document.querySelector('main .dial'), taxis: !!document.querySelector('.taxis') }));
    ok(`${tag} item 5: tapping Dial on the card swaps the card to the dial and stores it`, card1.dial && !card1.taxis && (await stored(page)) === 'dial' && s1?.keys.find((k) => k.on === 'true')?.t === 'Dial', JSON.stringify({ card1, s1 }));
    await shot(page, `switch-${W}x${H}-dial`);
    await page.locator('nav.tabs button', { hasText: /More$/ }).click(); await page.waitForTimeout(200);
    const lbl = page.locator('label', { hasText: 'Main card on Now' });
    ok(`${tag} item 5: More → "Main card on Now" shows Dial (the card's choice)`, (await lbl.count()) === 1 && (await pressed(lbl.locator('button'))).join() === 'Dial', JSON.stringify(await pressed(lbl.locator('button'))));
    await lbl.locator('button', { hasText: 'Timeline' }).click(); await page.waitForTimeout(150);
    await page.locator('nav.tabs button', { hasText: /Now$/ }).click(); await page.waitForTimeout(250);
    const s2 = await switchInfo(page);
    const card2 = await page.evaluate(() => ({ taxis: !!document.querySelector('.taxis') }));
    ok(`${tag} item 5: Timeline picked in More → the Now card is the timeline and its switch says so`, card2.taxis && s2?.keys.find((k) => k.on === 'true')?.t === 'Timeline' && (await stored(page)) === 'timeline', JSON.stringify({ card2, s2 }));
    await page.locator('.card-switch button', { hasText: 'Dial' }).click(); await page.waitForTimeout(200);
    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#root *'); await page.waitForTimeout(300);
    const s3 = await switchInfo(page);
    ok(`${tag} item 5: the card's choice survives a reload`, (await page.locator('main .dial').count()) >= 1 && s3?.keys.find((k) => k.on === 'true')?.t === 'Dial', JSON.stringify(s3));
    const ov = await overflow(page);
    ok(`${tag} item 5: no horizontal overflow with the switch`, ov.wide === 0 && ov.docW <= ov.vw, JSON.stringify(ov));
    ok(`${tag} no page errors (switch)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
    }
    const dv = await open(W, H, save('night', 'D', { drivingView: true }));
    ok(`${tag} item 5: no switch in the driving view`, (await dv.page.locator('main.drive').count()) === 1 && (await dv.page.locator('.card-switch').count()) === 0);
    await dv.ctx.close();
  }
}
await browser.close(); server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'LOGEDIT BROWSER FAIL' : 'LOGEDIT BROWSER OK');
process.exit(fails ? 1 : 0);
