# HANDOFF — Plan Tools Room Dissolve (`work-plandissolve`)

- **Date:** 2026-11-21
- **Builder:** Antigravity
- **Tree:** `/home/hatch/workspace/hos-patch/work-plandissolve` (presentation-only patch stacked on live `work-transitions`, commit `e3cb64b`)
- **Decision / Spec:** Lorico 2026-11-21 (voice, ~17:23 CT) — make all Plan tools transition just like Settings does via the gear icon (full-screen room dissolve, no strip scroll, main chrome hidden/inert).
- **Engine / Store Guard:**
  ```
  git hash-object web/src/store.ts = 1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Byte-identical. `engine/`, `web/src/store.ts`, `web/src/backnav.ts`, `web/src/rollout.ts`, `web/src/recap.ts`, and `web/src/rescue.ts` are untouched.

---

## 1. How the Room Mechanism Was Generalized

Rather than bolting a second parallel system beside Settings, the existing Settings-room mechanism was generalized into a shared app-level room architecture used by both Settings and every Plan tool sub-screen:

### 1.1 Shared App-Level Room State (`web/src/app.tsx`)
- Added `PlanToolId` (`'load' | 'split' | 'trip' | 'recap' | 'history' | 'week' | 'rollout' | 'rescue'`), `PLAN_TOOL_LABEL`, and `activePlanToolOf(tab, weekOpen, rolloutOpen, rescueOpen)` to unify both store-tab Plan tools (`load`, `split`, `trip`, `recap`, `history`) and reactive module-flag Plan tools (`week`, `rollout`, `rescue`).
- Unified room flags in `App()`:
  - `inSettings = s.tab === 'settings'`
  - `activePlanTool = activePlanToolOf(s.tab, weekOpen, rolloutOpen, rescueOpen)`
  - `inPlanTool = activePlanTool !== null`
  - `inRoom = inSettings || inPlanTool`
- `.app` receives `.in-room` whenever any room is active, plus `.in-settings` when Settings is open and `.in-plan-tool` when a Plan tool is open (preserving backwards compatibility with existing Settings selectors).
- `<TopBar>`, `<main class="pages">`, and `<nav class="tabs">` all share `inert={blocked || inRoom}` and `aria-hidden={inRoom || undefined}` (with bottom-bar active lighting `!inRoom && barPanel === k`).
- Only one `.page` in the document holds `.is-active` at any time (`activeStripPanel = inRoom ? null : stripPanel`): while in a room, all three strip pages inside `<main class="pages">` stay mounted behind the room (preserving every panel's `scrollTop`, Log state, and the Plan hub's 7-item list intact) and receive `inert` + `aria-hidden="true"`.
- Both full-screen rooms sit as direct sibling children of `.app` after `<nav class="tabs">` and before sheets/modals/print-report:
  - `<section ref={settingsRef} class="page page-settings room settings-room...">`
  - `<section ref={planRoomRef} class="page page-tool room plan-room..." data-plan-tool={...}>`
- `<section class="page page-plan">` inside `<main class="pages">` now permanently renders `<PlanTab ev={ev} />`, so entering/leaving any Plan tool never unmounts the Plan hub or loses its scroll position.

### 1.2 Shared Room CSS (`web/public/styles.css`)
- Generalized `.app.in-settings > header.top / main.pages / nav.tabs` → `.app.in-room > header.top / main.pages / nav.tabs` (`opacity: 0; visibility: hidden; pointer-events: none; 220ms ease-out`, visibility delayed `220ms` on exit, `0s` on return).
- Generalized `.page.settings-room` / `.page.settings-room.is-active` → `.page.room` / `.page.room.is-active` (`position: fixed; inset: 0; z-index: 20; width: 100%; height: 100vh; height: 100dvh; overscroll-behavior: none; opacity: 0 → 1; 220ms ease-out`).
- `.page.room` defaults to `padding: calc(12px + env(safe-area-inset-top)) 12px calc(24px + env(safe-area-inset-bottom))` (safe-area-aware full-viewport framing for every Plan tool's own back bar / `.flow-head`), while `.page.settings-room` overrides only `padding-top: 0` and `scroll-padding-top: calc(64px + env(safe-area-inset-top))` for its sticky `.settings-head`.
- `.page.plan-room .split-now-after` sets `top: env(safe-area-inset-top)` so Split Lab's sticky strip clears notched status bars while remaining `0px` on standard viewports.
- Extended `@media (prefers-reduced-motion: reduce)` to set `transition: none;` on `.app.in-room > ...`, `.page.room`, and `.page.room.is-active`.
- **Layering & Print:** Sheets (`.sheet-wrap`, `z-index: 40`) and modals (`.backdrop`, `z-index: 50`) remain strictly above `.page.room` (`z-index: 20`). `@media print` (`.app.has-print-report > :not(.print-report) { display: none !important; }`) automatically hides both sibling rooms during PDF printing.

### 1.3 Strip Freeze & Return-to-Origin
- `lastStripPanel` tracks the last non-room main strip panel (`'plan' | 'now' | 'log'`). While `inRoom` is `true`, `stripPanel` stays parked on `lastStripPanel.current`, `useLayoutEffect` skips `<main class="pages">` placement (`scrollTo` is never called), and `onPagesScroll` ignores scroll/settle events via `isInRoomNow()`.
- Returning from a room to the origin panel (e.g. Plan hub → tool → Plan hub, or Now → Split Lab → Now) performs zero strip scrolling. Leaving a room to a different strip panel (e.g. hardware Back from Split Lab opened via Now → Plan) seats the strip instantly (`behavior: 'auto'`) before the dissolve-in paint so no sideways slide competes with the fade.
- Fixed a nested-return trap in `BackToPlan` (`web/src/app.tsx`): previously, going `Plan → Hours coming back → Your last 8 days → ‹ Recap` left `s.planReturn === 'recap'` while on `s.tab === 'recap'`, causing `‹ Recap` on `RecapTab` to self-loop (previously escapable only via the bottom tab bar, which is now hidden in a room). `BackToPlan` now resolves `dest = s.planReturn === s.tab ? 'plan' : s.planReturn` and resets `planReturn: 'plan'` when leaving a self-target, so drivers can never get stranded in a Plan tool room.

---

## 2. Per-Tool Entry / Exit, Lifecycle & Scroll Notes

Every Plan tool preserves its existing calculation, copy, sheets/modals, and mount/reset lifecycle:
- **Smooth bidirectional dissolve without lifecycle drift:** When closing a Plan tool back to main chrome with motion enabled (`!prefersReducedMotion()`), `App` retains the closing tool's already-mounted subtree inside the now-`inert` / `aria-hidden` `.page.plan-room` for `240ms` (matching the `220ms ease-out` fade) so the tool visibly cross-fades out instead of snapping blank on frame 0, then clears it so the tool unmounts cleanly. Under `prefers-reduced-motion: reduce`, it unmounts immediately. Reopening a tool (even mid-fade) increments `toolEpochRef` for a fresh mount key (`${tool}-${epoch}`). If Settings is opened programmatically while a Plan tool is active (e.g. `T3`), `preserveBehindSettings` keeps that tool's instance alive until return.
- **Scroll reset on entry & exceptions:**
  - `App`'s `useLayoutEffect` resets `planRoomRef.current.scrollTop = 0` whenever `activePlanTool` changes (on opening any tool or transitioning between tools such as `recap → load` or `recap → history`), while `<section class="page page-plan">` keeps its hub `scrollTop` untouched behind the room.
  - **`HistoryTab` (`history`, "Your last 8 days")** deliberately scrolls a tapped week-strip day into view via `useEffect(() => { if (focus !== null) document.querySelector('.hist-focus')?.scrollIntoView?.({ block: 'start' }); }, [])`. Because `useEffect` runs after `App`'s `useLayoutEffect`, `planRoomRef.current.scrollTop = 0` runs first and `HistoryTab`'s deliberate `.hist-focus` scroll is preserved intact.
  - **`LoadTab` (`load`, "Can I take this load?")** scrolls to top on each wizard step change (`useEffect(..., [step])`). Updated its active-page selector from `.pages .page.is-active` to `.page.plan-room.is-active, .pages .page.is-active` so step transitions continue scrolling the active Plan room to `0`.

| Tool | ID / Flag | Entry | Exit Affordance | Hardware Back (`backnav.ts`) | Sheets / Modals Layering |
| --- | --- | --- | --- | --- | --- |
| Can I take this load? | `tab: 'load'` | Plan hub #1 / Recap door / `?go=load` | `.flow-head button.icon-btn` (`Back to Plan/Recap/Now` on step 1 & verdict; `Previous question` on steps 2–4) | Pops `'sub'` → Plan hub | `LoadTimeSheet` (`z-index: 40`) above room |
| Plan a sleeper split | `tab: 'split'` | Plan hub #2 / LeverSheet (`planReturn: 'now'`) | `<BackToPlan>` (`‹ Plan` / `‹ Now`) | Pops `'sub'` → Plan hub | `SplitBlockSheet` (`z-index: 40`) above room |
| Plan a run | `tab: 'trip'` | Plan hub #3 | `<BackToPlan>` (`‹ Plan`) | Pops `'sub'` → Plan hub | `TripTimeSheet` (`z-index: 40`) above room |
| Hours coming back | `tab: 'recap'` | Plan hub #4 / Week/Rollout/Rescue links / `?go=recap` | `<BackToPlan>` (`‹ Plan` / `‹ Now`) | `BACK_TO_PLAN` → Plan hub | Inline DayEditor (no sheet) |
| Your last 8 days | `tab: 'history'` | Recap door / `WeekStrip` day tap (`openHistoryDay`) | `<BackToPlan>` (`‹ Recap` → Recap → `‹ Plan`) | Unchanged (`backnav.ts` untouched → `'now'`) | Read-only (no sheets) |
| Weekly recap vs. 34 | `weekPlannerOpen` (`week`) | Plan hub #5 (`openWeekPlanner(true)`) | `<button class="back">` (`‹ Plan` → `openWeekPlanner(false)`) | Pops `'sub'` → closes flag & returns to Plan hub | Link to `recap` swaps inside room |
| When to roll & PTA | `rolloutPlannerOpen` (`rollout`) | Plan hub #6 (`openRolloutPlanner(true)`) | `<button class="back">` (`‹ Plan` → `openRolloutPlanner(false)`) | Pops `'sub'` → closes flag & returns to Plan hub | `RolloutTimeSheet` (`z-index: 40`) above room; Back closes sheet first |
| Split-sleeper rescue | `rescuePlannerOpen` (`rescue`) | Plan hub #7 (`openRescuePlanner(true)`) | `<button class="back">` (`‹ Plan` → `openRescuePlanner(false)`) | Pops `'sub'` → closes flag & returns to Plan hub | `RescueTimeSheet` (`z-index: 40`) above room; Back closes sheet first |

---

## 3. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Generalized room state (`inRoom`, `inSettings`, `inPlanTool`, `activePlanToolOf`), added sibling `<section ref={planRoomRef} class="page page-tool room plan-room">` outside `<main class="pages">`, kept `<PlanTab>` permanently mounted in `page-plan`, froze strip scrolling while `inRoom`, added 240ms exit-content retention for smooth bidirectional cross-fade (disabled under reduced motion), reset `planRoom.scrollTop = 0` on tool entry/switch, updated `LoadTab` step scroll selector to target `.page.plan-room.is-active`, and guarded `BackToPlan` against self-looping on `Recap`. |
| `web/public/styles.css` | Generalized `.app.in-settings` → `.app.in-room` and `.page.settings-room` → `.page.room` (`220ms ease-out`, `position: fixed; inset: 0; z-index: 20`), kept Settings-specific top padding override on `.page.settings-room`, added `.page.plan-room .split-now-after { top: env(safe-area-inset-top); }`, and updated `@media (prefers-reduced-motion: reduce)` to cover `.app.in-room` and `.page.room`. |
| `web/test/smoke.mjs` | Added `'page-tool'` to `pageOut()` marks; re-aimed Plan tool SSR checks (`split`, `trip`, `history`, `load`, `week`, `rollout`, `rescue`) from `page-plan` to `page-tool` (and chrome-hidden room check for `split`/`trip`); re-aimed `patch 19 B5` scroll-target regex for `.page.plan-room.is-active`. |
| `web/test/dom/c3.mjs` | Re-aimed `D10b` and `D10h` to query `RecapTab` inside `planRoom()` (`section.page-tool`) and assert `navPanelOf` + hidden chrome while in the room. |
| `web/test/dom/rescue.mjs` | Re-aimed `R4`, `R4b`, `R5`, `R6`, and `R8` in-tool DOM queries to `planRoom()` (`section.page-tool`) while keeping Plan hub 7-item assertions on `planPage()`. |
| `web/test/dom/revisions.mjs` | Re-aimed `S1`, `S5`, `S8`, `S9`, `W1`–`W3`, `R1`–`R9`, `T2`–`T4` for generalized `.in-room`/`.room` and `section.page-tool.room.plan-room`; added 5 new Plan-dissolve pins **`P1`–`P5`**. |
| `web/test/dom/layout.mjs` | Re-aimed `(d)` Load step 2 bottom-clearance check for full-viewport tool room (and exited Load before tapping Settings gear); updated `(e)` to assert `section.page-tool.room.plan-room` outside strip and added browser-computed Split Lab dissolve & Back-return verification pins. |
| `web/test/dom/auditfix.mjs` | Added `exitRoom(p)` in `go(p, tab)` so navigating away from a Plan tool room exits via its Back button before tapping bottom-bar tabs or Settings gear. |
| `web/test/dom/c3browser.mjs` | Scoped `h1.screen-title` queries (lines 137, 153, 186) to `.page.is-active h1.screen-title` because the Plan hub's `<h1>Plan</h1>` stays mounted behind the active Plan tool room. |
| `web/test/dom/diag-gemini.mjs` | Exited Plan tool rooms via their Back button before tapping `nav.tabs` or Settings gear in the diagnostic sweep. |
| `HANDOFF-PLANDISSOLVE.md` | This handoff document. |

---

## 4. Test Pin Changes & Justifications

Zero coverage was deleted; every re-aimed pin reflects Lorico's 2026-11-21 decision that Plan tools dissolve into their own full-screen room outside `<main class="pages">` with main chrome hidden/inert (identical to Settings).

### 4.1 New Pins Added (`web/test/dom/revisions.mjs` + `web/test/dom/layout.mjs`)
- **`P1` (`revisions.mjs`)**: Opening all 8 Plan tools (`load`, `split`, `trip`, `recap`, `history`, `week`, `rollout`, `rescue`) dissolves into `section.page-tool.room.plan-room.is-active` with `.app.in-room.in-plan-tool`, marks `header.top`, `main.pages`, `nav.tabs`, and `settings-room` `inert` + `aria-hidden="true"`, leaves no bottom-bar tab lit, keeps the 7-item Plan hub mounted in `pages()[0]`, and performs zero strip scroll (`scrollCalls.length === 0`).
- **`P2` (`revisions.mjs`)**: Verifies shared room CSS in `web/public/styles.css` (`.app.in-room` chrome dissolve, `.page.room` / `.page.room.is-active` fixed `inset: 0; z-index: 20; 220ms ease-out`), `@media (prefers-reduced-motion: reduce)` `transition: none`, sheet (`.sheet-wrap`, `z-index: 40`) & modal (`.backdrop`, `z-index: 50`) layering above `.page.room`, and `@media print` hiding non-report children.
- **`P3` (`revisions.mjs`)**: Closing every Plan tool via its Back affordance dissolves back to origin (`Plan` hub for all 7 hub tools, `History → Recap → Plan` nested return, and `Now → Split Lab → Now`), restores `header.top` / `main.pages` / `nav.tabs`, deactivates `plan-room` (`inert` + `aria-hidden="true"`), preserves Plan hub `scrollTop` (`185`), and performs zero strip scrolling.
- **`P4` (`revisions.mjs`)**: Hardware Back (`popstate` via `backnav.ts`) closes all 7 Plan-hub tools back to Plan hub with zero strip scrolling and chrome restored; when a sheet (`RolloutTimeSheet`) is open inside a tool, the first hardware Back closes the sheet while keeping the tool room open, and the second closes the tool room.
- **`P5` (`revisions.mjs`)**: Opening a Plan tool resets `planRoom.scrollTop` to `0` on entry and on direct tool-to-tool transitions (`recap → load`), while preserving Plan hub's own `scrollTop` (`240`) across tool entry and exit.
- **`layout.mjs` `(e)` browser pins**: Verifies `.app > section.page-tool.room.plan-room` sits outside `<main.pages>`, Split Lab fills `[0..vh]` (`top: 0`, `opacity: 1`, `header`/`nav`/`main` hidden & `inert`, zero strip scroll, zero TimeHead), and Back dissolves cleanly back to Plan hub with chrome restored.

### 4.2 Re-Aimed Pins & Justifications
- **`web/test/smoke.mjs`**:
  - `pageOut()` `marks`: added `'page-tool'` so SSR checks can slice Plan tools independently from the permanently mounted Plan hub (`'page-plan'`).
  - Redesign 1 §8 (`split`/`trip`): re-aimed from asserting `aria-current="page"` on the bottom Plan button to asserting `.in-room.in-plan-tool`, active `.page-tool`, `class="back"`, and no bar tab lit while chrome is hidden.
  - Patch 7.2 (`history`), A7 (`trip`), declutter & D17 (`load`), Weekly Recap (`week`), Rollout (`rollout`), Rescue (`rescue`): switched `pageOut(..., 'page-plan')` → `pageOut(..., 'page-tool')` because these tools now render in `section.page-tool` while `section.page-plan` keeps the Plan hub mounted.
  - Patch 19 `B5`: updated source-pin regex on `LoadTab`'s step-change scroll `useEffect` to match `.page.plan-room.is-active, .pages .page.is-active`.
- **`web/test/dom/c3.mjs`**:
  - `D10b`: re-aimed from checking `aria-current="page"` on `nav.tabs` and querying `planPage()` to verifying `navPanelOf('recap'/'history') === 'plan'`, active `planRoom()`, hidden chrome, and `h1`/`button.back` inside `planRoom()`.
  - `D10h`: scoped Recap content order check to `planRoom()` instead of `planPage()`.
- **`web/test/dom/rescue.mjs`**:
  - `R4`, `R4b`, `R5`, `R6`, `R8`: scoped Rescue simulator in-tool DOM queries to `planRoom()` while keeping the 7-item Plan hub assertions on `planPage()`.
- **`web/test/dom/revisions.mjs`**:
  - `S1`, `S5`, `S9`: extended strip/room checks to cover both sibling rooms (`settingsRoom()` and `planRoom()`) sharing `.room`.
  - `S8`: re-aimed from asserting `split` inside `pages()[0]` (and swiping to `now`) to asserting `split` opens in `planRoom()` with zero strip scroll, keeps Plan hub mounted in `pages()[0]`, and ignores hidden strip scrolls while open.
  - `W1`–`W3`, `R1`–`R9`: open tool from `pages()[0]` (Plan hub), then query tool controls/output inside `planRoom()`.
  - `T2`, `T4`: updated CSS regex assertions from Settings-only `.in-settings` / `.page.settings-room` to generalized `.in-room` / `.page.room`.
  - `T3`: verified Settings Back restores chrome when returning to Plan hub AND preserves `Split Lab` / `Rescue Simulator` inside `planRoom()` when returning to an active Plan sub-screen.
- **Browser suites (for Ada's Modal Gate):**
  - `web/test/dom/layout.mjs`: re-aimed `(d) C` Load step 2 bottom clearance to the full-viewport room (tab bar hidden/inert) and exited Load before opening Settings; updated `(e)` for `section.page-tool.room.plan-room`.
  - `web/test/dom/auditfix.mjs`: added `exitRoom()` in `go(p, tab)` to exit active Plan tool rooms before tapping bottom-bar tabs or Settings gear.
  - `web/test/dom/c3browser.mjs`: scoped `h1.screen-title` to `.page.is-active h1.screen-title` because Plan hub's `<h1>Plan</h1>` stays mounted behind the active room.
  - `web/test/dom/diag-gemini.mjs`: exited Plan tool rooms before tapping `nav.tabs` or Settings gear.

---

## 5. Local Verification Results (`TZ=America/Chicago`)

All non-browser suites ran locally and passed 100% (browser Playwright suites deferred to Ada's Modal run per tight local memory guidance; all modified browser test scripts passed `node --check`):

- **Typecheck & Production Build** (`TZ=America/Chicago npm run build`): **PASS** (`tsc --noEmit` exit 0; `dist/app.js 365.8kb`, built `2026-11-21 23:49`)
- **Full Smoke + DOM Gate** (`TZ=America/Chicago npm run smoke`): **PASS**
  - `test/contrast.mjs`: **PASS** (day 44/44, night 44/44)
  - `test/nightlight.mjs`: **PASS**
  - `test/ocr-bundle.mjs`: **PASS**
  - `test/smoke.mjs`: **PASS** (`OK`)
  - `yesback.mjs`: **6/6 PASS**
  - `c1flush.mjs`: **PASS**
  - `adjuststart.mjs`: **39/39 PASS**
  - `scrub.mjs`: **30/30 PASS**
  - `c3.mjs`: **46/46 PASS**
  - `c3relaunch.mjs`: **3/3 PASS**
  - `logedit.mjs`: **37/37 PASS**
  - `cascade.mjs`: **16/16 PASS**
  - `rescue.mjs`: **11/11 PASS**
- **Revisions DOM Suite** (`TZ=America/Chicago node dist-test/dom-revisions.mjs`): **72/72 PASS** (all re-aimed pins + new `P1`–`P5` + `T1`–`T4` + `G1`–`G4`)
- **Gemini DOM Suite** (`TZ=America/Chicago node dist-test/dom-gemini.mjs`): **20/20 PASS**
- **Browser Test Syntax Check** (`node --check` on `layout.mjs`, `auditfix.mjs`, `c3browser.mjs`, `diag-gemini.mjs`): **PASS** (exit 0)
- **Store Guard Hash Verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required hash byte-for-byte.
