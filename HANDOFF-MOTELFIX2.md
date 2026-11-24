# Handoff — Plan Tool #9 "Do I Make It Back or Motel?" Fix Round 2 (`work-motelfix2`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-motelfix2` (copied from `/home/lae/hos-build/work-motelfix`)
- **Review Addressed:** `/home/lae/hos-build/REVIEW-MOTELFIX.md` — Findings **N1** (MEDIUM, blocker) and **N2** (LOW, folded in).
- **Explicitly Untouched:** **F1–F4** (closed in Round 1), **N3–N5** (deferred per Opus review & prompt), `web/src/store.ts`, `engine/`, `web/public/styles.css`.
- **Status:** Implemented, built, and verified in both `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Per-Finding Changes

### N1 (MEDIUM, blocker) — "Too early to roll" dead zone
- **Files & lines:**
  - `web/src/motel.ts:128-135` — Added `earliestRollMinute`, `earliestRollHM`, `earliestRollShort`, `rollNowOverWindow`, and `earliestRollWarning` to `MotelResult`.
  - `web/src/motel.ts:421-425, 542-571, 606-609, 671-675` — Inside `status === 'ready'`, computes `rollNowOverWindow = backIfRollNowMinute > windowEndMinute`. Whenever `enRouteBreakIfRollNowMinutes > 0 && rollNowOverWindow && needBreakWait > 0` (i.e. `now + hook + drive + 30 > windowEnd`), computes `earliestRollMinute = now + needBreakWait`, formats `earliestRollHM` / `earliestRollShort`, and populates:
    - `earliestRollWarning`: `"Don't roll before ${earliestRollHM} — ${needBreakWait} more ${needBreakWait === 1 ? 'minute' : 'minutes'} here completes your 30-minute break; rolling earlier forces a 30-min stop that runs past your ${windowLimitH}-hr window (49 CFR 395.3(a)(3)(ii))."`
    - `dispatchText`: appends `" Don't roll before ${earliestRollHM} (${needBreakWait}m more here completes 30-min break, 49 CFR 395.3(a)(3)(ii); rolling earlier forces a 30m stop past the ${windowLimitH}-hr window)."` when `earliestRollHM` applies (for both window-bound and cycle-bound `ready` states).
    - `breakLine`: when `earliestRollHM` applies (and `enRouteBreakAtCutoffMinutes === 0`), reinforces waiting until at least `earliestRollHM` rather than giving a passive break hint.
  - `web/src/app.tsx:7696-7728` — In `MotelTab`:
    - Renders `res.earliestRollWarning` in a prominent `<p class="warnbox" data-motel-earliest-roll="1" ...>` right inside the verdict card when present.
    - Adds `data-motel-roll-now-over-window={res.rollNowOverWindow ? '1' : '0'}` on `data-motel-back-eta="1"`, highlights `res.backIfRollNowHM` in `var(--bad)` when over the window, and marks the roll-now ETA with `(incl. 30m break — past 14h window)` (using `${res.windowLimitMinutes / 60}h`).

### N2 (LOW, folded in) — Break line contradicts headline when cycle binds and a break is needed
- **Files & lines:**
  - `web/src/motel.ts:596-605` — Changed the break-line branch condition from `if (breakAdjustedCutoff)` to `if (enRouteBreakAtCutoffMinutes > 0)`:
    - When `breakAdjustedCutoff` is `true` (window binds + 30m break pulled cutoff earlier): preserves the existing `"Cutoff moved 30m earlier for a required en-route 30-minute break (49 CFR 395.3(a)(3)(ii)) — ..."` copy.
    - When `enRouteBreakAtCutoffMinutes > 0 && !breakAdjustedCutoff` (cycle binds while an en-route 30m break is still required, e.g. Opus Probe P): outputs `"En-route 30-minute break required (49 CFR 395.3(a)(3)(ii)) — ... leaves ${breakMinutesShort} minutes short before your ${cycleLimitH}-hr cycle cutoff; take the 30m break OFF duty en route."` instead of falling through to `"Another N minutes of this wait covers your 30-minute break."`

---

## 2. New Pins — Fail-Before vs. Pass-After Evidence

> **Note on pin numbering:** In `work-motelfix`, `web/test/dom/motel.mjs` already contained 11 pins (`M1`–`M11`, where `M11` is F4's mph validation pin). To keep closed findings F1–F4 completely untouched, `M1`–`M11` were preserved verbatim and the two new Round 2 pins were appended as **`M12` (N1)** and **`M13` (N2)** (`13/13` pins total).

Added in `web/test/dom/motel.mjs`:
- **`M12` (`L827-970`, N1):**
  - **Opus Probe G** (`shift 10:00`, `D 13:00–20:00`, `ON 20:00–20:05`, return `3h 25m = 205m`, hook `15m`): asserts cutoff `20:20` (`waitLeft = 15m`), `earliestRollMinute = 20:15`, `rollNowOverWindow = true`, exact `"Don't roll before 20:15 — 10 more minutes here completes your 30-minute break; rolling earlier forces a 30-min stop that runs past your 14-hr window (49 CFR 395.3(a)(3)(ii))"` warning, `backIfRollNowHM = '00:15'`, `backAtCutoffHM = '00:00'`, and dispatch text citing `20:15`, `20:20`, and `49 CFR 395.3(a)(3)(ii)`.
  - **Engine legality checks (Probe G):** rolling at `20:05` → `WINDOW_14+15` with break / `BREAK_30` without; rolling at `20:15` → **0 violations**; rolling at `20:20` → **0 violations**; rolling at `20:21` → **`WINDOW_14+1`**.
  - **Opus Probe E** (`hook 0m`, return `3h 30m = 210m`, single legal roll minute `20:30`): asserts `earliestRollMinute === cutoffMinute === 20:30`, `rollNowOverWindow = true`, exact warning copy, and engine legality (`20:05` → `WINDOW_14+5`, `20:30` → **0 violations**, `20:31` → **`WINDOW_14+1`**).
  - **DOM verification (Probe G):** renders `MotelTab` via Plan hub, checks `data-motel-earliest-roll="1"`, `data-motel-roll-now-over-window="1"` / `past 14h window`, and `data-motel-dispatch="1"`.
- **`M13` (`L973-1064`, N2):**
  - **Opus Probe P** (`70/8`, Nov 3 = `0h`, Nov 4–8 = `5 × 10h` ON, Nov 9 = `9h 27m` ON, `OFF` to Nov 10 `10:00`, `ON 10:00–10:15`, `OFF 10:15–13:00`, `D 13:00–20:00`, `ON 20:00–20:05`, return `3h 00m`, hook `0m`): asserts `binding = 'CYCLE'`, `cutoffHM = '20:18'` (`waitLeft = 13m`), `enRouteBreakAtCutoffMinutes = 30`, `breakAdjustedCutoff = false`, `earliestRollMinute = null`, and verifies `breakLine` does **not** advise `"Another 25 minutes"` and **does** state `"En-route 30-minute break required"` citing `49 CFR 395.3(a)(3)(ii)`.
  - **Engine legality checks (Probe P):** rolling at `20:18` with 30m OFF en-route break → **0 violations**; `20:19` → **`CYCLE+1`**; waiting 25m to `20:30` (old buggy break-line advice) → **`CYCLE+12`**.
  - **DOM verification (Probe P):** renders `MotelTab`, confirms `data-motel-binding="CYCLE"`, `20:18`, `data-motel-break="1"` requires en-route break (no `"Another 25 minutes"`), and no `data-motel-earliest-roll` box.

### Fail-Before Output — Pre-Fix `work-motelfix` Code & Swapped-In `work-motelfix` `motel.ts`

Pre-fix hashes (`work-motelfix` baseline):
- `web/src/motel.ts`: `565be8188ab4355a8b040e93ef20bb31618de8e2`
- `web/src/app.tsx`: `511d2eca836e0ec8c3f00affd2a68c78bc615125`

Identical failure output observed BOTH (a) before editing `web/src/` and (b) after editing `web/src/app.tsx` with `work-motelfix`'s `motel.ts` swapped back in (`SWAP_EXIT=1`):

```text
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
FAIL  M12. N1: "too early to roll" dead zone (Probe G + Probe E): warns earliest legal roll, flags over-window roll-now ETA, mentions in dispatch, and matches engine legality
      Probe G earliestRoll/overWindow wrong: earliest=undefined (undefined) overWindow=undefined
FAIL  M13. N2: cycle binds while 30-min break needed (Probe P): cutoff 20:18 CYCLE, break line requires en-route break instead of advising 25m wait
      Probe P breakLine contradicts cycle cutoff by advising 25m wait: "Another 25 minutes of this wait covers your 30-minute break."

11/13 motel pins passed
SWAP_EXIT=1
```

### Pass-After Output (`work-motelfix2`, both `TZ=America/Chicago` and `TZ=UTC`)

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
PASS  M12. N1: "too early to roll" dead zone (Probe G + Probe E): warns earliest legal roll, flags over-window roll-now ETA, mentions in dispatch, and matches engine legality
PASS  M13. N2: cycle binds while 30-min break needed (Probe P): cutoff 20:18 CYCLE, break line requires en-route break instead of advising 25m wait

13/13 motel pins passed
=== MOTEL UTC ===
PASS  M1..M13 (all 13 identical PASS lines)
13/13 motel pins passed
```

---

## 3. Per-Suite Verification Results (Sequential Runs)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 453.2kb`) | — | Built after final edits |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |
| **Full Web Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | Includes `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs`, and all 12 DOM suites: |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** | **PASS** | via `npm run smoke` (incl. zero new storage keys) |
| ↳ `dom/cascade.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | M1–M13 (incl. M12 N1 + M13 N2) |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | 88/89 (known pre-existing `W2` host-TZ seed per `HANDOFF-MOTEL.md` / `HANDOFF-MOTELFIX.md`) | All 89 pass in Chicago |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/auditfix.mjs`, `dom/polish.mjs`, `dom/layout.mjs`** | Not runnable in sandbox (`exit 2`: `playwright-core not found under /home/hatch/workspace/hos-patch/p18-scratch/`) | — | Real-browser Playwright harness lives outside workspace sandbox (same as `HANDOFF-MOTELFIX.md` §6). No CSS files modified; new UI uses existing `.warnbox` and verified `var(--bad)` on `var(--panel)` (AA 4.5:1 in `contrast.mjs`). |

---

## 4. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to `work-motelfix`) | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `M1` DOM check | `3` (unchanged from baseline; `0` in `MotelTab`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` F3 + `motel.mjs` M7 | `extraKeys: []` | **PASS** |

---

## 5. Files Modified in `work-motelfix2`

- `web/src/motel.ts` (`44701d6b2b498e3e33045c1e8debc8ae17167dfb`) — N1 (`earliestRollMinute`/`HM`/`Short`, `rollNowOverWindow`, `earliestRollWarning`, dispatch mention, dead-zone break line) and N2 (`enRouteBreakAtCutoffMinutes > 0` break-line branch).
- `web/src/app.tsx` (`db1838bbf5bdc3611df8a8d83c35cbecf922ae50`) — N1 verdict warning callout (`data-motel-earliest-roll="1"`) and roll-now ETA over-window marking (`data-motel-roll-now-over-window`).
- `web/test/dom/motel.mjs` — Added `M12` (N1 Probe G + Probe E) and `M13` (N2 Probe P), preserving `M1`–`M11` untouched.
- `web/dist/*`, `web/dist-test/*` — Rebuilt bundles from `npm run build` / `npm run smoke` / `revisions` / `gemini`.
- `HANDOFF-MOTELFIX2.md` — This handoff.
