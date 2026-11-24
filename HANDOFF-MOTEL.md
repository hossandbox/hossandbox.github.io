# HANDOFF — Plan Tool #2: "Do I Make It Back or Motel?" (`work-motel`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-motel` (branched from `/home/lae/hos-build/work-carrierdayfix`)
- **Product Spec:** `RESEARCH-PLAN-TOOLS-2.md` candidate #2 ("Do I Make It Back or Motel?" — Meet-and-Turn & Relay Wait Cutoff Timer, placed 9th / bottom in the Plan hub)
- **Status:** Implemented, built, and verified. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` byte-identical to `work-carrierdayfix/engine` | `diff -rq /home/lae/hos-build/work-motel/engine /home/lae/hos-build/work-carrierdayfix/engine` | exit `0`, 0 differing files | **PASS** |
| Zero new `<input type="time">` in `web/src/app.tsx` | `grep -c 'type="time"'` on base vs `work-motel` | `3` in `work-carrierdayfix/web/src/app.tsx`, `3` in `work-motel/web/src/app.tsx` (+0); `motel.mjs` M1 also asserts `0` inside `MotelTab` | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` F3 + `motel.mjs` M7 | `extraKeys: []` (only the 4 existing `hos-sandbox-*` keys) | **PASS** |

---

## 2. What Was Built

**"Do I Make It Back or Motel?"** is a pure app-layer meet-and-turn / relay wait cutoff timer over the engine's existing `evaluate()`, `normalize()`, and `LIMITS` APIs:

- **Plan Hub Placement & Room Navigation:** Appended as the 9th `.plan-item` at the bottom of `PlanTab` (below `Stack my stops & loads`) with a new `I.motel` icon, reactive `openMotelPlanner` / `isMotelPlannerOpen` / `useMotelPlanner` state (mutually exclusive with `week`/`rollout`/`rescue`/`stack`, auto-closing on tab leave and Plan-bar tap), shared `plan-room` dissolve transition, and hardware Back support via `web/src/backnav.ts`.
- **Verdict-First UI (`MotelTab`, `web/src/app.tsx:7560-7934`):**
  - Giant tabular-numeral cutoff clock (`44px`) ticking live with the app's `now` clock (`Must roll by HH:MM` + wait-left countdown + estimated back-at-terminal ETA when rolling now vs at cutoff).
  - Red past-cutoff state (`CUTOFF PASSED` — `"Cutoff was HH:MM. Waiting longer means a motel or a repower."`).
  - Red infeasible state (`MOTEL / REPOWER`) when 11-hr drive or 60/70-hr cycle feasibility fails, with **no cutoff clock rendered** (`cutoffMinute === null`).
  - Binding rule pill with CFR citation (`14-hr window — 49 CFR 395.3(a)(2)`, `16-hr Big Day — 49 CFR 395.1(o)`, `11-hr driving limit — 49 CFR 395.3(a)(3)(i)`, `70-hr cycle — 49 CFR 395.3(b)(2)` / `60-hr cycle — 49 CFR 395.3(b)(1)`, plus `§395.1(b)(1)` if adverse driving is active).
  - Live 3-pill clock strip (`drive left`, `window ends`, `cycle left`), ON-duty waiting cycle-burn warning when `s.current?.status === 'ON'`, and 30-minute break credit callout derived from the real consecutive non-driving stretch at `now`.
  - One-tap **Copy Night-Dispatch Alert** via `shareVerdictText()` with exact cutoff/reason, binding CFR citation, and `"Planning estimate — my ELD governs."` framing.
- **1:45 AM Inputs:**
  - Mode toggle between **Return miles** (`110/165/220/275/330 mi` preset chips + numeric miles input + inline editable mph defaulting to `s.mph || 55` with `50/55/60/65 mph` chips) and **Drive time** (`2h/3h/4h/5h/6h` preset chips + shared `useDurationBoxes` `h`/`m` inputs).
  - **Swap / break-and-hook time:** `15m / 30m / 45m / 60m` preset chips + shared `useDurationBoxes` custom duration box.
  - **16-hour Big Day (`§395.1(o)`) toggle:** displays plain-language eligibility warning (same work-reporting location as previous 5 duty tours; once in 7 days or after a 34-hour restart; driving limit stays 11h) and surfaces engine-level `§395.1(o)(3)` log-ineligibility note if already used within the prior 6 carrier days without a 34h restart.
  - **Remember-my-lane defaults:** persisted automatically via module-level session store (`loadMotelDraft` / `saveMotelDraft` / `clearMotelDraft` in `web/src/motel.ts`) with a one-tap `Reset saved lane defaults` button.
  - Incomplete cycle history disclosure (`cycleBasis`) and planning-estimate disclaimer footer.

---

## 3. Exact Cutoff Math Implemented (`web/src/motel.ts`)

All HOS clocks come strictly from `engine/src/index.ts` `evaluate(logged, { asOf: now, config })` using real logged segments only (`segments.filter((s) => !s.tentative)`) and sanitized config via `safeRulesConfig(input.config)`.

### 3.1 Return Drive & Hook Normalization
- `effectiveMph = clamp(round(mph), 25, 80)` (defaults to `55` if non-finite).
- **Miles mode (`distanceMode === 'miles'`):**
  ```ts
  returnDriveMinutes = miles <= 0 ? 0 : Math.min(Math.ceil((miles * 60) / effectiveMph), 24 * 60);
  ```
  Exact integer ratios (e.g. `220 mi @ 55 mph = 240m`, `180 mi @ 60 mph = 180m`, `275 mi @ 55 mph = 300m`) produce exact integer minutes with zero floating-point overshoot; fractional minutes round conservatively upward.
- **Drive-time mode (`distanceMode === 'time'`):**
  ```ts
  returnDriveMinutes = Math.min(Math.max(0, Math.round(driveMinutesDirect)), 24 * 60);
  ```
- **Hook & duty time:**
  ```ts
  hookMinutes = Math.max(0, Math.min(6 * 60, Math.round(input.hookMinutes)));
  returnDutyMinutes = hookMinutes + returnDriveMinutes;
  ```

### 3.2 Dual Engine Evaluation (14-hr Baseline vs 16-hr Big Day `§395.1(o)`)
To avoid double-adding `+2h` when the driver already enabled the 16-hour exception on the Now screen, and to let the engine enforce `§395.1(o)(3)` once-per-7-days / 34-hr-restart eligibility:
1. Run `evRaw = evaluate(logged, { asOf: now, config: cfg })`.
2. `evBase`: if `evRaw.shift.exceptionKeys.sixteen !== null`, re-evaluate with that key removed from `cfg.sixteenHourShifts`; otherwise `evRaw`.
3. `evBig`: if `evRaw.shift.exceptionKeys.sixteen !== null`, reuse `evRaw`; otherwise re-evaluate with `evBase.shift.exceptionKey` appended to `cfg.sixteenHourShifts`.
4. `bigDayBlockedByLog = input.bigDay && evBig.shift.limits.window === evBase.shift.limits.window`.
5. `bigDayApplied = input.bigDay && !bigDayBlockedByLog`.
6. `activeEv = input.bigDay ? evBig : evBase`.

### 3.3 Clock Roles & Exact Cutoff Formulas
- **11-hr Driving Limit (`49 CFR 395.3(a)(3)(i)` — NOT consumed by waiting):**
  - **Feasibility check only:** `driveFeasible = returnDriveMinutes <= activeEv.shift.driveRemaining`.
  - If `!driveFeasible`, verdict is `status = 'infeasible'`, `cutoffMinute = null`, `cutoffHM = null`, `waitLeftMinutes = null`. **Never invents a wall-clock cutoff from drive time.** (Even with Big Day ON, `activeEv.shift.limits.drive` remains `11h`, or `13h` only if adverse driving `§395.1(b)(1)` is active.)
- **60/70-hr Cycle Limit (`49 CFR 395.3(b)(1)/(2)` — consumed by ON-duty waiting & return duty):**
  - **Feasibility check:** `cycleFeasible = returnDutyMinutes <= activeEv.cycle.remaining`.
  - If `!cycleFeasible`, verdict is `status = 'infeasible'`, `cutoffMinute = null`.
  - If `cycleFeasible && currentStatus === 'ON'`, shows an informational ON-duty burn note naming the remaining cycle margin `cycleRemaining - returnDutyMinutes` (since live `evaluate()` at `now` ticks `cycle.remaining` down as ON-duty wait accumulates).
- **14-hr / 16-hr Shift Window (`49 CFR 395.3(a)(2)` / `49 CFR 395.1(o)` — elapsed-time clock consumed by waiting):**
  - Unclamped window end (preserves the exact historical cutoff minute even after window expiry):
    ```ts
    windowEndMinute = now + (activeEv.shift.limits.window - activeEv.shift.windowUsed);
    ```
  - Exact cutoff minute (when `validInput && driveFeasible && cycleFeasible`):
    ```ts
    cutoffMinute    = windowEndMinute - returnDriveMinutes - hookMinutes;
    waitLeftMinutes = cutoffMinute - now;
    ```
  - State thresholds:
    - `waitLeftMinutes < 0` → `status = 'passed'`, `tone = 'bad'`, `sign = 'stop'`, `verdictLabel = 'CUTOFF PASSED'`.
    - `0 <= waitLeftMinutes <= 30` → `status = 'ready'`, `tone = 'warn'`, `sign = 'warn'`, `verdictLabel = 'ROLL SOON'`.
    - `waitLeftMinutes > 30` → `status = 'ready'`, `tone = 'good'`, `sign = 'go'`, `verdictLabel = 'CAN MAKE IT BACK'`.
  - Back-at-terminal estimates (when `status === 'ready'`):
    ```ts
    backIfRollNowMinute = now + hookMinutes + returnDriveMinutes;
    backAtCutoffMinute  = cutoffMinute + hookMinutes + returnDriveMinutes; // === windowEndMinute
    ```
- **30-Minute Break Credit (`49 CFR 395.3(a)(3)(ii)` / `§395.1(e)`):**
  - `currentNonDrivingStretch(evRaw.segments, now)` clips non-tentative segments to `<= now`, runs `normalize()`, and accumulates consecutive non-`D` minutes (including `OFF`, `SB`, `ON`, and unlogged gaps between/after logged segments, matching `engine/src/shift.ts` `breakStatus()`), resetting to `0` on any `D` segment.
  - If `cfg.shortHaul`: exempt line (`49 CFR 395.1(e)`).
  - Else if `currentNonDriveMinutes >= 30`: `"This wait already covers your 30-minute break — no extra stop needed on the way back (as long as the wait counts as off duty, sleeper, or on duty not driving)."`
  - Else: `breakMinutesShort = 30 - currentNonDriveMinutes` → `"Another N minutes of this wait covers your 30-minute break."`
  - If `!cfg.shortHaul && returnDriveMinutes > 480`: appends a secondary note that a return drive over 8 hours will still require another 30-minute break before hour 8 of driving.
- **Timezone Formatting:** All wall-clock strings (`fmtHM`, `fmtShort`) use cached `Intl.DateTimeFormat('en-US', { timeZone: homeTimeZone, hourCycle: 'h23', ... })` on epoch minutes, making formatted output DST-safe and completely independent of host `TZ`.

---

## 4. Every File Changed (vs `work-carrierdayfix`)

| File | Diff | Summary |
| :--- | :--- | :--- |
| `web/src/motel.ts` | **New** (564 lines) | Pure app-layer cutoff math (`evaluateMotel`, `computeMotelDriveMinutes`, `currentNonDrivingStretch`, `clampMotelMph`), presets, CFR cites, dispatch alert builder, and in-session draft persistence (`loadMotelDraft`/`saveMotelDraft`/`clearMotelDraft`). |
| `web/src/app.tsx` | `+434 / -9` | Imported `./motel.ts`; added `I.motel` icon; added `openMotelPlanner`/`isMotelPlannerOpen`/`useMotelPlanner` (mutually exclusive with other Plan tools, reset on tab leave & Plan tap); appended 9th `.plan-item` (`Do I Make It Back or Motel?`) to `PlanTab`; added `MotelTab` component (`L7554-7934`); wired `'motel'` into `PlanToolId`, `PLAN_TOOL_LABEL`, `activePlanToolOf`, `backNav`, and `plan-room`. |
| `web/src/backnav.ts` | `+1 / -1` | Added `'motel'` to `PLAN_SCREENS` so hardware Back returns cleanly to Plan hub. |
| `web/public/styles.css` | `+27 / -0` | Added `.motel-*` classes (`L1499-1521`) using existing day/night palette & spacing tokens (`44px` tabular cutoff readout, `.is-bad`/`.is-warn` states, break box, Big Day warning box). |
| `web/package.json` | `+1 / -1` | Wired `test/dom/motel.mjs` into `npm run dom` (and therefore `npm run smoke`). |
| `web/test/dom/motel.mjs` | **New** (552 lines) | Dedicated M1–M8 pin suite (engine math + live DOM verification). **Resume-session fix (`L551`):** added `render(null, root); process.exit(bad ? 1 : 0);` so passing runs exit immediately instead of keeping Node alive on `App`'s live clock ticker (which caused the previous run's `task-149` print timeout). |
| `web/test/smoke.mjs` | `+47 / -4` | Re-aimed Plan hub count assertions (8 → 9 items, resetting `openMotelPlanner(false)`) and added a `do i make it back or motel` SSR + engine smoke block. |
| `web/test/dom/c3.mjs` | `+4 / -2` | Re-aimed Plan hub `D10a` pin to 9 items with `Do I Make It Back or Motel?` 9th (bottom). |
| `web/test/dom/c3browser.mjs` | `+1 / -1` | Re-aimed browser Plan hub assertion to 9 items with `Do I Make It Back or Motel?` at index 8. |
| `web/test/dom/carrierday.mjs` | `+2 / -1` | Reset `openMotelPlanner(false)` in `seed()`. |
| `web/test/dom/polish.mjs` | `+1 / -0` | Added `sweep('plan-9', [tab('Plan'), planItem(8)])` so Chromium verifies touch targets, horizontal overflow, and zero page errors on `MotelTab`. |
| `web/test/dom/rescue.mjs` | `+4 / -3` | Re-aimed `R8` Plan hub check to 9 items and reset `openMotelPlanner(false)` in `seed()`. |
| `web/test/dom/revisions.mjs` | `+25 / -19` | Re-aimed `W1`, `W4`, `R1`, `R5`, `P1`, `P3`, `P4` from 8 → 9 Plan hub items and added `'motel'` to room-dissolve and Back-navigation sweeps. |
| `web/test/dom/stack.mjs` | `+3 / -2` | Re-aimed `SK8` Plan hub check to 9 items and reset `openMotelPlanner(false)` in `seed()`. |
| `HANDOFF-MOTEL.md` | **New** | This handoff document. |

---

## 5. Fail-Before / Pass-After Evidence (Pins M1–M8)

### How Fail-Before Was Demonstrated
During the build run (`~/hos-build/agy-motel.log`, step 87 → step 107), `web/src/motel.ts` was initially scaffolded as a stub returning dummy placeholders (`status: 'ready'`, `cutoffMinute: input.now`, `cutoffHM: '00:00'`, `waitLeftMinutes: 0`, `currentNonDriveMinutes: 0`, no-op draft persistence) while `web/test/dom/motel.mjs` was written against the spec. Running `dist-test/dom-motel.mjs` against that stub failed all 8 pins (`0/8`):

```text
FAIL  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
      math mismatch: status=ready cutoff=29906393 (want 29906430) hm=00:00 waitLeft=0
FAIL  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
      16h delta wrong: 14h=29906393 (00:00) 16h=29906393 (00:00) status=ready
FAIL  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
      drive infeasible wrong: status=ready tone=good cutoff=29906393
FAIL  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
      >=30m case wrong: nonDrive=0 covered=false short=0 line=""
FAIL  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
      past status wrong: status=ready tone=good sign=go waitLeft=0
FAIL  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
      {"t15":29906393,"hm15":"00:00","t60":29906393,"hm60":"00:00","diff":0,"t75":29906393,"hm75":"00:00"}
FAIL  M7. Saved lane defaults persist across leaving (Back / tab switch) and re-entering, with zero new storage keys
      {"chip45On":false,"cutoffBefore":"29906393","cutoffAfterBack":"29906393","extraKeys":[]}
FAIL  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)
      55mph parity mismatch: miles=29906393 (0m) time=29906393 (0m)

0/8 motel pins passed
```

### Pass-After Run (Final Tree, Both `TZ=America/Chicago` and `TZ=UTC`)

```text
=== MOTEL CHI ===
PASS  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
PASS  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
PASS  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
PASS  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
PASS  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
PASS  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
PASS  M7. Saved lane defaults persist across leaving (Back / tab switch) and re-entering, with zero new storage keys
PASS  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)

8/8 motel pins passed
=== MOTEL UTC ===
PASS  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
PASS  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
PASS  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
PASS  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
PASS  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
PASS  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
PASS  M7. Saved lane defaults persist across leaving (Back / tab switch) and re-entering, with zero new storage keys
PASS  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)

8/8 motel pins passed
```

---

## 6. Per-Suite Verification Results (Sequential Foreground Runs)

Browser suites ran with `no_proxy=localhost,127.0.0.1 NO_PROXY="" HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent`.

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Engine (`cd engine && npm test`)** | **PASS** (108/108, 64.2s) | **PASS** (108/108, 63.0s) | Recorded post-implementation in `agy-motel.log` step 144; `engine/` verified byte-identical to `work-carrierdayfix/engine`. |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 447.9kb`) | — | Built post-final `web/src/` edit (`task-149.log`); typecheck also re-passed inside both `npm run smoke` runs. |
| **Full Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | Covers `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs` (incl. Motel SSR/math block), plus all 12 DOM lanes below: |
| ↳ `dom/yesback.mjs` | **PASS** (`OK`) | **PASS** (`OK`) | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** (`C1FLUSH OK`) | **PASS** (`C1FLUSH OK`) | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** (`ADJUSTSTART OK`) | **PASS** (`ADJUSTSTART OK`) | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** (`C2SCRUB OK`) | **PASS** (`C2SCRUB OK`) | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** (`C3 OK`) | **PASS** (`C3 OK`) | via `npm run smoke` (incl. 9-item Plan hub `D10a`) |
| ↳ `dom/c3relaunch.mjs` | **PASS** (`C3 RELAUNCH OK`) | **PASS** (`C3 RELAUNCH OK`) | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** (`LOGEDIT OK`) | **PASS** (`LOGEDIT OK`) | via `npm run smoke` (incl. F3 zero new storage keys) |
| ↳ `dom/cascade.mjs` | **PASS** (`CASCADE OK`) | **PASS** (`CASCADE OK`) | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**8/8**) | **PASS** (**8/8**) | Verified both standalone and via `npm run smoke` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | **RED (pre-existing)** (88/89, 1 fail: `W2`) | Under `TZ=UTC`, pre-existing pin `W2` fails because `revisions.mjs:28` builds `Tms = new Date(2026,10,10,14,14,5)` in host TZ (`14:14 UTC = 08:14 CST`), leaving 1h 46m of `W2`'s 9h Central-day drive in the future (`6h 46m` vs expected `5h 00m`). All Motel/Plan-hub pins (`W1`, `W4`, `R1`, `R5`, `P1`–`P5`) **PASS** in both TZs. |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs. |
| **`dom/auditfix.mjs`** (Chromium) | **PASS** (**185/185**, `AUDITFIX OK`) | **N/A (guard exit 2)** | `auditfix.mjs:19` explicitly exits 2 unless `TZ=America/Chicago`. |
| **`dom/polish.mjs`** (Chromium) | **PASS** (**283/283**, `POLISH OK`) | **PASS** (**283/283**, `POLISH OK`) | Includes new `sweep/plan-9` on `MotelTab`: 0 overflow, 0 page errors, all touch floors (`48/56/64px`) pass in both TZs. |
| **`dom/layout.mjs`** (Chromium) | **RED (pre-existing)** (419 pass, 2 fail) | **RED (pre-existing)** (TimeoutError `L1870`) | In `TZ=America/Chicago`, the 2 fails (`[412x915/360x640 timeline gemini] (d) F`) are byte-identical to the unmodified `work-carrierdayfix` baseline (`~/hos-build/gate-cd-lane-layout.log`: `419 pass, 2 fail`). In `TZ=UTC`, `layout.mjs:1870` timed out waiting for `button.entry:not(.live)` because the test ran at `00:01 UTC`, when `layout.mjs`'s `N - 30` closed segments fell on the previous UTC day, leaving only the `.live` row on today's Log page. Zero Motel regressions. |
| **`dom/c3browser.mjs`** (Chromium, extra check) | 64 pass, 6 fail (pre-existing) | — | Not in `gate-carrierdayfix.sh`; run to verify edited Plan-hub 9-item pin — **PASS** at both `412x915` and `360x640`. The 6 fails are 3×2 pre-existing legacy pins (`More` pointer row & recap copy/stripe). |

---

## 7. Anything Uncertain / Scope Notes

1. **Remember-my-lane persistence across full page reloads vs in-session:**
   Because the hard invariants forbid editing `web/src/store.ts` (`1323046db6ba07b8c85805f89a103dc16f3776b5`) AND `logedit.mjs` pin `F3` fails the build if any new `localStorage` key is written beyond the 4 existing `hos-sandbox-*` keys, `web/src/motel.ts` stores the saved lane defaults in module memory (`sessionMotelDraft`), matching `stack.ts`, `rescue.ts`, `rollout.ts`, and `recap.ts`. Lane defaults persist across Back navigation, switching tabs (Now / Log / Settings), and re-entering the tool within an active app session (pinned by `M7`), but will reset on a cold browser reload. If cross-reload persistence is desired later, it should be added as an optional field inside `hos-sandbox-v1` when `store.ts` is next unfrozen.
2. **ON-duty waiting vs 60/70-hr cycle cutoff:**
   When a driver is logged `ON` while waiting, each minute of wait consumes both the 14/16-hr window and the 60/70-hr cycle. Following the brief's explicit guidance (*"show cycle as a feasibility check"* and *"Headline cutoff = the window cutoff"*), `evaluateMotel()` checks `hookMinutes + returnDriveMinutes <= cycleRemaining` for feasibility and displays `waitingOnDutyNote` showing the remaining cycle margin (`cycleRemaining - returnDutyMinutes`) when `currentStatus === 'ON'`, rather than computing a secondary cycle-burn cutoff clock. Note that if `cycleRemaining - returnDutyMinutes < waitLeftMinutes` while waiting `ON`, `cycleRemaining` ticks down live with `now` and will flip to red infeasible (`CYCLE`) once cycle margin runs out.
3. **Resume-session hang root cause:**
   The previous build run hit its 90-minute print timeout inside `task-149` because `web/test/dom/motel.mjs` originally ended with `if (bad) process.exit(1);` (no `process.exit(0)` on pass), leaving `App`'s live clock timer keeping the Node event loop open after printing `8/8 motel pins passed`. Fixed with `render(null, root); process.exit(bad ? 1 : 0);` at `web/test/dom/motel.mjs:551-552`.
4. **Pre-existing non-Motel reds under `TZ=UTC` / baseline `layout.mjs`:**
   Documented transparently in §6 (`revisions.mjs` `W2` under `TZ=UTC`, `auditfix.mjs` Chicago-only guard, `layout.mjs` 2 pre-existing `(d) F` pins matching `work-carrierdayfix` and midnight-UTC `L1870` seed timing). None were altered to keep diff scope strictly limited to Motel.
