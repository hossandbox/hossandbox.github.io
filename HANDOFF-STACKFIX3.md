# HANDOFF — Stack My Stops & Loads Fix Round 3 (`work-stackfix3`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-stackfix3` (copied from `/home/lae/hos-build/work-stackfix2`; earlier trees untouched)
- **Review addressed:** `/home/lae/hos-build/REVIEW-STACKFIX2.md` (Opus quick re-check of fix round 2 — Verdict: `FIX-FIRST`, findings **R1**, **R2**, optional **R3**; N2/N3/N4 remained closed)

---

## 1. Hard Invariants Confirmation

| # | Invariant | Verification | Result |
| :--- | :--- | :--- | :--- |
| 1 | `web/src/store.ts` byte-identical (`1323046db6ba07b8c85805f89a103dc16f3776b5`) | `git hash-object /home/lae/hos-build/work-stackfix3/web/src/store.ts` | **PASS** — `1323046db6ba07b8c85805f89a103dc16f3776b5` |
| 2 | `engine/` untouched vs `work-stackfix2` | `diff -qr ~/hos-build/work-stackfix2/engine ~/hos-build/work-stackfix3/engine` | **PASS** — empty diff (0 files changed) |
| 3 | All Stack time-of-day entry stays on shared `ClockPick`; zero `<input type="time">` in Stack | `SK8`, code inspection | **PASS** — per-stop appointment and "Start chain at" remain on `StackTimeSheet` → `ClockPick`; zero `<input type="time">` in Stack |
| 4 | State only what the calculation showed | `SK6`, `SK9`, `SK12`, `SK13`, `SK14` | **PASS** — any positive intermediate early-arrival wait absorbs all prior 30-min break delay so `BREAK_30` / `395.3(a)(3)(ii)` is never claimed when the break did not cause the miss |

---

## 2. Per-Item Disposition (R1, R2, R3)

All changes live strictly in the app layer (`web/src/stack.ts`, `web/src/app.tsx`) and `web/test/dom/stack.mjs` with zero changes to `engine/` or `web/src/store.ts`.

### R1 (MEDIUM) — Early-wait absorption in `effectiveBreak30ForStop` (`web/src/stack.ts`) — **FIXED**
- **Root cause:** `earlyWaitMinutes` is measured in the legal schedule that already includes the 30-minute break. If an intermediate stop `i < targetIdx` has any `earlyWaitMinutes > 0`, the truck reached stop `i` early even with the break; without the break it would have arrived earlier and waited longer, still departing at `appt + dwell`. Subtracting `earlyWaitMinutes` from accumulated break minutes left phantom unabsorbed break delay.
- **Fix:** In `effectiveBreak30ForStop` (`web/src/stack.ts`), deleted the subtraction branch and collapsed the `i < targetIdx` check to:
  ```ts
  if (i < targetIdx && stop.earlyWaitMinutes > 0) {
    minutes = 0;
    rests = [];
  }
  ```
- **Proving pin:** New pin **`SK14`** in `web/test/dom/stack.mjs`:
  - **Opus fixture:** fresh driver Wed 06:00 CT @ 55 mph; Stop B `470 mi`, appt `Wed 15:13`, `30m ON` dwell; Stop C `55 mi`, appt `Wed 16:35`, `0m` dwell. Legal pass inserts mandatory 30-min break `Wed 14:00 → 14:30` on B's leg, B arrives `15:03`, waits `10m`, departs `15:43`, C arrives `16:43` (`8m` late) — identical to the no-break schedule. Asserts `limitingClock === 'TIME_ONLY'`, `limitingClockLabel === 'drive + dock time'`, `limitingCite === null`, `pushRescue.kind === 'reschedule'`, `Cannot run C as stacked — drive + dock time.`, and zero occurrences of `395.3(a)(3)(ii)`, `CFR`, `395.`, `§`, or `30-minute break` in verdict headline/subline, push card title/restSummary, or dispatch text.
  - **1m-wait / 2m-miss variant:** B appt `Wed 15:04` (`1m` wait, departs `15:34`), C appt `Wed 16:32` (arrives `16:34`, `2m` late) — also asserts `TIME_ONLY`, `limitingCite === null`, and zero `395.3(a)(3)(ii)` copy.
- **Fail-before / pass-after evidence (Opus fixture):**
  - **Fail-before (`work-stackfix2` unmodified):**
    ```json
    {
      "status": "breaks_stop",
      "limitingClock": "BREAK_30",
      "limitingCite": "49 CFR 395.3(a)(3)(ii)",
      "headline": "BREAKS AT C — arrives Wed 16:43 (8m late for Wed 16:35) · 30-minute break.",
      "bRests": [["break30", "Wed 14:00", "Wed 14:30"]],
      "bArr": "Wed 15:03",
      "bWait": 10,
      "bDep": "Wed 15:43",
      "cArr": "Wed 16:43",
      "cSlack": -8,
      "restSummary": "30-minute break (8h driving rule) (Wed 14:00 → Wed 14:30, 30m)",
      "dispatch": "Cannot run C as stacked — 30-minute break (49 CFR 395.3(a)(3)(ii)).\nB: ETA Wed 15:03, PTA Wed 15:43 (appt Wed 15:13 — 10m early)\nC: ETA Wed 16:43 (misses Wed 16:35 appt by 8m)\nPlanning estimate — my ELD governs."
    }
    ```
  - **Pass-after (`work-stackfix3`):**
    ```json
    {
      "status": "breaks_stop",
      "limitingClock": "TIME_ONLY",
      "limitingCite": null,
      "headline": "BREAKS AT C — arrives Wed 16:43 (8m late for Wed 16:35) · drive + dock time.",
      "bRests": [["break30", "Wed 14:00", "Wed 14:30"]],
      "bArr": "Wed 15:03",
      "bWait": 10,
      "bDep": "Wed 15:43",
      "cArr": "Wed 16:43",
      "cSlack": -8,
      "restSummary": "Earliest legal schedule reaches C at Wed 16:43 (drive + dock time)",
      "dispatch": "Cannot run C as stacked — drive + dock time.\nB: ETA Wed 15:03, PTA Wed 15:43 (appt Wed 15:13 — 10m early)\nC: ETA Wed 16:43 (misses Wed 16:35 appt by 8m)\nPlanning estimate — my ELD governs."
    }
    ```
- **`SK13` regression check:** **`SK13` passes completely unchanged** — both of its fixtures (primary and absorbed-overnight) have zero intermediate early-arrival waits between the 30-minute break on C's leg and the late stop D.

### R2 (LOW) — 72h departure cap agreement between draft and picker (`web/src/app.tsx`) — **FIXED**
- **Root cause:** `sanitizeStackDraft` dropped `departureMinute > now + STACK_MAX_DEPARTURE_FUTURE_MIN` (72h), while `StackTab`'s "Start chain at" `ClockPick` `onApply` accepted any future minute uncapped, letting a driver pin a start 4 days out, see verdicts for it, and silently revert to "Now" upon leaving and re-entering the Stack tab.
- **Fix:**
  - Imported `STACK_MAX_DEPARTURE_FUTURE_MIN` into `web/src/app.tsx`.
  - In `StackTab`'s "Start chain at" `onApply`, clamped `m > now + STACK_MAX_DEPARTURE_FUTURE_MIN` to `now + STACK_MAX_DEPARTURE_FUTURE_MIN` and tracked `depClamped` (cleared on non-clamped picks, "Start now", and "Reset to 2 stops").
  - Made the clamp visibly explicit in both places:
    - Inside `StackTimeSheet` (when `mode === 'departure'`): subtitle notes `Up to 72 hours ahead.`; when the selected time exceeds `now + 72h`, renders a cap hint (`Capped at 72h ahead (<clamped>).`) and displays the clamped time on the Apply button (`Apply · <clamped> (72h max)`).
    - On the `StackTab` "Chain starts" button (`data-stack-dep-btn="1"`): stores `data-stack-dep-min` as the clamped minute, displays the clamped time (`fmtStackFull(departure, sim.homeTimeZone)`), shows `Capped at 72h ahead` when clamped, and feeds the clamped departure to `evaluateStackChain` and `saveStackDraft` — never displaying a time that will not be kept.
- **Proving pin:** Extended **`SK11`** in `web/test/dom/stack.mjs` to drive a real `ClockPick` selection 4 days + 4h out (`Sun Nov 15 10:00` from `now = Wed Nov 11 06:00`), asserting:
  - In-sheet hint (`data-stack-dep-cap-hint="1"`) and Apply button show the clamped time `Sat Nov 14, 06:00` (not `Sun Nov 15` / `10:00`).
  - After Apply, `data-stack-dep-min === NOW_06 + STACK_MAX_DEPARTURE_FUTURE_MIN`, the button displays `Sat Nov 14, 06:00` and `Capped at 72h ahead`, and the verdict displays `Starting Sat 06:00`.
  - `loadStackDraft(55, 'America/Chicago', NOW_06).departureMinute` equals the clamped minute unchanged.
  - Leaving the Stack tab (Back) and re-entering it from the Plan hub preserves `data-stack-dep-min === NOW_06 + STACK_MAX_DEPARTURE_FUTURE_MIN` and `Sat Nov 14, 06:00` unchanged (never reverting to `Now`).

### R3 (NIT, optional) — SK6 no-legal fixture (`untilDepartureStatus: 'D'`) — **LEFT AS IS**
- **Investigation:** Checked every path in `engine/src/trip.ts`, `engine/src/shift.ts`, `engine/src/cycle.ts`, and `runPlanTripChain` (`web/src/stack.ts`) that can produce `pushRescue === null` (both `reset10Pass.hosLegal === false` and `restart34Pass.hosLegal === false`):
  1. All four engine violation types (`DRIVE_11`, `WINDOW_14`, `BREAK_30`, `CYCLE`) are emitted exclusively on `status === 'D'` segments. UI-reachable `untilDepartureStatus` (`ON`/`OFF`/`SB`), `dwellStatus` (`ON`/`OFF`/`SB`), and early waits (`OFF`) never emit `D` segments.
  2. Every `D` segment in `runPlanTripChain` is generated by `planTrip()`, which checks `ev.driveNow` before every driving step and inserts a legal rest whenever `ev.driveNow <= 0`, so `planTrip()` never produces a driving violation.
  3. `planTrip()` only returns `feasible: false` on a valid leg if it hits the 200-iteration guard (`guard >= 200`), which is unreachable under Stack UI bounds (`STACK_MAX_MILES = 3000`, `STACK_MIN_MPH = 45` → max `66h 40m` driving per leg, ~25 loop iterations).
- **Disposition:** No normal UI-reachable input combination can produce a genuine `pushRescue === null` chain. Per the brief, **`SK6` was left unchanged** rather than forced.

---

## 3. Exact Diff Scope vs `work-stackfix2`

Only 3 tracked files changed (excluding build artifacts `web/dist-test/` and this handoff):

| File | Diff (`+added / -removed`) | Summary |
| :--- | :--- | :--- |
| `web/src/stack.ts` | `+8 / -12` | R1: in `effectiveBreak30ForStop`, reset `minutes = 0; rests = []` on any `earlyWaitMinutes > 0` at `i < targetIdx` and delete the `minutes - stop.earlyWaitMinutes` subtraction |
| `web/src/app.tsx` | `+34 / -8` | R2: import `STACK_MAX_DEPARTURE_FUTURE_MIN`; clamp Stack departure in `onApply` to `now + STACK_MAX_DEPARTURE_FUTURE_MIN` and show the clamped time + 72h cap indicator in `StackTimeSheet` and `StackTab` |
| `web/test/dom/stack.mjs` | `+126 / -1` | New `SK14` (R1 Opus fixture + 1m-wait/2m-miss variant); extended `SK11` (R2 picker clamp beyond 72h + visible clamped UI + draft save/load & tab re-entry round-trip) — 14 → 15 pins |
| `HANDOFF-STACKFIX3.md` | New | This fix-round-3 handoff |

Zero changes in `engine/`, `web/src/store.ts`, `web/public/styles.css`, `web/package.json`, or any other file.

---

## 4. Verification Results (`TZ=America/Chicago`, Sequential Foreground, Post-Final-Edit)

Single sequential run: `cd ~/hos-build/work-stackfix3/web && TZ=America/Chicago npm run smoke` (which executes `typecheck`, `contrast`, `nightlight`, `ocr-bundle`, `smoke.mjs`, and `npm run dom` in sequence).

| Suite / Check | Result & Counts |
| :--- | :--- |
| `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) | **PASS** — 0 errors |
| `test/contrast.mjs` | **PASS** — **44/44** day, **44/44** night |
| `test/nightlight.mjs` | **PASS** — `nightlight: OK` |
| `test/ocr-bundle.mjs` | **PASS** — pass 1 & pass 2 OK |
| `test/smoke.mjs` | **PASS** — `OK` |
| `dom/yesback.mjs` | **PASS** — **6/6** pass, 0 fail |
| `dom/c1flush.mjs` | **PASS** — `C1FLUSH OK` |
| `dom/adjuststart.mjs` | **PASS** — **39/39** pass, 0 fail (`ADJUSTSTART OK`) |
| `dom/scrub.mjs` | **PASS** — **30/30** pass, 0 fail (`C2SCRUB OK`) |
| `dom/c3.mjs` | **PASS** — **46/46** pass, 0 fail (`C3 OK`) |
| `dom/c3relaunch.mjs` | **PASS** — **3/3** pass, 0 fail (`C3 RELAUNCH OK`) |
| `dom/logedit.mjs` | **PASS** — **37/37** pass, 0 fail (`LOGEDIT OK`) |
| `dom/cascade.mjs` | **PASS** — **16/16** pass, 0 fail (`CASCADE OK`) |
| `dom/rescue.mjs` | **PASS** — **11/11** pins pass |
| `dom/stack.mjs` | **PASS** — **15/15** stack pins passed (up from 14/14; `SK13` untouched, `SK14` added, `SK11` extended) |
| `web/src/store.ts` hash | **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (exact match) |
| `engine/` diff vs `work-stackfix2` | **Empty** (0 differences) |
