# HANDOFF — POLISH (Unified Motion System + Log-Entry Origin Morph)

Date: 2026-11-22. Tree: `/home/lae/hos-build/work-polish`.
Files modified: `web/public/styles.css`, `web/src/app.tsx`, `web/test/dom/revisions.mjs`, `web/test/dom/layout.mjs`.
Hard-fence verification:
- `git hash-object web/src/store.ts` = `1323046db6ba07b8c85805f89a103dc16f3776b5` (byte-identical).
- `engine/` untouched (zero modified files; zero HOS rules-math changes).
- Zero new runtime dependencies (vanilla CSS, CSS custom properties, Preact state/refs/effects only).
- Compositor-only spatial animation (`transform`, `opacity`); color-only transitions on Day/Night theme flip.
- Universal `@media (prefers-reduced-motion: reduce)` neutralization across every animated surface and JS exit-retention bypass.

---

## 1. Motion System Tokens & Surface Classes

Defined in one block (`SPLIT DECISION MOTION SYSTEM`, `web/public/styles.css`):

| Token | Value | Role |
|---|---|---|
| `--dur-press` | `90ms` | Tactile button press/release (`transform`, `box-shadow`) |
| `--dur-micro` | `140ms` | Micro-transitions: toggle knobs, active tab bar indicator, inner sheet step body swap |
| `--dur-exit` | `200ms` | **All exits** (sheets, morph-return, modals, rooms) & in-place state swaps (Timeline↔Dial, End of Day, Log day/view swap, Plan tool-to-tool swap, Load wizard steps, DrivingView entry) |
| `--dur-room` | `240ms` | Full-screen room entrances (Settings + all 8 Plan tools) & centered modal entrances (`DisclaimerDialog`, `SpeakAskDialog`) |
| `--dur-theme` | `280ms` | Day/Night palette & `@property` color cross-fade (no geometry) |
| `--dur-sheet` | `320ms` | Bottom-sheet entrances (all 14 sheet kinds) & Log-entry origin morph expansion |
| `--ease-enter` | `cubic-bezier(0.22, 0.14, 0.45, 1)` | All entrances (sheets, morph-in, rooms, modals) |
| `--ease-exit` | `ease-out` | All exits — **preserves Lorico's approved `200ms ease-out` slide-down verbatim** |
| `--ease-state` | `cubic-bezier(0.25, 0.10, 0.45, 1)` | In-place state dissolves, reveals, toggles, active tab indicator |

Surface-class summary:
1. **Full-screen rooms (Settings + 8 Plan tools)**: Pure opacity cross-fade (`240ms --ease-enter` in, `200ms --ease-exit` out, 220ms retained unmount for closing Plan tools). No `transform` on `.page.room` so `position: sticky` headers inside Settings/Split remain valid. Switching directly between Plan tools applies `.room-swap` (`state-dissolve 200ms --ease-state`); Load Check wizard steps 1–5 apply `.flow-body.step-dissolve` (`200ms --ease-state`).
2. **All 14 bottom sheets** (`status`, `since`, `quickstart`, `drift`, `why`, `exceptions`, `lever`, `splitblock`, `loadtime`, `triptime`, `rollouttime`, `rescuetime`, `edit`, `add`, `confirm`): Unified base `.sheet` / `.sheet-wrap` lifecycle. Base `.sheet` is parked off-screen (`transform: translateY(100%)`) and `.sheet-backdrop` starts at `opacity: 0` so pre-animation paints never flash a static twin. Enters at `320ms --ease-enter`; exits at `200ms --ease-exit` with `220ms` retained-exit (`inert` + `aria-hidden`, `pointer-events: none`) while immediately releasing `currentSheet()` / `blocked` / `backNav`. Direct sheet-to-sheet switches, disclaimer, driving-view flips, and `prefers-reduced-motion` bypass exit retention and unmount immediately. Multi-step sheets (`EditorSheet`, `QuickStartSheet`, `SinceSheet`) dissolve step bodies via `data-step-swap="1"` (`140ms --ease-state`) while handle and header stay anchored.
3. **Centered modal dialogs (`DisclaimerDialog`, `SpeakAskDialog`)**: Backdrop `opacity: 0 → 1`, modal `translate3d(0, 8px, 0) scale(0.96) → identity` at `240ms --ease-enter`; exits via `200ms --ease-exit` (`translate3d(0, 6px, 0) scale(0.97)`) with `220ms` retained `.is-closing` (`inert`, `role` removed).
4. **In-place state swaps & micro-transitions**:
   - Now Timeline ↔ Dial: `.hero.now-card-dissolve > :not(.card-switch)` pure opacity `200ms --ease-state` (switch stays solid under the thumb).
   - Now open-day ↔ End of Day chooser ↔ closed-day: `.day-swap-in` (`state-reveal`: `opacity 0→1`, `translate3d(0, 4px, 0)→0`, `200ms --ease-state`); Reopen/Undo buttons stay immediately clickable.
   - Log day nav & Entries ↔ What the clocks count: `.log-swap-in` (`state-dissolve`, `200ms --ease-state`).
   - DrivingView arrival: `main.drive.drive-enter` (`state-dissolve`, `200ms --ease-state`).
   - Preview snap-back (`.pv-snapmark + .hero`): `pv-slide 200ms --ease-state`.
   - Tab bar active indicator (`.tabs button::before`) & slide-switch toggles (`label.check input::after`): `140ms --ease-state`.

---

## 2. Refresh-Rate Independence (60Hz vs 90/120Hz vs Battery Saver)

Why the previous curves diverged across refresh rates:
- Early curve `(0.32, 0.72, 0.35, 1)`: initial slope `v₀ = 2.25`, peak velocity `2.34×` at `t = 11%`, `88.6%` of travel done by midpoint, only `1.9%` in the final quarter — at 120Hz (8.3ms frames) the eye resolved a sharp snap followed by a slow creep.
- Previous slowslide `(0.33, 0.35, 0.25, 1)` at `450ms`: softer start (`v₀ = 1.06`), but still spiked to `2.29×` at `t = 24%` with only `3.0%` travel in the final quarter.

How this system fixes it:
- **`--ease-enter: cubic-bezier(0.22, 0.14, 0.45, 1)`** caps initial velocity at `v₀ = 0.64`, caps peak velocity at **`1.70×`** (at `t = 24%`), reaches `34.7%` at Q1 and `72.1%` at midpoint, and keeps **`6.4%` of travel in the final quarter**.
- **`--ease-state: cubic-bezier(0.25, 0.10, 0.45, 1)`** has `v₀ = 0.40`, peak velocity **`1.72×`** (at `t = 28%`), and **`6.8%` in the final quarter**.
- Because neither curve has an early velocity spike or a flat dead tail, 60Hz (~19 frames @ 320ms), 120Hz (~38 frames @ 320ms), and throttled battery saver all sample a single continuous deceleration arc — never two perceived motions — and settle cleanly at `320ms` instead of lingering to `450ms`.
- Every entering overlay starts parked off-screen/transparent in its base CSS rule, eliminating frame-0 static flashes on throttled CPUs.

---

## 3. Log-Entry Origin Morph Technique

Implemented across `openLogEntryEditor`, `resolveLogEntryRect`, `applyMorphVars`, `Sheet`, `EditorSheet`, and `LogTab` (`web/src/app.tsx` + `web/public/styles.css`):

- **Deterministic row identity**: Every Log entry button (`button.entry`) carries `data-entry-key` (`"live"` for the open status row; `${status}-${start}-${end}${tentative ? '-t' : ''}` for logged/what-if rows).
- **Open (FLIP before frame 0)**: Tapping a Log row captures its `getBoundingClientRect()` into `activeMorphOrigin` and opens `EditorSheet` with `.morph-origin`. In `Sheet`'s `useLayoutEffect` (synchronously before first paint), `applyMorphVars()` measures the sheet's true un-transformed layout dimensions (`offsetWidth`/`offsetHeight`, unaffected by CSS `transform`) and viewport container `.sheet-wrap`, computes the center-to-center delta `(--morph-dx, --morph-dy)` and clamped aspect scale `(--morph-sx ∈ [0.84, 0.98], --morph-sy ∈ [0.32, 0.75])`, and sets them as inline CSS custom properties. Base CSS parks `.sheet.morph-origin` at that exact origin transform with `opacity: 0`, then `sheet-morph-in` (`320ms --ease-enter`) fades rapidly to `opacity: 1` by 28% while expanding smoothly from the tapped row into the resting bottom sheet. Meanwhile, the source row softens to `opacity: 0.45` (`.is-morph-source`).
- **Inner edits preserve origin**: Stepping through `EditorSheet` (`menu → what / when / long → check`) keeps the same `sheetSessionKey`, preserving `activeMorphOrigin` without replaying entrance; only the inner body dissolves (`140ms`). Saving a status or time change calls `updateActiveMorphKey()` so the close morph targets the updated row's new key/position.
- **Close (live return + off-screen/deleted fallback)**: On close, `.is-morph-source` clears immediately (row transitions `0.45 → 1` over `200ms`) while `Sheet` enters `.is-closing`. `useLayoutEffect` calls `resolveLogEntryRect(closeKey)` against `section.page-log.is-active .log-scroll`, checking that the row still exists and is visible inside the scrollport (with an 8px visibility margin).
  - **Row visible**: Recomputes `--morph-dx/dy/sx/sy` for the row's current on-screen rect and sheet's current height, playing `sheet-morph-out` (`200ms --ease-exit`, holding solid opacity through 72% as it returns into the row, dissolving out in the final 28%).
  - **Row scrolled off-screen, moved to another day, or deleted**: Adds `.morph-fallback` synchronously before paint. `.sheet.morph-origin.is-closing.morph-fallback` explicitly sets `opacity: 1` (preventing fallback from inheriting the base `opacity: 0` park) and runs `sheet-slide-down 200ms --ease-exit`.
- **Reduced motion**: Under `prefers-reduced-motion: reduce`, `useLayoutEffect` skips FLIP math, CSS sets `animation: none; transform: none; opacity: 1;` (and `button.entry.is-morph-source { opacity: 1; }`), and closing unmounts immediately.

---

## 4. Per-Surface Notes & Deliberate Non-Changes

- **`SheetMotionCtx` + `QuickStartSheet` (`qs-form`)**: `Sheet` accepts explicit `closing`/`morphOrigin` props and falls back to `SheetMotionCtx`. `QuickStartSheet`'s `qs-form` branch keeps the exact `<Sheet title="Start from my ELD clocks" focusKey="qs-form">` signature (receiving `closing` through `SheetMotionCtx`) so `web/test/smoke.mjs` pin C2's source slice remains untouched.
- **Slide-down exit preserved**: Every bottom sheet and fallback dismiss uses `200ms ease-out` with `220ms` retained-exit lifecycle — identical to Lorico's approved slide-down.
- **Native horizontal panel strip (`Plan — Now — Log`) left on native scroll-snap**: Native touch drag, momentum physics, and haptic pass-through/lock ticks (`onPagesScroll` + `scrollTo({ behavior: smooth ? 'smooth' : 'auto' })`) are deliberately preserved untouched; only the tab-bar active underline (`::before`) was folded into `--dur-micro`/`--ease-state`.
- **Add-entry sheet (`+ Add a break or something I forgot`) & "Add inside this entry"**: Intentionally use the standard bottom-sheet slide-up/down (not row morph), since they create a new entry rather than editing an existing row.
- **Theme transitions (`280ms ease`)**: Kept color-only across `@property` custom properties and surfaces; untouched in layout or timing spirit, neutralized under `prefers-reduced-motion`.

---

## 5. Re-Aimed & Added Test Pins

No pin was deleted or weakened. Every re-aimed pin asserts the new unified system in the exact same spirit:

### `web/test/dom/revisions.mjs`
1. **R6** (`rollout screen has no raw <input type="time">`): Added `await sleep(260)` after `openSheet(null)` because `RolloutTimeSheet` now participates in the unified 200ms retained-exit lifecycle before unmounting.
2. **T2** (`transitions (b)`): Re-aimed room CSS regexes from hardcoded `220ms` to `var(--dur-room) var(--ease-enter)` / `var(--dur-exit) var(--ease-exit)`.
3. **P2** (`plan-dissolve` CSS): Same token-based regex re-aim for `.page.room` / `.page.room.is-active`.
4. **P4** (`plan-dissolve` hardware Back): Asserts first hardware Back immediately clears `currentSheet()` and marks `RolloutTimeSheet` `.is-closing` (no open sheet remains), then unmounts after `240ms`.
5. **N2 / N3 / N4** (`nowstrip`): Re-aimed from "only LeverSheet slides" to verifying all bottom sheets (`LeverSheet`, `WhySheet`, `StatusSheet`, `ExceptionsSheet`, `EditorSheet`, `QuickStartSheet`) share the unified `320ms --ease-enter` / `200ms --ease-exit` retained-exit lifecycle and reduced-motion reset.
6. **ES1 / ES2** (`eldslide`): Re-aimed from "DriftSheet only" to verifying `DriftSheet` and sibling sheets (`why`, `status`, `exceptions`, `add`) share the unified bottom-sheet lifecycle while direct switch / disclaimer / driving view still bypass exit retention immediately.
7. **RT1** (`retime / motion system`): Re-aimed sheet + backdrop entrance assertion from `450ms cubic-bezier(0.33, 0.35, 0.25, 1)` to `320ms cubic-bezier(0.22, 0.14, 0.45, 1)` via tokens; exit (`200ms ease-out`) and `220ms` retained lifecycle unchanged.
8. **Added MS1, MS2, MS3**: New DOM/CSS pins covering Log-entry morph CSS & DOM lifecycle (`data-entry-key`, `.morph-origin`, `.is-morph-source`), centered modal CSS, End-of-Day `.day-swap-in` (keeping Reopen/Undo clickable), and Plan inner step dissolve CSS.

### `web/test/dom/layout.mjs`
1. **Section `(h)` (`nowstrip`)**: Re-aimed computed entrance check on `LeverSheet` from `0.45s cubic-bezier(0.33, 0.35, 0.25, 1)` to `0.32s cubic-bezier(0.22, 0.14, 0.45, 1)` (412×915 & 360×640); re-aimed `WhySheet` check to assert unified `0.32s` slide-up / `0.2s ease-out` slide-down instead of instant unmount.
2. **Section `(j)` (`eldslide`)**: Same computed-style re-aim for `DriftSheet` + `WhySheet` (412×915 & 360×640).
3. **Section `(k)` (`retime`)**: Re-aimed combined `LeverSheet` + `DriftSheet` computed entrance assertions to `0.32s cubic-bezier(0.22, 0.14, 0.45, 1)` (exit `0.2s ease-out` unchanged).
4. **Section `(l)` (`slidepark` SP1a/SP1b)**: Re-aimed CSS inspection from `.sheet.slide-up` to base `.sheet` (since all 14 sheets now share the parked `transform: translateY(100%)` base rule and reduced-motion `transform: none` reset).
5. **Added Section `(m)` (M0–M5, 412×915 & 360×640)**: Real-browser Chromium pins verifying M0 (End-of-Day `state-reveal`), M1 (Log-entry tap -> `sheet-morph-in` + live FLIP custom properties + zero overflow), M2 (visible-row close -> `sheet-morph-out 0.2s ease-out` -> unmount), M3 (off-screen scrolled row close -> `.morph-fallback` + `sheet-slide-down 0.2s ease-out` + `opacity === '1'` -> unmount), M4 (`prefers-reduced-motion` disables morph & unmounts immediately), M5 (centered modal `DisclaimerDialog` enter `0.24s` / close `0.2s ease-out` inert -> unmount).

---

## 6. Verification Results (Honest Local Run)

All commands run sequentially in foreground with `TZ=America/Chicago`, Playwright (`playwright-core` + `chrome-headless-shell` 1234):

| Check / Suite | Result | Details |
|---|---|---|
| `git hash-object web/src/store.ts` | **PASS** | `1323046db6ba07b8c85805f89a103dc16f3776b5` (unchanged) |
| `engine/` diff / mtime check | **PASS** | Zero files modified |
| `cd web && npm run build` | **PASS** | `tsc --noEmit` + `esbuild` (`dist/app.js` 374.0kb, 0 errors) |
| `cd web && npm run smoke` | **PASS** | `typecheck`, `contrast` (44/44 day, 44/44 night), `nightlight`, `ocr-bundle`, `smoke.mjs`, and all 9 `dom` suites (`yesback`, `c1flush`, `adjuststart`, `scrub`, `c3`, `c3relaunch`, `logedit` 37/37, `cascade` 16/16, `rescue` 11/11) |
| `test/dom/revisions.mjs` | **PASS** | **87/87 pins pass** |
| `test/dom/gemini.mjs` | **PASS** | **20/20 pins pass** |
| `test/dom/layout.mjs` | **PASS** | **405/405 pass** (`LAYOUT OK`) |
| `test/dom/auditfix.mjs` | **PASS** | **185/185 pass** (`AUDITFIX OK`) |
| `test/dom/polish.mjs` | **PASS** | **275/275 pass** (`POLISH OK`) |
| `test/dom/quickfix.mjs` | **PASS** | **20/20 pass** (`QUICKFIX OK`) |
| `test/dom/lebrowser.mjs` | **PASS** | **84/84 pass** (`LOGEDIT BROWSER OK`) |
| `test/dom/reimagine.mjs` *(legacy)* | 292 pass, 6 fail | Pre-existing non-motion failures: 360px dock key width (67px vs old 72px) & load-question position moved off Now in Declutter round |
| `test/dom/c3browser.mjs` *(legacy)* | 64 pass, 6 fail | Pre-existing non-motion failures: Recap lead sentence format & old More pointer row removed in D18 |
| `test/dom/c2browser.mjs` *(legacy)* | 21 pass, 25 fail | Pre-existing non-motion failures: legacy seed lacks `disclaimerAcked: true` (startup modal blocks taps) & older Split assertions |
