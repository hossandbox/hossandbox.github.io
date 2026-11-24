# HANDOFF — Fix Round 2 (Narrow): Plan Tool #3 "Can I Legally Use It?" (`work-legalfix2`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-legalfix2` (base = `work-legalfix`, addressing Opus spot-check `REVIEW-LEGALFIX.md` Section 2: `NF1`, `NF2`, `NF3`)
- **Scope:** Narrow fix confined strictly to `web/src/legal.ts` and `web/test/dom/legal.mjs`. Zero changes to `web/src/app.tsx`, `web/src/store.ts`, or `engine/`.
- **Status:** Implemented, built clean, stub swap-tested (`0/15`), targeted NF1–NF3 mutants verified caught (`4/4`), and verified across `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to baseline) | **PASS** |
| `web/src/app.tsx` untouched | `git hash-object web/src/app.tsx` | `a85bf7acfc18e223329a5ed5035f70056ff432cd` (identical to `work-legalfix`) | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `LG9` + `smoke.mjs` | `3` (unchanged; `0` in `LegalTab`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` + `legal.mjs` `LG9` | `extraKeys: []` | **PASS** |
| Confined file scope | Modified files in `work-legalfix2` | Only `web/src/legal.ts`, `web/test/dom/legal.mjs`, build outputs, and `HANDOFF-LEGALFIX2.md` | **PASS** |

---

## 2. Per-Item Changes (`file:line`)

### NF1 — `otherExceptionActive` means honored (not merely toggled) & stacking warning/copy gated on `> 16h`
- **`web/src/legal.ts:242-276`** (`previewExceptionClock`, `kind === 'adverse'` branch):
  - Evaluates `evBefore` (using `beforeCfg` with any active adverse key removed) and `evAfter` first, then checks whether `evBefore.shift.exceptionKeys.sixteen` is actually honored by re-evaluating `beforeCfg` without `sixteenKey` and requiring `evBefore.shift.limits.window > evWithoutSixteen.shift.limits.window`.
  - When `sixteen` is toggled on the log but refused by the engine under §395.1(o)(3) (Probe `NEW-A`, window stays `840` min / 14h), `otherExceptionActive` remains `null` and `beforeLabel` remains `'Before (standard)'`.
  - The `sixteen` branch (`L277-311`) is unchanged for `otherExceptionActive` because Adverse is always honored by the engine.
- **`web/src/legal.ts:313-316`** (`stackWarning`):
  - Computes `afterWindowHours = evAfter.shift.limits.window / 60` and emits `stackWarning` only when `otherExceptionActive !== null && !blockedByLog && afterWindowHours > 16`, interpolating `${afterWindowHours}-hr` directly from the engine's after-window value.
- **`web/src/legal.ts:797-818`** (`evaluateLegalTree`):
  - Gates the stacked YES copy override on `preview && preview.otherExceptionActive !== null && preview.after.windowLimit / 60 > 16` so non-stacked previews (like Probe `NEW-A`, `14h → 16h`) always carry the plain Adverse explanation with zero stacking language.

### NF2 — `logBlockNote` matches `(o)(3)`-specific engine note & uses actual current window hours
- **`web/src/legal.ts:302-310`** (`previewExceptionClock`, `kind === 'sixteen'` branch):
  - Replaced the broad `/16-hour/i` search (which matched `"Adverse driving conditions declared: 13-hour driving / 16-hour window (§395.1(b)(1))."` first on stacked logs) with a `(o)(3)`-specific match: `evAfter.shift.notes.find((n) => /§395\.1\(o\)\(3\)|^⚠/.test(n))`.
  - Because the engine's `(o)(3)` note hard-codes `"window stays 14 hours"` (wrong when Adverse is active and the preview shows `16h → 16h`), prefers the local fallback string parameterized with actual `${winH}` whenever `winH !== 14 || !engineIneligibleNote`:
    `"49 CFR §395.1(o)(3) allows the 16-hour exception only once in 7 carrier days without an intervening 34-hour restart. Your window stays at ${winH} hours."`
  - Both `verdict.explanation` and `preview.bindingNote` read `preview.logBlockNote`, so on Probe `NEW-B` both cite `49 CFR §395.1(o)(3)` and `16 hours`, never quoting the Adverse note or claiming `14 hours`.

### NF3 — Adverse Q1 "most recent" anchor wording
- **`web/src/legal.ts:406-419`** (`TREES.adverse.questions[0]`):
  - **Question (`L407-408`):** `"Was the condition unknown (and not reasonably knowable) at the most recent of: starting this duty day, or ending your last qualifying rest — AND unknown to dispatch before sending you out?"`
  - **Detail (`L409-410`):** `"Qualifying rest means a 10-hr break, ≥7-hr sleeper, or the ≥2-hr split-sleeper leg (a 30-min break does NOT count). If you knew — or could reasonably have known — at the most recent of those moments (or if dispatch knew before sending you out), answer NO."`
  - **Q1 NO explanation (`L418-419`):** updated to match `"at the most recent of starting this duty day or ending your last qualifying rest ... and was unknown to your carrier before dispatch."`

---

## 3. Pin Changes (`web/test/dom/legal.mjs`) — 15 Pins (`LG1`–`LG15`)

### Added Pins

| Pin | Line | What It Verifies |
| :--- | :--- | :--- |
| **`LG14`** | `L713` | **NF1 (Opus probe `NEW-A`):** P6 log (16-hr used Nov 9, toggled again on Nov 10 shift with only 19h off / no 34-hr restart so engine keeps window at 14h despite non-null `keys.sixteen`), Adverse tree YES/YES. Asserts `otherException === ''`, `beforeLabel === 'Before (standard)'`, `stackWarn === ''`, exact `evaluate()` must-stop parity, and plain Adverse copy (`11h → 13h`, `14h → 16h`) with no stacking language (`!/stacking\|NOT confirmed\|already has the 16-hr\|an 16-hr/i`). |
| **`LG15`** | `L763` | **NF2 (Opus probe `NEW-B`):** Adverse active on Nov 10 shift + prior 16-hr use on Nov 9 (19h off, no 34-hr restart), 16-hr tree YES ×3. Asserts `NO — ALREADY USED IN LOG`, `Before (Adverse already on)`, suppressed `stackWarn`, exact `evaluate()` must-stop parity, and that BOTH `explanation` and `bindingNote` cite `§395.1(o)(3)` and `16 hours` while excluding the Adverse note (`§395.1(b)(1)` / `"Adverse driving conditions declared"`) and hard-coded `"14 hours"`. |

### Changed Existing Pins

| Pin | Line | What Changed & Why |
| :--- | :--- | :--- |
| **`LG2`** | `L250` (`L268-277`) | **NF3:** Updated Q1 text, Q1 detail, and Q1 NO explanation assertions to verify the `"most recent of: starting this duty day, or ending your last qualifying rest"` anchor, `"most recent of those moments"` detail phrasing, and `"most recent"` in the Q1 NO explanation (retaining all existing §395.2 / 30-min-break / dispatch assertions). |

*(Unchanged pins: `LG1`, `LG3`–`LG13` — all continue to pass unmodified.)*

---

## 4. Stub Swap-Test & Targeted NF1–NF3 Mutation Checks

### Stub Swap-Test (Minimal Stub for `web/src/legal.ts`)

Bundling `web/test/dom/legal.mjs` with `web/src/legal.ts` swapped for a minimal placeholder stub fails **all 15 legal pins (`0/15`, `STUB_EXIT=1`)**:

```text
FAIL  LG1. Adverse Driving YES: §395.1(b)(1), editable ELD template, advisory line, and live must-stop matches evaluate() directly
FAIL  LG2. Adverse Driving NO paths: Q1=NO (§395.2 duty-day/qualifying-rest & dispatch anchor) and Q2=NO (foreseeable/rush hour/full lot) end immediately at NO
FAIL  LG3. Personal Conveyance YES: Sign label itself carries VERIFY CARRIER POLICY, warning box, 2018 rest condition, FMCSA 2018 PC cite, clean guidance clock note, advisory line
FAIL  LG4. Personal Conveyance NO paths: softened Q1=NO headline, N3 nearest/not-bypassing Q2 wording, and immediate NO termination
FAIL  LG5. Yard Move YES: §395.28, standing reminder that YM is ON duty (burns 14-hr & 70-hr, spares 11-hr drive), guidance clock note, advisory line
FAIL  LG6. Yard Move NO paths: Q1=NO (public truck stop / fuel island) and Q2=NO (public road) end immediately at NO
FAIL  LG7. 16-Hour Short-Haul YES: §395.1(o) property-carrying scope, non-double-negative Q2, 11-hr drive does NOT expand, preview matches evaluate(), plus §395.1(o)(3) log block
FAIL  LG8. 16-Hour Short-Haul NO paths: Q1=NO (5 tours), Q2=NO (used in 7d), Q3=NO (not returning tonight) each end immediately at NO
FAIL  LG9. Safe Haven (§397.5 explosives-only) static card from tool home, advisory line on home & card, Plan hub 10th item, zero <input type="time">, zero new storage keys
FAIL  LG10. Engine preview honesty: direct evaluate() parity on drive-bound (16h does not move mustStopBy), cycle-bound, and already-active adverse (flag & outcome parity)
FAIL  LG11. F1 ELD annotation templates: all four YES annotations <= 60 chars, ASCII-only, contain "[" placeholder, PC uses [shipper/receiver], copy button labels template
FAIL  LG12. F3 cross-exception preview (P1 sixteen+Adverse on, P2 adverse+16h on): honest Before label, stacking warnbox, non-contradictory verdict copy, numbers preserved vs evaluate()
FAIL  LG13. F4 expired-window probe (P9): 17h on-duty adverse preview emits ended-at-HH:MM stop-now bindingNote and relabeled 11-hr drive row
FAIL  LG14. NF1 probe NEW-A: toggled-but-ineligible 16-hr day keeps Before (standard), no stacking warnbox, and plain Adverse copy with no stacking language
FAIL  LG15. NF2 probe NEW-B: stacked + log-blocked 16-hr card cites §395.1(o)(3) and actual 16-hr window (not Adverse note and not hard-coded 14 hours)

0/15 legal pins passed
STUB_EXIT=1
```

### Targeted NF1–NF3 Mutation Verification (`4/4` caught)

| Mutant | Description | Result |
| :--- | :--- | :--- |
| `NF1-unhonored` | Revert honored-window check to `if (true)` (key presence only) | **CAUGHT** by `LG14` (`14/15`) |
| `NF2-adverse-note` | Revert note match to `/16-hour/i` without `winH` guard | **CAUGHT** by `LG15` (`14/15`) |
| `NF2-hardcoded-14h` | Match `(o)(3)` note verbatim even when `winH !== 14` | **CAUGHT** by `LG15` (`14/15`) |
| `NF3-old-q1` | Revert Adverse Q1 to old `"before you began this duty day or drove after your last qualifying rest"` | **CAUGHT** by `LG2` (`14/15`) |

---

## 5. Dual-Timezone Verification Results

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 483.0kb`) | — | Clean build after final edits |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |
| **Full Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle`, `smoke.mjs`, plus all 13 DOM lanes: |
| ↳ `dom/yesback.mjs` | **PASS** (6/6) | **PASS** (6/6) | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** (39/39) | **PASS** (39/39) | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** (30/30) | **PASS** (30/30) | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** (30/30) | **PASS** (30/30) | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** (46/46) | **PASS** (46/46) | via `npm run smoke` |
| ↳ `dom/c3relaunch.mjs` | **PASS** (3/3) | **PASS** (3/3) | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** (37/37) | **PASS** (37/37) | via `npm run smoke` |
| ↳ `dom/cascade.mjs` | **PASS** (16/16) | **PASS** (16/16) | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (11/11) | **PASS** (11/11) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (15/15) | **PASS** (15/15) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (13/13) | **PASS** (13/13) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | `LG1`–`LG15` all green in both TZs |
| ↳ `dom/carrierday.mjs` | **PASS** (9/9) | **PASS** (9/9) | via `npm run smoke` |

---

## 6. Files Modified / Created

- **Modified:** `web/src/legal.ts` (`40814e8e72cea6b1e94c2b01a8072d46dd0e785f`)
- **Modified:** `web/test/dom/legal.mjs` (`5532112c0c3687576d07c6f97f7f93f63114d7e7`)
- **Created:** `HANDOFF-LEGALFIX2.md`
- **Untouched:** `web/src/app.tsx`, `web/src/store.ts`, `engine/`
