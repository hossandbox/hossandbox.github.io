// Quick patch (2026-11-11) — the real-browser lane for the day-mode toggle fix.
// Field report: in day mode every segmented toggle (.toggle) reads washed out — the chosen side's
// background (--panel2 #e8ecf0) on the track (--bg #e4e9ee) measures 1.03:1, so a driver in sunlight
// cannot tell what he picked (Now Timeline|Dial, and every toggle on the More screen).
// Pinned here as computed style: in DAY mode every .toggle's .on key must clear 1.2:1 against its
// track AND carry a real box-shadow edge; in NIGHT mode the values stay exactly what they were.
// usage: node test/dom/quickfix.mjs [--root dist]
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
try { ({ chromium } = createRequire(PW.endsWith('/') ? PW : PW + '/')('playwright-core')); } catch (e) { console.log(`QUICKFIX BROWSER LANE CANNOT RUN: playwright-core not found under ${PW} (${e.code || e.message})`); process.exit(2); }
if (!existsSync(CHROME)) { console.log(`QUICKFIX BROWSER LANE CANNOT RUN: no browser at ${CHROME}`); process.exit(2); }
if (!existsSync(join(ROOT, 'app.js'))) { console.log(`QUICKFIX BROWSER LANE CANNOT RUN: no built app under ${ROOT} (run npm run build first)`); process.exit(2); }

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
const save = (theme, tab) => JSON.stringify({
  segments: [{ status: 'OFF', start: N - 1500, end: N - 480, createdAt: 1 }, { status: 'D', start: N - 480, end: N - 120, createdAt: 2 }, { status: 'ON', start: N - 120, end: N - 30, createdAt: 3 }],
  current: { status: 'ON', since: N - 30, createdAt: 4 }, drivingView: false, historyAcknowledged: true, disclaimerAcked: true, tzChosen: true,
  themeChosen: true, theme, nowCard: 'timeline', nowCardAsked: true, tab, config: { timeZone: 'America/Chicago' },
});

const res = []; const ok = (name, cond, info = '') => { res.push({ pass: !!cond, name, info }); };
const lum = (rgb) => { const m = String(rgb).match(/[\d.]+/g); if (!m) return NaN; const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); const hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const open = async (saved) => {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.addInitScript((s) => { try { if (!sessionStorage.getItem('qfseeded')) { localStorage.setItem('hos-sandbox-v1', s); sessionStorage.setItem('qfseeded', '1'); } } catch { /* ignore */ } }, saved);
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
const toggles = (page) => page.evaluate(() => [...document.querySelectorAll('.toggle')].map((t) => {
  const on = t.querySelector('button.on');
  const cs = on ? getComputedStyle(on) : null;
  return { label: (t.getAttribute('aria-label') || t.textContent.trim().replace(/\s+/g, ' ')).slice(0, 44), track: getComputedStyle(t).backgroundColor, onBg: cs ? cs.backgroundColor : null, onShadow: cs ? cs.boxShadow : null };
}));

{
  const { ctx, page, errors } = await open(save('day', 'now'));
  const ts = await toggles(page);
  ok('day/now: the screen carries toggles', ts.length >= 1, `found ${ts.length}`);
  for (const t of ts) {
    const r = t.onBg ? ratio(t.onBg, t.track) : 0;
    ok(`day/now: "${t.label}" chosen key stands out (bg ${t.onBg} on track ${t.track} = ${r.toFixed(2)}:1, shadow edge)`, t.onBg && r >= 1.2 && t.onShadow && t.onShadow !== 'none', `ratio ${r.toFixed(3)}, shadow ${t.onShadow}`);
  }
  await page.getByRole('button', { name: /^More/ }).click(); await page.waitForTimeout(400);
  const ms = await toggles(page);
  ok('day/more: the screen carries toggles', ms.length >= 3, `found ${ms.length}`);
  for (const t of ms) {
    const r = t.onBg ? ratio(t.onBg, t.track) : 0;
    ok(`day/more: "${t.label}" chosen key stands out (bg ${t.onBg} on track ${t.track} = ${r.toFixed(2)}:1, shadow edge)`, t.onBg && r >= 1.2 && t.onShadow && t.onShadow !== 'none', `ratio ${r.toFixed(3)}, shadow ${t.onShadow}`);
  }
  ok('day: no page errors', errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
}
{
  const { ctx, page, errors } = await open(save('night', 'now'));
  const ts = await toggles(page);
  ok('night/now: the screen carries toggles', ts.length >= 1, `found ${ts.length}`);
  for (const t of ts) {
    ok(`night/now: "${t.label}" unchanged (panel2 key on night track)`, t.onBg === 'rgb(25, 33, 42)' && t.track === 'rgb(9, 12, 16)', `on ${t.onBg}, track ${t.track}`);
  }
  ok('night/now: no page errors', errors.length === 0, errors.join('; ').slice(0, 200));
  await ctx.close();
}

await browser.close();
server.close();
for (const r of res) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : '  — ' + r.info}`);
const fails = res.filter((r) => !r.pass).length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'QUICKFIX FAIL' : 'QUICKFIX OK');
process.exit(fails ? 1 : 0);
