# Handoff — Clock 14 `receptionfix` (`work-receptionfix`)

**Tree:** `~/hos-build/work-receptionfix` (copied from `work-splashart`, the current live tree)  
**Scope:** Four reception-research fixes — Scope 1 (Stay-unlocked, Option B), Scope 2 (ELD screenshot refresh front door + staleness chip + stateless-planning audit across all 12 Plan tools + My Week), Scope 3 (Trust optics + zero-account bug report email + US scope line), Scope 4 (Persistent storage request + 30-day backup nudge + one-time iOS Safari warning).  
**Status:** Built (`dist/app.js` 673.6 KB), engine hash byte-identical, and **all suites green** sequentially in the foreground with zero failures and zero flakes. **Not deployed, not pushed.**

---

## 1. Hard Invariants Verified

- **`engine/` byte-identical:**
  ```
  find engine -type f -not -path '*/node_modules*' -not -path '*/dist*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` exactly.
- **localStorage keys unchanged:** Only `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, and `hos-sandbox-undo-v1` are read or written.
- **Additive-only persisted schema:** Every new field is optional inside existing envelopes; absent fields reproduce prior behavior identically with zero data loss:
  - Inside `__drivers` (`DriverVault` in `hos-sandbox-v1`): `stayUnlocked?: boolean`, `iosInstallNoteDismissed?: boolean`.
  - Inside per-driver `State`: `lastEldCheckAt?: number | null`, `lastExportAt?: number | null`, `exportNudgeDismissedAt?: number | null`, `iosInstallNoteDismissed?: boolean`.
- **Time-of-day entry:** Shared `ClockPick` untouched and still used for every time-of-day entry.
- **Legal disclaimer verbatim:** `CLOCK14_DISCLAIMER_TEXT` is untouched.
- **Out-of-scope untouched:** Zero monetization/paywall, zero ELD file import, zero registration-step/cooldown/recovery/salt changes, zero native wrapper work.

---

## 2. Changes Per Scope Item (`file:line`)

### Scope 1 — Stay-unlocked (Option B, items 1–8)
1. **Additive `stayUnlocked` flag (`web/src/store.ts:632,722,796-864`):** Stored as optional `stayUnlocked?: boolean` on `DriverVault` inside `__drivers`. Absent/false preserves prior locked-on-launch behavior. Exported helpers: `STAY_UNLOCKED_SPLASH_MS` (`420`), `getStayUnlocked()`, `isStayUnlockedEffective()`, `getPendingAutoUnlockId()`, `completeAutoUnlock()`, `setStayUnlocked(driverId, enable, pin?)`.
2. **Solo-driver cold launch (`web/src/store.ts:799-821,852-864`, `web/src/app.tsx:12505-12541`, `web/src/driver-ui.tsx:244-260,554-576`):** When `stayUnlocked === true` and `vault.order.length === 1`, cold launch computes `pendingAutoUnlockId`, renders the splash artwork briefly (`420ms`, or `20ms` under `prefers-reduced-motion: reduce`; tapping enters immediately) with that driver auto-selected (`data-splash-auto="1"`), then calls `completeAutoUnlock()` to land unlocked without picker tap or PIN.
3. **Multi-driver behavior & 2nd-driver notice (`web/src/store.ts:799-801`, `web/src/driver-ui.tsx:528-540,653-657,745-749,1054-1056`):** When 2+ drivers exist, `computePendingAutoUnlock` returns `null` so picker + PIN gate normally. Registering a 2nd+ driver while `stayUnlocked` is on displays `"Stay unlocked turns off while more than one driver is on this phone."` (`data-stay-unlocked-multi-notice="1"`) on registration Step 1 and Step 4; Driver Settings also shows the notice while 2+ drivers are registered.
4. **PIN-gated enable / no-PIN disable (`web/src/store.ts:1111,1152-1187,1199-1237`, `web/src/driver-ui.tsx:518-520,730-749,925-1087`):**
   - **End of registration (Step 4, after recovery questions):** Optional checkbox (`data-reg-stay-unlocked="1"`, default OFF) shown when registering a solo driver, with copy: *"Stay unlocked on this phone? You'll skip the PIN when you open Clock 14. Anyone holding this phone can open your clocks. You can change this in Settings."*
   - **Driver Settings card:** Stay-unlocked toggle (`data-stay-unlocked-toggle="1"`). Turning ON opens an inline PIN form (`data-stay-unlocked-form="1"`) calling `setStayUnlocked(driverId, true, pin)` (verifies hashed PIN with escalating cooldown). Turning OFF calls `setStayUnlocked(driverId, false)` with no PIN.
5. **PIN preserved for sensitive driver actions:** Registration still requires creating and confirming a 4-digit PIN; changing PIN, updating recovery questions, and erasing a driver remain PIN-gated via `verifyPin` regardless of `stayUnlocked`.
6. **Home-screen shortcuts (`web/src/app.tsx:12505-12550,12747-12767`):** `?go=load`, `?go=stopped`, `?go=recap` honor the exact same rule — solo `stayUnlocked` lands straight on the shortcut target after the brief splash beat; otherwise gates at splash until unlocked.
7. **drivers1fix invariants preserved:** Per-secret salted PIN/recovery hashes, escalating cooldown, Forgot-PIN recovery, `syncActiveUndoRaw`, `simRaw` edge-stash quarantine, and corrupt/partial vault recovery paths are untouched (re-verified by `DR1`–`DR11` and `DRR1`–`DRR6`).
8. **True two-process cold-relaunch pins (`web/test/dom/drivers-relaunch.mjs:438-649`):** Added `DRR7`–`DRR12` (6 new two-process relaunch pins; suite now **12/12**) plus `DR12` (`web/test/dom/drivers.mjs:620-690`).

### Scope 2 — ELD refresh front door + staleness + stateless-planning audit (items 9–11)
9. **Prominent `"Refresh from ELD screenshot"` CTA (`web/src/app.tsx:2716-2735,2878-2925`, `web/public/styles.css`):** Added `button.eld-shot-cta` (`data-eld-screenshot-btn="1"`) on the Now screen visible in **both** fresh and active states. Launches the existing `QuickStartSheet` in `mode: 'screenshot'` (`eldocr` flow directly — zero OCR rebuild).
10. **Additive `lastEldCheckAt` + Now staleness chip (`web/src/store.ts:179,360,582,1406,2644`, `web/src/app.tsx:419-434,2701-2715,3252,3796,12249`):**
    - Stamped with epoch-minute `now` on `applyEldSeed` (OCR/manual seed), `DriftSheet.compare()`, and `addDriftFill()`. Preserved in `SimSnap` and cleared on `eraseAll`.
    - `eldStalenessInfo(lastEldCheckAt, now)` with `ELD_STALE_MINUTES = 240`:
      - Never checked → `"Not checked against your ELD yet — tap to check"`
      - `>= 4h` → `"Checked against your ELD <N>h ago — tap to check"` (or `<N>d ago`)
      - `< 4h` → quiet subtle `"ELD-checked <N>h ago"` (or `"ELD-checked just now"` / `<N>m ago`)
    - Tapping the chip (`data-eld-staleness`) opens the existing `DriftSheet`.
11. **Stateless-planning audit (`web/src/app.tsx:484-594`, wired across 11 tools):** Built shared collapsible `<InlineClockOverride>` (session-only, collapsed by default with zero extra `<input>`s until opened, runs `synthesizeEldSeed` in memory, never mutates the live log, one-tap `"Use my live log"` reset). See Section 3 for the complete 13-tool audit table.

### Scope 3 — Trust optics + support (items 12–15)
12. **Planning worksheet PDF rename & filename (`web/src/app.tsx:11720-11735,11854-11948,12680-12702`):**
    - Renamed everywhere to `"Planning worksheet (PDF)"` (Log export card, sheet header, print button).
    - `PDF_DISCLAIMER = 'PERSONAL HOS PLANNING WORKSHEET — NOT A LEGAL RODS / NOT AN ELD'` rendered in both `.pr-disclaimer` header banner and `.pr-foot-disclaimer` footer.
    - `worksheetFilename(driverName, generatedAtMs)` generates `clock14-worksheet-<driver>-<YYYYMMDD>.pdf`; stamped on `<article data-worksheet-filename=...>` + metadata row and applied to `document.title` around `window.print()` (restored via `afterprint` + timeout) so browser Save-as-PDF suggests that filename.
13. **Log screen scratchpad note (`web/src/app.tsx:3938`):** Added `<p class="muted small log-scratchpad-note" data-log-scratchpad="1">Planning scratchpad — your ELD is the record.</p>` directly under `.daynav` header. Legal disclaimer text untouched.
14. **Zero-account bug report email (`web/src/app.tsx:391-413,12147-12156`):** Added `"Email a bug report"` (`data-bug-email="1"`) **above** the existing GitHub link in Settings → Bug reports. Uses `mailto:lorico.estrellado@gmail.com?subject=Clock%2014%20bug%20report&body=...` pre-filled with build stamp (`__BUILD__`), theme (`s.theme`), and a one-line clock summary (`Current: <status> | Drive <x> · 14-hr <x> · Break <x> · 70-hr <x>`).
15. **US scope line (`web/src/app.tsx:12181`):** Added `<p class="small" data-scope-line="1">Clock 14 covers US interstate property-carrying rules (49 CFR 395). No Canada, oilfield, or passenger-carrying rules.</p>` in Settings → About below the verbatim legal disclaimer.

### Scope 4 — Data safety (items 16–18)
16. **Silent persistent storage request (`web/src/app.tsx:450-463,12504`, `web/src/main.tsx:2,8`):** Calls `navigator.storage.persist()` once at boot when supported; catches silently, logs nothing user-visible, no-op where unsupported.
17. **30-day backup nudge (`web/src/store.ts:181,183,360,583-584`, `web/src/app.tsx:436-447,11710,12158-12167`):** `downloadExport()` stamps `lastExportAt` (epoch minutes). When the driver has data (`segments.length > 0 || tentative.length > 0 || current !== null`) and no export within 30 days (`43200` min) and not dismissed within the current 30-day window (`exportNudgeDismissedAt`), Settings → Data shows `"Back up your clocks — save a copy somewhere safe."` with Export + Dismiss buttons (`data-backup-nudge="1"`).
18. **One-time iOS Safari non-standalone warning (`web/src/store.ts:185,360,585,634,723,865-877`, `web/src/app.tsx:465-481,2709-2716`):** `isIosSafariNonStandalone()` detects iOS Safari outside standalone/home-screen mode (excluding CriOS/FxiOS/EdgiOS/OPiOS/DuckDuckGo). Shows dismissible note on Now (`data-ios-install-note="1"`): `"Add Clock 14 to your Home Screen — Safari can erase web-app data after about a week."` Dismissal persisted additively on both `DriverVault` and `State` so it shows at most once.

---

## 3. Stateless-Planning Audit Table (Scope 2, Item 11)

Audited all **12 Plan hub tools + My Week** (13 tools total) for whether a driver with an empty or stale log can get an accurate answer from quick inline clock overrides without editing or seeding their live log:

| # | Horizon | Tool (UI Label & Component) | Before `receptionfix` | Fix Applied / Status |
|---:|---|---|---|---|
| 1 | Capstone | **My Week** (`MyWeekTab`) | Quietly evaluated live `s.segments` + `s.current` with no inline clock override (`ev` + 7-day cycle budget came strictly from live log). | **Fixed** — wired `<InlineClockOverride toolId="myweek">` feeding `effState` + `effEv` into `planMyWeek()` and header readouts. Live log untouched. |
| 2 | Right now | **Can I Legally Use It?** (`LegalTab`) | Stateless 5-exception legal Q&A decision tree (Adverse, PC, Yard Move, 16-hr Big Day, Safe Haven); does not depend on live clocks. | **Fine as-is** — purely stateless rule check; no override needed. |
| 3 | Right now | **Split-sleeper rescue** (`RescueTab`) | Evaluated `s.segments` + `s.current` directly when opened standalone (no inline clock override). | **Fixed** — wired `<InlineClockOverride toolId="rescue">` when not chained from Stack (`!prefill?.chainedPriorSegments?.length`), feeding `effState` into rescue planner. |
| 4 | Right now | **Do I Make It Back or Motel?** (`MotelTab`) | Evaluated live log clocks directly with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="motel">` feeding `effState` into `planMotel()`. |
| 5 | This load | **Can I take this load?** (`LoadTab`) | Evaluated live log via `canMakeLoad(s, ...)` with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="load">` feeding `effState` + `effEv` into `canMakeLoad()` and clock hints. |
| 6 | This load | **When to roll & PTA** (`RolloutTab`) | Evaluated live log clocks directly when opened standalone with no inline override. | **Fixed** — wired `<InlineClockOverride toolId="rollout">` when not chained from Stack (`!prefill?.chainedPriorSegments?.length`), feeding `effState` into `planRollout()`. |
| 7 | This load | **Plan a run** (`TripTab`) | Evaluated live log via `planTrip(s, ...)` with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="trip">` feeding `effState` into `planTrip()`. |
| 8 | This load | **Stack my stops & loads** (`StackTab`) | Evaluated live log clocks directly with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="stack">` feeding `effState` into `planStack()`. |
| 9 | This shift | **Plan a sleeper split** (`SplitTab`) | Evaluated live log directly via `simulateSplit()` with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="split">` feeding `effState` + `effEv` into split simulation & preview. |
| 10 | This shift | **Flip My Clock** (`FlipTab`) | Evaluated live log directly via `planFlip()` with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="flip">` feeding `effState` into `planFlip()`. |
| 11 | This week | **Hours coming back** (`RecapTab`) | Already provides inline per-day `"Set"` hour editors for all 8 rolling cycle days directly on the screen. | **Fine as-is** — already supports direct inline per-day entry without relying on a complete live log. |
| 12 | This week | **Weekly recap vs. 34** (`WeekRecapTab`) | Evaluated live log directly via `planWeek()` with no inline clock override. | **Fixed** — wired `<InlineClockOverride toolId="week">` feeding `effState` into `planWeek()`. |
| 13 | This week | **Miles Left in My 70** (`MilesTab`) | Evaluated live log directly with no inline clock override AND had no `hist !== 'known'` incomplete-history notice. | **Fixed** — wired `<InlineClockOverride toolId="miles">` feeding `effState` into `planMiles()`, and added the missing `hist !== 'known'` notice when live history is incomplete. |

---

## 4. Test Suite Results & Pin Counts (All Sequential, Foreground)

Every required suite ran sequentially in the foreground on the final tree and passed with **zero failures and zero flakes**:

| # | Suite | Command | Result / Pin Counts |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 673.6kb) |
| 2 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** — `typecheck` OK, `contrast` 44/44×3, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` PASS, and all 18 DOM suites PASS: `yesback`, `c1flush`, `adjuststart`, `scrub`, `c3` (46/46), `c3relaunch` (3/3), `logedit` (37/37), `cascade` (16/16), `rescue`, `stack` (15/15), `motel` (13/13), `legal` (15/15), `flip` (12/12), `miles` (11/11), `carrierday` (9/9), `myweek` (19/19), **`drivers` 14/14** (was 11/11 → **+3 pins**), **`drivers-relaunch` 12/12** (was 6/6 → **+6 two-process pins**) |
| 3 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** — identical full pass across all sub-suites (`drivers` 14/14, `drivers-relaunch` 12/12, `myweek` 19/19) |
| 4 | **revisions** | `esbuild test/dom/revisions.mjs ... && node dist-test/dom-revisions.mjs` | **89 / 89 PASS** (P1–P3 updated to assert `"Planning worksheet (PDF)"` + new disclaimer) |
| 5 | **gemini** | `esbuild test/dom/gemini.mjs ... && node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 6 | **auditfix** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`) |
| 7 | **polish** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run polish` | **295 pass, 0 fail** (`POLISH OK`) |
| 8 | **layout** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run layout` | **421 pass, 0 fail** (`LAYOUT OK`, zero flakes) |

### New Pins Added
- **`web/test/dom/drivers-relaunch.mjs` (`DRR7`–`DRR12`, +6 TRUE two-process cold-relaunch pins, total 12/12):**
  - `DRR7`: `stayUnlocked` + 1 driver cold relaunch lands unlocked without picker tap or PIN.
  - `DRR8`: Enabling `stayUnlocked` without a valid PIN fails (`ok: false`), and cold relaunch stays gated.
  - `DRR9`: Adding a 2nd driver while `stayUnlocked` is ON restores picker + PIN gating on next cold relaunch.
  - `DRR10`: Home-screen shortcuts (`?go=load`, `?go=stopped`) land straight on target when `stayUnlocked` single-driver applies.
  - `DRR11`: Home-screen shortcut (`?go=load`) stays gated at splash when `stayUnlocked` is OFF or 2 drivers exist.
  - `DRR12`: Legacy save with no `stayUnlocked` field gates identically to prior behavior.
- **`web/test/dom/drivers.mjs` (`DR12`–`DR14`, +3 DOM pins, total 14/14):**
  - `DR12`: Scope 1 UI & PIN gating — Step 4 stay-unlocked opt-in (default OFF), multi-driver notice on 2nd-driver registration, Settings PIN-gated enable vs no-PIN disable, and PIN still required for Change PIN / Recovery / Erase.
  - `DR13`: Scope 2 — `"Refresh from ELD screenshot"` CTA visible in both fresh & active Now states launching `QuickStartSheet` in screenshot mode; staleness chip transitions (`never` → `<4h` quiet → `>=4h` stale → tapping opens `DriftSheet`); `<InlineClockOverride>` session-only clock override on Plan tools without mutating live log.
  - `DR14`: Scopes 3 & 4 — `"Planning worksheet (PDF)"` label/disclaimer/`clock14-worksheet-<driver>-<YYYYMMDD>.pdf` filename, Log scratchpad line + verbatim `CLOCK14_DISCLAIMER_TEXT`, `mailto:lorico.estrellado@gmail.com` bug report link above GitHub with build/theme/4-clock summary, US 49 CFR 395 scope line, silent `navigator.storage.persist()` boot call, 30-day backup nudge + dismiss + export refresh, and one-time dismissible iOS Safari warning.

### Existing Test Expectations Updated (Renamed Copy Only)
- `web/test/smoke.mjs`: Updated `"Log summary (PDF)"` assertions to `"Planning worksheet (PDF)"` and `qsDoneSrc` slice marker to `focusKey="qs-form"`.
- `web/test/dom/revisions.mjs`: Updated P1–P3 PDF button label & disclaimer assertions to `"Planning worksheet (PDF)"` and `"PERSONAL HOS PLANNING WORKSHEET — NOT A LEGAL RODS / NOT AN ELD"`.
- `web/test/dom/layout.mjs`: Updated PDF export button locator text to `"Planning worksheet (PDF)"`.

---

## 5. Decisions / Judgment Calls Flagged for Opus

1. **Stay-unlocked opt-in placement during registration (Item 4a):** Placed the default-OFF `"Stay unlocked on this phone?"` checkbox on Step 4 (`recovery`) below the recovery questions card, rather than adding a Step 5. This preserves the exact 4-step registration flow (`name → disclosure → PIN → confirm → recovery`) mandated by Scope 1.
2. **`stayUnlocked` persistence across 2nd-driver add & removal (Items 2–3):** `stayUnlocked` remains stored on `DriverVault` when a 2nd driver is added, while `computePendingAutoUnlock` requires `vault.order.length === 1` — matching *"Stay unlocked turns off while more than one driver is on this phone."* If the 2nd driver is later removed leaving 1 driver, the setting can apply again; if the *last* driver is removed (`order.length === 0`), `stayUnlocked` is deleted.
3. **Manual `"Switch driver"` while `stayUnlocked` is ON:** `lockDriverSession()` explicitly clears `pendingAutoUnlockId` so a solo driver with `stayUnlocked` enabled can still open the splash picker to add a 2nd driver without immediately bouncing back inside.
4. **Splash artwork beat duration (Item 2):** `STAY_UNLOCKED_SPLASH_MS = 420` (`20ms` under `prefers-reduced-motion: reduce`; tapping the auto-selected tile enters immediately). Long enough to preserve the splash artwork moment, short enough not to feel sluggish.
5. **"Adding a driver" PIN requirement (Item 5):** Registering a new driver still always requires creating and confirming a 4-digit PIN (never bypassed by `stayUnlocked`), and Driver Settings actions (change PIN, change recovery questions, erase driver) still verify the active driver's current PIN. Adding a 2nd driver from the splash picker does **not** prompt for Driver 1's PIN because adding a 2nd driver tightens security (disables stay-unlocked) and existing multi-driver tests expect `picker → Add a driver → Step 1`.
6. **PDF filename mechanism (Item 12):** Because browser print-to-PDF uses `document.title` as the default Save-as-PDF filename, `AppShell` temporarily sets `document.title` to `clock14-worksheet-<driver>-<YYYYMMDD>` around `window.print()` (restoring on `afterprint` + timeout), and also exposes `data-worksheet-filename="clock14-worksheet-<driver>-<YYYYMMDD>.pdf"` and a `"Worksheet file"` metadata row in the printable header.
7. **Staleness chip `< 4h` presentation (Item 10):** Used the subtle quiet `"ELD-checked <N>h ago"` chip (still clickable to run a drift check) rather than hiding the chip completely, so drivers get quiet confirmation their clocks were recently verified.
8. **Timestamp units for `lastEldCheckAt`, `lastExportAt`, `exportNudgeDismissedAt` (Items 10 & 17):** Stored as epoch minutes (matching `seededAt` and `now` across `store.ts`) so simulated-clock testing and 4-hour / 30-day window arithmetic stay deterministic and unit-consistent.
9. **iOS warning placement & storage (Item 18):** Rendered at the top of Now (`data-ios-install-note="1"`) when `isIosSafariNonStandalone()` is true; dismissal is stored on both `DriverVault` and `State` so dismissing once holds across driver switches and relaunches.
10. **Inline override UX on Plan tools (Item 11):** `<InlineClockOverride>` renders collapsed by default (zero extra form inputs until expanded) and runs `synthesizeEldSeed` strictly in component state so drivers can run quick what-if checks on a stale/empty log without mutating or polluting their saved log.
