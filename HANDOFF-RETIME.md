# HANDOFF — Retime Bottom Sheet Slide-Up Entrance (`work-retime`)

- **Date:** 2026-11-22
- **Builder:** Antigravity
- **Tree:** `/home/lae/hos-build/work-retime` (presentation-only patch stacked on live `work-eldslide`, main commit `006eacc`)
- **Decision / Spec:** Lorico 2026-11-22 (on the live app) — The slide-UP of the bottom pop-up sheets (`LeverSheet` and `DriftSheet`) feels too fast, while the slide-DOWN is perfect and must not be touched ("Match the slide up with the slide down"). Retime the **entrance only** (`300ms cubic-bezier(0.32, 0.72, 0.35, 1)`) so its perceived motion matches the untouched `200ms ease-out` slide-down exit.
- **Engine / Store Guard:**
  ```
  git hash-object web/src/store.ts = 1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Byte-identical. `engine/`, `web/src/app.tsx`, `web/src/store.ts`, `web/src/backnav.ts`, `web/src/levers.ts`, `web/src/rollout.ts`, `web/src/recap.ts`, and `web/src/rescue.ts` are completely untouched.

---

## 1. Exact CSS Values Changed (`web/public/styles.css`)

Only the two entrance animation declarations in the existing `NOW "COMES BACK" STRIP + SCOPED SLIDE-UP SHEET` block (shared by `LeverSheet` and `DriftSheet`) were changed:

| Selector | Property | Before | After |
| --- | --- | --- | --- |
| `.sheet.slide-up` | `animation` | `sheet-slide-up 200ms ease-out both;` | `sheet-slide-up 300ms cubic-bezier(0.32, 0.72, 0.35, 1) both;` |
| `.sheet-wrap.slide-up > button.sheet-backdrop` | `animation` | `sheet-backdrop-in 200ms ease-out both;` | `sheet-backdrop-in 300ms cubic-bezier(0.32, 0.72, 0.35, 1) both;` |

### Explicitly Untouched
- **Exit rules:**
  - `.sheet.slide-up.is-closing`: remains `animation: sheet-slide-down 200ms ease-out both;`
  - `.sheet-wrap.slide-up.is-closing > button.sheet-backdrop`: remains `animation: sheet-backdrop-out 200ms ease-out both;`
- **Keyframes:** `@keyframes sheet-slide-up`, `@keyframes sheet-slide-down`, `@keyframes sheet-backdrop-in`, and `@keyframes sheet-backdrop-out` are byte-identical.
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` (`animation: none;` for all four selectors) is byte-identical.
- **App lifecycle (`web/src/app.tsx`):** Zero changes — the `220ms` retained-exit lifecycle (`retainedLever` and `retainedDrift`) belongs to the untouched `200ms` exit and remains byte-identical.

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/public/styles.css` | Updated `.sheet.slide-up` and `.sheet-wrap.slide-up > button.sheet-backdrop` entrance animations from `200ms ease-out both` to `300ms cubic-bezier(0.32, 0.72, 0.35, 1) both` and updated the block header comment. Exit rules, keyframes, reduced-motion block, and palette tokens untouched. |
| `web/test/dom/revisions.mjs` | Updated **`N4`** CSS-text assertions to check the new `300ms cubic-bezier(0.32, 0.72, 0.35, 1) both` entrance rules (sheet + backdrop) alongside explicit checks that exit rules remain `200ms ease-out both` (`sheet-slide-down` + `sheet-backdrop-out`). Added new pin **`RT1`** verifying exact entrance/exit CSS declarations, untouched keyframes and reduced-motion override, and live `.slide-up` → `.is-closing` retained-exit lifecycle on both `LeverSheet` and `DriftSheet`. |
| `web/test/dom/layout.mjs` | Updated sections **`(h) nowstrip`** (`LeverSheet`) and **`(j) eldslide`** (`DriftSheet`) across `412×915` and `360×640` to assert entrance `0.3s` + `cubic-bezier(0.32, 0.72, 0.35, 1)` on both sheet (`sheet-slide-up`) and backdrop (`sheet-backdrop-in`), and added explicit assertions that exit still computes `0.2s` + `ease-out` on both sheet (`sheet-slide-down`) and backdrop (`sheet-backdrop-out`). Added new section **`(k) retime`** (1 pin per viewport width, 2 pins total) verifying entrance (`0.3s cubic-bezier(0.32, 0.72, 0.35, 1)`) vs exit (`0.2s ease-out`) on both `LeverSheet` and `DriftSheet` with zero horizontal overflow. |
| `HANDOFF-RETIME.md` | This handoff document. |

---

## 3. Pins Updated & Added

### `web/test/dom/revisions.mjs` (84/84 PASS)
- **`N4` (updated):** Verifies `.sheet.slide-up` declares `sheet-slide-up 300ms cubic-bezier(0.32, 0.72, 0.35, 1) both`, `.sheet-wrap.slide-up > button.sheet-backdrop` declares `sheet-backdrop-in 300ms cubic-bezier(0.32, 0.72, 0.35, 1) both`, `.sheet.slide-up.is-closing` still declares `sheet-slide-down 200ms ease-out both`, and `.sheet-wrap.slide-up.is-closing > button.sheet-backdrop` still declares `sheet-backdrop-out 200ms ease-out both`, plus `prefers-reduced-motion: reduce` immediate unmount.
- **`RT1` (new):** Dedicated retime pin verifying all 4 entrance/exit declarations, all 4 untouched `@keyframes`, the `prefers-reduced-motion: reduce` `animation: none` block, and open → retained `.is-closing` (`inert` + `aria-hidden="true"`) → unmount cycles on both `LeverSheet` and `DriftSheet`.

### `web/test/dom/layout.mjs` (390/390 PASS)
- **Section `(h) nowstrip` (updated at `412×915` & `360×640`):** `LeverSheet` entrance asserts `sheet-slide-up` + `sheet-backdrop-in` at `0.3s` and `cubic-bezier(0.32, 0.72, 0.35, 1)`; close asserts `sheet-slide-down` + `sheet-backdrop-out` at `0.2s` and `ease-out` with `.is-closing` + `inert` and clean unmount.
- **Section `(j) eldslide` (updated at `412×915` & `360×640`):** `DriftSheet` entrance asserts `sheet-slide-up` + `sheet-backdrop-in` at `0.3s` and `cubic-bezier(0.32, 0.72, 0.35, 1)` with zero overflow; Close button / backdrop / Escape exits each assert `sheet-slide-down` + `sheet-backdrop-out` at `0.2s` and `ease-out` with `.is-closing` + `inert` and clean unmount.
- **Section `(k) retime` (new at `412×915` & `360×640`):** Asserts both shared slide-up sheets (`LeverSheet` and `DriftSheet`) compute `0.3s` + `cubic-bezier(0.32, 0.72, 0.35, 1)` on entrance (sheet + backdrop) while close computes `0.2s` + `ease-out` (sheet + backdrop), with zero horizontal overflow and zero page errors.

---

## 4. Local Verification Results (`TZ=America/Chicago`)

All required suites ran locally and passed 100% (Playwright browser suites ran against local `/usr/bin/chromium`):

- **Typecheck & Production Build** (`TZ=America/Chicago npm run build`): **PASS** (`tsc --noEmit` exit 0; `dist/app.js 367.5kb`, built `2026-11-22 14:42`)
- **Full Smoke + DOM Gate** (`TZ=America/Chicago npm run smoke`): **PASS**
  - `test/contrast.mjs`: **PASS** (day **44/44**, tightest 1.15×; night **44/44**, tightest 1.24×)
  - `test/nightlight.mjs`: **PASS** (`nightlight: OK`)
  - `test/ocr-bundle.mjs`: **PASS** (passes 1 & 2 OK)
  - `test/smoke.mjs`: **PASS** (`OK`)
  - `npm run dom` (all 9 suites):
    - `yesback.mjs`: **6/6 PASS**
    - `c1flush.mjs`: **PASS** (`C1FLUSH OK`)
    - `adjuststart.mjs`: **39/39 PASS** (`ADJUSTSTART OK`)
    - `scrub.mjs`: **30/30 PASS** (`C2SCRUB OK`)
    - `c3.mjs`: **46/46 PASS** (`C3 OK`)
    - `c3relaunch.mjs`: **3/3 PASS** (`C3 RELAUNCH OK`)
    - `logedit.mjs`: **37/37 PASS** (`LOGEDIT OK`)
    - `cascade.mjs`: **16/16 PASS** (`CASCADE OK`)
    - `rescue.mjs`: **11/11 PASS**
- **Revisions DOM Suite** (`dist-test/dom-revisions.mjs`): **84/84 PASS** (83 existing incl. updated `N4` + 1 new `RT1`)
- **Gemini DOM Suite** (`dist-test/dom-gemini.mjs`): **20/20 PASS**
- **Layout Browser Suite** (`test/dom/layout.mjs`): **390/390 PASS** (`LAYOUT OK`, 0 fail — includes updated `(h)` & `(j)` plus 2 new `(k) retime` pins at `412×915` and `360×640`)
- **Auditfix Browser Suite** (`test/dom/auditfix.mjs`): **185/185 PASS** (`AUDITFIX OK`)
- **Polish Browser Suite** (`test/dom/polish.mjs`): **275/275 PASS** (`POLISH OK`)
- **Additional Browser Suites Run:** `lebrowser.mjs` **84/84 PASS** (`LOGEDIT BROWSER OK`), `quickfix.mjs` **20/20 PASS** (`QUICKFIX OK`)
- **Store Guard Hash Verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required hash byte-for-byte. Nothing deployed, committed, or pushed.
