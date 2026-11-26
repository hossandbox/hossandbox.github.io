VERDICT: FIX-FIRST

# REVIEW — Clock 14 drivers1 (multi-driver splash, registration, PIN, recovery, per-driver storage)

I did not modify the tree. All builds, suites and mutation runs used copies under `/tmp/d1/`:
- `tree/`: a copy of the build as shipped.
- `rb/`: a rebuild from source.
- `mut/<name>/`: mutation copies.

My own probes are in `/tmp/drvprobe/`. They use the repo's domshim with a localStorage that is persisted to a JSON file between **separate Node processes**. That is a true cold relaunch: app.tsx's module-load code runs again. `reloadVaultFromStorage()` does not do that, and this matters for P1. I made the legacy saves with **navy1's own code** (`p_navy_seed.mjs`), not by hand.

**Why FIX-FIRST.** Security, separation, registration and migration are solid. But the new per-driver stash of `hos-sandbox-undo-v1` / `hos-sandbox-v1-sim` is only written on lock or switch. Every unlock then overwrites the live keys with that stash. A real launch always goes through the splash and unlock, and people usually close a PWA by swiping it away, not by tapping Switch. So:
- **(P1)** The pending Undo no longer survives a relaunch. navy1 deliberately supports that, and I proved it still works there with the same probe.
- **(P2)** The simulated-clock quarantine (break-test #5) is destroyed on relaunch, so writes made under the sim clock become permanent in the real log.

Item 7 asks that no baseline action be dropped, and P1 is exactly that, for every driver on every launch. The fix is small and local (see "Suggested fix"). The pin gaps (P4) are why the suites stayed green.

## Per-item

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Splash and picker on every launch; no path past it without a PIN | **CONFIRMED** | **Fresh launch** (0 drivers): the splash shows the logo, "Clock 14" and "Add a driver", with no nav or header. **Real relaunch** (new process) with 1 driver (`p_relaunch` stage b, `p_mig` stage b) and with 2 drivers (`p_sep`): splash, the full driver list, and Add a driver. The app is not entered. **Code:** the gate is just `unlockedDriverId`. It lives only in memory (`store.ts:757`), starts as `null`, and only `activateDriverProfile` sets it. That function is reached only from register, legacy setup (which sets a new PIN), PIN unlock, and recovery reset. `?go=` shortcuts are held in `pendingGoRef` until unlock. AppShell is unmounted while the splash is up, so no back-nav, sheets or timers run behind it. **Chromium:** auditfix 192/192 on the shipped build. My cold-launch auto-unlock mutant (M6) **is** caught there (by a real `page.reload`). |
| 2 | Registration needs disclosure + confirmed 4-digit PIN + 2 recovery questions. The disclosure shows at every registration and not on ordinary launches, and stays readable in About | **CONFIRMED** | **UI walk:** name → disclosure modal (one accept button) → PIN → confirm (a mismatch shakes and clears) → 2 questions → enter. This happened for each new driver (Alice, Bob, Ann, Ben, Zed). **Store guards (`p_reg`):** registration is refused without the disclosure, with a non-digit or 5-digit PIN, with the same question twice, with a blank answer, or with a duplicate name (case-insensitive). **Ordinary unlock:** no dialog. **Settings → About** shows `CLOCK14_DISCLAIMER_TEXT` verbatim. **Legacy saves:** `disclaimerAcked:true` is not re-nagged; `false` shows the modal (`p_edge unacked`). **Note:** "self-chosen" means the driver picks 2 of 8 curated questions. There is no custom free-text question. |
| 3 | PIN security | **CONFIRMED** (brute-force friction: see judgement) | **Persisted form (`p_sep`, `sep-vault.json`):** the PIN and each answer are stored as `{alg:"sha256-2048", salt:<16-byte hex>, hash}`. I grepped `hos-sandbox-v1` and `-backup` for the PINs and answers (any case): no plaintext anywhere. The salt is **per secret**, which is stronger than per driver: 6 distinct salts for 2 drivers. Salts come from `crypto.getRandomValues`. Comparison is constant-time. **Wrong PIN:** it never enters (DR4, `p_sep`, `p_mig`, 30-try probe). **Recovery:** wrong answers do not reset and the old PIN still works. Right answers with different case or extra spaces (`"  X "`) reset the PIN. After that the old PIN fails and the new one works (`p_reg`). **Brute force:** there is **no** attempt limit and **no** delay. After 30 wrong PINs, the right PIN enters at once (`p_bfui`). Offline, I recovered a PIN from the stored hash in 80 s on a desktop (`p_bf`). |
| 3j | Judgement on brute force (casual access on a shared phone) | **Acceptable to ship; recommend a cooldown** | By hand, 10,000 PINs is about 5,000 tries on average, roughly 4 hours of keypad tapping. That deters a casual co-driver. Anyone with devtools or USB debugging can read every driver's logs straight from `localStorage` anyway (the vault is plaintext JSON). So the PIN is a privacy curtain, not encryption, and hashing cannot change that. The **weaker link is recovery**. "Make of your first truck?" has perhaps a dozen plausible answers. Guesses are unlimited. A co-worker who knows the driver can reset the PIN and get in, although the owner will notice because their PIN stops working. **Recommendation (non-blocking):** after 5 misses, add a 30 s cooldown that escalates, on both PIN entry and recovery. Keep it in memory only. |
| 4 | Separation | **CONFIRMED** for visibility and export; **PROBLEM P3** for stash integrity | **`p_sep`:** Alice had logs (`ALICE-RUN/DOCK`), 60/7, 04:30, America/Denver, a My Week load `ALICE-LOAD`, trip 1234 mi, and a pending undo. While Bob was active: Bob's state was clean (0 rows, 70/8, no loads), with no undo and no `hos-sandbox-undo-v1` key. No Alice string appeared on Now, Log, Plan, Settings or the My Week planner. The splash showed none of Alice's data. **Bob's export:** `driverName:"Bob"`, with no Alice data, no `__drivers`, no salt or hash. The download file is named `clock14-bob-YYYY-MM-DD.json`. DR6 covers the PDF header. **Switching:** Switch goes back to the splash. Alice's wrong PIN is refused; the right one restores all her data. `eraseAll` as Alice leaves Bob's profile alone. **Code:** nothing in the app reads `hos-sandbox-v1` raw except boot. There is no backup-restore UI and no search. Import writes only into the active driver. **But see P3:** registering a new driver wipes the previous driver's stashed undo and sim snapshot. |
| 5 | Migration | **CONFIRMED** | I made a legacy save with navy1 code: 5 rows, live ON, 60/7, 05:30, America/Denver, a My Week load, trip, mph 58, night theme, and a pending undo. It loads as "Driver 1 · Finish setup". `hos-sandbox-v1` is **byte-identical until the user acts**. The guided flow (name, then PIN + confirm, then 2 questions) enters as "Lena". **Every state field equals navy1's own relaunch of the same save** (`p_mig_cmp`: 0 diffs). Comparing to the raw save instead shows only the normal load-path sanitising that navy1 does too. The legacy undo is carried over. Only the 4 keys exist, with unchanged names. `hos-sandbox-v1` still holds the active state at top level plus `__drivers`, and `-backup` rotates as before. A relaunch then asks for the PIN, and the data is intact. **Corrupt or partial saves (`p_corrupt`, 10 cases):** garbage primary with a good backup → recovered from the backup. Both garbage, truncated, wrong shapes, `[1,2,3]`, broken `__drivers`, bad undo or sim → **no throw**, and the splash plus Add a driver always render. See N4 for what a corrupt vault turns into. |
| 6 | Test-lane integrity | **CONFIRMED** | `driverGateBypassForTest` is a module-scoped `let`. Only `setDriverGateBypassForTest` changes it, and only test files call that (`grep`: 18 lanes, no src caller). The entry `main.tsx` imports only `App`. The bundle is ESM, so nothing reaches `window`. The minified `dist/app.js` contains no bypass symbol or caller. There is no URL parameter (`location.search` is read only for `?go=`, which is held behind the gate), no storage flag (the bypass is never read from storage), and no global. `wrapDriverSeed` / `unlockSplashInBrowser` live only in `test/dom/driver-test-seed.mjs` and just seed a normal hashed vault. **Rebuild from source:** `dist/app.js` differs from mine by 17 bytes, all build stamp; `styles.css` and `index.html` are byte-identical. |
| 7 | Invariants, baseline features, suites, pins | **PROBLEM** (P1, P2, P4) | **Engine:** sha256 `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`, matching (navy1 is the same). **navy1/geminifix:** the Wind-down theme blocks are present (14 `data-theme="winddown"` rules). The Timeline `@media (max-width: 359px)` band is at styles.css:1114. The storage write guard (try/catch, rotating only a usable save into `-backup`) moved unchanged into `persistNow`. gemini 20/20. **Suites (my runs):** smoke `TZ=UTC` exit 0 and `TZ=America/Chicago` exit 0, each with every DOM lane and drivers 8/8. gemini 20/20, revisions 89/89, auditfix 192/192 (Chromium). **Baseline actions:** the app.tsx diff only adds things; every tool and setting is still mounted. **However, the persisted Undo across relaunch is lost (P1), and the sim quarantine across relaunch is lost (P2).** The pins that can't fail are listed under P4. |

## Problems

**P1. A pending Undo is lost on every relaunch. This is a navy1 regression and the reason for FIX-FIRST.**

navy1's `setUndo` persists the undo offer on purpose. The comment at app.tsx:3370 says: "a driver who deletes an entry and has the app closed on him … has not lost the way back."

In drivers1, `activateDriverProfile` (store.ts:854) always runs `writeUndoRaw(target.undoRaw)` (store.ts:868). But `profile.undoRaw` is only refreshed by `stashCurrentProfileRuntime`, which runs on lock, switch and register. It is not refreshed on each write. So after a swipe-away and relaunch, the driver's own unlock replaces the live `hos-sandbox-undo-v1` with a stale or null stash.
- **drivers1 (`p_relaunch` a→b):** "undo armed", "UNDO_KEY present at cold launch", then after unlock `currentUndo()` is null and the key is gone.
- **navy1, same flow (`p_navy_undo`):** the undo survives.

The DR pins use `reloadVaultFromStorage()`, which never re-runs app.tsx's module-load `restoreUndo` (app.tsx:3398). That is why no lane saw this.

**P2. The simulated-clock quarantine is destroyed on relaunch, so sim writes get committed to the real log.**

Same root cause, at store.ts:871–872: `simRaw` is null or stale, so `removeItem(SIM_KEY)` runs.
- **drivers1 (`p_relaunch` sa→sb):** `SIM_KEY` is present at cold launch and gone after unlock. "Use real clock" then **keeps** the `SIMWRITE` row.
- **navy1, same flow (`p_navy_sim`):** the row is discarded.

The sim clock sits behind the Testing long-press, so fewer drivers hit this than P1. But the result is a silently wrong real record, which is the class of bug break-test #5 fixed.

**P3. Registering a new driver wipes the previous driver's stashed undo and sim snapshot.**

`registerDriver` stashes the outgoing driver without the `unlockedDriverId !== null` guard that `activateDriverProfile` has (store.ts:940). Registration always happens from the splash, after `lockDriverSession` has already stashed and then cleared both keys. So the stash is overwritten with null.
- **Undo (`p_sep`):** "Alice undo stashed on lock" passes; after Bob registers, Alice's `undoRaw` is `null`. Back as Alice, there is no undo.
- **Sim (`p_edge sim`):** after Ben registers, Ann's `simRaw` is `null`, and "Use real clock" keeps the sim write.

Related, minor: `completeLegacyDriverSetup` (store.ts:1002) fills an empty `undoRaw` from whatever is in `hos-sandbox-undo-v1`. After a cold kill while another driver was active, that is **the other driver's** snapshot, including their log rows.
- **`p_edge` with `e4.json`:** Bob's rows ended up in Lena's persisted profile.
- It is not shown in the UI, because `currentUndo` drops a snapshot whose "after" doesn't match. But it is a cross-driver copy in storage, and Bob's own undo is lost.

**P4. Pins that cannot fail.** I ran mutations in `/tmp/d1/mut`, using the drivers lane and then auditfix in Chromium. A control mutation passes 8/8.

| Mutation | DR1–DR8 | auditfix |
|---|---|---|
| Wrong PIN accepted (M3) | **fail** (DR4, DR5) | — |
| Recovery always true (M4) | **fail** | — |
| Normalising drops lowercase (M5) | **fail** | — |
| No undo swap on switch (M8) | **fail** (DR6) | — |
| Disclosure skipped (M9) | **fail** | — |
| Reset keeps the old PIN (M10) | **fail** | — |
| Migration drops My Week (M11) | **fail** (DR7) | — |
| Cold launch auto-unlocks a single driver (M6) | **pass (can't fail)**: DR3 uses `reloadVaultFromStorage`, which forces `null` | **fail** (real reload), so this one is covered |
| **Export includes every driver's logs** (M7) | **pass** | **pass, 192/192** |
| Normalised answer stored in plaintext in `question` (M1b) | **pass** | **pass** (no storage check) |
| PIN stored in plaintext inside `salt` (M2c) | **pass** | **pass** |
| Constant salt for every secret (M2) | **pass** | — |

The DR2 check `includes('"1357"') / 'Peterbilt'` is case-sensitive and depends on the quotes, so it misses a lowercased answer or an embedded PIN. Nothing pins that an export carries **only** the active driver's data, which item 4 requires. Nothing exercises undo or sim across a real relaunch (P1 and P2).

**Suggested fix (small):**
- Keep `profile.undoRaw` and `profile.simRaw` current at write time. Update the active profile inside `setUndo`, `snapshotSimRecord` and `useRealClock`, then persist, instead of rebuilding them from the live keys on lock.
- Or, at minimum: in `activateDriverProfile`, when `unlockedDriverId === null && id === vault.activeId`, adopt the live keys rather than overwriting them.
- When `unlockedDriverId === null && id !== vault.activeId`, move any live keys into `vault.activeId`'s profile only if they are present.
- Add the `unlockedDriverId !== null` guard to `registerDriver`'s stash.
- Drop the cross-profile read in `completeLegacyDriverSetup`. The migration path already captures the legacy undo at boot.
- **Pins to add:**
  - a two-process relaunch pin for undo and sim, like `p_relaunch`;
  - an export pin asserting that none of the other driver's strings appear;
  - a storage scan that is case-insensitive and does not depend on quotes, plus a distinct-salt check.

## Nits (non-blocking)

- **N1. Bug reports now publish the driver's name.** `reportBug` (app.tsx:389) puts `exportState(s)` into a public GitHub issue URL, and the export now carries `driverName`. The name is often a real name. Leave it out of the bug-report payload.
- **N2. The Erase sheet still says "Erase everything on this phone?"** (app.tsx:11897). It now erases only the active driver's log (I verified that other profiles survive). The behaviour is right; the copy is wrong. Suggest "Erase your log on this phone?".
- **N3. The splash uses the last active driver's theme** (the index.html pre-paint script plus the App effect both read top-level `hos-sandbox-v1`). It reveals only a theme. Harmless, but worth knowing.
- **N4. A corrupt vault can be claimed without a PIN.** If `sanitizeVault` returns null (e.g. `v≠1`), the top-level state (the last active driver's data) is migrated again as "Driver 1 · Finish setup" with no PIN. The other profiles are dropped on the next write. Separately, a profile with a damaged `pin` becomes `needsSetup`, and anyone can claim it through the legacy-setup flow. Both need corruption first. Consider keeping a broken `__drivers` aside instead of re-migrating over it.
- **N5. Storage use grows.** The active driver's data is written twice (top level plus `profiles[active].data`). All drivers share one key, and `-backup` duplicates it. That is about 2×(N+1) records per write against roughly 5 MB of quota. Fine for 2–3 drivers; worth noting.
- **N6. Some store guards trust the UI.** `completeLegacyDriverSetup` skips the disclosure check when the legacy save was already acked (by design), and the store functions accept any `driverId`. The UI only ever passes the unlocked driver's id. Fine as long as that stays true.
- **N7. `unlockSplashInBrowser` returns `false` silently when no splash is found.** Lanes other than auditfix then carry on. Have it throw, so a missing gate fails loudly.
- **N8. The handoff overstates a few things.**
  - "Zero bleed of … undo, or sim": they don't bleed, but they are lost (P1–P3).
  - It says "per-driver" salt; the salt is actually per secret, which is better.
  - The DR3 and DR5 "relaunch" steps are `reloadVaultFromStorage()`, not real relaunches.
  - `loadSaved()` is now dead code.
