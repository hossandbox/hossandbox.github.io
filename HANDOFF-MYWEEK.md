# HANDOFF — Build: "My Week" Master Week Synthesizer (Plan Capstone Tool #6)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-myweek` (copied from `work-milesfix`)
- **Design Foundation:** `RESEARCH-MASTER-TOOL.md`
- **Status:** Complete — all hard lines upheld, fail-before (`0/8` on unmodified `work-milesfix` baseline) and pass-after (`8/8` in `TZ=America/Chicago` and `TZ=UTC`) verified, and all pre-existing suites verified sequentially in both timezones. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Verification | Status |
| :--- | :--- | :--- |
| `engine/` byte-identical | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` = `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` | **PASS** |
| Zero parallel HOS re-implementations | Every clock, violation, rest, split pairing, recap drop-off, and rollout/rescue calculation comes directly from `engine/src/index.ts`, `rollout.ts`, `rescue.ts`, and `recap.ts` | **PASS** |
| `store.ts` additive-only exception | Single additive field `State.weekPlan: WeekPlanDraft` with sanitizer, import/export, `BACKUP_KEY` rotation, and `SIM_KEY` quarantine | **PASS** |
| Zero new `<input type="time">` | Every time-of-day input uses shared `<ClockPick>` (`MyWeekTimeSheet`); durations use chips + duration boxes | **PASS** |
| Shared floor parity | Reads `loggedSegments(s, now)`, `safeRulesConfig(s.config)` (incl. `dayStartMinute` & `timeZone`), and `s.mph` | **PASS** |
| All 12 existing Plan tools intact | Plan hub renders distinct `.plan-capstone` hero card ABOVE the 12 untouched `.plan-item` entries | **PASS** |
| No deploy / no push | Verified | **PASS** |

---

## 2. Design & Architecture Summary

### Overarching Presence on the Plan Tab
My Week is rendered as a flagship `.plan-capstone` card directly under the `Plan` screen title — visually distinct from the 12 `.plan-item` single-load/shift tools listed beneath a `Single-load & shift tools` section heading. When empty, it invites the driver to stack 1–5 upcoming loads + home time; when populated, it shows a live 1-line status summary (`3 loads · Home Fri 09:00 · 3 trades · 17m left`) and tone-matched border/pill (`All clear` / `Tight` / `Conflict` / `Provisional`) computed straight from the shared floor.

### Multi-Load Week Synthesizer (`web/src/week.ts`)
- **Pass 1 — Forward/Backward Chaining + Midnight/Carrier-Day Recap Gating:** Walks active loads sequentially, feeding Load `k`'s actual simulated segments (`OFF`/`ON`/`D`/`SB`) into Load `k+1`'s `evaluate()` (zero fresh-clock resets). For loads with hard appointments, calls `planRollout()` on the chained history and checks whether the unconstrained backwards roll-out hits the carrier-day cycle wall before the next recap drop-off. When holding roll-out to the boundary clears the violation legally, computes the exact hold minutes via binary search verified by `evaluate()`. Multi-shift / multi-day loads fall back to `planTripAll()`.
- **Pass 2 — Split-Sleeper Rescue & Next-Shift Trap Detection (`simulateRescue` + `evaluate`):** When `draft.allowSplits === true` and a straight-10 rest misses Load `k`'s hard appointment, runs `simulateRescue()` on the post-Load-`k-1` chain to test 8/2 and 7/3 splits, then immediately chains the split's exact `simSegments` into Load `k+1` and checks `evaluate()` on Load `k+1`. If the split saves Load `k` but breaks Load `k+1`, flags an explicit priced `split_trap` conflict card rather than silently recommending the split. When `draft.allowSplits === false`, all split recommendations and split callouts are strictly suppressed.
- **Pass 3 — Recaps vs. Best-Fit 34-Hour Reset + Open-Night Fill (`projectRecapVs34`):** Evaluates Strategy A (`Run Recaps`) against Strategy B (`Fit a 34`, scanning natural inter-load gaps), and optionally fills open nights using `projectRecapVs34()` against the driver's usual nightly shift start and budget.
- **Pass 4 — Cross-Engine Conflict Detector & Trade Pricer:** Emits prioritized, priced conflict cards (`split_trap`, `reset34_blocked`, `appt_missed`, `midnight_recap_gate`, `home_time_short`, `tz_and_parking`) with 1-tap `Preview this trade` toggles (e.g., relieve prior dock OFF duty, push appt to fit 34, take Straight 10 & move appt).
- **Guardrails:** Provisional stamp whenever `cycleBasis !== 'known'` or `meaningfulGaps >= 1`; `< 60m` cycle margin or appointment slack classified as `Tight` (never green `All clear`); past-due loads surfaced as `[Mark done] / [Move appt]` and excluded from silent forward chaining; mandatory `Long leg = Sleeper Berth ONLY; verify on your ELD.` callout whenever a split is used; standing estimate disclaimer on verdict card and copyable dispatch summary.

### UI & G7 Tool-to-Tool Drill-Downs (`web/src/app.tsx`, `web/src/backnav.ts`, `web/public/styles.css`)
- **Verdict-first cab layout:** Starting clocks strip → ONE top verdict card → top 3 priced conflicts with 1-tap preview/apply → `A · Run Recaps` vs `B · Fit a 34` strategy switcher → collapsible chained Week Strip (with inline editing, collapsed G6 deadhead/pickup/overrides, and 1-tap `Open When to Roll & PTA` / `Dock delayed? Open Rescue` prefilled drill-downs that return cleanly to My Week on Back) → Home Time & Week Rules card (persisted in `store.ts`) → copyable dispatch summary.
- **Shared ClockPick (`MyWeekTimeSheet`):** Handles home-time target, per-load hard appointment (in facility TZ), and `timeOnly` usual shift start — zero `<input type="time">`.

---

## 3. `web/src/store.ts` Diff (Line-by-Line Explanation)

One additive schema addition (`State.weekPlan: WeekPlanDraft`) was made to `web/src/store.ts` under the authorized exception. Zero existing fields changed meaning, zero existing keys were renamed or removed, and every helper called on the module-load path (`loadSaved() -> parseSaved()`) is declared/hoisted above `loadSaved()` to prevent TDZ errors.

| Diff Hunk (Baseline → New Lines) | Change | Purpose & Safety Invariant |
| :--- | :--- | :--- |
| **`State` interface (L48 → L48–52)** | Added `weekPlan: WeekPlanDraft;` | Additive field storing the driver's multi-load week plan alongside `trip`, `split`, and `loadCheck`. |
| **Schema & defaults (L208 → L210–310)** | Added `WEEK_MAX_LOADS = 5`, `WeekLoadDraft` (G1 + G6: `id`, `label`, `distanceMode`, `miles`, `driveMinutes`, `mph`, `hasAppt`, `apptDate`, `apptTime`, `apptTimeZone`, `dockMinutes`, `dockOff`, `preTripMinutes`, `bufferMinutes`, `deadheadMiles`, `pickupDwellMinutes`, `pickupDwellOff`, `done`), `WeekHomeTarget` (G3: `date`, `time`), `WeekPlanDraft` (G1/G3/G4: `loads`, `homeTarget`, `fillOpenNights`, `usualShiftStartMinutes`, `usualShiftBudgetMinutes`, `allowSplits`, `defaultPreTripMinutes`, `defaultBufferMinutes`, `strategyView`), `WEEK_DISTANCE_MODES`, `WEEK_STRATEGY_VIEWS`, `DEFAULT_WEEK_LOAD`, `DEFAULT_WEEK_PLAN` | Declared BEFORE `INITIAL_STATE`, `parseSaved()`, and `loadSaved()` so module-load initialization has zero TDZ hazard. |
| **`INITIAL_STATE` (L238 → L334–337)** | Added `weekPlan: { ...DEFAULT_WEEK_PLAN, loads: [] }` | Fresh installs start with an empty week (`[]`), `allowSplits: true`, `fillOpenNights: true`, `21:00` / `9h 30m`, `15m` pre-trip, `45m` buffer. |
| **`parseSaved()` (L394 → L490–494)** | Added `weekPlan: sanitizeWeekPlan(s.weekPlan, INITIAL_STATE.weekPlan)` | Legacy saves without `weekPlan` cleanly fall back to `DEFAULT_WEEK_PLAN`; malformed fields are repaired per-field without rejecting the driver's log or tripping `usableSave()` / `BACKUP_KEY` rotation. |
| **`snapshotSimRecord()` (L488 → L585–589)** | Added `weekPlan: s.weekPlan` to the `SIM_KEY` snapshot object (paired with restore in `app.tsx`'s `useRealClock()`) | Guarantees simulated-clock (`nowOverride !== null`) edits to `weekPlan` are quarantined and discarded when the driver returns to the real clock. |
| **Sanitizers (L979 → L1076–1182)** | Added hoisted functions `validIsoDate`, `validWallHM`, `optIntIn`, `sanitizeWeekHomeTarget`, `sanitizeWeekLoad`, `sanitizeWeekPlan` | Rejects impossible calendar dates (e.g. `2026-02-30`), invalid wall times (`25:99`), and invalid IANA zones (`Mars/Phobos` → `''`); clamps numeric bounds (`miles` 1..3000, `driveMinutes` 0..1800, `mph` 45..65, `dockMinutes` 0..720, `deadheadMiles` 0..1000, `pickupDwellMinutes` 0..480, `usualShiftStartMinutes` 0..1439, `usualShiftBudgetMinutes` 60..840); caps `loads` at `WEEK_MAX_LOADS` (5); deduplicates IDs; drops non-object entries safely. |
| **`applyImportedState()` (L1006 → L1203–1206)** | Added `weekPlan: 'weekPlan' in d ? sanitizeWeekPlan(d.weekPlan, cur.weekPlan) : cur.weekPlan` | Mirrors `split` and `loadCheck`: legacy backups without `weekPlan` import cleanly without resetting current state, while backups carrying `weekPlan` round-trip through `sanitizeWeekPlan`. |
| **`draftResets()` (L1024 → L1222–1255)** | Added validation check pushing `'My Week plan'` only when an imported `weekPlan` object has malformed or clamped fields | Clean exports and legacy backups without `weekPlan` report `0` resets; damaged imports explicitly notify the driver that My Week plan values were repaired. |
| **`exportState()` (L1998 → L2226–2229)** | Added `weekPlan: s.weekPlan` to the exported JSON payload | Includes the driver's week plan in JSON backups so export/import round-trips completely. |

---

## 4. Fail-Before / Pass-After Evidence (`web/test/dom/myweek.mjs`, `MW1`–`MW8`)

### Fail-Before (final `myweek.mjs` run against unmodified `work-milesfix` baseline)

```text
FAIL  MW1. Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations
      synthesizeWeek missing
FAIL  MW2. Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)
      synthesizeWeek missing
FAIL  MW3. Split-trap case: split saves Load 2 but breaks Load 3 -> flagged as split_trap conflict, NOT silently recommended
      synthesizeWeek missing
FAIL  MW4. allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues
      synthesizeWeek missing
FAIL  MW5. store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine
      store.ts weekPlan schema/sanitizer missing
FAIL  MW6. Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back
      missing .plan-capstone entry on Plan tab
FAIL  MW7. G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails
      synthesizeWeek missing
FAIL  MW8. Shared floor parity: carrier-day 18:40 boundary & 60/7 cycle match evaluate() exactly
      synthesizeWeek missing

0/8 myweek pins passed
```

### Pass-After (`work-myweek`, BOTH `TZ=America/Chicago` and `TZ=UTC`)

```text
=== TZ=America/Chicago ===
PASS  MW1. Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations
PASS  MW2. Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)
PASS  MW3. Split-trap case: split saves Load 2 but breaks Load 3 -> flagged as split_trap conflict, NOT silently recommended
PASS  MW4. allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues
PASS  MW5. store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine
PASS  MW6. Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back
PASS  MW7. G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails
PASS  MW8. Shared floor parity: carrier-day 18:40 boundary & 60/7 cycle match evaluate() exactly

8/8 myweek pins passed
=== TZ=UTC ===
PASS  MW1. Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations
PASS  MW2. Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)
PASS  MW3. Split-trap case: split saves Load 2 but breaks Load 3 -> flagged as split_trap conflict, NOT silently recommended
PASS  MW4. allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues
PASS  MW5. store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine
PASS  MW6. Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back
PASS  MW7. G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails
PASS  MW8. Shared floor parity: carrier-day 18:40 boundary & 60/7 cycle match evaluate() exactly

8/8 myweek pins passed
```

**Section D Math Parity Verification (Engine-Derived):**
- **Load 1 (`Chi → Nash`, 495 mi, Wed 09:00 CT, 2h ON dock):** Roll `Tue 22:30 CT`, arrive `Wed 08:15 CT` (+45m early), PTA `Wed 11:00 CT`, cycle remaining = **135m (`2h 15m`)**.
- **Load 2 (`Nash → CLT`, 410 mi, Thu 06:30 ET, 2h ON dock):** Unconstrained roll `Wed 21:02 CT`, **midnight recap hold = +43m** → Roll `Wed 21:45 CT`, arrive `Thu 06:28 ET` / `Thu 05:28 CT` (+2m early), PTA `Thu 08:30 ET` / `Thu 07:30 CT` (`ptaInSweetSpot = true`), cycle remaining = **122m (`2h 02m`)**.
- **Load 3 (`CLT → Home`, 550 mi, 30m ON drop & hook, home target Fri 09:00 CT):** **Midnight recap hold = +13m** → Roll `Thu 21:58 CT`, arrive `Fri 08:43 CT`, home/done **`Fri 09:13 CT`** (13m past target), cycle remaining = **17m (`0h 17m`)**.
- Independent `evaluate([...logged, ...simSegments], { asOf: endMinute, config })`: **0 violations**, `cycle.remaining === 17` (exact match to Section D).

---

## 5. Per-Suite Verification Table (Sequential Runs, Both Timezones)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **`web` `npm run build`** (`tsc --noEmit` + `build.mjs`) | **PASS** (exit 0, `dist/app.js 586.8kb`) | — | 0 type errors |
| **`engine` `npm test`** | **PASS** (**108/108**) | **PASS** (**108/108**) | `engine/` hash `0949296e...` byte-identical |
| **`web` `npm run smoke`** (typecheck, contrast 44/44 day & 44/44 night, nightlight, ocr-bundle pass 1+2, `smoke.mjs`, and all 16 DOM lanes) | **PASS** (exit 0) | **PASS** (exit 0) | All green in both TZs |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` + `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** (**37/37**) | **PASS** (**37/37**) | Confirms 0 new `<input type="time">` |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/flip.mjs` | **PASS** (**12/12**) | **PASS** (**12/12**) | via `npm run smoke` |
| ↳ `dom/miles.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | Confirms 12 `.plan-item` intact |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| ↳ `dom/myweek.mjs` (**NEW**) | **PASS** (**8/8**) | **PASS** (**8/8**) | Fail-before `0/8` on `work-milesfix` baseline |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | **88/89** (`W2` only) | Known pre-existing baseline UTC failure in `W2` (identical to `work-milesfix`) |

---

## 6. Files Changed vs. `work-milesfix`

- **New:** `web/src/week.ts` — Multi-load Week Synthesizer (`synthesizeWeek`, `createNextWeekLoad`, chained forward/backward simulation, midnight/carrier-day recap gating, split-sleeper rescue + Next-Shift Trap detection, Recaps vs. best-fit 34 comparison, cross-engine conflict detector & trade previewer, copyable dispatch summary).
- **New:** `web/test/dom/myweek.mjs` — `MW1`–`MW8` DOM & engine pin suite.
- **New:** `HANDOFF-MYWEEK.md` — This handoff document.
- **Modified:** `web/src/store.ts` — Single additive `State.weekPlan: WeekPlanDraft` schema addition with `sanitizeWeekPlan`, `parseSaved`, `snapshotSimRecord` (`SIM_KEY`), `applyImportedState`, `draftResets`, and `exportState` wiring (see §3).
- **Modified:** `web/src/app.tsx` — Flagship `.plan-capstone` My Week entry above the 12 `.plan-item` tools on `PlanTab`, `MyWeekTab`, `MyWeekTimeSheet` (shared `ClockPick`), G7 prefill bus for `openRolloutPlanner`/`openRescuePlanner` with Back-to-My-Week return, `SIM_KEY` restore of `weekPlan` in `useRealClock()`, and `App()` room/backnav wiring.
- **Modified:** `web/src/backnav.ts` — Added `'myweek'` to `PLAN_SCREENS`.
- **Modified:** `web/public/styles.css` — Added `.plan-capstone` and `.mw-*` styles using existing WCAG AA palette tokens (all `>= 12px` font-size floor).
- **Modified:** `web/package.json` — Added `myweek.mjs` to the `dom` test script.
- **Untouched:** `engine/` (byte-identical, sha256 `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`).

---

## 7. Deliberately Left Out

- **Writing week shifts to `s.tentative` ("Put next shift on Log as what-if"):** Deliberately kept `My Week` 100% read-only against `s.segments`, `s.current`, and `s.tentative` to preserve strict visual and state separation from the Log tab and avoid interfering with `computeLevers()` on `Now` (which shuts off whenever `s.tentative.length > 0`).
- **Auto-advancing loads via GPS/sensors or live traffic/parking feeds:** Explicitly out of scope for the 100% offline-first planning boundary.
