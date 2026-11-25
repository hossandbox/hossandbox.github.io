# Handoff — My Week Fix Round 3 (`work-myweekfix3`)

**Tree:** `~/hos-build/work-myweekfix3` (branched from `~/hos-build/work-myweekfix2`)  
**Spec:** `~/hos-build/REVIEW-MYWEEKFIX2.md` (Opus spot-check 2 — closing the sole remaining open item, H5 dock-free early-wait split trap)  
**Status:** Ready for verification. **Not deployed, not pushed.**

---

## 1. Summary of What Changed (`file:line`)

Only **two** files changed vs. `work-myweekfix2` (`engine/`, `web/src/store.ts`, and `web/src/app.tsx` are byte-identical to `work-myweekfix2`):

1. **`web/src/week.ts`**
   - **`web/src/week.ts:1074-1168`** (`trySplitRescueForLoad`): Replaced unconditional post-appointment trailing rest placement with dock-free early-wait absorption. When `dockFree` (`nl.dockMinutes === 0 || nl.dockOff`) and `trailingFromSim.length > 0`, the trailing split leg starts **at `arrival`** instead of after `appt + dock`, absorbing both the early wait and any OFF-duty dock time. When an ON-duty dock is present (`nl.dockMinutes > 0 && !nl.dockOff`), the early wait and ON-duty dock emit first and the trailing split leg starts after the ON-duty dock completes, exactly as before.
   - **`web/src/week.ts:1207-1305`** (`trySplitRescueForLoad`): Removed the false `"required ... trailing sleeper berth"` phrasing across `split_rest` trap bodies and replaced it with honest outcome wording (`completing the <dur> sleeper berth leg after <Load>'s dock` when an ON-duty dock forces post-dock SB, or `completing the <dur> sleeper berth leg` otherwise), plus fixed the `An 8/2` vs. `A 7/3` article (`splitArticle`). Also updated the fallback body at **`web/src/week.ts:2931`** for the same article fix.
   - **`web/src/week.ts:1331-1336`** (`trySplitRescueForLoad`): Updated `bestTrap` selection to prefer the legal split candidate with the smallest `nextLoadShortfallMinutes` (instead of keeping the first trapped candidate). On ON-duty dock fixtures like `trapfix2` where both 8/2 and 7/3 trap, this reports the genuinely best legal split (`7/3`, `Late 1h 45m`, `7h 00m split SB`) instead of overstating lateness by 1 hour from 8/2 (`2h 45m`).

2. **`web/test/dom/myweek.mjs`**
   - **`web/test/dom/myweek.mjs:1-21`**: Updated header pin index to `MW1–MW19`.
   - **`web/test/dom/myweek.mjs:293-372`** (`MW3`): Re-pinned on the genuine ON-duty dock trap fixture (`Leg 2` with `60m` ON-duty dock, `Leg 3` appt `Tue 10:00`). Asserts `split_trap` fires in both synthesis and DOM with outcome-based price (`1h 45m`, `7h 00m split SB`, no `"required"` wording) and verified `straight10-push` preview trade.
   - **`web/test/dom/myweek.mjs:978-981` & `1029-1035`** (`MW12(a)` & `MW12(c)`): Updated downstream expectations on `p7` (`Leg 3` improves from `-255m` to `-75m` now that the kept dock-0 split is no longer pessimistic downstream) and `p4` (`midnight_recap_gate` hold reflects the true `Tue 07:45 -> Tue 23:00` = `15h 15m` hold instead of the artificially late `Tue 10:30` start).
   - **`web/test/dom/myweek.mjs:1407-1510`** (`MW18`): Re-pinned `MW18(b)` on the genuine dock-60 ON-duty fixture and rewrote the independent `evaluate()` brute-force checker (`earliestLeg3AnySplit`) to search all legal split schedules (2h/3h short-first, `OFF`/`SB` pre-drive, and `SB` starting **at arrival** when dock-free or around the ON-duty dock when ON-duty), verifying `arrSplitBest - apptLeg3 === 105` (`1h 45m`) and matching the planner's `Late 1h 45m on Leg 3 (7h 00m split SB)`.
   - **`web/test/dom/myweek.mjs:1512-1583`** (`MW19`): Added dedicated no-trap pin for the dock-0 (`trapfix`) and dock-OFF (`60m OFF` dock) early-wait fixtures: asserts 0 traps, split kept, `SB` starts at arrival (`Mon 19:30 -> Tue 03:30`) with no `OFF` early-wait segment, `Leg 2` on time (`Mon 19:30`), `Leg 3` on time (`Tue 09:00` with `bufferMinutes: 0`, earliest legal arrival `Tue 08:45` = `15m` early verified via `E.evaluate()`, and `Tue 08:45` = `+15m` slack when `bufferMinutes: 15`), and 0 engine violations.

---

## 2. SB-Absorb Rule as Implemented

Inside `trySplitRescueForLoad` (`web/src/week.ts:1074-1168`), after building the pre-drive rest, pre-trip (`ON`), and drive segments ending at `arrival`:

- Let `dockStart = Math.max(arrival, nl.apptMinute)` and `receiverPta = dockStart + nl.dockMinutes`.
- Let `dockHasOnDuty = nl.dockMinutes > 0 && !nl.dockOff` and `dockFree = !dockHasOnDuty`.

### When SB absorption applies (`dockFree && trailingFromSim.length > 0`)
1. **Short-first split (trailing `SB` leg of length `L` = 8h or 7h):**
   - Because there is no ON-duty dock interrupting rest between `arrival` and `receiverPta`, the trailing `SB` starts **at `arrival`** and runs `[arrival, arrival + L]`.
   - Delivery and any OFF-duty dock time occur inside the sleeper berth.
   - If `receiverPta > arrival + L` (early wait + OFF dock longer than the SB leg), a trailing `OFF` segment `[arrival + L, receiverPta]` finishes the wait so the driver still cannot depart before `receiverPta`.
   - `postSplitEnd = Math.max(receiverPta, arrival + L)`, verified via `checkTimelineViolations` (`evaluate()`).
   - Both the split-vs-straight-10 trap comparison (`evaluateNextLoadOutcome`) **and** the kept-split lane use this exact schedule, so a kept split is no longer pessimistic downstream.
2. **Long-first split (trailing `OFF` leg of length `L` = 2h or 3h):**
   - Any `OFF` early wait `[arrival, appt]` and `OFF` dock `[dockStart, receiverPta]` count toward the `L`-minute trailing short leg; only `Math.max(0, arrival + L - receiverPta)` additional `OFF` rest is appended past `receiverPta`.

### When the dock blocks absorption (`dockHasOnDuty`)
- When `nl.dockMinutes > 0 && !nl.dockOff`, the ON-duty dock `[dockStart, receiverPta]` interrupts continuous sleeper berth time.
- The planner emits the `OFF` early wait `[arrival, appt]` (if early), then the `ON` dock `[dockStart, receiverPta]`, and starts the trailing `SB` (or `OFF`) leg at `receiverPta` (after the ON-duty dock completes), exactly as before.
- When both `8/2` and `7/3` rescue Load `k` and both trigger a trap on Load `k+1`, `bestTrap` selects the split with the smaller shortfall (`7/3` -> 7h SB after dock, matching the engine brute-force lower bound on `trapfix2`).

*Note on `trapfix` (dock-0) Leg 3 arrival time:* With `bufferMinutes: 0`, `week.ts`'s standard backwards anchoring (`idealSame = Math.max(cursor, appt - buffer - wall)`) rolls Leg 3 at `Tue 03:45` (15m after `SB` ends at `Tue 03:30`) to arrive right on the `Tue 09:00` appointment (`0m` slack, matching straight-10's backwards-anchored `09:00` arrival). Rolling immediately at `Tue 03:30` (verified both by `E.evaluate()` and by setting `bufferMinutes: 15`) lands Leg 3 at **`Tue 08:45` (`15m` early)** — both are pinned in `MW19`.

---

## 3. Opus Probe Results (`trapgrid`, `trapfix*`, `p4/p5/p7`, `p4x`)

### 480-case `trapgrid` before vs. after

| Tree | Cases | No-split | Traps | False traps | Genuine traps | Split kept | Kept justified | Missed traps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `work-myweekfix` (pre-fix, from review) | 480 | — | 0 | 0 | 0 | 480 | 320 | **160** |
| `work-myweekfix2` (before fix3) | 480 | 150 | 319 | **209** | 110 | 11 | 11 | 0 |
| **`work-myweekfix3` (after fix3)** | **480** | **150** | **110** | **0** | **110** | **220** | **220** | **0** |

Raw `trapgrid` output on `work-myweekfix3`:
```text
{"cases":480,"no-split-scenario":150,"split-kept":220,"kept-justified":220,"trap":110,"trap-genuine":110}
GENUINE {"m1":275,"dock1":60,"ap2":"Mon 20:15","dock2":60,"dockOff2":false,"m3":220,"ap3":"Tue 04:15","splitPlannerLate":315,"splitAltLate":null,"straightLate":150,"price":"+1h 45m later on Leg 3 (7h 00m split SB)"}
GENUINE {"m1":275,"dock1":60,"ap2":"Mon 20:15","dock2":60,"dockOff2":false,"m3":220,"ap3":"Tue 05:15","splitPlannerLate":255,"splitAltLate":null,"straightLate":90,"price":"+1h 45m later on Leg 3 (7h 00m split SB)"}
```

### Targeted fixtures on `work-myweekfix3`

- **`trapfix` (dock 0, Leg 3 Tue 09:00):** **0 traps**, split kept (`8/2`, `SB Mon 19:30 -> Tue 03:30`), Leg 2 arrives `Mon 19:30` (`+180m` early), Leg 3 arrives `Tue 09:00` (`0m` slack; earliest legal `Tue 08:45`, `15m` early), `verdict: tight`, 0 violations.
- **`trapfix2` (dock 60m ON, Leg 3 Tue 10:00):** **1 genuine trap** (`Late 1h 45m on Leg 3 (7h 00m split SB)` — `"A 7/3 split saves Leg 2 by 7h 00m, but completing the 7h 00m sleeper berth leg after Leg 2's dock delays Leg 3 — leaving Leg 3 1h 45m late (vs. on time on straight 10)."`), matching brute-force `Tue 11:45` (`1h 45m` late) with zero overstatement and no `"required"` wording.
- **`trapfix3` (dock 0):** **0 traps** (`NO split_trap conflict`), all 3 loads fit on recaps using an 8/2 split.
- **`p4`:** **0 traps**, Leg 2 split kept (`+300m` slack), Leg 3 `-915m` (`15h 15m` late, `15h 15m` hold from `Tue 07:45 -> Tue 23:00`), `audit: []`.
- **`p4x`:** `SPLIT prefix PTA Tue 05:30 -> earliest legal Leg3 roll Tue 23:00 arrive Wed 01:15 late 915 min` == `STRAIGHT prefix PTA Tue 05:30 -> earliest legal Leg3 roll Tue 23:00 arrive Wed 01:15 late 915 min`.
- **`p5`:** **0 traps**, Leg 2 split kept, `homeSlack: -735` (`12h 15m` past home), `audit: []`.
- **`p7`:** **0 traps**, Leg 2 split kept, Leg 3 `-75m` (`1h 15m` late — improved by 3h from `-255m` because the kept dock-0 split starts SB at arrival), `audit: []`.

---

## 4. Fail-Before / Pass-After Evidence (`myweek.mjs`)

Running `work-myweekfix3`'s updated `web/test/dom/myweek.mjs` against `work-myweekfix2` (without modifying `work-myweekfix2`) vs. `work-myweekfix3`:

| Target Tree | `TZ=America/Chicago` | `TZ=UTC` | Failing pins |
|---|---|---|---|
| `work-myweekfix2` (before) | **15/19 FAIL (EXIT 1)** | **15/19 FAIL (EXIT 1)** | `MW3`, `MW12`, `MW18`, `MW19` |
| `work-myweekfix3` (after) | **19/19 PASS (EXIT 0)** | **19/19 PASS (EXIT 0)** | *(none)* |

Exact failures observed against `work-myweekfix2` (identical in Chicago & UTC):
- **`MW3` FAIL:** `work-myweekfix2` reported `"Late 2h 45m on Leg 3 (8h 00m split SB)"` and `"the required 8h 00m trailing sleeper berth"` (`priceMatchesReeval: false`).
- **`MW12` FAIL:** `work-myweekfix2` had `p7Ok: false` (`-255m` pessimistic kept-split downstream) and `p4Ok: false` (`gate4: "Hold roll-out +12h 30m"` from artificially delayed post-wait SB).
- **`MW18` FAIL:** `work-myweekfix2` reported `2h 45m` / `"required"` while independent `evaluate()` brute-force proved `arrSplitBestLate: 105` (`1h 45m`).
- **`MW19` FAIL:** `work-myweekfix2` fired a false `split_trap` (`traps: 1`, `dOffTraps: 1`), rejected the split (`l2.split: false`), and made Leg 2 5h late (`Tue 03:30`).

---

## 5. Full Suite Results (Both Timezones, Sequential Foreground)

| Suite | `TZ=America/Chicago` | `TZ=UTC` |
|---|---|---|
| `engine` `npm test` | **108/108 PASS (EXIT 0)** | **108/108 PASS (EXIT 0)** |
| `web` `npm run smoke` (overall) | **EXIT 0** | **EXIT 0** |
| — `tsc --noEmit` (`typecheck`) | PASS | PASS |
| — `contrast.mjs` | 44/44 day, 44/44 night PASS | 44/44 day, 44/44 night PASS |
| — `nightlight.mjs` | OK | OK |
| — `ocr-bundle.mjs` | OK (pass 1 & pass 2) | OK (pass 1 & pass 2) |
| — `smoke.mjs` + `yesback` + `c1flush` + `adjuststart` + `scrub` + `c3` + `c3relaunch` + `logedit` + `cascade` + `rescue` | PASS | PASS |
| — `stack.mjs` | 15/15 PASS | 15/15 PASS |
| — `motel.mjs` | 13/13 PASS | 13/13 PASS |
| — `legal.mjs` | 15/15 PASS | 15/15 PASS |
| — `flip.mjs` | 12/12 PASS | 12/12 PASS |
| — `miles.mjs` | 11/11 PASS | 11/11 PASS |
| — `carrierday.mjs` | 9/9 PASS | 9/9 PASS |
| — `myweek.mjs` | **19/19 PASS** | **19/19 PASS** |

---

## 6. Hard Invariants Verification

- **`engine/` identical to `work-myweekfix2`:** `diff -rq work-myweekfix2/engine work-myweekfix3/engine` → clean (0 diffs).
- **`web/src/store.ts` identical to `work-myweekfix2`:** `cmp work-myweekfix2/web/src/store.ts work-myweekfix3/web/src/store.ts` → clean (byte-identical).
- **Diff scope vs. `work-myweekfix2`:** Only `web/src/week.ts`, `web/test/dom/myweek.mjs`, and `HANDOFF-MYWEEKFIX3.md` (`web/src/app.tsx` untouched).
- **No new `<input type="time">`:** Verified (`app.tsx` untouched + `MW6` PASS).
- **No new `localStorage` keys:** Verified (`store.ts` untouched + `MW5`/`F3` PASS).
- **Not deployed, not pushed.**
