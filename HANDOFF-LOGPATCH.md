# Handoff — Clock 14 `logpatch` (`work-logpatch`)

**Tree:** `~/hos-build/work-logpatch` (copied from `work-eldpatch`, live `eldpatch` build / `main af8a88d`)  
**Scope:** Two owner-decided Log-screen items — (1) per-day ELD screenshot compare from `LogTab` reusing `DriftSheet` in screenshot mode and the existing `EldGuideFlow` help, and (2) horizontal swipe to cycle days on the Log day view (grid + rows area).  
**Status:** Built (`web/dist/app.js` **729,836 B** vs `eldpatch` baseline **726,220 B**, **+3,616 B / +3.5 KB**), `engine/` verified byte-identical, all new pins fail-before / pass-after, and all foreground test suites green (with one pre-existing 00:00–03:00 CT midnight-window fixture bug in `layout.mjs:1885` documented transparently below — 425/425 green in `TZ=UTC`). **Not pushed, not deployed.**

---

## 1. Hard Invariants Verified

- **`engine/` byte-identical:**
  ```
  find engine -type f -not -path '*/node_modules/*' -not -path '*/dist/*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` byte-for-byte.
- **localStorage keys unchanged:** Strictly `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, `hos-sandbox-undo-v1` (verified in `LP3` and `drivers` / `drivers-relaunch`).
- **Zero new persisted state:** No new fields added to `State` or any storage envelope. Target-day scoping lives only in transient `SheetKind` state; swipe state lives only in local refs inside `LogTab`.
- **Zero new network calls:** All OCR, ELD help guides, comparison, and swipe logic run 100% offline/on-device.
- **Shared `ClockPick` untouched:** No new time-of-day inputs introduced.
- **Copy check:** Zero references to the owner's name or employer anywhere in new app copy.
- **Files touched (7 files — 6 modified, 1 added):**
  - Modified: `web/src/store.ts`, `web/src/app.tsx`, `web/src/eldguides-ui.tsx`, `web/public/styles.css`, `web/package.json`, `web/test/dom/layout.mjs`
  - Added: `web/test/dom/logpatch.mjs`

---

## 2. Per-Item Summary (`file:line` anchors)

### Item 1 — Per-day ELD screenshot compare from the Log screen

#### How `DriftSheet` and the drift pipeline were extended (reused, not forked)
- **Day-scoped comparison & fill fencing (`web/src/store.ts:2759-2890`):**
  - Exported `DriftDayWindow { start: number; end: number }` (`store.ts:2759`) and internal `clipSegmentsToDay(segs, start, end)` (`store.ts:2762-2770`).
  - Extended `driftCheck(s, eldLeftMin, now, day?: DriftDayWindow)` (`store.ts:2809-2822`):
    - When `day` is omitted (Now screen flow): executes the **exact existing** `evaluate(loggedSegments(s, now), { asOf: now, config: s.config })` path untouched.
    - When `day` is provided (Log per-day compare): clips `allSegments(s, now)` (segments + tentative + live materialized up to `now`) to `[day.start, Math.min(day.end, now)]` and evaluates at `asOf = Math.min(day.end, now)`.
  - Extended `planDriftFill(s, minutes, now, day?: DriftDayWindow)` (`store.ts:2846-2890`):
    - When `day` is omitted: executes the exact existing unscoped path untouched.
    - When `day` is provided: collects unlogged stretches strictly inside `[day.start, Math.min(day.end, now)]` from the viewed day's clipped rows, refuses if none exist (returning `null`), and enforces the hard fence `start >= dayStart && end <= dayEnd` so a fill can never spill into another day.
- **Apply path double-fence (`web/src/app.tsx:4019-4027`):**
  - Extended `addDriftFill(eldLeftMin, now, day?: DriftDayWindow)` with optional `day`. Passes `day` to `driftCheck` and `planDriftFill`, double-checks `plan.start >= day.start && plan.end <= Math.min(day.end, now)`, writes the single driver-chosen `DRIFT_NOTE` row through the existing `undoable(...)` path, and stamps `lastEldCheckAt: now` (unchanged semantics).
- **Single reused `DriftSheet` (`web/src/app.tsx:781-795, 3351-3565, 13476`):**
  - Added `DriftTargetDay { start: number; end: number; label: string; back: number }` (`app.tsx:781-786`) and optional `day?: DriftTargetDay` to `SheetKind` `{ kind: 'drift'; mode?: 'screenshot'; day?: DriftTargetDay }` (`app.tsx:795`), wired in `renderDisplayedSheet` (`app.tsx:13476`).
  - When `day` is omitted (Now Refresh & Now Shift actions): renders and calls `driftCheck(getState(), eld, now)`, `planDriftFill(getState(), -check.gap, at)`, and `addDriftFill(eld, at)` byte-for-byte identically to before (preserving `smoke.mjs` patch 9 source regex and `DR15` / `DR18`).
  - When `day` is provided:
    - Renders an explicit day banner (`data-drift-day-banner="1"`, `.drift-day-banner`) reading **"Comparing Tue, Nov 24"** (or **"Comparing Today, Thu, Nov 26"**) across every view of the sheet (input, sync, extra, missing, filled, fresh guard).
    - Adds `data-drift-day-start`, `data-drift-day-end`, `data-drift-day-label` attributes on the sheet container.
    - Never auto-overwrites: Compare stamps `lastEldCheckAt` and shows the verdict while leaving `segments`/`tentative`/`current` byte-unchanged; the log mutates only if the driver explicitly taps **"Add the missing driving"**.
    - When `plan` is null on a full day, tells the driver plainly: `"There's no unlogged stretch on <day> to put it in — add the driving on the Log tab instead."` and offers no fill button.
    - Reuses `<EldGuideFlow onDone={() => setEldHelp(false)} targetDayLabel={day ? day.label : undefined} />` (`web/src/app.tsx:3370`, `web/src/eldguides-ui.tsx:15, 55, 75-77`) so drivers get the exact per-ELD `switchDay` guidance for all 36 ELD entries to navigate their ELD to the matching day before screenshotting — zero date-verification invention, one day at a time.
- **`LogTab` entry point (`web/src/app.tsx:4316-4328`, `web/public/styles.css:3563-3573`):**
  - Added `<button class="plan-item eld-shot-cta log-compare-cta" data-log-eld-compare="1">` inside `.log-scroll` directly beneath the Entries card (so on compact 360×640 screens the day's rows still appear immediately below the pinned graph without pushing the first row off-screen).
  - Copy matches the app's trucker voice: **"Compare today with my ELD"** / **"Compare Wed, Nov 25 with my ELD"** with plain subtitle **"Check an ELD screenshot — you pick any change."**
  - Opens `openMorphSheet({ kind: 'drift', mode: 'screenshot', day: { start: day.start, end: day.end, label: dayName, back } }, e.currentTarget)`.

### Item 2 — Swipe to cycle days on the Log screen

- **Pure gesture classifier & control guard (`web/src/app.tsx:4072-4104`):**
  - Exported `LOG_SWIPE_MIN_X = 56`, `LOG_SWIPE_RATIO = 1.5`, and `classifyLogDaySwipe(dx, dy, { back, canBack, blocked, swapping })`:
    - Swipe right (`dx > 0`) → `+1` (`back + 1`, previous day), gated by the exact same `canBack` rule as the Previous arrow.
    - Swipe left (`dx < 0`) → `-1` (`back - 1`, next day), no-op at `back === 0` (same as the disabled Next arrow).
    - Requires `|dx| >= 56` and `|dx| >= effDy * 1.5` (where `effDy = max(|final dy|, max |dy| seen during touchmove)` so a vertical scroll that curves back can never mis-fire).
    - Returns `0` when `blocked` or `swapping`.
  - `isLogSwipeControlTarget` walks `parentNode` (compatible with both real DOM and `domshim`) to ignore touches starting inside `input`, `select`, `textarea`, or `[data-no-log-swipe="1"]`.
- **Day-view container attachment & guards (`web/src/app.tsx:4113-4195, 4255, 4264`):**
  - Attached shared `daySwipeProps` (`onTouchStart`, `onTouchMove`, `onTouchEnd`, `onTouchCancel`, `onClickCapture`) to BOTH day-view containers — NOT to individual rows:
    - `<section class="card log-graph-card" data-log-swipe-zone="grid" {...daySwipeProps}>` (`app.tsx:4255`)
    - `<div class="log-scroll" ref={scrollRef} data-log-swipe-zone="rows" {...daySwipeProps}>` (`app.tsx:4264`)
  - Preserves `.page.page-log > .log-pin / .log-scroll / .log-foot` direct-child structure and `.log-pin > .daynav` first-child invariants.
  - `.daynav` Previous/Next arrows remain completely unchanged (`app.tsx:4250-4253`).
  - Guards active on start, move, and end:
    - Sheet/modal open or closing morph over Log (`currentSheet() !== null || openEditSheet !== null || !getState().disclaimerAcked || activeMorphOrigin !== null`).
    - Multi-touch (`e.touches.length !== 1`) cancels gesture.
    - Mid day-swap animation: blocks while `!prefersReducedMotion() && activeLogSwapRef.current > 0` (the existing 220ms `logSwap` machinery). When `prefersReducedMotion()` is active, `activeLogSwapRef.current` stays `0`, matching the existing instant day swap.
    - Click suppression (`e.preventDefault()` on committed `touchend` + 350ms `onClickCapture` guard) prevents a horizontal swipe over a `<button class="entry">` from accidentally opening the row editor.
- **Touch-action CSS (`web/public/styles.css:1242, 1251`):**
  - Added `touch-action: pan-y;` to `.page.page-log > .log-pin > .log-graph-card` and `.page.page-log > .log-scroll` so Chromium/Safari keep native vertical scrolling smooth while delivering horizontal drags on the Log grid and list to the day-swipe handler instead of pulling the 3-panel `main.pages` strip away to Now. `overscroll-behavior-x: auto; overscroll-behavior-y: none;` stays untouched.

---

## 3. New Pins & Fail-Before / Pass-After Results

### New DOM suite: `web/test/dom/logpatch.mjs` (wired into `npm run dom` in `web/package.json:11`)

| Pin | What it proves | Fail-before | Pass-after (`America/Chicago` & `UTC`) |
|---|---|---|---|
| **LP1** | Item 1a + 1b: On a populated 2-day log (Wed 6h drive / 5:00 left / 2h gap; Thu 2h drive / 9:00 left / 1h gap), Log compare CTA names `Wed, Nov 25`, opens `DriftSheet` in screenshot mode with `"Comparing Wed, Nov 25"` banner, opens `EldGuideFlow` with `switchDay` guidance, OCRs `Drive 4:00`, leaves log **byte-unchanged** after Compare while stamping `lastEldCheckAt`, reports 1h missing (not Today's 5h), and after explicit driver tap lands the 60m `Drift check` row **only** inside Wed `11:00–12:00` leaving Today untouched; Today compare against `9:00` reports `You're in sync`. | **FAIL** (`missing Log per-day compare CTA`) | **PASS** |
| **LP2** | Item 1c: When Wed is 100% covered (zero gaps) while Today has a 2h gap, `planDriftFill`, `addDriftFill`, and `DriftSheet` UI offer/apply **nothing** (never spill into Today's gap); when Wed has only a 30m gap and 60m is missing, fill caps at 30m strictly inside `[day1.start, day1.end]`. | **FAIL** (`planDriftFill spilled outside full day1`) | **PASS** |
| **LP3** | Regression fence: Now Refresh CTA opens unscoped `DriftSheet` (no `data-drift-day-banner`), and `localStorage` contains only the 4 allowed keys. | **PASS** (regression fence) | **PASS** |
| **LP4** | Item 2: On a 3-day log, swipe left at `back===0` is no-op; vertical-dominant swipes on rows and grid are no-ops; swipe right on rows → Yesterday; immediate swipe mid-220ms `logSwap` is blocked; swipe right on grid → 2 days ago; swipe right beyond `canBack` is no-op; swipe while sheet is open is blocked; swipe left on grid returns; under `prefers-reduced-motion: reduce`, consecutive swipes fire immediately without 220ms lock; Previous/Next arrows still work. | **FAIL** (`missing swipe containers: grid=false rows=false`) | **PASS** |

### Real-browser Chromium touch-swipe pins: `web/test/dom/layout.mjs:289-330`
Added two real-browser CDP `Input.dispatchTouchEvent` pins at both **412×915** and **360×640**:
- `logpatch Item 2: rightward swipe on Log rows cycles to previous day and stays on Log` (0 strip-lock haptic ticks) — **PASS (412×915 & 360×640)**
- `logpatch Item 2: leftward swipe on Log graph card returns to Today and stays on Log` (0 strip-lock haptic ticks) — **PASS (412×915 & 360×640)**
- Re-aimed strip-paging leg 2 (`log → now`) from `button.entry` to `.log-foot button.addbtn` (see Flagged Item #2 below) — **PASS (412×915 & 360×640, 1 haptic tick)**.

---

## 4. Full Foreground Suite Results (Sequential, Post-Final-Edit)

| # | Suite | Command | Result |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js`: **729,836 B** / 712.7 KB; baseline `eldpatch`: 726,220 B; **+3,616 B**) |
| 2 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** — `typecheck` OK, `contrast` 44/44×3, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` OK, and all **19** DOM suites PASS (`yesback` 6/6, `c1flush` OK, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16, `rescue` 11/11, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, **`myweek` 20/20**, **`drivers` 19/19**, **`drivers-relaunch` 14/14**, **`logpatch` 4/4**) |
| 3 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** — identical full green pass across `typecheck`, `contrast`, `nightlight`, `ocr-bundle`, `smoke.mjs`, and all 19 DOM suites (`myweek` 20/20, `drivers` 19/19, `drivers-relaunch` 14/14, `logpatch` 4/4) |
| 4 | **revisions** | `npx esbuild test/dom/revisions.mjs --bundle --platform=node ... && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 5 | **gemini** | `npx esbuild test/dom/gemini.mjs --bundle --platform=node ... && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 6 | **auditfix** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`) |
| 7 | **polish** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run polish` | **295 pass, 0 fail** (`POLISH OK`) — *note below on 00:25 CT run* |
| 8 | **layout** | `TZ=UTC HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run layout` | **425 pass, 0 fail** (`LAYOUT OK`) — *note below on 00:28 CT midnight window* |

### Transparent Failure / Reproduction Notes (Midnight-Window Pre-Existing Fixtures)
1. **`polish.mjs` (`00:25 AM CT` run vs `00:39 AM CT` re-run):**
   - Initial run at `00:25 AM CT` reported `294 pass, 1 fail`: `EDIT-FIX: the edit end step carries ONE picker-only clock at the 56 floor — end question false, clockPick []`.
   - Root cause: pre-existing fixture in `web/test/dom/polish.mjs:41` places all 3 closed segments ending at `N - 30` (30 minutes before `Date.now()`). Between `00:00` and `00:30` local time, `N - 30` falls on **yesterday** (`23:55`), leaving zero closed `button.entry:not(.live)` rows on Today (`back === 0`) for `sweep('log-edit-long')`.
   - Re-run after `00:30 AM CT` (`00:39 AM CT`, `TZ=America/Chicago`): **295 pass, 0 fail (`POLISH OK`)**. Left `polish.mjs` unmodified (out of scope).
2. **`layout.mjs` (`00:28 AM CT` `America/Chicago` run vs `TZ=UTC` run):**
   - Run under `TZ=America/Chicago` at `00:28 AM CT` timed out in section `(m)` at `web/test/dom/layout.mjs:1931`: `waiting for locator('section.page-log.is-active button.entry:not(.live)') to be visible`.
   - Root cause: pre-existing fixture `motionSeed()` in `web/test/dom/layout.mjs:1885-1894` places all 12 closed segments from `nowMinute - 600` to `nowMinute - 180` (ending **3 hours before** `Date.now()`). Between `00:00` and `03:00` local time, every closed segment sits on **yesterday**, leaving zero `button.entry:not(.live)` rows on Today.
   - Run under `TZ=UTC` (`06:35 UTC`, outside the 00:00–03:00 window): **425 pass, 0 fail (`LAYOUT OK`)** — every single pin across 412×915 and 360×640 passed, including all new Item 2 real-browser touch-swipe pins. Left `motionSeed()` unmodified (out of scope) and flagged here for visibility.

---

## 5. Flagged Items / Open Decisions for Ada & Owner

1. **`lastEldCheckAt` stamping on past-day compares (kept current behavior per brief):**
   - Per instructions, `DriftSheet` continues to stamp `setState({ lastEldCheckAt: now })` on Compare and inside `addDriftFill`, identically for today and past days, with zero new bookkeeping fields.
   - **Flag for owner:** Comparing a past day (e.g., `Tue, Nov 24`) currently updates `lastEldCheckAt` to `now` — the same timestamp used as the "last checked against ELD" marker for live clocks. If the owner wants `lastEldCheckAt` to reflect only current-day checks (`!day || day.back === 0`), that's a 1-line guard in `DriftSheet.compare` and `addDriftFill`. Kept unchanged pending owner decision.
2. **Horizontal swipe on Log day-view vs 3-panel strip paging (`Log → Now`):**
   - On a real touch browser, `main.pages` is a `scroll-snap-type: x mandatory` horizontal strip (`Plan — Now — Log`). A rightward drag on Log's `button.entry` previously paged the strip `Log → Now`, which physically collides with Item 2's rightward swipe to cycle to the previous day (`back + 1`) on the Log grid and rows area.
   - With `touch-action: pan-y` on `.log-graph-card` and `.log-scroll`, horizontal swipes on the graph and rows area cleanly cycle days without kicking the driver onto `Now`. Swiping right on `.log-foot` (or `.daynav`) and tapping the `Now` tab in the bottom bar still navigate `Log → Now`. `layout.mjs` leg 2 was re-aimed accordingly (`layout.mjs:290-303`) with explicit new real-browser pins verifying both day-cycling and `Log → Now` strip paging.
3. **Past-day shift reset at end of carrier day (edge case note):**
   - Day-scoped `driftCheck` clips the viewed carrier day's rows (`allSegments(s, now)` clipped to `[day.start, Math.min(day.end, now)]`) and evaluates via the untouched `engine/` at `asOf = Math.min(day.end, now)`. If a past carrier day ends with a logged `OFF`/`SB` block of `>= 10h` running straight into `day.end`, `evaluate()` naturally reports a fresh 11h driving clock at `day.end` (matching FMCSA rules at midnight); if the driver finished active duty later in the day (< 10h rest before `day.end`) or has unlogged trailing time, `evaluate()` reports `11h - driveUsed` for that shift.
4. **360×640 CTA placement:**
   - Initially placing `.log-compare-cta` above the Entries card pushed the first `button.entry` below the visible fold on compact 360×640 viewports (caught by `layout.mjs` at 360×640). Moving `.log-compare-cta` directly beneath the Entries card inside `.log-scroll` preserved full 64px button ergonomics while keeping the day's rows immediately visible below the pinned graph on all screen sizes.
