# HANDOFF — Now "Check against my ELD" Scoped Slide-Up Sheet (`work-eldslide`)

- **Date:** 2026-11-22
- **Builder:** Antigravity
- **Tree:** `/home/lae/hos-build/work-eldslide` (presentation-only patch stacked on live `work-dialfade`, main commit `83c96d8`)
- **Decision / Spec:** Lorico 2026-11-22 — On the Now screen, the **"Check against my ELD"** button (the patch 9 drift check opening `DriftSheet`, sheet kind `'drift'`, via `openSheet({ kind: 'drift' })` in `web/src/app.tsx`) opens a pop-up sheet that should slide up quickly from the bottom and slide back down on close — reusing the exact `.sheet.slide-up` / `.is-closing` 200ms ease-out `translateY` + retained-exit treatment built for `LeverSheet` in `work-nowstrip` (NOT a dissolve).
- **Engine / Store Guard:**
  ```
  git hash-object web/src/store.ts = 1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Byte-identical. `engine/`, `web/src/store.ts`, `web/src/backnav.ts`, `web/src/levers.ts`, `web/src/rollout.ts`, `web/src/recap.ts`, and `web/src/rescue.ts` are untouched.

---

## 1. Exact Mechanism

### 1.1 Scoped Slide-Up Extension on `DriftSheet` (`web/src/app.tsx`)
- **Sheet component (`DriftSheet`):**
  - Extended `DriftSheet` with optional `closing = false` prop and passed `slideUp closing={closing}` to all 6 `<Sheet title="Check against my ELD" slideUp closing={closing}>` return paths (demo clock gate, post-fill confirmation, `sync` verdict, `extra` verdict, `missing` verdict, and initial ELD input form).
  - Because every internal state branch returns `<Sheet>` at the root of `DriftSheet`, stepping through Compare / Add missing driving keeps the same mounted `<Sheet>` node without replaying the entrance animation, and closing preserves whatever verdict or form state was visible as it slides down.
  - `LeverSheet` keeps its exact existing `slideUp` + `closing` behavior; all other 12 sheet kinds (`status`, `since`, `quickstart`, `why`, `exceptions`, `splitblock`, `loadtime`, `triptime`, `rollouttime`, `rescuetime`, `edit`/`add`, `confirm`) do not pass `slideUp` and remain untouched.
- **Retained exit lifecycle (`App()` in `web/src/app.tsx`):**
  - Added `driftOpen`, `retainedDrift`, `driftClosing`, `showDrift`, and a `driftEpochRef` remount key directly alongside `retainedLever`.
  - Closing `DriftSheet` via the header Close button, backdrop tap, Escape key, hardware Back (`sheetBack` / `backNav`), or internal dismiss actions (`openSheet(null)`) immediately sets `currentSheet() === null` (releasing `blocked` and `backNav` immediately) while retaining `<DriftSheet closing={true} />` mounted (with `.sheet-wrap.slide-up.is-closing`, `inert`, `aria-hidden="true"`, and focus/Escape effects paused) for `220ms` so the `200ms` slide-down animation finishes cleanly before unmount.
  - Switching directly to another sheet (`sheet !== null`), showing the disclaimer (`!s.disclaimerAcked`), entering driving view (`driveUp`), or having `prefers-reduced-motion: reduce` active skips exit retention (`driftClosing === false`) and unmounts `DriftSheet` immediately.
  - `driftEpochRef` increments only on a `!driftOpen → driftOpen` edge so re-opening `DriftSheet` during the 220ms exit window cleanly mounts a fresh form and replays the slide-up entrance.

### 1.2 Reused Slide-Up CSS (`web/public/styles.css`)
- Reused the existing `.sheet-wrap.slide-up`, `.sheet-wrap.slide-up.is-closing`, `.sheet.slide-up`, `.sheet.slide-up.is-closing`, `@keyframes sheet-slide-up` / `sheet-slide-down` (`200ms ease-out both`), backdrop fade keyframes, `.sheet.slide-up .sheet-head h2` wrapping, and `@media (prefers-reduced-motion: reduce) { animation: none; }` rules verbatim with zero new CSS rules or color token changes.
- Updated only the section header comment above `.sheet-wrap.slide-up` to note both `LeverSheet` and `DriftSheet`.

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Added optional `closing?: boolean` prop to `DriftSheet` and passed `slideUp closing={closing}` on all 6 `<Sheet>` returns; added `retainedDrift` + `driftEpochRef` exit-retention lifecycle in `App()` mirroring `retainedLever` (220ms exit window; immediate unmount on direct sheet switch, disclaimer, driving view, or `prefers-reduced-motion: reduce`). |
| `web/public/styles.css` | Updated comment in the existing `NOW "COMES BACK" STRIP + SCOPED SLIDE-UP SHEET` block to document both `LeverSheet` and `DriftSheet` (reuses existing `.sheet.slide-up` / `.is-closing` and reduced-motion CSS unchanged). |
| `web/test/dom/revisions.mjs` | Re-aimed `N2` (moved `drift` out of the non-slide-up sample, replaced with `quickstart`) and added 4 new DOM pins **`ES1`–`ES4`** covering `.slide-up` scoping on `DriftSheet` vs non-slide-up sheets, retained `.is-closing` exit across Close button / backdrop / Escape / hardware Back + immediate unmount on direct switch / disclaimer / driving view / other sheets, `prefers-reduced-motion: reduce` immediate unmount, and `LeverSheet` slide-up/down regression. |
| `web/test/dom/layout.mjs` | Added section **`(j) eldslide`** (10 new real-browser pins across `412×915` and `360×640`) verifying `.sheet.slide-up` + `sheet-slide-up` (`0.2s`) entrance and zero horizontal overflow on `DriftSheet`, `sheet-slide-down` (`0.2s`) + `.is-closing` inert exit across Close button / backdrop / Escape, non-slide-up behavior + immediate unmount on `Why?`, and `animationName: 'none'` + immediate unmount under `emulateMedia({ reducedMotion: 'reduce' })`. |
| `HANDOFF-ELDSLIDE.md` | This handoff document. |

---

## 3. New & Updated DOM Pins

### `web/test/dom/revisions.mjs`
- **`N2` (re-aimed):** `LeverSheet` carries `.sheet.slide-up` & `.sheet-wrap.slide-up`; non-slide-up sheet kinds (`why`, `status`, `exceptions`, `add`, `quickstart`) do NOT.
- **`ES1`:** Opening `DriftSheet` from Now's `"Check against my ELD"` button applies `.sheet.slide-up` and `.sheet-wrap.slide-up` (without `.is-closing`); sample non-slide-up sheet kinds (`why`, `status`, `exceptions`, `add`) do NOT carry `.slide-up`.
- **`ES2`:** Closing `DriftSheet` via Close button, backdrop tap, Escape, and hardware Back each immediately clear `currentSheet()` and release main-strip `inert`, while retaining `.sheet-wrap.slide-up.is-closing` (`inert` + `aria-hidden="true"`) and `.sheet.slide-up.is-closing` across the exit window before unmounting; direct switch to another sheet, showing disclaimer, entering driving view, and closing non-slide-up sheets (`why`) unmount immediately.
- **`ES3`:** Under mocked `prefers-reduced-motion: reduce`, `.sheet.slide-up` / `.sheet.slide-up.is-closing` CSS sets `animation: none` and closing `DriftSheet` unmounts immediately without exit retention.
- **`ES4`:** Regression check verifying `LeverSheet` still slides up with `.sheet.slide-up`, retains `.is-closing` (`inert` + `aria-hidden="true"`) on close, and unmounts cleanly after the exit window.

### `web/test/dom/layout.mjs` — Section `(j) eldslide` (`412×915` and `360×640`)
- Tapping `"Check against my ELD"` opens `DriftSheet` with `.sheet.slide-up` & `.sheet-wrap.slide-up`, computed `animationName: 'sheet-slide-up'` (`0.2s`), fitted title header, and zero horizontal overflow.
- Closing via header Close button, backdrop tap, and Escape key each play `sheet-slide-down` (`0.2s`) with `.is-closing` + `inert` on `.sheet-wrap`, then unmount cleanly.
- Non-slide-up sheet (`Why?`) carries no `.slide-up`, `animationName: 'none'`, and unmounts immediately on close.
- Under `page.emulateMedia({ reducedMotion: 'reduce' })`, `DriftSheet` and its backdrop compute `animationName: 'none'` and unmount immediately on close.
- Zero page errors at both widths.

---

## 4. Local Verification Results (`TZ=America/Chicago`)

All required suites ran locally and passed 100% (Playwright browser suites ran against local `/usr/bin/chromium` with zero flakes):

- **Typecheck & Production Build** (`TZ=America/Chicago npm run build`): **PASS** (`tsc --noEmit` exit 0; `dist/app.js 367.5kb`, built `2026-11-22 14:13`)
- **Full Smoke + DOM Gate** (`TZ=America/Chicago npm run smoke`): **PASS**
  - `test/contrast.mjs`: **PASS** (day **44/44**, tightest 1.15×; night **44/44**, tightest 1.24×)
  - `test/nightlight.mjs`: **PASS** (`nightlight: OK`)
  - `test/ocr-bundle.mjs`: **PASS**
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
- **Revisions DOM Suite** (`dist-test/dom-revisions.mjs`): **83/83 PASS** (79 existing + 4 new `ES1`–`ES4`)
- **Gemini DOM Suite** (`dist-test/dom-gemini.mjs`): **20/20 PASS**
- **Layout Browser Suite** (`test/dom/layout.mjs`): **388/388 PASS** (`LAYOUT OK`, 0 fail — includes all 10 new `(j) eldslide` pins at `412×915` and `360×640`)
- **Auditfix Browser Suite** (`test/dom/auditfix.mjs`): **185/185 PASS** (`AUDITFIX OK`)
- **Polish Browser Suite** (`test/dom/polish.mjs`): **275/275 PASS** (`POLISH OK`)
- **Additional Browser Suites Run:** `lebrowser.mjs` **84/84 PASS** (`LOGEDIT BROWSER OK`), `quickfix.mjs` **20/20 PASS** (`QUICKFIX OK`)
- **Store Guard Hash Verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required hash byte-for-byte. Nothing deployed, committed, or pushed.
