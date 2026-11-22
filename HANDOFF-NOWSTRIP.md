# HANDOFF — Now "Comes Back" Strip: Text Fit + Scoped Slide-Up Sheet (`work-nowstrip`)

- **Date:** 2026-11-22
- **Builder:** Antigravity
- **Tree:** `/home/lae/hos-build/work-nowstrip` (presentation-only patch stacked on commit `0ebee1f`, the Plan-tools room dissolve build)
- **Decision / Spec:** Lorico 2026-11-22 (~00:40 CT, voice + screenshot) — two issues on the Now screen "comes back" strip:
  1. Full strip text does not fit cleanly at phone width (~360–400px).
  2. Its pop-up detail sheet should slide up quickly from the bottom (NOT dissolve) and slide back down on close, scoped strictly to that sheet kind while all other sheets keep their current behavior.
- **Engine / Store Guard:**
  ```
  git hash-object web/src/store.ts = 1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Byte-identical. `engine/`, `web/src/store.ts`, `web/src/backnav.ts`, `web/src/levers.ts`, `web/src/rollout.ts`, `web/src/recap.ts`, and `web/src/rescue.ts` are untouched.

---

## 1. Exact Target Identification & Mechanism

### 1.1 Fix 1 — Now Screen "Comes Back" Strip Text Fit (`web/public/styles.css`)
- **DOM element:** The visible strip directly under the Now screen's timeline card rendering e.g. `"At Mon 18:00 (18:00 Central), +12h 59m comes back → 10h 47m available"` is `button.lever` rendered by `LeverChips` (`web/src/app.tsx`, using `leverTitle(l)` L4 from `web/src/levers.ts`). (`TimeAxis`'s `<p class="vh">{twin}</p>` is visually hidden for screen readers and remains unchanged.)
- **Root cause:**
  - The Tactile Pass rule set `.lever-text b { font-size: 18px; font-weight: 800; }`, which was oversized for a ~69-character strip sentence inside a 360px viewport.
  - `.lever-text` lacked `min-width: 0` (preventing clean flex shrinking), and the trailing chevron `.lever > svg` lacked `flex-shrink: 0`.
- **Fix (append-only block in `web/public/styles.css`):**
  - Tightened `.lever` inner spacing (`gap: var(--s-8); padding: var(--s-8) var(--s-10) var(--s-8) var(--s-12);`) while keeping the Tactile Pass `min-height: var(--ctl-lg)` (64px) rule untouched.
  - Added `.lever > svg { flex-shrink: 0; }` and `.lever-text { min-width: 0; overflow-wrap: break-word; }`.
  - Reduced `.lever-text b` to `font-size: 14px; font-weight: 700; line-height: 1.3; overflow-wrap: break-word;` (and `13.5px` under `@media (max-width: 380px)`), and `.lever-sub` to `font-size: 13px; line-height: 1.3; overflow-wrap: break-word;`.
  - No truncation (`text-overflow: ellipsis` is not used); the full time, `(dayStartLabel)`, `+duration`, and `available` figure remain visible and wrap cleanly to ≤ 2 lines at both 360px and 412px.
  - Existing palette tokens only (`--text`, `--muted`, `--t-key`, `--accent`, `--line`); WCAG AA contrast pins remain 44/44 day and 44/44 night.
  - Also ensured `.sheet.slide-up .sheet-head h2` uses `min-width: 0; font-size: 18px; line-height: 1.25; overflow-wrap: break-word;` so the same full sentence fits cleanly inside the pop-up header at 360px.

### 1.2 Fix 2 — Scoped Slide-Up Pop-Up Sheet (`web/src/app.tsx` + `web/public/styles.css`)
- **Exact sheet kind:** `sheet.kind === 'lever'` (`<LeverSheet>`), which is opened ONLY from the Now screen's `button.lever` strip (`LeverChips`) and the comeback sleeper lane tap on `RestHero`'s `TimeAxis`.
- **Scoping (`web/src/app.tsx`):**
  - Extended `Sheet` with optional `slideUp?: boolean` and `closing?: boolean` props.
  - Only `LeverSheet` passes `slideUp` and `closing`. When `slideUp` is set, `.sheet-wrap` gets `.slide-up` and `.sheet` gets `.slide-up` (plus `.is-closing` while exiting, with `inert` and `aria-hidden="true"` on `.sheet-wrap` and focus/Escape effects paused during close).
  - All other 13 sheet kinds (`status`, `since`, `quickstart`, `drift`, `why`, `exceptions`, `splitblock`, `loadtime`, `triptime`, `rollouttime`, `rescuetime`, `edit`/`add`, `confirm`) do not pass `slideUp` and keep their exact existing markup and behavior.
- **Retained exit lifecycle (`App()` in `web/src/app.tsx`):**
  - Following the same discipline as `retainedTool` for room dissolve, `App()` tracks `retainedLever` so closing `LeverSheet` (via Close button, backdrop tap, Escape, or hardware Back) immediately sets `currentSheet() === null` (releasing `blocked` and `backNav` immediately) while keeping `<LeverSheet closing={true} />` mounted (inert + `aria-hidden="true"`) for `220ms` so the `200ms` slide-down animation completes cleanly before unmount.
  - Switching directly to another sheet, showing the disclaimer, entering driving view, or having `prefers-reduced-motion: reduce` active skips exit retention and unmounts `LeverSheet` immediately.
- **Motion & reduced-motion CSS (`web/public/styles.css`):**
  - `.sheet-wrap.slide-up { overflow: hidden; }` prevents off-screen `translateY(100%)` from affecting viewport overflow.
  - `.sheet.slide-up` runs `@keyframes sheet-slide-up` (`translateY(100%)` → `translateY(0)`, `200ms ease-out both`) with matching backdrop fade (`sheet-backdrop-in 200ms ease-out both`).
  - `.sheet.slide-up.is-closing` runs `@keyframes sheet-slide-down` (`translateY(0)` → `translateY(100%)`, `200ms ease-out both`, `pointer-events: none`) with matching backdrop fade-out (`sheet-backdrop-out 200ms ease-out both`).
  - `@media (prefers-reduced-motion: reduce)` sets `animation: none;` on `.sheet.slide-up`, `.sheet.slide-up.is-closing`, and their backdrops.

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Added optional `slideUp` / `closing` props on `Sheet`; applied `slideUp` + `closing` exclusively on `LeverSheet`; added `retainedLever` exit-retention hook in `App()` (220ms exit window, disabled under `prefers-reduced-motion: reduce` or immediate sheet switch). |
| `web/public/styles.css` | Appended `NOW "COMES BACK" STRIP + SCOPED SLIDE-UP SHEET` block (before `@page`): `.lever` / `.lever-text` / `.lever-text b` / `.lever-sub` / `.lever > svg` phone-fit reflow rules, `.sheet.slide-up` + `.is-closing` 200ms `@keyframes` slide-up/slide-down & backdrop fade rules, `.sheet.slide-up .sheet-head h2` wrapping, and `@media (prefers-reduced-motion: reduce)` `animation: none`. |
| `web/test/dom/revisions.mjs` | Added 4 new DOM pins **`N1`–`N4`** covering L4 strip text & reflow CSS, `.sheet.slide-up` scoping (on `LeverSheet`, absent on `why`/`status`/`exceptions`/`drift`/`add`), exit retention + immediate unmount of non-lever sheets, and `prefers-reduced-motion: reduce` disable + immediate unmount. |
| `web/test/dom/layout.mjs` | Added section **`(h)`** (12 new real-browser pins across `412×915` and `360×640`) verifying zero horizontal overflow, full non-truncated L4 text wrapping cleanly inside `button.lever` (≤ 2 lines, ≥ 64px row floor), `sheet-slide-up` / `sheet-slide-down` (`0.2s`) computed CSS animations and `.is-closing` inert unmount on `LeverSheet`, no `.slide-up` / `animationName: none` on `Why?`, and `animationName: none` + immediate unmount under `emulateMedia({ reducedMotion: 'reduce' })`. |
| `HANDOFF-NOWSTRIP.md` | This handoff document. |

---

## 3. Local Verification Results (`TZ=America/Chicago`)

All required suites ran locally and passed 100% (Playwright browser suites ran locally against `chrome-headless-shell` with zero flakes — no layout rerun needed):

- **Typecheck & Production Build** (`TZ=America/Chicago npm run build`): **PASS** (`tsc --noEmit` exit 0; `dist/app.js 366.4kb`, built `2026-11-22 07:43`)
- **Full Smoke + DOM Gate** (`TZ=America/Chicago npm run smoke`): **PASS**
  - `test/contrast.mjs`: **PASS** (day **44/44**, tightest 1.15×; night **44/44**, tightest 1.24×)
  - `test/nightlight.mjs`: **PASS** (`nightlight: OK`)
  - `test/ocr-bundle.mjs`: **PASS**
  - `test/smoke.mjs`: **PASS** (`OK`)
  - `npm run dom` (all 9 suites):
    - `yesback.mjs`: **6/6 PASS**
    - `c1flush.mjs`: **7/7 PASS** (`C1FLUSH OK`)
    - `adjuststart.mjs`: **39/39 PASS** (`ADJUSTSTART OK`)
    - `scrub.mjs`: **30/30 PASS** (`C2SCRUB OK`)
    - `c3.mjs`: **46/46 PASS** (`C3 OK`)
    - `c3relaunch.mjs`: **3/3 PASS** (`C3 RELAUNCH OK`)
    - `logedit.mjs`: **37/37 PASS** (`LOGEDIT OK`)
    - `cascade.mjs`: **16/16 PASS** (`CASCADE OK`)
    - `rescue.mjs`: **11/11 PASS**
- **Revisions DOM Suite** (`dist-test/dom-revisions.mjs`): **76/76 PASS** (72 existing + 4 new `N1`–`N4`)
- **Gemini DOM Suite** (`dist-test/dom-gemini.mjs`): **20/20 PASS**
- **Layout Browser Suite** (`test/dom/layout.mjs`): **362/362 PASS** (`LAYOUT OK`, 0 fail on first run — no 1px TimeAxis flake observed; includes all 12 new `(h)` nowstrip pins at `412×915` and `360×640`)
- **Auditfix Browser Suite** (`test/dom/auditfix.mjs`): **185/185 PASS** (`AUDITFIX OK`)
- **Polish Browser Suite** (`test/dom/polish.mjs`): **275/275 PASS** (`POLISH OK`)
- **Additional Browser Suites Run:** `lebrowser.mjs` **84/84 PASS**, `quickfix.mjs` **20/20 PASS**
- **Store Guard Hash Verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required hash byte-for-byte. Nothing deployed or pushed.
