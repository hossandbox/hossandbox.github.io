# HANDOFF — Fix Round: "My Week" Master Week Synthesizer (`work-myweekfix`)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-myweekfix` (copied from pre-fix `/home/lae/hos-build/work-myweek`)
- **Review / Brief:** `~/hos-build/REVIEW-MYWEEK.md`, `~/hos-build/brief-myweekfix-neon.txt`
- **Status:** Complete — all HIGH (`H1`–`H6`), MEDIUM (`M1`–`M6`), and LOW (`L1`–`L9`) findings implemented and pinned (`MW1`–`MW16`, strengthened `MW3` & `MW8`). Fail-before verified against unmodified `work-myweek`, pass-after (`16/16` `myweek` + full `npm run smoke` + `engine npm test` + `gemini.mjs`) verified sequentially in both `TZ=UTC` and `TZ=America/Chicago`. **Not deployed, not pushed.**

---

## 1. Hard Invariants Verified

| Invariant | Verification Command / Evidence | Status |
| :--- | :--- | :--- |
| `engine/` untouched vs `work-myweek` | `diff -rq /home/lae/hos-build/work-myweek/engine /home/lae/hos-build/work-myweekfix/engine` → clean (0 diffs); aggregate sha256 `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` | **PASS** |
| Modified files vs `work-myweek` | `diff -rq` (excl. `node_modules`, `dist`, `dist-test`) → only 4 files changed: `web/src/week.ts`, `web/src/app.tsx`, `web/src/store.ts`, `web/test/dom/myweek.mjs` (+ this handoff) | **PASS** |
| `store.ts` diff strictly confined to `weekPlan` sanitize / `draftResets` | Only 3 hunks in `web/src/store.ts` (`L1106–1142` `canonicalWeekTimeZone` + `sanitizeWeekLoad`, `L1255–1276` `draftResets` weekPlan per-load comparison). No existing field, key, default, or sanitizer outside `weekPlan` touched; legacy backups without `weekPlan` import with 0 resets | **PASS** |
| Zero new `<input type="time">` | `grep -E '^\+.*type=.time.'` across `app.tsx` & `week.ts` diffs → `0` matches (`MW6` confirms 0 `<input type="time">` in DOM) | **PASS** |
| Zero new `localStorage` keys | `grep -E '^\+.*(localStorage\|_KEY)'` across `app.tsx` & `week.ts` diffs → `0` matches | **PASS** |
| Build & typecheck | `cd web && npm run build` (`tsc --noEmit` + `build.mjs`) → `dist/app.js` 610.4kb, EXIT 0 | **PASS** |
| No deploy / no push | Verified | **PASS** |

---

## 2. Per-Finding Summary (`H1`–`H6`, `M1`–`M6`, `L1`–`L9`)

### HIGH

- **H1 — Performance & Hub Caching**
  - **Where:** `web/src/week.ts:2236–2388` (`computeWeekHubFingerprint`, `getWeekHubSummary`, `primeWeekHubCache`, `clearWeekHubCache`, `getWeekSynthesisCount`, `resetWeekSynthesisCount`), `web/src/week.ts:414–432` (`hasCycleViolationAfter` fast engine cycle check in Pass-1 hold search), `web/src/week.ts:744–751` (skip split fallback when `reset10` took no 10h shift rest), `web/src/week.ts:1340–1370` & `:2130` (reuse unchanged prefix loads `0..k-1` from `recaps` during `reset34` candidates), `web/src/week.ts:1460–1550` (reuse `attempt0` work/break template + `hasCycleViolationAfter` in hold search), `web/src/week.ts:1636–1640` & `:1761` (reuse already-verified `evaluate()` snapshots), `web/src/week.ts:1927–1956` (`chooseReset34Candidates` trims 5-load candidates to high-value placements), `web/src/week.ts:2010–2188` (`runCoreStrategies` lightweight trade-verification pass), `web/src/app.tsx:4916–4970` (`PlanTab` `isActive` guard + fingerprint-memoized `getWeekHubSummary`), `web/src/app.tsx:9707`, `:9780–9833` (`MyWeekTab` `active` guard during 220ms room dissolve + `primeWeekHubCache` + avoid redundant double base synthesis on trade preview), `web/src/app.tsx:12579`, `:12629` (pass `isActive={s.tab === 'plan' && !inRoom}` to `PlanTab` and `active={inPlanTool && myWeekOpen}` to `MyWeekTab`).
  - **What changed:** Plan hub synthesis is completely off the non-Plan path (`isActive = false` on Now/Log/Settings/rooms performs **0** syntheses; dissolving `MyWeekTab` retains its refs with `active = false` and performs **0** syntheses). Repeated hub checks across unchanged inputs and minute ticks (`now + 1`, `now + 15`) hit the fingerprint cache (`1` synthesis total). Cold synthesis reduced **6.7×** (3 loads) and **11.1×** (5 loads) — see §3.
  - **Pinned by:** `MW14`.

- **H2 — Hold Exactness (Restart Blindness)**
  - **Where:** `web/src/week.ts:376–408` (`checkTimelineViolations`), `web/src/week.ts:414–432` (`hasCycleViolationAfter`), `web/src/week.ts:1380–1384` (`actualRestStart` and `allow34For`).
  - **What changed:** `allow34For(r)` now measures `r - actualRestStart >= LIMITS.RESTART` from `restInfo.activeRest.start` (including logged OFF/SB before `now`), not from `cursor`. Both `checkTimelineViolations` and `hasCycleViolationAfter` never strip a 34-hour restart that already completed before `fromMinute` (`fromMinute - r.start >= LIMITS.RESTART`).
  - **Pinned by:** `MW9` (`p3.mjs` weekend restart rolls `Sun 19:24 Central` with `midnightGateMinutes === 0`, no `"Late 22h 16m"`; `SEED=383857408` hold is brute-force minimal — legal at hold, violation at hold−1).

- **H3 — Verdict Honesty & Plan Hub Subtitle Parity**
  - **Where:** `web/src/week.ts:3066–3077` (`buildWeekVerdict` `isTight`), `web/src/week.ts:3213–3248` (`buildHubSummary`), `web/src/app.tsx:4971–4983` (`PlanTab` pill/tone using `hasWeekContent`).
  - **What changed:** `isTight` checks `Math.min(winner.cycleRemainingAtEnd, winner.minLoadCycleRemaining) < 60` (mid-week cycle trough), `minApptSlackMinutes < 60`, AND `homeCheck.slackMinutes < 60` (so `0m` home slack is `Tight`, never `All clear`). `buildHubSummary` strictly branches on `verdict.status` (`conflict` / `provisional` / `tight` / `all_clear`) so a tight, conflict, or provisional week never renders `"All clear"` on the Plan hub.
  - **Pinned by:** `MW10` (`p6` 0m home slack, `p6` Thu 45m appt slack, `SEED=1776634368` 0m mid-week cycle trough).

- **H4 — Chained Drill-Down (`Open When to Roll & PTA` and `Rescue`)**
  - **Where:** `web/src/app.tsx:4468–4472` (`RolloutPrefill` chained fields), `web/src/app.tsx:4543–4547` (`RescuePrefill` chained fields), `web/src/app.tsx:6293–6326`, `:6361–6377` (`RolloutTab` seeds from `logged + chainedPriorSegments` at `evalNow = chainedCursor`, labels `Seeded from My Week chain (after ...)`), `web/src/app.tsx:6956–6982`, `:7016` (`RescueTab` same chained seeding), `web/src/app.tsx:9910–9957` (`chainContextFor`, `drillRollout`, `drillRescue`).
  - **What changed:** Drilling into Rollout or Rescue from Load `k` (`k > 0`) appends simulated segments from Loads `0..k-1` as history and sets the evaluation cursor to Load `k-1`'s PTA. Load 2 on Section D now shows the chained infeasible timetable (`2h 15m` cycle left, earliest legal roll `Wed 21:45`) and never claims `Wed 21:02` `"Fits cleanly"`.
  - **Pinned by:** `MW11`.

- **H5 — Split Trap by Actual Re-Evaluation (Including Cycle)**
  - **Where:** `web/src/week.ts:819–990` (`evaluateNextLoadOutcome`), `web/src/week.ts:992–1236` (`trySplitRescueForLoad` comparing `split → (k+1)` against `straight-10 → (k+1)` on violations, appointment lateness, home lateness, cycle gate, and cycle remaining), `web/src/week.ts:1575–1627`, `:2542–2610` (`split_trap` conflict generation from re-evaluated `trapPriceLabel`/`trapDetail` + verified `straight10-push` trade).
  - **What changed:** A `split_trap` only fires when actual re-evaluation proves `split → (k+1)` is worse for Load `k+1` than `straight-10 → (k+1)` across violations, appointment/home lateness, and cycle. Price and body text come directly from that re-evaluation and name the actual binding cause (`cycle` / `drive` / `window` / `lateness`).
  - **Pinned by:** `MW12` (`p7`/old-MW3 fires **0** traps because split is 5h better than straight-10; `p5` cycle-strand fires with `12h 15m` cycle outcome; `p4` fires with `15h 15m` cycle-wall price, not `2h 45m`) and strengthened `MW3`.

- **H6 — Trade Claims Verified Against Re-Synthesized Preview**
  - **Where:** `web/src/week.ts:2010–2188` (`runCoreStrategies`), `web/src/week.ts:2485–2510` (`verifyTradeDraft`), `web/src/week.ts:2549–2605` (`straight10-push`), `web/src/week.ts:2631–2700` (`push-for-34`), `web/src/week.ts:2710–2774` (`shift-appt`), `web/src/week.ts:2794–2833` (`relieve-dock`), `web/src/week.ts:2856–2898` (`relieve-home-dock`).
  - **What changed:** Every offered trade (`push-for-34`, `shift-appt`, `relieve-dock`, `relieve-home-dock`, `straight10-push`) is applied to a cloned draft and re-synthesized before building its label/description. Cards only claim `"fits cleanly"`, `"clearing"`, or `"keeps your ... buffer"` when the re-synthesized result actually achieves it; partial improvements state the exact verified delta (`"misses drop from 3 to 2"`, `"cutting the ... hold from X to Y"`, `"arrives X early"`), and non-improving trades are suppressed.
  - **Pinned by:** `MW13` (all 120 `fuzz2` cases across seeds `5`, `31337`, `4242`: **0** false claims).

### MEDIUM

- **M1 — Lane Recommendation Symmetry (`web/src/week.ts:1963–2005`, `:2451`):** `pickRecommendedStrategy` compares violations → missed appointments → total appointment lateness → earlier end/home finish → eliminated recap gate → `>60m` extra end cycle. `SEED=383857408` now recommends `reset34`. **Pinned by:** `MW9`.
- **M2 — Clear Stale Hold Fields on Split Rescue (`web/src/week.ts:1613–1634`):** When a split rescue replaces a Pass-1 plan, `midnightGateMinutes`, `midnightGateBoundary`, and `midnightGateDropOffMinutes` are cleared to `0`/`null`, plus invariant guard clears any hold where `chosenRollOut <= targetRollOut`. **Pinned by:** `MW13` (`SEED=579532032`).
- **M3 — `allowSplits=false` Hides Rescue Drill-Down (`web/src/app.tsx:10427–10437`):** `"Dock delayed? Open Rescue"` renders only when `draft.allowSplits` is `true`, matching the setting's help text. **Pinned by:** `MW16`.
- **M4 — Week Strip Defaults to Recommended Lane (`web/src/week.ts:2920`, `web/src/app.tsx:9712`, `:9719–9722`, `:9847–9851`, `:10071–10095`):** `effectiveStratId` follows `res.recommendedStrategy` by default (`★` marks winner in toggle); manual toggle sets local `manualStrat` override and stays interactive. **Pinned by:** `MW9`.
- **M5 — Copy Dispatch Always Copies Applied Plan (`web/src/app.tsx:9899–9907`, `:10624–10639`):** Dispatch summary card and Copy button read `baseRes.dispatchText` / `baseRes.activeLoadCount`, never the unapplied `res` preview. **Pinned by:** `MW13`.
- **M6 — Complete `draftResets` Comparison & Drop Invalid `apptTime` (`web/src/store.ts:1139–1142`, `:1255–1276`):** Invalid `apptTime` (e.g. `'25:99'`) sets `hasAppt = false` instead of fabricating `'08:00'`; `draftResets` compares every load field (`id`, `label`, `distanceMode`, `miles`, `driveMinutes`, `mph`, `hasAppt`, `apptDate`, `apptTime`, `apptTimeZone`, `dockMinutes`, `dockOff`, `preTripMinutes`, `bufferMinutes`, `deadheadMiles`, `pickupDwellMinutes`, `pickupDwellOff`, `done`). **Pinned by:** `MW15` (`st2.mjs` table).

### LOW

- **L1 — Deduplicate Load IDs (`web/src/store.ts:1128–1131`, `:1259`):** Loops `load-${idx+1}-${seq++}` while `usedIds.has(id)` so colliding IDs like `['load-2-2','load-2-2']` become unique and are reported in `draftResets`. **Pinned by:** `MW15`.
- **L2 — Real Split Kind on `planTripAll` Fallback (`web/src/week.ts:754–760`, `:1562–1566`):** Inspects actual `SB` segment duration (`>= 480m` → `'split82'`, else `'split73'`) instead of hard-coding `'split73'`.
- **L3 — Re-Evaluated Detention Breaking Point (`web/src/week.ts:2195–2234`, `:2838–2844`, `:2882–2896`, `:3123–3128`):** `computeDetentionBreakMinutes` uses exact `evaluate()` bracket + binary search on appended ON-duty detention (Section D reports `18m`, not heuristic `margin + 5 = 22m`). **Pinned by:** `MW10`.
- **L4 — Canonicalize IANA Time-Zone Casing (`web/src/store.ts:1106–1115`, `:1141`):** `canonicalWeekTimeZone` normalizes valid IANA strings via `Intl.DateTimeFormat(...).resolvedOptions().timeZone` (`'america/new_york'` → `'America/New_York'`). **Pinned by:** `MW15`.
- **L5 — Past-Due Booked Loads Trigger Conflict Verdict (`web/src/week.ts:3021–3034`, `:3059–3064`, `:3098–3100`, `:3131–3142`, `:3225–3237`):** Unlogged past-due loads set `verdict.status = 'conflict'` and never render `All clear` or `"All N loads fit"`. **Pinned by:** `MW10`.
- **L6 — Strengthened Pins (`MW3`, `MW8`):** `MW3` (`web/test/dom/myweek.mjs:290–354`) asserts the `split_trap` price matches re-evaluated `15h 15m` cycle wall (not `2h 45m`); `MW8` (`web/test/dom/myweek.mjs:638–718`) chains a 3-load scenario shifted by `+18h 40m` across `18:40` carrier-day boundaries and runs an independent `evaluate()` `audit()` at every PTA.
- **L7 — Old `SIM_KEY` Records Quarantine `weekPlan` (`web/src/app.tsx:869–875`):** `useRealClock` restores `weekPlan` to `{ ...DEFAULT_WEEK_PLAN, loads: [] }` when an older `SIM_KEY` snapshot lacks `weekPlan`, discarding simulated edits. **Pinned by:** `MW15`.
- **L8 — Hide `"10h break ends HH:MM"` on Last & Split Loads (`web/src/app.tsx:10193–10198`):** Rendered only when `o.index < shownStrat.loads.length - 1 && !o.usedSplit`. **Pinned by:** `MW10` (last load) & `MW16` (split load).
- **L9 — Tight Label Quotes Binding Margin (`web/src/week.ts:2975–2996`, `:3155–3168`, `:3240–3243`):** `bindingTightMarginLabel` picks the tightest `< 60m` margin among cycle, appointment slack, and home slack (e.g. `"Tight — 45m appt slack"`, `"Tight — 0m home slack"`, `"Tight — 0m cycle"`). **Pinned by:** `MW10`.

---

## 3. H1 Performance Before / After

Measured on the same machine (Node 22/26) using the Section D 3-load and 5-load fixtures (`REVIEW-MYWEEK.md` `perf.mjs` class):

| Metric | Before (`work-myweek`) | After (`work-myweekfix`) | Improvement |
| :--- | :--- | :--- | :--- |
| Cold `synthesizeWeek` — 3 loads (`TZ=America/Chicago`) | `1336.5 ms` *(Opus `perf.mjs`: `1221 ms`)* | `199.6 ms` (`194.7 ms` UTC) | **6.7× faster** |
| Cold `synthesizeWeek` — 5 loads (`TZ=America/Chicago`) | `5468.5 ms` *(Opus `perf.mjs`: `6018 ms`)* | `490.5 ms` (`497.2 ms` UTC) | **11.1× faster** (<500 ms target; <1000 ms MW14 pin budget) |
| Hub summary across 4 calls incl. `+1m` and `+15m` minute ticks | 4 full syntheses (uncached) | **1** synthesis (`countAfterTicks === 1`) | **0** recomputes on minute tick |
| Minute ticks / state updates while on **Now** panel | Re-synthesized on every minute tick & status tap | **0** syntheses (`countOnNowPanel === 0`) | **100% eliminated** from Now path |

---

## 4. Fail-Before / Pass-After Evidence (`MW1`–`MW16`)

### Fail-Before (run against unmodified pre-fix `~/hos-build/work-myweek`, `TZ=America/Chicago`)

Note: MW13's `fuzz2` loop was capped at 5 iterations per seed (15 cases / 42 trades across all 3 seeds `5`, `31337`, `4242`) on the pre-fix tree solely to avoid a ~20-minute pre-fix H1 runtime; Opus's full 40-case/seed `fuzz2` on `work-myweek` is also preserved in `~/hos-build/rv-probes-myweek/f2{a,b,c}.txt` (`75/299` false trade claims). All other pins ran verbatim.

```text
PASS  MW1. Section D canonical scenario
PASS  MW2. Conflict case: Load 2 appointment blocks best 34-hour reset
FAIL  MW3. (Strengthened) Split-trap case -> price "Short 2h 45m on Leg 3", priceMatchesReeval: false
PASS  MW4. allowSplits = No suppresses all split recommendations
PASS  MW5. store.ts persistence
PASS  MW6. Plan hub presence & hygiene
PASS  MW7. G7 drill-downs, Load Check import, stale & provisional guardrails
PASS  MW8. (Strengthened) Carrier-day 18:40 chained 3-load audit() & 60/7 parity
FAIL  MW9. H2/M1/M4 -> p3 monRoll "Mon 18:25 Central", monGate: 1381, monBadge: "Late 22h 16m"; SEED=383857408 earlier1Fails: false, m1Rec: "recaps", defaultFollowsWinner: false
FAIL  MW10. H3/L3/L5/L8/L9 -> home0 "All clear", thu hub "All clear" & label "Tight — 62h 17m margin", stale "All 1 load fit", SEED=1776634368 "All clear" at 0m cycle, L3 "22m" (not 18m), l8Ok: false
FAIL  MW11. H4 -> infeasible: false, noFalseFitsCleanly: false, showsChainedEarliest: false, rescueChained: false
FAIL  MW12. H5 -> p7Traps: 1 (false trap), trap5: null (missed cycle strand), trap4 price "Short 2h 45m on Leg 3"
FAIL  MW13. H6/M2/M5 -> 10/42 trade claims failed (e.g. SEED=5 push-for-34 missed: 2), m2Ok: false, m5Ok: false (copied preview 2h 17m instead of applied 43m hold)
FAIL  MW14. H1 -> H1 hub cache / synthesis counter helpers missing (cold 5-load = 5468.5 ms)
FAIL  MW15. M6/L1/L4/L7 -> all 6 st2 damaged fields had resets: [] & badTime fabricated "08:00"; dupIds: ["load-2-2","load-2-2"]; tzGot: "america/new_york"; l7Ok: false
FAIL  MW16. M3/L8 -> splitHides10h: false, rescueHidden: false

7/16 myweek pins passed (MW9–MW16 + strengthened MW3 all FAIL before fix)
```

### Pass-After (`~/hos-build/work-myweekfix`, BOTH `TZ=UTC` and `TZ=America/Chicago`)

```text
PASS  MW1. Section D canonical scenario: 43m midnight hold on Load 2, 13m hold on Load 3, home Fri 09:13 CT with 17m cycle margin & 0 engine violations
PASS  MW2. Conflict case: Load 2 appointment blocks best 34-hour reset (conflict card rendered & priced in hours/minutes)
PASS  MW3. Split-trap case: split saves Leg 2 but cycle-strands Leg 3 -> flagged as split_trap with re-evaluated 15h 15m price
PASS  MW4. allowSplits = No suppresses all split recommendations on a tight handoff that a split otherwise rescues
PASS  MW5. store.ts: weekPlan export/import round-trip, garbage sanitizer, legacy backup compat, BACKUP_KEY rotation & SIM_KEY quarantine
PASS  MW6. Plan hub presence & hygiene: capstone card above 12 untouched .plan-item tools, shared ClockPick (0 input[type=time]), clean Back
PASS  MW7. G7 drill-downs (Rollout & Rescue prefill + Back to My Week), Load Check import, stale load & provisional guardrails
PASS  MW8. Shared floor parity: carrier-day 18:40 chained 3-load audit() & 60/7 cycle match evaluate() at each PTA
PASS  MW9. H2/M1/M4: p3 weekend restart has 0 fabricated hold; SEED=383857408 hold is brute-force minimal, recommends reset34, Week Strip follows winner
PASS  MW10. H3/L3/L5/L8/L9: p6 home 0m slack & SEED=1776634368 mid-week 0m cycle -> Tight; stale past-due -> Conflict; hub never lies; L3 18m break; L8 10h break hidden on last/split
PASS  MW11. H4: Section D Load 2 drill-down seeds from chained state (does NOT claim Wed 21:02 fits cleanly; earliest legal roll = Wed 21:45)
PASS  MW12. H5: Split trap by re-evaluation — (a) old MW3/p7 has NO trap; (b) p5 cycle-strand fires; (c) p4 price is 15h 15m (not 2h 45m)
PASS  MW13. H6/M2/M5: Every offered trade on fuzz2 seeds (5, 31337, 4242) delivers its claimed outcome; SEED=579532032 no stale gate; Copy copies applied plan
PASS  MW14. H1: Hub summary cache performs 1 synthesis across unchanged/minute-tick calls (0 on Now panel) & 5-load cold synthesis < 1000 ms
PASS  MW15. M6/L1/L4/L7: st2 damaged fields report draftResets & invalid apptTime drops appt; L1 dedupes ids; L4 canonicalizes tz; L7 old SIM quarantines weekPlan
PASS  MW16. M3/L8: allowSplits=false hides "Dock delayed? Open Rescue" on load cards; split loads hide "10h break ends"

16/16 myweek pins passed (identical in TZ=UTC and TZ=America/Chicago)
```

---

## 5. Per-Suite Verification Table (Sequential Runs, Both Timezones)

| Suite / Lane | `TZ=UTC` | `TZ=America/Chicago` |
| :--- | :--- | :--- |
| `web`: `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 610.4kb) | **PASS** |
| `engine`: `npm test` | **108/108 PASS** | **108/108 PASS** |
| `web`: `npm run smoke` (full chain) | **EXIT 0** | **EXIT 0** |
| ↳ `typecheck`, `contrast` (44/44 day & night), `nightlight`, `ocr-bundle`, `smoke.mjs` | **OK** | **OK** |
| ↳ `yesback`, `c1flush`, `adjuststart`, `scrub`, `c3`, `c3relaunch`, `logedit`, `cascade` | **OK** | **OK** |
| ↳ `rescue.mjs` | **11/11 PASS** | **11/11 PASS** |
| ↳ `stack.mjs` | **15/15 PASS** | **15/15 PASS** |
| ↳ `motel.mjs` | **13/13 PASS** | **13/13 PASS** |
| ↳ `legal.mjs` | **15/15 PASS** | **15/15 PASS** |
| ↳ `flip.mjs` | **12/12 PASS** | **12/12 PASS** |
| ↳ `miles.mjs` | **11/11 PASS** | **11/11 PASS** |
| ↳ `carrierday.mjs` | **9/9 PASS** | **9/9 PASS** |
| ↳ `myweek.mjs` (`MW1`–`MW16`) | **16/16 PASS** | **16/16 PASS** |
| `web`: `gemini.mjs` | **20/20 PASS** | **20/20 PASS** |
