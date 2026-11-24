# Handoff — Plan Tool #2 "Do I Make It Back or Motel?" Fix Round 1 (`work-motelfix`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-motelfix` (copied from `/home/lae/hos-build/work-motel`)
- **Review Addressed:** `/home/lae/hos-build/REVIEW-MOTEL.md` (Findings F1, F2, F3, F4 + M8 non-round ceil pin nit)
- **Status:** Implemented, built, and verified in both `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Per-Finding Changes

### F1 (IMPORTANT, anti-conservative) — ON-duty waiting consumes the 60/70-hr cycle
- **Files & lines:**
  - `web/src/motel.ts:465-553, 589-594`
- **What changed:**
  - When `input.currentStatus === 'ON'` (and drive & cycle feasibility pass at `now`), `evaluateMotel()` computes `cycleCutoffMinute = now + (cycleRemainingMinutes - returnDutyMinutes)` (conservatively ignoring midnight carrier-day roll-off) and takes `cutoffMinute = Math.min(effectiveWindowCutoffMinute, cycleCutoffMinute)`.
  - When `cycleCutoffMinute < effectiveWindowCutoffMinute`, sets:
    - `binding = 'CYCLE'`
    - `bindingLabel = '${cycleLimitH}-hr cycle (ON-duty wait)'`
    - `bindingCite = '49 CFR 395.3(b)(1)'` (60/7) or `'49 CFR 395.3(b)(2)'` (70/8)
    - `bindingText` (rule pill), `headline` (e.g. `Must roll by 22:48 — 1h 18m of wait left (70-hr cycle)` or `0m of wait left (roll now — 70-hr cycle)`), `subline`, `waitingOnDutyNote`, and `dispatchText` (`Waiting at meet point (ON duty). Hard legal cutoff to return to terminal is 22:48 (70-hr cycle, 49 CFR 395.3(b)(2))...`) all reflect the cycle cutoff and cite `49 CFR 395.3(b)`.
  - When `currentStatus !== 'ON'` (e.g. `OFF` / `SB`), waiting does not consume the cycle and the window cutoff still binds.

### F2 (IMPORTANT, anti-conservative) — 30-minute break integrated into cutoff, roll-now ETA, and break line
- **Files & lines:**
  - `web/src/motel.ts:132-136, 362-377, 469-587, 641-645`
  - `web/src/app.tsx:7696-7704`
- **What changed:**
  - Reads `breakRemainingMinutes = activeEv.shift.breakRemaining` from the engine evaluation.
  - Computes `needBreakWait = shortHaulExempt ? 0 : Math.max(0, LIMITS.BREAK_LEN - currentNonDriveMinutes - hookMinutes)`, counting swap/hook time (ON duty not driving) toward the 30-minute break.
  - **Cutoff adjustment:** Let `preBreakWaitLeft = Math.min(baseWindowCutoffMinute, cycleCutoffMinute) - now`. If `!shortHaulExempt` and either `returnDriveMinutes > LIMITS.BREAK_AFTER` (>8h return drive) or (`breakRemainingMinutes < returnDriveMinutes && needBreakWait > 0 && preBreakWaitLeft < needBreakWait`), an en-route 30-minute OFF-duty break is required, so `effectiveWindowCutoffMinute = baseWindowCutoffMinute - 30` (consuming 30m of the 14/16-hr window, not the 60/70-hr cycle). When this adjusts the cutoff (`breakAdjustedCutoff`), `bindingLabel`, `bindingCite`, `bindingText`, `subline`, `breakLine`, and `dispatchText` explain why and cite `49 CFR 395.3(a)(3)(ii)`.
  - **F2(a) Roll-now & at-cutoff ETAs:** `enRouteBreakIfRollNowMinutes` is `30` whenever `!shortHaulExempt && validInput && (returnDriveMinutes > 480 || (breakRemainingMinutes < returnDriveMinutes && needBreakWait > 0))` (else `0`), added to `backIfRollNowMinute`; `enRouteBreakAtCutoffMinutes` is added to `backAtCutoffMinute`. `MotelTab` (`web/src/app.tsx:7696-7704`) appends `(incl. 30m break)` when an en-route break is included.
  - **F2(b) Break line counts hook time:** `breakMinutesShort = needBreakWait` and `breakCovered = shortHaulExempt || needBreakWait === 0`. When `currentNonDriveMinutes < 30` and `currentNonDriveMinutes + hookMinutes >= 30`, reports that wait + swap/hook covers the 30-minute break (`breakCovered = true`, `breakMinutesShort = 0`). When `needBreakWait > 0` and `hookMinutes > 0`, reports `Another N minutes of this wait (plus your M hook) covers your 30-minute break.` (or explains the `-30m` cutoff move when `breakAdjustedCutoff`).

### F3 (MEDIUM) — Honest session copy + `bigDay` defaults to OFF on fresh entry
- **Files & lines:**
  - `web/src/motel.ts:239, 254-272`
  - `web/src/app.tsx:7571-7585, 7637-7649, 7935-7942`
- **What changed:**
  - Replaced `"Lane defaults (return leg, hook time, Big Day) are saved automatically for next time."` / `"Reset saved lane defaults"` with honest in-session copy: `"Return leg and hook time are kept while the app stays open (Big Day resets to off each time you open this tool)."` / `"Reset lane defaults"`. No cross-reload persistence attempted (`store.ts` untouched, zero new `localStorage` keys).
  - `sanitizeMotelDraft()` in `web/src/motel.ts:270` always forces `bigDay: false`, and `MotelTab` (`web/src/app.tsx:7572`) initializes `useState<boolean>(false)` and writes `bigDay: false` to the session draft, so Big Day always starts OFF on every fresh entry into the tool while return leg / speed / hook / mode remain kept for the session.

### F4 (LOW) — Out-of-range typed mph visibly validated, never silently ignored
- **Files & lines:**
  - `web/src/app.tsx:7567-7568, 7587-7607, 7641-7646, 7830-7856`
- **What changed:**
  - Followed the app's own `Slider` / `useDurationBoxes` pattern: added controlled `mphText` and `mphNote` state in `MotelTab`.
  - Typing an empty or out-of-range mph (`< 25` or `> 80`, e.g. `20` or `95`) immediately renders a visible warning note (`data-motel-mph-note="1"`): `Enter 25–80 mph — your entry was not applied. Still using ${mph} mph.` (or `Enter 25–80 mph. Still using ${mph} mph.` when blank).
  - On blur (`onMphBlur`), preset-chip tap, or `resetLane`, `mphText` snaps back to `String(mph)` and `mphNote` clears, so the input value, the `"at N mph"` line, and the math (`res.effectiveMph`) always agree.

---

## 2. New & Changed Pins — Fail-Before vs. Pass-After Evidence

Updated/added in `web/test/dom/motel.mjs`:
- **Updated `M4` (`L306-374`):** Pins F2(b) hook-counted break credit (`18m` wait + `0m` hook → `12m` short; `18m` + `5m` hook → `7m` short; `18m` + `30m` hook → covered / `0m` short; plus DOM check toggling default 30m hook to 0m).
- **Updated `M7` (`L462-534`):** Pins F3 honest session copy (`while the app stays open`, no `for next time` / `saved automatically`), confirms miles/mph/hook survive Back & tab switch, confirms `bigDay` resets to `false` on fresh entry after both Back and tab switch, and verifies zero new `localStorage` keys.
- **Updated `M8` (`L562-574`):** Added Opus's non-round ratio check (`137 mi @ 53 mph = 156m` == time mode `156m`) to protect `Math.ceil`.
- **New `M9` (`L601-690`, F1):** Opus's exact near-limit 70-hr cycle fixture where the oldest day in the 8-day window (Nov 3) is `0h` so nothing rolls off at midnight (Nov 4–9 at `10h 07m` ON each, Nov 10 `D 17:00–21:00`, waiting `ON 21:00–21:30`, return `165 mi @ 55 mph = 3h`, hook `30m`). Asserts cutoff `22:48` (`78m` wait left), `binding === 'CYCLE'`, `49 CFR 395.3(b)` in rule pill & dispatch alert, engine simulation **0 violations at `22:48`** and **`CYCLE+1` at `22:49`**, zero-margin (`0m`) ON-duty edge (`ROLL SOON`, `waitLeft === 0`, `CYCLE`), OFF-duty contrast (`03:30`, `WINDOW_14`), and DOM verification.
- **New `M10` (`L692-784`, F2):**
  - Case A (Opus probe `p5.ts`): shift opened `10:00`, `D 13:00–20:00` (7h), `ON 20:00–20:05`, return `3h 40m`, hook `0m` → cutoff `19:50` (`status === 'passed'`, `-15m`), cites `49 CFR 395.3(a)(3)(ii)` in rule pill, subline, and dispatch text, plus DOM check.
  - Case B (hook covers break): same log, return `3h 15m`, hook `25m` (`5m + 25m = 30m` → `need = 0`) → cutoff stays `20:20` (`ready`, `15m` left), `breakCovered === true`, `backIfRollNowHM === '23:45'`, engine sim **0 violations at `20:20`** and **`WINDOW_14+1` at `20:21`**.
  - Case C (F2(a) roll-now ETA): same log, return `3h 00m`, hook `0m` → cutoff `21:00`, `backIfRollNowHM === '23:35'` (includes `+30m` en-route break, not `23:05`), `backAtCutoffHM === '00:00'`.
- **New `M11` (`L786-829`, F4):** DOM check typing `20` (<25) and `95` (>80) into `data-motel-mph="1"` → asserts visible `"Still using 55 mph"` note (`data-motel-mph-note="1"`), blur snaps field back to `"55"` and clears note, and valid `"60"` updates cutoff (`03:50`) and `"at 60 mph"` line in agreement.

### Fail-Before Output (against unmodified pre-fix `work-motel` `web/src/` code)
Pre-fix hashes verified before any `web/src/` edit:
- `web/src/motel.ts`: `88cc6fb32654eb6a8bca5478ce3f3c8c94a216ba`
- `web/src/app.tsx`: `25daf6a6d04e3133026b6f5ee419692377640e75`

```text
PASS  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
PASS  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
PASS  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
FAIL  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
      <30m (5m hook) case wrong: covered=false short=12 line="Another 12 minutes of this wait covers your 30-minute break."
PASS  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
PASS  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
FAIL  M7. Session lane defaults (miles/mph/hook) persist across leaving and re-entering; Big Day resets OFF; honest session copy; zero new storage keys
      lane copy overclaims persistence: found forbidden wording in "...Lane defaults (return leg, hook time, Big Day) are saved automatically for next time.Reset saved lane defaults..."
PASS  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)
FAIL  M9. F1: ON-duty waiting near 70-hr cycle (0h oldest day, no roll-off): CYCLE binds cutoff, rule pill & dispatch cite 49 CFR 395.3(b)
      ON-duty cycle cutoff wrong: status=ready cutoff=29906490 (want 29906208) hm=03:30 waitLeft=360
FAIL  M10. F2: 30-min break pulls cutoff -30m when waitLeft < need (Opus probe -> passed), hook>=need leaves cutoff unchanged, roll-now ETA includes en-route break
      Opus probe F2 failed: status=ready tone=warn cutoff=20:20 (want 19:50) waitLeft=15
FAIL  M11. F4: out-of-range typed mph shows visible "Still using N mph" note and snaps back on blur so input, "at N mph" line, and math agree
      {"noteLow":"","cutoffAfterLow":"03:30","atLineLow":true,"valAfterBlur":"20","noteAfterBlur":false,"noteHigh":"","noteValid":false,"cutoffAfter60":"03:50","atLine60":true}

6/11 motel pins passed
EXIT=1
```

### Pass-After Output (`work-motelfix`, both `TZ=America/Chicago` and `TZ=UTC`)

```text
=== MOTEL CHI ===
PASS  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
PASS  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
PASS  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
PASS  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
PASS  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
PASS  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
PASS  M7. Session lane defaults (miles/mph/hook) persist across leaving and re-entering; Big Day resets OFF; honest session copy; zero new storage keys
PASS  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)
PASS  M9. F1: ON-duty waiting near 70-hr cycle (0h oldest day, no roll-off): CYCLE binds cutoff, rule pill & dispatch cite 49 CFR 395.3(b)
PASS  M10. F2: 30-min break pulls cutoff -30m when waitLeft < need (Opus probe -> passed), hook>=need leaves cutoff unchanged, roll-now ETA includes en-route break
PASS  M11. F4: out-of-range typed mph shows visible "Still using N mph" note and snaps back on blur so input, "at N mph" line, and math agree

11/11 motel pins passed
=== MOTEL UTC ===
PASS  M1. 14-hr window binds: exact cutoff = windowEnd - returnDrive - hook, live tick, Plan hub placement & zero <input type="time">
PASS  M2. Big Day ON extends cutoff by +2h with eligibility warning; drive feasibility still enforced (infeasible stays infeasible)
PASS  M3. Return drive > drive remaining (and cycle shortfall): infeasible red verdict, no cutoff time presented as available
PASS  M4. 30-min break: non-driving stretch >=30m -> break-covered line; <30m -> minutes-short line with exact N
PASS  M5. Cutoff in the past: red motel/repower state; dispatch alert includes cutoff time and CFR cite
PASS  M6. Hook preset chips (15m / 30m / 45m / 60m) and custom duration box move cutoff minute-for-minute (15m vs 60m = 45m)
PASS  M7. Session lane defaults (miles/mph/hook) persist across leaving and re-entering; Big Day resets OFF; honest session copy; zero new storage keys
PASS  M8. Miles mode and drive-time mode produce the identical cutoff for the same trip (math + DOM toggle)
PASS  M9. F1: ON-duty waiting near 70-hr cycle (0h oldest day, no roll-off): CYCLE binds cutoff, rule pill & dispatch cite 49 CFR 395.3(b)
PASS  M10. F2: 30-min break pulls cutoff -30m when waitLeft < need (Opus probe -> passed), hook>=need leaves cutoff unchanged, roll-now ETA includes en-route break
PASS  M11. F4: out-of-range typed mph shows visible "Still using N mph" note and snaps back on blur so input, "at N mph" line, and math agree

11/11 motel pins passed
```

---

## 3. Per-Suite Verification Results (Sequential Runs)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 451.2kb`) | — | Built after final `web/src/` edits |
| **Full Web Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | Includes `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs`, and all 12 DOM suites below: |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** | **PASS** | via `npm run smoke` (incl. F3 zero new storage keys) |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | Verified standalone and via `npm run smoke` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | Not re-run (known pre-existing UTC `W2` host-TZ seed per `HANDOFF-MOTEL.md`) | All 89 pins pass in Chicago |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |

---

## 4. Hard Invariants Checked

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | Zero edits to any file under `engine/`; tree hash `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` = `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`; `engine` tests 108/108 pass | Untouched | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `M1` DOM check | `3` (unchanged from baseline; `0` in `MotelTab`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` F3 + `motel.mjs` M7 | `extraKeys: []` | **PASS** |

---

## 5. Files Modified in `work-motelfix`

- `web/src/motel.ts` — F1 (`CYCLE` binding when waiting ON duty), F2 (30-min break cutoff adjustment, roll-now/at-cutoff en-route break ETAs, hook counted toward break), F3 (`sanitizeMotelDraft` always forces `bigDay: false`).
- `web/src/app.tsx` — F2(a) `(incl. 30m break)` ETA annotation, F3 honest session lane copy & `bigDay` always initialized `false`, F4 visible mph validation note (`Still using N mph`) and blur/preset/reset sync.
- `web/test/dom/motel.mjs` — Updated `M4`, `M7`, `M8` and added `M9` (F1), `M10` (F2), `M11` (F4).
- `web/dist/*`, `web/dist-test/*` — Rebuilt bundles from `npm run build` / `npm run smoke`.
- `HANDOFF-MOTELFIX.md` — This handoff.

---

## 6. Notes / Anything Uncertain

1. **Direct cross-tree `diff` vs `../work-motel`:** The execution sandbox restricts filesystem reads to `/home/lae/hos-build/work-motelfix`, so `diff -rq ../work-motel/engine engine` could not be executed inside the sandbox. Instead, no files under `engine/` were modified (tree checksum recorded in §4), and the pre-fix `work-motel` hashes of `web/src/motel.ts` and `web/src/app.tsx` were recorded and used to execute the fail-before run in §2 before any edits were made to `web/src/`.
2. **Chromium browser suites (`polish.mjs`, `auditfix.mjs`):** Not executed inside the sandbox since Chromium/Playwright live outside the workspace boundary. No CSS tokens or touch-target layouts were removed or shrunk; the only new DOM elements in `MotelTab` are the conditional `<p class="small warn">` mph validation note (`data-motel-mph-note="1"`) and inline `(incl. 30m break)` ETA text.
3. **F1 + F2 interaction when waiting `ON` duty:** Because an en-route 30-minute break is taken OFF duty (consuming 30m of the 14/16-hr window, not the 60/70-hr cycle), `evaluateMotel()` applies the `-30m` break adjustment to `effectiveWindowCutoffMinute` before taking `min(effectiveWindowCutoffMinute, cycleCutoffMinute)`. When `cycleCutoffMinute <= effectiveWindowCutoffMinute`, `CYCLE` binds without falsely deducting 30m from the cycle clock, while `backAtCutoffMinute` still includes the 30m en-route break.
