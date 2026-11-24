# HANDOFF — Fix Round: Plan Tool #5 "Miles Left in My 70" (`work-milesfix`)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-milesfix` (copied from `work-miles`)
- **Review Addressed:** `REVIEW-MILES.md` (Opus independent review — `FIX-FIRST`: F1 blocker, F2 copy honesty, F3/F4/F5 low findings, plus both nits: 30-min break on no-overhead partial days & per-day row miles reconciliation)
- **Status:** All findings fixed, fail-before (`8/11`, ML9/ML10/ML11 failing on `work-miles`) and pass-after (`11/11`) verified, 360-log brute-force shift+cycle legality & parity check clean (`0` violations), and all suites verified sequentially in `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to baseline) | **PASS** |
| Zero new `<input type="time">` | `grep -n 'type="time"' web/src/app.tsx` + `ML8` | `3` pre-existing hits (lines 3814, 5746, 5784); `0` in `MilesTab` | **PASS** |
| Zero new `localStorage` keys | `grep 'localStorage' web/src/miles.ts` + `ML8` | `0` runtime calls (doc-comment only); `extraKeys: []` | **PASS** |
| No deploy / no push | Verified | Not deployed, not pushed | **PASS** |

---

## 2. F1 — Day-0 Shift Clocks, Inter-Shift 10h Rest, and 30-Min Break Model

Implemented in `web/src/miles.ts` (`inspectDay0Shift()` + `runDayByDaySimulation()`):

### A. Day-0 Shift Inspection (`inspectDay0Shift`)
Reads the existing `ev = evaluate(logged, { asOf: now, config, forecastDays: 9 })` result directly:
1. **Fresh vs. Active Shift:**
   - A driver is treated as **fresh** on Day 0 when `ev.segments` is empty, has no prior work (`D`/`ON`), `ev.shift.driveUsed === 0 && ev.shift.windowUsed === 0` (engine already credited a completed ≥10h rest up to `now`), or there is an unlogged trailing gap after the last logged segment with `now - lastWorkEnd >= 600` (preserving compatibility with historical fixtures like `ML1`/`ML2`/`ML6` that omit a trailing `OFF` row).
   - Otherwise, Day 0 uses the engine's exact remaining shift clocks: `ev.shift.driveRemaining`, `ev.shift.windowRemaining`, and `ev.shift.breakRemaining` (`Infinity` if `config.shortHaul`).
2. **No Overhead Double-Charging on Day 0:**
   - Computes `workedOnInShift = minutesOf(ev.segments, new Set(['ON']), ev.shift.anchor, now)`.
   - Charges only the not-yet-worked portion on Day 0: `day0Overhead = Math.max(0, overheadMinutes - workedOnInShift)`.
   - Example (Fixture A): driver already logged 3h `ON` (`04:00–07:00`) vs 1h 15m daily overhead → `day0Overhead = 0`.
3. **Ongoing Rest Start:**
   - When the driver is currently in a logged `OFF`/`SB` segment ending at `now` (`lastSeg.end === now`), `ongoingRestStart` is `lastRest.start` from `restPeriods(ev.segments)` (matching `timeline.ts` rest merging, e.g., Fixture B's `OFF 14:00–15:00` → `ongoingRestStart = 14:00`, rest finishes `Thu 00:00`).
   - Otherwise (actively `D`/`ON`, or trailing unlogged gap `< 10h`, which `timeline.ts` does not merge across tentative rows), `ongoingRestStart = now`.

### B. Explicit 10-Hour Inter-Shift Rest Gate (`nextShiftEarliestStart`)
- Day 0 runs inside `[Math.max(day0.start, now), Math.min(day0.end, cutoffMinute))`.
- After Day `k`:
  - If `driveMinutes > 0`: `shiftWallUsed = driveMinutes + overheadUsedMinutes + breakOffMinutes`, and `nextShiftEarliestStart = sliceStart + shiftWallUsed + LIMITS.RESET` (`+600m`).
  - If Day 0 did `0` driving on an active/spent shift (`!day0.isFresh`): `nextShiftEarliestStart = ongoingRestStart + LIMITS.RESET`.
  - If a fresh day (`k >= 1` or fresh Day 0) did `0` driving (e.g., `availCycle < overhead`), `nextShiftEarliestStart` does not advance.
- Every Day `k >= 1` uses `sliceStart = Math.max(f.start, nextShiftEarliestStart)` and `wallMinutes = Math.max(0, Math.min(f.end, cutoffMinute) - sliceStart)`. Day 1 can never begin a fresh 11h shift at a carrier-day boundary without completing a full 10-hour rest.

### C. 30-Minute Break Model (§395.3(a)(3)(ii) — Day 0 & No-Overhead Partial Days NIT)
- On non-short-haul shifts (`!config.shortHaul`), any 30 consecutive non-driving minutes (`OFF`, `SB`, or `ON`) satisfies the 30-minute break (`engine/src/shift.ts` `breakStatus()` semantics).
- For every day `k`, the simulator evaluates both legal options and takes the higher legal drive:
  1. **Without an extra OFF break:** capped at `breakRem` unless `dayOverhead >= 30` (mid-shift) or `trailingNonDrive + dayOverhead >= 30` (when `breakRem === 0`).
  2. **With an extra OFF break:** `extraOffBreakNeeded = breakRem === 0 ? Math.max(0, 30 - trailingNonDrive - dayOverhead) : Math.max(0, 30 - dayOverhead)`. That OFF break consumes wall time and shift-window time (0 extra cycle cost).
- **Fixture A outcome:** `driveRemaining = 60`, `windowRemaining = 60`, `breakRemaining = 0`, `day0Overhead = 0` → requires a 30m OFF break (`17:00–17:30`), leaving **30m** of legal driving (`17:30–18:00`), then 10h rest (`18:00–Thu 04:00`), then 3×660m = **2,010 min = 1,910 mi** (matching Opus's hand-built zero-violation plan to the exact minute and mile; verdict `short` by 190 mi vs 2,100 mi goal).
- **0-overhead partial-day outcome (Break NIT):** Fresh driver, `overhead = 0`, 9h (`540m`) wall time → Option 1 gives `480m`, Option 2 gives `540 - 30 = 510m` → credits **510m** (8h 30m drive + 30m break), never 540m continuous.

### D. Brute-Force Verification (360 Random Logs)
Ran a scratch harness (`3` seeds × `120` random 10-day logs across `70/8`, `60/7`, `midnight`, `18:40`, `overhead ∈ {0, 15, 45, 75, 120, 240}`, mid-shift and mid-rest states, random cutoffs), materializing every simulated plan into tentative `OFF`/`ON`/`D` segments and evaluating with `engine`'s `evaluate()`:
- **`DRIVE_11` violations:** `0 / 360`
- **`WINDOW_14` violations:** `0 / 360`
- **`BREAK_30` violations:** `0 / 360`
- **`CYCLE` violations:** `0 / 360`
- **Cycle parity vs `evaluate(asOf: cutoffMinute).cycle.remaining`:** `360 / 360` exact match (`0` mismatches)
- **Per-day `displayMiles` sum vs `maxLegalMiles`:** `360 / 360` exact match (`0` mismatches)
- **F3 `remainingNow + netRecaps === cycleThroughCutoff`:** `360 / 360` exact match (`0` mismatches)

---

## 3. F2, F3, F4, F5, Nits & Known Behaviors

### F2 — Honest Short Verdict & No-34 Ceiling Copy
- **Short verdict headline (`web/src/miles.ts`):**
  > `Ceiling {ceilingMiles} mi — short {shortfallMiles} mi of your goal. That's with your current tank (no 34) — a 34 before cutoff, or pushing into next pay week, could change this.`
- **Tank summary line (`web/src/miles.ts`):**
  > `{H:MM} left in your {60|70}-hr cycle + recaps through {cutoffShort} → ~{maxLegalMiles} max legal miles without a 34 at {mph} mph.`
- **Card labels (`web/src/app.tsx`):**
  - Hero miles: `~{maxLegalMiles} max legal miles (no 34)`
  - Metric tile 2: `Max left (no 34)`
  - Metric tile 3: `Ceiling without a 34`
- Restart simulation was NOT implemented (copy-only fix, per brief).

### F3 — Over-Cycle Assumptions Line Reconciliation
- Added `overCycleNowMinutes = Math.max(0, ev.cycle.used - limit)` and `netRecapsBeforeCutoffMinutes = Math.max(0, cycleThroughCutoffMinutes - remainingNowMinutes)` to `MilesPlanResult`.
- `remainingNowMinutes + netRecapsBeforeCutoffMinutes === cycleThroughCutoffMinutes` holds unconditionally in all cases (normal and over-cycle).
- When `overCycleNowMinutes === 0`, the line renders `{remainingNow} now + {netRecaps} recaps`.
- When `overCycleNowMinutes > 0` (e.g., Opus's 84h/70h fixture: 14h over cycle, 36h raw recaps, `22:00` headline), the line renders:
  > `At 57 mph real average · after 1h 15m/day on-duty overhead · 0:00 now + 22:00 net recaps (after 14:00 over cycle)`
  (`0:00 + 22:00 = 22:00`, reconciling cleanly to the headline while transparently disclosing the over-cycle deficit absorbed).

### F4 — Truthful Binding Cap Wording (11h Drive vs. 14h Window)
- Added per-day `capKind: 'none' | 'drive11' | 'window14'` and overall `dailyCapKind: 'none' | 'drive11' | 'window14' | 'both'` + `dailyCapNote`.
- When overhead `> 3h` (e.g., 4h → `dailyDriveCap = 600 < 660`), days bind on `window14`:
  - Card note: `"The 14-hr shift window (after 4h 00m/day on-duty overhead) caps your miles before your 70-hr cycle runs out (4 driving days before cutoff)."`
  - Row badge: `(14h window cap)` instead of `(11h cap)`.
- When 11h binds (`overhead <= 3h`), wording stays `"The 11-hr daily driving limit caps your miles..."` with `(11h cap)`.
- When Day 0 binds on 14h window and later days bind on 11h drive (e.g., Fixture A), wording honestly names both: `"The 11-hr daily driving limit and 14-hr shift window cap your miles..."`.

### F5 — Exact Carrier-Day Boundary Cutoff Choice
- **Choice:** Kept `cycleThroughCutoffMinutes` in **exact parity** with `evaluate(asOf: cutoffMinute).cycle.remaining` (preserving 10/10 parity on Opus's fixtures), and added an explicit one-line honesty note (`boundaryDropAtCutoffMinutes` / `boundaryDropNote`) whenever a forecast drop-off lands at `fc.dayStart === cutoffMinute && fc.dropsOff > 0`:
  > `Includes +8:00 dropping off right at the Sat 18:40 cutoff (0m left before cutoff to drive it).`
  plus an `(at cutoff)` tag on that 0-minute day row in the breakdown.

### Row-Miles Reconciliation NIT
- Added `displayMiles: number` to `MilesDaySim` computed via largest-remainder rounding across active (`driveMinutes > 0`) days so `sum(days.map(d => d.displayMiles)) === maxLegalMiles` always holds while zero-drive days always show `0 mi`.

### Known, Accepted DST Behaviors (Not Changed — Same Pattern as Flip's Resolver)
- **Spring-forward gap:** A cutoff inside the nonexistent spring-forward hour (e.g., `Sun Mar 14 2027 02:30` in `America/Chicago`) resolves forward via `localToMinute()` to `03:30 CDT` (not `03:00`).
- **Fall-back repeated hour:** When `now` lies between the two repeated occurrences (e.g., first `01:45 CDT` on `Sun Nov 1 2026`), a `Sun 01:30` cutoff resolves to the second `01:30 CST` that same night rather than next week.

---

## 4. Fail-Before / Pass-After Pin Evidence (`web/test/dom/miles.mjs`, `ML1`–`ML11`)

### Fail-Before (ML9–ML11 run against unmodified `work-miles` code)

```text
PASS  ML1. Parity: hours-left equals independent evaluate() + recap drop-offs (literal 33:00 / ~1,596 mi) and 60/7 card names 60
PASS  ML2. Recap inclusion: large 11h drop-off on Fri adds +11:00 and +613 mi vs Thu cutoff (one day earlier)
PASS  ML3. Overhead binds: raising daily overhead by +1h/day (1h 15m -> 2h 15m) lowers max miles from 1,596 to 1,368 (-228 mi)
PASS  ML4. 11h cap binds: fresh 70h cycle over 4 full days yields exact 4 * 11h * 57 = 2,508 mi (cycle is NOT the limit)
PASS  ML5. Verdict arithmetic: exact cushion (+196 mi), exact shortfall (-304 mi), and calm already-there state with tank
PASS  ML6. Carrier-day boundary: dayStartMinute = 18:40 drops off at 18:40 (not midnight) and matches evaluate()
PASS  ML7. Trim lever: shown only when short AND trimming 30m/day adds miles; ~114 mi matches re-simulated delta
PASS  ML8. Hygiene: Plan hub lists 12 items (Miles 12th), shared ClockPick (0 input[type=time]), 0 new storage keys, estimate framing & clean copy
FAIL  ML9. Fixture A (F1/F2): consumed day-0 clocks (10h D + 3h ON) => short verdict, day-0 drive <= 60m, honest no-34 copy
      {"evDriveRem":60,"evWinRem":60,"status":"doable","day0Drive":345,"totalDrive":2325,"maxMiles":2209,"verdictTxt":"YES — doable, ~109 mi cushion","maxTxt":"~2,209 max legal miles"}
FAIL  ML10. Fixture B (F1): mid-10h-rest (driveRemaining 0, cutoff tonight) yields 0 max legal miles + day-1 rest gate
      {"status":"doable","totalDrive":464,"maxMiles":441,"ceiling":2841,"shortfall":0,"lateDays":[{"i":0,"wall":360,"drive":285},{"i":1,"wall":480,"drive":405}]}
FAIL  ML11. F3/F4/F5 + nits: over-cycle line sums to headline, 4h overhead names 14h window cap, 18:40 boundary note, 0-overhead 30m break & row reconciliation
      {"f3":{"f3Ok":false,"f3HoursMin":1320,"f3HoursTxt":"22:00","f3Assump":"At 57 mph real average · after 1h 15m/day on-duty overhead · 0:00 now + 36:00 recaps","f3PartSum":2160},"f4":{"f4Ok":false,"f4CapNote":"The 11-hr daily driving limit caps your miles before your 70-hr cycle runs out (4 driving days before cutoff)."},"f5":{"f5Ok":false,"hours":1320,"evRem":1320},"brk":{"brkOk":false,"wall":540,"drive":540},"row":{"rowOk":false,"totalDrive":300,"maxMiles":275,"rowSum":276}}

8/11 miles pins passed
```

### Pass-After (`TZ=America/Chicago`, `TZ=UTC`, and `TZ=Asia/Kolkata`)

```text
PASS  ML1. Parity: hours-left equals independent evaluate() + recap drop-offs (literal 33:00 / ~1,596 mi) and 60/7 card names 60
PASS  ML2. Recap inclusion: large 11h drop-off on Fri adds +11:00 and +613 mi vs Thu cutoff (one day earlier)
PASS  ML3. Overhead binds: raising daily overhead by +1h/day (1h 15m -> 2h 15m) lowers max miles from 1,596 to 1,368 (-228 mi)
PASS  ML4. 11h cap binds: fresh 70h cycle over 4 full days yields exact 4 * 11h * 57 = 2,508 mi (cycle is NOT the limit)
PASS  ML5. Verdict arithmetic: exact cushion (+196 mi), exact shortfall (-304 mi), and calm already-there state with tank
PASS  ML6. Carrier-day boundary: dayStartMinute = 18:40 drops off at 18:40 (not midnight) and matches evaluate()
PASS  ML7. Trim lever: shown only when short AND trimming 30m/day adds miles; ~114 mi matches re-simulated delta
PASS  ML8. Hygiene: Plan hub lists 12 items (Miles 12th), shared ClockPick (0 input[type=time]), 0 new storage keys, estimate framing & clean copy
PASS  ML9. Fixture A (F1/F2): consumed day-0 clocks (10h D + 3h ON) => short verdict, day-0 drive <= 60m, honest no-34 copy
PASS  ML10. Fixture B (F1): mid-10h-rest (driveRemaining 0, cutoff tonight) yields 0 max legal miles + day-1 rest gate
PASS  ML11. F3/F4/F5 + nits: over-cycle line sums to headline, 4h overhead names 14h window cap, 18:40 boundary note, 0-overhead 30m break & row reconciliation

11/11 miles pins passed
```

---

## 5. Per-Suite Verification Table (Sequential Runs, Both Timezones)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **`web` `npm run build`** (`tsc --noEmit` + `build.mjs`) | **PASS** (exit 0, `dist/app.js 526.0kb`) | — | 0 type errors |
| **`engine` `npm test`** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 fail |
| **`web` `npm run smoke`** (typecheck, contrast 44/44 day & 44/44 night, nightlight, ocr-bundle pass 1+2, `smoke.mjs`, and all 15 DOM lanes) | **PASS** (exit 0) | **PASS** (exit 0) | All green in both TZs |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` + `dom/c3relaunch.mjs` | **PASS** (`C3 OK` / `C3 RELAUNCH OK`) | **PASS** (`C3 OK` / `C3 RELAUNCH OK`) | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/flip.mjs` | **PASS** (**12/12**) | **PASS** (**12/12**) | via `npm run smoke` |
| ↳ `dom/miles.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | Also **11/11** in `TZ=Asia/Kolkata` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | **88/89** (`W2` only) | Unchanged pre-existing baseline UTC failure in `W2` |

---

## 6. Diff Scope vs. `work-miles`

Only three source/test files were modified relative to `work-miles`, plus this handoff and regenerated `web/dist` / `web/dist-test` outputs:

- **Modified:** `web/src/miles.ts` (`0479b0bae2a7c9bd786f485e9133debc77fc77d2` → `57062612db3b3e8b9a60f2305c85ed668c305d51`) — day-0 shift inspection (`inspectDay0Shift`), explicit 10-hour inter-shift rest gate, 30-min break model, F2 short/tank copy, F3 `overCycleNowMinutes`/`netRecapsBeforeCutoffMinutes`, F4 `capKind`/`dailyCapKind`/`dailyCapNote`, F5 `boundaryDropAtCutoffMinutes`/`boundaryDropNote`, largest-remainder `displayMiles`.
- **Modified:** `web/src/app.tsx` (`dee504e265e57af950d9949c21d631a54130fb66` → `cca215bb74a79941e99d0915435dc49143a0b40e`) — `MilesTab` rendering updates only: F2 no-34 hero/metric labels, F3 reconciled assumptions line, F4 `dailyCapNote` + per-day `(14h window cap)` / `(11h cap)` tag, F5 `boundaryDropNote` + `(at cutoff)` row tag, reconciled `d.displayMiles`.
- **Modified:** `web/test/dom/miles.mjs` (`2f5123375b79220064c37906082f7182b8ed35af` → `893a5b93221915260959a52095222c6451fe40e1`) — added `ML9` (Fixture A + F2), `ML10` (Fixture B + Day-1 rest gate), and `ML11` (F3/F4/F5 + 0-overhead 30m break + row-sum reconciliation).
- **New:** `HANDOFF-MILESFIX.md` (this file).
- **Untouched vs. `work-miles`:** `web/src/store.ts` (`1323046db6ba07b8c85805f89a103dc16f3776b5`), `engine/` (`0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`), `web/src/backnav.ts` (`c96a35fa621e72ce2ef7c27007dfa5ab4ebff0b0`), `web/public/styles.css` (`ad12779a5e5219878a9d9906085395ba33b2117d`), `web/package.json`, and all other test suites.
