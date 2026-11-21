# Handoff: Split-Sleeper Rescue Simulator (Plan Tool #7)

**Tree:** `/home/hatch/workspace/hos-patch/work-rescue`  
**Owner:** Neon  
**Scope:** Plan hub tool #3 of 3 (#7 overall, appended at the bottom below *When to roll & PTA*): **Split-sleeper rescue** ("Straight 10 vs. 8/2 vs. 7/3 vs. Roll now").  
**Hard guards verified:**
- `git hash-object web/src/store.ts` = `1323046db6ba07b8c85805f89a103dc16f3776b5` (untouched)
- `engine/` untouched (0 files modified)
- `web/src/rollout.ts` and `web/src/recap.ts` untouched
- Zero new dependencies; 100% offline
- Every time-of-day input uses the shared `ClockPick` sheet (`kind: 'rescuetime'`); zero `<input type="time">` on the screen; dock wait is entered as a duration (presets + hours/minutes inputs)

---

## 1. Files Changed

| File | Status | Summary |
| :--- | :--- | :--- |
| `web/src/rescue.ts` | **New** | Pure logic module (`simulateRescue`, `evaluateSplitPairing`, `computeRescueDriveMinutes`, `resolveRescueDeadline`, formatters, presets, `SPLIT_SB_CALLOUT`, `NO_RESCUE_HEADLINE`). Imports only from `engine/src/index.ts` and `./store.ts` helpers. |
| `web/src/app.tsx` | Modified | Added `I.rescue` icon path, `SheetKind` variant `'rescuetime'`, `openRescuePlanner` / `isRescuePlannerOpen` / `useRescuePlanner` module-level state (matching `openWeekPlanner` / `openRolloutPlanner`, with mutual exclusion & tab-leave close), bottom Plan hub button (`Split-sleeper rescue`), `RescueTimeSheet` (shared `ClockPick`), `RescueStrategyCard`, `RescueTab` (verdict-first stacked comparison cards, SB-only callout, Next-Shift Trap preview, inputs), and `backNav` / `TabBoundary` wiring. |
| `web/src/backnav.ts` | Modified | Added `'rescue'` to `PLAN_SCREENS` so phone Back returns to Plan. |
| `web/public/styles.css` | Modified | Added `.rescue-*` styles using existing day/night palette tokens (all font sizes `>= 12px`, `flex-wrap: wrap` on `.rescue-step` for 360px widths). |
| `web/package.json` | Modified | Wired `test/dom/rescue.mjs` into `npm run dom` (and thus `npm run smoke`). |
| `web/test/dom/rescue.mjs` | **New** | Dedicated DOM & engine verification suite with pins **R1–R8** (including ClockPick compliance and tab-leave reset). |
| `web/test/smoke.mjs` | Modified | Updated 7-item Plan hub assertions (`Weekly recap vs. 34` 5th, `When to roll & PTA` 6th, `Split-sleeper rescue` 7th) and added a `split-sleeper rescue` SSR + engine smoke block (R1, R7, verdict-first order, SB callout, zero `<input type="time">`). |
| `web/test/dom/c3.mjs` | Modified | Updated `D10a` Plan hub pin to 7 items with `Split-sleeper rescue` 7th (bottom). |
| `web/test/dom/c3browser.mjs` | Modified | Updated browser Plan hub assertion to 7 items with `Split-sleeper rescue` at index 6. |
| `web/test/dom/revisions.mjs` | Modified | Updated Plan hub count/order assertions in `W1`, `W4`, `R1`, `R5` from 6 items to 7 items (`Split-sleeper rescue` last) and reset `openRescuePlanner(false)` for test isolation. |
| `web/test/dom/polish.mjs` | Modified | Added `sweep('plan-7', [tab('Plan'), planItem(6)])` so Chromium audits touch-target floors, horizontal overflow, and console/page errors on the Rescue screen. |

---

## 2. Strategy Math & Audit Map (Engine-Derived vs. Hand-Derived)

Every strategy builds a concrete synthetic tentative segment timeline appended to `loggedSegments(s, now)` and delegates all HOS rule enforcement to `engine/src/index.ts`.

### A. Engine-Derived Values (direct calls to `engine/src/index.ts`)

| Quantity | Engine Call & Location (`web/src/rescue.ts`) | Notes |
| :--- | :--- | :--- |
| Current shift/cycle clocks & pending split leg (`driveRemainingNow`, `windowRemainingNow`, `breakRemainingNow`, `cycleRemainingNow`, `pendingSplitLeg`) | `evaluate(logged, { asOf: now, config })` (`L1117`, `L1150-L1157`) | Logged-only (`!s.tentative`) seed matching `rollout.ts`. |
| Active rest in progress at `now` | `restPeriods(evNow.segments)` (`L503-L504`, `L697-L698`, `L1118-L1119`) | Detects `r.start <= now && r.end === now` without merging unlogged trailing gaps. |
| Trailing contiguous Sleeper Berth at `now` | `normalize(segments)` (`L476-L481`) | Used only when the last normalized segment is `SB` ending exactly at `now`, so an in-progress SB block counts toward the consecutive `>=7h` long leg. |
| Mandatory 30-min driving break insertion & `releaseAt` / `finishAt` | `appendEngineDrive` -> loop calling `evaluate([...logged, ...prefixSim, ...segs], { asOf: t, config }).shift.breakRemaining` (`L320-L383`) | Inserts `LIMITS.BREAK_LEN` (30m) `OFF` whenever `!config.shortHaul && brkRem <= 0`, then drives `min(rem, brkRem)`. A `>=30m` split leg or dock wait automatically satisfies the 30m break via the engine. `releaseAt = firstDriveAt`; `finishAt = endAt`. |
| Post-`now` HOS legality & violations (`hosLegal`, `violations`) | `postNowViolations` -> `evaluate(combined, { asOf: evalAt, config })` (`L389-L415`) | Filters to `v.tentative || v.start >= now`. When `dockWaitMinutes < LIMITS.RESTART` (34h), also strips any newly created `r.isRestart && r.end > now` via `normalize` + `restPeriods` + `cycleViolations(norm, restsNoNew34, config)` (mirroring `rollout.ts`) so a non-restart strategy never silently relies on a 34h restart. |
| Split pair qualification (`pairQualified`) | `pairQualifies(r1, r2)` on `restPeriods(ev.segments)` (`L574-L578`, `L656-L659`, `L731-L733`, `L791-L793`) | Enforces 49 CFR §395.1(g)(1)(ii)(A)–(C): both legs `>=2h`, at least one leg `>=7h` consecutive SB, `r1.duration + r2.duration >= 600m`. Short-first also requires `!r1.isReset` so a `>=10h` plain OFF wait is not mislabeled as a split. |
| Next-Shift Trap clocks (`nextShift`: `driveRemaining`, `windowRemaining`, `breakRemaining`, `cycleRemaining`, `driveUsed`, `windowUsed`, `driveLimit`, `windowLimit`) | `evaluate([...logged, ...simSegments], { asOf: splitCompleteAt, config })` for short-first/long-first (`L574, L581, L656, L662`), `evFinish` at `asOf: drv.endAt` (after delivery) when completing a pending leg (`L730, L735, L789, L794`), or `asOf: releaseTarget` for Straight 10 (`L862-L863`) | Read directly at the exact minute after delivery/2nd leg (or 10h rest) finishes — zero hand-rolled split recalculation; `nextShift.atLabel` states the exact read point (`after split completes` vs. `after delivery`). |
| Wall-clock deadline resolution | `localToMinute(y, mo, d, h, tz) + min` (`L279-L290`) | DST-safe home-terminal wall-clock conversion. |
| Cycle limit & window days | `cycleParamsOf(config)` from `web/src/store.ts` (`L1115`) | Handles both 70/8 and 60/7 cycles. |

### B. Explicitly Flagged Hand-Derived Formulas (for Opus line-by-line review)

1. **Miles-to-drive-minutes (`computeRescueDriveMinutes`, `web/src/rescue.ts:293-310`):**
   - `effectiveMph = clamp(round(mph), 45, 65)` (default `55`).
   - Direct hours mode: `driveMinutes = min(max(0, round(driveMinutesDirect)), LIMITS.DRIVE * 3)`.
   - Miles mode: `driveMinutes = min(ceil((miles * 60) / effectiveMph - 1e-9), LIMITS.DRIVE * 3)` (same ceiling formula as `rollout.ts` / `engine/src/trip.ts`; `- 1e-9` prevents float-epsilon `+1m` on exact divisions such as `330 mi / 55 mph = 360m`).
2. **Timeline leg boundary construction (inputs handed to the engine):**
   - **Fresh-clock check (`isFreshNow`, `L1120-L1122`):** `evNow.segments.length === 0 || (activeRestNow !== null && now - activeRestNow.start >= 600) || (evNow.shift.driveUsed === 0 && evNow.shift.windowUsed === 0 && evNow.shift.anchor >= now)`.
   - **Straight 10 (`L834-L837`):** `restOrigin = activeRestNow ? activeRestNow.start : now`; `releaseTarget = isFreshNow ? now + dockWaitMinutes : max(now + dockWaitMinutes, restOrigin + 600)`. Models wait/rest as `OFF` `[now, releaseTarget]`.
   - **Roll now / no qualifying break (`L914-L917`):** `waitEnd = now + dockWaitMinutes`. Models the dock wait as `ON` (On Duty Not Driving) per 49 CFR §395.2 detention rules so an unsplit dock wait never pauses the 14h window and never accidentally pairs with an opening 10h SB reset (FMCSA FAQ 22).
   - **Split short-first (`L514-L543`):** `restOrigin = activeRestNow ? activeRestNow.start : now`; `leg1End = max(now + dockWaitMinutes, restOrigin + shortLegMinutes)` (`OFF`, where `shortLegMinutes` is `120` for 8/2 and `180` for 7/3); drive via `appendEngineDrive` from `leg1End` to `finishAt`; then `SB` `[finishAt, finishAt + longSbMinutes]` (`480` for 8/2, `420` for 7/3).
   - **Split long-first (`L599-L626`):** `sbOrigin = trailingSB > 0 ? now - trailingSB : now`; `leg1End = max(now + dockWaitMinutes, sbOrigin + longSbMinutes)` (`SB`); drive via `appendEngineDrive` from `leg1End` to `finishAt`; then `OFF` `[finishAt, finishAt + shortLegMinutes]`.
   - **Completing an already-logged pending leg (`L702-L820`):** guards against reusing the active rest at `now` as both legs (`activeRestNow.start === pending.start && activeRestNow.end === pending.end`).
     - `completes-pending-short`: `legEnd = max(now + dockWaitMinutes, sbOrigin + longSbMinutes)` (`SB`); hand-derived conservative pre-filter `pending.duration + (legEnd - sbOrigin) >= 600 && (legEnd - sbOrigin) >= 420` (uses the new leg's own SB duration rather than merged `rNew.duration` — conservative-only: may drop an edge candidate the engine would accept, can never pass one the engine would reject); then `appendEngineDrive` from `legEnd`.
     - `completes-pending-long`: `legEnd = max(now + dockWaitMinutes, restOrigin + shortLegMinutes)` (`OFF`); hand-derived conservative pre-filter `pending.duration + (legEnd - restOrigin) >= 600 && (legEnd - restOrigin) >= 120` (uses the new leg's own OFF duration rather than merged `rNew.duration` — conservative-only); then `appendEngineDrive` from `legEnd`.
3. **Comparison & deadline arithmetic (`L1192-L1202`):**
   - `savedVsStraight10 = straight10.finishAt - st.finishAt` (positive = minutes faster than Straight 10).
   - `deadlineSlack = deadlineMinute !== null ? deadlineMinute - st.finishAt : null` (`>= 0` on/before deadline, `< 0` late).
   - `meetsDeadline = deadlineMinute === null || st.finishAt <= deadlineMinute`.
   - `makesIt = st.hosLegal && st.meetsDeadline`.
4. **Next-Shift Trap tone thresholds (`buildNextShiftPreview`, `L431-L445`):**
   - Non-split (`Straight 10`): `trapTone = 'good'`.
   - Split: `bad` if `driveRemaining < 360` (< 6h) or `windowRemaining < 480` (< 8h); `warn` if `driveRemaining < driveLimit || windowRemaining < windowLimit`; `good` if full limits remain.
5. **Best split-order selection (`buildSplitStrategy`, `L1035-L1054`):**
   - Evaluates up to 4 orders (`completes-pending-long`, `completes-pending-short`, `short-first`, `long-first`) for each split strategy (`8/2`, `7/3`) and displays the winning order once per strategy: `hosLegal` -> earliest `finishAt` -> earliest `splitCompleteAt` -> short-first when `dockWaitMinutes > 0` -> highest `driveRemaining + windowRemaining` (if all illegal: fewest violation minutes, preferring short-first when `dockWaitMinutes < longSbMinutes`).
6. **Card ordering & Roll-now inclusion (`L1183-L1189`, `L1267-L1285`):**
   - `Roll now` is included only when `dockWaitMinutes < 600` and `(releaseAt, finishAt, hosLegal)` differs from `Straight 10`.
   - Cards sort best-first: `makesIt` -> `hosLegal` -> earliest `finishAt` -> tie-break preference (`roll_now`, `straight10`, `split82`, `split73`) -> earliest `splitCompleteAt` -> highest next-shift headroom (illegal strategies last, sorted by fewest total violation minutes).

---

## 3. Pin List & Scenario Math

All scenarios below run in `TZ=America/Chicago` (CST, Nov 2026).  
Shared base fixture `BASE_SEGS` at `now = Wed Nov 11 13:00`:
- `Tue 20:00 → Wed 06:00`: `10h OFF` (plain reset, not SB)
- `Wed 06:00 → 11:00`: `5h D` (300m driving)
- `Wed 11:00 → 13:00`: `2h ON` (120m on-duty; `>=30m` non-driving so 30m break clock is fresh `480m`)
- Clocks at `13:00`: `driveUsed = 5h` (`6h` left), `windowUsed = 7h` (`7h` left, expires `Wed 20:00`), `cycleUsed = 7h` (`63h` left).

### New Rescue DOM & Engine Suite (`web/test/dom/rescue.mjs`, 8/8 pins)

- **R1 — Straight 10 misses deadline while 8/2 rescues:**  
  `BASE_SEGS`, `dockWait = 2h` (120m), `drive = 6h` (360m), `deadline = Wed 21:30`.
  - `Roll now`: `13:00–15:00 ON` + `15:00–21:00 D` -> 14h window expires `20:00` -> `WINDOW_14` violation (`60m`), illegal.
  - `Straight 10`: `13:00–23:00 OFF` -> release `23:00`, finish `Thu 05:00` -> misses `21:30` by `450m` (`deadlineSlack = -450`).
  - `8/2 split` (short-first): `13:00–15:00 OFF` (2h) -> release `15:00`, `15:00–21:00 D` (6h, finish `21:00`, `deadlineSlack = +30`, `savedVsStraight10 = 480m`) -> `21:00–05:00 SB` (8h). 2h+8h=10h qualifies; 2h excluded -> `windowUsed = 13h <= 14h`, `drive = 11h <= 11h`. Recommended #1.
  - `7/3 split` (short-first): `13:00–16:00 OFF` (3h) -> finish `22:00` -> misses `21:30` by `30m`.
- **R2 — 7/3 vs 8/2 differ by exact 60m leg delta (both short-first and long-first):**
  - Short-first (`BASE_SEGS`, wait `2h`, drive `6h`): 8/2 releases `15:00` / finishes `21:00`; 7/3 releases `16:00` / finishes `22:00` -> exact `+60m` delta on both release and finish.
  - Long-first (prior pending `3h OFF` `10:00–13:00`, `4h D` before, `5h D` after, `now = 18:00`, wait `0`, drive `5h`): 7/3 takes `7h SB` (`18:00–01:00`) -> release `01:00`, finish `06:00`; 8/2 takes `8h SB` (`18:00–02:00`) -> release `02:00`, finish `07:00` -> exact `60m` delta on both release and finish (7/3 is 60m earlier).
- **R3 — Short-leg-first dock wait (and active rest in progress) drive-again time:**
  - Case A (`BASE_SEGS`, `dockWait = 2h 45m` = 165m, `drive = 6h`): 8/2 (`165 >= 120`) uses dock wait as short leg -> release `15:45`, finish `21:45`; 7/3 extends 15m to 3h -> release `16:00`, finish `22:00`.
  - Case B (already `1h OFF` `12:00–13:00` + `1h 30m` more wait = `2h 30m` continuous OFF): 8/2 releases at `14:30` (finish `20:30`); 7/3 extends 30m to `15:00` (finish `21:00`).
- **R4 — Next-Shift Trap 11h/14h numbers match hand math, independent `engine.evaluate()`, and rendered DOM:**  
  `BASE_SEGS`, `dockWait = 2h`, `drive = 6h`:
  - 8/2 (`13:00–15:00 OFF`, `15:00–21:00 D`, `21:00–05:00 SB`): at `splitCompleteAt = Thu 05:00`, `anchor = 15:00`, `8h SB` excluded -> `driveUsed = 6h` (`driveRemaining = 300m` = `5h 00m`), `windowUsed = (14h - 8h) = 6h` (`windowRemaining = 480m` = `8h 00m`).
  - 7/3 (`13:00–16:00 OFF`, `16:00–22:00 D`, `22:00–05:00 SB`): at `Thu 05:00`, `anchor = 16:00`, `7h SB` excluded -> `driveRemaining = 300m` (`5h 00m`), `windowRemaining = 480m` (`8h 00m`).
  - Cross-checked against independent `E.evaluate([...BASE_SEGS, ...simSegments], { asOf: splitCompleteAt, config })` AND DOM `[data-rescue-next-drive="split82"]` / `[data-rescue-next-window="split82"]`.
- **R5 — Sleeper-Berth-only callout on every split card:**  
  Verifies exact string `"Long leg = Sleeper Berth ONLY; verify on your ELD."` renders inside `[data-rescue-sb-callout="split82"]` and `[data-rescue-sb-callout="split73"]`.
- **R6 — No-rescue scenario:**  
  Fixture at `14:30`: `06:00–10:00 D`, `10:00–10:30 OFF`, `10:30–14:30 D` (`8h` driven, only `3h` drive left, no pending split leg), needing `6h` remaining drive.
  - Roll now, 8/2, and 7/3 all violate `DRIVE_11` by `3h` (`8h + 6h = 14h > 11h`).
  - Straight 10 (`14:30–00:30 OFF` -> drive `00:30–06:30`) is the earliest legal finish (`Thu 06:30`).
  - Verifies `noRescue === true`, `recommended === null`, plain headline `"No rescue — the split doesn't save this one"`, Straight 10 finish `06:30` shown in verdict & card, zero `Recommended` badges, and SB callouts still present on split cards.
- **R7 — 2h + 7h = 9h pairing fails FMCSA split qualification:**  
  `evaluateSplitPairing(BASE_SEGS, NOW_13, cfgChi, 120, 360, 420, 120, 'short-first')` (`2h OFF` + `6h D` + `7h SB` = `540m < 600m`):
  - Verifies `pairQualified === false`, `hosLegal === false`, `usedChain.length === 0`, and `WINDOW_14` violation `20:00–21:00` (`60m`), matching independent `E.evaluate(...)`.
  - Also confirms `simulateRescue`'s `7/3` strategy on a `2h` dock wait never cheats with `2h + 7h` — it extends the short leg to `3h` (`releaseAt = 16:00`).
- **R8 — Plan hub placement, verdict-first open, ClockPick compliance, Back & tab-leave:**  
  Verifies 7 `.plan-item` buttons with `"When to roll & PTA"` 6th and `"Split-sleeper rescue"` 7th (bottom), clicking opens `h1 = "Split-sleeper rescue"` with verdict rendered before strategies, zero `<input type="time">` before and after toggling `"Set deadline"`, deadline button opens the shared `ClockPick` sheet and applies `21:50`, Back returns to the 7-item Plan hub, and leaving Plan (`tab: 'now'` -> `tab: 'plan'`) closes the simulator cleanly.

### Updated Existing Pins
- `web/test/smoke.mjs`: 7-item Plan hub assertions + new `split-sleeper rescue` SSR & engine check.
- `web/test/dom/c3.mjs` (`D10a`), `web/test/dom/c3browser.mjs`, `web/test/dom/revisions.mjs` (`W1`, `W4`, `R1`, `R5`): updated Plan hub assertions from 6 to 7 items with `Split-sleeper rescue` last.
- `web/test/dom/polish.mjs`: added `sweep('plan-7', [tab('Plan'), planItem(6)])`.

---

## 4. Local Check Results (`TZ=America/Chicago`)

| Check | Command | Result |
| :--- | :--- | :--- |
| Typecheck + Production Build | `cd web && TZ=America/Chicago npm run build` | **PASS** (`tsc --noEmit` 0 errors; `dist/app.js` 363.2kb) |
| Contrast (day + night) | `node test/contrast.mjs` | **PASS** (44/44 day, 44/44 night) |
| Nightlight & OCR bundle | `node test/nightlight.mjs && node test/ocr-bundle.mjs` | **PASS** |
| Smoke SSR + engine | `TZ=America/Chicago node dist-test/smoke.mjs` | **PASS** (`split-sleeper rescue ...: OK`, `OK`) |
| Rescue DOM suite (new) | `TZ=America/Chicago node dist-test/dom-rescue.mjs` | **PASS** (**8/8** pins pass: R1–R8) |
| Revisions DOM suite | `TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**63/63** pins pass, incl. updated W1/W4/R1/R5) |
| C3 DOM suite | `TZ=America/Chicago node dist-test/dom-c3.mjs` | **PASS** (**46/46** pins pass, incl. updated D10a) |
| Other non-browser DOM suites | `yesback`, `c1flush`, `adjuststart` (39/39), `c3relaunch` (3/3), `logedit` (37/37), `cascade` (16/16), `scrub` (30/30) | **PASS** *(Note: pre-existing `scrub.mjs` P4 has occasional `sleep(40)` timing sensitivity under heavy local CPU load; passed 30/30 cleanly, and neither `SplitTab`/`SplitBlockSheet` nor `scrub.mjs` was modified.)* |
| Hard guard: `store.ts` hash | `git hash-object web/src/store.ts` | **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (exact match) |
| Hard guard: untouched files | `find engine web/src/store.ts web/src/rollout.ts web/src/recap.ts -type f -newermt "2026-11-21 09:00"` | **Empty** (0 files modified) |

*(Full Chromium browser suites — `layout.mjs`, `auditfix.mjs`, `polish.mjs`, `c3browser.mjs`, etc. — intentionally NOT run locally; ready for Ada's Modal browser gate and Opus's logic review.)*

---

## 5. Addendum — Opus FIX-FIRST Review Fixes (2026-11-21)

Applied all three defects from `OPUS-RESCUE-REVIEW.md` with dedicated pins added to `web/test/dom/rescue.mjs` (now **11/11** pins):

1. **Defect 1 (No-rescue with deadline wrongly naming Straight 10 as earliest legal):**
   - `web/src/rescue.ts`: In the `deadlineMinute !== null && winners.length === 0` branch, selected `const earliestLegal = strategies.find((s) => s.hosLegal) ?? null` (leveraging the existing `makesIt -> hosLegal -> earliest finishAt` sort), reported `Earliest legal finish is ${earliestLegal.finishText} via ${earliestLegal.title} (${dur(late)} past deadline).` (appending `Straight 10: ${straight10.finishShort} (${dur(straight10.finishAt - deadlineMinute)} past).` when `earliestLegal.id !== 'straight10' && straight10.hosLegal`), and assigned `earliestLegal.badge = 'Earliest legal'` instead of hard-coding it on Straight 10. Left the no-deadline no-rescue branch untouched.
   - **Pin `R6b`:** Opus D1 fixture (`BASE_SEGS`, `now = Wed 13:00`, wait `2h`, drive `6h`, deadline `Wed 20:30`). Verifies `noRescue === true`, subline names `8/2 split`, `Wed Nov 11, 21:00`, `30m`, and `Straight 10: Thu 05:00 (8h 30m past)`, `8/2` has badge `'Earliest legal'`, and Straight 10's badge does not say `'Earliest legal'`.

2. **Defect 2 (Next-Shift Trap read before remaining drive on completes-pending orders):**
   - `web/src/rescue.ts` & `web/src/app.tsx`: In both `completes-pending-short` and `completes-pending-long`, replaced `buildNextShiftPreview(evSplitDone, legEnd, tz, true)` with `buildNextShiftPreview(evFinish, drv.endAt, tz, true, 'after delivery')` (reusing the `evFinish` evaluation already computed at `drv.endAt` by `postNowViolations`). Added `atLabel` to `NextShiftPreview` (`'after split completes'` for short-first/long-first, `'after delivery'` for completes-pending/roll-now, `'after 10-hour rest'` for Straight 10) and rendered `Next-shift trap ({st.nextShift.atLabel} at {st.nextShift.atShort})` in `RescueStrategyCard` so header and summary text accurately identify the evaluation point across all four split orders.
   - **Pin `R4b`:** R2 long fixture (`pendingShortSegs`, `now = Wed 18:00`, wait `0`, drive `5h`). Verifies `7/3` (`completes-pending-short`) `nextShift.driveRemaining === 60 && windowRemaining === 240` (and `8/2` `60 / 240`), matching hand math (`anchor = Wed 13:00`, drive `10h -> 60m left`, window `17h - 7h SB = 10h -> 240m left`), independent `E.evaluate(..., { asOf: finishAt }).shift`, `atLabel === 'after delivery'`, and DOM card header rendering.

3. **Defect 3 (`appendEngineDrive` silently truncating driving on long runs):**
   - `web/src/rescue.ts`: Replaced the fixed `guard++ < 8` loop bound with `const maxIter = 2 * Math.ceil(driveMinutes / LIMITS.BREAK_AFTER) + 4` so long runs up to `LIMITS.DRIVE * 3` (1980 min) never drop driving chunks.
   - **Pin `R9` (TRUNC):** 7h 50m driven with no break (`06:00–13:50`), `now = 13:50`, `dockWait = 0`, `drive = 1980m`. Verifies all 4 strategies simulate the full `1980` D minutes in `simSegments`.

4. **Audit map update:** Explicitly documented the conservative-only completes-pending pre-filter (`pending.duration + legDur >= 600`) in §2B and updated §2A for the `evFinish` read point.
