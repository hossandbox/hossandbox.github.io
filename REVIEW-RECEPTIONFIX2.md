VERDICT: SHIP

# Clock 14 `receptionfix2`: spot-check of the fix round (Opus)

- Fix-round tree: `~/hos-build/work-receptionfix2`
- Previous tree (my FIX-FIRST): `~/hos-build/work-receptionfix`
- Live baseline: `~/hos-build/work-splashart`
- Handoff: `~/hos-build/HANDOFF-RECEPTIONFIX2.md`
- This was a read-only review. I edited no tree. Every source file's mtime is older than this session, and so are Neon's `dist/` files.
- All scratch copies, bundles, probes and logs are under `/tmp/rv2/`.

**Summary.** All three blockers and N1–N4 are closed. I checked each one by running it, not just by reading the code:
- I re-ran my own probes from the first review against the new tree.
- I ran every new pin against the old tree, and each one fails there.
- Engine hash, storage keys and persisted schema are unchanged.

The fix round adds two small findings. Neither blocks shipping:
- **F1:** the new replace-confirm text promises an Undo button that has no on-screen control.
- **F2:** Undo of a reseed leaves the ELD-check timestamp set.

Both sit on a path the UI can no longer reach (details below). I also found one older problem that predates this round (P1).

---

## Per-finding closure

| ID | Status | Evidence (all run by me) |
|---|---|---|
| **B1** ELD reseed wipes a populated log | **CLOSED** | See §B1 below. On an 18-row log, the Now CTA opens `{"kind":"drift","mode":"screenshot"}`; Compare stamps `lastEldCheckAt` and the log is byte-unchanged. The override form's only button is "Apply to this check". A forced reseed shows "This replaces your 18 logged rows.", Keep leaves the log unchanged, and Undo restores all 18 rows plus the prior `current`, in memory and on disk. Old tree, same probe: `before 18 → after 1, undo null`. |
| **B2** stayUnlocked re-arms at 1 driver | **CLOSED** | Two-process cold relaunches (§B2): self-erase and corrupt-profile drop both land on `splash:1, unlocked:null`. The tampered-flag variant also gates. A legitimate solo vault still auto-unlocks on 2 consecutive cold launches. Store refuses `setStayUnlocked(true)` with 2 drivers. Old tree: all three scenarios land inside as Alice, with no PIN. |
| **B3** My Week custom clocks dropped in drill-downs | **CLOSED** | MW20 output (§B3). Load 2 Rollout reads "Does not fit … Seeded from My Week custom clocks + chain (after Load 1 Chi) · cycle (45m left)". Load 1 Rollout reads "Does not fit … Seeded from My Week custom clocks · (6h 00m left)". Load 2 Rescue reads "Seeded from My Week custom clocks + chain". The basis bar is visible in each. Old tree reproduces my bug: "Fits current shift … Seeded from My Week chain … (64h 45m left)". |
| **N1** Split commit under custom clocks | **CLOSED** | `commit()` returns early if `customClocks`; the button is `disabled={planOnLog \|\| Boolean(customClocks)}`; a note is shown (`app.tsx` Split diff). DR17 passes on the new tree and fails on the old one. |
| **N2** Shared escalating PIN cooldown | **CLOSED** | My probe (§N2): after 5 wrong PINs through `changeDriverPin`, the **correct** PIN is refused by `changeDriverPin`, `updateDriverRecovery`, `removeDriverProfile` and `unlockDriverWithPin`, all with "Wait 30 seconds". Old tree: the correct PIN is accepted right after 5 misses (`changePin ok:true`). DR16 also covers escalation to 60s and the Settings form. |
| **N3** Import clears `lastEldCheckAt` | **CLOSED** | `applyImportedState` now returns `lastEldCheckAt: null`. Extended DR14 passes on the new tree. On the old tree it fails with "applyImportedState must clear lastEldCheckAt, got: undefined". |
| **N4** `Nd ago` at ≥24h | **CLOSED** | `h >= 24 ? \`${Math.floor(h/24)}d ago\``. Extended DR13 passes on the new tree. On the old tree it fails with "expected 1d stale chip, got: Checked against your ELD 24h ago". |

---

## 1. Change surface (diff `work-receptionfix` → `work-receptionfix2`)

Command: `diff -rq … -x node_modules -x dist -x dist-test`. Exactly 6 files differ:
```
web/src/app.tsx          (332 changed lines)
web/src/store.ts         (95)
web/src/driver-ui.tsx    (12)  ← only data-change-pin-* test attributes on the Change PIN form; no behavior change
web/test/dom/drivers.mjs, drivers-relaunch.mjs, myweek.mjs
```
- `styles.css`, `main.tsx`, `package.json` and `engine/` are unchanged.
- Every hunk in `store.ts` maps to B2 (sanitize, register, legacy setup, `setStayUnlocked` refusal), N2 (`verifyDriverPinWithCooldown` plus 3 call sites) or N3.
- Every hunk in `app.tsx` maps to B1, B3, N1 or N4, with three exceptions. None is a concern:
  - **`primeWeekHubCache` is skipped while My Week custom clocks are active.** This is next to B3 and correct: it stops session-only clocks from leaking into the Plan hub card. Neon flagged it as judgment call #5.
  - **`setEldOcrOverrideForTest` is exported as a test seam.** It defaults to `null` and nothing in the UI can reach it. It follows the same pattern as `setDriverGateBypassForTest`. The lazy `import('./eldocr-run.ts')` is kept, and smoke patch 12 passes.
  - **`DriftSheet` gained `data-*` hooks and an optional `mode` on the sheet union.** The sheet state lives only in memory.

## B1: probes run

Probe: `/tmp/rv2/probe/p.tmpl.mjs`, stage `refresh-b1`, bundled against each tree.
- Setup: registered driver; 6 days / 18 rows of history (6 real Driving rows tagged `CAROL-REAL-*`); active Off Duty; `historyBasis` = `known`.

New tree (`/tmp/rv2/probe-b1-new.log`):
```
ctaFound:true  sheet:{"kind":"drift","mode":"screenshot"}  driftShot:1  setMyClocksBtnPresent:false
OCR failure (seam throws) → ocrErr:"That screenshot couldn't be read — type the drive time left …" (stays in DriftSheet)
typed 6h 30m → Compare → afterCompare:{unchanged:true, lastEldCheckAt:29928480 (=now), sheetKind:"drift",
   sheetText:"Your ELD shows 3h 50m more driving left than this app (6h 30m against 2h 40m)…"}
forced QuickStart (openSheet quickstart/screenshot) → "Set my clocks":
   confirmText:"This replaces your 18 logged rows."  unchangedAtConfirm:true
   "Keep my log" → unchangedAfterKeep:true
   "Set my clocks" → "Replace my log & set clocks" → afterReplace:{rows:1, undo:"Replaced log from ELD clocks"}
   tap "On Duty" on the done screen → afterStatus:{cur:"ON", undo:"Replaced log from ELD clocks"}   (Undo survives the status pick)
   undoLast → afterUndo:{restored:true (segments+current+tentative JSON identical), rows:18, real:6,
              cur:{"status":"OFF","since":29928480,"createdAt":4}}   diskRowsAfterUndo:18
[override-form] {"form":true,"buttons":["Apply to this check"]}      ← no reseed/refresh button left in InlineClockOverride
```
Old tree (re-ran my original `/tmp/rv/probes/rf-probe.out.mjs --only-refresh`):
```
[refresh-a] {"sheet":{"kind":"quickstart","mode":"screenshot"},"before":18,"after":1,"realRowsLeft":0,"undo":null,"confirmShown":false}
```

The reseed is now unreachable on a populated log. `QuickStartSheet` is opened only from:
- the "DEMO" notices (`hist === 'fresh'`, at `app.tsx:1606,1666`),
- the Now CTA when `historyBasis === 'fresh'` (`:2726`),
- `DriftSheet`'s fresh-basis branch (`:3284`).

`historyBasis` returns `'fresh'` only when `segments`, `tentative` and `current` are all empty (`store.ts:1760`). The confirm and the undoable wrapper are therefore pure belt-and-braces, which is why F1 and F2 are not blockers.

## B2: two-process cold relaunches

Probe stages are `rearm-a`, `cold`, `bob-erases-self`, `corrupt-bob`, `corrupt-bob-tamper` and `solo`. Each stage runs in a fresh Node process with a JSON-file `localStorage`.

New tree:
```
--- B2 self-erase
[rearm-a] {"afterAlice":true,"drivers":2,"storedFlag":null,"reEnableWith2":{"ok":false,"error":"Stay unlocked turns off while more than one driver is on this phone."}}
[cold]    {"unlocked":null,"splash":1,"drivers":["Alice","Bob"]}
[bob-erases-self] {"unlockBob":true,"removed":true,"left":["Alice"]}
[cold]    {"pending":null,"unlocked":null,"splash":1,"drivers":["Alice"],"storedFlag":null}     ← gated
--- B2 corrupt (natural)
[corrupt-bob] (Bob's name blanked on disk)
[cold]    {"unlocked":null,"splash":1,"drivers":["Alice"],"storedFlag":null}                    ← gated
--- B2 corrupt (tampered: stayUnlocked:true forced back onto the 2-driver vault on disk)
[cold]    {"unlocked":null,"splash":1,"drivers":["Alice"],"storedFlag":true}                    ← gated by sanitizeVault
--- legit solo vault (sanitizeVault must not break it)
[solo] {"storedFlag":true}
[cold] {"unlocked":"Solo","splash":0}   [cold] {"unlocked":"Solo","splash":0}                   ← still auto-unlocks
```
Old tree, same probe:
```
[rearm-a] storedFlag:true, reEnableWith2:{"ok":true}
self-erase → [cold] {"unlocked":"Alice","splash":0};  corrupt → {"unlocked":"Alice","splash":0};  tampered → {"unlocked":"Alice","splash":0}
```

`sanitizeVault` keeps `stayUnlocked` only when all four hold:
- `raw.stayUnlocked === true`
- no profile was dropped
- `order.length === 1`
- `Object.keys(raw.profiles).length === 1`

A legitimate single-driver vault meets all four. The solo probe above confirms this, and DRR7 and DRR10 still pass. A 2-driver vault carrying the flag (which only the unshipped `receptionfix` build could write) loses the flag in memory on load.

## B3: MW20 evidence (new tree)

I ran MW20 from a scratch copy of the new tree (`/tmp/rv2/nw`), patched only to log the verdict text:
```
L2 Rollout: "Does not fit — not enough 70-hour cycle hours left for this run. You have 45m left … Seeded from My Week custom clocks + chain (after Load 1 Chi) · 70h/8d cycle (45m left)"
L1 Rollout: "Does not fit — a full 10-hour break cannot finish before the Mon 06:45 Central roll-out … Seeded from My Week custom clocks · 70h/8d cycle (6h 00m left)"
L2 Rescue:  "No rescue … (Violates cycle limit by 3h 15m) … 70h cycle left 45m · Seeded from My Week custom clocks + chain (after Load 1 Chi)"
L2 bar: "Custom ELD clocks (from My Week) · 2h 00m drive · 3h 00m win · 6h 00m cycle — Carried from My Week for this chained load — go back to My Week to change these clocks."
L1 bar: "Custom ELD clocks · 2h 00m drive · 3h 00m win · 6h 00m cycle  [Use my log] [Edit clocks]"
```
- MW20 includes a live-log control. With no custom clocks, Load 2 must say "Fits cleanly". That precondition passes, so the pin is not vacuous.
- The basis is visible to the driver in two places:
  - the "Seeded from …" line,
  - the active override bar (read-only for chained loads, editable for Load 1).

I agree with Neon's judgment call #4: making the chained bar read-only avoids a base that doesn't match the prior loads already simulated.

## N2: probe (stage `cooldown`)

New tree:
```
5× changeDriverPin(wrong) → 4× "Current PIN is wrong.", 5th "Too many wrong PINs. Wait 30 seconds…"
correct-during-wait(changePin):  {"ok":false,"error":"Too many wrong PINs. Wait 30 seconds before trying again.","cooldownMs":30000}
correct-during-wait(recovery):   {"ok":false,…"cooldownMs":30000}
correct-during-wait(remove):     {"ok":false,…"cooldownMs":30000}    (driver still present)
correct-during-wait(unlock):     {"ok":false,…"cooldownMs":30000}    (shared counter with the splash unlock)
```
Old tree: `correct-during-wait(changePin): {"ok":true}`, with no cooldown at all.

DR16 additionally drives the Settings Change PIN form, escalation to 60s on the 6th miss, and the reset after a valid PIN.

## 6. Fail-before check (new pins on the old tree)

To run the new test files against the old tree, I made a scratch copy of the old tree (`/tmp/rv2/old`, `node_modules` symlinked) and copied the new test files into it. TZ=America/Chicago, cwd=web.

| Pin | Old tree (`receptionfix`) | New tree | Note |
|---|---|---|---|
| DR13 (ext. N4) | **FAIL** "expected 1d stale chip, got: … 24h ago" | PASS | real |
| DR14 (ext. N3) | **FAIL** "must clear lastEldCheckAt, got: undefined" | PASS | real |
| DR15 (B1) | **FAIL** "populated Now CTA should open drift sheet, got: {kind:quickstart…}" | PASS | real |
| DR16 (B2+N2) | **FAIL** "clickNode: null node" | PASS | Fails first on the new `data-change-pin-*` selectors, before it reaches the behavior. My probe above shows the behavior itself also differs (old tree accepts the correct PIN during the would-be wait). |
| DR17 (N1) | **FAIL** "Split commit button … found=false" | PASS | Also fails first on a new selector (`data-split-commit`). The code diff shows the behavior change. |
| DRR9 (strengthened) | **FAIL** "vault.stayUnlocked was NOT cleared when 2nd driver registered" | PASS | real |
| DRR11 | **FAIL** (its fixture now comes from the strengthened DRR9; the old tree bypasses the splash gate) | PASS | Was vacuous on baseline in my first review; it is now a real gate pin. |
| DRR13 (B2 self-erase) | **FAIL** "stayUnlocked stayed true after Bob registered" | PASS | real |
| DRR14 (B2 corrupt drop) | **FAIL** "silently re-armed stayUnlocked! {splash:0, navCount:1, unlocked:…}" | PASS | real |
| MW20 (B3) | **FAIL** (verdicts quoted in the B3 closure row) | PASS | real |

Totals:
- Old tree: drivers 12/17, drivers-relaunch 10/14, myweek 19/20.
- New tree: drivers 17/17, drivers-relaunch 14/14, myweek 20/20.

**No vacuous pins.** One partial caveat on DR15's Undo leg: it calls `undoLast()` directly rather than tapping a UI control. That is because no such control exists (see F1).

## 7. Invariants
```
engine aggregate sha256 (find engine -type f … | sort | xargs sha256sum | sha256sum):
  work-splashart      0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d
  work-receptionfix   0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d
  work-receptionfix2  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d   ✓ matches required
storage key literals: identical set in both trees ('hos-sandbox-v1', '-backup', '-sim', 'hos-sandbox-undo-v1')
localStorage get/set/removeItem call sites: identical (diff empty)
`export interface State` block: identical;  DriverVault type: identical
```
- **No new persisted fields.** The reseed Undo reuses the existing `hos-sandbox-undo-v1` record and the existing `Undo` shape.
- `sanitizeVault` only drops a flag. It never adds one.
- `tsc -p tsconfig.json --noEmit`: **OK**.

## 8. Regression sanity (new tree)

TZ=America/Chicago. Each suite was bundled outside the tree, or run from a scratch copy for the suites that read files by relative path.
- `drivers` 17/17, `drivers-relaunch` 14/14, `myweek` 20/20 (all from the real tree's sources)
- `rescue` 11/11, `stack` 15/15, `logedit` 37/37 (LOGEDIT OK), `c3` 46/46 (C3 OK)
- `smoke.mjs`: exit 0, 86 sections OK, including "patch 12 (screenshot import — on-device read …): OK"

I picked these because the diff touches QuickStart, Rollout/Rescue and Undo. I did not re-run the playwright suites (auditfix, polish, layout), revisions or gemini. For those I am relying on the handoff's results.

---

## New findings introduced by the fix round (non-blocking)

### F1 (nit): the replace-confirm text promises "Undo on the Log restores your prior rows", but no on-screen Undo control exists for that undo
- **What I saw:** right after a reseed, and again after picking a status, I collected every button whose text matches `/undo/i` on Now and on the Log page (active Log confirmed). The result was `[]` both times, and the label "Replaced log from ELD clocks" appears nowhere in the DOM.
- **Why there is no control:** the only UI callers of `undoLast` are:
  - `StatusUndoChip`, which shows only for labels matching `/ since HH:MM$/`,
  - the Split "plan on log" row.
- **Impact today is nil.** The confirm screen can't be reached on a populated log (see B1).
- **Fix (small):** this matters if a future change re-opens a reseed path. Either show an Undo row on the QuickStart done screen while `currentUndo()?.label === SEED_UNDO_LABEL`, or drop that sentence from the confirm.

### F2 (nit): Undo of a reseed leaves `lastEldCheckAt` and `seededAt` set
- **Why:** `Saved` covers only `segments`, `tentative`, `current`, `historyAcknowledged` and `dayCloses`. After undo, the probe shows `lastEldCheckAt: now` and `seededAt: now`.
- **Effect of `seededAt`:** none. `cycleBasis` also needs a seed-note row, and the undo removed it.
- **Effect of `lastEldCheckAt`:** the chip reads "checked just now" after the driver undid the reseed. That is defensible, since they did look at their ELD.
- Same latent reachability as F1.

### Pre-existing (not introduced here; outside this round's scope)
- **P1: "Undo is on the Log" has no generic Log Undo control.** The edit, add and delete sheets say "Undo is on the Log until your next change" (`app.tsx:3571,3599,4751,12369,12455`). After `deleteEntry`, though, no Undo button renders anywhere. I confirmed this identically on the live baseline `work-splashart` (`/tmp/rv2/probe/del.tmpl.mjs`: `undo:"Deleted Driving …", undoButtons:[]` on both trees). The undo record exists, and survives relaunch, but only status-tap undos and the Split commit have a control. Worth a dedicated look in a later round. It is not caused by this fix round.

---

## Commands and probes actually run
```
diff -rq work-receptionfix work-receptionfix2 -x node_modules -x dist -x dist-test
diff -u  …/store.ts, …/driver-ui.tsx, …/app.tsx            (full read of every hunk)
esbuild test/dom/{drivers,drivers-relaunch,myweek}.mjs → /tmp/rv2/new-*.mjs ; TZ=America/Chicago node …   (17/17, 14/14, 20/20)
/tmp/rv2/old (old tree copy + new test files): same 3 suites                                          (12/17, 10/14, 19/20)
/tmp/rv2/probe/p.tmpl.mjs → out-receptionfix2.mjs {b1,b2,n2} ; out-receptionfix.mjs {b2,n2}
/tmp/rv/probes/rf-probe.out.mjs --only-refresh   (old tree B1 repro)
/tmp/rv2/probe/del.tmpl.mjs on receptionfix2 + splashart (P1)
/tmp/rv2/nw (new tree copy): MW20 with verdict logging; smoke.mjs; dom rescue/logedit/c3/stack
engine sha256 ×3 trees; storage-key literal + localStorage call-site diff; State/DriverVault type diff
tsc -p tsconfig.json --noEmit (new tree)
find … -newer / mtime check: no tree file modified during this review
```
Logs are in `/tmp/rv2/*.log`, `/tmp/rv2/probe-b1-new.log`, `/tmp/rv2/probe-n2-new.log` and `/tmp/rv2/probe-old.log`.
