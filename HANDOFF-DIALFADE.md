# HANDOFF — Now Hero Card Soft Dissolve (`work-dialfade`)

- **Date:** 2026-11-22
- **Builder:** Antigravity
- **Tree:** `/home/lae/hos-build/work-dialfade` (presentation-only patch stacked on live `work-nowstrip`, main commit `dd8c019`)
- **Decision / Spec:** Lorico 2026-11-22 — On the Now screen, switching the hero card between **Timeline** and **Dial** (`NOW_CARD_OPTIONS`, store field `s.nowCard: 'timeline' | 'dial'`) should perform a **soft dissolve** (~200ms ease, in the same spirit and timing as the Settings room dissolve) in both directions instead of an instant swap.
- **Engine / Store Guard:**
  ```
  git hash-object web/src/store.ts = 1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Byte-identical. `engine/`, `web/src/store.ts`, `web/src/backnav.ts`, `web/src/levers.ts`, `web/src/rollout.ts`, `web/src/recap.ts`, and `web/src/rescue.ts` are untouched.

---

## 1. Exact Mechanism

### 1.1 Scoped Keyed Dissolve on `s.nowCard` (`web/src/app.tsx`)
- **Trigger & Scoping (`NowTab`):**
  - `NowTab` tracks `prevCardRef` (initialized to `s.nowCard`), a monotonic `cardFadeEpochRef`, and `activeFadeRef` (with a lightweight `setCardFadeDone` tick to remove the class after the animation finishes).
  - **Initial mount / SSR:** `prevCardRef.current === s.nowCard` and `activeFadeRef.current === 0`, so `cardDissolve` is `false` — zero animation or flash on cold load, and SSR markup (`<section class="hero">`) stays byte-identical.
  - **On `s.nowCard` toggle (`timeline → dial` or `dial → timeline`):** On the exact synchronous render where `prevCardRef.current !== s.nowCard`, `activeFadeRef.current` advances (`++cardFadeEpochRef.current`), setting `cardDissolve = true` on frame 0 (no 1-frame flash). A `useEffect` keyed on `[s.nowCard]` schedules a `220ms` cleanup timer that clears `activeFadeRef.current` back to `0` if the epoch still matches, removing `.now-card-dissolve` cleanly once the `200ms` fade completes.
  - **Rapid repeated taps:** Each tap cancels the previous cleanup timer via `useEffect` cleanup and remounts the incoming hero component cleanly via `key={s.nowCard}` across `<TimelineDrive>`, `<HeroDrive>`, and `<RestHero>` (so both driving-hours-left and out-of-hours/resting views restart the opacity fade cleanly on every toggle). Because `@keyframes now-card-dissolve` animates `opacity: 0 → 1`, the card can never get stuck hidden.
  - **Reduced motion (`prefers-reduced-motion: reduce`):** When `prefersReducedMotion()` is `true`, `activeFadeRef.current` stays `0` and `cardDissolve` stays `false` (instant swap, no timer, no class), reinforced by the CSS `@media (prefers-reduced-motion: reduce)` rule.
  - **Strictly scoped:** Only `TimelineDrive`, `HeroDrive`, and `RestHero` receive the optional `dissolve?: boolean` prop (adding `.now-card-dissolve` to `<section class="hero...">`). `PreviewCard` and `.pv-snapmark + .hero` snap-back slide are untouched; no other screen, sheet, or toggle changes behavior. No duplicate DOM nodes are retained during exit, keeping all existing `.card-switch`, `.hero > *`, and `logedit`/`lebrowser` DOM invariants intact.

### 1.2 Pure Opacity Dissolve CSS (`web/public/styles.css`)
- Appended a dedicated `NOW HERO CARD DISSOLVE` block (before `@page`):
  - `.hero.now-card-dissolve > :not(.card-switch) { animation: now-card-dissolve 200ms ease-out both; }`
  - `@keyframes now-card-dissolve { from { opacity: 0; } to { opacity: 1; } }`
  - `@media (prefers-reduced-motion: reduce) { .hero.now-card-dissolve > :not(.card-switch) { animation: none; } }`
- Excluding `.card-switch` keeps the `.hero` card container bezel and the top-right `Timeline | Dial` switch rock-solid under the driver's thumb while the card body content (`Sign`, `Dial` / `tl-head` + `TimeAxis`, `hero-foot`, `trust`, `RestHero` body/tail) softly dissolves in. Pure opacity only — zero `transform`, `translate`, or `scale`; zero layout shift or horizontal overflow; zero color tokens modified.

---

## 2. Files Changed

| File | Change |
| --- | --- |
| `web/src/app.tsx` | Added optional `dissolve?: boolean` prop to `RestHero`, `HeroDrive`, and `TimelineDrive` (toggling `.now-card-dissolve` on `<section class="hero">`); added `s.nowCard` change-detection ref/effect + `key={s.nowCard}` in `NowTab` (skipped on initial mount and under `prefersReducedMotion()`, cleaned up after `220ms`). |
| `web/public/styles.css` | Appended `NOW HERO CARD DISSOLVE` block before `@page`: `.hero.now-card-dissolve > :not(.card-switch)` `200ms ease-out both`, pure opacity `@keyframes now-card-dissolve`, and `@media (prefers-reduced-motion: reduce)` `animation: none`. |
| `web/test/dom/revisions.mjs` | Added 3 new DOM pins **`DF1`–`DF3`** covering bidirectional `.now-card-dissolve` apply/cleanup + pure-opacity CSS verification (`DF1`), rapid repeated taps + out-of-hours `RestHero` parity (`DF2`), and `prefers-reduced-motion: reduce` instant swap (`DF3`). |
| `web/test/dom/layout.mjs` | Added section **`(i) dialfade`** (16 new real-browser pins across `412×915` and `360×640`) verifying no initial animation, `now-card-dissolve` (`0.2s`) computed CSS animation on incoming card body with solid `.card-switch` in both `Timeline → Dial` and `Dial → Timeline` directions, clean settle on the target view at `opacity: 1` with zero horizontal overflow, rapid repeated tap resilience, and `emulateMedia({ reducedMotion: 'reduce' })` instant swap (`animationName: 'none'`). |
| `HANDOFF-DIALFADE.md` | This handoff document. |

---

## 3. New DOM Pins

### `web/test/dom/revisions.mjs`
- **`DF1`**: Steady state carries no `.now-card-dissolve`; toggling `Timeline → Dial` and `Dial → Timeline` applies `.now-card-dissolve`, swaps `.taxis` ↔ `.dial`, cleans up after `~220ms`, and lands with matching `aria-pressed="true"`; verifies CSS rule (`200ms ease-out`, pure opacity `@keyframes`, zero `transform`/`translate`/`scale`, reduced-motion override).
- **`DF2`**: Rapid repeated toggle burst (`Timeline → Dial → Timeline → Dial → Timeline` at 40ms intervals) never breaks state or leaves a stuck/hidden card; out-of-hours `RestHero` (`ev.driveNow === 0`) also dissolves cleanly in both directions.
- **`DF3`**: Under mocked `prefers-reduced-motion: reduce`, toggling `Timeline → Dial` and `Dial → Timeline` swaps immediately to the target view with no `.now-card-dissolve` class.

### `web/test/dom/layout.mjs` — Section `(i) dialfade` (`412×915` and `360×640`)
- Initial load has no dissolve animation (`animationName: 'none'`) and zero horizontal overflow.
- `Timeline → Dial` applies `now-card-dissolve` (`0.2s`) on incoming `.dial` while `.card-switch` stays solid (`animationName: 'none'`), and settles cleanly on Dial (`opacity: 1`, `aria-pressed="true"`, no `.taxis`, zero overflow).
- `Dial → Timeline` applies `now-card-dissolve` (`0.2s`) on incoming `.tl-head` while `.card-switch` stays solid (`animationName: 'none'`), and settles cleanly on Timeline (`opacity: 1`, `aria-pressed="true"`, no `.dial`, zero overflow).
- Rapid repeated taps (`Dial → Timeline → Dial` at 40ms intervals) settle cleanly on Dial at `opacity: 1` with no stuck class or overflow.
- Under `page.emulateMedia({ reducedMotion: 'reduce' })`, `Dial → Timeline` and `Timeline → Dial` swap instantly with `animationName: 'none'` and `opacity: 1`.
- Zero page errors at both widths.

---

## 4. Local Verification Results (`TZ=America/Chicago`)

All required suites ran locally and passed 100% (Playwright browser suites ran against local `/usr/bin/chromium` with zero flakes):

- **Typecheck & Production Build** (`TZ=America/Chicago npm run build`): **PASS** (`tsc --noEmit` exit 0; `dist/app.js 366.9kb`, built `2026-11-22 13:42`)
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
- **Revisions DOM Suite** (`dist-test/dom-revisions.mjs`): **79/79 PASS** (76 existing + 3 new `DF1`–`DF3`)
- **Gemini DOM Suite** (`dist-test/dom-gemini.mjs`): **20/20 PASS**
- **Layout Browser Suite** (`test/dom/layout.mjs`): **378/378 PASS** (`LAYOUT OK`, 0 fail — includes all 16 new `(i) dialfade` pins at `412×915` and `360×640`)
- **Auditfix Browser Suite** (`test/dom/auditfix.mjs`): **185/185 PASS** (`AUDITFIX OK`)
- **Polish Browser Suite** (`test/dom/polish.mjs`): **275/275 PASS** (`POLISH OK`)
- **Additional Browser Suites Run:** `lebrowser.mjs` **84/84 PASS** (`LOGEDIT BROWSER OK`), `quickfix.mjs` **20/20 PASS** (`QUICKFIX OK`)
- **Store Guard Hash Verification** (`git hash-object web/src/store.ts`):
  ```
  1323046db6ba07b8c85805f89a103dc16f3776b5
  ```
  Matches required hash byte-for-byte. Nothing deployed, committed, or pushed.
