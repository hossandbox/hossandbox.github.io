/**
 * Night-light budget and warning-shape checks (patch 16).
 *
 * The contrast gate (contrast.mjs) proves text is readable; it says nothing about how much
 * LIGHT a surface throws into a dark cab, or whether two colours that carry different
 * meanings can still be told apart by a driver who cannot separate their hues. This file
 * checks those two things, from the real palette and the real source:
 *
 *  1. Light budget. At night, the surfaces the load verdict wears (P1c: the card surface for
 *     a Yes, the violation tint over the card for a No) must stay within 10× the night page
 *     colour's luminance — and neither verdict rule may fill with the solid verdict colour
 *     (the old slab measured ~157×/87× the background).
 *  2. Graphic pairs. The ⚠ glyph (--warn on the warning tint) and the ✕ icon (--bad on the
 *     violation tint) must clear the 3.0 non-text ratio on the card and on the page, in
 *     both themes.
 *  3. Colour-vision separation. Under Machado et al. (2009) severity-1.0 simulation of
 *     protanopia and deuteranopia, meaning-carrying colour pairs (verdict colours, warning
 *     vs violation, the four duty-status colours) should sit ΔE76 ≥ 20 apart in Lab space.
 *     A pair that falls short passes ONLY when a shape cue that does not depend on hue is
 *     verified present in the source (hazard stripes, the ⚠ glyph, the ✓/✕ verdict icons,
 *     the ✓/✗ list glyphs, the status words that always ride beside the colours) — colour
 *     is never the only carrier of a meaning in this app.
 *
 * Run by `npm run smoke`, after the contrast gate.
 */
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const appSrc = readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');

function vars(selector) {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`nightlight: no "${selector}" block found in styles.css`);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  const out = {};
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const night = vars(':root {');
const day = vars(':root[data-theme="day"]');

function toRgb(v) {
  const s = v.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16), 1];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`nightlight: cannot parse colour "${v}"`);
  const p = m[1].split(',').map((x) => Number(x.trim()));
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}
const hexOf = ([r, g, b]) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;
/** composite a translucent colour over an opaque one */
const over = (fg, bg) => {
  const f = toRgb(fg), b = toRgb(bg);
  return hexOf([0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])));
};
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (c) => { const [r, g, b] = toRgb(c); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const failures = [];
const notes = [];

/* ---- 1. the night light budget ---- */
{
  const budget = 10 * lum(night['--bg']);
  const yesSurface = night['--surface-hi']; // the verdict card's gradient runs surface-hi → panel; the hi stop is the brighter
  const noSurface = over(night['--tint-bad'], night['--panel']);
  notes.push(`night page L=${lum(night['--bg']).toFixed(4)}; budget L≤${budget.toFixed(4)}; Yes surface L=${lum(yesSurface).toFixed(4)}; No surface L=${lum(noSurface).toFixed(4)}`);
  if (lum(yesSurface) > budget) failures.push(`verdict Yes surface luminance ${lum(yesSurface).toFixed(4)} exceeds the night budget ${budget.toFixed(4)} (10x the page)`);
  if (lum(noSurface) > budget) failures.push(`verdict No surface luminance ${lum(noSurface).toFixed(4)} exceeds the night budget ${budget.toFixed(4)} (10x the page)`);
  const rule = (sel) => {
    const i = css.indexOf(sel);
    if (i < 0) { failures.push(`styles.css has no ${sel} rule`); return ''; }
    return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  };
  if (/background:\s*var\(--good\)/.test(rule('.verdict.yes'))) failures.push('.verdict.yes must not fill with the solid --good (the slab is what P1c removed)');
  if (/background:\s*var\(--bad\)/.test(rule('.verdict.no'))) failures.push('.verdict.no must not fill with the solid --bad (the slab is what P1c removed)');
}

/* ---- 2. the warning/violation graphic pairs ---- */
for (const [name, V] of [['day', day], ['night', night]]) {
  const warnOnCard = over(V['--tint-warn'], V['--panel']);
  const warnOnPage = over(V['--tint-warn'], V['--bg']);
  const badOnCard = over(V['--tint-bad'], V['--panel']);
  const badOnPage = over(V['--tint-bad'], V['--bg']);
  for (const [label, fg, bg] of [
    ['⚠ glyph on warning tint (card)', V['--warn'], warnOnCard],
    ['⚠ glyph on warning tint (page)', V['--warn'], warnOnPage],
    ['✕ icon on violation tint (card)', V['--bad'], badOnCard],
    ['✕ icon on violation tint (page)', V['--bad'], badOnPage],
  ]) {
    const r = ratio(fg, bg);
    notes.push(`${name} ${label}: ${r.toFixed(2)}:1 (need 3.0)`);
    if (r < 3.0) failures.push(`${name} ${label} is ${r.toFixed(2)}:1, under the 3.0 graphic minimum`);
  }
}

/* ---- 3. colour-vision separation (Machado 2009, severity 1.0) ---- */
const MACHADO = { // Machado, Oliveira & Fernandes 2009, severity 1.0 — operators on LINEAR RGB
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
};
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
function simulate(rgbHex, M) {
  const [r, g, b] = toRgb(rgbHex).slice(0, 3).map(lin);
  return [0, 1, 2].map((i) => delin(Math.max(0, Math.min(1, M[i][0] * r + M[i][1] * g + M[i][2] * b))));
}
function lab([r, g, b]) {
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (c1, c2, M) => {
  const a = lab(simulate(c1, M)), b = lab(simulate(c2, M));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
/** Shape cues, each verified against the source — a pair under ΔE 20 needs at least one. */
const CUES = {
  stripes: { ok: /main\.drive\.bad::after/.test(css) && /repeating-linear-gradient\(45deg/.test(css), what: 'hazard stripes on the out-of-time driving view' },
  warnGlyph: { ok: /\.warnbox::before/.test(css) && /\.alertbox::before/.test(css), what: '⚠ glyph before every warning box' },
  verdictIcons: { ok: /best\.feasible \? I\.check : I\.x/.test(appSrc), what: '✓ / ✕ verdict icon before the word' },
  listGlyphs: { ok: /\.checks li::before/.test(css), what: '✓ / ✗ glyphs on the pairing check list' },
  statusWords: { ok: /STATUS_LABEL/.test(appSrc) && /segLabel/.test(appSrc), what: 'status words always rendered beside the status colours' },
};
const PAIRS = [
  // [label, tokenA, tokenB, cues that carry the distinction when hue cannot]
  ['good vs bad (verdict)', '--good', '--bad', ['verdictIcons']],
  ['warn vs bad (warning vs violation)', '--warn', '--bad', ['warnGlyph', 'stripes']],
  ['good vs warn (go vs caution)', '--good', '--warn', ['warnGlyph']],
  ['OFF vs SB', '--muted', '--sb', ['statusWords']],
  ['OFF vs D (driving)', '--muted', '--good', ['statusWords']],
  ['OFF vs ON', '--muted', '--warn', ['statusWords']],
  ['SB vs D (driving)', '--sb', '--good', ['statusWords']],
  ['SB vs ON', '--sb', '--warn', ['statusWords']],
  ['D (driving) vs ON', '--good', '--warn', ['statusWords']],
];
for (const [themeName, V] of [['day', day], ['night', night]]) {
  for (const simName of Object.keys(MACHADO)) {
    for (const [label, ta, tb, cues] of PAIRS) {
      const dE = deltaE(V[ta], V[tb], MACHADO[simName]);
      if (dE >= 20) { notes.push(`${themeName}/${simName} ${label}: ΔE ${dE.toFixed(1)} — separated by colour alone`); continue; }
      const held = cues.filter((c) => CUES[c].ok);
      if (held.length) notes.push(`${themeName}/${simName} ${label}: ΔE ${dE.toFixed(1)} — under 20, carried by shape: ${held.map((c) => CUES[c].what).join('; ')}`);
      else failures.push(`${themeName}/${simName} ${label}: ΔE ${dE.toFixed(1)} under simulation and NO verified shape cue (${cues.join(', ')})`);
    }
  }
}

for (const n of notes) console.log(`  ${n}`);
if (failures.length) {
  console.error(`\nnightlight failures:\n${failures.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('nightlight: OK (light budget held, graphic pairs ≥3.0, no meaning carried by hue alone)');
