# HANDOFF — Nav Cleanup: Remove More Tab, Add Header Gear (`work-navgear`)

- **Date:** 2026-11-21
- **Builder:** Neon
- **Tree:** `/home/hatch/workspace/hos-patch/work-navgear` (presentation-only patch stacked on live `work-rollout` tree)
- **Decision / Spec:** Lorico 2026-11-21 (`~/workspace/hos-patch/QUEUED-nav-gear.md`), implementation open question settled by Ada (keep Settings as the 4th panel in the horizontal swipe strip).
- **Engine / Store Guard:** `git hash-object web/src/store.ts` after build = **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (byte-identical; `store.ts`, `engine/`, `rollout.ts`, `recap.ts` untouched).

---

## 1. Summary of Changes

1. **Bottom bar reduced to 3 equal tabs (`Plan`, `Now`, `Log`):**
   - Added exported `BAR_ORDER: State['tab'][] = ['plan', 'now', 'log']` in `web/src/app.tsx`, used solely by `<nav class="tabs">` rendering.
   - Kept exported `PANEL_ORDER: State['tab'][] = ['plan', 'now', 'log', 'settings']` unchanged so the 4-panel horizontal swipe strip, scroll/settle logic, and `tapGoal` indexing remain untouched.
   - Removed the `'settings'` (`More`) button from `<nav class="tabs">` and updated `.tabs` in `web/public/styles.css` from `grid-template-columns: 1fr 1fr 1fr 1fr` to `grid-template-columns: 1fr 1fr 1fr` so the three tabs are equal width, evenly spaced, and centered across the full bar.
   - When the active panel is `'settings'`, `barPanel === 'settings'` matches nothing in `BAR_ORDER`, so no bottom-bar button is lit (`on` / `aria-current="page"`).

2. **Header Settings gear icon in `TopBar`:**
   - Added a stroke-style 24×24 cog/gear SVG path (`I.gear`) to the icon record `I` in `web/src/app.tsx` (matching the existing `stroke-width="2" stroke-linecap="round" stroke-linejoin="round"` icon style; replaces the 3-dot `I.more` icon).
   - Inserted the gear button inside `TopBar` `.top-right` strictly between `.muted.clock` and the Day/Night `.theme-btn` button — DOM order is `clock → gear → theme`.
   - Attributes & classes: `type="button"`, `aria-label="Settings"`, `title="Settings"`, `class="theme-btn gear-btn"` (with `.on` and `aria-current="page"` when `barPanel === 'settings'`), and `data-haptic="lock"`.
   - Sizing: `.gear-btn` inherits `.theme-btn`'s `min-height: 48px` and adds `padding: 6px; min-width: 48px; justify-content: center;` so header height does not change and the 48px touch target floor is preserved; `.top-right` tightens gap slightly to `var(--s-6)` at `<= 380px` so narrow phones stay overflow-free.
   - Navigation mechanism: `App` passes `onSettings` and `settingsActive={barPanel === 'settings'}` to `TopBar`. Clicking the gear runs the exact same mechanism as a bottom-bar tab tap:
     ```ts
     if (navPanelOf(getState().tab) !== 'settings') tapGoal.current = PANEL_ORDER.indexOf('settings');
     setState({ tab: 'settings' });
     ```
     This drives the strip's `useLayoutEffect` smooth scroll to panel index 3 (`settings`), gives pass-through + lock haptic ticks (via `data-haptic="lock"` + `tapGoal`), and stays silent if tapped while already on Settings.

3. **Settings screen & invariants preserved:**
   - `SettingsTab` content is completely unchanged (Rules, Planning, Driving alerts, Break buttons, Bug reports, Data, About, and hidden Testing card behind build-line long-press).
   - When to Roll & PTA, Weekly Recap, Plan hub/tools, Now-only duty-status dock, startup disclaimer pop-up, first-run flow, and PDF export are unchanged.
   - No user-facing `"More"` copy strings were edited in this patch (full inventory in §4 below).

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Added `I.gear` cog SVG path; added header gear button in `TopBar` `.top-right` between clock and theme button (`onSettings`, `settingsActive`); exported `BAR_ORDER = ['plan', 'now', 'log']` while keeping `PANEL_ORDER` for the 4-panel strip; switched `<nav class="tabs">` to render from `BAR_ORDER` and trimmed `TAB_META` to `plan`/`now`/`log`. |
| `web/public/styles.css` | Changed `.tabs` `grid-template-columns` from `1fr 1fr 1fr 1fr` to `1fr 1fr 1fr`; added `.gear-btn` (`padding: 6px; min-width: 48px; justify-content: center;`) and `.gear-btn.on` active ring; tightened `.top-right` gap to `var(--s-6)` inside `@media (max-width: 380px)`. |
| `web/test/dom/revisions.mjs` | Re-aimed pins `A1` (comment), `A2`, `S1`, `S3`, `S6`, `H8`, `H9`, `H10`, `H12` for the 3-tab bar + header gear; added new pins `G1`, `G2`, `G3`, `G4`. |
| `web/test/dom/layout.mjs` | Re-aimed Settings navigation, bar order/width assertions (4 → 3 tabs), swipe-to-Settings `bar` check (`null`/unlit), and Amendment A haptic glide tests to use the header gear button. |
| `web/test/dom/auditfix.mjs` | Re-aimed `go(p, 'More')` helper to click `header.top button[aria-label="Settings"]`. |
| `web/test/dom/c3browser.mjs` | Re-aimed Settings navigation click from `nav.tabs button /More$/` to `header.top button[aria-label="Settings"]`. |
| `web/test/dom/lebrowser.mjs` | Re-aimed Settings navigation click from `nav.tabs button /More$/` to `header.top button[aria-label="Settings"]`. |
| `web/test/dom/quickfix.mjs` | Re-aimed Settings button click from `getByRole('button', { name: /^More/ })` to `getByRole('button', { name: /^Settings$/ })`. |
| `web/test/dom/polish.mjs` | Re-aimed `tab('More')` helper to target `header.top button[aria-label="Settings"]`. |
| `web/test/dom/reimagine.mjs` | Re-aimed `tab(page, 'More')` helper to target `header.top button[aria-label="Settings"]`. |
| `web/test/dom/diag-swipe-touch.mjs` | Updated diagnostic `seat('More')` helper to click `header.top button[aria-label="Settings"]`. |
| `web/test/dom/diag-gemini.mjs` | Updated diagnostic `More` clicks to target `header.top button[aria-label="Settings"]`. |
| `HANDOFF-NAVGEAR.md` | This handoff document. |

---

## 3. Test Pin Changes & Justifications

Every pin change below is justified by **Lorico's 2026-11-21 nav-gear decision** (remove More from bottom bar → 3 tabs `Plan`, `Now`, `Log`; add Settings gear in TopBar; keep Settings as the 4th strip panel with no bottom-bar tab lit while on it). Zero test coverage was deleted.

### `web/test/dom/revisions.mjs`

**Kept / Re-aimed pins:**
- **`A1`** *(kept, comment updated)*: Still asserts `PANEL_ORDER` is `['plan', 'now', 'log', 'settings']`; comment updated to clarify it now governs the 4-panel swipe strip only.
- **`A2`** *(re-aimed)*: Now asserts `BAR_ORDER` is `['plan', 'now', 'log']` and `<nav class="tabs">` renders `['Plan', 'Now', 'Log']` (was 4 tabs including `'More'`).
- **`S1`** *(re-aimed)*: Still asserts the 4 `<main>` strip sections match `PANEL_ORDER` (`['page-plan', 'page-now', 'page-log', 'page-settings']`), and now asserts bottom-bar button ids/order equal `BAR_ORDER` (`['plan', 'now', 'log']`) instead of `PANEL_ORDER`.
- **`S3`** *(re-aimed)*: Scrolling the strip to `1200px` (`settings`) still sets `tab === 'settings'`, and now asserts `litTab() === null` (no bottom-bar tab lit on Settings, previously `'More'`).
- **`S6`** *(re-aimed)*: Activating Settings now clicks the header gear (`button[aria-label="Settings"]`), verifying it scrolls the strip to `1200`, activates `page-settings`, and leaves `litTab() === null`; bottom-bar taps for `Plan`/`Log`/`Now` still scroll to `0`/`800`/`400` and light only themselves.
- **`H10`** *(re-aimed)*: Amendment A pass-through + lock haptic counts re-aimed from `Plan → More` / `Now → More` bar taps to `Plan → Settings (header gear)` = 3 ticks (Now, Log, lock) and `Now → Settings (header gear)` = 2 ticks (Log, lock). Same strip travel and tick math, using the new header entry point.
- **`H12`** *(re-aimed)*: Backwards Amendment A (`Settings → Plan` = 3 ticks, `Settings → Now` = 2 ticks) plus fast-glide skip (`Plan → Settings` via header gear = 3 ticks) preserved with zero coverage loss.
- **`H8`** *(re-aimed)*: Mid-glide grab-and-cancel (`Now → Settings` via header gear grabbed back to `Now` = 0 ticks; swiped on to `Log` = 1 tick) preserved using `gearBtn()`.
- **`H9`** *(re-aimed)*: Plain buttons still keep their instant `[12]` click tick; lock-haptic opt-out (`data-haptic="lock"`) is now verified on all 3 bottom-bar tab buttons AND the header Settings gear button (previously 4 bottom-bar tab buttons).

**New pins added:**
- **`G1`**: Bottom bar renders exactly 3 buttons (`Plan`, `Now`, `Log` in order), matching `BAR_ORDER`, with no `More`/`Settings` button, plain equal class treatment, and 3-column CSS grid (`grid-template-columns: 1fr 1fr 1fr`) in `web/public/styles.css`.
- **`G2`**: `TopBar` `.top-right` DOM order is strictly `clock (.muted.clock) → gear (button.theme-btn[aria-label="Settings"][title="Settings"]) → theme (button.theme-btn)`, and the gear renders a real cog SVG path (not the 3-dot `I.more` path).
- **`G3`**: Activating the header gear lands on `tab === 'settings'`, scrolls the strip to `1200`, activates `section.page-settings` (not `inert`, not `aria-hidden`) with all 7 Settings cards visible (`Rules`, `Planning`, `Driving alerts`, `Break buttons`, `Bug reports`, `Data`, `About`), and leaves zero bottom-bar buttons active (`.on` or `aria-current="page"`).
- **`G4`**: Navigating back from Settings to `Plan`, `Now`, and `Log` via the bottom bar scrolls the strip to `0`/`400`/`800`, activates the target page, lights only the tapped bar button, and clears active state on the header gear.

### Other affected suites (for Ada's Modal gate)
- **`web/test/dom/layout.mjs`**:
  - Tab-sweep (`TABS`), Gemini banner E check, section `(e)` `tapNav`, section `(f)` `tapNav`, and section `(g)` PDF setup re-aimed to click `header.top button[aria-label="Settings"]` instead of `nav.tabs button` `'More'`.
  - Section `(c)` swipe legs re-aimed so landing on `settings` asserts no bottom-bar button is lit (`!a.bar`).
  - Section `(c)` Amendment A haptic glide tests re-aimed to tap the header gear for `Now → Settings` (2 ticks) and `Plan → Settings` (3 ticks) while keeping `Settings → Now` (2 ticks) and `Settings → Plan` (3 ticks) intact.
  - Section `(e)` order pin re-aimed to assert `bar === ["Plan","Now","Log"]`, `strip === ["page-plan","page-now","page-log","page-settings"]`, AND `TopBar .top-right` DOM order `["clock","gear","theme"]`.
  - Section `(e)` equal-width pin re-aimed from 4 columns (`W / 4`) to 3 equal columns (`W / 3`, `widths.length === 3`).
  - Section `(e)` `offChecks` pin re-aimed so `Settings` asserts `activePage === 'page-settings'` and `litBar === null` while `Plan`/`Now`/`Log` light only themselves.
- **`web/test/dom/auditfix.mjs`**: `go(p, tab)` helper re-aimed to click `header.top button[aria-label="Settings"]` when `tab` is `'More'` or `'Settings'` (covers D18, A8, A9, timezone-picker, and C5 build-line long-press tests).
- **`web/test/dom/c3browser.mjs`**: Re-aimed `More` click (line 189) to `header.top button[aria-label="Settings"]`.
- **`web/test/dom/lebrowser.mjs`**: Re-aimed `More` click (line 132) to `header.top button[aria-label="Settings"]`.
- **`web/test/dom/quickfix.mjs`**: Re-aimed `getByRole('button', { name: /^More/ })` (line 76) to `getByRole('button', { name: /^Settings$/ })`.
- **`web/test/dom/polish.mjs`**: Re-aimed `tab(t)` helper (line 68) to target `header.top button[aria-label="Settings"]` for `'More'`/`'Settings'`.
- **`web/test/dom/reimagine.mjs`**: Re-aimed `tab(page, t)` helper (line 64) to target `header.top button[aria-label="Settings"]` for `'More'`/`'Settings'`.
- **`web/test/dom/diag-swipe-touch.mjs` & `web/test/dom/diag-gemini.mjs`**: Updated diagnostic scripts' `More` clicks to target `header.top button[aria-label="Settings"]`.

---

## 4. Remaining User-Facing `"More"` Copy References (Untouched — For Follow-Up)

Per spec requirement #5, no user-facing `"More"` wayfinding copy was edited in this patch. Below is every remaining user-facing reference to `"More"` as the Settings screen across `web/src/` and `web/public/` (About/disclaimer verbatim text contains no `"More"` reference and was not touched):

1. **`web/src/app.tsx:6249`** (`LoadTab` — "Can I take this load?"):
   > `Assumes {s.mph} mph average, fuel and traffic included — change it under More.`
2. **`web/src/app.tsx:6323`** (`TripTab` — "Plan a run"):
   > `Net speed (fuel, traffic, scales) is what matters — set it under More. Parking after 17:00 fills fast; plan the 60-min line, not the 0.`
   *(Note: `web/test/dom/auditfix.mjs:244` currently pins `P4 trip planner: "under More", never "in Settings"` — Ada's copy follow-up will need to re-aim that pin when updating this string.)*
3. **`web/src/app.tsx:6999`** (`SpeakAskDialog` — read-aloud prompt):
   > `You can change this later under More → Driving alerts.`
4. **`web/src/app.tsx:7228`** (`App` — simulated clock warning banner):
   > `Simulated clock. Every time on screen is worked out for {clock(now)} — a made-up time set under More → Testing, not the real time. Anything you change while it is up is thrown away when you go back to the real clock.`
5. **`web/src/app.tsx:7233`** (`App` — Day-theme default notice card):
   > `Switched to the Day theme — it is the new default. The header switch or More will put it back to Night.`

*(No other user-facing `"More"` navigation strings exist in `web/src/`, `web/public/`, or `engine/src/`; remaining `"more"` matches are ordinary English quantity words like "or more", "more battery", "and N more", plus source comments.)*

---

## 5. Local Check Results (`TZ=America/Chicago`)

All light local checks passed (full browser gate deferred to Ada on Modal):

- **Typecheck** (`TZ=America/Chicago npm run typecheck`): **PASS** (exit 0)
- **Production build** (`TZ=America/Chicago npm run build`): **PASS** (`dist/app.js 330.1kb`, built `2026-11-21 14:21`)
- **Revisions DOM suite** (`TZ=America/Chicago node dist-test/dom-revisions.mjs`): **PASS — 63/63 pins pass** (including all re-aimed nav/haptic pins and new `G1`–`G4` pins)
- **Engine / Store hash verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required guard hash exactly.
