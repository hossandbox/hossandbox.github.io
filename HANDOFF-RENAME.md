# Handoff — Rename Patch: "Split Decision" → "Clock 14" + Logo Icons (`work-rename`)

**Tree:** `~/hos-build/work-rename` (branched from `~/hos-build/work-myweekfix3`, the current LIVE tree with My Week shipped Nov 24)  
**Scope:** PRESENTATION-ONLY patch — copy and icons only. Zero logic, layout, styling, or behavior changes.  
**Authorization:** Nov 23–24, 2026 (Lorico's chosen name **"Clock 14"** + logo icon assets prepared by Ada in `~/hos-build/logo-icons/`).  
**Status:** Verified across all suites in both `TZ=America/Chicago` and `TZ=UTC`. **Not deployed, not pushed.**

---

## 1. Files Changed (vs. `work-myweekfix3`)

Verified via `diff -rq ~/hos-build/work-myweekfix3 ~/hos-build/work-rename -x node_modules -x dist -x dist-test`:

### Application & Asset Files (9 changed / 1 deleted)
1. **`web/src/app.tsx`** — 7 user-visible UI strings updated (`"Split Decision"` → `"Clock 14"`).
2. **`web/public/index.html`** — `<title>` updated to `Clock 14 — HOS What-If Planner`; `<link rel="icon">` repointed from `./icon.svg` (`image/svg+xml`) to `./icon-192.png` (`image/png`).
3. **`web/public/manifest.webmanifest`** — `name` → `"Clock 14 — HOS What-If Planner"`, `short_name` → `"Clock 14"`, removed `./icon.svg` entry from `icons[]`.
4. **`web/public/sw.js`** — removed `'./icon.svg'` from `ASSETS` precache list (so service worker install does not 404 after `icon.svg` deletion). `CACHE` name prefix `'hos-sandbox-'` left **unchanged**.
5. **`README.md`** — title and disclaimer mentions updated to `Clock 14`; `https://hossandbox.github.io/` repo/live URL untouched.
6. **`web/public/icon-192.png`** — byte-for-byte replacement from `~/hos-build/logo-icons/icon-192.png`.
7. **`web/public/icon-512.png`** — byte-for-byte replacement from `~/hos-build/logo-icons/icon-512.png`.
8. **`web/public/icon-maskable-512.png`** — byte-for-byte replacement from `~/hos-build/logo-icons/icon-maskable-512.png`.
9. **`web/public/icon.svg`** — **DELETED** (and `web/dist/icon.svg` removed; `web/dist/` rebuilt via `npm run build`).

### Test Files (4 changed — name/icon pin updates only; zero behavior pins changed)
10. **`web/test/smoke.mjs`** — updated 7 name assertions across startup disclaimer, patch 7.1 rename pin, and PDF header pin.
11. **`web/test/dom/c3.mjs`** — updated `M14a` manifest identity pin (new name, short_name, and 3-entry PNG `icons[]` without `icon.svg`).
12. **`web/test/dom/layout.mjs`** — updated PDF print-header app-name assertion.
13. **`web/test/dom/revisions.mjs`** — updated `D1` About-disclaimer regex and PDF print-header app-name assertion.

### Handoff Deliverable
14. **`HANDOFF-RENAME.md`** — this file.

---

## 2. Every Replaced String Location

| File & Line | Surface | Before | After |
|---|---|---|---|
| `web/public/index.html:49` | Page `<title>` | `<title>Split Decision — HOS What-If Planner</title>` | `<title>Clock 14 — HOS What-If Planner</title>` |
| `web/public/index.html:51` | Favicon `<link>` | `<link rel="icon" href="./icon.svg" type="image/svg+xml" />` | `<link rel="icon" href="./icon-192.png" type="image/png" />` |
| `web/public/manifest.webmanifest:2` | PWA `name` | `"name": "Split Decision — HOS What-If Planner",` | `"name": "Clock 14 — HOS What-If Planner",` |
| `web/public/manifest.webmanifest:3` | PWA `short_name` | `"short_name": "Split Decision",` | `"short_name": "Clock 14",` |
| `web/public/manifest.webmanifest:12` | PWA `icons[]` | `{ "src": "./icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" },` | *(removed)* |
| `web/public/sw.js:2` | SW `ASSETS` precache | `'./manifest.webmanifest', './icon.svg', './icon-192.png'` | `'./manifest.webmanifest', './icon-192.png'` |
| `web/src/app.tsx:11446` | Print/PDF log summary header | `<div class="pr-app">Split Decision <span class="pr-app-sub">— HOS What-If Planner</span></div>` | `<div class="pr-app">Clock 14 <span class="pr-app-sub">— HOS What-If Planner</span></div>` |
| `web/src/app.tsx:11530` | Print/PDF log summary footer | `<p class="pr-foot-meta">Split Decision — HOS What-If Planner · Generated {genStr}</p>` | `<p class="pr-foot-meta">Clock 14 — HOS What-If Planner · Generated {genStr}</p>` |
| `web/src/app.tsx:11561` | More → Driving alerts card | `Alerts only work while Split Decision is open — when the phone locks...` | `Alerts only work while Clock 14 is open — when the phone locks...` |
| `web/src/app.tsx:11747` | More → About card | `<p class="small">Split Decision — HOS What-If Planner. It is not an ELD...` | `<p class="small">Clock 14 — HOS What-If Planner. It is not an ELD...` |
| `web/src/app.tsx:11868` | Startup `DisclaimerDialog` | `<p class="small">Split Decision — HOS What-If Planner. It is not an ELD...` | `<p class="small">Clock 14 — HOS What-If Planner. It is not an ELD...` |
| `web/src/app.tsx:11903` | `SpeakAskDialog` prompt | `<p class="small">While you drive, Split Decision can say the numbers out loud...` | `<p class="small">While you drive, Clock 14 can say the numbers out loud...` |
| `web/src/app.tsx:12362` | Engine-error fallback card | `<h3>Split Decision could not calculate your clocks</h3>` | `<h3>Clock 14 could not calculate your clocks</h3>` |
| `README.md:1` | README H1 title | `# Split Decision — HOS What-If Planner` | `# Clock 14 — HOS What-If Planner` |
| `README.md:10` | README disclaimer blockquote | `> Split Decision is a planning scratchpad. It is not an ELD...` | `> Clock 14 is a planning scratchpad. It is not an ELD...` |

### Service Worker / Cache Name Note
- `web/public/sw.js:1` uses `const CACHE = 'hos-sandbox-' + (self.__BUILD__ || 'dev');` — it never contained `"Split Decision"`, is invisible to users, and was left **untouched** so existing PWA caches roll over cleanly without orphaning.
- Only the dead `'./icon.svg'` entry was removed from `ASSETS` in `web/public/sw.js:2` because `icon.svg` was deleted and leaving it in `c.addAll(ASSETS)` would fail service worker installation with HTTP 404.

---

## 3. Icon Changes

Source directory: `~/hos-build/logo-icons/` (Lorico's chosen clock+truck emblem without wordmark, prepared by Ada).

| File | Action | Dimensions / Format | SHA-256 (identical in `logo-icons/`, `web/public/`, and `web/dist/`) |
|---|---|---|---|
| `web/public/icon-192.png` | Replaced (byte-for-byte) | 192×192 PNG (RGB) | `e1f74cac7d31160ce415aea2c8c30cffd94e30884b3e00b707fc0b17267dff05` |
| `web/public/icon-512.png` | Replaced (byte-for-byte) | 512×512 PNG (RGB) | `1d4eb394b5bcb6dd355f4056b353f1c9df6702346d6a122519a205e252623428` |
| `web/public/icon-maskable-512.png` | Replaced (byte-for-byte) | 512×512 PNG (RGB) | `d8880cebbf528fdc9d0fe5f97796bd159f2a47cfbc23f69a3888150c0f7e4c28` |
| `web/public/icon.svg` | **Deleted** | *(old green/purple SVG)* | *(absent from both `web/public/` and `web/dist/`)* |

All remaining icon references in the app already pointed to `./icon-192.png`:
- `web/public/index.html:52`: `<link rel="apple-touch-icon" href="./icon-192.png" />`
- `web/public/manifest.webmanifest:18-20`: shortcut icons (`./icon-192.png`)
- `web/src/alerts.ts:378`: notification icon (`./icon-192.png`)

---

## 4. Test Pins Updated (Name & Icon Assertions Only)

No behavior, layout, styling, or engine pins were altered.

| Test File & Line(s) | Pin | Change |
|---|---|---|
| `web/test/smoke.mjs:838` | Startup disclaimer verbatim check (`ABOUT_DISC`) | `"Split Decision — HOS What-If Planner. ..."` → `"Clock 14 — HOS What-If Planner. ..."` |
| `web/test/smoke.mjs:2771-2773` | Patch 7.1 rename pin (`index.html`, `manifest.webmanifest`, `README.md`) | Updated expected `<title>`, `mf.name`, `mf.short_name`, and README H1 to `"Clock 14 — HOS What-If Planner"` / `"Clock 14"` (storage-key and repo-path guards on lines 2774–2775 untouched) |
| `web/test/smoke.mjs:2778, 2784` | Patch 7.1 About & startup disclaimer render checks | `/Split Decision — HOS What-If Planner\./` → `/Clock 14 — HOS What-If Planner\./` |
| `web/test/smoke.mjs:6499` | Log summary PDF header check | `head.includes('Split Decision')` → `head.includes('Clock 14')` |
| `web/test/dom/c3.mjs:604-605` | `M14a` manifest identity pin | Updated expected `name` (`'Clock 14 — HOS What-If Planner'`), `short_name` (`'Clock 14'`), and removed `{ src: './icon.svg', ... }` from expected `icons[]` |
| `web/test/dom/layout.mjs:1234` | Print-report header check `(g)` | `head.textContent.includes('Split Decision')` → `head.textContent.includes('Clock 14')` |
| `web/test/dom/revisions.mjs:659` | `D1` startup disclaimer vs. About match | `/Split Decision — HOS What-If Planner\./` → `/Clock 14 — HOS What-If Planner\./` |
| `web/test/dom/revisions.mjs:841` | PDF log-summary header check | `head.textContent.includes('Split Decision')` → `head.textContent.includes('Clock 14')` |

---

## 5. Complete Remaining-Occurrence List

Full-tree case-insensitive grep for `split[ _-]?decision` and `splitdecision` (excluding `node_modules/`, `dist/`, `dist-test/`, and this handoff file). **Zero** matches for `SplitDecision` (no space). **Zero** user-visible misses outside the `store.ts` hard invariant.

### Code, Styles, and Tests (11 occurrences)
| File & Line(s) | Occurrence | Reason It Stays |
|---|---|---|
| `web/src/store.ts:1301` | `'This is not a Split Decision export (expected a JSON object).'` | **Hard invariant:** brief mandates `web/src/store.ts` remain byte-identical to base `work-myweekfix3` (follow-on note: update these two invalid-import error messages the next time `store.ts` is opened). |
| `web/src/store.ts:1303` | `'This is not a Split Decision export: it has no "segments" list.'` | **Hard invariant:** same as above (`web/src/store.ts` must stay byte-identical to `work-myweekfix3`). |
| `web/public/styles.css:1930` | `SPLIT DECISION MOTION SYSTEM` | Internal CSS section-banner comment (not user-visible) and string-slice anchor read by `layout.mjs` and `revisions.mjs`. |
| `web/test/dom/layout.mjs:1796` | `css.indexOf('SPLIT DECISION MOTION SYSTEM')` | Internal test anchor slicing the motion-system CSS block in `styles.css`. |
| `web/test/dom/revisions.mjs:1903, 2145, 2189, 2233` | `css.indexOf('SPLIT DECISION MOTION SYSTEM')` (4 lines) | Internal test anchors slicing the motion-system CSS block in `styles.css`. |
| `web/test/smoke.mjs:2711, 2765` | Comments referencing patch 7.1's historical rename | Historical test comments (not user-visible). |
| `web/test/smoke.mjs:2852` | `console.log('patch 7.1 (...; the Split Decision rename; ...): OK')` | Historical test progress log label for patch 7.1 (not user-visible). |

### Historical Docs, Audits, Handoffs, and Research Files (41 occurrences across 22 files)
| File & Line(s) | Reason It Stays |
|---|---|
| `AUDIT.md:1` | Historical UX audit document. |
| `DESIGN-NAV.md:3` | Historical navigation design spec. |
| `HANDOFF-C1.md:1` | Historical patch handoff. |
| `HANDOFF-FEEL.md:1` | Historical patch handoff. |
| `HANDOFF-GEMINI.md:1` | Historical patch handoff. |
| `HANDOFF-HAPTIC.md:1` | Historical patch handoff. |
| `HANDOFF-POLISH.md:16` | Historical patch handoff (references `SPLIT DECISION MOTION SYSTEM` CSS block). |
| `HANDOFF-SWIPE.md:1` | Historical patch handoff. |
| `HANDOFF-TASTE.md:1` | Historical patch handoff. |
| `OPUS-DELTA-13.md:1` | Historical verification delta report. |
| `OPUS-DELTA-14.md:1` | Historical verification delta report. |
| `OPUS-DELTA-15.md:1` | Historical verification delta report. |
| `OPUS-DELTA-15B.md:1` | Historical verification delta report. |
| `OPUS-DELTA-17.md:1` | Historical verification delta report. |
| `OPUS-DELTA-C1.md:1` | Historical verification delta report. |
| `OPUS-VERIFY-13.md:1` | Historical verification report. |
| `OPUS-VERIFY-14.md:1` | Historical verification report. |
| `OPUS-VERIFY-15.md:1` | Historical verification report. |
| `OPUS-VERIFY-C1.md:1` | Historical verification report. |
| `RESEARCH-MASTER-TOOL.md:1, 12, 14, 34, 47, 57, 69, 209, 231, 255, 265, 278` (12 lines) | Historical product research spec. |
| `RESEARCH-PLAN-TOOLS-2.md:1, 11, 39, 55, 85, 139, 141, 144, 155` (9 lines) | Historical product research spec. |
| `brief-stack-neon.txt:1` | Historical build brief for Stack My Stops & Loads. |

### Remaining `icon.svg` Reference (1 occurrence)
| File & Line | Occurrence | Reason It Stays |
|---|---|---|
| `web/tools/make-maskable-icon.py:7` | Docstring comment: `The clock artwork is reused unchanged from icon.svg...` | Historical one-off icon-generation utility docstring (not shipped or executed by build/app). |

---

## 6. Full Verification Results (Sequential Foreground, Both Timezones)

Browser lanes ran with `HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/` and `HOS_BROWSER=/usr/bin/chromium` against freshly built `web/dist/`.

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
|---|---|---|---|
| `engine` (`npm test`) | **108/108 PASS (EXIT 0)** | **108/108 PASS (EXIT 0)** | — |
| `web` `npm run smoke` (overall) | **PASS (EXIT 0)** | **PASS (EXIT 0)** | Covers all sub-lanes below |
| — `typecheck` (`tsc --noEmit`) | PASS | PASS | — |
| — `contrast.mjs` | 44/44 day, 44/44 night PASS | 44/44 day, 44/44 night PASS | — |
| — `nightlight.mjs` | OK | OK | — |
| — `ocr-bundle.mjs` | OK (pass 1 & pass 2) | OK (pass 1 & pass 2) | — |
| — `smoke.mjs` | OK | OK | Includes updated disclaimer, patch 7.1, PDF pins |
| — `dom/yesback.mjs` | OK | OK | — |
| — `dom/c1flush.mjs` | 6/6 PASS | 6/6 PASS | — |
| — `dom/adjuststart.mjs` | 39/39 PASS | 39/39 PASS | — |
| — `dom/scrub.mjs` | 30/30 PASS | 30/30 PASS | — |
| — `dom/c3.mjs` | 46/46 PASS | 46/46 PASS | Includes updated `M14a` manifest & icon pin |
| — `dom/c3relaunch.mjs` | 3/3 PASS | 3/3 PASS | — |
| — `dom/logedit.mjs` | 37/37 PASS | 37/37 PASS | — |
| — `dom/cascade.mjs` | 16/16 PASS | 16/16 PASS | — |
| — `dom/rescue.mjs` | 11/11 PASS | 11/11 PASS | — |
| — `dom/stack.mjs` | 15/15 PASS | 15/15 PASS | — |
| — `dom/motel.mjs` | 13/13 PASS | 13/13 PASS | — |
| — `dom/legal.mjs` | 15/15 PASS | 15/15 PASS | — |
| — `dom/flip.mjs` | 12/12 PASS | 12/12 PASS | — |
| — `dom/miles.mjs` | 11/11 PASS | 11/11 PASS | — |
| — `dom/carrierday.mjs` | 9/9 PASS | 9/9 PASS | — |
| — `dom/myweek.mjs` | **19/19 PASS** | **19/19 PASS** | — |
| `dom/revisions.mjs` | **89/89 PASS (EXIT 0)** | **88/89 (W2 baseline quirk)** | Confirmed identical `W2` failure on base `work-myweekfix3` (see below) |
| `dom/gemini.mjs` | **20/20 PASS (EXIT 0)** | **20/20 PASS (EXIT 0)** | — |
| `dom/auditfix.mjs` | **185/185 PASS (EXIT 0)** | *(requires `TZ=America/Chicago`)* | Explicitly enforces `TZ=America/Chicago` |
| `dom/polish.mjs` | **295/295 PASS (EXIT 0)** | **295/295 PASS (EXIT 0)** | — |
| `dom/layout.mjs` | **421/421 PASS (EXIT 0)** | **421/421 PASS (EXIT 0)** | Timeline-axis time-of-day quirk did not trigger; all 421 pass in both TZs |

### Known Baseline Quirk Confirmation (`revisions.mjs` W2 in `TZ=UTC`)
- On `work-rename` (`TZ=UTC`): `revisions: 88/89 pins pass` — sole failure: `FAIL W2. tight cycle fixture: verdict banner names Recap Wall & 34h reset net gain; changing budget preset & target home time updates live — unexpected verdict: Tight cycleRecaps pinch to 6h 46m on Wed; a 34 starting Wed 08:00 nets +3h 14m by Mon.70-hour / 8-day cycle · rolls at midnight Central (06:00 device time).`
- Confirmed on untouched base tree `~/hos-build/work-myweekfix3` (`TZ=UTC`): `revisions: 88/89 pins pass` — identical `FAIL W2` message.

---

## 7. Hard Invariants Verification

- **`engine/` untouched:** `diff -rq ~/hos-build/work-myweekfix3/engine ~/hos-build/work-rename/engine` → clean (0 diffs).
- **`web/src/store.ts` byte-identical to base (`work-myweekfix3`):** `cmp` clean; SHA-256 `21bc674dc4c1b82bb05db5519eb08c45f2b2e7e6fafb98c499a274225451db7f` on both trees.
- **GitHub repo name & URL untouched:** `REPO = 'hossandbox/hossandbox.github.io'`, `https://hossandbox.github.io/`, and storage keys (`hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-undo-v1`) all unchanged.
- **No logic, layout, styling, or behavior changes:** Verified by diff scope (`web/public/styles.css` untouched; only copy/icon/manifest/sw-asset/test-pin edits).
- **Not deployed, not pushed.**
