# HANDOFF — MORPH4 (Four Bottom Sheets Converted to Log-Entry Origin Morph)

Date: 2026-11-22. Tree: `/home/lae/hos-build/work-morph4` (copied from `work-polish`; not deployed).

## Hard-Fence Verification
- `git hash-object web/src/store.ts` = `1323046db6ba07b8c85805f89a103dc16f3776b5` (byte-identical).
- `engine/` untouched (`diff -rq` vs `work-polish/engine`: zero differences).
- `web/public/styles.css` untouched — all four converted sheets reuse the exact existing Log-entry morph CSS rules (`.sheet.morph-origin`, `transform-origin: 50% 50%`, `--morph-dx / --morph-dy / --morph-sx / --morph-sy`, `sheet-morph-in 320ms var(--ease-enter)`, `sheet-morph-out 200ms var(--ease-exit)`, backdrop fade, and `@media (prefers-reduced-motion: reduce)` neutralization).
- All 10 unconverted sheet kinds (`lever`, `why`, `quickstart`, `splitblock`, `loadtime`, `triptime`, `rollouttime`, `rescuetime`, `confirm`, `add`) keep `sheet-slide-up` / `sheet-slide-down` untouched.
- Centered modals, Plan room cross-fades, in-place state dissolves, micro / press / theme transitions, and sheet internals/copy/clock picker: untouched.
- Log-entry editor morph (`kind: 'edit'`) and `data-entry-key` rows: untouched (`M0`–`M5` and `MS1`–`MS3` still pass verbatim).

---

## Files Changed

| File | Summary |
|---|---|
| `web/src/app.tsx` | Generalized `SheetMorphOrigin` into `'log' \| 'opener'` modes; added `isConvertedMorphKind`, `captureOpenerRect`, `openMorphSheet`, `resolveOpenerRect`, and `fallbackBottomCenterRect`; wired all opener tap sites for `drift`, `since`, `exceptions`, and `status`; removed `slideUp` prop from `DriftSheet`; preserved morph origin across in-sheet steps (`SinceSheet` `pick` → `done`); updated `Sheet` `useLayoutEffect` and `App` `morphForSheet`. |
| `web/test/dom/adjuststart.mjs` | Relaxed 5 exact class checks (`class === 'sheet'` → `/\bsheet\b/.test(...)`) because `SinceSheet` now carries `class="sheet morph-origin"`. |
| `web/test/dom/revisions.mjs` | Re-aimed `DriftSheet` pins (`ES1`, `ES2`, `ES3`, `RT1`) from `.slide-up` to `.morph-origin` while keeping `LeverSheet` / `WhySheet` on slide-up; added pins **`M4A`** and **`M4B`** covering all four converted sheets, `SinceSheet` step preservation, missing-opener fallback, and unconverted slide-up retention. |
| `web/test/dom/layout.mjs` | Re-aimed sections `(j)` and `(k)` for `DriftSheet` morph (`sheet-morph-in` / `sheet-morph-out`) while keeping `LeverSheet` & `Why?` on `sheet-slide-up` / `sheet-slide-down`; added section **`(n) morph4`** across `412×915` and `360×640` verifying real-browser FLIP vars, `sheet-morph-in` / `sheet-morph-out` across all four sheets and all exit paths, off-screen close fallback, `?go=stopped` missing-opener fallback, and `prefers-reduced-motion: reduce`. |

---

## The Four Converted Sheets (Component, Kind & Opener Capture)

Identified by their visible labels/headings in the running app (all four are the sheet-opening controls stacked at the bottom of the Now screen, plus their secondary entry points):

1. **"Check against my ELD"** — **`DriftSheet`** (`kind: 'drift'`)
   - **Heading**: `"Check against my ELD"`
   - **Opener capture**: `NowTab` (`button.plan-item`) calls `openMorphSheet({ kind: 'drift' }, e.currentTarget)`, capturing `e.currentTarget.getBoundingClientRect()` (and storing the element reference for live return rect resolution on close). Removed `slideUp` prop from all 6 `<Sheet>` branches in `DriftSheet`.
2. **"Fix the start time"** — **`SinceSheet`** (`kind: 'since'`) *(contains shared `<ClockPick>`)*
   - **Heading**: `"Fix the start time"`
   - **Opener capture**:
     - `NowTab` (`button.rowbtn`, `"Fix the start time"`) calls `openMorphSheet({ kind: 'since' }, e.currentTarget)`.
     - `StatusSheet` (`"Still {label}? Fix its start time"`) calls `openMorphSheet({ kind: 'since' }, e.currentTarget)`.
     - In-sheet apply (`openSheet({ kind: 'since', done: at })`) keeps the same `sheetSessionKey` (`'since'`) and preserves `activeMorphOrigin` without replaying entrance, so closing from the confirmation step (`"See my clocks"`, X, scrim, Escape, or hardware Back) still returns into the original opener button.
3. **"Exceptions This Shift"** — **`ExceptionsSheet`** (`kind: 'exceptions'`)
   - **Heading**: `"Exceptions this shift"`
   - **Opener capture**:
     - `NowTab` (`button.rowbtn`, `"Exceptions this shift"`) calls `openMorphSheet({ kind: 'exceptions' }, e.currentTarget)`.
     - `MoreTab` / Settings (`button.rowbtn`, `"Exceptions this shift"`) calls `openMorphSheet({ kind: 'exceptions' }, e.currentTarget)`.
4. **"PC Yard Move / Started Earlier"** — **`StatusSheet`** (`kind: 'status'`)
   - **Note on brief mapping**: The brief's parenthetical note from `HANDOFF-POLISH.md` listed `LeverSheet (kind: lever)` beside `"PC Yard Move / Started Earlier"`, while instructing to identify the four sheets by their visible UI headings/labels in the running app. In `web/src/app.tsx`, `"PC, yard move, or started earlier…"` (`button.link.dock-more` in `StatusDock`) opens **`StatusSheet` (`kind: 'status'`, heading `"What are you doing now?"`, containing Personal conveyance, Yard move, and "When did it start?" / started earlier)**. `LeverSheet` (`kind: 'lever'`) is the HOS counterfactual recommendation chip sheet (`"If you take your 30-min break now…"`, `"At Mon 18:00, +12h 59m comes back…"`), so `StatusSheet` (`kind: 'status'`) was converted and `LeverSheet` (`kind: 'lever'`) remains on `sheet-slide-up` / `sheet-slide-down` as one of the 10 unconverted sheet kinds (`1 existing edit + 4 converted + 10 unconverted = 15` total `SheetKind` variants).
   - **Opener capture**:
     - `StatusDock` (`button.link.dock-more`, `"PC, yard move, or started earlier…"`) calls `openMorphSheet({ kind: 'status' }, e.currentTarget)`.
     - `WelcomeBackChip` (`button.mini`, `"I stopped at…"`) calls `openMorphSheet({ kind: 'status' }, e.currentTarget)`.
     - `DrivingView` (`button.drive-stop`, `"I've stopped"`) calls `openMorphSheet({ kind: 'status' }, e.currentTarget)`.
     - Home-screen shortcut `?go=stopped` (`applyGo`) calls `openSheet({ kind: 'status' })` without an opener element and uses the graceful fallback below.

---

## FLIP Mechanics & Fallback Behavior

- **Mechanism**: Reuses the exact Log-entry morph CSS (`.sheet.morph-origin`, `transform-origin: 50% 50%` — matching the existing Log-entry implementation in `web/public/styles.css` — `sheet-morph-in 320ms var(--ease-enter)`, `sheet-morph-out 200ms var(--ease-exit)`) and `applyMorphVars()` (`--morph-dx`, `--morph-dy`, `--morph-sx ∈ [0.84, 0.98]`, `--morph-sy ∈ [0.32, 0.75]`), computed synchronously in `Sheet`'s `useLayoutEffect` before frame 0.
- **Live close return**: Across every exit path (Done / Save / Close / See my clocks, X button, Cancel / Not now, scrim tap, Escape, hardware Back), `openSheet(null)` immediately clears `currentSheet()` / `blocked` / `backNav` and retains the closing sheet (`.morph-origin.is-closing`, `inert`, `aria-hidden="true"`) for `220ms`. Before paint, `resolveOpenerRect(el)` checks that the opener element is still connected, not inside an `[aria-hidden="true"]` or inactive `section.page`, and visible inside both the viewport and enclosing page scrollport (8px margin). If visible, `--morph-dx/dy/sx/sy` are recomputed against the opener's current rect and sheet's current height, playing `sheet-morph-out 200ms var(--ease-exit)`.
- **Fallback (missing / disconnected / off-screen opener at open OR close)**:
  - For all four converted kinds (`mode: 'opener'`), `Sheet` ALWAYS renders with `.morph-origin` and NEVER applies `.slide-up` or `.morph-fallback` (`sheet-slide-up` / `sheet-slide-down` are never used for these four).
  - If the opener element is absent at open time (e.g., `?go=stopped` shortcut or programmatic `openSheet`), or missing/disconnected/off-screen/on-another-tab at close time (e.g., `SinceSheet` opened from inside `StatusSheet`, `DriftSheet` closing after `"Open the Log"`, or Now scrolled away), `fallbackBottomCenterRect(wrap)` supplies a centered pill rect near the bottom edge of `.sheet-wrap` (`width: min(88%, w - 24)`, `height: 48px`, `12px` above bottom), so the sheet morphs cleanly out of / into bottom-center via `sheet-morph-in` / `sheet-morph-out` with zero frame-0 static flash.
- **Reduced motion**: Under `@media (prefers-reduced-motion: reduce)`, `useLayoutEffect` skips FLIP math, CSS resets `.sheet.morph-origin` to `animation: none; transform: none; opacity: 1;`, and closing bypasses retention and unmounts immediately (identical to the Log editor).

---

## Verification Results (Sequential Foreground Runs)

Environment: `TZ=America/Chicago`, `HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/`, `HOS_BROWSER=/home/lae/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`.

| Check / Suite | Result | Details |
|---|---|---|
| `git hash-object web/src/store.ts` | **PASS** | `1323046db6ba07b8c85805f89a103dc16f3776b5` (unchanged) |
| `diff -rq work-polish/engine work-morph4/engine` | **PASS** | Identical (zero modified files) |
| `cd web && npm run build` | **PASS** | `tsc --noEmit` + `esbuild` (`dist/app.js` 376.2kb, 0 errors) |
| `cd web && npm run smoke` | **PASS** | `typecheck`, `contrast`, `nightlight`, `ocr-bundle`, `smoke.mjs`, and all 9 `dom` suites (`yesback`, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16, `rescue` 11/11) |
| `test/dom/revisions.mjs` | **PASS** | **89/89 pins pass** (incl. re-aimed `ES1`–`ES3`, `RT1`, existing `MS1`–`MS3`, new `M4A`–`M4B`) |
| `test/dom/layout.mjs` | **PASS** | **421/421 pass, 0 fail** (`LAYOUT OK`, incl. re-aimed `(j)`/`(k)`, existing `(h)`/`(l)`/`(m)` M0–M5, new `(n)` morph4 at `412×915` & `360×640`) |
| `test/dom/lebrowser.mjs` | **PASS** | **84/84 pass, 0 fail** (`LOGEDIT BROWSER OK`) |
