# Handoff — Plan Tool #4 "Flip My Clock" Fix Round (`work-flipfix`)

- **Tree:** `~/hos-build/work-flipfix` (from `~/hos-build/work-flip`)
- **Review addressed:** `~/hos-build/REVIEW-FLIP.md` — Findings **F1–F5, F6, F7**
- **Build & deploy:** Built cleanly (`npm run build` / `tsc --noEmit`), NOT deployed, NOT pushed.

---

## Per-Finding Changes

### F1 — BLOCKING (legality): Dual-evaluate future-shutdown Option B (`ON` vs `D`) + assumption disclosure
- **`web/src/flip.ts:41-42`**: Added `FLIP_NO_DRIVE_ASSUMPTION` constant (`"Assumes no driving between now and shutdown. If you'll be driving before shutdown, this slide may not hold."`).
- **`web/src/flip.ts:111-129`**: Extended `FlipOptionB` with `assumesNoDrivingBeforeShutdown: boolean` and `assumptionLine: string | null`.
- **`web/src/flip.ts:381-458`**: `buildBaseTimeline` now builds both `baseSegments` (modeling `[now, effectiveShutdown)` as tentative `ON`) and `baseSegmentsDriving` (modeling `[now, effectiveShutdown)` as tentative `D`).
- **`web/src/flip.ts:562-578`, `712-776`**: Extracted `passesOptionBGate` and evaluated every split-sleeper candidate twice whenever `effectiveShutdown > now`: once with `baseSegments` (`ON`) and once with `baseSegmentsDriving` (`D`).
  - If the `D` variant passes → `assumesNoDrivingBeforeShutdown = false`, `assumptionLine = null`, uses the `D`-verified evaluation.
  - If only the `ON` variant passes → `assumesNoDrivingBeforeShutdown = true`, `assumptionLine = FLIP_NO_DRIVE_ASSUMPTION`.
  - If neither passes → candidate rejected (Option B omitted if none pass).
  - Ranking strictly prefers `D`-verified candidates over `ON`-only candidates before comparing `driveNow`, `cycle.remaining`, and `priority`.
- **`web/src/app.tsx:8608-8645`**: Option B card renders `(violation-free)` **only** when `!b.assumesNoDrivingBeforeShutdown`; when `b.assumesNoDrivingBeforeShutdown` is true, omits `(violation-free)` and renders the plainly visible assumption callout `<p class="flip-assumption" data-flip-b-assumption="1">{b.assumptionLine}</p>`.
- **`web/public/styles.css:1586`**: Added `.flip-assumption` styled with existing theme tokens (`var(--screen)`, `var(--warn)`, `var(--text)`).

### F2 — SHOULD FIX (+ F6): Default shutdown to actual rest start (`lastWorkEnd`) regardless of age; compute rest/34h from real rest start
- **`web/src/flip.ts:309-325`**: Removed the `< 24 * 60` cap in `defaultShutdownMinute()`. Whenever `lastWorkEnd !== null && lastWorkEnd < now`, returns `{ minute: lastWorkEnd, source: 'shift_end' }` regardless of how long the driver has been resting.
- **`web/src/flip.ts:461-471`**: Added `actualRestStart` to `BaseTimeline` using `restPeriods(baseSegments)` from `engine/src/index.ts`. When `effectiveShutdown <= now` and the trailing logged/bridged rest period connects contiguously to `tentativeStart`, `actualRestStart = Math.min(effectiveShutdown, lastRest.start)`. When `effectiveShutdown > now` (tentative work breaks prior rest), `actualRestStart = effectiveShutdown`.
- **`web/src/flip.ts:504-537`, `656`, `789-799`, `857`**: `buildOptionA`, `buildOptionB`, `buildOptionC`, and `bare10EndMinute` all measure from `base.actualRestStart`.
  - Option A computes `totalRestMinutes`, `extraRestMinutes`, `includes34Restart`, and earliest roll-out from the real rest start (so a 26h rest + 2h to Tue 14:00 yields Tue 14:00 with 28h total / +18h extra, and Tue 21:00 yields 35h with `includes34Restart: true`).
  - Option C's 34-hour guard (`afterStart - restStart >= LIMITS.RESTART`) uses `actualRestStart`, resolving **F6** even when a custom shutdown is set later than `lastWorkEnd`.

### F3 — MINOR: DST fall-back repeated hour in `nextWallClockAtOrAfter`
- **`web/src/flip.ts:267-293`**: In `nextWallClockAtOrAfter()`, for each calendar day candidate `cand = localToMinute(...)`, also checks `cand - 60` and `cand + 60` and accepts any shifted instant `>= minMinute` whose `localWallParts(alt, safeTz)` matches the exact `(y, m, d, hour, minute)`. On fall-back day (e.g., Sun Nov 1, 2026 in `America/Chicago`), a `01:30` target resolves to the second `01:30 CST` (`07:30Z`) when the first `01:30 CDT` (`06:30Z`) falls before `minMinute`.

### F4 — MINOR: Spring-forward gap explanatory note on Option A
- **`web/src/flip.ts:105`, `126`, `507`, `531`, `743`**: Added `dstGapShifted: boolean` (`rollOutHM !== targetHM`) to `FlipOptionA` (and `FlipOptionB` for heading honesty).
- **`web/src/app.tsx:8561`, `8571-8581`, `8626-8636`**: When `dstGapShifted` is true, changes the hero heading from `"Roll out on target"` to `"First roll-out after target"` and displays `<span class="flip-note" data-flip-a-dst-note="1">{plan.targetHM} does not occur that day (DST spring-forward) — this is the first roll-out after it.</span>`.
- **`web/public/styles.css:1585`**: Added `.flip-note`.

### F5 — MINOR (display accuracy): Option B Leg 1 preserves real status of already-logged rest
- **`web/src/flip.ts:584-646`, `729`, `746`**: Added `buildLeg1DisplaySegments(evalSegments, leg1Start, leg1End, pat, tz)`. Resolves `normalize(evalSegments, { merge: false })` over `[leg1Start, leg1End)`, keeps each interval's actual status (`OFF` vs `SB`) and logged vs tentative flag, merges adjacent same-status slices, and labels pure logged portions as `"Sleeper Berth (logged)"` / `"Off Duty (logged)"`. Clean single-status tentative Leg 1 retains the existing `"7h Sleeper Berth"` / `"3h Off Duty"` copy; mixed or differently-typed logged portions are split honestly so logged `SB` is never labeled `"Off Duty"` and logged `OFF` is never labeled `"Sleeper Berth"`.

### F7 — NIT: Remove dead `dropsOffMinutes` field
- **`web/src/flip.ts:131-151`, `783-843`**: Removed unused `dropsOffMinutes` from `FlipOptionC` and `buildOptionC`. Zero remaining references in `web/src` or `web/test`.

---

## New Pins FL9–FL12: Fail-Before vs Pass-After Evidence

All four new pins were added to `web/test/dom/flip.mjs` (`FL9` at line 580, `FL10` at line 707, `FL11` at line 781, `FL12` at line 852) and executed **first against the unmodified pre-fix `work-flip` source** and **then against `work-flipfix`**.

### Fail-Before (pre-fix `work-flip` code — 8/12 in both `America/Chicago` and `UTC`)

Both `TZ=America/Chicago` and `TZ=UTC` produced identical results: `FL1–FL8 PASS`, `FL9–FL12 FAIL`:

- **`FL9` (F1) FAIL:** Engine confirmed `DRIVE_11` under `D` (`hasD17Viol: true` = 90m over, `hasD16Viol: true` = 30m over), yet Option B DOM printed `"7/3 split-sleeper pair · drives 2h 00m between rest legs (violation-free)."` with no assumption line (`dom17Ok: false, dom16Ok: false`).
- **`FL10` (F2/F6) FAIL:** `defaultShutdownMinute` returned `{ source: "now" }` (`Tue 12:00`), Option A rolled out Wed Nov 11 14:00 (`29907120`) instead of Tue Nov 10 14:00 (`29905680`), with `totalRest = 1560m` (26h) instead of `1680m` (28h from Mon 10:00), and `includes34Restart: false` at Tue/Wed 21:00 (`tot: 1980`).
- **`FL11` (F3/F4) FAIL:** Fall-back resolved to Mon Nov 2 01:30 (`29893410`, `tot: 2090m`, `r34: true`) instead of Sun Nov 1 01:30 CST (`29891970`, `650m`); spring-forward displayed `"Sun 03:30"` under `"Roll out on target (Central)"` with empty `springNote: ""`.
- **`FL12` (F5) FAIL:** Case A (`3/7` with logged `SB 10:00→12:00`) emitted a single `OFF` row `"3h Off Duty · 3h 00m Tue 10:00 → Tue 13:00"`; Case B (`8/2` with logged `OFF 10:00→11:00`) emitted a single `SB` row `"8h Sleeper Berth · 8h 00m Tue 10:00 → Tue 18:00"`.

### Pass-After (`work-flipfix` — 12/12 in `America/Chicago`, `UTC`, and `Asia/Kolkata`)

```text
PASS  FL1. Option A (Extended Break): lands roll-out exactly on target with total/extra rest cost and fresh clocks matching evaluate()
PASS  FL2. Option B (Split-Sleeper Slide): appears when legal slide exists, violation-free in evaluate(), exact segment plan & clocks
PASS  FL3. Option B ABSENT when no valid split slide exists (11h drive exhausted, 14h window exhausted, or bare 10h exact hit)
PASS  FL4. Option C (Wait-for-Midnight Recap Bridge): appears only on tight-cycle fixture with engine cycle parity; absent when roomy or zero drop-off
PASS  FL5. Option C uses configured carrier-day boundary (06:00), not hard-coded midnight, matching evaluate()
PASS  FL6. Preset chips set documented targets (21:00 Night, 00:01 Midnight Recap, 03:00 Early Bird) and update Option A live
PASS  FL7. Shared ClockPick used for custom target time and shutdown edit; zero <input type="time"> in FlipTab
PASS  FL8. Standing line, non-medical framing, default shutdown from shift end vs now, Plan hub 11th item, Back navigation, zero new storage keys
PASS  FL9. F1: Future-shutdown Option B must not claim (violation-free) when driving to shutdown breaks 11h limit; shows assumption line or omits card
PASS  FL10. F2/F6: Driver resting >= 24h defaults to lastWorkEnd (Mon 10:00), Option A offers Tue 14:00 with rest figures from Mon 10:00
PASS  FL11. F3/F4: DST fall-back resolves to second 01:30 CST (not next day); spring-forward 02:30 shows Sun 03:30 with explanatory note
PASS  FL12. F5: Option B Leg 1 preserves real status of already-logged rest (logged SB not called Off Duty, logged OFF not called Sleeper Berth)

12/12 flip pins passed
```

---

## Test Suite Results (Sequential Foreground Runs)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
|---|---|---|---|
| `engine` `npm test` | **108/108 pass** | **108/108 pass** | 0 fail |
| `web` `npm run build` (`tsc --noEmit` + `build.mjs`) | **exit 0** | — | 0 type errors |
| `web` `npm run smoke` (typecheck, contrast 44/44 day & 44/44 night, nightlight, ocr-bundle, smoke.mjs, all 14 DOM lanes) | **exit 0** | **exit 0** | All green in both TZs |
| ↳ `dom/rescue.mjs` | **11/11** | **11/11** | |
| ↳ `dom/stack.mjs` | **15/15** | **15/15** | |
| ↳ `dom/motel.mjs` | **13/13** | **13/13** | |
| ↳ `dom/legal.mjs` | **15/15** | **15/15** | |
| ↳ `dom/flip.mjs` | **12/12** | **12/12** | Also **12/12** in `TZ=Asia/Kolkata` |
| ↳ `dom/carrierday.mjs` | **9/9** | **9/9** | |
| `dom/gemini.mjs` | **20/20** | **20/20** | |
| `dom/revisions.mjs` | **89/89** | **88/89** (`W2` only) | Pre-existing baseline failure in UTC (`REVIEW-FLIP.md`) |

---

## Hard Invariants Verification

| Invariant | Verification | Status |
|---|---|---|
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` → `1323046db6ba07b8c85805f89a103dc16f3776b5` | ✅ |
| `engine/` untouched | Zero edits; all 108/108 tests pass in both TZs | ✅ |
| No new `<input type="time">` | `grep -n 'type="time"' web/src/app.tsx` → 3 hits (lines 3804, 5656, 5694); 0 inside `FlipTab`/`FlipTimeSheet` (FL7) | ✅ |
| No new `localStorage` keys | 0 `localStorage` calls in `flip.ts`; FL8 `extraKeys: []` | ✅ |
| No dead `dropsOffMinutes` | `grep -rn dropsOffMinutes web/src web/test` → 0 hits | ✅ |
| No deploy / no push | Verified | ✅ |
