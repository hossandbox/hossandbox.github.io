# HANDOFF-REMOVALS — Four Presentation Removals (Header Strip, Plan/Log Eyebrows, Log Undo Row)

**Workspace:** `/home/hatch/workspace/hos-patch/work-removals` (copied from live commit `df50ffa` / verified `work-logpin`).
**Date:** 2026-11-21
**Status:** Verified green across all lanes; **not pushed or deployed**.

---

## 1. Summary of Changes (Presentation Only — Zero Math / Functional Changes)

All four removals are presentation-only; no hours-of-service math, store schema, or undo machinery changed.

### 1. Header Summary Strip (removed everywhere)
- **`web/src/app.tsx`**
  - Removed the inline `<div class="compact">` render inside `TopBar` (was lines 1049–1051 in base; now removed at line 1034) that showed `<b>{dur(ev.driveNow)}</b> of driving · Stop by <b>{clockFull(ev.mustStopBy)}</b>` and the out-of-hours `drive again at {clock(again.off)}` line on every non-Now screen (Plan, Log, More, and Plan sub-screens).
  - Removed the now-unused `again` prop from `TopBar` (line 1009) and its `<TopBar ... />` call site in `App` (line 6276). `again` in `App` stays for `DrivingView` and `NowTab`.
  - Updated the doc comment above `TopBar` (lines 1005–1008).
  - Left the rest of `TopBar` untouched: `.top-row` (status pill, clock, theme toggle), `AlertBanner`, and Now-only `<HeaderDisclaimer s={s} />` ("Planning only — not a log, not an ELD" + `Details`). Because the element is omitted from the DOM, `header.top` shrinks cleanly to `.top-row` on Plan/Log/More with `ResizeObserver` updating `--top-h` and zero leftover header gap.
  - Note on `web/public/styles.css`: `.compact` (line 260) was intentionally left intact because Split Lab's `button.pblock.compact` also carries the `compact` class.

### 2. Plan Eyebrow (`TimeHead kind="future"`)
- **`web/src/app.tsx`**
  - Removed `<TimeHead kind="future" />` (small rail icon + "The future — what’s still ahead") from the top of `PlanTab` (was line 4039 in base; now removed at line 4014). `<h1 class="screen-title">Plan</h1>` and all four planning items below stay unchanged.

### 3. Log Eyebrow (`TimeHead kind="past"`) & Unused `TimeHead` Component/CSS
- **`web/src/app.tsx`**
  - Removed `<TimeHead kind="past" />` (small rail icon + "The past — what’s already done") from inside `<div class="log-pin">` in `LogTab` (was line 3269 in base; now removed at line 3251). `.log-pin` now starts directly with `.daynav` followed by `<section class="card log-graph-card">`.
  - Removed the now-unused `function TimeHead` component (was lines 58–67 in base; removed at line 58).
- **`web/public/styles.css`**
  - Removed the now-unused `.timehead` / `.timehead-rail` / `.timehead-past` / `.timehead-future` rules (was lines 1074–1081 in base) and `.page.page-log > .log-pin > .timehead` (was line 1215 in base).
  - Pin geometry verified at both `412×915` and `360×640`: `.log-pin` (`flex: 0 0 auto`) starts flush under `header.top` (`pin.top === hdr.bottom`), and `.log-scroll` (`flex: 1 1 0; min-height: 0`) starts flush beneath `.log-pin` (`scroll.top === pin.bottom`) with zero overlap and zero dead gap.

### 4. Log Undo Line (Log Screen Only)
- **`web/src/app.tsx`**
  - Removed the Log undo row (`{undo && (<div class="row undo">...</div>)}`) from the top of `.log-scroll` in `LogTab` (was lines 3294–3299 in base; removed at line 3275).
  - Removed the now-unused `const undo = useUndo();` binding in `LogTab` (was line 3215 in base; removed at line 3198).
  - **Untouched:** `StatusUndoChip` on Now (`app.tsx` lines 1886–1903) and in `DrivingView`, `undoLast`, `useUndo`, `currentUndo`, `restoreUndo`, `hos-sandbox-undo-v1` persistence, and Split Lab / Load Check draft-undo rows.

---

## 2. Test Pin Changes (Presence → Absence)

Only pins asserting the presence of a removed element were re-aimed to assert its absence (plus explicit absence pins where coverage was added). All Now `status-undo` pins (`auditfix` D2/D3, `smoke`, `adjuststart`, `logedit`) and all other pins pass unchanged.

- **`web/test/smoke.mjs`**
  - **Lines 825–835:** Previously asserted `/30-min break due · <b>drive again at/` in the Log header when out of hours. Re-aimed to assert `class="compact"`, `30-min break due ·`, and `drive again at` are absent from `<header>` on `log`, `plan`, and `settings` (while Now still renders `30-min break needed`).
  - **Lines 1035–1040:** Previously matched raw `drive again at ${clock(H(8.5))}` from the removed Log header `.compact` strip while `tab === 'log'`. Re-aimed to assert the Log header omits `drive again at` / `class="compact"` while Now's `RestHero` (`You can drive again at ${clock(H(8.5))}`) matches the pill's rest start.
  - **Lines 1178–1183:** Previously asserted `7h 30m of driving · Stop by ...` in the Log header. Re-aimed to assert the header summary strip (`class="compact"`, `of driving · Stop by`, `drive again at`) is absent from `<header>` on `log`, `plan`, and `settings`.
  - **Lines 6297–6322:** Extended the `logpin` pin block to also verify: header summary strip absent on `log`, `plan`, `split`, `settings`; `TimeHead` absent on `page-log`, `page-plan`, `page-now`, `page-settings`; `.log-pin` starts directly with `.daynav`; `page-plan` keeps `<h1 class="screen-title">Plan</h1>`; and `page-log` renders no `class="row undo"` even when `currentUndo()` is armed by `tapStatus`, while `undoLast()` still succeeds.
- **`web/test/dom/revisions.mjs`**
  - **Lines 514–533 (`N4`):** Previously asserted `TimeHead` presence on Log (entries + resolved) and Plan. Re-aimed to assert `TimeHead` is absent on Log (both views, with `.log-pin`'s first child being `.daynav`) and absent on Plan (with `h1.screen-title` "Plan" preserved).
  - **Lines 626–653 (`R1`, `R2`):** Added explicit pins proving: (`R1`) header summary strip (`.compact` / `of driving · Stop by` / `drive again at`) is absent from `header.top` across `now`, `plan`, `log`, `split`, `settings` both with hours left and when out of hours; (`R2`) Log undo row is absent on `page-log` even when undo is armed, while `page-now` keeps `.status-undo` and `undoLast()` restores status.
- **`web/test/dom/layout.mjs`**
  - **Lines 628–672 (Section `(e)`):** Previously asserted `TimeHead` presence on Log and Plan at `412×915` and `360×640` (day + night). Re-aimed to assert `TimeHead` is absent on all 4 panels (Log, Plan, Now, More), `.log-pin` starts with `.daynav`, and Plan keeps `h1.screen-title` cleanly within the page box.
  - **Lines 774–808 (Section `(f)`):** Extended `hdrCheck` to assert `.compact` / `of driving · Stop by` / `drive again at` are absent from `header.top` on Plan, More, Log, and Now with no empty header gap (`hdrH <= topRowH + 20`, `pgTop === hdrBottom`, zero overflow).
  - **Lines 839 & 884–891 (Section `(f)`):** Tightened the pinned Log geometry assertion to verify `pin.firstElementChild === daynav`, `Math.abs(pin.top - hdr.bottom) <= 1`, and `Math.abs(scroll.top - pin.bottom) <= 1` (no overlap and no dead gap) at both `412×915` and `360×640`.
- **`web/test/dom/auditfix.mjs`**
  - **Lines 286–291 (`D10`):** Previously queried `.page.is-active .row.undo` on the Log screen after saving an entry edit. Re-aimed to assert `.page.is-active .row.undo` is absent on Log while the underlying undo record (`localStorage['hos-sandbox-undo-v1']`) still stores the D10 label (`Changed to On Duty Fri 17:45 → Fri 18:50 · was Fri 18:00 → Fri 18:50`). All Now `status-undo` / `drive-undo` pins (`D2`, `D3`) ran unchanged and passed.

---

## 3. Verification Results (Run Strictly One Suite at a Time)

No TimeAxis 1px overflow flake occurred on any run.

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck | `cd web && npm run typecheck` | **PASS** (exit 0) |
| Production Build | `cd web && npm run build` | **PASS** (exit 0; `dist/app.js` 272.7kb) |
| Full Smoke Gate (UTC) | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK (2 passes), `smoke.mjs` OK, plus all 8 `npm run dom` suites: `yesback` OK, `c1flush` 6/6, `adjuststart` 35/35, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Revisions (Chicago) | `cd web && ./node_modules/.bin/esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**42/42**, exit 0) |
| Gemini (Chicago) | `cd web && ./node_modules/.bin/esbuild test/dom/gemini.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-gemini.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**, exit 0) |
| Auditfix (Chicago) | `cd web && TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** (**139/139**, exit 0) |
| Polish (Chicago) | `cd web && TZ=America/Chicago node test/dom/polish.mjs` | **PASS** (**263/263**, exit 0) |
| Layout (Chicago) | `cd web && TZ=America/Chicago node test/dom/layout.mjs` | **PASS** (**354/354**, exit 0) |

---

## 4. Guardrail Confirmation

- `git hash-object web/src/store.ts`: **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (byte-identical to base).
- `engine/`: **zero changes** (`diff -rq ../work-logpin/engine engine` returned empty).
- App copy: zero driver or employer names introduced.
- Changed source/test files vs. base (`work-logpin`):
  - `web/src/app.tsx`
  - `web/public/styles.css`
  - `web/test/smoke.mjs`
  - `web/test/dom/revisions.mjs`
  - `web/test/dom/layout.mjs`
  - `web/test/dom/auditfix.mjs`
- Added handoff: `HANDOFF-REMOVALS.md`.
- Rebuilt artifacts (`web/dist/`, `web/dist-test/`) regenerated by `npm run build` / `npm run smoke` / `esbuild`.

---

## 5. Ada Verification Addendum (2026-11-21)

Independently re-verified by Ada against `work-removals` before deploy (log: `~/workspace/hos-patch/verify-removals.log`):

- `web/src/store.ts` git hash `1323046db6ba07b8c85805f89a103dc16f3776b5` — byte-identical to base.
- `engine/` diff vs `work-logpin` empty.
- Changed files vs base are exactly the six listed in §4 plus this handoff.
- Ada's own runs, one suite at a time: typecheck exit 0, build exit 0, TZ=UTC smoke gate exit 0, auditfix exit 0, polish exit 0, layout exit 0, revisions exit 0, gemini exit 0.
- Deploy go given by Lorico by voice, 2026-11-21.
