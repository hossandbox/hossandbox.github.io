# Handoff — Clock 14 `splashart` (`work-splashart`)

**Tree:** `~/hos-build/work-splashart` (copied from `work-splashlogo`, the currently live build)  
**Scope:** Presentation/layout-only patch on the Startup Splash — replaces the DOM logo + title with Lorico's supplied full-screen splash artwork pack (`~/hos-build/splash-pack/`), moves the driver picker / empty prompt / "Add a driver" into the artwork's lower dark obsidian zone as dark frosted controls, and updates splash pins to assert the new layout. Zero changes to PIN logic, storage, driver logic, or any post-unlock screen or theme.  
**Status:** Built, visually verified in real headless Chromium across `360×640` and `412×915` (0, 1, 2, 4 drivers; Night, Day, Wind-down; plus PIN screen), and verified across all 11 sequential foreground suites with zero failures and zero flakes. **Not deployed, not pushed.**

---

## 1. Asset Strategy & Added Weight (Honest Report)

Lorico's supplied pack (`~/hos-build/splash-pack/`) contains 4 raw PNGs totaling **8,802,689 bytes (~8.80 MB / 8.39 MiB)**:

| Supplied Pack File | Resolution | Aspect | Raw PNG Size | Shipped? |
|---|---|---|---:|---|
| `splash-1080x1920.png` | `1080×1920` | 9:16 (`0.5625`) | 1,562,437 B (1.49 MiB) | **Yes** → `splash-1080x1920.webp` (**125,138 B** / 122.2 KB) |
| `splash-1179x2556.png` | `1179×2556` | 19.5:9 (`0.4613`) | 2,011,752 B (1.92 MiB) | **Yes** → `splash-1179x2556.webp` (**146,976 B** / 143.5 KB) |
| `splash-1290x2796.png` | `1290×2796` | 19.5:9 (`0.4614`) | 2,356,952 B (2.25 MiB) | No (same 19.5:9 framing as `1179×2556`) |
| `splash-1440x3120.png` | `1440×3120` | 19.5:9 (`0.4615`) | 2,871,548 B (2.74 MiB) | No (same 19.5:9 framing as `1179×2556`) |

### What Shipped & Exact Total Added Weight
- `web/public/splash-1080x1920.webp` — **125,138 bytes** (`122.2 KB`)
- `web/public/splash-1179x2556.webp` — **146,976 bytes** (`143.5 KB`)
- **Total added asset weight: `272,114 bytes` (`265.7 KB`)** — a **96.9% reduction** vs. the 8.80 MB raw pack (and **92.4% smaller** than shipping those two files as raw PNGs at 3.57 MB).

### Why This Exact Choice
1. **Why two aspect ratios (`9:16` + `19.5:9`) instead of only `1080×1920`:**
   - On a standard `360×640` (9:16) phone, `splash-1080x1920.webp` maps 1:1 with zero cropping and places the glowing horizon at ~54%, leaving the lower dark zone starting at **58%**.
   - On a tall `412×915` (19.5:9 / 20:9) phone, `background-size: cover` with only a 9:16 image would scale to height `915px` (width `514.7px`) and crop ~51px off each side — slicing the truck's front bumper/headlight and rear speed-lines off the edges. Serving `splash-1179x2556.webp` via `@media (max-aspect-ratio: 1/2)` fits the full truck and clock unclipped on tall phones and places the dark login zone cleanly at **50%** per the README.
2. **Why `1179×2556` instead of also shipping `1290×2796` or `1440×3120`:**
   - All three tall files share identical 19.5:9 framing and composition. `1179×2556` is native 3× Retina for iPhone 15/16 (`393×852@3x`) and still ~2.8× pixel density on `412×915` / `430×932` Android/iPhone Pro Max screens — sharp with zero visible upscaling while avoiding ~350+ KB of redundant bytes.
3. **Why visually-lossless WebP (`quality=92`, `webp:method=6`):**
   - The pack's anti-banding OLED dithering noise defeats PNG deflate compression (`opt.png` stayed at 1.56 MB and 2.01 MB, while 256-color `PNG8` still weighed 538 KB + 689 KB = 1.23 MB with worse PSNR `39.2 dB`).
   - WebP `q=92` (`method=6`) hit **PSNR 41.88 dB** (`1080×1920`) and **43.18 dB** (`1179×2556`) with crisp Michroma wordmark edges, clean headlight glow, zero visible banding, and universal support across the app's build target (`chrome110`, `safari16`).
4. **Fast loading & offline behavior:**
   - `web/public/index.html` adds aspect-matched `<link rel="preload" as="image" ...>` hints so the browser fetches only the matching artwork for the viewport before `styles.css` finishes parsing.
   - `web/public/index.html` adds `<link rel="apple-touch-startup-image" ...>` **only** for the two shipped resolutions (`1179×2556` for `393×852@3x` portrait and `1080×1920` for `360×640@3x` portrait).
   - `web/public/sw.js` adds `./splash-1080x1920.webp` and `./splash-1179x2556.webp` to `ASSETS` (precached under `clock14-<build>`), while preserving the existing `fetch` rule (`r.ok && sameOrigin` only, `./index.html` fallback on `navigate` only) so the splash works reliably offline after first load.

---

## 2. Summary of Changes (`file:line`)

1. **`web/public/splash-1080x1920.webp`** & **`web/public/splash-1179x2556.webp`** (added): Visually-lossless WebP (`q=92, method=6`) exports of Lorico's 9:16 and 19.5:9 splash artwork.
2. **`web/src/driver-ui.tsx:520-531`**:
   - Removed the duplicated DOM `<div class="splash-brand">` block (`img.splash-logo`, `h1.splash-title`, `p.splash-sub`) from `StartupSplash` so the artwork's built-in "CLOCK 14" wordmark and clock/truck emblem stand alone without doubling.
   - Added `data-splash-view={view.kind}` and `aria-label="Clock 14"` on `<div class="app splash-app" data-splash-screen="1">`.
   - Zero changes to PIN keypad, registration, disclosure modal, recovery, legacy migration, `ActiveDriverStrip`, or `DriverSettingsCard`.
3. **`web/public/styles.css:2962-3292, 3405-3438`**:
   - Styled `.splash-app` per the README spec: `background-color: #020614`, `background-image: url('./splash-1080x1920.webp')`, `background-position: top center`, `background-repeat: no-repeat`, `background-size: cover`, `min-height: 100vh; min-height: 100dvh;`, switching to `url('./splash-1179x2556.webp')` under `@media (max-aspect-ratio: 1/2)`.
   - Layered a deep obsidian scrim (`rgba(2, 6, 20, 0.90)` → `rgba(2, 6, 20, 0.96)`) over the artwork ONLY when `data-splash-view` is a sub-flow (`pin`, `recovery`, `register`, `legacy-setup`) so the PIN keypad, back link, driver name, and recovery/registration forms remain unobstructed and high-contrast.
   - Scoped dark-on-obsidian palette tokens strictly inside `.splash-app` so Day, Night, and Wind-down themes all render crisp cool-white (`#eef5fd`) and muted ice-blue (`#b0c4e0`) text on dark frosted surfaces over the dark artwork without touching `:root` or any post-unlock screen.
   - Positioned `.splash-picker` in the lower dark zone (`padding-top: 58dvh` on 9:16; `padding-top: 50dvh` under `@media (max-aspect-ratio: 1/2)` for 19.5:9) with compact `@media (max-height: 700px)` tile spacing (`min-height: 60px`, `gap: 8px`).
   - Styled splash interactive surfaces (`.driver-tile`, `.splash-empty`, `.splash-app .card`, `.splash-add-btn:not(.primary)`, `.pin-key`, `.splash-step-pill`, splash inputs/selects) as dark frosted elements per README (`background: rgba(6, 17, 46, 0.72)`, `border: 1px solid rgba(145, 228, 255, 0.22)`, `backdrop-filter: blur(12px)`).
   - Removed obsolete `.splash-brand`, `.splash-logo-frame`, `.splash-logo`, `.splash-title`, `.splash-sub`, and `@keyframes splash-logo-in`.
4. **`web/public/index.html:53-60`**: Added aspect-matched `preload` hints and `apple-touch-startup-image` links strictly for the two shipped sizes (`1179×2556`, `1080×1920`). Pre-paint theme boot script and `data-theme="day"` untouched.
5. **`web/public/sw.js:2-5`**: Added `'./splash-1080x1920.webp'` and `'./splash-1179x2556.webp'` to `ASSETS`; existing `r.ok && sameOrigin` fetch handler and navigate fallback untouched.
6. **`web/server.mjs:10-12`** and browser test harnesses (**`web/test/dom/{auditfix,layout,lebrowser,polish}.mjs`**): Added `'.webp': 'image/webp'` to static MIME `TYPES` map so local serving and browser tests serve `.webp` with the proper content type.
7. **`web/test/dom/drivers.mjs:186-206`** & **`web/test/dom/auditfix.mjs:537-1055`**: Replaced superseded splashlogo DOM-logo geometry pins with falsifiable splashart pins (details in Section 4).

---

## 3. Placement & Frosted-Style Evidence (Real Chromium, Post-Animation)

Measured in headless Chromium (`HOS_BROWSER=/usr/bin/chromium`) against built `web/dist/` after entrance animation settled (and visually verified via screenshots):

| Viewport & Case | Theme | Served Asset | `.splash-body` Top (`px` / `%`) | Last Tile Bottom | `"Add a driver"` Bottom | `maxScroll` | Overflow X | Frosted Surface & Text |
|---|---|---|---:|---:|---:|---:|---|---|
| `360×640` · 0 drivers | Day | `splash-1080x1920.webp` | `371.2px` (**58.0%**) | — | `567.5px / 640` (above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `360×640` · 1 driver | Night | `splash-1080x1920.webp` | `371.2px` (**58.0%**) | `464.8px` | `536.8px / 640` (above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `360×640` · 2 drivers | Day | `splash-1080x1920.webp` | `371.2px` (**58.0%**) | `540.1px` | `612.1px / 640` (above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `360×640` · 4 drivers | Night / Day / Wind-down | `splash-1080x1920.webp` | `371.2px` (**58.0%**) | `690.9px` (scrolls cleanly) | `762.9px` (reachable at scroll bottom) | `127px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `412×915` · 0 drivers | Day | `splash-1179x2556.webp` | `457.5px` (**50.0%**) | — | `641.7px / 915` (above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `412×915` · 1 driver | Night | `splash-1179x2556.webp` | `457.5px` (**50.0%**) | `555.1px` | `633.1px / 915` (above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |
| `412×915` · 4 drivers | Night / Day / Wind-down | `splash-1179x2556.webp` | `457.5px` (**50.0%**) | `799.2px` | `877.2px / 915` (all 4 + Add above fold) | `0px` | `false` | `rgba(6, 17, 46, 0.72)` / `rgba(145, 228, 255, 0.22)` / `#eef5fd` |

- In all cases, `background-color` resolved to `rgb(2, 6, 20)` (`#020614`), `background-size: cover`, `background-repeat: no-repeat`, `background-position: 50% 0%` (`top center`), and the resolved background image URL returned HTTP `200` with `content-type: image/webp`.
- All splash sub-flows (PIN entry, wrong-PIN rejection + cooldown, Forgot-PIN recovery, new-driver registration + mandatory disclosure modal, legacy single-driver migration) remained 100% reachable, legible, and verified in real Chromium.

---

## 4. Pins Replaced / Strengthened

Zero pins were deleted without an equal-or-stronger falsifiable replacement (total counts preserved: `drivers` **11/11**, `auditfix` **200/200**):

1. **`DR1` (`web/test/dom/drivers.mjs:186-206`)** — replaced old DOM `img[src="./icon-512.png"]` + `h1("Clock 14")` check with:
   - Asserts `[data-splash-screen="1"][data-splash-view="picker"][aria-label="Clock 14"]`, **zero** `img.splash-logo`/`icon-512.png` and **zero** `h1.splash-title`/`Clock 14` DOM duplication, empty prompt + `Add a driver` present, app chrome (`nav`, `header`) hidden.
   - Verifies static CSS contract (`#020614`, both `.webp` URLs, `top center`, `no-repeat`, `cover`, `min-height: 100dvh`), file existence on disk, and `sw.js` precaching + `r.ok && sameOrigin` runtime rule.
2. **`Splashart fresh launch (0 drivers, 412×915)` (`web/test/dom/auditfix.mjs:537-575`)** — replaced `Drivers1 fresh launch` DOM logo/title pin:
   - Asserts computed `#020614` fallback, `splash-1179x2556.webp` applied & HTTP 200 `image/webp`, `cover` / `no-repeat` / `50% 0%`, zero DOM logo/title duplication, `.splash-body` in `[48%..55%]`, frosted empty card (`rgba(6, 17, 46, 0.72)` fill, `rgba(145, 228, 255, 0.22)` border), `"Add a driver"` above fold, zero horizontal overflow.
3. **`Splashart 412×915 (1 driver)` (`web/test/dom/auditfix.mjs:647-682`)** — replaced `Splashlogo 412×915 (1 driver)`:
   - Asserts `splash-1179x2556.webp`, `#020614`, `cover` / `no-repeat` / `50% 0%`, zero DOM logo/title duplication, `.splash-body` in `[48%..55%]`, frosted driver tile + frosted Add button, both above fold, zero horizontal overflow.
4. **`Splashart 360×640 (1 driver)` (`web/test/dom/auditfix.mjs:684-722`)** — replaced `Splashlogo 360×640 (1 driver)`:
   - Asserts viewport switches to 9:16 `splash-1080x1920.webp` (fetched HTTP 200 `image/webp`), `#020614`, `cover` / `no-repeat` / `50% 0%`, zero DOM logo/title duplication, `.splash-body` in `[56%..62%]`, frosted driver tile, driver tile + Add above fold (`<= 640px`), zero horizontal overflow.
5. **`Splashart 2-driver splash at 360×640` (`web/test/dom/auditfix.mjs:799-825`)** — replaced `Drivers1 2-driver splash at 360×640` logo-box check:
   - Asserts both drivers `["Marcus","Elena"]` + `"Add a driver"` over `splash-1080x1920.webp`, zero DOM logo/title duplication, `.splash-body` in `[56%..62%]`, zero horizontal overflow, full reachability.
6. **`Splashart 360×640 & 412×915 (night / day / winddown, 4 drivers)` (`web/test/dom/auditfix.mjs:980-1055`, 3 pins)** — replaced the 3 `Splashlogo 360×640` 4-driver pins and expanded coverage to **both** `360×640` and `412×915`:
   - Across Night, Day, and Wind-down themes, asserts correct aspect-matched artwork (`splash-1080x1920.webp` at `360×640`, `splash-1179x2556.webp` at `412×915`), `#020614`, zero DOM logo/title duplication, lower-zone placement (`[56%..62%]` / `[48%..55%]`), frosted dark tile (`rgba(6, 17, 46, 0.72)`) with high-contrast light ink (`rgb(238, 245, 253)`) even in Day theme, zero horizontal overflow, reachability of driver #4 (`Sofia`) + Add button, and interactive tap opening Sofia's PIN screen.

---

## 5. Verification Suite Results (Sequential, Foreground)

All 11 required suites ran sequentially and passed on the first run (zero failures, zero flakes, zero retries):

| # | Suite | Command | Result |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 656.6kb + `dist/splash-1080x1920.webp` + `dist/splash-1179x2556.webp`) |
| 2 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** (contrast 44/44×3, nightlight OK, ocr-bundle OK, smoke + 18 DOM suites incl. `drivers` 11/11, `drivers-relaunch` 6/6, `myweek` 19/19, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, `rescue` 11/11) |
| 3 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** (identical full pass across all sub-suites) |
| 4 | **gemini** | `esbuild test/dom/gemini.mjs ... && node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 5 | **revisions** | `esbuild test/dom/revisions.mjs ... && node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 6 | **contrast** | `node test/contrast.mjs` | **PASS** — Day **44/44** (1.16×), Night **44/44** (1.34×), Wind-down **44/44** (1.20×) |
| 7 | **nightlight** | `node test/nightlight.mjs` | **PASS** (`nightlight: OK`) |
| 8 | **lebrowser** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/lebrowser.mjs` | **252 pass, 0 fail** |
| 9 | **polish** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/polish.mjs` | **295 pass, 0 fail** |
| 10 | **layout** | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/layout.mjs` | **421 pass, 0 fail** (`LAYOUT OK`, zero flakes) |
| 11 | **auditfix** | `TZ=America/Chicago HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`, incl. all 7 Splashart pins) |

---

## 6. Hard Invariants Confirmation

- **`engine/` byte-identical:**
  ```text
  find engine -type f -not -path '*/node_modules/*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Exact match to required baseline `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`.
- **Storage keys unchanged:** `web/src/store.ts` and `web/src/drivers.ts` untouched; `auditfix` legacy migration pin confirmed only the 4 existing storage keys (`hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, `hos-sandbox-undo-v1`).
- **Privacy gate & rest of app untouched:** No driver data renders before PIN unlock; all post-unlock screens and Day / Night / Wind-down themes are untouched.
