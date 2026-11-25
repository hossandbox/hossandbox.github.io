# HANDOFF — Fix Round 2: "My Week" Master Week Synthesizer (`work-myweekfix2`)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-myweekfix2` (copied from `/home/lae/hos-build/work-myweekfix`)
- **Review / Brief:** `~/hos-build/REVIEW-MYWEEKFIX.md`, `~/hos-build/brief-myweekfix2-neon.txt`
- **Source Run Log:** `~/hos-build/agy-myweekfix2.log` (session hit the 1-hour print timeout at `3586s` while starting `engine npm test` after all code edits, `typecheck`, `probe_check`, `perf_diag`, fail-before `myweek.mjs`, and pass-after `myweek.mjs` completed)
- **Status:** All Round 2 items (**N1**, **H5**, **H6-residual**, **N2**, **restart-wait nit**) implemented and verified by `myweek.mjs` (`18/18` PASS in both `TZ=America/Chicago` and `TZ=UTC`, both in the build run and independently re-verified by Ada). **No code or test files modified in this handoff pass. Not deployed, not pushed.**

---

## 1. Hard Invariants Verified

| Invariant | Verification / Evidence | Status |
| :--- | :--- | :--- |
| `engine/` untouched vs `work-myweekfix` | `diff -rq /home/lae/hos-build/work-myweekfix/engine /home/lae/hos-build/work-myweekfix2/engine` → clean (0 diffs; independently confirmed by Ada) | **PASS** |
| `web/src/store.ts` untouched vs `work-myweekfix` | `diff -u /home/lae/hos-build/work-myweekfix/web/src/store.ts /home/lae/hos-build/work-myweekfix2/web/src/store.ts` → clean (0 diffs; independently confirmed by Ada) | **PASS** |
| Modified files vs `work-myweekfix` | `diff -rq --exclude=node_modules --exclude=dist-test --exclude=dist` → confined strictly to `web/src/week.ts`, `web/src/app.tsx`, `web/test/dom/myweek.mjs` (+ this handoff) | **PASS** |
| Zero new `<input type="time">` | `grep -rn 'type="time"' web/src/` → unchanged (same 3 pre-existing sites at `app.tsx:3831, 5987, 6025`); `diff -u` added-line check → `0` matches | **PASS** |
| Zero new `localStorage` / `_KEY` | `diff -u` added-line grep for `localStorage\|_KEY` across `app.tsx` & `week.ts` → `0` matches | **PASS** |
| TypeScript typecheck | `cd web && npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → EXIT 0 | **PASS** |
| No deploy / no push | Verified | **PASS** |

---

## 2. Per-Item Summary (What Changed, `file:line`)

### N1 (HIGH) — Time-Aware Plan Hub Cache
- **Where:**
  - `web/src/week.ts:2526` (`export const WEEK_HUB_TIME_BUCKET_MINUTES = 15`)
  - `web/src/week.ts:2541–2593` (`computeWeekHubFingerprint` adds `timeBucket = Math.floor(input.now / WEEK_HUB_TIME_BUCKET_MINUTES)` to the fingerprint alongside `dayStart`, `staleBits`, `curKey`, `segParts`, `draftKey`, and config/mph/basis)
  - `web/test/dom/myweek.mjs:1156–1221` (rewritten `MW14` to match the 15-minute bucket scheme)
  - `web/test/dom/myweek.mjs:1311–1346` (new `MW17(a)` implementing Opus's `hubstale` fixture in both pure `getWeekHubSummary` and rendered `PlanTab` DOM)
- **Chosen Invalidation Scheme & Worst-Case Staleness Bound:**
  - **Scheme:** Coarse **15-minute time bucket** (`Math.floor(input.now / 15)`), combined with exact `carrierDayStart(now, config)` and exact per-load `staleBits` (`apptMin < now`), so carrier-day rollovers and past-due appointment crossings still invalidate immediately on the exact minute they occur.
  - **Within-window behavior:** Repeated hub lookups and per-minute `useNow()` ticks within the same 15-minute bucket (`+0`, `+1`, …, `+14` when aligned to a bucket boundary) hit the cache with **0** extra syntheses; advancing past the 15-minute boundary triggers **1** recompute; ticks while off the Plan tab (`Now` panel) perform **0** syntheses even across bucket boundaries.
  - **Worst-case staleness bound:** **At most 15 minutes** (strictly `< 15m`, i.e., `0–14` minutes of clock drift between bucket boundaries; `0m` lag for carrier-day rollover, appointment-past-due transition, log edit, status tap, or draft edit).

### H5 (OPEN → CLOSED) — Outcome-Only Split Trap + Corrected Pins + Constructed Trap Fixture
- **Where:**
  - `web/src/week.ts:820–857` (`evaluateNextLoadOutcome`: replaced asymmetric `isPostSplit` with symmetric `allowSameShiftLaunch` so both `split → (k+1)` and `straight-10 → (k+1)` evaluate legal same-shift continuation when a 10h reset would miss Load `k+1`'s appointment)
  - `web/src/week.ts:993`, `:1041–1046`, `:1090–1107`, `:1113–1236` (`trySplitRescueForLoad`: removed `worseCycleGate` and `worseCycleRem` completely; trap now fires strictly on outcome comparison, plus added `'split_rest'` cause when mandatory trailing SB/rest pushes `postSplitEnd > straight10Pta`)
  - `web/src/week.ts:1671–1701` (`runWeekStrategy`: added symmetric same-shift continuation check in Pass 1 so straight-10 can legally run Load `k+1` on a fresh shift's remaining 11h/14h clocks instead of inserting an unnecessary second 10h reset)
  - `web/src/week.ts:2835–2839` (`straight10-push` verified trade description updated for fresh-shift / restart-wait wording)
  - `web/test/dom/myweek.mjs:293–369` (corrected `MW3` using the constructed genuine trap fixture)
  - `web/test/dom/myweek.mjs:963–1040` (corrected `MW12(a/b/c)` for `p7`, `p5`, `p4`)
  - `web/test/dom/myweek.mjs:1406–1466` (new `MW18` covering `SEED=2004807488` + independent brute-force `evaluate()` proof on the constructed trap fixture)
- **Outcome-Only Comparison (as implemented at `web/src/week.ts:1140–1146`):**
  ```ts
  const worseViolations = splitNext.violations.length > s10Next.violations.length;
  const worseApptLate = splitNext.lateMinutes > s10Next.lateMinutes;
  const worseHomeLate = splitNext.homeLateMinutes > s10Next.homeLateMinutes;
  const worseFinishNoAppt =
    nextLoad.apptMinute === null && (splitNext.arrival > s10Next.arrival || splitNext.pta > s10Next.pta);
  if (worseViolations || worseApptLate || worseHomeLate || worseFinishNoAppt) { ... }
  ```
  - Hold length (`midnightGateMinutes`) and raw remaining cycle never enter the trap condition.
  - When none of the four outcome predicates hold, the split is **kept** (Leg `k` stays on time), and any cycle wall on Leg `k+1` is surfaced through ordinary `appt_missed`, `midnight_recap_gate`, and/or `home_time_short` conflict cards.
- **Corrected Expectations (`MW12` & `MW18`):**
  - **`p7` (old `MW3`, `MW12(a)`):** **0 traps**; split kept on Leg 2 (`usedSplit === true`); Leg 3 slack `-255m` (`4h 15m` late vs. `9h 15m` on straight 10).
  - **`p5` (`MW12(b)`):** **0 traps**; split kept on Leg 2 (`usedSplit === true`, `meetsAppt === true`); both paths finish Wed 01:15 CT (`homeCheck.slackMinutes === -735`, `12h 15m` past Tue 13:00 home target). Reported honestly via `home_time_short` (`12h 15m past home · 8h 45m margin`) and `midnight_recap_gate` (`Hold roll-out +12h 15m`) with zero `"vs. 7h 30m on straight 10"` / `"on straight 10"` wording.
  - **`p4` (`MW12(c)`):** **0 traps**; split kept on Leg 2 (`usedSplit === true`, `meetsAppt === true`); Leg 3 hits the Wed 00:00 cycle wall and arrives Wed 01:15 CT (`apptSlackMinutes === -915`, `15h 15m` late), reported as `appt_missed` (`Late 15h 15m`) and `midnight_recap_gate` (`Hold roll-out +12h 30m`).
  - **`SEED=2004807488` (`MW18(a)`, `allowSplits: true`):** **0 traps**; split kept on `X2` (`usedSplit === true`, `meetsAppt === true`, `splitTrapDetected === false`); `X3` arrives Wed 21:06 (`3h 06m` late) on both paths.
- **Constructed Genuine Trap-Fires Fixture (`MW3` & `MW18(b)`):**
  - **Setup:** Fresh 70/8 driver (`America/Chicago`, 00:00 carrier day, `55 mph`, `preTrip = 15m`, `buffer = 0m`, `allowSplits = true`), OFF Sun Nov 8 18:00 → Mon Nov 9 06:00 CT (`NOW = Mon Nov 9 06:00 CT`).
    - **Leg 1:** `330 mi` (`6h 00m` D + `15m` pre-trip), appt `Mon 12:15`, `2h 00m` ON dock → rolls `Mon 06:00`, arrives `Mon 12:15` (`0m` slack), PTA `Mon 14:15` (`5h 00m` drive, `5h 45m` window left).
    - **Leg 2:** `165 mi` (`3h 00m` D + `15m` pre-trip), appt `Mon 22:30`, `0m` dock.
    - **Leg 3:** `275 mi` (`5h 00m` D + `15m` pre-trip), appt `Tue 09:00`, `0m` dock.
  - **Numbers (verified by independent minute-by-minute `evaluate()` brute-force scan in `MW18(b)`):**
    - **8/2 split path on Leg 2:** 2h short break (`Mon 14:15–16:15`) → rolls `Mon 16:15` → arrives `Mon 19:30` (on time, saves Leg 2 by `8h 00m`) → waits OFF until `Mon 22:30` → mandatory **8h 00m trailing SB** (`Mon 22:30–Tue 06:30`) → earliest legal Leg 3 arrival = **`Tue 11:45`** (**`2h 45m` / `165m` LATE**).
    - **Straight-10 path on Leg 2:** 10h reset (`Mon 14:15–Tue 00:15`) → rolls `Tue 00:15` → arrives `Tue 03:30` (`5h 00m` late on Leg 2, with `8h 00m` drive and `10h 45m` window still fresh) → rolls Leg 3 at `Tue 03:45` on the fresh shift → arrives **`Tue 09:00`** (**ON TIME, `0m` late**; brute-force earliest legal arrival `Tue 08:45`, `-15m` early).
  - **Result:** `split_trap` fires (`trapCause: 'split_rest'`), price **`Late 2h 45m on Leg 3 (8h 00m split SB)`**, body `"An 8/2 split saves Leg 2 by 8h 00m, but the required 8h 00m trailing sleeper berth delays Leg 3 — leaving Leg 3 2h 45m late (vs. on time on straight 10)."`. Split is rejected (`l2.usedSplit === false`, `l2.splitTrapDetected === true`, `l3.meetsAppt === true`), and the verified `straight10-push` trade clears the trap with 0 violations and both Leg 2 and Leg 3 on time.

### H6 Residual (LOW) — Trade Verification Against Winning / Shown Lane (+ H1 Budget Preservation)
- **Where:**
  - `web/src/week.ts:2724–2787` (`verifyTradeDraft` removed the `'recaps_only'` mode — every non-`reset34_only` trade now runs `mode: 'both'` and re-runs `pickRecommendedStrategy` so `after.winner` matches the exact lane the preview will display, including across lane flips caused by dock-OFF changes)
  - `web/src/week.ts:2831–2832` (`straight10-push`), `:2981–2990` (`shift-appt`), `:3063–3067` (`relieve-dock`), `:3133–3138` (`relieve-home-dock`) — all verify claims against `after.winner`
  - **H1 perf preservation (kept 5-load cold `< 1000 ms` after switching `verifyTradeDraft` to `'both'`):**
    - `web/src/week.ts:386, 452, 655, 829, 891, 1541, 1951, 2472` (`forecastDays: 0` on internal `evaluate()` calls that do not consume `cycle.forecast`, and `forecastDays: 2` where only 2 upcoming carrier days are needed; `startingEval` at `:2675` retains `forecastDays: 8`)
    - `web/src/week.ts:1350, 1445–1487, 1880–1922, 2211–2212, 2305–2389` (exact zero-loss branch-and-bound `abortIfWorseThan` + unchanged-prefix lower-bound prune + 34h-restart suffix-invariance prune in `runCoreStrategies` when `baseResetByIdx` is passed for trade verification; brought 5-load cold from `1530.9 ms` down to **`631.0 ms`**)
  - `web/test/dom/myweek.mjs:1103–1116` (extended `MW13` to verify every `relieve-home-dock-*` claim phrasing — `Recovers +X`, `reaches home on time with Y`, `leaves Y (Z past home)` — against the post-trade winning lane)
- **Verification on `SEED=31337` (`s0=357445184`):** `relieve-home-dock-x0` now reads `"Recovers +17h 18m of cycle — reaches home on time with 23h 13m cycle left."`, matching the post-trade `reset34` preview (`79m` early, `1393m` = `23h 13m` cycle). `fuzz2v` across all 120 cases (seeds `5`, `31337`, `4242`): **286/286** offered trades verified, **0** false claims.

### N2 (LOW) — Neutral `PlanTab` Inactive / No-Cache Placeholder & Off-Plan Cache Invalidation
- **Where:**
  - `web/src/app.tsx:4917` (`lastHubRef` now stores `{ fp: string; snap: WeekHubSnapshot } | null`, keyed by `hubFp`)
  - `web/src/app.tsx:4933–4957` (when `!isActive`, returns `lastHubRef.current.snap` **only if** `lastHubRef.current.fp === hubFp`; otherwise returns neutral placeholder `{ ..., hubSummary: "${nonDoneCount} load(s) planned — tap to review", placeholder: true }`)
  - `web/src/app.tsx:4973–4985` (`capstoneTone` is `''` (neutral) and `capstonePill` is `'Review'` whenever `weekSnap.placeholder` is true — never `'All clear'` or `tone-good`, and never stale from a prior plan after an off-Plan edit)
  - `web/test/dom/myweek.mjs:1347–1382` (new `MW17(b)` verifying both cold off-Plan mount and off-Plan plan mutation revert to neutral `'Review'` with `0` syntheses)

### NIT — Accurate 34-Hour Restart Wait Labeling (`SEED=383857408`)
- **Where:**
  - `web/src/week.ts:171` (added `midnightGateKind: 'recap' | 'restart34' | null` on `WeekLoadOutcome`)
  - `web/src/week.ts:1508`, `:1628–1641` (detects `isRestartWait = restartCompleteAt > targetRollOut && gatedRoll >= restartCompleteAt && hasCycleViolationAfter(..., false)` and sets `midnightGateKind = 'restart34'` with `midnightGateBoundary = formatDualTime(restartCompleteAt, ...)` and `midnightGateDropOffMinutes = 0`)
  - `web/src/week.ts:1696, 1757, 1767` (clears `midnightGateKind = null` whenever hold is cleared)
  - `web/src/week.ts:1802–1804` (badge: `34h wait +...`), `:3039–3101` (conflict title/body/price/trade: `"waits for 34-hour restart"`, `"completes a 34-hour restart"`, `"34h restart wait +..."`), `:3270–3271` (`bindingTightMarginLabel`: `"restart wait"`), `:3366–3368` (verdict headline), `:3477–3479` (dispatch text)
  - `web/src/app.tsx:10173–10175` (load card roll-out sublabel renders `34h restart wait +${dur(o.midnightGateMinutes)}` instead of `Gated +... for ${res.dayStartWord}`)
  - `web/test/dom/myweek.mjs:1383–1396` (new `MW17(c)` asserting `SEED=383857408` recaps lane `X1` has `midnightGateMinutes === 697`, `midnightGateKind === 'restart34'`, `midnightGateBoundary.homeShort === 'Wed 09:35 Central'`, and DOM card shows `34h restart wait` without `for 18:40`)

---

## 3. Fail-Before / Pass-After Evidence (`MW1`–`MW18`)

### Fail-Before (new `work-myweekfix2/web/test/dom/myweek.mjs` run against unmodified `~/hos-build/work-myweekfix`, from `agy-myweekfix2.log` step 168)

Identical **12/18 PASS, 6 FAIL** (`EXIT=1`) in both `TZ=America/Chicago` and `TZ=UTC`:

```text
PASS  MW1, MW2, MW4, MW5, MW6, MW7, MW8, MW9, MW10, MW11, MW15, MW16
FAIL  MW3  -> trapConflict: null, l2Split: true, l2Trap: false, l3Slack: -165 (work-myweekfix missed genuine 8/2 trailing-SB trap)
FAIL  MW12 -> p7Ok: true, p5Ok: false (traps: 1, l2Split: false, l2Meets: false), p4Ok: false (traps: 1, l2Split: false, l2Meets: false)
FAIL  MW13 -> 293 trades checked, 2 fails on s0=357445184 relieve-home-dock-x0 (claimed "Recovers +3h 00m ... leaves 8h 55m (2h 33m past home)" vs actual reset34 winner gain=1038, cyc=1393, slack=79)
FAIL  MW14 -> countWithinWindow: 1, countAfterWindow: 1, countInNextWindow: 1 (did not recompute past 15m window)
FAIL  MW17 -> pureStaleOk: false (+120m & +240m hub stayed "tight" while fresh was "conflict"), domStaleOk: false (pill120="Tight", pill240="Tight"), coldPlaceholderOk: false, offPlanInvalidationOk: false (pillAfterEdit="Conflict"), restartLabelOk: false (x1Bound="Wed 18:40 Central", card said "Gated +11h 37m for 18:40")
FAIL  MW18 -> seed200Ok: false (s200Traps: 1, X2 split: false, meets: false), genuineTrapOk: false (arrSplitLate: 165, arrStraightLate: 165, trapG: null)

12/18 myweek pins passed (EXIT_CHICAGO=1, EXIT_UTC=1)
```

### Pass-After (`~/hos-build/work-myweekfix2`, BOTH `TZ=America/Chicago` and `TZ=UTC`)

- **Build run (`agy-myweekfix2.log` step 154):** **18/18 PASS** in `TZ=America/Chicago` and **18/18 PASS** in `TZ=UTC` (EXIT 0).
- **Ada's independent verification (same machine):** **18/18 PASS** in `TZ=America/Chicago` (`/tmp/mwfix2-chi.log`) and **18/18 PASS** in `TZ=UTC` (`/tmp/mwfix2-utc.log`).

```text
PASS  MW1.  Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations
PASS  MW2.  Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)
PASS  MW3.  Split-trap case: 8/2 split saves Leg 2 but mandatory 8h SB makes Leg 3 2h 45m late (vs. on time on straight 10) -> split_trap fires with outcome-based price
PASS  MW4.  allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues
PASS  MW5.  store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine
PASS  MW6.  Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back
PASS  MW7.  G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails
PASS  MW8.  Shared floor parity: carrier-day 18:40 chained 3-load audit() & 60/7 cycle match evaluate() at each PTA
PASS  MW9.  H2/M1/M4: p3 weekend restart has 0 fabricated hold; SEED=383857408 hold is brute-force minimal, recommends reset34, Week Strip follows winner
PASS  MW10. H3/L3/L5/L8/L9: p6 home 0m slack & SEED=1776634368 mid-week 0m cycle -> Tight; stale past-due -> Conflict; hub never lies; L3 18m break; L8 10h break hidden on last/split
PASS  MW11. H4: Section D Load 2 drill-down seeds from chained state (does NOT claim Wed 21:02 fits cleanly; earliest legal roll = Wed 21:45)
PASS  MW12. H5 (corrected): Outcomes-only split trap — (a) p7 NO trap; (b) p5 NO trap, split kept, home lateness honest; (c) p4 NO trap, split kept, Leg 2 on time, Leg 3 15h 15m conflict card
PASS  MW13. H6/M2/M5: Every offered trade on fuzz2 seeds (5, 31337, 4242) delivers its claimed outcome; SEED=579532032 no stale gate; Copy copies applied plan
PASS  MW14. H1/N1: Hub summary cache performs 1 synth within 15m bucket (0 on per-minute ticks inside window), 1 recompute past 15m, 0 on Now panel, & 5-load cold < 1000 ms
PASS  MW15. M6/L1/L4/L7: st2 damaged fields report draftResets & invalid apptTime drops appt; L1 dedupes ids; L4 canonicalizes tz; L7 old SIM quarantines weekPlan
PASS  MW16. M3/L8: allowSplits=false hides "Dock delayed? Open Rescue" on load cards; split loads hide "10h break ends"
PASS  MW17. N1/N2/NIT: hubstale (+0/+60/+120/+240m) tracks fresh verdict (pure + DOM); PlanTab inactive placeholder is neutral "Review" (never "All clear" or stale); SEED=383857408 restart wait labeled accurately
PASS  MW18. H5: SEED=2004807488 NO trap (split kept on X2) & constructed genuine trap fires with independent evaluate() proof that straight-10 beats split on Leg 3

18/18 myweek pins passed (identical in TZ=America/Chicago and TZ=UTC)
```

---

## 4. Suite & Probe Results From Build Run (`agy-myweekfix2.log`)

| Check / Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| `web`: `npm run typecheck` | **PASS** (EXIT 0) | — | Steps 57 & 97 |
| `web/test/dom/myweek.mjs` (`MW1`–`MW18`, pass-after) | **18/18 PASS** | **18/18 PASS** | Step 154 + Ada logs `/tmp/mwfix2-chi.log`, `/tmp/mwfix2-utc.log` |
| `web/test/dom/myweek.mjs` vs `work-myweekfix` (fail-before) | **12/18 PASS** (6 expected FAIL) | **12/18 PASS** (6 expected FAIL) | Step 168 (`MW3`, `MW12`, `MW13`, `MW14`, `MW17`, `MW18` fail) |
| Custom `probe_check.mjs` (`hubstale`, constructed trap, `p4`/`p5`/`SEED=2004807488`, `357445184`, `fuzz2v` 286/286, `383857408` nit) | **PASS** (0 fails) | — | Step 57 |
| `perf_diag.mjs` (5-load cold synthesis after H6 perf work) | **`631.0 ms`** (< 1000 ms) | — | Step 148 |
| `engine`: `npm test` | *Truncated by 1h session cap* | *Not reached before cap* | `task-177` reached 85/108 ✔ in Chicago before timeout; `engine/` is byte-identical to `work-myweekfix` (108/108 both TZs) |
| `web`: full `npm run smoke` (other lanes), `npm run build`, `gemini.mjs`, 450-week `trapsweep` | *Not reached before 1h session cap* | *Not reached before 1h session cap* | Only `week.ts`, `app.tsx` (`PlanTab` + `MyWeekTab` sublabel), and `myweek.mjs` changed; full smoke/build recommended before merge |
