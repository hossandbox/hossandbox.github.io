# Handoff — Clock 14 `logpatch2` (`work-logpatch2`, Fix Round for `REVIEW-LOGPATCH.md`)

**Tree:** `~/hos-build/work-logpatch2` (copied from `work-logpatch`; `work-logpatch` untouched)  
**Scope:** Fix round closing independent review (`~/hos-build/REVIEW-LOGPATCH.md`) findings **F1–F6** per owner decisions (Lorico, 2026-11-28). Nothing outside F1–F6 touched.  
**Status:** Built (`web/dist/app.js` **740,768 B** vs `work-logpatch` **729,836 B** / **+10,932 B**; vs `eldpatch` baseline **726,220 B** / **+14,548 B**), `engine/` verified byte-identical, every new pin verified **fail-before** on `work-logpatch` and **pass-after** on `work-logpatch2`, and all sequential foreground test suites green. **Not pushed, not deployed.**

---

## 1. Per-Fix Summary (Tied to Review Findings F1–F5)

### Fix 1 — F1 (CRITICAL): Scoped compare reads LOGGED rows only
- **Root cause closed:** `driftCheck` and `planDriftFill` in `work-logpatch` called `allSegments(s, now)` (which appends `s.tentative` what-if rows), reviving the patch 9.1 phantom-fill hazard when a stale what-if break was driven through.
- **Changes (`web/src/store.ts:2800-2886`):**
  - Removed `clipSegmentsToDay` and switched both `driftCheck` (`store.ts:2800-2807`) and day-fenced `planDriftFill` (`store.ts:2833-2865`) to read strictly `loggedSegments(s, asOf)` — identical to the unscoped Now Refresh path.
  - Today's Log compare (`back === 0`) and Now Refresh now evaluate the exact same logged-only segment set and always agree on identical state.

### Fix 2 — F2 (CRITICAL): No history clipping before `evaluate()`
- **Root cause closed:** `driftCheck` previously clipped away all rows before `day.start` prior to `evaluate()`, erasing overnight/midnight-crossing shifts (e.g., Wed 20:00–24:00 driving + Thu 00:00–03:00 driving) and prior rests.
- **Changes (`web/src/store.ts:2800-2865`):**
  - `driftCheck(s, eldLeftMin, now, day?)` (`store.ts:2800-2807`) now evaluates the **full** `loggedSegments(s, asOf)` up to `asOf = day ? Math.min(day.end, now) : now`, with **zero lower clip**. For Today (`back === 0`), `asOf === now`, guaranteeing bit-for-bit parity with Now Refresh across overnight shifts, splits, resets, and cycle run-up.
  - `planDriftFill(s, minutes, now, day?)` (`store.ts:2833-2865`) normalizes the full `loggedSegments(s, dayEnd)` first (preserving cross-midnight context) and fences **only** the candidate unlogged stretches strictly to `[day.start, Math.min(day.end, now)]`.
  - For past days (`back > 0`), the UI never calls `driftCheck` at `day.end` (so a past day ending in ≥10h OFF never reports a fresh `11:00` drive-left); it uses totals-only comparison (Fix 3 below).

### Fix 3 — F3 (HIGH, Owner Design): Past-day compare becomes TOTALS-ONLY
- **Store totals comparison (`web/src/store.ts:2888-2945`):**
  - Added `loggedDayTotals(s, now, day)` (`store.ts:2908-2919`): resolves `loggedSegments(s, until)` via `normalize(..., { merge: false })` (never reading `tentative` what-if rows) and sums logged minutes inside `[day.start, Math.min(day.end, now))`.
  - Added `compareDayTotals(s, { driving, onDuty }, now, day)` (`store.ts:2927-2945`): compares ELD Daily Log Driving and/or On-Duty totals (as present) against the app's logged totals for that carrier day using `DRIFT_TOLERANCE_MIN` (2m). Returns per-metric `{ appMin, eldMin, diff, verdict: 'sync' | 'more' | 'less' }` and overall `verdict: 'sync' | 'diff'`. Never plans or offers fills.
- **Daily Log totals OCR (`web/src/eldocr.ts:633-803`):**
  - Left `extractEldClocks` and `mergeExtractions` completely untouched.
  - Added `extractEldDayTotals(words)` (`eldocr.ts:728-773`) and `mergeDayTotalsExtractions(a, b)` (`eldocr.ts:775-803`) reading `driving` (`Driving` / `Drive` / uppercase `D`) and `onDuty` (`On Duty` / `On-Duty` / `On Duty Not Driving` / uppercase `ON`, explicitly ignoring `Off Duty` and `"Not Driving"` as driving) under the same conservative safety bar (`OCR_MIN_CONFIDENCE`, 24:00 ceiling, no bare-hours/limit-annotation fills, contest blanks field).
- **UI mode split (`web/src/app.tsx:3351-3604, 4496-4508`, `web/public/styles.css:3574-3588`):**
  - When `day && day.back > 0` (`isPastDay`), `DriftSheet` renders `data-drift-mode="totals"`:
    - Reads ELD Daily Log Driving & On-Duty totals from screenshot OCR (or whole-number typed boxes via `readEldEntry`).
    - Displays side-by-side comparison (`This app` vs `Your ELD`) and plain-language difference (`Your ELD shows X more/less driving/on duty than this app` or `In sync`).
    - Offers **NO fill/apply button** — only `Done` / `Back to Log` with plain guidance to edit that day on the Log tab by hand if desired.
    - Never mutates `segments`, `tentative`, or `current`.
  - Today (`back === 0`) and Now Refresh (`!day`) keep the existing clocks-based compare-and-choose flow WITH fills (`data-drift-mode="clocks"`), now backed by Fixes 1–2.
  - Log CTA subtitle adapts by mode: Today keeps `"Check an ELD screenshot — you pick any change."`; past days read `"Compare that day's ELD totals against your log."`.
- **In-flow guide copy (`web/src/eldguides-ui.tsx:15-157`):**
  - Added `compareMode?: 'clocks' | 'totals'` prop (`'clocks'` default).
  - Past day (`compareMode="totals"`): picker and detail screen use totals framing (`"we'll compare the day's totals"`, Daily Log screen guidance, `switchDay` shown prominently first, never telling the driver `"not Daily Log"`).
  - Today (`back === 0`) and Now/QuickStart (`compareMode="clocks"`): keep clocks framing (four countdown clocks).

### Fix 4 — F4 (MEDIUM, Owner Decision): Keep BOTH swipe-to-Now AND swipe-to-change-day on Log
- **Disambiguation scheme (`web/src/app.tsx:4429-4445`, `web/public/styles.css:1242-1255`):**
  - **Day-cycle swipe** lives on the pinned top day/graph area: `<div class="daynav" {...daySwipeProps}>` (`app.tsx:4430`) and `<section class="card log-graph-card" data-log-swipe-zone="grid" {...daySwipeProps}>` (`app.tsx:4436`), both with `touch-action: pan-y` (`styles.css:1242-1243`). Note: `.daynav` adds event props only (no extra DOM attribute), preserving the SSR `<div class="log-pin"><div class="daynav">` invariant (`smoke.mjs:6340`).
  - **Strip paging (`Log → Now`)** is preserved across the entire rest of the Log screen: removed `daySwipeProps`, `data-log-swipe-zone="rows"`, and `touch-action: pan-y` from `.log-scroll` (`app.tsx:4445`, `styles.css:1245-1255`). A rightward swipe on any Log entry (`button.entry`) or `.log-foot` pages smoothly `Log → Now` (even at the earliest day when `canBack === false`); vertical drags scroll `.log-scroll`; leftward drags past Log stay on Log.
  - All day-swipe guards stay active on `.daynav` and `.log-graph-card`: vertical-dominant rejection, sheet/modal open, mid-edit (`EditorSheet` open), 220ms `logSwap` lock (bypassed under `prefers-reduced-motion: reduce`), multi-touch cancellation, form-control exclusion, 350ms post-swipe click suppression, and `canBack` / `back === 0` boundaries. Previous/Next arrows remain unchanged.

### Fix 5 — F5 (LOW): Do not stamp `lastEldCheckAt` on past-day totals compares
- **Choice made:** **Skip stamping `lastEldCheckAt`** on past-day totals compares (`app.tsx:3491`, `compareTotals` never writes `lastEldCheckAt`), with zero new persisted fields or storage keys.
- **Behavior:** `lastEldCheckAt` continues to reflect only live clocks checks (Now Refresh, Today `back === 0` clocks compare, and `addDriftFill`), so exports are never misled by a past-day totals look-up.

---

## 2. Files Changed (6 modified, 0 added outside existing files)

- `web/src/store.ts` — Fixes 1, 2, 3 (`driftCheck`, `planDriftFill`, `loggedDayTotals`, `compareDayTotals`)
- `web/src/eldocr.ts` — Fix 3 (`extractEldDayTotals`, `mergeDayTotalsExtractions`)
- `web/src/app.tsx` — Fixes 3, 4, 5 (`DriftSheet` past-day totals mode + no `lastEldCheckAt` stamp, `LogTab` disambiguated swipe zones + CTA subtitle)
- `web/src/eldguides-ui.tsx` — Fix 3 (`compareMode: 'clocks' | 'totals'` copy framing)
- `web/public/styles.css` — Fixes 3, 4 (`.daynav` + `.log-graph-card` `touch-action: pan-y`, removed `touch-action: pan-y` from `.log-scroll`, `.totals-compare-list` / `.totals-compare-row`)
- `web/test/dom/logpatch.mjs` & `web/test/dom/layout.mjs` — F6 fail-before/pass-after pins (DOM + real Chromium)

---

## 3. New Pins & Fail-Before / Pass-After Results (F6)

### DOM suite: `web/test/dom/logpatch.mjs` (wired into `npm run dom`)
Fail-before was verified read-only by bundling `work-logpatch2/web/test/dom/logpatch.mjs` against `~/hos-build/work-logpatch` (without touching `work-logpatch`), resulting in **0 passed, 5 failed**. Pass-after was verified on `work-logpatch2` in both `America/Chicago` and `UTC`, resulting in **5 passed, 0 failed**.

| Pin | Failure Class Covered | Fail-before (`work-logpatch`) | Pass-after (`work-logpatch2`, CT & UTC) |
|---|---|---|---|
| **LP1** | **F1 + Log-vs-Now parity (what-if rows present):** Thu 12:00 with stale what-if OFF 07:00–09:00 driven through; ELD 7:00. Pure store + Now Refresh + Log "Compare today" all agree `sync` (7:00 left), no fill offered on either surface, log unchanged. | **FAIL** — `today-scoped driftCheck diverged from Now (read what-if row?): {"appLeft":540,"eldLeft":420,"gap":-120,"verdict":"missing"}` | **PASS** |
| **LP2** | **F2(a) + Log-vs-Now parity (overnight/midnight-crossing):** 10h OFF ending Wed 20:00, drives Wed 20:00–24:00 + Thu 00:00–03:00, gap Thu 04:00–04:30, now Thu 05:00; ELD 4:00. Pure store + Now Refresh + Log "Compare today" all agree `sync` (4:00 left), no phantom fill. | **FAIL** — `today-scoped overnight driftCheck clipped prior day history: {"appLeft":480,"eldLeft":240,"gap":-240,"verdict":"missing"}` | **PASS** |
| **LP3** | **F2(b) + F3 + F5 (past-day rest ≥10h OFF + totals-only + guide copy + no apply + `lastEldCheckAt` untouched):** Wed has 3h D, 1h30m ON, 19h30m OFF (≥10h) + what-if Wed D. Opens `totals` mode; guide uses `"we'll compare the day's totals"` (never `"not Daily Log"`); OCRs Driving 6:00 / On Duty Not Driving 1:30 / Off Duty 16:30; mismatch shows side-by-side diff (never fresh 11:00, zero apply controls); matching totals (3:00 / 1:30) report `You're in sync`; `lastEldCheckAt` stays untouched at prior value. | **FAIL** — `past-day DriftSheet did not open in totals mode [data-drift-mode="totals"]` | **PASS** |
| **LP4** | **Today (`back===0`) clocks flow + day fence + clocks guide copy + Now Refresh + storage keys:** Today opens `clocks` mode with clocks guide framing, stamps `lastEldCheckAt`, applies driver-chosen fill strictly inside Today (never spills backward into Wed's 2h gap when Today is full); Now Refresh stays unscoped; `localStorage` holds only the 4 allowed keys. | **FAIL** — `Today compare did not open in clocks mode` | **PASS** |
| **LP5** | **F4 (disambiguated Log swipe + all guards):** `.log-scroll` does not hijack horizontal swipes (preserving `Log → Now` strip paging); `.daynav` and `.log-graph-card` cycle days with all guards intact (left at `back===0`, vertical-dominant, 220ms `logSwap` lock, `canBack` boundary, `DriftSheet` open, mid-edit `EditorSheet` open, reduced-motion immediate consecutive swipes, Previous/Next arrows). | **FAIL** — `.log-scroll still carries data-log-swipe-zone="rows" (blocks Log -> Now strip paging)` | **PASS** |

### Real-browser Chromium CDP touch pins: `web/test/dom/layout.mjs:289-330`
Verified at **both** `412×915` and `360×640`:
- `logpatch2 F4: rightward swipe on Log graph card cycles to previous day and stays on Log` (0 strip haptic ticks) — **PASS (412×915 & 360×640)**
- `logpatch2 F4: leftward swipe on Log daynav returns to Today and stays on Log` (0 strip haptic ticks) — **PASS (412×915 & 360×640)**
- `a swipe starting on a Log entry (button) pages log → now` + `…and its settle gives exactly one haptic click` (restored from `.log-foot` back to `button.entry`; failed on `work-logpatch` because `.log-scroll` hijacked horizontal swipes) — **PASS (412×915 & 360×640)**
- `swiping left past Log stays on Log (Settings is not a swipe destination)` — **PASS (412×915 & 360×640)**
- `a vertical drag on Log content scrolls the page and leaves the strip on Log` — **PASS (412×915 & 360×640)**

---

## 4. Full Sequential Foreground Suite Results (Post-Final-Edit)

All suites were executed sequentially in the foreground after the final source edit:

| # | Suite | Command | Result |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `node build.mjs`) | **PASS** — `web/dist/app.js`: **740,768 B** (723.4 KB) |
| 2 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** — `typecheck` OK, `contrast` 44/44×3, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` OK, and all **19** DOM suites PASS (`drivers` 19/19, `drivers-relaunch` 14/14, `logpatch` 5/5) |
| 3 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** — full green pass across `typecheck`, `contrast`, `nightlight`, `ocr-bundle`, `smoke.mjs`, and all **19** DOM suites (`drivers` 19/19, `drivers-relaunch` 14/14, `logpatch` 5/5) |
| 4 | **revisions** | `esbuild test/dom/revisions.mjs ... && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 5 | **gemini** | `esbuild test/dom/gemini.mjs ... && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 6 | **auditfix** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`) |
| 7 | **polish** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run polish` | **295 pass, 0 fail** (`POLISH OK`) |
| 8 | **layout** | `TZ=UTC HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run layout` | **425 pass, 0 fail** (`LAYOUT OK`) — *note: run in `TZ=UTC` (08:03 UTC) because local time was 02:03 CT inside the pre-existing 00:00–03:00 CT `motionSeed()` window documented in `HANDOFF-LOGPATCH.md`* |

---

## 5. Invariants & Bundle Verification

- **`engine/` byte-identical:**
  ```
  find engine -type f -not -path '*/node_modules*' -not -path '*/dist*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` exactly.
- **`web/dist/app.js` byte size:** **740,768 B** (`ls -la web/dist/app.js` mtime `01:41`, strictly newer than all edited sources `01:35`–`01:37`).
- **localStorage keys unchanged:** Strictly `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, `hos-sandbox-undo-v1`; zero new `State` fields or persisted keys (pinned in LP4, `drivers`, and `drivers-relaunch`).
- **Compare-and-choose only:** No auto-overwrite anywhere; past-day totals compare offers zero write/apply controls; Today clocks compare writes only on explicit driver tap through `undoable(...)`.
- **`receptionfix2` B1 reseed guard & stay-unlocked intact:** Verified by `drivers` (19/19, including DR12–DR19) and `drivers-relaunch` (14/14, including DRR7–DRR14).
- **No new network calls:** Zero `fetch(` calls in `store.ts`, `app.tsx`, `eldocr.ts`, or `eldguides-ui.tsx`; all OCR, ELD guides, comparisons, and swipe handling run 100% offline.
