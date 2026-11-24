# HANDOFF — Plan Tool #3: "Can I Legally Use It?" (`work-legal`)

- **Date:** 2026-11-23
- **Tree:** `/home/lae/hos-build/work-legal` (copied from live `/home/lae/hos-build/work-motelfix2`)
- **Product Spec:** `RESEARCH-PLAN-TOOLS-2.md` §2 #3 (*"Can I Legally Use It?"* — 3 AM HOS Exception & Edge-Case Sanity Check, appended 10th / bottom in the Plan hub at standard `.plan-item` size)
- **Status:** Implemented, built, stub-swap tested, and verified in both `TZ=America/Chicago` and `TZ=UTC`. Not deployed, not pushed.

---

## 1. Hard Invariants Verified

| Invariant | Command | Measured Result | Status |
| :--- | :--- | :--- | :--- |
| `web/src/store.ts` byte-identical | `git hash-object web/src/store.ts` | `1323046db6ba07b8c85805f89a103dc16f3776b5` | **PASS** |
| `engine/` untouched | `find engine -type f -not -path '*/node_modules/*' \| sort \| xargs sha256sum \| sha256sum` | `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` (identical to `work-motelfix2`) | **PASS** |
| Zero new `<input type="time">` | `grep -c 'type="time"' web/src/app.tsx` + `LG9` + `smoke.mjs` | `3` (unchanged from baseline; `0` in `LegalTab`) | **PASS** |
| Zero new `localStorage` keys | `logedit.mjs` F3 + `legal.mjs` LG9 + `motel.mjs` M7 | `extraKeys: []` (tool state is session-only React state) | **PASS** |
| No behavior changes to existing tools | Full `smoke`, `dom` (incl. `rescue`, `stack`, `motel`, `carrierday`, `scrub`), `revisions`, `gemini` | All existing tool tests pass unchanged (only Plan-hub 9→10 item count assertions updated) | **PASS** |

---

## 2. Per-Tree Implementation (`file:line`)

### Framing & Navigation Wiring
- **Standing Advisory Line (`web/src/legal.ts:24-25`):** Exports `LEGAL_ADVISORY_LINE`:
  > `"Rule check only — not legal advice. Your carrier's policy can be stricter than FMCSA. Log and annotate on your carrier ELD."`
  Rendered on the tool's home screen (`web/src/app.tsx:8250`), question cards (`web/src/app.tsx:8329`), and every terminal verdict including Safe Haven (`web/src/app.tsx:8215`).
- **Home Menu Items (`web/src/legal.ts:35-68`):** Exports `LEGAL_HOME_ITEMS` listing the four exception checks plus the Safe Haven myth-buster card.
- **Plan Hub & Room Wiring:**
  - `web/src/app.tsx:62-65` — Imports `legal.ts` exports.
  - `web/src/app.tsx:390` — Adds `I.legal` shield-check stroke icon.
  - `web/src/app.tsx:4570-4602` — Reactive `openLegalPlanner` / `isLegalPlannerOpen` / `useLegalPlanner` state outside `store.ts` (mutually exclusive with `week`, `rollout`, `rescue`, `stack`, and `motel`; auto-clears on tab leave and Plan-bar tap).
  - `web/src/app.tsx:4646-4650` — Appends 10th `.plan-item` (`Can I Legally Use It?`) at the bottom of `PlanTab` at standard size.
  - `web/src/app.tsx:8061-8335` — `LegalTab` component (home list, 2–3-tap Yes/No decision flow, terminal verdict card with CFR cite, ELD annotation copy via `shareVerdictText`, live clock preview, and Safe Haven static card).
  - `web/src/app.tsx:9644-9668, 9723-9733, 9787, 9984, 10013-10021, 10071, 10269, 10302` — Wired `'legal'` into `PlanToolId`, `PLAN_TOOL_LABEL`, `activePlanToolOf`, `backNav`, `isInRoomNow`, `preserveBehindSettings`, and `<section class="... plan-room">`.
  - `web/src/backnav.ts:24` — Added `'legal'` to `PLAN_SCREENS` so hardware Back returns cleanly to the Plan hub.
  - `web/public/styles.css:1523-1560` — Added `.legal-*` classes using existing day/night palette tokens, `>= 12px` font-size floor, and `var(--ctl-lg)` (`64px`) tap targets.

### Tree 1 — Adverse Driving Conditions (`49 CFR §395.1(b)(1)`)
- **Logic:** `web/src/legal.ts:360-427` (evaluated by `evaluateLegalTree` at `web/src/legal.ts:665-767`).
- **Questions (3 taps total from tool home; any NO ends immediately):**
  1. `after_dispatch` (`L367-385`): *"Did the condition arise AFTER you were dispatched?"* — NO ends immediately at `NO` (`49 CFR §395.1(b)(1)`).
  2. `unforeseeable` (`L387-406`): *"Was it genuinely unforeseeable — a crash closure or sudden ice — NOT rush hour, NOT forecasted snow, and NOT a full truck stop?"* — NO ends immediately at `NO` (`49 CFR §395.1(b)(1)`).
- **YES Verdict (`L408-426`):** `YES`, `49 CFR §395.1(b)(1)`, explains up to +2h drive (`11h → 13h`) and +2h window (`14h → 16h`) to complete the run or reach a safe place (does not extend 60/70-hr cycle or 30-min break), suggested ELD annotation `"Unforeseen I-80 closure MM 214 — §395.1(b)(1)"`, plus live before/after engine clock preview (`previewKind: 'adverse'`).

### Tree 2 — Personal Conveyance (`FMCSA 2018 PC Guidance`)
- **Logic:** `web/src/legal.ts:429-498`.
- **Questions (3 taps total; any NO ends immediately):**
  1. `ordered_off` (`L436-454`): *"Were you ordered off the shipper/receiver property (or otherwise out of hours and required to move)?"* — NO ends immediately at `NO`.
  2. `nearest_safe` (`L456-475`): *"Are you going to the NEAREST reasonable safe parking — NOT advancing the load, NOT bypassing closer open parking, and NOT heading toward home or the next pickup?"* — NO ends immediately at `NO`.
- **YES Verdict (`L477-497`):** Always paired with `verifyCarrierPolicy: true`, amber warning sign (`verdictLabel: 'YES — VERIFY CARRIER POLICY'`), prominent `carrierPolicyWarning` callout (`web/src/app.tsx:8130-8134`) stating many fleets disable PC completely, citation `FMCSA 2018 PC Guidance (83 FR 26377) · 49 CFR §395.8 / §395.28`, suggested ELD annotation, and ELD logging guidance text (`clockGuidance` — explicitly labeled *"not an engine calculation"*).

### Tree 3 — Yard Move (`49 CFR §395.28`)
- **Logic:** `web/src/legal.ts:500-567`.
- **Questions (3 taps total; any NO ends immediately):**
  1. `private_restricted` (`L507-525`): *"Is the location a private, restricted-access yard (gated/fenced, no public access)?"* — explicitly warns a public truck stop or fuel island is NOT yard move; NO ends immediately at `NO`.
  2. `off_public_roads` (`L527-545`): *"Will you stay completely inside that private yard — never entering a public road or highway?"* — NO ends immediately at `NO`.
- **YES Verdict (`L547-566`):** `YES`, `49 CFR §395.28 · FMCSA Yard Move Guidance`, prominent `standingReminder` (`web/src/app.tsx:8136-8140`): *"Yard Move is ON duty — it burns your 14-hr window and 70-hr (or 60-hr) cycle clocks, and only spares your 11-hr drive clock."*, suggested ELD annotation, and ELD logging guidance text (`clockGuidance` — explicitly labeled *"not an engine calculation"*).

### Tree 4 — 16-Hour Short-Haul "Big Day" (`49 CFR §395.1(o)`)
- **Logic:** `web/src/legal.ts:569-657`.
- **Questions (4 taps total; any NO ends immediately):**
  1. `prior_five` (`L576-594`): *"Have you returned to your home terminal on each of your last 5 duty tours?"* — NO ends immediately at `NO` (`49 CFR §395.1(o)(1)`).
  2. `once_per_7` (`L596-614`): *"Have you NOT used the 16-hour extension in the last 7 days (or since your last 34-hr reset)?"* — NO ends immediately at `NO` (`49 CFR §395.1(o)(3)`).
  3. `return_tonight` (`L616-634`): *"Will you return to the home terminal tonight?"* — NO ends immediately at `NO` (`49 CFR §395.1(o)(2)`).
- **YES Verdict (`L636-656` & `L717-749`):** `YES`, `49 CFR §395.1(o)`, standing reminder *"Window extends to 16 hours; the 11-hour drive limit does NOT expand."*, suggested ELD annotation, and live before/after engine clock preview (`previewKind: 'sixteen'`). If the driver's own log already has a 16-hour use within the prior 6 carrier days without a 34-hr restart (`preview.blockedByLog === true`), `evaluateLegalTree` (`L719-749`) reflects the engine's `§395.1(o)(3)` refusal directly as `NO — ALREADY USED IN LOG`.

### Card 5 — Safe Haven Myth-Buster (`49 CFR §397.5`)
- **Logic:** `getSafeHavenCard()` at `web/src/legal.ts:320-341`; reachable directly from the tool's home list (`LEGAL_HOME_ITEMS[4]` at `L61-67`, rendered at `web/src/app.tsx:8252-8283`).
- **Content:** `NO — EXPLOSIVES ONLY`, `49 CFR §397.5`, explicitly explains §397.5 applies ONLY to Class 1.1, 1.2, and 1.3 explosives and never extends HOS for general freight, paired with the standing advisory line.

---

## 3. Clock Preview Derivation from `evaluate()` (`web/src/legal.ts:186-316`)

Every preview number comes directly from `engine/src/index.ts` `evaluate(logged, { asOf: now, config })` on non-tentative logged segments (`input.segments.filter((s) => !s.tentative)`) with sanitized `safeRulesConfig(input.config)`:

1. **Before / After Engine Calls (`previewExceptionClock`, `L223-286`):**
   - Runs `evRaw = evaluate(logged, { asOf: now, config: cfg })`.
   - **Adverse (`kind === 'adverse'`, `L236-256`):** Checks `existingKey = evRaw.shift.exceptionKeys.adverse`.
     - `evBefore`: removes `existingKey` from `cfg.adverseShifts` if present (else `evRaw`).
     - `evAfter`: reuses `evRaw` if already active, else calls `evaluate(logged, { asOf: now, config: { ...cfg, adverseShifts: [...(cfg.adverseShifts ?? []), evBefore.shift.exceptionKey] } })`.
   - **16-Hour (`kind === 'sixteen'`, `L257-286`):** Checks `existingKey = evRaw.shift.exceptionKeys.sixteen`.
     - `evBefore`: removes `existingKey` from `cfg.sixteenHourShifts` if present (else `evRaw`).
     - `evAfter`: reuses `evRaw` if already active, else calls `evaluate(logged, { asOf: now, config: { ...cfg, sixteenHourShifts: [...(cfg.sixteenHourShifts ?? []), evBefore.shift.exceptionKey] } })`.
     - `blockedByLog = evAfter.shift.limits.window === evBefore.shift.limits.window` (surfaces the engine's `§395.1(o)(3)` eligibility check directly).
   - Never hand-computes a `+2h` delta and never double-adds if the exception is already toggled on in `Now → Exceptions`.
2. **Snapshot Fields (`snapshotOf`, `L186-215`):**
   - `mustStopBy = ev.mustStopBy` (exact field from `evaluate()`).
   - `driveNow = ev.driveNow`, `binding = ev.binding`.
   - `driveLimit = ev.shift.limits.drive`, `driveRemaining = ev.shift.driveRemaining`, `driveDeadline = ev.asOf + ev.shift.driveRemaining`.
   - `windowLimit = ev.shift.limits.window`, `windowUsed = ev.shift.windowUsed`, `windowRemaining = ev.shift.windowRemaining`, `windowEnd = ev.asOf + (ev.shift.limits.window - ev.shift.windowUsed)`.
   - `cycleLimit = ev.cycle.limit`, `cycleRemaining = ev.cycle.remaining`, `breakRemaining = ev.shift.breakRemaining`.
   - Wall-clock formatting (`fmtHM` / `fmtShort`, `L155-173`) uses `Intl.DateTimeFormat` pinned to `homeTimeZone`, making output DST-safe and completely host-TZ independent.
3. **PC & Yard Move Clock Notes (`L494-495, L563-564`):**
   - Rendered only as clearly labeled *"ELD logging guidance (not an engine calculation)"* boxes (`data-legal-clock-guidance="1"`), with `preview: null` and zero `data-legal-preview` block.

---

## 4. Pin List (`web/test/dom/legal.mjs`) & Fail-Before Evidence

| Pin | Line | What It Verifies |
| :--- | :--- | :--- |
| **`LG1`** | `L193` | Adverse Driving YES (`§395.1(b)(1)`), ELD annotation example, standing advisory line, and live before/after `mustStopBy` / `windowEnd` / `driveDeadline` asserted directly against `evaluate()`. |
| **`LG2`** | `L232` | Adverse Driving NO paths (`Q1=NO` before dispatch; `Q2=NO` foreseeable/rush hour/full lot) each end immediately at `NO` with `§395.1(b)(1)`, zero remaining questions, and advisory line. |
| **`LG3`** | `L254` | Personal Conveyance YES paired with prominent `VERIFY CARRIER POLICY` verdict & warning box, `FMCSA 2018 PC Guidance` citation, ELD annotation, guidance-text clock note (`preview === null`), advisory line. |
| **`LG4`** | `L281` | Personal Conveyance NO paths (`Q1=NO` not ordered off; `Q2=NO` advancing load / bypassing parking) each end immediately at `NO` with advisory line. |
| **`LG5`** | `L301` | Yard Move YES (`§395.28`), standing reminder that Yard Move is ON duty (burns 14-hr & 70-hr, only spares 11-hr drive), ELD annotation, guidance-text clock note (`preview === null`), advisory line. |
| **`LG6`** | `L325` | Yard Move NO paths (`Q1=NO` public truck stop/fuel island; `Q2=NO` public road) each end immediately at `NO` with `§395.28` and advisory line. |
| **`LG7`** | `L345` | 16-Hour Short-Haul YES (`§395.1(o)`), explicit reminder that 11-hr drive limit does NOT expand, live preview `windowEnd` extends while `driveDeadline` does NOT move (asserted directly against `evaluate()`), plus `§395.1(o)(3)` log-blocked refusal check. |
| **`LG8`** | `L410` | 16-Hour Short-Haul NO paths (`Q1=NO` 5 tours → `§395.1(o)(1)`; `Q2=NO` used in 7d → `§395.1(o)(3)`; `Q3=NO` not returning tonight → `§395.1(o)(2)`) each end immediately at `NO` with advisory line. |
| **`LG9`** | `L435` | Safe Haven static myth-buster card reachable from tool home (`49 CFR §397.5`, Class 1.1–1.3 explosives only, never general freight), advisory line on home & card, Plan hub 10th-item placement, Back navigation, zero `<input type="time">`, zero new `localStorage` keys. |
| **`LG10`** | `L482` | Engine preview honesty across drive-bound (`16h` extends window while `mustStopBy` and `driveDeadline` do not move), tight 70-hr cycle-bound, and already-active adverse (no double-add) — all asserted directly against `evaluate()`. |

### Fail-Before Evidence (Stub Swap-Test of `web/src/legal.ts`)

Replacing `web/src/legal.ts` with a minimal stub exporting placeholder values and running `dist-test/dom-legal-stub.mjs` fails **all 10 pins (`0/10`, `STUB_EXIT=1`)**:

```text
FAIL  LG1. Adverse Driving YES: §395.1(b)(1), ELD annotation, advisory line, and live must-stop matches evaluate() directly
      {"result":"YES","cite":"stub","annotation":"","advOk":false,"preview":null,"wantBase":29906640,"wantAdv":29906760,"wantAdvWinEnd":29906760,"wantAdvDrvEnd":29906940}
FAIL  LG2. Adverse Driving NO paths: Q1=NO (before dispatch) and Q2=NO (foreseeable/rush hour/full lot) end immediately at NO
      threw: TypeError: Cannot read properties of undefined (reading 'listeners')
FAIL  LG3. Personal Conveyance YES: always paired with prominent VERIFY CARRIER POLICY warning, FMCSA 2018 PC cite, guidance clock note, advisory line
      {"result":"YES","verifyCarrier":false,"carrierWarn":"","cite":"stub","annotation":"","guidance":"","hasPreview":false,"advOk":false}
FAIL  LG4. Personal Conveyance NO paths: Q1=NO and Q2=NO (advancing load / bypassing parking) end immediately at NO
      threw: TypeError: Cannot read properties of undefined (reading 'listeners')
FAIL  LG5. Yard Move YES: §395.28, standing reminder that YM is ON duty (burns 14-hr & 70-hr, spares 11-hr drive), guidance clock note, advisory line
      {"result":"YES","cite":"stub","reminder":"","annotation":"","guidance":"","advOk":false}
FAIL  LG6. Yard Move NO paths: Q1=NO (public truck stop / fuel island) and Q2=NO (public road) end immediately at NO
      threw: TypeError: Cannot read properties of undefined (reading 'listeners')
FAIL  LG7. 16-Hour Short-Haul YES: §395.1(o), states 11-hr drive does NOT expand, preview windowEnd extends while driveDeadline does NOT move (vs evaluate()), plus §395.1(o)(3) log block
      threw: Error: missing answer button yes
FAIL  LG8. 16-Hour Short-Haul NO paths: Q1=NO (5 tours), Q2=NO (used in 7d), Q3=NO (not returning tonight) each end immediately at NO
      threw: TypeError: Cannot read properties of undefined (reading 'listeners')
FAIL  LG9. Safe Haven (§397.5 explosives-only) static card from tool home, advisory line on home & card, Plan hub 10th item, zero <input type="time">, zero new storage keys
      {"homeAdvOk":false,"timeInputsHome":0,"timeInputsSh":0,"vSh":{"tree":"safehaven","result":"YES","cite":"stub","advOk":false},"closedClean":true,"extraKeys":[]}
FAIL  LG10. Engine preview honesty: direct evaluate() parity on drive-bound (16h does not move mustStopBy), cycle-bound, and already-active adverse (no double-add)
      {"okAdvB":false,"ok16B":false,"okNoDouble":false,"okCyc":false,"p16BNote":null,"pAdvCNote":null}

0/10 legal pins passed
STUB_EXIT=1
```

### Pass-After Output (Both `TZ=America/Chicago` and `TZ=UTC`)

```text
PASS  LG1. Adverse Driving YES: §395.1(b)(1), ELD annotation, advisory line, and live must-stop matches evaluate() directly
PASS  LG2. Adverse Driving NO paths: Q1=NO (before dispatch) and Q2=NO (foreseeable/rush hour/full lot) end immediately at NO
PASS  LG3. Personal Conveyance YES: always paired with prominent VERIFY CARRIER POLICY warning, FMCSA 2018 PC cite, guidance clock note, advisory line
PASS  LG4. Personal Conveyance NO paths: Q1=NO and Q2=NO (advancing load / bypassing parking) end immediately at NO
PASS  LG5. Yard Move YES: §395.28, standing reminder that YM is ON duty (burns 14-hr & 70-hr, spares 11-hr drive), guidance clock note, advisory line
PASS  LG6. Yard Move NO paths: Q1=NO (public truck stop / fuel island) and Q2=NO (public road) end immediately at NO
PASS  LG7. 16-Hour Short-Haul YES: §395.1(o), states 11-hr drive does NOT expand, preview windowEnd extends while driveDeadline does NOT move (vs evaluate()), plus §395.1(o)(3) log block
PASS  LG8. 16-Hour Short-Haul NO paths: Q1=NO (5 tours), Q2=NO (used in 7d), Q3=NO (not returning tonight) each end immediately at NO
PASS  LG9. Safe Haven (§397.5 explosives-only) static card from tool home, advisory line on home & card, Plan hub 10th item, zero <input type="time">, zero new storage keys
PASS  LG10. Engine preview honesty: direct evaluate() parity on drive-bound (16h does not move mustStopBy), cycle-bound, and already-active adverse (no double-add)

10/10 legal pins passed
```

---

## 5. Per-Suite Verification Results (Sequential Runs, Both Timezones)

| Suite | `TZ=America/Chicago` | `TZ=UTC` | Notes |
| :--- | :--- | :--- | :--- |
| **Web Build (`cd web && npm run build`)** | **PASS** (`tsc --noEmit` 0 err, `dist/app.js 479.4kb`) | — | Built after final edits |
| **Engine (`cd engine && npm test`)** | **PASS** (**108/108**) | **PASS** (**108/108**) | 0 failures in both TZs |
| **Full Smoke + DOM (`cd web && npm run smoke`)** | **PASS** (exit 0) | **PASS** (exit 0) | Runs `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle` (pass 1+2), `smoke.mjs` (incl. `can i legally use it` SSR/engine check), plus all 13 DOM lanes below: |
| ↳ `dom/yesback.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c1flush.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/adjuststart.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/scrub.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/c3.mjs` | **PASS** | **PASS** | via `npm run smoke` (incl. 10-item Plan hub `D10a`) |
| ↳ `dom/c3relaunch.mjs` | **PASS** | **PASS** | via `npm run smoke` |
| ↳ `dom/logedit.mjs` | **PASS** (**37/37**) | **PASS** (**37/37**) | via `npm run smoke` (incl. `F3` zero new storage keys) |
| ↳ `dom/cascade.mjs` | **PASS** (**16/16**) | **PASS** (**16/16**) | via `npm run smoke` |
| ↳ `dom/rescue.mjs` | **PASS** (**11/11**) | **PASS** (**11/11**) | via `npm run smoke` |
| ↳ `dom/stack.mjs` | **PASS** (**15/15**) | **PASS** (**15/15**) | via `npm run smoke` |
| ↳ `dom/motel.mjs` | **PASS** (**13/13**) | **PASS** (**13/13**) | via `npm run smoke` |
| ↳ `dom/legal.mjs` | **PASS** (**10/10**) | **PASS** (**10/10**) | `LG1`–`LG10`, standalone & via `npm run smoke` |
| ↳ `dom/carrierday.mjs` | **PASS** (**9/9**) | **PASS** (**9/9**) | via `npm run smoke` |
| **`dom/revisions.mjs`** | **PASS** (**89/89**) | 88/89 (known pre-existing `W2` host-TZ seed per `HANDOFF-MOTEL.md` / `HANDOFF-MOTELFIX2.md`) | All Plan-hub & room-dissolve pins (`W1`, `W4`, `R1`, `R5`, `P1`–`P4` incl. `'legal'`) **PASS** in both TZs |
| **`dom/gemini.mjs`** | **PASS** (**20/20**) | **PASS** (**20/20**) | Clean in both TZs |
| **`dom/auditfix.mjs`, `dom/polish.mjs`, `dom/layout.mjs`** | Not runnable in sandbox (`playwright-core not found under /home/lae/.hermes/hermes-agent`) | — | Real-browser Playwright harness lives outside the workspace sandbox (same as `HANDOFF-MOTELFIX2.md` §3). `polish.mjs` updated with `sweep('plan-10', [tab('Plan'), planItem(9)])`; `c3browser.mjs` updated for 10-item Plan hub; CSS uses verified AA day/night tokens (`contrast.mjs` 44/44 day + 44/44 night) and `>= 12px` font-size floor (`smoke.mjs` patch 16 pin passed). |

---

## 6. Files Added / Modified in `work-legal`

- **New:** `web/src/legal.ts` (`894a8bb13f3c94c08471fe3776e3612c221cf99b`, 767 lines) — Pure decision trees (Adverse, PC, Yard Move, 16-Hour), Safe Haven static card, `LEGAL_ADVISORY_LINE`, and engine-backed `previewExceptionClock()`.
- **New:** `web/test/dom/legal.mjs` (544 lines) — Dedicated `LG1`–`LG10` pin suite.
- **Modified:** `web/src/app.tsx` (`217043e09d164fe9f23db2c3f0d56492ae40dbe7`) — Added `LegalTab`, `openLegalPlanner`/`isLegalPlannerOpen`/`useLegalPlanner`, `I.legal`, 10th `.plan-item` at bottom of `PlanTab`, and `plan-room`/`backNav` wiring.
- **Modified:** `web/src/backnav.ts` (`75179b75466bbede6ad395258a372182540898a7`) — Added `'legal'` to `PLAN_SCREENS`.
- **Modified:** `web/public/styles.css` (`a14099b05deb5564831bf96d201c852a08e48a05`) — Added `.legal-*` styles (`L1523-1560`).
- **Modified:** `web/package.json` — Added `test/dom/legal.mjs` to `npm run dom` (and therefore `npm run smoke`).
- **Modified (Plan-hub 9→10 re-aim & planner reset):** `web/test/smoke.mjs`, `web/test/dom/c3.mjs`, `web/test/dom/c3browser.mjs`, `web/test/dom/carrierday.mjs`, `web/test/dom/rescue.mjs`, `web/test/dom/stack.mjs`, `web/test/dom/motel.mjs`, `web/test/dom/revisions.mjs`, `web/test/dom/polish.mjs`.
- **New:** `HANDOFF-LEGAL.md` — This handoff.
