VERDICT: FIX-FIRST

# Clock 14 `receptionfix` — independent review (Opus)

- New tree: `~/hos-build/work-receptionfix`
- Baseline: `~/hos-build/work-splashart`
- Handoff: `~/hos-build/HANDOFF-RECEPTIONFIX.md`
- Read-only review. Neither tree was modified. Scratch copies, bundles and probes live under `/tmp/rv/`.

Summary: the engine is byte-identical, storage keys are unchanged, the schema changes are additive, and the PIN-to-enable path for stay-unlocked is correct. Three problems block shipping:

- **B1:** the new "Refresh from ELD screenshot" front door can wipe a driver's whole log with no undo.
- **B2:** the stay-unlocked flag silently comes back on after a 2nd driver leaves, even though the app said it "turns off".
- **B3:** chained My Week drill-downs mix the custom clocks with the live log.

Each fix is small.

---

## Blocking findings

### B1 — "Refresh from ELD screenshot" replaces an active driver's whole log with no warning and no undo (data loss)

**Evidence**
- `web/src/app.tsx:2716-2731` adds the CTA to Now in **every** non-preview state. It opens `QuickStartSheet` with `mode: 'screenshot'`.
- The same sheet is also reachable from inside every `<InlineClockOverride>` form (`web/src/app.tsx:600`). That form says "Session-only — … without changing your log" (`:556`).
- `QuickStartSheet.confirm` (`web/src/app.tsx:3074-3082`) calls `applyEldSeed`. That call replaces `segments` and `tentative` and resets `current` (`web/src/store.ts:2637-2646`) through a plain `setState`. It is not wrapped in `undoable(...)`, and the sheet asks for no confirmation. The only "replace" wording anywhere in the sheet is the post-hoc trust line.
- Baseline only reached this sheet when the log was empty. All three baseline entry points (`work-splashart/web/src/app.tsx:1401,1462,2969`) sit behind `hist === 'fresh'` / `historyBasis(...) === 'fresh'`. This build is the first to put a log-replacing action one tap away from Now on a populated log, and it labels it "Refresh".
- The fields are pre-filled with the max clocks (`app.tsx:2926-2927`), so "Set my clocks" works immediately, even if the OCR read fails or the driver taps through.

**Reproduced** (probe `/tmp/rv/probes/rf-probe.mjs`, stage `refresh-a`, run against the new tree):
- Setup: registered driver, 6 days of real history (18 rows), active Off Duty.
- Steps: tap `data-eld-screenshot-btn` on Now, then tap "Set my clocks".
```
[refresh-a] {"viaClick":true,"ctaFound":true,"sheet":{"kind":"quickstart","mode":"screenshot"},
             "before":18,"after":1,"realRowsLeft":0,"undo":null}
```

**Failure scenario:** A driver mid-week taps the prominent "Refresh from ELD screenshot" button to check the clocks. They pick a screenshot (or tap through) and press "Set my clocks". Six days of their own entries become a single synthetic seed row. Undo is empty, and the 7/8-day recap and every Plan tool now run on estimates.

**Fix (any one is enough):**
- (a) When `historyBasis(s, now) !== 'fresh'`, route the screenshot result into the drift-compare flow (`DriftSheet`, using the OCR'd drive-left), not into a reseed. This matches the "refresh / check" wording, and the drift flow already stamps `lastEldCheckAt`.
- (b) Or wrap the seed in `undoable('Replaced log from ELD clocks', …)` and show an explicit "This replaces your N logged rows" confirm when `segments.length > 0`.

Separately, remove or relabel the "Refresh from ELD screenshot" button inside `InlineClockOverride`. A destructive action does not belong inside a form labeled session-only.

### B2 — `stayUnlocked` silently re-arms when the vault drops back to one driver (2nd driver erases themselves, or a corrupt profile gets dropped)

**Evidence**
- `registerDriver` keeps `vault.stayUnlocked` when a 2nd driver is added (`web/src/store.ts:1151-1155`). `removeDriverProfile` deletes the flag only when `order.length === 0` (`store.ts:1375`).
- `computePendingAutoUnlock` keys only on `order.length === 1` (`store.ts:799-805`).
- `sanitizeVault` drops any malformed profile (bad or empty name, non-object) before `order` is counted (`store.ts:690-697`). A partially corrupt 2-driver vault therefore sanitizes to 1 driver with the flag still set.
- What the UI tells the user: "Stay unlocked **turns off** while more than one driver is on this phone" (`driver-ui.tsx:774,876`, plus the Settings row). The Settings pill shows **Off** while 2+ drivers exist (`driver-ui.tsx:1045-1051`), even though the flag is still `true` on disk.

**Reproduced** (same probe, two-process cold relaunches, new tree):
```
[rearm-a]         {"drivers":2,"storedFlag":true}           <- Alice opted in, Bob added: flag still persisted
[cold]            {"unlocked":null,"splash":1}              <- correctly gated with 2 drivers
[bob-erases-self] {"unlockBob":true,"removed":true,"left":["Alice"]}
[cold]            {"unlocked":"Alice","splash":0}           <- next cold launch lands INSIDE Alice, no PIN
--- corrupt-partial-vault variant ---
[rearm-a]         {"drivers":2,"storedFlag":true}
[corrupt-bob]     (Bob's profile name blanked on disk)
[cold]            {"unlocked":"Alice","splash":0}           <- corrupt 2-driver vault auto-unlocks Alice
```

**Failure scenarios:**
1. Team drivers. Alice once enabled stay-unlocked, then added co-driver Bob, and the app told her it "turns off". Bob can open Alice's clocks and her Settings without her PIN: he erases his own profile with his own PIN, then relaunches.
2. Storage corruption of any one profile in a 2-driver vault puts the device into no-PIN mode for the other driver. That breaks the brief's "unreachable with a corrupt/partial vault" requirement.

**Fix:** In `registerDriver` (and in `completeLegacyDriverSetup` when `order.length > 1`), `delete vault.stayUnlocked` as soon as the vault has 2+ drivers. Also refuse `setStayUnlocked(…, true, …)` when `order.length !== 1` (today only the UI stops it, at `driver-ui.tsx:973-976`). Then the stored flag matches the copy and the pill, and #2 goes away. Add a two-process pin for both scenarios above.

### B3 — My Week custom clocks leak an inconsistent basis into chained Rollout/Rescue drill-downs (H4-class contradiction)

**Evidence**
- `MyWeekTab` plans on the synthetic seed when `customClocks` is set (`app.tsx:10158-10164`).
- `chainContextFor` passes `priorLoads.flatMap(pl => pl.simSegments)` into Rollout and Rescue (`app.tsx:10301-10309`). Those prior loads were simulated on top of the synthetic history.
- When chained, Rollout and Rescue build `base` from `loggedSegments(s, now)`, the **live** log (`app.tsx:6630-6635`, `7299-7304`). The custom clocks are not carried over, and the override bar is hidden in chained mode (`app.tsx:7139`, `7562`), so the driver can't re-enter them.
- For Load 1 (no chain), the drill-down opens with a fresh `customClocks = null`, so it also answers on the live log while My Week showed the custom-clock answer.

**Failure scenario:** A driver with a stale or empty live log enters ELD clocks in My Week (for example, 2h drive left). Load 2 shows as not fitting, and they tap "When to roll" for Load 2. Rollout evaluates "empty live log + Load 1 sim rows", sees ample hours, and can say "Fits cleanly". This is the same contradiction H4 was fixed to prevent.

**Fix:** When My Week has `customClocks`, put the synthesized base in the chain context (for example `chainedBaseSegments`) or pass the clocks themselves. Rollout and Rescue should then use that base in place of `loggedSegments` whenever it is present, including for Load 1.

---

## Non-blocking findings

- **N1 — Split tool can commit an override-derived plan to the live log.** `SplitTab.commit` writes `tentative: plan` (`app.tsx:5731`), and `plan` comes from `splitScenario(effState, …)` (`app.tsx:5715`). The rows start at `t0 = max(now, synthetic ends)`, so their times usually match. But "pairs ✓" and "Plan is on your log ✓" were judged against custom clocks, while Now will judge the same what-if against the live history. The override never writes on its own, but this existing button carries its result into the log. Suggest disabling "Put plan on log" while custom clocks are active, or labeling it.
- **N2 — Pre-existing, but made more reachable: the sibling PIN gates have no cooldown.** `changeDriverPin`, `updateDriverRecovery` and `removeDriverProfile` (`store.ts:1308-1366`) call `verifyHashedSecret` with no `recordAuthMiss` and no cooldown check. The new `setStayUnlocked` correctly shares the `pin:` cooldown counter (`store.ts:1213-1232`), and malformed input records no miss, so it leaks nothing. But with stay-unlocked on, anyone holding the phone is already inside, and these three forms let them guess the PIN without limit. Before this build, getting inside required the PIN (through the throttled `unlockDriverWithPin`). Recommend running all three through the same cooldown in this patch. The PIN still being required for those actions is a selling point of Option B.
- **N3 — `lastEldCheckAt` survives JSON import.** `applyImportedState` doesn't touch it, so an imported log can show "ELD-checked 5m ago" from the old record. Suggest clearing it on import.
- **N4 — Handoff says the chip shows `<N>d ago`; the code only shows hours** (`app.tsx:427-428`), e.g. "Checked against your ELD 312h ago". Cosmetic.
- **N5 — `eraseAll` now also clears `seededAt`** (`app.tsx:12249`). This is outside the claimed scope. It has no visible effect, because `cycleBasis` needs a seed-note row, and erase removes all rows. It is still a good cleanup. Noted only for scope accounting.
- **N6 — iOS detection** shows the note in iOS in-app browsers whose UA contains "Safari" (Google app `GSA/`, some webviews). That is harmless, since they also evict storage. CriOS, FxiOS, EdgiOS, OPiOS and DuckDuckGo are excluded. Standalone is excluded through `navigator.standalone` and `(display-mode: standalone)` (`app.tsx:466-481`). iPadOS desktop UA is handled with `maxTouchPoints`. The State-level copy of `iosInstallNoteDismissed` is redundant with the vault copy, but harmless.
- **N7 — Mailto body** (`app.tsx:391-399`) contains only build, effective theme and the status plus four clocks. The only free text that can appear is a driver-named break preset in the status label (through `segLabel`). Log rows, driver name, the vault and the UA are not included. OK.
- **N8 — Worksheet filename date** uses device-local time (`app.tsx:11722-11724`), not the carrier time zone. That's fine for a filename.
- **N9 — `document.title` restore.** The restore is guarded so it only runs while the title still equals the worksheet name. It runs on `afterprint` (once), on a 1500 ms fallback, and in effect cleanup; cleanup runs before a re-print, so a stale title can't be captured (`app.tsx:12679-12702`). On browsers where `print()` doesn't block (iOS Safari, some Android Chrome builds), the 1500 ms fallback could restore the title before the share sheet reads it. Low risk. Consider restoring only on `afterprint`, or using a longer fallback.
- **N10 — Test coverage gaps.** No pin covers B1, B2 or B3, or the cooldown-sharing between the toggle and the unlock path. DRR11 is partly vacuous on baseline (see Evidence §E).

### Verified OK (no finding)

- **Auto-unlock gating.**
  - `computePendingAutoUnlock` needs the flag `=== true`, exactly one driver, and a profile with `pin` set and not `needsSetup` (`store.ts:799-805`).
  - The flag survives sanitizing only when `raw.stayUnlocked === true` (`store.ts:717-724`).
  - `completeAutoUnlock` re-validates against the live vault before `activateDriverProfile` (`store.ts:853-864`).
  - The test bypass returns `null` (`store.ts:848-850`).
  - `lockDriverSession`, register, legacy setup, remove and disable all clear `pendingAutoUnlockId`.
  - The splash renders the auto tile only when the id matches a summary (`driver-ui.tsx:527,539`).
  - Legacy, unmigrated and `needsSetup` vaults never auto-unlock.
- **PIN cooldown.** Cooldowns are in-memory and reset on every cold launch. That is pre-existing, and the auto-unlock is computed only at cold launch or reload, which is exactly what the user opted into. In-session, after "Switch driver", the picker plus throttled PIN applies (pending is cleared).
- **Enabling needs a correct PIN.**
  - In Settings it goes through `setStayUnlocked`, which checks the cooldown first, refuses malformed input without counting a miss, records wrong PINs on the shared `pin:` counter, and clears it only on success (`store.ts:1201-1238`).
  - Registration Step 4 is accepted only together with the PIN created in that same submit, and the store re-checks `order.length === 1` (`store.ts:1152-1154,1186-1188`; `driver-ui.tsx:516-519`). There is no path that sets the flag without knowing a PIN.
  - Import can't set it: `exportState` and `applyImportedState` never touch `__drivers`.
- **Shortcuts (`?go=`).** The shortcut code is unchanged apart from a comment (`app.tsx:12514-12528`). `applyGo` runs only when `gateOpen` is false, which needs `unlockedDriverId !== null`, and that is set only by `activateDriverProfile` (PIN, recovery, register, or `completeAutoUnlock`). The shortcut gate is therefore exactly the splash gate, and DRR10 and DRR11 pass on the new tree. (B2 widens the splash gate's failure modes. Shortcuts inherit that, nothing more.)
- **drivers1fix invariants.**
  - The `store.ts` diff doesn't touch `syncActiveUndoRaw`, `stashCurrentProfileRuntime`, `activateDriverProfile`, salts or hashing, the recovery functions, or the `bootFromStorage` undo/sim adoption.
  - `snapshotSimRecord` only gains `lastEldCheckAt`. `storedSnapOk` validates it as dateable, and `useRealClock` restores it (`app.tsx:1065,1100`).
  - DR1–DR11 and DRR1–DRR6 pass.
- **Override purity.**
  - `synthesizeEldSeed` is pure: no `setState`, no storage.
  - `InlineClockOverride` keeps all its state in component `useState`. `onChange` is the parent's `setCustomClocks`, also component state. Nothing persists, and the state goes away on unmount. "Use my log" sets it to `null`, which every wired tool treats as live.
  - Spot-checked end to end:
    - **Plan a run** (`app.tsx:11528-11545`): `tripSegs`, `effEv` and `planTripAll` all switch together.
    - **Motel** (`app.tsx:8459-8479`): `logged` switches, and status is forced to `OFF` under the override.
  - Apart from N1 and B3, neither tool writes to the store.
- **Storage keys unchanged.** Only `hos-sandbox-v1`, `-backup`, `-sim` and `hos-sandbox-undo-v1`; the key-literal sets are identical across trees. All new fields are optional, and on load they fall back to `null`/`false` when absent or invalid (`store.ts:581-585`). The vault flags are spread in only when `=== true`, so a legacy vault re-serializes without them (DRR12 checks this).
- **`lastEldCheckAt` stamps.** Set in exactly three places:
  - `applyEldSeed` (`store.ts:2644`)
  - `DriftSheet.compare` (`app.tsx:3252`)
  - `addDriftFill` (`app.tsx:3796`, inside the undoable)

  It is cleared by `eraseAll`. No other `setState` touches it.
- **Backup nudge.** The window is `30*1440 = 43200` epoch-minutes. The export stamp uses `nowOverride ?? nowMin()` and the dismissal uses `now`, so both use the same clock base. It shows only when there is data. Arithmetic correct.
- **`storage.persist()`.** A one-shot guard; it is wrapped in `try`, and its promise rejection is swallowed. It is a no-op when unsupported (`app.tsx:450-461`).
- **Rename.** No user-facing "Log summary" string is left; only source comments and one CSS comment. The header and footer both render `PDF_DISCLAIMER`. `CLOCK14_DISCLAIMER_TEXT` is byte-identical between trees.

---

## The 10 flagged decisions

1. **Opt-in on Step 4, not a Step 5: Agree.** The checkbox is default-OFF, it is submitted together with the PIN just created, and the store re-checks that there is a single driver.
2. **Flag kept while 2+ drivers, re-applies at 1: Disagree.** This is B2. The copy says "turns off" and the pill shows Off, but the flag stays armed and re-fires after a self-erase or a corrupt profile drop. Clear the flag when the 2nd driver is added.
3. **"Switch driver" clears the pending auto-unlock: Agree.** Without this, a solo driver could never reach "Add a driver".
4. **420 ms beat, 20 ms with reduced motion, tap to skip: Agree.**
5. **Adding a 2nd driver doesn't need Driver 1's PIN: Acceptable with a note.** On its own it gains an attacker nothing. With a solo stay-unlocked driver, the attacker is already inside; with 2 drivers, add-then-erase leaves the count unchanged. But combined with #2 as built, it is part of the B2 surface. It is fine once B2 is fixed. Adding drivers without a PIN is a pre-existing clutter vector and nothing more.
6. **`document.title` swap for the PDF filename: Agree, with the N9 note.**
7. **Quiet chip under 4h: Agree.** Fix the handoff's "d ago" claim, or add day formatting (N4).
8. **Epoch-minute units: Agree.** They match `seededAt` and `now`, and the window arithmetic was checked.
9. **iOS note on Now, dismissal on both vault and State: Acceptable with a note.** The vault copy alone would do. The double write is harmless (N6).
10. **Collapsed, session-only override: Agree with the concept. As wired, it has three leaks:**
    - the "Refresh from ELD screenshot" button inside it (part of B1)
    - the Split commit (N1)
    - the dropped My Week chain basis (B3)

---

## Evidence actually run

### A. Diff surface (`diff -rq`, excluding `node_modules`, `dist`, `dist-test`)
```
web/public/styles.css        (130 changed lines — only new classes: stay-pill, splash-stay-card, eld-stale-chip, eld-shot-cta,
                              log-scratchpad-note, bug-email-btn, backup-nudge, ios-install-note, clock-override-*)
web/src/app.tsx              (512 changed lines)
web/src/driver-ui.tsx        (162)
web/src/main.tsx             (3 — persist() call)
web/src/store.ts             (154)
web/test/dom/drivers-relaunch.mjs, web/test/dom/drivers.mjs  (new pins)
web/test/dom/layout.mjs, web/test/dom/revisions.mjs, web/test/smoke.mjs  (label/disclaimer string updates only, + filename asserts)
```
- `web/package.json` is identical. Nothing changed outside `web/` except the engine, which is identical.
- One out-of-scope change was found: `eraseAll` now clears `seededAt` (N5, inert).

### B. Engine hash (run in both trees)
```
work-splashart:    0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
work-receptionfix: 0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
```
Both match the required hash.

- **Storage-key literal set:** identical in both trees (`KEY`, `BACKUP_KEY`, `SIM_KEY`, `UNDO_STORAGE_KEY` / `UNDO_KEY` with the same string values).
- **`CLOCK14_DISCLAIMER_TEXT`:** the declaration is byte-identical (diff empty).

### E. Pins — new tree vs baseline
The new `drivers.mjs` and `drivers-relaunch.mjs` were copied into a scratch copy of the baseline (`/tmp/rv/base`, with `node_modules` symlinked) and bundled to `/tmp`. Neither tree was edited. TZ=America/Chicago.

| Pin | New tree | Baseline | Assessment |
|---|---|---|---|
| DR1–DR11 | PASS | PASS (DR1 needs cwd=web for `public/styles.css`) | regression, real |
| DR12 | PASS | **FAIL** "stayUnlocked checkbox … found=false" | real fail-before/pass-after |
| DR13 | PASS | **FAIL** "missing Refresh from ELD screenshot in fresh state" | real |
| DR14 | PASS | **FAIL** "missing or wrong Log scratchpad line" | real |
| DRR1–DRR6 | PASS | PASS | regression, real |
| DRR7 | PASS | **FAIL** `setStayUnlocked is not a function` | real |
| DRR8 | PASS | **FAIL** `setStayUnlocked is not a function` | real |
| DRR9 | PASS | **FAIL** (`STAY_UNLOCKED_SPLASH_MS` undefined → NaN timeout) | real |
| DRR10 | PASS | **FAIL** `setStayUnlocked is not a function` | real |
| DRR11 | PASS | PASS | **Vacuous on baseline**: its fixtures come from DRR8/DRR9, which fail there, and `sleep(NaN)` returns immediately. On the new tree it is a real gate pin (it uses DRR9's persisted 2-driver + `stayUnlocked:true` file). |
| DRR12 | PASS | PASS | Real regression pin: a legacy vault without the field gates on both trees, and the new tree doesn't add the field. |

Totals: new tree `drivers 14/14`, `drivers-relaunch 12/12`; baseline `drivers 11/14`, `drivers-relaunch 8/12`.

I could not read the `drivers.mjs` source directly: a local privacy hook blocks reading that file because it contains the bug-report address. DR12–DR14 are judged by their run results and baseline failure messages.

### Reviewer probes (new tree, `/tmp/rv/probes/rf-probe.mjs`, two-process cold relaunch)
- **B2 self-erase re-arm:** confirmed (`[cold] {"unlocked":"Alice","splash":0}`)
- **B2 corrupt-profile re-arm:** confirmed
- **B1 active-log wipe through the Now CTA:** confirmed (`before 18 → after 1`, `undo null`)

### Other runs (new tree)
- `tsc -p tsconfig.json --noEmit`: **OK**
- DOM suites (TZ=America/Chicago, bundled outside the tree):
  - `myweek` 19/19
  - `rescue` 11/11
  - `stack` 15/15
  - `motel` 13/13
  - `flip` 12/12
  - `miles` 11/11
  - `c3` OK
  - `logedit` 37/37: the first run failed 4 source-reading pins only because my `/tmp` outfile broke `import.meta.url`-relative paths. Re-run with the bundle next to symlinked `src/` and `public/`: 37/37 on both the new tree and baseline.
- Not re-run by me: full `npm run smoke` in UTC; the playwright suites (auditfix, polish, layout); revisions; gemini. For those, the handoff's claims are unverified by this review.

---

## Minimum fix list to flip to SHIP
1. **B1:** in active state, make the screenshot CTA non-destructive: route it to drift-compare, or add an undoable seed plus an explicit replace confirm. Remove or relabel the CTA inside `InlineClockOverride`.
2. **B2:** clear `stayUnlocked` when the vault reaches 2+ drivers, and refuse store-level enable unless there is exactly one driver. Pin the self-erase and corrupt-profile relaunches.
3. **B3:** carry the My Week custom-clock base through `chainContextFor` into Rollout and Rescue, including Load 1.
4. Strongly recommended in the same patch: put `changeDriverPin`, `updateDriverRecovery` and `removeDriverProfile` behind the shared PIN cooldown (N2), and disable the Split commit under the override (N1).
