/**
 * WCAG contrast gate.
 *
 * Parses the real palette out of public/styles.css and fails if any documented pair drops below its
 * threshold. It reads the colours rather than duplicating them, so a palette change cannot pass by
 * being made in only one of the two places. Run by `npm run smoke`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

function vars(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`contrast: no "${selector}" block found in styles.css`);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  const out = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function toRgb(v) {
  const s = v.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`contrast: cannot parse colour "${v}"`);
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
const hex = ([r, g, b]) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
/** composite a translucent colour over an opaque one */
const over = (fg, bg) => {
  const f = toRgb(fg), b = toRgb(bg);
  return hex([0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])));
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c) => { const [r, g, b] = toRgb(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const AA = 4.5;      // normal text
const GRAPHIC = 3.0; // non-text contrast: icons, colour bars, focus rings

function audit(name, V) {
  const warnbox = { panel: over(V['--tint-warn'], V['--panel']), page: over(V['--tint-warn'], V['--bg']) };
  const violbox = { panel: over(V['--tint-bad'], V['--panel']), page: over(V['--tint-bad'], V['--bg']) };
  const selcard = { panel: over(V['--tint-accent'], V['--panel']), page: over(V['--tint-accent'], V['--bg']) };

  const pairs = [
    ['body text on page', V['--text'], V['--bg'], AA],
    ['card text on card', V['--text'], V['--panel'], AA],
    ['muted label on page', V['--muted'], V['--bg'], AA],
    ['muted label on card', V['--muted'], V['--panel'], AA],
    ['muted on inset panel', V['--muted'], V['--panel2'], AA],
    ['green as text', V['--good'], V['--panel'], AA],
    ['amber as text', V['--warn'], V['--panel'], AA],
    ['red as text', V['--bad'], V['--panel'], AA],
    ['ink on primary button', V['--on-accent'], V['--accent-solid'], AA],
    ['ink on OFF chip', V['--chip-ink'], V['--muted'], AA],
    ['ink on SB chip', V['--chip-ink'], V['--accent'], AA],
    ['ink on D chip', V['--chip-ink'], V['--good'], AA],
    ['ink on ON chip', V['--chip-ink'], V['--warn'], AA],
    ['accent as graphic', V['--accent'], V['--panel'], GRAPHIC],
    ['green as graphic', V['--good'], V['--panel'], GRAPHIC],
    ['amber as graphic', V['--warn'], V['--panel'], GRAPHIC],
    ['red as graphic', V['--bad'], V['--panel'], GRAPHIC],
    ['muted as graphic', V['--muted'], V['--panel'], GRAPHIC],
  ];
  // tints appear both inside cards and in the sticky header (which sits on --bg)
  for (const [label, t] of [['warnbox', warnbox], ['violation row', violbox], ['selected card', selcard]]) {
    for (const base of ['panel', 'page']) {
      pairs.push([`text on ${label}/${base}`, V['--text'], t[base], AA]);
      if (label !== 'selected card') pairs.push([`muted on ${label}/${base}`, V['--muted'], t[base], AA]);
    }
  }

  const failures = [];
  for (const [label, fg, bg, need] of pairs) {
    const r = ratio(fg, bg);
    if (r < need) failures.push(`  ${label}: ${r.toFixed(2)}:1 (need ${need}) — ${fg} on ${bg}`);
  }
  const worst = pairs.map(([, f, b, n]) => ratio(f, b) / n).reduce((a, b) => Math.min(a, b), Infinity);
  console.log(`contrast ${name}: ${pairs.length - failures.length}/${pairs.length} pairs pass (tightest ${worst.toFixed(2)}x the required ratio)`);
  return failures;
}

const night = vars(':root {');
const day = vars(':root[data-theme="day"]');
const failures = [...audit('day (default)', day), ...audit('night', night)];

// The shell has to carry the default theme itself. Left to JS, a fresh install paints the :root
// (night) palette for the first frames and then flips to day — a visible flash of the wrong theme.
// The browser chrome must start on the default background too; applyTheme keeps it in step at runtime.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const htmlTheme = html.match(/<html[^>]*\bdata-theme="([^"]+)"/)?.[1];
if (htmlTheme !== 'day') {
  failures.push(`  index.html must set data-theme="day" on <html> (got ${htmlTheme ?? 'nothing'}) — a fresh install would flash the night palette`);
}
const metaColor = html.match(/<meta name="theme-color" content="([^"]+)"/)?.[1];
if (metaColor !== day['--bg']) {
  failures.push(`  index.html theme-color ${metaColor} must match the day --bg ${day['--bg']}`);
}
// Third place the default lives: the PWA manifest drives the install splash and the standalone chrome.
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
for (const key of ['background_color', 'theme_color']) {
  if (manifest[key] !== day['--bg']) {
    failures.push(`  manifest ${key} ${manifest[key]} must match the day --bg ${day['--bg']} — otherwise the installed app splashes dark onto a light UI`);
  }
}
// Android crops an installed app's icon to whatever shape the launcher uses. With no maskable icon it
// falls back to shrinking the artwork onto a white circle; with one whose corners are rounded or
// transparent, the crop shows them. So assert one exists, at the size Play wants, and genuinely
// full-bleed — measured from the pixels rather than taken on trust.
const maskable = (manifest.icons ?? []).filter((i) => String(i.purpose ?? '').split(/\s+/).includes('maskable'));
if (!maskable.length) {
  failures.push('  manifest declares no maskable icon — Android will shrink the artwork onto a white circle');
}
for (const icon of maskable) {
  const file = new URL(`../public/${String(icon.src).replace(/^\.\//, '')}`, import.meta.url);
  if (!existsSync(file)) { failures.push(`  maskable icon ${icon.src} is declared but missing`); continue; }
  const png = readFileSync(file);
  if (png.subarray(1, 4).toString('latin1') !== 'PNG') { failures.push(`  maskable icon ${icon.src} is not a PNG`); continue; }
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (w !== 512 || h !== 512) failures.push(`  maskable icon ${icon.src} is ${w}x${h}, Play wants 512x512`);
  const colorType = png[25];
  if (colorType !== 6 && colorType !== 2) { failures.push(`  maskable icon ${icon.src} has unexpected PNG colour type ${colorType}`); continue; }
  // Colour type 2 has no alpha channel, so every pixel is opaque by construction. Type 6 carries
  // alpha, and a transparent corner is exactly the defect the launcher's mask exposes.
  if (colorType === 6) {
    // First pixel of the first scanline: every PNG filter degenerates to raw there (no left/up
    // neighbour), so these bytes are the literal corner colour.
    let idat = Buffer.alloc(0);
    for (let o = 8; o + 8 <= png.length;) {
      const len = png.readUInt32BE(o), type = png.subarray(o + 4, o + 8).toString('latin1');
      if (type === 'IDAT') idat = Buffer.concat([idat, png.subarray(o + 8, o + 8 + len)]);
      o += 12 + len;
      if (type === 'IEND') break;
    }
    const alpha = inflateSync(idat)[4];
    if (alpha !== 255) failures.push(`  maskable icon ${icon.src} has a transparent corner (alpha ${alpha}) — the launcher's mask would show through where the icon should be solid`);
  }
}

if (failures.length) {
  console.error('\nWCAG AA contrast failures:\n' + failures.join('\n'));
  console.error('\nFix the palette in web/public/styles.css, or lower the threshold deliberately.');
  process.exit(1);
}