# HANDOFF — Plan Tool #4: "Flip My Clock" (`work-flip`)

- **Date:** 2026-11-24
- **Tree:** `/home/lae/hos-build/work-flip` (copied from live `work-legalfix2`)
- **Product Spec:** `RESEARCH-PLAN-TOOLS-2.md` §2 #4 (*"Flip My Clock"* — Shift-Start & Schedule-Flip Bridge Planner, appended 11th / bottom in the Plan hub at standard `.plan-item` size)
- **Status:** Implemented, built clean, stub swap-tested (`0/8`), and verified across `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to baseline) | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `FL7` + `smoke.mjs` | `3` (unchanged from baseline; `0` in `FlipTab`; shutdown & custom target both use shared `ClockPick`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` + `flip.mjs` `FL8` | `extraKeys: []` (tool state is session-only React state) | **PASS** |
| No behavior changes to existing tools | Full `smoke`, all 14 `dom` lanes, `revisions`, `gemini` | All existing tool tests pass unchanged (only Plan-hub 10→11 item count assertions & `openFlipPlanner(false)` resets updated) | **PASS** |

---

## 2. Per-Card Implementation (`file:line`)

### Framing, Inputs & Navigation Wiring
- **Standing Non-Medical Framing Line (`web/src/flip.ts:37-38`, rendered at `web/src/app.tsx:8702`):**
  > `"Rest windows only — this plans legal start times, not sleep advice."`
  Zero medical, sleep, alertness, circadian, or health language anywhere in `flip.ts` or `FlipTab`.
- **Default Shutdown Time (`web/src/flip.ts:291-307`):** `defaultShutdownMinute(segments, now)` returns the end of the last logged work segment (`D`/`ON`) when the driver has already finished working within the last 24h (`source: 'shift_end'`), otherwise falls back to `now` (`source: 'now'`).
- **Preset Chips (`web/src/flip.ts:51-55`, rendered at `web/src/app.tsx:8752-8778`):**
  - `21:00 Night` (`id: 'night'`)
  - `00:01 Midnight Recap` (`id: 'midnight'`)
  - `03:00 Early Bird` (`id: 'early'`)
  - `Custom` — opens `FlipTimeSheet` in `mode: 'target'`.
- **Shared `ClockPick` Time Entry (`web/src/app.tsx:477-478, 8432-8498`):**
  - `FlipTimeSheet` (`mode: 'target'`, `L8433-8465`): uses `<ClockPick timeOnly ... keys={KEYS_DAYSTART} />` (exact same component & pattern as Settings `DayStartSheet`).
  - `FlipTimeSheet` (`mode: 'shutdown'`, `L8467-8497`): uses `<ClockPick ... future={true} keys={KEYS_HOURS} />` with DST-safe `deviceTz` wall-clock round-trip (exact same pattern as `StackTimeSheet` / `RolloutTimeSheet`).
- **Plan Hub & Room Wiring:**
  - `web/src/app.tsx:66-70` — Imports `flip.ts` exports.
  - `web/src/app.tsx:397` — Adds `I.flip` 24×24 stroke icon.
  - `web/src/app.tsx:4640-4682` — Reactive `openFlipPlanner` / `isFlipPlannerOpen` / `useFlipPlanner` outside `store.ts` (mutually exclusive with `week`, `rollout`, `rescue`, `stack`, `motel`, `legal`; closes `fliptime` sheet on close).
  - `web/src/app.tsx:4726-4730` — Appends 11th `.plan-item` (`Flip My Clock`) at the bottom of `PlanTab` at standard size.
  - `web/src/app.tsx:8505-8798` — `FlipTab` component.
  - `web/src/app.tsx:10107-10170, 10191-10200, 10255, 10373, 10454, 10483-10491, 10539, 10686, 10740, 10774` — Wired `'flip'` into `PlanToolId`, `PLAN_TOOL_LABEL`, `activePlanToolOf`, `sheetSessionKey`, `isSheetVisibleForContext`, `App` hooks, `backNav`, `isInRoomNow`, `renderDisplayedSheet`, Plan tab-bar reset, and `plan-room`.
  - `web/src/backnav.ts:24` — Added `'flip'` to `PLAN_SCREENS`.
  - `web/public/styles.css:1561-1603` — Added `.flip-*` styles using only existing day/night palette tokens and `>= 12px` font floor.

### Card 1 — Option A: Extended Break (Cleanest)
- **Logic:** `buildOptionA()` in `web/src/flip.ts:451-496`.
- **UI:** `renderOptionA()` in `web/src/app.tsx:8553-8596`.
- **Behavior:** Finds the first occurrence of `(targetHour, targetMinute)` in the home-terminal timezone at or after `Math.max(effectiveShutdown + 10h, now)` via DST-safe `nextWallClockAtOrAfter()` (`web/src/flip.ts:256-274`). Builds tentative `OFF` rest through that roll-out, evaluates with `evaluate()`, and displays:
  - Exact roll-out wall-clock time (`data-flip-rollout`),
  - Total rest taken (`rollOut - restStart`) and extra rest beyond bare 10h (`Math.max(0, totalRest - 600)`),
  - Fresh drive / window / cycle clocks at roll-out directly from `evaluate()`.
  - If cycle is 0 at the first hit, advances to the next day's target occurrence (up to 2 extra days) so Option A never presents an illegal `driveNow === 0` roll-out.

### Card 2 — Option B: Split-Sleeper Slide (Keep Moving)
- **Logic:** `buildOptionB()` in `web/src/flip.ts:514-625`.
- **UI:** `renderOptionB()` in `web/src/app.tsx:8598-8649` (conditionally rendered only when `plan.optionB !== null`, `L8787`).
- **Behavior:** Tests all four canonical 7/3 and 8/2 split pairs (`7/3`, `8/2`, `3/7`, `2/8`, `L507-512`) with `driveLeg = (rollOut - restStart) - 600` (`30m <= driveLeg <= 11h`) placed between Leg 1 and Leg 2 so the final roll-out lands **exactly** on the target.
  - Builds tentative `[Leg 1] → [Drive] → [Leg 2]` segments (preserving logged history before `now`, requiring `driveStart >= now`).
  - Runs `evaluate(evalSegments, { asOf: rollOut, config })` and accepts a candidate **ONLY** when:
    1. `ev.violations.filter(v => v.tentative).length === 0` (violation-free across drive leg & split),
    2. `ev.violations.filter(v => !v.tentative).length <= baselineNonTentativeViolations`,
    3. `ev.driveNow > 0` (legal driving time available at roll-out),
    4. `ev.shift.chain.length >= 2 && ev.shift.anchor >= leg1End` (engine itself confirmed the qualifying split pair and advanced the shift anchor).
  - Ranks valid candidates by highest `driveNow`, then `cycle.remaining`, then pattern priority (`7/3` → `8/2` → `3/7` → `2/8`).
  - Omitted completely (`null`) whenever no violation-free split slide exists (e.g., 11h drive exhausted, 14h window exhausted, bare 10h already hits target, or span outside legal slide range).
  - Displays the exact 3-segment plan with start/end wall-clock times and post-slide drive / window / cycle clocks directly from `evaluate()`.

### Card 3 — Option C: Wait-for-Midnight / Carrier-Day Recap Bridge (Tight-Cycle Only)
- **Logic:** `buildOptionC()` in `web/src/flip.ts:629-693`.
- **UI:** `renderOptionC()` in `web/src/app.tsx:8651-8692` (conditionally rendered only when `plan.optionC !== null`, `L8788`).
- **Behavior:** Computes `earlyStart = Math.max(restStart + 10h, now)`, finds the next configured carrier-day boundary via `nextCarrierDayStart(carrierDayStart(earlyStart, cfg), cfg)`, and sets `afterStart = boundaryMinute + 1` (e.g., `00:01` for `00:00` carriers, `06:01` for `06:00` carriers).
  - Runs `evaluate()` independently on both candidate rest plans (`asOf: earlyStart` and `asOf: afterStart`).
  - Shown **AUTOMATICALLY** only when:
    1. `earlyStart > earlyDayStart` and `afterStart - restStart < 34h` (genuine carrier-day recap drop-off, not a 34h restart),
    2. Cycle is tight at `earlyStart`: `evEarly.cycle.remaining < evEarly.shift.limits.window` (`< 14h`),
    3. Boundary drop-off materially increases available cycle: `evAfter.cycle.remaining - evEarly.cycle.remaining >= 60m`,
    4. Both evaluations are tentative-violation-free and `evAfter.driveNow > 0`.
  - Compares earliest post-10h start vs holding past the carrier-day boundary (`dayStartWord(cfg)`), showing both starts' cycle hours and clocks directly from `evaluate()`.

---

## 3. Clock Honesty: How Every Number Is Derived from `evaluate()`

All candidate timelines are built by `buildBaseTimeline()` (`web/src/flip.ts:369-439`) on non-tentative logged segments clipped to `<= now` (never overwriting logged work; if shutdown is in the future, `[now, effectiveShutdown)` is modeled as tentative `ON` so it is never treated as phantom rest). Every displayed clock passes through `snapshotFromEval(ev, tz)` (`web/src/flip.ts:321-336`):

| Card | Field | Derivation |
| :--- | :--- | :--- |
| **Option A** | `rollOutMinute` | `nextWallClockAtOrAfter(max(restStart + 600, now), targetHour, targetMinute, tz)` via engine `localToMinute()` |
| **Option A** | `totalRestMinutes`, `extraRestMinutes` | Simple elapsed subtraction: `rollOut - restStart` and `max(0, totalRest - 600)` |
| **Option A** | `driveRemaining`, `windowRemaining`, `cycleRemaining`, `driveNow`, `binding` | Directly from `ev = evaluate(evalSegments, { asOf: rollOut, config })` (`ev.shift.driveRemaining`, `ev.shift.windowRemaining`, `ev.cycle.remaining`, `ev.driveNow`, `ev.binding`) |
| **Option B** | Legality & split acceptance | Directly from `ev = evaluate(evalSegments, { asOf: rollOut, config })`: `tentViols.length === 0 && ev.driveNow > 0 && ev.shift.chain.length >= 2 && ev.shift.anchor >= leg1End` |
| **Option B** | `driveRemaining`, `windowRemaining`, `cycleRemaining`, `driveNow`, `binding` | Directly from `ev` at `asOf: rollOut` |
| **Option C** | `boundaryMinute`, `afterStart` | Engine `nextCarrierDayStart(carrierDayStart(earlyStart, cfg), cfg)` and `boundaryMinute + 1` |
| **Option C** | `earlyClocks.*` & `afterClocks.*` | Directly from two separate `evaluate()` runs at `asOf: earlyStart` and `asOf: afterStart` |
| **Option C** | `cycleGainMinutes`, `dropsOffMinutes` | `evAfter.cycle.remaining - evEarly.cycle.remaining` and `evEarly.cycle.forecast[0]?.dropsOff ?? 0` |

---

## 4. Pin List (`web/test/dom/flip.mjs`) & Fail-Before Evidence

| Pin | Line | What It Verifies |
| :--- | :--- | :--- |
| **`FL1`** | `L145` | Option A (Extended Break) lands roll-out exactly on target (`Wed 03:00`), displays exact total rest (`15h 00m`) and extra rest (`+5h 00m`), and fresh drive/window/cycle clocks equal independent `evaluate()` output (plus bare-10h `0m` extra and `+3h 30m` checks). |
| **`FL2`** | `L210` | Option B (Split-Sleeper Slide) appears on valid mid-shift fixture (`7/3`: `SB 12:00→19:00`, `D 19:00→00:00`, `OFF 00:00→03:00`), independently verified violation-free in `evaluate()` with completed split chain and exact post-slide drive/window/cycle clock parity. |
| **`FL3`** | `L271` | Option B is **ABSENT** (omitted in logic and DOM) when no valid split slide exists: 11h drive exhausted (even with target 15h 30m out), 14h window exhausted, and bare-10h exact hit (`0m` drive leg), while Option A remains legal. |
| **`FL4`** | `L338` | Option C (Wait-for-Midnight Recap Bridge) appears on tight-cycle fixture (`2h 00m` at `Tue 22:00` vs `12h 00m` at `Wed 00:01`, `+10h 00m` gain), both cycle figures asserted directly against `evaluate()`; **ABSENT** on roomy cycle and on tight cycle with zero midnight drop-off. |
| **`FL5`** | `L405` | Option C honors configured custom carrier-day boundary (`dayStartHour: 6, dayStartMinute: 0` → `Wed 04:00` vs `Wed 06:01`, title names `06:00` not `Midnight`) with exact `evaluate()` cycle parity. |
| **`FL6`** | `L447` | Preset chips (`21:00 Night`, `00:01 Midnight Recap`, `03:00 Early Bird`) set documented targets (`21:00`, `00:01`, `03:00`), toggle `aria-pressed`, and update Option A roll-out live. |
| **`FL7`** | `L474` | Zero `<input type="time">` inside `FlipTab`; tapping `Custom` opens `timeOnly` shared `ClockPick` (`04:30` applied cleanly); tapping shutdown opens date+time shared `ClockPick` (`15:00` applied & `Reset` restores default). |
| **`FL8`** | `L531` | Standing framing line exact match, zero medical/sleep/alertness/health terms in body copy, default shutdown derives from `shift_end` when resting vs `now` when empty, Plan hub 11th-item placement (`Flip My Clock` at bottom), Back closes cleanly, zero new `localStorage` keys. |

### Fail-Before Evidence (Stub Swap-Test of `web/src/flip.ts`)

Bundling `web/test/dom/flip.mjs` with `web/src/flip.ts` intercepted by a minimal placeholder stub fails **all 8 flip pins (`0/8`, `STUB_EXIT=1`)**:

```text
FAIL  FL1. Option A (Extended Break): lands roll-out exactly on target with total/extra rest cost and fresh clocks matching evaluate()
      Option A card missing
FAIL  FL2. Option B (Split-Sleeper Slide): appears when legal slide exists, violation-free in evaluate(), exact segment plan & clocks
      Option B card missing on valid split-slide fixture
FAIL  FL3. Option B ABSENT when no valid split slide exists (11h drive exhausted, 14h window exhausted, or bare 10h exact hit)
      {"cardA1":false,"cardB1":false,"winB":null,"exact10B":null}
FAIL  FL4. Option C (Wait-for-Midnight Recap Bridge): appears only on tight-cycle fixture with engine cycle parity; absent when roomy or zero drop-off
      Option C missing on tight-cycle fixture
FAIL  FL5. Option C uses configured carrier-day boundary (06:00), not hard-coded midnight, matching evaluate()
      {"c":null,"want":{"early":29906520,"after":29906641,"ec":120,"ac":720}}
FAIL  FL6. Preset chips set documented targets (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird) and update Option A live
      preset night mismatch: [{"id":"night","hm":"00:00","wantHM":"21:00","pressed":"false","roll":null,"wantRoll":29907540}]
FAIL  FL7. Shared ClockPick used for custom target time and shutdown edit; zero <input type="time"> in FlipTab
      {"afterTargetHM":"00:00","afterTargetRoll":null,"wantRoll":29906550,"afterShutBtnText":"stub (UTC)Change ›","afterShutTotal":null,"resetShutText":"stub (UTC)Change ›"}
FAIL  FL8. Standing line, non-medical framing, default shutdown from shift end vs now, Plan hub 11th item, Back navigation, zero new storage keys
      {"defRested":{"minute":29905560,"source":"now"},"defEmpty":{"minute":29905560,"source":"now"},"standingOk":false,"shutTxt":"stub (UTC)Change ›","hasMedical":false,"closedClean":true,"extraKeys":[]}

0/8 flip pins passed
STUB_EXIT=1
```

### Pass-After Output (Both `TZ=America/Chicago` and `TZ=UTC`)

```text
PASS  FL1. Option A (Extended Break): lands roll-out exactly on target with total/extra rest cost and fresh clocks matching evaluate()
PASS  FL2. Option B (Split-Sleeper Slide): appears when legal slide exists, violation-free in evaluate(), exact segment plan & clocks
PASS  FL3. Option B ABSENT when no valid split slide exists (11h drive exhausted, 14h window exhausted, or bare 10h exact hit)
PASS  FL4. Option C (Wait-for-Midnight Recap Bridge): appears only on tight-cycle fixture with engine cycle parity; absent when roomy or zero drop-off
PASS  FL5. Option C uses configured carrier-day boundary (06:00), not hard-coded midnight, matching evaluate()
PASS  FL6. Preset chips set documented targets (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird) and update Option A live
PASS  FL7. Shared ClockPick used for custom target time and shutdown edit; zero <input type="time"> in FlipTab
PASS  FL8. Standing line, non-medical framing, default shutdown from shift end vs now, Plan hub 11th item, Back navigation, zero new storage keys

8/8 flip pins passed
```

---

## 5. Per-Suite Verification Results (Sequential Runs, Both Timezones)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 502.7kb`) | — | Clean build |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |
| **Full Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs` (incl. `flip my clock` SSR/engine check), plus all 14 DOM lanes: |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** | **PASS** | via `npm run smoke` (incl. 11-item Plan hub `D10a`) |
| ↳ `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/flip.mjs` | **PASS** (**8/8**) | **PASS** (**8/8**) | `FL1`–`FL8`, standalone & via `npm run smoke` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | 88/89 (known pre-existing `W2` host-TZ seed per `HANDOFF-LEGAL.md` / `HANDOFF-MOTEL.md`) | All Plan-hub & room-dissolve pins (`W1`, `W4`, `R1`, `R5`, `P1`–`P4` incl. `'flip'`) **PASS** in both TZs |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/auditfix.mjs`, `dom/polish.mjs`, `dom/layout.mjs`** | Not runnable in sandbox (`playwright-core not found under /home/hatch/workspace/hos-patch/p18-scratch/`) | — | Same external Playwright harness boundary as `HANDOFF-LEGAL.md`. `polish.mjs` updated with `sweep('plan-11', [tab('Plan'), planItem(10)])`; `c3browser.mjs` updated for 11-item Plan hub; CSS uses verified AA day/night tokens (`contrast.mjs` 44/44 day + 44/44 night) and `>= 12px` font floor. |

---

## 6. Files Added / Modified in `work-flip`

- **New:** `web/src/flip.ts` (`5d3312821377d155445581ea25617caf3e827f25`, 735 lines) — Pure bridge planner for Option A (Extended Break), Option B (Split-Sleeper Slide), Option C (Wait-for-Midnight / Carrier-Day Recap Bridge), preset definitions, DST-safe wall-clock helpers, and `FLIP_STANDING_LINE`.
- **New:** `web/test/dom/flip.mjs` (`16f53ad43a59785c92d3c2ec389f18b2b71ec27e`, 582 lines) — Dedicated `FL1`–`FL8` DOM pin suite.
- **Modified:** `web/src/app.tsx` (`3a5bfb9703bed22f1f4c0f0fb6cd8af7e169446a`) — Added `FlipTab`, `FlipTimeSheet` (shared `ClockPick` for shutdown & custom target), `openFlipPlanner`/`isFlipPlannerOpen`/`useFlipPlanner`, `I.flip`, 11th `.plan-item` at bottom of `PlanTab`, and `plan-room`/`backNav` wiring.
- **Modified:** `web/src/backnav.ts` (`6be9a2bd88ad6497f0e14eafd998c4c63ad20a08`) — Added `'flip'` to `PLAN_SCREENS`.
- **Modified:** `web/public/styles.css` (`144a0c94fb676078ab653825e20760dd47d48477`) — Added `.flip-*` styles (`L1561-1603`).
- **Modified:** `web/package.json` — Added `test/dom/flip.mjs` to `npm run dom` (and therefore `npm run smoke`).
- **Modified (Plan-hub 10→11 re-aim & planner reset):** `web/test/smoke.mjs`, `web/test/dom/c3.mjs`, `web/test/dom/c3browser.mjs`, `web/test/dom/carrierday.mjs`, `web/test/dom/rescue.mjs`, `web/test/dom/stack.mjs`, `web/test/dom/motel.mjs`, `web/test/dom/legal.mjs`, `web/test/dom/revisions.mjs`, `web/test/dom/polish.mjs`.
- **New:** `HANDOFF-FLIP.md` — This handoff.
- **Untouched:** `web/src/store.ts` (`1323046db6ba07b8c85805f89a103dc16f3776b5`), `engine/` (`0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`).
