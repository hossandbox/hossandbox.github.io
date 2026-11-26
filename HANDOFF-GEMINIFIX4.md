# HANDOFF — Clock 14 geminifix4

Micro fix round addressing the single blocking item in `~/hos-build/REVIEW-GEMINIFIX3.md` (verdict `FIX-FIRST`) in `~/hos-build/work-geminifix4`. `web/src/store.ts` (confirmed N1) and all other source files were left untouched.

## Changes Made

| File | Line(s) | Change |
|---|---|---|
| `web/public/styles.css` | `1098` | Changed `@media (max-width: 340px)` → `@media (max-width: 359px)` in the Timeline override block (`1098–1102`). Nothing else in the block or anywhere else in `styles.css` was modified. |
| `web/test/dom/lebrowser.mjs` | `9, 92` | Added `[350, 640]` and `[344, 882]` to the viewport loop (`[[412, 915], [360, 640], [350, 640], [344, 882], [340, 640], [320, 568]]`) and updated the header comment to match. |

*(Plus rebuilt `web/dist/*` and `web/dist-test/*` artifacts; `web/dist/styles.css` is byte-identical to `web/public/styles.css`.)*

## Timeline Geometry Dump (`320 / 340 / 341 / 344 / 350 / 359 / 360 / 412`)

Measured in headless Chromium (`/usr/bin/chromium` + `HOS_PLAYWRIGHT=~/.hermes/hermes-agent`) against built `web/dist` using `lebrowser.mjs`'s exact seed (`62h 30m left` day/OFF, `62h 00m left` night/ON) plus a fresh `70h 00m left` seed:

### `lebrowser` seed (`62h 30m left` day/OFF & `62h 00m left` night/ON)

| Viewport | Loop? | Computed `.taxis` columns | Track width | `minClear` (day/OFF) | `minClear` (night/ON) | Overlaps / Overflow | Cycle `.taxis-value` |
|---|---|---|---:|---:|---:|---|---|
| **412×915** | Yes | `88px 142.812px 107.188px` | 140.81px | **17.02px** | **17.02px** | 0 / false | `nowrap`, `106.2×16.1px` (1 line, unwrapped) |
| **360×640** | Yes | `88px 90.8125px 107.188px` | 88.81px | **4.66px** | **4.66px** | 0 / false | `nowrap`, `106.2×16.1px` (1 line, unwrapped) |
| **359×640** | Dump | `64px 153.5px 67.5px` | 151.50px | **19.56px** | **19.56px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |
| **350×640** | Yes | `64px 144.5px 67.5px` | 142.50px | **17.42px** | **17.42px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |
| **344×882** | Yes | `64px 138.5px 67.5px` | 136.50px | **16.00px** | **16.00px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |
| **341×640** | Dump | `64px 135.5px 67.5px` | 133.50px | **15.28px** | **15.28px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |
| **340×640** | Yes | `64px 134.5px 67.5px` | 132.50px | **15.05px** | **15.05px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |
| **320×568** | Yes | `64px 114.5px 67.5px` | 112.50px | **10.30px** | **10.30px** | 0 / false | `normal`, `66.5×32.2px` (2 lines, wrapped) |

### Fresh `70h 00m left` single-line verification (`>= 360px` Fix 6 goal)

| Viewport | Cycle `.taxis-value` (`70h 00m left`) | Wrapped? |
|---|---|---|
| **412×915** | `nowrap`, `106.2×16.1px` | No (1 line — byte-identical to `geminifix3`) |
| **360×640** | `nowrap`, `106.2×16.1px` | No (1 line — byte-identical to `geminifix3`) |
| **359×640** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |
| **350×640** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |
| **344×882** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |
| **341×640** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |
| **340×640** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |
| **320×568** | `normal`, `66.5×32.2px` | Yes (2 lines — accepted `<= 359px` trade-off) |

## Full Test Counts (Sequential Foreground Runs)

All browser lanes ran with `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=~/.hermes/hermes-agent`:

| Suite / Command | Result | Details |
|---|---|---|
| `npm run build` | **PASS** | `tsc -p tsconfig.json --noEmit` clean; `built 2026-11-26 07:07` (`dist/app.js` 617.4kb) |
| `TZ=UTC npm run smoke` | **PASS** | `typecheck` OK; `contrast` day 44/44 + night 44/44; `nightlight` OK; `ocr-bundle` OK; `smoke.mjs` (`geminifix2` OK); 16 DOM suites **290/290 pass** (yesback 6/6, c1flush 8/8, adjuststart 39/39, scrub 30/30, c3 46/46, c3relaunch 3/3, logedit 37/37, cascade 16/16, rescue 11/11, stack 15/15, motel 13/13, legal 15/15, flip 12/12, miles 11/11, carrierday 9/9, myweek 19/19) |
| `TZ=America/Chicago npm run smoke` | **PASS** | Identical **290/290** DOM + all pre-DOM gates pass |
| `lebrowser` (`test/dom/lebrowser.mjs`) | **252/252 PASS** | `LOGEDIT BROWSER OK` across all 6 loop viewports (`412×915`, `360×640`, `350×640`, `344×882`, `340×640`, `320×568` — 42 checks × 6 viewports, 0 fail) |
| `polish` (`test/dom/polish.mjs`) | **295/295 PASS** | `POLISH OK` (0 fail) |
| `layout` (`test/dom/layout.mjs`) | **421/421 PASS** (`TZ=UTC`) | `LAYOUT OK` (see pre-existing wall-clock seed note below) |
| `auditfix` (`TZ=America/Chicago test/dom/auditfix.mjs`) | **185/185 PASS** | `AUDITFIX OK` (0 fail) |
| `gemini` (`test/dom/gemini.mjs`, esbuild-bundled) | **20/20 PASS** | 0 fail |
| `revisions` (`test/dom/revisions.mjs`, esbuild-bundled) | **89/89 PASS** | 0 fail |

### Note on pre-existing `layout.mjs` wall-clock seed flake (out of scope, untouched)
- The initial CST run of `node test/dom/layout.mjs` at `01:28 CST` hit the known pre-existing timeout at `layout.mjs:1877` (`waitForSelector('section.page-log.is-active button.entry:not(.live)')`): `motionSeed()` (`layout.mjs:1832–1840`) builds 12 × 35m closed segments ending at `nowMinute - 180` (3 hours before `now`), which falls on the previous local calendar day during `00:00–02:59 CST`, leaving no closed entries on today's Log.
- Re-running under `TZ=UTC` (`07:29 UTC`, outside both known wall-clock windows) passed **421/421** (`LAYOUT OK`).

## Invariants & Scope Verification

- **Engine aggregate SHA-256** (`find engine -type f | sort | xargs sha256sum | sha256sum`):
  `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` — **MATCHES (byte-identical)**.
- **`localStorage` keys unchanged**:
  `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim` (`web/src/store.ts:173-177`), `hos-sandbox-undo-v1` (`web/src/app.tsx:3341`).
- **Source files modified (exactly 2)**:
  1. `web/public/styles.css`
  2. `web/test/dom/lebrowser.mjs`
  *(No other files under `web/src`, `web/public`, `web/test`, or `engine` were modified; `web/dist/*` and `web/dist-test/*` rebuilt cleanly.)*
