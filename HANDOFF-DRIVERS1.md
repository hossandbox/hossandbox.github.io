# HANDOFF — Clock 14 `drivers1`: Multi-Driver Startup, Registration, PIN & Isolation

**Workspace:** `/home/lae/hos-build/work-drivers1` (built strictly inside `work-drivers1`; copied from LIVE `work-navy1`)  
**Date:** 2026-11-26  
**Status:** Built and verified across all required lanes. **Not pushed or deployed.**

---

## 1. What Was Built

Clock 14 now supports multiple drivers sharing one phone with strict profile separation, a mandatory startup splash & driver picker on every launch, mandatory disclosure acceptance during new-driver registration, salted/hashed 4-digit PIN protection, reminder-question PIN recovery, mid-session switching, driver-named exports, and zero-data-loss automatic migration for existing single-driver phones.

### New Files
- **`web/src/drivers.ts`** — Pure-JS FIPS 180-4 SHA-256 with per-secret random 16-byte hex salts, 2,048-round key stretching (`alg: "sha256-2048"`), constant-time hex comparison, normalized recovery-answer verification, curated truck-driver reminder questions (`REMINDER_QUESTIONS`, 8 choices, minimum 2 distinct questions required), driver-name sanitization, monogram initials, and export-filename slugging.
- **`web/src/driver-ui.tsx`** — Preact UI components for:
  - `StartupSplash`: full-viewport startup splash (fading-in full-size `./icon-512.png` logo, `"Clock 14"`, registered drivers list, `"Add a driver"`), PIN entry screen with custom 3×4 tactile keypad + physical keyboard support, Forgot-PIN recovery flow, 4-step new-driver registration wizard with mandatory disclosure popup (`DisclosureModal`), and guided legacy-upgrade setup wizard.
  - `PinKeypad`: 4-dot indicator with mismatch/wrong-PIN horizontal shake animation and large thumb-friendly numeric keys.
  - `ActiveDriverStrip`: compact 48px one-tap active-driver identity & switch bar at the top of `Now`.
  - `DriverSettingsCard`: top card in Settings (`Switch driver`, `Change PIN`, `Rename driver`, `Update recovery questions`, `Remove this driver`).
  - `CLOCK14_DISCLAIMER_TEXT`: single verbatim disclaimer string shared by registration disclosure, standalone `DisclaimerDialog`, and `Settings → About`.
- **`web/test/dom/drivers.mjs`** — Dedicated DOM pin lane (`DR1`–`DR8`) wired into `npm run dom`, running with the startup splash gate active (`driverGateBypassForTest = false`) the entire time.
- **`web/test/dom/driver-test-seed.mjs`** — Shared Playwright helper for real-browser suites (`lebrowser`, `polish`, `layout`, `auditfix`) that wraps test seeds into valid salted/hashed `drivers1` vaults (PIN `1234`) and unlocks through the real splash UI + on-screen PIN keypad.

### Modified Files
- **`web/src/store.ts`** — Added per-driver `DriverVault` management (`__drivers` envelope inside `hos-sandbox-v1`), automatic legacy single-driver migration on boot, in-memory-only `unlockedDriverId` gate (guarantees splash on every launch), `lockDriverSession`, `unlockDriverWithPin`, `registerDriver`, `completeLegacyDriverSetup`, `checkDriverRecoveryAnswers`, `resetDriverPinWithRecovery`, `changeDriverPin`, `renameDriver`, `updateDriverRecovery`, `removeDriverProfile`, `reloadVaultFromStorage`, `registerSessionHooks`, and `exportState` carrying `driverName`.
- **`web/src/app.tsx`** — Split `App()` into a thin splash-gated outer shell + keyed `<AppShell key={drv.unlockedId ?? 'harness'} />` (guaranteeing complete component-tree teardown/remount across driver switches so no local React/Preact state can bleed between drivers). Wired per-driver `UNDO_KEY` and `SIM_KEY` swap hooks, held `?go=` home-screen shortcuts safely behind the PIN gate until unlock, added `ActiveDriverStrip` on Now, active-driver pill in `.settings-head`, `DriverSettingsCard` at top of Settings, and driver name in JSON export filenames (`clock14-<driver>-YYYY-MM-DD.json`), JSON payload (`driverName`), and PDF `LogSummaryReport` header/footer.
- **`web/public/styles.css`** — Added token-only styling for the splash screen, fading logo frame, driver tiles, 4-dot PIN display, 3×4 tactile keypad, active-driver strip, and Settings driver card — 100% built on existing Day / Night / Wind-down tokens, 48/56/64px touch scale, ≥12px font floor, and full `@media (prefers-reduced-motion: reduce)` neutralization.
- **`web/package.json`** — Appended `test/dom/drivers.mjs` to `npm run dom`.
- **Test files** — Updated harness setup / browser helpers (detailed in Section 5 below).

---

## 2. Creative UX & Design Decisions (and Why)

1. **Startup Splash Layout & Entrance Motion (`StartupSplash`)**:
   - The logo tile (`./icon-512.png`, `132×132px`, scaling down cleanly to `108×108px` on short `640px` viewports) sits inside a rounded-square bezel frame (`border-radius: 30px`, `--ring` edge tint, soft navy glow) and fades in over `520ms` (`0.94 → 1.0` scale) using Clock 14's unified `--ease-enter` curve. `"Clock 14"` (`34px` heavy tight wordmark) and `"HOS What-If Planner"` reveal cleanly right behind it (`100ms`/`140ms`), followed by the `"Who's in the seat?"` driver list and `"Add a driver"` button (`180ms`). Everything is neutralized under `prefers-reduced-motion: reduce`.
   - **Privacy on the lock screen**: Driver tiles show only the driver's monogram badge, name, and `"4-digit PIN"` (or `"Last active · 4-digit PIN"` / `"Finish setup"` for a migrated legacy profile). No duty status, remaining drive hours, or log snippets ever appear on the splash screen before PIN unlock.

2. **Custom 3×4 Tactile Numeric Keypad (`PinKeypad`)**:
   - Instead of relying on an `<input type="password">` that pops the OS keyboard and squeezes short viewports, PIN entry uses a dedicated 3×4 tactile keypad with `60px` (`54px` on short screens) Atkinson Hyperlegible Mono digit keys matching Clock 14's machined switch-key feel, paired with 4 glowing bezel-ring dots and auto-submission on the 4th digit.
   - Physical keyboard digits (`0–9`), `Backspace`, and `Delete` also work seamlessly for desktop/accessibility users. Wrong PIN triggers a crisp `320ms` horizontal dot shake, clears the buffer immediately, and displays a `role="alert"` message pointing to `"Forgot PIN?"`.

3. **Registration Flow Order & Voice**:
   - Trucker vocabulary up front, plain language underneath: `"Who's climbing in?"` → `"Your name keeps your logs, carrier-day rules, plans, and exports separate on this phone."`
   - **Order**: (1) Name (validated non-empty & unique case-insensitively) → (2) Mandatory **Disclosure Popup** (`DisclosureModal`, matching `Settings → About` verbatim with its single `"Understood — don't show again"` accept button over an `inert` background) → (3) Pick 4-digit PIN + Confirm 4-digit PIN (catching typos before locking anyone out) → (4) Pick 2 distinct reminder questions from 8 truck-cab/everyday prompts (e.g., *"Make of your first truck?"*, *"City of your first home terminal?"*, *"Highway or interstate you know best?"*, *"First CB handle or nickname?"*) and enter answers.
   - Recovery answers are normalized (`trim`, lowercase, collapse whitespace) before salted hashing so capitalization or stray spaces at 3 AM never lock a driver out.

4. **Active-Driver Chrome & Mid-Session Switching**:
   - `TopBar` (`header.top`) stays a single clean slim row (`status pill` + `clock / gear / theme`) so narrow `360px` and `320px` screens never wrap the status pill or crowd the header.
   - Immediately at the top of `Now`, a `48px` tactile **`ActiveDriverStrip`** (`Driver <Name>` on the left with circular monogram badge, `Switch` with swap icon on the right) tells whoever picks up the phone whose clocks they are looking at and switches/locks in one tap — without cluttering `DrivingView` (zero driver-switch distraction while rolling, respecting 49 CFR 392.80).
   - Opening **Settings** also shows a compact active-driver pill in `.settings-head` and leads with the **`Driver` card** (`Switch driver`, `Change PIN`, `Rename driver`, `Update recovery questions`, `Remove this driver`).

5. **Synchronous Pure-JS Salted SHA-256 (`web/src/drivers.ts`)**:
   - Web Crypto's `crypto.subtle` is unavailable on insecure plain-HTTP LAN origins (`http://192.168.x.x`) that drivers/testers sometimes use locally, and is async. Implementing standard FIPS 180-4 SHA-256 with 16-byte random salts (`crypto.getRandomValues`) and 2,048 stretched rounds in pure TypeScript keeps PINs and recovery answers strictly hashed/salted everywhere (HTTPS PWA, localhost, LAN HTTP, and Node test harnesses) with zero external dependencies and <5ms verification latency.

---

## 3. Storage Design & Hard Key Constraint

**Hard constraint honored with zero renames and zero new `localStorage` keys:**
- `hos-sandbox-v1` (primary save)
- `hos-sandbox-v1-backup` (last-known-good atomic rotation backup)
- `hos-sandbox-v1-sim` (active driver's simulated-clock quarantine snapshot)
- `hos-sandbox-undo-v1` (active driver's pending undo snapshot)

### How Per-Driver Storage Works Around Those Exact 4 Keys
- `hos-sandbox-v1` continues to hold the **currently active driver's `State` fields at the top level** (`segments`, `tentative`, `current`, `config`, `weekPlan`, `theme`, `themeChosen`, `disclaimerAcked`, etc.) PLUS a `__drivers` vault object (`{ v: 1, activeId, order, profiles }`) storing every registered driver's `DriverProfile` (`id`, `name`, `createdAt`, `disclaimerAckedAt`, salted/hashed `pin`, salted/hashed `recovery[]`, `needsSetup`, `migrated`, per-driver `data`, per-driver `undoRaw`, and per-driver `simRaw`).
- **Why this design is rock-solid**:
  - `index.html`'s pre-paint dark-safe boot script reads `localStorage.getItem('hos-sandbox-v1')` unchanged and still avoids white flashes in dark cabs.
  - `hos-sandbox-v1-backup` automatically rotates and backs up the **entire multi-driver vault** on every write; a corrupted `hos-sandbox-v1` falls back cleanly to `hos-sandbox-v1-backup` with all drivers intact.
  - `parseSaved()` strips `__drivers` before returning `State`, so in-memory `State` and `exportState()` never leak the vault, other drivers' data, or any hashes.
  - `unlockedDriverId` lives **strictly in memory** (never persisted to `localStorage`), guaranteeing that every cold launch / reload renders the Startup Splash + Driver Picker even with 1 registered driver.
  - On lock or driver switch (`lockDriverSession` / `activateDriverProfile`):
    1. The leaving driver's latest `State`, `hos-sandbox-undo-v1`, and `hos-sandbox-v1-sim` are stashed into their profile.
    2. `hos-sandbox-undo-v1` and `hos-sandbox-v1-sim` are swapped to the entering driver's stashed copies (or removed if none).
    3. All transient UI state (open sheets, Plan tool rooms, driving peek, welcome banner, print report, My Week hub cache) is reset, and `<AppShell key={unlockedId} />` remounts fresh for the entering driver.
  - Result: **zero bleed** of logs, carrier-day start, cycle, timezone, My Week, Split Lab, Trip, Load check, break presets, theme, undo, or sim across profiles.

---

## 4. Legacy Single-Driver Migration Path

1. On startup (`bootFromStorage()` in `web/src/store.ts`), if `hos-sandbox-v1` (or `hos-sandbox-v1-backup`) contains a valid pre-`drivers1` save (no `__drivers` envelope), Clock 14 automatically synthesizes the first driver profile (`id: 'driver-1'`, `name: 'Driver 1'`, `migrated: true`, `needsSetup: true`, `pin: null`, `recovery: []`) holding **100% of the existing state** (`segments`, `tentative`, `current`, `config`, `weekPlan`, `trip`, `split`, `loadCheck`, `theme`, `dayCloses`, `breakPresets`, `disclaimerAcked`, etc.) plus any active `SIM_KEY` snapshot.
2. The Startup Splash displays `"Driver 1"` with a clear amber `"Finish setup"` pill and `"Your existing logs are ready · Set PIN & recovery"`.
3. Tapping `"Driver 1"` enters the guided upgrade flow (`"Welcome back — Zero data lost"`):
   - Confirm or personalize their driver name (pre-filled with `"Driver 1"`).
   - If their legacy save had `disclaimerAcked: false`, shows the mandatory Disclosure Popup once; if already `true`, skips straight to PIN setup so existing users aren't re-nagged.
   - Set & confirm a 4-digit PIN.
   - Choose 2 reminder questions & answers.
   - Finishes directly into their unlocked profile with **zero data loss** and captures any legacy `hos-sandbox-undo-v1` snapshot into their profile.

---

## 5. Pins Added & Pins Re-Aimed

### New Pins Added
- **`web/test/dom/drivers.mjs`** (8 pins, added to `npm run dom`, running with zero gate bypass):
  - `DR1`: Fresh launch (0 drivers) renders splash with `./icon-512.png`, `"Clock 14"`, empty prompt, `"Add a driver"`, and hides main app chrome.
  - `DR2`: Registration enforces disclosure acceptance, 4-digit PIN (with confirmation mismatch check), and 2 distinct recovery questions; verifies neither PIN nor recovery answers appear in plaintext in `localStorage` and only the 4 allowed keys exist.
  - `DR3`: Startup splash renders on every relaunch with 1 driver AND with 2+ drivers (no straight-in shortcut); registering a 2nd driver also requires disclosure acceptance.
  - `DR4`: Wrong PIN stays locked with alert; right PIN enters without re-showing disclosure, while disclosure remains readable in `Settings → About`.
  - `DR5`: Forgot-PIN recovery rejects wrong answers, accepts right answers (case/whitespace insensitive), resets PIN, and invalidates old PIN.
  - `DR6`: Full per-driver separation across Driver A (`Marcus`) and Driver B (`Elena`) — logs, cycle (`60/7` vs `70/8`), carrier-day start (`04:30` vs `06:15`), timezone, My Week loads, theme, and pending undo never bleed; JSON export, downloaded filename (`clock14-marcus-YYYY-MM-DD.json`), and PDF `LogSummaryReport` carry the active driver's name.
  - `DR7`: Legacy single-driver save (`disclaimerAcked: true`, segments, open status, `60/7`, `05:30`, `America/Denver`, My Week load) auto-migrates to first driver with `"Finish setup"`, completes guided PIN + recovery setup, preserves 100% of data, and writes zero new `localStorage` keys.
  - `DR8`: Legacy save with `disclaimerAcked: false` requires disclosure acceptance during guided setup.
- **`web/test/dom/auditfix.mjs`** (real Chromium, +7 new pins — 185 → 192 total):
  - Fresh launch splash layout & zero horizontal overflow (`412×915`), new-driver registration disclosure modal fit (`412×915` & `360×740`) + verbatim match against `Settings → About`, 1-driver reload splash (no straight-in shortcut), wrong PIN rejection, 2-driver splash at `360×640` (zero overflow), per-driver separation across `Marcus` & `Elena` with mid-session switching, Forgot-PIN recovery in Chromium, and legacy single-driver migration in Chromium.

### Pre-Existing Pins Re-Aimed (Strictly Where Startup Flow Changed)
- **Post-login Node/SSR unit lanes** (`web/test/smoke.mjs`, `revisions.mjs`, `gemini.mjs`, and 15 `web/test/dom/*.mjs` lanes that mount `<App />` to test post-login HOS screens directly in domshim): added 1 line `setDriverGateBypassForTest(true)` beside their existing `setLaunchNotice?.(false)` harness setup so all existing post-login pins continue testing HOS behavior untouched. (`setDriverGateBypassForTest` is never called by production code.)
- **Real-browser Playwright lanes** (`web/test/dom/lebrowser.mjs`, `polish.mjs`, `layout.mjs`, `auditfix.mjs`): production `dist/app.js` runs with **zero bypass**; their `open()` / page-init helpers now wrap test seeds via `wrapDriverSeed(...)` and unlock through the real Startup Splash + on-screen PIN keypad (`unlockSplashInBrowser(page)`).
- **`web/test/dom/auditfix.mjs` (Disclaimer section)**: re-aimed to walk the new fresh-launch Startup Splash → `"Add a driver"` → mandatory Disclosure Popup → PIN/recovery → reload-to-splash → PIN-unlock (no recurring disclosure) flow, preserving every original disclosure verbatim check, `360×740` modal fit, `More → Rules` timezone reachability, and `C1` read-aloud check.

---

## 6. Verification Suite Results (Sequential Foreground)

All suites were run sequentially in the foreground against the built `web/dist/` (`HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/`, `HOS_BROWSER=/usr/bin/chromium`):

| Lane | Command | Result |
|---|---|---|
| **Build + Typecheck** | `cd web && npm run build` | **PASS** (exit 0; `tsc --noEmit` clean, `dist/app.js` 654.2kb) |
| **Contrast** | `cd web && node test/contrast.mjs` | **PASS** (44/44 day, 44/44 night, 44/44 wind-down) |
| **Nightlight** | `cd web && node test/nightlight.mjs` | **PASS** (light budget held, A1/A2 clean, graphic pairs ≥3.0) |
| **Smoke (UTC)** | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck`, `contrast`, `nightlight`, `ocr-bundle` (2 passes), `smoke.mjs` OK, `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16, `rescue` 11/11, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, `myweek` 19/19, **`drivers` 8/8** |
| **Smoke (America/Chicago)** | `cd web && TZ=America/Chicago npm run smoke` | **PASS** (exit 0; all 17 DOM sub-lanes identical counts above, including `myweek` 19/19 and `drivers` 8/8; final `smoke.mjs` & `drivers.mjs` re-verified after CSS `text-overflow` fix) |
| **Gemini (Chicago)** | `esbuild` + `TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**) |
| **Revisions (Chicago)** | `esbuild` + `TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**89/89**) |
| **Lebrowser (Chromium)** | `TZ=America/Chicago ... node test/dom/lebrowser.mjs` | **PASS** (**252/252**) |
| **Polish (Chromium)** | `TZ=America/Chicago ... node test/dom/polish.mjs` | **PASS** (**295/295**) |
| **Auditfix (Chromium)** | `TZ=America/Chicago ... node test/dom/auditfix.mjs` | **PASS** (**192/192**, including new real-Chromium `drivers1` pins) |
| **Layout (Chromium)** | `TZ=America/Chicago ... node test/dom/layout.mjs` | **419/421** on run 1 (14:44 UTC) and **419/421** on re-run (14:51 UTC) — **sole 2 failures** on both runs were the documented pre-existing 1px `taxis-grid` overshoot near the 15:00 UTC 3-hour boundary (`[412x915 timeline gemini]` and `[360x640 timeline gemini]`: `taxis-grid 140.81..1.00` / `88.81..1.00`). All 419 other pins passed cleanly with zero regressions. |

- **Time-of-day input check**: Confirmed zero `<input type="time">` added in `web/src/drivers.ts` or `web/src/driver-ui.tsx`; all time-of-day entries continue using the shared `ClockPick` component.

---

## 7. `engine/` Hash Confirmation

Verified with `find engine -type f | sort | xargs sha256sum | sha256sum`:

- **Expected:** `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`
- **Actual:**   `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`
- **`engine/` is byte-identical and untouched.**
