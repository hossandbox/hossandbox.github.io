# HANDOFF — Fix Round 1: Plan Tool #3 "Can I Legally Use It?" (`work-legalfix`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-legalfix` (base = `work-legal`, addressing Opus review `REVIEW-LEGAL.md`)
- **Scope:** Regulatory/copy layer and clock-preview honesty in `web/src/legal.ts`, `LegalTab` in `web/src/app.tsx`, and pins in `web/test/dom/legal.mjs`. Zero changes outside `LegalTab` / `legal.ts` / `legal.mjs`.
- **Status:** Implemented, built clean, stub swap-tested (`0/13`), PC Sign-label mutant verified caught, and verified across `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to baseline) | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `LG9` + `smoke.mjs` | `3` (unchanged; `0` in `LegalTab`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` F3 + `legal.mjs` LG9 | `extraKeys: []` | **PASS** |
| Existing tools unchanged | `npm run smoke` (both TZs), `revisions`, `gemini` | Only `web/src/legal.ts`, `LegalTab` in `web/src/app.tsx`, and `web/test/dom/legal.mjs` modified | **PASS** |

---

## 2. Per-Finding Changes (`file:line`)

### MUST FIX

- **F1 — Editable ≤ 60-char ASCII ELD annotation templates & button rename**
  - `web/src/legal.ts:449` (Adverse): `Unforeseen [crash/ice] closure [Hwy] MM [##] - 395.1(b)(1)` (**58 chars**, ASCII, `[` placeholders); updated `effectNote` at `L451` to instruct editing `[placeholders]` before saving on the ELD.
  - `web/src/legal.ts:520` (PC): `Ordered off [shipper/receiver] - PC to nearest safe parking` (**59 chars**, ASCII, uses `[shipper/receiver]` instead of hard-coded `"receiver lot"`).
  - `web/src/legal.ts:589` (Yard Move): `Private gated yard move at [facility/yard] - 395.28` (**51 chars**, ASCII, `[facility/yard]` placeholder).
  - `web/src/legal.ts:680` (16-Hour): `16-hr Big Day, returning to [home terminal] - 395.1(o)` (**54 chars**, ASCII, `[home terminal]` placeholder).
  - `web/src/app.tsx:8213`: renamed copy button label from `"Copy ELD annotation example"` to `"Copy template (edit before saving)"`.
  - **New Pin:** `LG11` (`web/test/dom/legal.mjs:583`) asserts all four YES annotations are `<= 60` chars, pure ASCII, contain `[` and `]` placeholder tokens, PC uses `[shipper/receiver]` (never `"receiver lot"`), and the copy button reads `"Copy template (edit before saving)"`.

- **F2 — Adverse Q1 §395.2 knowledge-timing anchor**
  - `web/src/legal.ts:40`: updated Adverse home prompt to `"Unexpected crash closure or sudden ice after starting your day/dispatch? (+2h drive & window check)"`.
  - `web/src/legal.ts:391-410`: reworded Q1 (`after_dispatch`) to require the condition was unknown (and not reasonably knowable) **before beginning this duty day or driving after the last qualifying rest** AND unknown to dispatch before sending the driver out. Kept Adverse at the **same question count (2 questions / 3 taps from tool home)** because both anchors are cleanly and unambiguously tested together.
  - `web/src/legal.ts:395-396`: updated detail line to define qualifying rest per FMCSA FAQ 11 (`10-hr break, ≥7-hr sleeper, or the ≥2-hr split-sleeper leg (a 30-min break does NOT count)`).
  - `web/src/legal.ts:404-406`: updated Q1 NO explanation and citation (`49 CFR §395.1(b)(1) · §395.2`) to cite the duty-day / qualifying-rest / dispatch anchors and explicitly note a 30-min break does not count.

- **F3 — Cross-exception preview honesty (Adverse + 16-Hour stacking)**
  - `web/src/legal.ts:103-105`: added `otherExceptionActive: 'adverse' | 'sixteen' | null`, `beforeLabel: string`, and `stackWarning: string | null` to `LegalClockPreview`.
  - `web/src/legal.ts:237-302`: in `previewExceptionClock()`, checks `evRaw.shift.exceptionKeys.sixteen !== null` (for `adverse`) and `evRaw.shift.exceptionKeys.adverse !== null` (for `sixteen`). Sets `beforeLabel` to `"Before (16-hr day already on)"` or `"Before (Adverse already on)"` (instead of `"Before (standard)"`), and populates `stackWarning` (`"Stacking Adverse + 16-hour is NOT confirmed to allow an 18-hr window — check with your carrier before relying on anything past 16h."`) without suppressing the preview numbers (per Round 1 instructions while owner ruling is pending).
  - `web/src/legal.ts:317-323`: parameterized `bindingNote` limit labels (`${after.windowLimit / 60}h`, `${after.driveLimit / 60}-hr`) so they match the actual active limits.
  - `web/src/legal.ts:753-805`: in `evaluateLegalTree()`, dynamically aligns Adverse and 16-Hour YES `explanation` and `standingReminder` (and log-blocked window/drive text) with the actual before/after limits (`16h → 18h` when stacked) so verdict copy never contradicts the rendered preview with a flat `"14h → 16h"` claim.
  - `web/src/app.tsx:8135, 8152-8159`: exposes `data-legal-other-exception`, renders `{v.preview.beforeLabel}` in the Before column (`data-legal-before-lbl="1"`), and renders `v.preview.stackWarning` in `.warnbox` (`data-legal-stack-warn="1"`).
  - **New Pin:** `LG12` (`web/test/dom/legal.mjs:613`) pins Opus probes **P1** (`sixteen` with Adverse already on) and **P2** (`adverse` with 16-hr already on) in the rendered DOM against `evaluate()`.

### SHOULD FIX

- **F4 — Drive row relabel & expired-window `bindingNote`**
  - `web/src/app.tsx:8173-8175`: relabeled the drive row (`data-legal-drive-label="1"`) from `"Drive deadline (...)"` to `"11-hr clock runs out (if nothing else stops you) ({before}h → {after}h)"`.
  - `web/src/legal.ts:309-310`: added expired-window `bindingNote` when `after.windowRemaining === 0 || after.windowEnd <= after.asOf`: `"Your window ended at ${before.windowEndHM}; with the exception it ended at ${after.windowEndHM} — stop now."` Also added a `WINDOW_14` fallback branch at `L319-320` when `mustStopBy` does not move.
  - **New Pin:** `LG13` (`web/test/dom/legal.mjs:671`) pins Opus probe **P9** (OFF Nov 10 00:00–10:00, ON Nov 10 10:00 → Nov 11 03:00, Adverse) confirming `Your window ended at 00:00; with the exception it ended at 02:00 — stop now.` plus the relabeled drive row and logged-record header.

- **F5 — 16-Hour Q2 double-negative removal**
  - `web/src/legal.ts:625-626`: reworded Q2 (`once_per_7`) from `"Have you NOT used..."` to `"Is this your FIRST 16-hour day in the last 7 days (or since your last 34-hr restart)?"` (preserving YES = qualifies, NO = already used).

- **F6 — PC 2018-guidance rest condition & softened Q1 NO headline**
  - `web/src/legal.ts:518-519`: added the 2018-guidance rest condition to PC YES `standingReminder`: `"Stop at the first reasonable safe parking spot, take your full required off-duty rest (e.g. 10 hours off) there before driving on duty again, and clearly annotate who ordered you off the lot and where you parked."`
  - `web/src/legal.ts:471-473`: softened PC Q1 NO `headline` to `"This check only covers being moved off a lot — for other PC uses, see your carrier's PC policy."` and updated `explanation` to acknowledge purely off-duty personal travel (such as motel to restaurant).

### SMALL COPY / PIN ITEMS

- **N1 — LG3 Sign-label assertion & LG10 honest comment**
  - `web/test/dom/legal.mjs:158, 289`: `readVerdict()` now extracts `signLabel` directly from `<span class="sign-word">` inside `<Sign>`, and `LG3` asserts `/VERIFY CARRIER POLICY/.test(v.signLabel)` (independent of `carrierWarn`). Verified via mutation run: mutating PC `verdictLabel` to `'YES'` now fails `LG3` (`12/13`, `MUT8_EXIT=1`).
  - `web/test/dom/legal.mjs:525, 541-543`: updated `LG10`'s title and Fixture C comment to state honestly that `LG10` verifies `alreadyActiveOnLog === true` and `evaluate()` outcome parity, while the engine deduplicates/ignores duplicate keys so the no-double-add branch is outcome-true rather than independently mutant-observable.

- **N3 — PC Q2 nearest / not bypassing phrasing**
  - `web/src/legal.ts:483-496`: rephrased PC Q2 (`nearest_safe`), its detail line, and its NO explanation around going straight to the NEAREST reasonable safe parking and NOT bypassing closer open parking — dropping the absolute `"NOT heading toward home or the next pickup"` clause when the nearest parking lies in that direction.

- **N5 — Property-carrying scope on 16-Hour tree**
  - `web/src/legal.ts:58, 606, 615, 675, 679, 769, 798, 800`: added explicit `"property-carrying"` scope to the 16-Hour home prompt, Q1 detail/NO explanation, and YES/log-blocked verdict copy (`§395.1(o)` is property-carrying only).

- **N6 — PC clock guidance note cleanup**
  - `web/src/legal.ts:522`: dropped the `"unless it is part of a qualifying 10-hr reset or sleeper split"` clause from PC `clockGuidance`.

- **N7 — Preview header clarifies logged record**
  - `web/src/app.tsx:8144`: changed preview header (`data-legal-preview-head="1"`) from `"Live clock preview from your log"` to `"Live clock preview from your logged record"`.

---

## 3. Pin List (`web/test/dom/legal.mjs`) — 13 Pins (`LG1`–`LG13`)

### New Pins Added

| Pin | Line | What It Verifies |
| :--- | :--- | :--- |
| **`LG11`** | `L583` | **F1:** All four YES annotations (Adverse, PC, Yard Move, 16-Hour) are `<= 60` chars, pure ASCII, contain `[` and `]` placeholder tokens, PC uses `[shipper/receiver]` (never `"receiver lot"`), and copy button reads `"Copy template (edit before saving)"`. |
| **`LG12`** | `L613` | **F3 (Opus probes P1 & P2):** Cross-exception previews (`sixteen` with Adverse active; `adverse` with 16-hr active) render honest Before labels (`"Before (Adverse already on)"` / `"Before (16-hr day already on)"`), `.warnbox` stacking caveat, non-contradictory `16h → 18h` verdict copy, and un-suppressed numbers matching `evaluate()`. |
| **`LG13`** | `L671` | **F4 (Opus probe P9):** Expired-window log (OFF Nov 10 00:00–10:00, ON Nov 10 10:00 → Nov 11 03:00, Adverse) emits `"Your window ended at 00:00; with the exception it ended at 02:00 — stop now."` in `bindingNote` (both API and rendered DOM), relabeled `"11-hr clock runs out (if nothing else stops you)"` drive row, and `"from your logged record"` header. |

### Changed Existing Pins (All Listed)

| Pin | Line | What Changed & Why |
| :--- | :--- | :--- |
| **`LG1`** | `L205` | Updated expected Adverse annotation to the F1 editable template (`Unforeseen [crash/ice] closure [Hwy] MM [##] - 395.1(b)(1)`), plus added assertions for `"Copy template (edit before saving)"` (F1), `"from your logged record"` (N7), `"Before (standard)"` (F3), and `"11-hr clock runs out (if nothing else stops you)"` (F4). |
| **`LG2`** | `L248` | Expanded Q1 assertions for F2: verifies Q1 text, detail line, and Q1 NO explanation/citation cover the §395.2 duty-day / qualifying-rest (10-hr, ≥7-hr sleeper, ≥2-hr split; 30-min break does NOT count) and dispatch anchors. |
| **`LG3`** | `L280` | Strengthened per N1 to assert `/VERIFY CARRIER POLICY/` directly on the `<Sign>` label (`v.signLabel`, `.sign-word`); added F6 rest-condition check (`full required off-duty rest ... before driving on duty again`), F1 `[shipper/receiver]` check, and N6 negative check (`!/unless it is part of/`). |
| **`LG4`** | `L311` | Expanded for F6 + N3: asserts softened Q1 NO headline (`"This check only covers being moved off a lot — for other PC uses, see your carrier's PC policy."`) and N3 Q2 phrasing (`NEAREST reasonable safe parking` / `NOT bypassing closer open parking`, without `NOT heading toward home or the next pickup`). |
| **`LG7`** | `L383` | Expanded for F5 + N5: asserts Q2 exact positive text (`"Is this your FIRST 16-hour day in the last 7 days (or since your last 34-hr restart)?"`) and `property-carrying` scope on Q1 detail and verdict explanation. |
| **`LG10`** | `L525` | Updated pin title & Fixture C comment per N1 to state honestly that `alreadyActiveOnLog` and `evaluate()` outcome parity are asserted while duplicate keys are deduplicated inside the engine (no assertions weakened or faked). |

*(Unchanged pins: **`LG5`** `L339`, **`LG6`** `L363`, **`LG8`** `L453`, **`LG9`** `L478` — all continue to pass unmodified.)*

---

## 4. Fail-Before Stub Swap-Test & Mutation Check

### Stub Swap-Test (Minimal Stub for `web/src/legal.ts`)

Bundling `web/test/dom/legal.mjs` with `web/src/legal.ts` swapped for a minimal placeholder stub fails **all 13 pins (`0/13`, `STUB_EXIT=1`)**:

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

0/13 legal pins passed
STUB_EXIT=1
```

### Targeted N1 Mutant Verification (Opus Mutant #8)

Mutating PC `verdictLabel: 'YES — VERIFY CARRIER POLICY'` → `'YES'` is now caught directly by `LG3`:

```text
FAIL  LG3. Personal Conveyance YES: Sign label itself carries VERIFY CARRIER POLICY, warning box, 2018 rest condition, FMCSA 2018 PC cite, clean guidance clock note, advisory line
12/13 legal pins passed
MUT8_EXIT=1
```

---

## 5. Dual-Timezone Verification Results

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 482.6kb`) | — | Clean build after final edits |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |
| **Full Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs`, plus all 13 DOM lanes: |
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
| ↳ `dom/legal.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | `LG1`–`LG13` all green in both TZs |
| ↳ `dom/carrierday.mjs` | **PASS** (9/9) | **PASS** (9/9) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | 88/89 (known pre-existing `W2` host-TZ seed per `HANDOFF-LEGAL.md`) | All Plan-hub & room-dissolve pins pass in both TZs |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |

---

## 6. Files Modified / Created

- **Modified:** `web/src/legal.ts` (`d1010a6e849c373b94f72f3e5b54fe0701abd8b4`)
- **Modified:** `web/src/app.tsx` (`a85bf7acfc18e223329a5ed5035f70056ff432cd`, `LegalTab` only)
- **Modified:** `web/test/dom/legal.mjs` (`17db01531df3bc8da7297357745cfaa122b81c44`)
- **Created:** `HANDOFF-LEGALFIX.md`
