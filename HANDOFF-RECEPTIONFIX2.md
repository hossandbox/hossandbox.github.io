# Handoff — Clock 14 `receptionfix2` (`work-receptionfix2`)

**Tree:** `~/hos-build/work-receptionfix2` (copied from `work-receptionfix`)  
**Scope:** Fix round addressing all 3 blocking findings (`B1`, `B2`, `B3`) and 4 non-blocking items (`N1`, `N2`, `N3`, `N4`) from `~/hos-build/REVIEW-RECEPTIONFIX.md`. Out-of-scope items (`N5`, `N6`, `N8`, `N9`) left untouched.  
**Status:** Built (`dist/app.js` 679.9 KB), engine hash byte-identical, all suites green sequentially in the foreground (see Section 4 for the pre-existing 00:00–03:00 midnight-window note on `layout` in `America/Chicago` and its clean 421/421 pass in `UTC`). **Not deployed, not pushed.**

---

## 1. Hard Invariants Verified

- **`engine/` byte-identical:**
  ```
  find engine -type f -not -path '*/node_modules*' -not -path '*/dist*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` exactly.
- **localStorage keys unchanged:** Only `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, and `hos-sandbox-undo-v1` are read or written.
- **Additive-only persisted schema:** Zero schema renames or breaking changes; no new persisted keys added in this round.
- **Shared `ClockPick` untouched:** All time-of-day entries continue to use the shared `ClockPick`.
- **Legal disclaimer verbatim:** `CLOCK14_DISCLAIMER_TEXT` is untouched.
- **Files touched (only 6 files):** `web/src/app.tsx`, `web/src/store.ts`, `web/src/driver-ui.tsx`, `web/test/dom/drivers.mjs`, `web/test/dom/drivers-relaunch.mjs`, `web/test/dom/myweek.mjs`.

---

## 2. Per-Fix Summary (`file:line`)

### B1 — Non-destructive ELD screenshot refresh, clean override form, and belt-and-braces reseed confirm + Undo
1. **Populated-log Now CTA routes to DriftSheet (`web/src/app.tsx:708,2719-2735,3271-3459,13194`):**
   - When `historyBasis(s, now) === 'fresh'`, `"Refresh from ELD screenshot"` (`data-eld-screenshot-btn="1"`) opens `QuickStartSheet` in `mode: 'screenshot'` exactly as before.
   - When `historyBasis(s, now) !== 'fresh'`, it opens `DriftSheet` in `mode: 'screenshot'` (`data-drift-sheet="1"`, `data-drift-shot-mode="1"`), offering on-device OCR (`import('./eldocr-run.ts')`, lazy-loaded) that extracts the clocks via `extractEldClocks`/`mergeExtractions` and **prefills** the drive-left hours/minutes boxes (`data-drift-h="1"`, `data-drift-m="1"`) without touching or replacing any log rows.
   - If OCR cannot read drive-left, disagrees on two values, or throws, the sheet stays right in `DriftSheet` with a plain error (`data-drift-shot-err="1"`) ready for manual entry and `"Compare"`. Tapping Compare stamps `lastEldCheckAt: now` and leaves the log byte-unchanged.
2. **Removed reseed button from `<InlineClockOverride>` (`web/src/app.tsx:598-602`):**
   - Removed the `"Refresh from ELD screenshot"` button from inside `<InlineClockOverride>` entirely; replaced with a plain-text note (*"To check your live log against your ELD, use Now → Check against my ELD."*) and zero reseed/refresh buttons inside the form.
3. **Belt-and-braces confirmation + `undoable(...)` on `QuickStartSheet` (`web/src/app.tsx:2924,2943,3075-3150`):**
   - Whenever `QuickStartSheet.confirm()` is invoked over a non-empty log (`cur.segments.length > 0`), it stops before mutating state and shows an explicit confirmation screen (`data-qs-replace-confirm="1"`): **"This replaces your N logged rows."** (or `"row"` for 1) with `"Replace my log & set clocks"` (`data-qs-replace-proceed="1"`) and `"Keep my log"` (`data-qs-replace-cancel="1"`).
   - Applying a seed over a non-empty log runs inside `undoable('Replaced log from ELD clocks', ...)`.
   - When the driver subsequently picks their current status on the `done` step (`finishStatus`), the `SEED_UNDO_LABEL` undo entry is updated to keep `before` = the pre-reseed snapshot and `after` = post-status snapshot so `Undo` on the Log remains valid and restores all prior rows + prior `current` whether or not the driver tapped a status button.

### B2 — `stayUnlocked` never silently re-arms on return to 1 driver
1. **Clear on reaching 2+ drivers (`web/src/store.ts:1158-1163,1195-1200`):**
   - In `registerDriver` and `completeLegacyDriverSetup`, whenever `vault.order.length > 1`, `delete vault.stayUnlocked` executes immediately before persisting, so the stored flag matches the copy (*"Stay unlocked turns off while more than one driver is on this phone."*) and Settings pill.
2. **Store-level refusal (`web/src/store.ts:1253-1270`):**
   - `setStayUnlocked(driverId, true, currentPin)` now refuses at the store level whenever `vault.order.length !== 1`, returning `{ ok: false, error: 'Stay unlocked turns off while more than one driver is on this phone.' }` without arming `vault.stayUnlocked`.
3. **Corrupt-partial-vault defense-in-depth (`web/src/store.ts:683-730`):**
   - `sanitizeVault` tracks whether any malformed/blank profile was dropped (`droppedProfile`) and checks `rawProfileKeys.length === 1`. `stayUnlocked: true` is preserved only on an intact single-driver vault (`raw.stayUnlocked === true && !droppedProfile && order.length === 1 && rawProfileKeys.length === 1`), so even a tampered/legacy 2-driver payload on disk whose 2nd profile is corrupted and dropped can never auto-unlock.

### B3 — My Week custom clocks carry into chained Rollout & Rescue drill-downs (Load 1 & Load 2+)
1. **Chain context carries custom clocks + synthesized base (`web/src/app.tsx:4890-4893,4968-4971,10481-10502`):**
   - Added `chainedCustomClocks?: EldClocks` and `chainedBaseSegments?: Segment[]` to both `RolloutPrefill` and `RescuePrefill`.
   - `MyWeekTab.chainContextFor(o)` attaches both fields whenever `customClocks` is active — for **both** Load 1 (`o.index === 0`) and Load 2+ (`o.index > 0`).
   - Also guarded `if (!customClocks) primeWeekHubCache(...)` (`web/src/app.tsx:10358-10370`) so custom-clock sessions never overwrite the live-log Plan hub cache.
2. **Rollout & Rescue honor the carried base and display the clock basis (`web/src/app.tsx:6762-6776,6838-6848,7288-7299,7453-7467,7521-7531,7733-7744`):**
   - Both `RolloutTab` and `RescueTab` initialize `customClocks` from `prefill?.chainedCustomClocks ?? null` and use `prefill.chainedBaseSegments` in place of `loggedSegments(s, now)` whenever present (both chained Load 2+ and unchained Load 1).
   - Verdict basis lines explicitly name `"Seeded from My Week custom clocks + chain (...)"` / `"Seeded from My Week custom clocks"`.
   - For Load 1, `<InlineClockOverride>` renders pre-populated and active (`data-clock-override-active="1"`). For Load 2+ chained loads with custom clocks, a read-only custom-clocks basis bar (`data-clock-override="rollout"|"rescue"`, `data-clock-override-active="1"`, `data-chained-custom-clocks="1"`) displays the exact carried drive/window/cycle clocks and notes to return to My Week to edit them (avoiding inconsistent mid-chain base edits without re-simulating prior loads).

### Non-blocking fixes (`N1`–`N4`)
- **N1 (`web/src/app.tsx:5734-5739,5958-5963`):** `SplitTab` disables `"Put plan on log as what-if"` (`data-split-commit="1"`, `disabled={planOnLog || Boolean(customClocks)}`), guards `commit()` with `if (customClocks) return;`, and renders `"Custom clocks are on — turn them off to put this plan on your log."` (`data-split-override-note="1"`) while custom clocks are active.
- **N2 (`web/src/store.ts:1214-1244,1266,1362-1410`, `web/src/driver-ui.tsx:1062,1108-1121`):** Extracted shared `verifyDriverPinWithCooldown()` and routed `setStayUnlocked`, `changeDriverPin`, `updateDriverRecovery`, and `removeDriverProfile` through the exact same per-driver escalating `pin` cooldown as `unlockDriverWithPin` (checks cooldown first, refuses malformed PIN without recording a miss, records misses on wrong PINs, clears PIN cooldown on valid PIN). Added `data-change-pin-*` selectors to the Settings Change PIN form for DOM verification.
- **N3 (`web/src/store.ts:2093-2095`):** `applyImportedState()` now sets `lastEldCheckAt: null` so an imported log never inherits `"ELD-checked just now"` from the prior record.
- **N4 (`web/src/app.tsx:419-431`):** `eldStalenessInfo()` now formats elapsed durations `>= 24h` as `<N>d ago` (e.g. `1d ago`, `13d ago` instead of `312h ago`).

---

## 3. New & Extended Pins (What Each Proves)

- **`web/test/dom/drivers.mjs` — now `17/17` (was `14/14`, +3 new pins, +2 extended):**
  - **`DR13` (extended for N4):** Asserts staleness chip renders `"Checked against your ELD 1d ago — tap to check"` at +24h and `"Checked against your ELD 13d ago — tap to check"` at +312h (never `"312h ago"`).
  - **`DR14` (extended for N3):** Stamps `lastEldCheckAt = T`, runs `applyImportedState(...)`, asserts `lastEldCheckAt === null` and Now staleness chip returns to `'never'`.
  - **`DR15` (new — B1):**
    - *(i)* Populated 6-day / 18-row log + active Off Duty → Now `"Refresh from ELD screenshot"` CTA opens `DriftSheet` in screenshot mode (`kind === 'drift'`, `data-drift-shot-mode="1"`), OCR success prefills drive-left (`11h 0m`), Compare stamps `lastEldCheckAt` with log byte-unchanged; OCR failure stays in `DriftSheet` with `data-drift-shot-err="1"` for manual entry with log byte-unchanged.
    - *(ii)* Forced reseed via `QuickStartSheet` over 18-row log requires explicit `"This replaces your 18 logged rows"` confirmation (`data-qs-replace-confirm="1"`); Cancel preserves all 18 rows; Confirm seeds and arms `undoable(...)`, selecting a status on the `done` step keeps Undo armed, and `undoLast()` restores all 18 rows + prior `current` byte-identically.
    - *(iii)* `<InlineClockOverride>` form contains zero Refresh / ELD screenshot / reseed buttons.
  - **`DR16` (new — B2 store-level + N2):**
    - Exercises the Settings Change PIN form UI: 5 wrong PINs trigger the 30s cooldown (`data-change-pin-err="1"`), correct PIN is refused during the wait in Change PIN, `updateDriverRecovery`, and `removeDriverProfile`; 6th miss via `updateDriverRecovery` escalates to 60s; valid PIN after cooldown clears it; `removeDriverProfile` also triggers 30s cooldown on 5 wrong PINs.
    - Registers a 2nd driver while `stayUnlocked` is on → asserts `getStayUnlocked() === false` AND direct store calls to `setStayUnlocked(..., true, validPin)` return `ok: false`.
  - **`DR17` (new — N1):** Opens `SplitTab`, verifies `[data-split-commit="1"]` is enabled without custom clocks, applies custom clocks → button disabled + `"Custom clocks are on — turn them off to put this plan on your log."` shown + zero tentative writes, clears override → button re-enabled and note gone.
- **`web/test/dom/drivers-relaunch.mjs` — now `14/14` (was `12/12`, +2 TRUE two-process cold-relaunch pins + strengthened `DRR9`):**
  - **`DRR9` (strengthened):** Asserts registering 2nd driver clears `getStayUnlocked()` and store refuses `setStayUnlocked(..., true, validPin)`.
  - **`DRR13` (new — B2 self-erase):** Alice enables `stayUnlocked`, Bob registers (`stayUnlocked` cleared from disk), Bob erases himself with his PIN leaving Alice solo → fresh cold Node relaunch gates at picker/PIN (`splash === 1`, `unlocked === null`, `navCount === 0`).
  - **`DRR14` (new — B2 corrupt-profile drop):** 2-driver vault with Bob's profile name blanked on disk — tested BOTH naturally cleared AND with a tampered `stayUnlocked: true` forced on disk → fresh cold Node relaunch gates at picker/PIN in both cases (`splash === 1`, `unlocked === null`, `navCount === 0`).
- **`web/test/dom/myweek.mjs` — now `20/20` (was `19/19`, +1 new pin):**
  - **`MW20` (new — B3):** Fresh live log (11h/14h/70h) with 2 loads where live-log Load 2 Rollout literally reports `"Fits cleanly"`. Enters tight custom clocks (`2h drive / 3h window / 2h break / 6h cycle`) in My Week → drills into Load 2 Rollout → asserts `"Does not fit"` (NOT `"Fits cleanly"` / `"Fits current shift"`), `"My Week custom clocks"` basis, non-live cycle left, and visible custom-clocks basis bar (`data-chained-custom-clocks="1"`). Also verifies Load 1 Rollout (no prior chain) and Load 2 Rescue both carry the tight custom-clock base and show the active override bar.

---

## 4. Test Suite Results (All Sequential, Foreground)

| # | Suite | Command | Result / Pin Counts |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 679.9kb) |
| 2 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** — `typecheck` OK, `contrast` 44/44×3, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` PASS, and all 18 DOM suites PASS: `yesback`, `c1flush`, `adjuststart`, `scrub`, `c3` (46/46), `c3relaunch` (3/3), `logedit` (37/37), `cascade` (16/16), `rescue`, `stack` (15/15), `motel` (13/13), `legal` (15/15), `flip` (12/12), `miles` (11/11), `carrierday` (9/9), **`myweek` 20/20** (+1), **`drivers` 17/17** (+3), **`drivers-relaunch` 14/14** (+2) |
| 3 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** — full pass across all sub-suites (`myweek` 20/20, `drivers` 17/17, `drivers-relaunch` 14/14) |
| 4 | **revisions** | `esbuild test/dom/revisions.mjs ... && node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 5 | **gemini** | `esbuild test/dom/gemini.mjs ... && node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 6 | **auditfix** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`) |
| 7 | **polish** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run polish` | **295 pass, 0 fail** (`POLISH OK`) |
| 8 | **layout** | `TZ=UTC HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run layout` | **421 pass, 0 fail** (`LAYOUT OK`, zero flakes) — see note below on the 00:38 CST run |

> **Pre-existing `layout.mjs` midnight-window note:** When `npm run layout` first ran at `00:38 CST` (`TZ=America/Chicago`), `layout.mjs:1902` (`waiting for locator('section.page-log.is-active button.entry:not(.live)')`) timed out because pre-existing `motionSeed()` (`layout.mjs:62,1856-1865`, untouched by this build) seeds closed rows from `nowMinute - 600` through `nowMinute - 180` using real wall-clock `Date.now()` — between `00:00` and `03:00` local time, all 12 closed rows fall in yesterday's carrier day, leaving zero closed rows on today's Log. Running the identical untouched `layout.mjs` under `TZ=UTC` (06:38 local wall clock) passed **421 / 421 (`LAYOUT OK`)** with zero failures.

---

## 5. Judgment Calls Flagged for Opus's Spot-Check

1. **B1 `QuickStartSheet` Undo preservation across the 2-step `done` → status pick (`web/src/app.tsx:3127-3142`):** Because `QuickStartSheet.confirm` writes `{ ...patch, current: null }` and then `finishStatus(st)` sets `current` on the `"What are you doing right now?"` screen, a naive `undoable(...)` in `confirm` would have been invalidated the instant the driver tapped their current status (`currentUndo()` compares `s.current === a.current`). Updating `undoNow.after` in `finishStatus` when `prevUndo?.label === SEED_UNDO_LABEL` keeps Undo armed both before and after status selection so all prior rows + prior `current` restore cleanly.
2. **B1 OCR test seam (`web/src/app.tsx:2920-2922,3042-3044,3300-3302`):** Exported `setEldOcrOverrideForTest` (default `null`) so Node DOM tests can deterministically exercise both OCR-prefill and OCR-failure branches in `DriftSheet` without loading Tesseract WASM, while preserving the lazy `await import('./eldocr-run.ts')` inside both `QuickStartSheet` and `DriftSheet` (passing `smoke.mjs` patch 12 lazy-import checks).
3. **B2 `sanitizeVault` defense-in-depth (`web/src/store.ts:683-730`):** Beyond deleting `vault.stayUnlocked` in `registerDriver` / `completeLegacyDriverSetup` and refusing `setStayUnlocked(..., true)` when `order.length !== 1`, `sanitizeVault` also refuses to preserve `stayUnlocked: true` if any profile was dropped or `Object.keys(raw.profiles).length !== 1`. This guarantees even a pre-fix or manually corrupted 2-driver vault on disk cannot auto-unlock after dropping a corrupt profile.
4. **B3 chained Load 2+ custom clocks bar (`web/src/app.tsx:7288-7299,7733-7744`):** Load 1 drill-downs render the full editable `<InlineClockOverride>` pre-populated with My Week's `customClocks`; Load 2+ chained drill-downs render a read-only custom-clocks basis bar (`data-chained-custom-clocks="1"`) showing the exact carried clocks with a note to edit them in My Week, because `chainedPriorSegments` were already simulated from My Week's base and changing the base mid-chain without re-simulating Load 1 would create a new mismatch.
5. **B3 Plan hub cache purity (`web/src/app.tsx:10358-10370`):** Skipped `primeWeekHubCache(...)` while `customClocks` is active in `MyWeekTab` so session-only custom clocks never bleed into the Plan hub summary card.
6. **N2 malformed PIN handling (`web/src/store.ts:1214-1244`):** `changeDriverPin`, `updateDriverRecovery`, and `removeDriverProfile` share `verifyDriverPinWithCooldown()` with `setStayUnlocked` — malformed inputs (non-4-digit strings) are refused without consuming a cooldown miss, while any 4-digit wrong PIN increments the shared per-driver `pin` cooldown counter and valid PINs clear it.
