# HANDOFF — Plan Tool #5: "Miles Left in My 70" (`work-miles`)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-miles` (copied from live `work-flipfix`)
- **Product Spec:** `RESEARCH-PLAN-TOOLS-2.md` §2 #5 (*"Miles Left in My 70"* — Weekly Miles & Governed-Truck Cycle Pace Check, appended 12th / bottom in the Plan hub at standard `.plan-item` size)
- **Status:** Implemented, built clean (`tsc --noEmit` + `build.mjs`), stub fail-before verified (`0/8`), and all suites verified sequentially in both `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to baseline) | **PASS** |
| Zero new `<input type="time">` | `grep -n 'type="time"' web/src/app.tsx` + `ML8` + `smoke.mjs` | `3` pre-existing hits (lines 3814, 5746, 5784); `0` inside `MilesTab`; cutoff time uses shared `ClockPick` (`timeOnly`) | **PASS** |
| Zero new `localStorage` keys | `grep 'localStorage' web/src/miles.ts` + `ML8` | `0` calls in `miles.ts`; `extraKeys: []` (session-only React state) | **PASS** |
| No deploy / no push | Verified | Not deployed, not pushed | **PASS** |

---

## 2. What Was Built (`file:line`)

### Pure Simulation Module — `web/src/miles.ts` (565 lines)
- **Standing Estimate Framing Line (`L45-46`):**
  > `"Estimate only — legal HOS miles at your real average speed, not an ELD record or settlement guarantee."`
  Zero sleep/medical advice language and zero payroll/rate-per-mile math anywhere in `miles.ts` or `MilesTab`.
- **Defaults & Presets (`L48-76`):**
  - Miles already run: `0` (range `0..10,000`)
  - Weekly mileage goal presets: `2,200` / `2,500` / `2,800` / `3,000` (default `2,800`) + custom numeric input
  - Real average speed: default `57` mph (range `25..75`, explicitly labeled as real average speed, not governor setting)
  - Daily on-duty overhead: default `75m` (`1h 15m`, range `0..480m`) + quick presets (`45m`, `1h`, `1h 15m`, `1h 30m`, `2h`)
  - Pay-week cutoff: DOW chips `Sun`..`Sat` (default `6` = Saturday) + time `23:59`
- **Timezone & Cutoff Resolver (`L263-294`):** `resolveCutoffMinute(now, dow, hour, minute, tz)` resolves the first UTC epoch minute `>= now` matching the chosen weekday and wall time in the carrier's home-terminal timezone using engine `localToMinute()` with DST fall-back repeated-hour handling (`±60m` check) and zero host-TZ dependence.
- **Simulation & Verdict Evaluator (`L307-565`):** `runDayByDaySimulation()` and `evaluateMilesLeft()` compute `cycleThroughCutoffHMM` (`H:MM`), `maxLegalMiles`, `ceilingMiles`, `status` (`'met' | 'doable' | 'short'`), `cushionMiles` / `shortfallMiles`, `dailyCapBound`, `trimAddsMiles` / `trimLeverLine`, and per-carrier-day breakdown `days[]`.

### UI, Navigation & Styles
- **`web/src/app.tsx`:**
  - `L71-77`: Imports `miles.ts` exports.
  - `L405`: Adds `I.miles` 24×24 stroke icon.
  - `L487-488`: Adds `'milestime'` to `SheetKind`.
  - `L4419-4750`: Adds reactive `openMilesPlanner` / `isMilesPlannerOpen` / `useMilesPlanner` outside `store.ts` (mutually exclusive with all 7 other external Plan tools; closes `'milestime'` sheet on close).
  - `L4812-4816`: Appends 12th `.plan-item` (`Miles Left in My 70`) at the bottom of `PlanTab`.
  - `L8908-8943`: `MilesTimeSheet` — shared `<ClockPick timeOnly ... keys={KEYS_DAYSTART} />` for pay-week cutoff time (exact same pattern as `DayStartSheet` and `FlipTimeSheet` target mode).
  - `L8951-9344`: `MilesTab` — verdict & tank card first (naming configured `60-hr` or `70-hr` rule, `H:MM` cycle + recaps, `~N max legal miles` with `~` and mph assumption, weekly ceiling, doable/short/already-there verdict, 11-hr daily cap note when binding, and conditional `Trimming 30m/day of overhead adds ~N mi.` callout), session-only inputs card (using `useDurationBoxes` for daily overhead and shared `ClockPick` for cutoff time), and carrier-day breakdown card naming the exact carrier-day boundary (`midnight` or `HH:MM` e.g. `18:40`).
  - `L10664-11340`: Wired `'miles'` / `'milestime'` into `PlanToolId`, `PLAN_TOOL_LABEL`, `activePlanToolOf`, `sheetSessionKey`, `isSheetVisibleForContext`, `App` hooks, `preserveBehindSettings`, `visibleSheet`, tab-leave cleanup, `backNav`, `isInRoomNow`, `renderDisplayedSheet`, Plan tab-bar reset, and `plan-room`.
- **`web/src/backnav.ts:24`:** Added `'miles'` to `PLAN_SCREENS`.
- **`web/public/styles.css:1607-1643`:** Added `.miles-*` styles using existing day/night palette tokens only (`contrast.mjs` 44/44 day & 44/44 night pass).

---

## 3. Simulation Formulation & Why It Is Honest

1. **Zero hand-rolled cycle arithmetic:**
   - Calls `evaluate(logged, { asOf: now, config: safeRulesConfig(input.config), forecastDays: 9 })` directly on non-tentative logged segments.
   - Reads `ev.cycle.limit` (`4200m` for `70/8`, `3600m` for `60/7`), `ev.cycle.windowDays` (`8` or `7`), `ev.cycle.days[]` (honoring prior 34-hour restarts, custom `dayStartHour:dayStartMinute` like `18:40`, `config.timeZone`, and DST), `ev.cycle.remaining`, and `ev.cycle.forecast[]`.
   - Includes every upcoming carrier day whose `dayStart <= cutoffMinute`.
   - `cycleThroughCutoffMinutes` is read directly from `ev.cycle.forecast[last].availableAtStart` (or `ev.cycle.remaining` when cutoff falls in today's carrier day), guaranteeing exact parity with `evaluate(logged, { asOf: cutoffMinute, config }).cycle.remaining` — including when the log starts over-cycle or crosses a custom `18:40` boundary.

2. **Day-by-day rolling-bucket simulation (same rolling-window model as `recap.ts`):**
   - Initializes `buckets[]` from `ev.cycle.days[0..windowDays-1].onDuty` plus zero buckets for each upcoming carrier day through `cutoffMinute`.
   - For each carrier day `k = 0 .. K`:
     - `availCycle = max(0, limit - sum(buckets[idx - (windowDays - 1) .. idx]))` — starts at `ev.cycle.remaining` on Day 0 and replenishes by each engine drop-off at each carrier-day boundary, while also staying FMCSA-exact on `60/7` if a 7-day cutoff rolls off Day 0.
     - `wallMinutes = max(0, min(dayEnd, cutoffMinute) - max(dayStart, now))` — caps partial first/last days to actual wall-clock minutes remaining so a late-evening sliver before cutoff can never claim a phantom 11-hour drive.
     - `dailyDriveCap = min(LIMITS.DRIVE, max(0, LIMITS.WINDOW - overhead))` — enforces both the 11-hour daily drive limit (§395.3(a)(3)) and the 14-hour shift window (§395.3(a)(2)) when overhead exceeds 3h/day.
     - `driveMinutes = max(0, min(dailyDriveCap, min(availCycle, wallMinutes) - overhead))`.
     - Consumes `driveMinutes + overhead` ONLY when `driveMinutes > 0` (`0` otherwise), so a day with `< overhead` available carries its leftover cycle minutes into the next day instead of burning phantom overhead.
   - `maxLegalMiles = Math.round((totalDriveMinutes / 60) * mph)` — summed before rounding once to avoid per-day rounding drift.

3. **Honest trim lever:**
   - Computed ONLY when `status === 'short'` AND `overheadMinutes >= 30`.
   - Re-runs the exact same `runDayByDaySimulation()` with `overheadMinutes - 30`.
   - Shown ONLY when `trimSim.maxLegalMiles - baseSim.maxLegalMiles > 0`. When the 11-hour daily cap binds (fat cycle) or overhead is `< 30m` or goal is already doable/met, trimming overhead cannot add legal miles and the lever is hidden.

---

## 4. Per-Pin Evidence (`web/test/dom/miles.mjs`, `ML1`–`ML8`)

### Fail-Before Evidence (Stub Swap-Test of `web/src/miles.ts`)

Bundling `web/test/dom/miles.mjs` with `web/src/miles.ts` intercepted by a minimal placeholder stub fails **all 8 pins (`0/8`, `STUB_EXIT=1`)**:

```text
FAIL  ML1. Parity: hours-left equals independent evaluate() + recap drop-offs (literal 33:00 / ~1,596 mi) and 60/7 card names 60
      {"indepNow":720,"indepDrops":1260,"indepTotal":1980,"evCutoffRem":1980,"gotHoursMin":0,"gotRecapsMin":0,"hoursTxt":"0:00","gotMaxMiles":0,"maxTxt":"~0 max legal miles","assumpTxt":"At 57 mph real average · after 1h 15m/day on-duty overhead · 0:00 now + 0:00 recaps","lbl70":"70-hr cycle + recaps through Stub 00:00 (UTC)","got60Rule":70,"got60Min":0,"ev60Rem":1980,"lbl60":"70-hr cycle + recaps through Stub 00:00 (UTC)"}
FAIL  ML2. Recap inclusion: large 11h drop-off on Fri adds +11:00 and +613 mi vs Thu cutoff (one day earlier)
      {"thuHours":0,"friHours":0,"deltaH":0,"thuMiles":0,"friMiles":0,"deltaMi":0}
FAIL  ML3. Overhead binds: raising daily overhead by +1h/day (1h 15m -> 2h 15m) lowers max miles from 1,596 to 1,368 (-228 mi)
      {"beforeDrive":0,"beforeMiles":0,"afterDrive":0,"afterMiles":0,"diff":0}
FAIL  ML4. 11h cap binds: fresh 70h cycle over 4 full days yields exact 4 * 11h * 57 = 2,508 mi (cycle is NOT the limit)
      {"hoursMin":0,"dayCount":0,"driveMin":0,"maxMiles":0,"capNote":"","sixDay":{"days":0,"drive":0,"miles":0}}
FAIL  ML5. Verdict arithmetic: exact cushion (+196 mi), exact shortfall (-304 mi), and calm already-there state with tank
      {"doableOk":false,"vDoable":"stub","shortOk":false,"vShort":"stub","metOk":false,"vMet":"stub","metHours":"0:00","metMax":"~0 max legal miles","hasTrim":false}
FAIL  ML6. Carrier-day boundary: dayStartMinute = 18:40 drops off at 18:40 (not midnight) and matches evaluate()
      {"evBefore":720,"evAfter":1320,"beforeMin":0,"beforeTxt":"0:00","afterMin":0,"afterTxt":"0:00","daysTxt":""}
FAIL  ML7. Trim lever: shown only when short AND trimming 30m/day adds miles; ~114 mi matches re-simulated delta
      {"expectedDelta":-1596,"trimAddsAttr":0,"trimTxt":"","hasTrimDoable":false,"capStatus":"short","capTrimAdds":"0","hasTrimCap":false,"lowOverheadTrim":null}
FAIL  ML8. Hygiene: Plan hub lists 12 items (Miles 12th), shared ClockPick (0 input[type=time]), 0 new storage keys, estimate framing & clean copy
      {"hubCount":12,"lastTwo":["Flip My Clock","Miles Left in My 70"],"timeInputsInTab":0,"hasClockPick":true,"cutoffDisp":"Stub 00:00 UTC","standingTxt":"stub","hasMedical":false,"hasPayroll":false,"closedClean":true,"extraKeys":[]}

0/8 miles pins passed
STUB_EXIT=1
```

### Pass-After Evidence (`TZ=America/Chicago`, `TZ=UTC`, and `TZ=Asia/Kolkata`)

```text
PASS  ML1. Parity: hours-left equals independent evaluate() + recap drop-offs (literal 33:00 / ~1,596 mi) and 60/7 card names 60
PASS  ML2. Recap inclusion: large 11h drop-off on Fri adds +11:00 and +613 mi vs Thu cutoff (one day earlier)
PASS  ML3. Overhead binds: raising daily overhead by +1h/day (1h 15m -> 2h 15m) lowers max miles from 1,596 to 1,368 (-228 mi)
PASS  ML4. 11h cap binds: fresh 70h cycle over 4 full days yields exact 4 * 11h * 57 = 2,508 mi (cycle is NOT the limit)
PASS  ML5. Verdict arithmetic: exact cushion (+196 mi), exact shortfall (-304 mi), and calm already-there state with tank
PASS  ML6. Carrier-day boundary: dayStartMinute = 18:40 drops off at 18:40 (not midnight) and matches evaluate()
PASS  ML7. Trim lever: shown only when short AND trimming 30m/day adds miles; ~114 mi matches re-simulated delta
PASS  ML8. Hygiene: Plan hub lists 12 items (Miles 12th), shared ClockPick (0 input[type=time]), 0 new storage keys, estimate framing & clean copy

8/8 miles pins passed
```

---

## 5. Per-Suite Verification Results (Sequential Foreground Runs, Both Timezones)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **`web` `npm run build`** (`tsc --noEmit` + `build.mjs`) | **PASS** (exit 0, `dist/app.js 522.2kb`) | — | 0 type errors |
| **`engine` `npm test`** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 fail |
| **`web` `npm run smoke`** (typecheck, contrast 44/44 day & 44/44 night, nightlight, ocr-bundle pass 1+2, `smoke.mjs`, and all 15 DOM lanes) | **PASS** (exit 0) | **PASS** (exit 0) | All green in both TZs |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** | **PASS** | via `npm run smoke` (incl. 12-item Plan hub `D10a`) |
| ↳ `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/flip.mjs` | **PASS** (**12/12**) | **PASS** (**12/12**) | via `npm run smoke` |
| ↳ `dom/miles.mjs` | **PASS** (**8/8**) | **PASS** (**8/8**) | Also **8/8** in `TZ=Asia/Kolkata` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | **88/89** (`W2` only) | Pre-existing baseline UTC failure in `W2`; all Plan-hub & room-dissolve pins (`W1`, `W4`, `R1`, `R5`, `P1`–`P4` incl. `'miles'`) **PASS** in both TZs |

---

## 6. Files Added / Modified

- **New:** `web/src/miles.ts` (`0479b0bae2a7c9bd786f485e9133debc77fc77d2`, 565 lines)
- **New:** `web/test/dom/miles.mjs` (`2f5123375b79220064c37906082f7182b8ed35af`, 627 lines)
- **Modified:** `web/src/app.tsx` (`dee504e265e57af950d9949c21d631a54130fb66`)
- **Modified:** `web/src/backnav.ts` (`c96a35fa621e72ce2ef7c27007dfa5ab4ebff0b0`)
- **Modified:** `web/public/styles.css` (`ad12779a5e5219878a9d9906085395ba33b2117d`)
- **Modified:** `web/package.json` (added `test/dom/miles.mjs` to `npm run dom`)
- **Modified (Plan-hub 11→12 & `openMilesPlanner(false)` resets):** `web/test/smoke.mjs`, `web/test/dom/c3.mjs`, `web/test/dom/c3browser.mjs`, `web/test/dom/polish.mjs`, `web/test/dom/rescue.mjs`, `web/test/dom/stack.mjs`, `web/test/dom/motel.mjs`, `web/test/dom/legal.mjs`, `web/test/dom/flip.mjs`, `web/test/dom/carrierday.mjs`, `web/test/dom/revisions.mjs`
- **New:** `HANDOFF-MILES.md` (this file)
- **Untouched:** `web/src/store.ts` (`1323046db6ba07b8c85805f89a103dc16f3776b5`), `engine/` (`0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`)
