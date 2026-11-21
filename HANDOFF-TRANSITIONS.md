# HANDOFF — Transition Polish: Settings Room Dissolve & Day/Night Theme Ease (`work-transitions`)

- **Date:** 2026-11-21
- **Builder:** Neon
- **Tree:** `/home/hatch/workspace/hos-patch/work-transitions` (presentation-only patch stacked on live `work-rescue` tree; Split-Sleeper Rescue Simulator and all Plan tools preserved untouched)
- **Decision / Spec:** Lorico 2026-11-21 (voice, ~10:38–10:52 CT; `~/workspace/hos-patch/QUEUED-transitions.md`)
- **Engine / Store Guard:** `git hash-object web/src/store.ts` after build = **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (byte-identical; `store.ts`, `engine/`, `rollout.ts`, `recap.ts`, `rescue.ts` untouched).

---

## 1. Summary of Changes

### 1.1 Gear → Settings: Dissolve into "Another Room" (No Strip Scroll)
- **Strip & `PANEL_ORDER` Restructuring:**
  - Reduced `PANEL_ORDER` in `web/src/app.tsx` from 4 panels (`['plan', 'now', 'log', 'settings']`) to **3 panels (`['plan', 'now', 'log']`)**, matching `BAR_ORDER`.
  - Moved `<section class="page page-settings settings-room">` **outside** `<main class="pages">` as a direct sibling child of `.app`.
  - **Swipe-destination handling:** Because Settings is no longer inside `<main class="pages">`, horizontal swiping operates strictly across `Plan ↔ Now ↔ Log`. Swiping leftward past Log hits the right edge of the 3-panel strip and stays on Log with zero haptic ticks — Settings is no longer a swipe destination.
  - **Zero strip scrolling on Settings leg:** `App` tracks `settingsReturnTab` (the last non-`settings` tab, defaulting to `'now'` on a cold boot onto `tab: 'settings'`) and derives `stripPanel = navPanelOf(settingsReturnTab.current)`. Entering Settings does not change `stripPanel` and skips `<main class="pages">` placement in `useLayoutEffect`, leaving `pagesRef.current.scrollLeft` completely untouched (`scrollTo` is never called). `onPagesScroll` also ignores scroll events while `tab === 'settings'`.
  - **State & scroll preservation:** Keeping `<main class="pages">` mounted behind `.in-settings` preserves every strip page's horizontal seat, vertical `scrollTop`, Log day selection, and active Plan sub-screens (including `split`, `trip`, `load`, `recap`, `history`, and the three Plan tool flags `weekPlannerOpen`, `rolloutPlannerOpen`, `rescuePlannerOpen` — updated the auto-close effect to only close them when leaving `plan` for a tab other than `settings`). Opening Settings resets the Settings room's `scrollTop` to `0` so the driver always enters cleanly at the top. If an action inside Settings sends the driver to a different main panel (e.g. ConfirmSheet "Start over" → `log`), `useLayoutEffect` seats the strip instantly (`behavior: 'auto'`) before the dissolve-in paint so no sideways slide competes with the fade.
- **"Another Room" Chrome Hiding & Bidirectional Dissolve:**
  - When `s.tab === 'settings'`, `.app` receives class `.in-settings`.
  - Main-app chrome (`header.top`, `main.pages`, `nav.tabs`) receives `inert` and `aria-hidden="true"` and fades out via `opacity: 0; visibility: hidden; pointer-events: none` (`220ms ease-out`, visibility delayed `220ms` on exit, `0s` on return). Keeping those nodes mounted while hidden avoids clobbering `ResizeObserver`'s `--top-h` / `--dock-h` measurements or resetting main-app scroll/component state on return.
  - `.page.settings-room` is `position: fixed; inset: 0; z-index: 20; height: 100vh; height: 100dvh; overscroll-behavior: none;` and cross-fades in (`opacity: 0 → 1`, `220ms ease-out`). Sheets (`.sheet-wrap`, `z-index: 40`), modals (`.backdrop`, `z-index: 50`), and `@media print` (`.app.has-print-report > :not(.print-report) { display: none !important; }`) continue to layer and print cleanly above/around it.
  - Respects `@media (prefers-reduced-motion: reduce)` (`transition: none;`).
- **Phone Hardware Back Button (`backnav.ts` integration):**
  - Left `web/src/backnav.ts` untouched; in `App`'s `createBackNav` `goTo` callback, when `getState().tab === 'settings'` and `backnav` pops to `'now'`, it returns to `settingsReturnTab.current` so hardware Back also dissolves back to the exact origin room.
- **Haptics:**
  - Removed `data-haptic="lock"` from the header gear button in `TopBar`. Because Settings no longer glides across the strip, there is no strip settle timer or pass-through trail.
  - Both the header Settings gear button and the Settings Back button (`button.back.settings-back`) now use the app's existing global button click haptic handler — giving **one crisp `[12]` tap tick** on entry and **one crisp `[12]` tap tick** on return, matching `button.plan-item` and `button.back` across Plan sub-screens.
  - Only the 3 bottom-bar strip tab buttons (`Plan`, `Now`, `Log`) carry `data-haptic="lock"`, preserving Amendment A strip-glide haptics (`Plan ↔ Log` = 2 ticks, `Now ↔ Plan`/`Log` = 1 tick, swipes = 1 tick at settle).

### 1.2 Return-Affordance Design Choice & Justification
- **Design:** Added a minimal sticky top bar (`.settings-head`) inside `section.page-settings.settings-room` containing:
  - Left: `<button type="button" class="back settings-back" data-settings-back aria-label="Back to {Plan|Now|Log}">` with `<Icon d={I.back} /> {Plan|Now|Log}` (exact existing `button.back` component style and `I.back` chevron used by `SplitTab`, `WeekRecapTab`, `RolloutTab`, and `RescueTab`).
  - Beside it: `<h1 class="settings-title">Settings</h1>`.
- **Justification:**
  1. **Visual consistency:** Reuses the exact `button.back` + `I.back` pattern drivers already recognize on every Plan sub-screen, with zero new chrome metaphors.
  2. **Touch-target floor:** `button.back.settings-back` sets `min-height: var(--ctl-floor)` (`48px`) and `min-width: var(--ctl-floor)` (`48px`), meeting the 48px touch target requirement.
  3. **Clear destination cue:** Labeling the button with the origin room (`‹ Plan`, `‹ Now`, or `‹ Log`) immediately tells the driver where they will land back, matching Lorico's "another room" mental model.
  4. **Always reachable while scrolling:** Making `.settings-head` sticky (`position: sticky; top: 0; z-index: 2; background-color: var(--bg);`) ensures a driver scrolled down to Data / About / Testing (7 cards deep) can exit in one tap without scrolling back to the top, while carrying zero main-app chrome (no status pill, no clock, no gear, no theme switch, no bottom bar).

### 1.3 Day/Night Toggle: Calm Theme Ease
- **Implementation (`web/public/styles.css`):**
  - Kept the existing `:root` and `:root[data-theme="day"]` variable blocks at the top of `styles.css` 100% untouched (preserving WCAG contrast and nightlight gates).
  - Registered `@property` `<color>` definitions for the theme color tokens (`--bg`, `--ground-hi`, `--ground-lo`, `--panel`, `--panel2`, `--surface-hi`, `--line`, `--tick`, `--text`, `--muted`, `--key-hi`, `--key-lo`, `--key-base`, `--screen`, `--t-well`, `--accent`, `--accent-solid`, `--link`, `--good`, `--warn`, `--bad`, `--sb`, `--tint-warn`, `--tint-bad`, `--tint-accent`, `--edge-hi`, `--drop`, `--dial-track`) and added a **`280ms ease`** transition on `html` so CSS gradients (`.app` background, `.card`, `.hero`, `.tabs`, `button`) cross-fade smoothly in sync with solid surfaces without a harsh flash.
  - Added explicit standard **`transition: background-color 280ms ease, color 280ms ease, border-color 280ms ease`** on `body, .app, .card, .hero, .dock, .stat, .modal, .sheet, .pill, .toggle, .warnbox, .alertbox, .plan-icon, .bignum, .limit-plate, .ed-clock, .grid, .filebtn, input, select` (composed alongside `button`'s existing `transform 90ms ease-out, box-shadow 90ms ease-out, filter 120ms ease-out` and main-chrome/Settings-room's `opacity`/`visibility` transitions).
  - **Color/background properties only — never geometry:** Zero width/height/padding/margin/font-size/layout transitions, zero layout shift.
  - **`prefers-reduced-motion`:** The codebase already uses `@media (prefers-reduced-motion: reduce)` across 4 existing rules in `styles.css` (`button:active`, `.pv-snapmark + .hero`, `label.check input::after`); extended the same pattern to set `transition: none;` on all theme and Settings-dissolve rules under `prefers-reduced-motion: reduce`.
  - Toggle behavior, `chooseTheme`, persistence, and Day-theme default notice are completely unchanged.
- **Out of scope untouched:** The five `"under More"` copy strings, all Settings screen content/cards, duty-status dock (Now-only), startup disclaimer pop-up, first-run flow, PDF export, and all Plan tools (Weekly Recap, When to Roll, Rescue Simulator) are unchanged.

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Reduced `PANEL_ORDER` to `['plan', 'now', 'log']`; moved `section.page-settings.settings-room` outside `<main class="pages">` as a direct child of `.app` with sticky `.settings-head` + `button.back.settings-back`; added `in-settings` room state, `settingsReturnTab` preservation (including Plan tools & hardware Back), zero-scroll Settings entry/exit, `ariaHidden`/`inert` chrome hiding, and removed `data-haptic="lock"` from the header gear button. |
| `web/public/styles.css` | Added transition polish section (before `@media print`): `@property` color registrations + `280ms ease` color/background/border-color theme cross-fade, `.app.in-settings` chrome dissolve (`220ms ease-out`), `.page.settings-room` fixed full-viewport room layout, `.settings-head` / `button.back.settings-back` (48px floor) / `.settings-title`, and `@media (prefers-reduced-motion: reduce)` `transition: none` overrides. |
| `web/test/dom/revisions.mjs` | Re-aimed strip/Settings/haptic pins (`A1`, `S1`–`S7`, `S9`, `S11`, `H2`, `H5`, `H6`, `H8`, `H9`, `H10`, `H12`, `H13`, `N5`, `D1`, `D4`, `L2`, `G3`, `G4`, plus `dataCard` helper) for the 3-panel strip + Settings room; added new pins `T1`–`T4`. |
| `web/test/dom/layout.mjs` | Re-aimed sections `(a)/(b)` (Settings full-viewport + hidden chrome), `(c)` (3-panel swipe legs + non-swipe past Log + Amendment A 3-panel glides + Gear/Back dissolve & 1-tick haptic checks), `(d)` (exit Settings before Log), `(e)` (3-page strip + outside Settings room + Settings scroll-padding + new theme transition pin), `(f)` (Settings top=0 with hidden header), and `(g)` (Settings room screen/print checks). |
| `web/test/dom/auditfix.mjs` | Re-aimed `go(p, tab)` helper to exit `.app.in-settings` via `section.page-settings button.settings-back` before tapping bottom-bar tabs. |
| `web/test/dom/lebrowser.mjs` | Re-aimed Settings → Now return click (line 136) from `nav.tabs button /Now$/` to `section.page-settings button.settings-back`. |
| `web/test/dom/reimagine.mjs` | Re-aimed Settings DOM queries (lines 137–144) from `main details.help` / `main p` to `section.page-settings details.help` / `section.page-settings p`. |
| `web/test/dom/diag-swipe-touch.mjs` | Updated diagnostic `seat()` helper for Settings exit and removed obsolete More swipe-right row. |
| `web/test/dom/diag-gemini.mjs` | Updated diagnostic script to exit Settings via `button.settings-back` before tapping bottom-bar tabs. |
| `HANDOFF-TRANSITIONS.md` | This handoff document. |

---

## 3. Test Pin Changes & Justifications

All re-aims below are justified by **Lorico's 2026-11-21 transition polish decision** (Settings dissolves in as its own full-screen room with main chrome hidden and no strip scrolling; Day/Night eases colors/backgrounds). Zero test coverage was deleted.

### 3.1 `web/test/dom/revisions.mjs`

**Re-aimed pins:**
- **`A1`**: `PANEL_ORDER` is now `['plan', 'now', 'log']` (3-panel horizontal swipe strip; Settings lives outside as its own room).
- **`S1`**: `<main class="pages">` holds the 3 strip sections matching `PANEL_ORDER` and `BAR_ORDER`, AND asserts `section.page-settings.settings-room` sits outside `<main>` as its own room.
- **`S2`**: All 3 strip panels AND the Settings room stay mounted simultaneously.
- **`S3`**: Scrolling the strip walks `0=plan/Plan`, `400=now/Now`, `800=log/Log`, AND scrolling past 800 (`1200`) stays clamped to `log` (Settings is not a swipe destination).
- **`S4`**: Repeated full 3-panel ring walk (`0 ↔ 400 ↔ 800`), forth and back, twice.
- **`S5`**: All 3 strip page nodes AND `settingsRoom()` remain identical DOM object references after walks.
- **`S6`**: Bottom-bar taps (`Plan=0`, `Log=800`, `Now=400`) scroll the strip and light themselves; header gear opens Settings WITHOUT scrolling the strip (`scrollCalls.length === 0`, `scrollLeft` unchanged) and Settings Back returns cleanly.
- **`S7`**: Programmatic tab changes (`plan` → `0`, `log` → `800`) start from max 3-panel strip offset `800`.
- **`S9`**: Off-panel strip pages (Plan, Now) AND the closed Settings room are `inert` and `aria-hidden="true"` while Log is active.
- **`S11`**: Mid-flight settle protection re-aimed from `Now → Settings` passing Log to `Plan(0) → Log(800)` passing `Now(400)` (same 2-panel smooth-glide mid-flight invariant).
- **`H2`**: Full 3-panel swipe walk `Plan → Now → Log → Now → Plan` yields 4 clicks, one per panel change.
- **`H10`** *(Amendment A forward)*: Re-aimed from `Plan→Settings` / `Now→Settings` strip travel (no longer exists) to `Plan → Log` = **2 ticks** (pass Now, lock Log; 0 at press) AND **Gear → Settings** dissolve = **1 crisp `[12]` tap tick** with zero strip scroll and zero pass-through ticks.
- **`H12`** *(Amendment A backwards + skip)*: Re-aimed from `Settings→Plan` / `Settings→Now` to `Log → Plan` = **2 ticks** (pass Now, lock Plan) + fast-glide skip `Plan → Log` = **2 ticks**, AND **Settings Back → origin panel** = **1 crisp `[12]` tap tick** with zero strip scroll.
- **`H13`**: Multi-panel swipe fling `Plan → Now → Log` = 1 tick at settle; reduced-motion `Log → Plan` = 1 tick at lock.
- **`H8`** *(Mid-glide grab/cancel)*: Re-aimed from `Now → Settings (gear)` to `Plan(0) → Log(800)` grabbed at `300px` back to `Plan(0)` = 0 ticks and swiped on to `Now(400)` = 1 tick — preserving full mid-glide grab/cancel/redirect coverage.
- **`H9`** *(Haptic opt-out)*: Plain buttons, header Settings gear, and Settings Back keep their instant `[12]` click tick; only the 3 bottom-bar strip tab buttons opt out with `data-haptic="lock"`.
- **`H5`**: Programmatic tab changes (`settings`, `log`) and strip settle under an open sheet stay silent.
- **`H6`**: Missing / throwing `navigator.vibrate` still commits strip swipes across `Now(400) → Log(800) → Plan(0)`.
- **`N5`, `D1`, `D4`, `L2`** *(plus `dataCard` helper)*: Scoped Settings assertions to `settingsRoom()` (`section.page-settings`) instead of `pages()[3]`.
- **`G3`**: Activating header gear opens `section.page-settings.settings-room` with all 7 cards visible, zero strip scroll, `.app.in-settings`, and header/strip/bottom-bar all `inert` + `aria-hidden="true"`.
- **`G4`**: Returning from Settings via `button.settings-back` restores chrome and lands back on `Plan`, `Now`, or `Log` with zero strip scroll and the exact origin bottom-bar tab lit.

**New pins added:**
- **`T1` (spec pin a)**: Tapping the header gear from `Plan` (`0px`), `Now` (`400px`), and `Log` (`800px`) does NOT scroll the strip (`scrollCalls.length === 0`, `scrollLeft` unchanged), sets `tab === 'settings'`, and shows `section.page-settings.settings-room` (`is-active`, not `inert`, not `aria-hidden`) with all 7 Settings cards visible.
- **`T2` (spec pin b)**: While in Settings, `.app.in-settings` marks `header.top`, `main.pages`, and `nav.tabs` as `inert` + `aria-hidden="true"`, and `web/public/styles.css` hides them (`opacity: 0; visibility: hidden; pointer-events: none;`) while `.page.settings-room.is-active` fills the viewport (`position: fixed; inset: 0; opacity: 1; visibility: visible;`) with a dissolve transition.
- **`T3` (spec pin c)**: The Settings return affordance (`button.back.settings-back`, 48px floor via `--ctl-floor`, labeled for the origin room) leaves Settings, restores `header.top`, `main.pages`, and `nav.tabs`, and preserves the exact origin panel AND active Plan sub-screens (verified with both `Split Lab` and `Rescue Simulator`) with zero strip scroll.
- **`T4` (spec pin d)**: Verifies the CSS theme transition rule in `web/public/styles.css` transitions `background-color`, `color`, and `border-color` within 200–350ms (`280ms ease`), contains zero geometry properties, respects `@media (prefers-reduced-motion: reduce)`, and that clicking the Day/Night header button flips `data-theme="day"`, updates `theme`/`themeChosen`, and persists to `localStorage`.

### 3.2 Browser Suites Updated (for Ada's Modal Gate)
- **`web/test/dom/layout.mjs`**:
  - `(a)/(b)`: Guards strip-offset restore to strip-resident pages; for `tab === 'More'` (Settings room), asserts main header and bottom bar are hidden (`visibility: hidden`, `opacity: 0`, `inert`) while Settings fills `[0..vh]` cleanly with zero horizontal overflow.
  - `(c)`: Re-aimed touch-swipe legs to 3-panel strip (`Now → Log → Now → Plan → Now`), added explicit pin that swiping left past Log stays on Log with 0 ticks, re-aimed Amendment A glides to `Now→Plan` (1), `Plan→Log` (2), `Log→Plan` (2), `Now→Log` (1), and added explicit browser pins for `Gear → Settings` and `Settings Back → Log` (zero strip scroll, chrome hidden/restored, 1 tap tick each).
  - `(d)`: Exits Settings via `button.settings-back` before tapping Log in the bottom bar.
  - `(e)`: Re-aimed strip order pin to 3 strip pages + `.settings-room` sibling, `tapNav` helper exits Settings via `button.settings-back`, Settings `scroll-padding-bottom` is `24px` (no bottom bar) while Plan/Log stay `73px`, and added browser-computed theme transition + flip/persistence pin `(e) transitions (d)`.
  - `(f)`: Re-aimed `hdrCheck('More')` to assert Settings starts flush at `top: 0` (`inSettings === true`, zero header gap).
  - `(g)`: Verifies on-screen `.settings-room` remains visible (`display !== 'none'`, `visibility === 'visible'`) when PDF report triggers and is hidden (`display: 'none'`) under `@media print`.
- **`web/test/dom/auditfix.mjs`**, **`web/test/dom/lebrowser.mjs`**, **`web/test/dom/reimagine.mjs`**, **`web/test/dom/diag-swipe-touch.mjs`**, **`web/test/dom/diag-gemini.mjs`**: Re-aimed Settings exit navigation to `section.page-settings button.settings-back` and Settings DOM queries in `reimagine.mjs` to `section.page-settings`.

---

## 4. Local Check Results (`TZ=America/Chicago`)

All light local checks passed (full browser suites deferred to Ada on Modal):

- **Typecheck** (`TZ=America/Chicago npm run typecheck`): **PASS** (exit 0)
- **Production build** (`TZ=America/Chicago npm run build`): **PASS** (`dist/app.js 364.3kb`, built `2026-11-21 18:54`)
- **WCAG Contrast gate** (`TZ=America/Chicago node test/contrast.mjs`): **PASS** — day 44/44, night 44/44
- **Night-light budget gate** (`TZ=America/Chicago node test/nightlight.mjs`): **PASS**
- **Revisions DOM suite** (`TZ=America/Chicago node dist-test/dom-revisions.mjs`): **PASS — 67/67 pins pass** (all re-aimed pins + new `T1`–`T4` pins)
- **Browser test syntax check** (`node --check` on `layout.mjs`, `auditfix.mjs`, `lebrowser.mjs`, `reimagine.mjs`, `diag-swipe-touch.mjs`, `diag-gemini.mjs`): **PASS** (exit 0)
- **Engine / Store hash verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches the required guard hash exactly.
