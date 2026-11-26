# HANDOFF — Clock 14 `drivers1fix`

**Workspace:** `/home/lae/hos-build/work-drivers1fix` (copied from `work-drivers1`)  
**Spec:** `/home/lae/hos-build/REVIEW-DRIVERS1.md` (Opus FIX-FIRST findings P1–P4 + approved PIN cooldown)  
**Date:** 2026-11-26  
**Status:** All fixes implemented, pinned, built, and verified across every required suite. **Not pushed or deployed.**

---

## 1. Per-Item Changes & Evidence

### P1 (Blocking) — Pending Undo survives a real relaunch for every driver
- **Root cause:** `profile.undoRaw` was only refreshed inside `stashCurrentProfileRuntime()` on lock/switch, while `activateDriverProfile()` unconditionally overwrote live `hos-sandbox-undo-v1` with `target.undoRaw`. Swiping the PWA away without tapping Switch left `target.undoRaw` stale/null, destroying the pending Undo on the next cold launch + unlock.
- **What changed:**
  - **`web/src/store.ts`**:
    - Added `syncActiveUndoRaw(raw: string | null)` which updates `vault.profiles[activeId].undoRaw` and persists immediately whenever the live `hos-sandbox-undo-v1` changes for the unlocked driver.
    - Updated `bootFromStorage()` for multi-driver vaults to adopt a non-null live `hos-sandbox-undo-v1` into `v.profiles[v.activeId].undoRaw` on cold launch (handling cold kills or seeded tests without ever overwriting an already-stashed `undoRaw` when the live key was cleared on a clean lock).
    - Updated `bootFromStorage()` for legacy pre-`drivers1` saves to capture `hos-sandbox-undo-v1` into the migrated `driver-1` profile at boot (still leaving `hos-sandbox-v1` byte-identical on disk until the user acts).
  - **`web/src/app.tsx`**:
    - Wired `setUndo()` to call `syncActiveUndoRaw(raw)` alongside every write/removal of `UNDO_KEY`.
    - Wired `currentUndo()` to call `syncActiveUndoRaw(null)` when retiring a restored undo snapshot that no longer matches state.
- **Evidence:**
  - **`drivers-relaunch` `DRR2`** (true two-process cold relaunch): Alice deletes a segment (`ALICE-DEL-ROW`) and exits **without** calling `lockDriverSession()`. Process 2 cold-boots from the persisted `localStorage` JSON, unlocks Alice via PIN, verifies `currentUndo()` is non-null, and confirms `undoLast()` restores `ALICE-DEL-ROW`.
  - **`drivers-relaunch` `DRR3`** (true two-process cross-driver cold relaunch): From Alice's swipe-away state, Process 3 cold-boots, unlocks **Bob** first (verifying zero undo bleed into Bob), then switches to Alice and confirms Alice's pending undo still restores `ALICE-DEL-ROW`.
  - **`auditfix` (real Chromium)**: Deletes a Log entry as Marcus, executes a real `page.reload()` without locking, unlocks Marcus via keypad, and verifies `hos-sandbox-undo-v1` survives intact (`195/195` pass).

### P2 (Blocking) — Simulated-clock quarantine survives a real relaunch
- **Root cause:** Same stash-only-on-lock lifecycle for `profile.simRaw` / `hos-sandbox-v1-sim`. Swiping away during a simulated-clock episode caused `activateDriverProfile()` on relaunch to delete `SIM_KEY`, turning quarantined sim writes permanent when tapping "Use real clock".
- **What changed:**
  - **`web/src/store.ts`**:
    - Updated `snapshotSimRecord(s)` to return the serialized snapshot string written to `SIM_KEY`.
    - Updated `setState()` so the `nowOverride` `null → value` edge immediately stores `capturedSimRaw` into `vault.profiles[activeId].simRaw` and persists it in the same atomic `persistNow(state)` write; returning `nowOverride` to `null` (via `useRealClock()` or `eraseAll()`) clears `vault.profiles[activeId].simRaw = null` and persists.
    - Updated `bootFromStorage()` so multi-driver vaults adopt a non-null `SIM_KEY` when `topState.nowOverride !== null` (never clobbering a stashed `simRaw` when `SIM_KEY` was cleared on clean lock), and clear `simRaw` when `topState.nowOverride === null`.
- **Evidence:**
  - **`drivers-relaunch` `DRR4`** (true two-process cold relaunch): Alice enables simulated clock, writes `SIMWRITE-ROW` + simulated `My Week` load `SIM-LOAD`, and exits **without** locking. Process 2 cold-boots, unlocks Alice, verifies `SIM_KEY` and `nowOverride` survive, calls `useRealClock()`, and confirms `SIMWRITE-ROW` and `SIM-LOAD` are discarded while `REAL-ROW` and `REAL-LOAD` remain intact.
  - **`drivers-relaunch` `DRR5`** (two-process cold relaunch + register): From Alice's sim-active swipe-away state, Process 3 cold-boots, registers Charlie on the splash (Charlie sees real clock and no `SIM_KEY`), then switches to Alice and confirms `useRealClock()` still discards `SIMWRITE-ROW`.
  - **`auditfix` (real Chromium)**: Unlocks Testing via long-press on `[data-build-line]`, sets a simulated time, taps On Duty, executes a real `page.reload()` without locking, unlocks Marcus via keypad, taps "Use real clock", and confirms status reverts to `SB`, segment count reverts to pre-sim, `nowOverride === null`, and `SIM_KEY` is removed.

### P3 — Registration stash guard & legacy setup cross-driver undo isolation
- **Root cause:**
  1. `registerDriver()` called `stashCurrentProfileRuntime()` without checking `unlockedDriverId !== null`, so registering from the locked splash screen (where `lockDriverSession()` had already cleared live `UNDO_KEY`/`SIM_KEY`) overwrote the previous driver's stashed `undoRaw` and `simRaw` with `null`.
  2. `completeLegacyDriverSetup()` read live `hos-sandbox-undo-v1` when `prof.undoRaw === null`; after another driver was active and cold-killed, that copied the other driver's undo (and log rows) into the migrated legacy profile.
- **What changed:**
  - **`web/src/store.ts`**:
    - Guarded `registerDriver()`'s stash with `if (unlockedDriverId !== null && vault.activeId === unlockedDriverId && vault.profiles[vault.activeId])` (matching `activateDriverProfile()`).
    - Added the same `unlockedDriverId !== null && vault.activeId === unlockedDriverId` guard to `lockDriverSession()` so a redundant lock call while already locked can never clobber stashed `undoRaw`/`simRaw`.
    - Removed the live `sessionHooks.readUndoRaw()` fallback from `completeLegacyDriverSetup()` (legacy undo is already captured at boot inside `bootFromStorage()`).
- **Evidence:**
  - **`drivers` `DR7`**: Locks Marcus with a pending undo -> registers `Zed` -> unlocks Marcus -> undo survives; arms sim clock + `MARCUS-SIM-WRITE` -> locks Marcus -> registers `Quinn` -> unlocks Marcus -> `SIM_KEY` survives and `useRealClock()` discards `MARCUS-SIM-WRITE`.
  - **`drivers` `DR10`**: Legacy single-driver save with a legacy `hos-sandbox-undo-v1` preserves the legacy undo through guided setup.
  - **`drivers-relaunch` `DRR6`** (true two-process cold relaunch): Starts from a legacy save with no undo, registers Bob while `Driver 1` stays `needsSetup`, Bob arms an undo containing `BOB-SECRET-ROW` and cold-kills without locking. Process 2 cold-boots and completes legacy setup as `Lena`: Lena's `currentUndo()` is `null`, `hos-sandbox-undo-v1` is absent, Lena's persisted profile has `undoRaw: null` and zero `BOB-SECRET-ROW` strings, and unlocking Bob restores Bob's undo + `BOB-SECRET-ROW`.

### P4 — Strengthened pins that genuinely fail under Opus's mutations
- **(a) True two-process cold-relaunch pins (`web/test/dom/drivers-relaunch.mjs`, wired into `npm run dom`):**
  - Spawns completely separate Node processes per stage with `localStorage` persisted to a temp JSON file before importing `store.ts` / `app.tsx` (never calls `reloadVaultFromStorage()`).
  - Covers cold-launch splash lock with 1 driver (`DRR1`, catches M6), undo survival across swipe-away relaunch (`DRR2` & cross-driver `DRR3`), sim-quarantine survival across swipe-away relaunch (`DRR4` & post-register `DRR5`), and legacy setup cross-driver undo isolation (`DRR6`).
  - Complemented by real-Chromium `page.reload()` pins for P1, P2, and cooldown in `web/test/dom/auditfix.mjs`.
- **(b) Active-driver-only export pin (`web/test/dom/drivers.mjs` `DR6`):**
  - With both Marcus and Elena populated, scans raw `exportState(getState())` case-insensitively for both drivers and asserts none of the other driver's name, segment notes, load labels, load IDs, `__drivers`, `sha256-2048`, `"salt"`, `"hash"`, or `"recovery"` appear (catches Opus's M7 mutant).
  - Also fixed **N1** (`web/src/app.tsx` `reportBug()` now passes `exportState(s, '')`) and pinned that anonymous bug-report exports omit `driverName` and still contain zero other-driver data.
- **(c) Plaintext & distinct-salt scans (`web/test/dom/drivers.mjs` `DR2` & `DR3`):**
  - Replaced quote-dependent, case-sensitive string checks with `scanVaultSecrets(...)` scanning both `hos-sandbox-v1` and `hos-sandbox-v1-backup`.
  - Asserts case-insensitive, quote-free absence of every normalized recovery answer across primary & backup saves, plus exact equality of every stored `recovery[i].question` against curated `REMINDER_QUESTIONS` (catches M1b).
  - Asserts PINs do not appear in stored JSON outside hex hash/salt fields, never equal/prefix/suffix or consistently embed inside salts across drivers or `createHashedSecret` probes (catches M2c).
  - Asserts every salt is 32 lowercase hex chars and all 6 salts across 2 drivers (2 PINs + 4 recovery answers) plus repeated `createHashedSecret()` calls are strictly distinct (catches M2).

### PIN & Recovery Cooldown (Approved recommendation)
- **What changed:**
  - **`web/src/store.ts`**:
    - Added in-memory-only per-driver cooldown tracking (`authCooldowns`, zero storage keys added) for both PIN entry (`unlockDriverWithPin`) and Forgot-PIN recovery (`checkDriverRecoveryAnswers`, `resetDriverPinWithRecovery`).
    - After **5 consecutive wrong attempts** on a driver, enforces a **30-second** cooldown (`AUTH_COOLDOWN_BASE_MS = 30_000`), doubling on each subsequent miss (`60s`, `120s`, `240s`, ... capped at 30 minutes).
    - During cooldown, even the **correct** PIN / answers are refused with the honest remaining wait (`Too many wrong PINs. Wait 30 seconds before trying again.`).
    - Per-driver isolation: misses on one driver never lock out another driver.
    - A correct PIN after cooldown enters cleanly and resets the driver's cooldown counter to 0; successful recovery also resets both recovery and PIN counters.
    - Exported `getPinCooldownRemainingMs`, `getRecoveryCooldownRemainingMs`, and `formatCooldownWait` for live UI readouts.
  - **`web/src/driver-ui.tsx`**:
    - Added a 1-second countdown effect (active only while a cooldown is nonzero) on the PIN and recovery screens.
    - Disables `PinKeypad` and the recovery submit button during cooldown and displays the live honest countdown in the `role="alert"` box; clears and re-enables automatically when the timer reaches 0.
- **Evidence:**
  - **`drivers` `DR8`**: 4 misses keep keypad enabled -> 5th miss triggers 30s cooldown, disables keypad, shows `30 seconds`, blocks even Marcus's right PIN while leaving Elena unaffected -> 6th miss after 30s escalates to `60 seconds` -> right PIN blocked mid-wait -> right PIN enters cleanly after 60s and resets counter (subsequent single miss does not trigger cooldown).
  - **`drivers` `DR9`**: Same 5-miss -> 30s -> 60s escalation, block-during-wait, and reset-on-success verification for Forgot-PIN recovery.
  - **`auditfix` (real Chromium)**: 5 wrong PIN taps on Elena disable all 10 keypad digit buttons and display `"Too many wrong PINs. Wait ... seconds"`, while backing out to the picker and unlocking Marcus works immediately.

---

## 2. Files Changed & Pins Added/Replaced

### Source Files Modified
- `web/src/store.ts` — P1/P2 write-time + boot sync for `undoRaw`/`simRaw`, P3 guards (`registerDriver`, `lockDriverSession`, `completeLegacyDriverSetup`), in-memory per-driver escalating PIN/recovery cooldowns.
- `web/src/app.tsx` — P1 `syncActiveUndoRaw` wiring in `setUndo` & `currentUndo`; N1 anonymous `exportState(s, '')` in `reportBug`.
- `web/src/driver-ui.tsx` — Honest live cooldown countdown copy and disabled keypad/submit state during PIN and recovery cooldowns.
- `web/package.json` — Added `drivers-relaunch.mjs` to `npm run dom`.

### Pins Added / Replaced
- **`web/test/dom/drivers.mjs`** — Expanded from `8` → **`11` pins**:
  - Replaced weak DR2/DR3 plaintext check with P4(c) case-insensitive, quote-free storage/backup scan + distinct-salt verification (`scanVaultSecrets`).
  - Strengthened DR6 with P4(b) active-driver-only raw export scans for both drivers + anonymous bug-report export check.
  - Added `DR7` (P3 register-while-locked preserves previous driver undo & sim quarantine).
  - Added `DR8` (PIN cooldown: 5 misses -> 30s -> block right PIN -> per-driver isolation -> 60s escalation -> entry & counter reset).
  - Added `DR9` (Recovery cooldown: 5 misses -> 30s -> 60s escalation -> reset on valid answers).
  - Strengthened `DR10` (former DR7) to also assert legacy `hos-sandbox-undo-v1` survival through migration; `DR11` (former DR8) unchanged.
- **`web/test/dom/drivers-relaunch.mjs`** (new, **`6` pins**, wired into `npm run dom`) — True two-process cold relaunch pins (`DRR1`–`DRR6`) covering M6, P1, P2, and P3.
- **`web/test/dom/auditfix.mjs`** — Expanded from `192` → **`195` pins** (+3 real-Chromium pins: P1 reload undo survival, P2 reload sim-quarantine survival & discard on "Use real clock", and 5-miss PIN cooldown UI).

---

## 3. Verification Suite Results (Sequential Foreground)

All suites were run sequentially in the foreground against the rebuilt `web/dist/` (`HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/`, `HOS_BROWSER=/usr/bin/chromium`):

| Lane | Command | Result |
|---|---|---|
| **Build + Typecheck** | `cd web && npm run build` | **PASS** (`tsc --noEmit` clean, `dist/app.js` 656.8kb) |
| **Contrast** | `cd web && node test/contrast.mjs` | **PASS** (44/44 day, 44/44 night, 44/44 wind-down) |
| **Nightlight** | `cd web && node test/nightlight.mjs` | **PASS** (night & wind-down budgets held, A1/A2 clean, graphic pairs ≥ 3.0) |
| **Smoke (UTC)** | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck`, `contrast` (44/44×3), `nightlight`, `ocr-bundle`, `smoke.mjs` OK, `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16, `rescue` 11/11, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, `myweek` 19/19, **`drivers` 11/11**, **`drivers-relaunch` 6/6** |
| **Smoke (America/Chicago)** | `cd web && TZ=America/Chicago npm run smoke` | **PASS** (exit 0; all 18 DOM sub-lanes identical counts above, including `myweek` 19/19, **`drivers` 11/11**, **`drivers-relaunch` 6/6**) |
| **Gemini (Chicago)** | `esbuild` + `TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**) |
| **Revisions (Chicago)** | `esbuild` + `TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**89/89**) |
| **Lebrowser (Chromium)** | `TZ=America/Chicago ... node test/dom/lebrowser.mjs` | **PASS** (**252/252**) |
| **Auditfix (Chromium)** | `TZ=America/Chicago ... node test/dom/auditfix.mjs` | **PASS** (**195/195**, including new real-browser P1, P2, and PIN cooldown pins) |
| **Polish (Chromium)** | `TZ=America/Chicago ... node test/dom/polish.mjs` | **PASS** (**295/295**) |
| **Layout (Chromium)** | `TZ=America/Chicago ... node test/dom/layout.mjs` | **PASS** (**421/421**, zero flakes) |

- **Storage keys invariant:** Verified by `smoke.mjs` patch 19 static check and runtime checks across `drivers.mjs`, `auditfix.mjs`, and `myweek.mjs` — strictly `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, `hos-sandbox-undo-v1` (zero new keys, zero renames).

---

## 4. `engine/` Hash Confirmation

Verified with `find engine -type f | sort | xargs sha256sum | sha256sum`:

- **Expected:** `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`
- **Actual:**   `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`
- **`engine/` is byte-identical and untouched.**
