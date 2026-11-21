# HANDOFF-RECAP — Weekly Recap vs. 34-Hour Reset & Home-Time Planner

**Workspace:** `/home/hatch/workspace/hos-patch/work-recap`  
**Date:** 2026-11-21  
**Status:** Verified green across all gate lanes; `web/src/store.ts` byte-identical; **not pushed or deployed**.

---

## 1. Files Changed

Zero `web/src/store.ts` changes, zero `engine/` changes.

- **`web/src/recap.ts`** *(new)* — Pure projection engine (`projectRecapVs34`, `buildVerdict`, `defaultResetStart`, `wallMinuteInCarrierDay`, `parseIsoDay`, `terminalClock`, `fmtWallHM`) built strictly on existing engine and store exports. Projects the next 7 planned shifts (straddling 7–8 carrier days for overnight shifts) side-by-side under **(A) Keep Running Recaps** vs. **(B) Take a 34-Hour Reset**, detects the **Recap Wall**, evaluates optional **Home-Time** targets with an exact binary-searched daily cruise cap, scans candidate reset start days for best timing, and respects both `70/8` and `60/7` cycles, arbitrary `dayStartHour` (0–23), and home-terminal timezone + DST transitions.
- **`web/src/app.tsx`** — Added `I.week` icon, reactive module-level sub-screen state (`openWeekPlanner`, `isWeekPlannerOpen`, `useWeekPlanner`, matching `useSheet()` so no store schema change is needed), the 5th `.plan-item` entry **`Weekly recap vs. 34`** at the **bottom** of `PlanTab` (same size/markup as existing entries), and the **`WeekRecapTab`** screen (plain-English Verdict Banner first, side-by-side 7-day comparison cards, optional Home-Time target card with one-tap cruise-cap apply, transparent empty/unlogged past-day disclosure + collapsible read-only past-days breakdown from logged segments, nightly budget presets `8h / 8h 30m / 9h 30m / 10h / 11h`, shift start time presets + custom time with live overnight split readout, 34-hour reset day/time controls, custom per-night minute-accurate editor, and side-by-side day-by-day forecast). Wired into `.page-plan`, bottom-bar `Plan` tap, tab-change cleanup, and `backNav`.
- **`web/src/backnav.ts`** — Added `'week'` to `PLAN_SCREENS` (`['split', 'trip', 'load', 'week']`) so pressing the phone's Back button from `WeekRecapTab` steps cleanly back to `Plan`.
- **`web/public/styles.css`** — Added `.wrecap-*` layout/card/chip/badge rules before `@media print`, using only existing palette tokens (`--bg`, `--panel`, `--panel2`, `--line`, `--text`, `--muted`, `--good`, `--warn`, `--bad`, `--accent`, `--accent-solid`, `--on-accent`, `--chip-ink`, `--tint-*`) and honoring the 48px button / 56px field touch-target floors in both day and night themes.
- **`web/test/smoke.mjs`** — Added the `weekly recap vs 34` test block covering midnight-crossing overnight splits (`21:00 → 07:00`), non-zero `dayStartHour` (`06:00`), Recap Wall detection, Strategy A vs. Strategy B 34-hour reset totals, engine `evaluate()` zero-cycle-violation cross-check on simulated segments, Home-Time legality + exact binary-searched cruise cap optimality, `60/7` cycle variant (both overnight midnight-drop-off and daytime cases), unlogged-days count, Plan hub bottom placement (5th `.plan-item`), and SSR verdict-before-forecast order.
- **`web/test/dom/c3.mjs`** — Re-aimed `D10a` to pin 5 items on the Plan hub (`Hours coming back` 4th opening `recap`, `Weekly recap vs. 34` 5th at the bottom).
- **`web/test/dom/c3browser.mjs`** — Kept the Plan hub count assertion aligned with the 5-item list (`Hours coming back` 4th, `Weekly recap vs. 34` 5th).
- **`web/test/dom/revisions.mjs`** — Added 4 DOM pins (`W1`–`W4`) exercising Plan hub bottom placement, click-to-open + verdict-first layout + Back return, live tight-cycle Recap Wall + Home-Time select + `8h 30m` preset interaction, `60/7` cycle variant + empty-day disclosure copy, and auto-close on tab leave.
- **`web/test/dom/polish.mjs`** — Added `sweep('plan-5', [tab('Plan'), planItem(4)])` so Chromium audits the new screen's touch-target floors, zero horizontal overflow, and zero console/page errors.
- **`HANDOFF-RECAP.md`** — Added this handoff report.

---

## 2. How the Math Works (and Engine/Store Exports Used)

### Exports Consumed
- From **`engine/src/index.ts`**:
  - `evaluate(logged, { asOf: now, config })` — computes the authoritative rolling-window history (`ev.cycle.days`, `ev.cycle.used`, `ev.cycle.remaining`, `ev.cycle.restartEnd`) honoring overlap resolution and any prior 34-hour restart already in the driver's record.
  - `carrierDayStart(minute, config)` and `nextCarrierDayStart(dayStart, config)` — build the DST-safe carrier-day calendar (`windowDays` past days + 9 future carrier days) aligned to `config.dayStartHour` in `config.timeZone`.
  - `dayLabel(dayStart, config)` and `localToMinute(y, m, d, h, tz)` — map home-terminal wall-clock shift starts and 34-hour reset starts to exact UTC epoch minutes inside each carrier day.
  - `LIMITS` (`LIMITS.RESTART = 2040`, `LIMITS.WINDOW = 840`) and types (`RulesConfig`, `Segment`).
- From **`web/src/store.ts`** *(unchanged)*:
  - `loggedSegments(s, now)` — derives past on-duty totals strictly from non-tentative logged segments plus the live status up to `now` (never what-if rows).
  - `cycleParamsOf(config)` — resolves `limit` (`4200` for `70/8`, `3600` for `60/7`) and `windowDays` (`8` or `7`).
  - `cycleBasis(s, now, windowDays)`, `dur`, `zoneShort`, `terminalMidnightOnDevice`, `deviceTz`.

### Projection Algorithm
1. **Past Window Extraction:** `evaluate(logged, { asOf: now, config }).cycle.days` seeds the initial `windowDays` carrier-day on-duty buckets (oldest first, ending with Today). Any past window day not covered by logged segments (and not cleared by an earlier 34-hour restart) counts as `0m` and increments `unloggedPastDays`, surfaced explicitly in the UI warning banner and past-days pill list.
2. **Shift Start & Overnight Boundary Splitting:** For each of the 7 projected shifts (starting Today if today's planned `shiftStartMinutes` is `>= now`, otherwise Tomorrow so today's logged hours are never double-counted), `wallMinuteInCarrierDay` places `[shiftStart, shiftStart + planned)` in `config.timeZone` and splits it at `dayEnd = nextCarrierDayStart(dayStart, config)`:
   - **Leg 1** `[shiftStart, min(shiftEnd, dayEnd))` runs on carrier day `d` against the rolling window `[d - (windowDays - 1) .. d]`.
   - **Carrier-Day Roll** at `dayEnd`: day `d + 1 - windowDays` drops off (`dropsOffAtNextRoll`), replenishing available cycle hours to `availAfterRoll`.
   - **Leg 2** `[dayEnd, shiftEnd)` (when `shiftEnd > dayEnd`) runs on carrier day `d + 1` against the replenished window `[d + 1 - (windowDays - 1) .. d + 1]`.
3. **Strategy A (Recaps) vs. Strategy B (34-Hour Reset):**
   - Strategy A runs all 7 shifts through the rolling window with no added restart. The first shift with `plannedMinutes > 0 && usableMinutes < plannedMinutes` is reported as the **Recap Wall**.
   - Strategy B reserves `[resetStart, resetStart + 2040)` as continuous `OFF` duty. Each shift leg is clipped against `[resetStart, resetEnd)`: pre-reset work uses the pre-reset rolling window, overlap minutes inside the 34h window are blocked (`0m`), and once the timeline reaches `resetEnd`, prior day buckets are snapshotted (preserving pre-reset day totals) and cleared to `0` (§395.3(c)), giving a fresh `limit` (`70h` or `60h`) for post-reset work.
4. **Home-Time Target & Daily Cruise Cap:** When `homeTargetShifts` (`1..7`) is set, Strategy A is checked for zero pinch across shifts `0 .. targetShifts - 1`. Exact binary search over `C ∈ [0, 840]` minutes (preserving any night explicitly set to `0m` as a planned off-day) computes `cruiseCapMinutes` — the highest uniform nightly shift cap that cruises to Home Time legally on recaps.

---

## 3. Verdict-Banner Logic (`buildVerdict`)

Rendered at the very top of `WeekRecapTab` (`data-wrecap-verdict="1"`):

- **No planned hours (`totalPlannedMinutes === 0`):** tone `good` — `"No shift hours planned yet — pick a nightly budget to compare recaps vs. a 34-hour reset."`
- **Recap Wall detected (`recaps.wall !== null`):** tone `bad` when pinched shift `< 3h` (`180m`), else `warn`:
  - `netDelta > 0`: `"Recaps pinch to <usable> on <Day>; a 34 starting <ResetStart> nets +<delta> by <EndDay>."`
  - `netDelta === 0`: `"Recaps pinch to <usable> on <Day>; a 34 starting <ResetStart> breaks even (<totalB>) by <EndDay>."`
  - `netDelta < 0`: `"Recaps pinch to <usable> on <Day>, but still beat a 34 starting <ResetStart> by +<-delta> through <EndDay>."`
  - If scanning upcoming start days finds a 34-hour start that beats the currently chosen reset (`bestReset.deltaMinutes > max(0, netDelta)`), appends a `tipLine` with a one-tap `"Use <Day HH:MM>"` button.
- **No Recap Wall (`recaps.wall === null`):** tone `good`:
  - `netDelta < 0`: `"Recaps cover all 7 shifts (<totalA>) with no wall — skipping a 34 saves +<-delta> through <EndDay>."`
  - Otherwise: `"Recaps cover all 7 shifts (<totalA>) with no wall — no 34-hour reset needed."`
- **Home-Time Target line (appended whenever selected):**
  - Legal: `"Home time (<Day Mon D>): on track on recaps — up to <cap>/shift stays legal."`
  - Short: escalates `good` tone to `warn` and reads `"Home time (<Day Mon D>): short <shortfall> on recaps — cap shifts at <cap>/night to cruise there legally."` (or notes cycle tapped out when `cap === 0`).

---

## 4. Test Pins Added & Re-Aimed

- **`web/test/smoke.mjs`** *(new section: `weekly recap vs 34`)*:
  - Overnight `21:00 → 07:00` (`10h`) fixture splitting `3h + 7h` across midnight (`dayStartHour = 0`) and `9h + 1h` across `dayStartHour = 6`.
  - Exact Recap Wall detection (`5h 00m` usable on Wed, `5h 00m` shortfall) and Verdict Banner wording.
  - Strategy B 34-hour reset totals (`3600m` vs. pinched recaps, positive net delta, fresh `4200m` post-reset cycle).
  - Independent engine cross-check: `evaluate([...segs, ...simSegments])` produces `0` `CYCLE` violations for both strategies.
  - Home-Time legality + exactness check on `cruiseCapMinutes` (`cap` passes legally, `cap + 1` fails).
  - `60/7` cycle variant: `3600m` limit / `7`-day window, verifying both overnight midnight drop-off (`180m` regained on shift 7 → `3780m` total) and daytime (`0m` on shift 7 → `3600m` total).
  - Plan hub bottom placement (5th `.plan-item`) and SSR render order (verdict banner before day-by-day forecast).
- **`web/test/dom/revisions.mjs`** *(new pins `W1`–`W4`)*:
  - `W1`: 5 `.plan-item` entries on Plan hub with `"Weekly recap vs. 34"` last; tapping opens `WeekRecapTab` with verdict banner before forecast; Back returns to Plan hub.
  - `W2`: Tight-cycle fixture verdict + live Home-Time `<select>` cruise cap + `8h 30m` preset toggle.
  - `W3`: `60/7` cycle display + explicit unlogged-days-counted-as-0h notice on empty log.
  - `W4`: Leaving Plan tab resets `WeekRecapTab` so returning to Plan shows the 5-item hub.
- **`web/test/dom/polish.mjs`** *(new sweep `plan-5`)*:
  - Sweeps `planItem(4)` (`Weekly recap vs. 34`) in real Chromium for touch-target floors, zero horizontal overflow, and zero page errors.
- **Re-aimed pins:** `D10a` in `web/test/dom/c3.mjs` and the Plan hub check in `web/test/dom/c3browser.mjs` updated from 4 items to 5 items while preserving `"Hours coming back"` at index 3 and pinning `"Weekly recap vs. 34"` at index 4.

---

## 5. Verification Results (Full Gate)

All lanes ran and passed with exit code `0`:

| Lane | Command | Result |
| --- | --- | --- |
| Build + Typecheck | `cd web && npm run build` | **PASS** (exit 0; `tsc --noEmit` clean, `dist/app.js` 296.8kb) |
| Smoke (UTC) | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` OK (incl. `weekly recap vs 34`), `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Smoke (Chicago) | `cd web && TZ=America/Chicago npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` OK (incl. `weekly recap vs 34`), `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Auditfix (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** (**185/185**, exit 0) |
| Polish (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/polish.mjs` | **PASS** (**267/267**, exit 0, incl. `plan-5`) |
| Layout (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/layout.mjs` | **PASS** (**354/354**, exit 0) |
| Revisions (Chicago, esbuild) | `cd web && ./node_modules/.bin/esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**50/50**, exit 0) |
| Gemini (Chicago, esbuild) | `cd web && ./node_modules/.bin/esbuild test/dom/gemini.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-gemini.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**, exit 0) |

---

## 6. Engine Untouched Proof

- `git hash-object web/src/store.ts` **before**: `1323046db6ba07b8c85805f89a103dc16f3776b5`
- `git hash-object web/src/store.ts` **after**:  `1323046db6ba07b8c85805f89a103dc16f3776b5`
- `web/src/store.ts` is byte-identical; no persisted store schema fields were added.
