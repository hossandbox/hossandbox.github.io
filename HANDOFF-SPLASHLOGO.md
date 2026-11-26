# Handoff — Clock 14 `splashlogo` (`work-splashlogo`)

**Tree:** `~/hos-build/work-splashlogo` (copied from `work-drivers1fix2`, the live build)  
**Scope:** Presentation-only patch — Startup Splash logo & title sizing only. Zero behavior, storage, PIN, copy, or theme-token changes.  
**Status:** Built, verified across all 11 sequential suites, and visually inspected in real Chromium across Night, Day, and Wind-down themes. **Not deployed, not pushed.**

---

## 1. Summary of Changes (`file:line`)

Only **3 files** changed (plus rebuilt `web/dist/` and `web/dist-test/`):

1. **`web/public/styles.css`**
   - **`web/public/styles.css:2971-3043`**:
     - Replaced fixed `132px × 132px` logo frame with responsive square hero sizing:
       - `--logo-r: clamp(28px, 9vw, 40px);` (concentric bezel radius; `.splash-logo` uses `calc(var(--logo-r) - 4px)` matching the `4px` frame padding)
       - `width: clamp(160px, min(100%, 52vh), 420px);` + `width: clamp(160px, min(100%, 52dvh), 420px);` with `aspect-ratio: 1 / 1; flex-shrink: 0;`
       - Tuned outer glow blur (`box-shadow: 0 14px 32px var(--drop), 0 0 22px -6px var(--glow)`) so the bezel and halo stay unclipped even on `360px`-wide phones.
     - Updated `.splash-title` ("Clock 14") to responsive `font-size: clamp(26px, 7.6vw, 36px); letter-spacing: -.025em; line-height: 1.06; margin: 6px 0 0;`.
     - Updated `.splash-sub` ("HOS What-If Planner") to `font-size: clamp(12px, 3.3vw, 14px); letter-spacing: .06em;`.
     - Tightened `.splash-shell` top/bottom padding (`clamp(12px, 2dvh, 20px)` / `clamp(16px, 2.8dvh, 28px)` with `vh` fallback), `.splash-picker` gap (`clamp(12px, 2.4dvh, 20px)` with `justify-content: safe center` fallback), `.splash-brand` gap (`4px`), and `.splash-body` gap (`clamp(10px, 1.8dvh, 14px)`).
   - **`web/public/styles.css:3384-3386`**: Removed the old `@media (max-height: 700px)` hardcoded shrink rules (`.splash-logo-frame { width: 108px; height: 108px; }`, `.splash-title { font-size: 28px; }`) because responsive `min(100%, 52dvh)` + `clamp()` now handles short and tall screens continuously. Kept `.pin-key` untouched.

2. **`web/src/driver-ui.tsx`**
   - **`web/src/driver-ui.tsx:527`**: Updated `<img class="splash-logo" ... width={512} height={512} />` (was `width={132} height={132}`) to match `icon-512.png`'s natural `512 × 512` dimensions while CSS governs rendered size.

3. **`web/test/dom/auditfix.mjs`**
   - **`web/test/dom/auditfix.mjs:619-656`**: Added 2 real-browser geometry & reachability pins on 1-driver splash at `412×915` (`>= 360px` square logo, unclipped bezel, `Clock 14 >= 28px` below logo, picker + Add above fold) and `360×640` (`>= 300px` square logo, unclipped bezel, `Clock 14 >= 24px` below logo, picker + Add fully visible above fold).
   - **`web/test/dom/auditfix.mjs:737-761`**: Strengthened existing `Drivers1 2-driver splash at 360×640` pin to also assert hero logo `>= 300px` square, unclipped bezel at `scrollTop = 0`, and scroll reachability of `"Add a driver"`.
   - **`web/test/dom/auditfix.mjs:908-956`**: Added 3 real-browser pins covering **4 drivers at `360×640`** across **Night**, **Day**, and **Wind-down** themes: asserts hero logo `>= 300px` square, unclipped bezel, zero horizontal overflow, scroll reachability of both the 4th driver tile and `"Add a driver"`, and interactive tap on driver #4 (`Sofia`) opening her PIN screen.

---

## 2. Sizing Choices & Design Rationale

### Hero Logo (`.splash-logo-frame` / `img.splash-logo`)
- **Formula:** `width: clamp(160px, min(100%, 52dvh), 420px); aspect-ratio: 1 / 1;` (with `52vh` fallback) inside `.splash-shell` (`max-width: 460px`, `16px` horizontal padding, `12px` at `<= 360px`).
- **Bezel radius:** `--logo-r: clamp(28px, 9vw, 40px)` outer, `calc(var(--logo-r) - 4px)` inner — exact concentric rounding around the `4px` metallic frame border across all screen widths.
- **Why this is the true "as big as possible" maximum:**
  - On a small phone (`360×640`), `52dvh = 332.8px` (92.4% of viewport width; `3.08×` the previous `108px` width and **`9.5×` the area**). At `332.8px`, the entire splash — logo, "Clock 14", "HOS What-If Planner", "Who's in the seat?", 1 driver tile, AND "+ Add a driver" (and the 0-driver empty state as well!) — fits **100% above the fold with zero scrolling required**, while leaving `13.6px` clean breathing margin on each side so neither the bezel nor its glow clips.
  - On a large phone (`412×915` / `430×932`), `100%` of `.splash-shell`'s inner column (`380px` / `398px`) governs (`2.88×`–`3.02×` the previous `132px` width; **`8.3×`–`9.1×` the area**), aligning the emblem edge-to-edge with the driver cards and "+ Add a driver" button beneath it as one cohesive instrument column — and fitting up to **4 drivers + "+ Add a driver" 100% above the fold** at `412×915`.
  - On desktop/tablet (`1280×800`), the `420px` ceiling (well below `icon-512.png`'s `512px` native resolution so it never blurs) and `52dvh` (`416px`) keep the 1-driver splash cleanly centered above the fold.
  - On very short/landscape viewports, the `160px` floor + `52dvh` keeps the splash usable without forcing overflow.

### "Clock 14" Wordmark (`.splash-title`) & Subtitle (`.splash-sub`) — Creative Call
- **Chosen sizes:**
  - `.splash-title` ("Clock 14"): **`clamp(26px, 7.6vw, 36px)`**, `font-weight: 800`, `letter-spacing: -.025em`, `line-height: 1.06`, `margin: 6px 0 0`.
  - `.splash-sub` ("HOS What-If Planner"): **`clamp(12px, 3.3vw, 14px)`**, `font-weight: 600`, `letter-spacing: .06em`, `text-transform: uppercase`.
- **Reasoning:**
  - The logo artwork already carries a large, high-contrast **"14"** inside the clock dial above the semi truck. When the logo was tiny (`108–132px`), the wordmark had to carry the screen alone. With the emblem now dominating at `333–416px`, making "Clock 14" oversized (`44px+`) would fight the dial's "14" and steal vertical height directly from the logo on `360×640`.
  - Conversely, making it too small (`<22px`) would collapse the hierarchy against the `18px` driver names in `.driver-tile`.
  - `27.4px` at `360×640` and `31.3px` at `412×915` (scaling smoothly to `36px` on wide screens) hits the sweet spot: roughly `1.5×–1.7×` the driver name size for clear visual hierarchy, roughly `1:12` against the hero emblem like a flagship instrument faceplate lockup, and compact enough to keep the entire 1-driver splash above the fold at `360×640`.

---

## 3. Rendered-Size Evidence (Real Chromium, Post-Animation Resting Boxes)

Measured in headless Chromium (`HOS_BROWSER=/usr/bin/chromium`) against built `web/dist/` after splash entrance animation settled:

| Viewport & Case | Theme | Frame (`w × h`) | Img (`w × h`) | `Clock 14` | Subtitle | Overflow X | Bezel Clipped | Picker & "Add a driver" Reachability |
|---|---|---:|---:|---:|---:|---|---|---|
| `360×640` · 0 drivers | Night | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | 100% above fold (`addBottom: 622.6 / 640`, `maxScroll: 0`) |
| `360×640` · 1 driver | Night | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | 100% above fold (`tile: 461.1–532.4`, `add: 544–608`, `maxScroll: 0`) |
| `360×640` · 1 driver | Day | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | 100% above fold (`addBottom: 608 / 640`, `maxScroll: 0`) |
| `360×640` · 1 driver | Wind-down | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | 100% above fold (`addBottom: 608 / 640`, `maxScroll: 0`) |
| `360×640` · 2 drivers | Night | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | Both drivers above fold (`601.7 / 640`); Add peeks & scrolls cleanly (`maxScroll: 39`, reachable) |
| `360×640` · 4 drivers | Night / Day / Wind-down | **332.8 × 332.8 px** | 324.8 × 324.8 px | `27.36px` | `12px` | `false` | `false` | Drivers 1–2 visible + Driver 3 peek cue; scrolls smoothly (`maxScroll: 202`), Driver 4 & Add fully reachable + clickable |
| `412×915` · 1 driver | Night / Day / Wind-down | **380.0 × 380.0 px** | 372.0 × 372.0 px | `31.31px` | `13.60px` | `false` | `false` | 100% above fold (`tile: 625.4–696.7`, `add: 710.7–774.7`, `maxScroll: 0`) |
| `412×915` · 4 drivers | Night | **380.0 × 380.0 px** | 372.0 × 372.0 px | `31.31px` | `13.60px` | `false` | `false` | All 4 drivers + Add 100% above fold (`addBottom: 906.2 / 915`, `maxScroll: 0`) |
| `430×932` · 1 driver | Night | **398.0 × 398.0 px** | 390.0 × 390.0 px | `32.68px` | `14px` | `false` | `false` | 100% above fold (`addBottom: 793.2 / 932`, `maxScroll: 0`) |
| `1280×800` · 1 driver | Night | **416.0 × 416.0 px** | 408.0 × 408.0 px | `36px` | `14px` | `false` | `false` | 100% above fold (`addBottom: 738 / 800`, `maxScroll: 0`) |

**Before vs. After comparison:**
- `360×640`: `108 × 108 px` → **`332.8 × 332.8 px`** (**+208% linear**, **9.5× area**)
- `412×915`: `132 × 132 px` → **`380.0 × 380.0 px`** (**+188% linear**, **8.3× area**)

---

## 4. Pins Changed & Why

No existing pins were deleted or weakened. All existing pins in `drivers.mjs`, `drivers-relaunch.mjs`, and `auditfix.mjs` remained intact, and `web/test/dom/auditfix.mjs` gained **5 new pins + 1 strengthened pin** (`195 → 200` total pins) that genuinely fail if the logo shrinks back to old dimensions, clips its bezel, causes horizontal overflow, or pushes the picker/Add button out of reach:

1. **`Splashlogo 412×915 (1 driver)`** (`auditfix.mjs:619-637`): asserts square frame `>= 360px`, unclipped bezel (`left >= 0 && right <= 412 && top >= 0`), `Clock 14 >= 28px` positioned below logo, driver tile + Add above fold, zero horizontal overflow.
2. **`Splashlogo 360×640 (1 driver)`** (`auditfix.mjs:639-656`): asserts square frame `>= 300px`, unclipped bezel (`left >= 0 && right <= 360 && top >= 0`), `Clock 14 >= 24px` below logo, driver tile + Add both **above the fold** (`<= 640`), zero horizontal overflow.
3. **`Drivers1 2-driver splash at 360×640`** (`auditfix.mjs:737-761`, strengthened): retains both-driver + Add + zero-overflow assertions and adds square logo `>= 300px`, unclipped bezel at `scrollTop = 0`, and scroll reachability of `"Add a driver"`.
4. **`Splashlogo 360×640 (night / day / winddown, 4 drivers)`** (`auditfix.mjs:908-956`, 3 pins): seeds 4 drivers in each theme, asserts square logo `>= 300px`, unclipped bezel, zero horizontal overflow, scroll reachability of both driver #4 and `"Add a driver"`, and interactive tap on driver #4 (`Sofia`) opening her PIN screen.

---

## 5. Verification Suite Results (Sequential, Foreground)

All 11 required suites ran sequentially and passed on the first run (zero flakes, zero retries needed):

| # | Suite | Command | Result |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 656.8kb) |
| 2 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** (contrast 44/44×3, nightlight OK, ocr-bundle OK, smoke + 18 DOM suites incl. `drivers` 11/11, `drivers-relaunch` 6/6, `myweek` 19/19, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, `rescue` 11/11) |
| 3 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** (identical full pass across all sub-suites) |
| 4 | **gemini** | `esbuild test/dom/gemini.mjs ... && node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 5 | **revisions** | `esbuild test/dom/revisions.mjs ... && node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 6 | **contrast** | `node test/contrast.mjs` | **PASS** — Day **44/44** (1.16×), Night **44/44** (1.34×), Wind-down **44/44** (1.20×) |
| 7 | **nightlight** | `node test/nightlight.mjs` | **PASS** (`nightlight: OK`) |
| 8 | **lebrowser** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/lebrowser.mjs` | **252 pass, 0 fail** |
| 9 | **polish** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/polish.mjs` | **295 pass, 0 fail** |
| 10 | **layout** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/layout.mjs` | **421 pass, 0 fail** (`LAYOUT OK`, zero flakes) |
| 11 | **auditfix** | `TZ=America/Chicago HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`, incl. all 6 splashlogo pins) |

---

## 6. Hard Invariants Confirmation

- **`engine/` byte-identical:**
  ```text
  find engine -type f -not -path '*/node_modules/*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches required baseline hash `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` byte-for-byte.
- **Storage keys unchanged:** `web/src/store.ts` and `web/src/drivers.ts` untouched; `auditfix` legacy migration pin confirmed only the 4 existing storage keys (`hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, `hos-sandbox-undo-v1`).
- **Behavior, PIN, disclosure, and copy unchanged:** Presentation-only splash visuals; all theme contrast tokens untouched (44/44 across Day, Night, Wind-down).
