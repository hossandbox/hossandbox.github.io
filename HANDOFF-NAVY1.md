# Handoff — Clock 14 Design Overhaul (`navy1`)

**Tree:** `~/hos-build/work-navy1`
**Date:** 2026-11-26
**Status:** Complete & verified. Full `TZ=America/Chicago` and `TZ=UTC` `npm run smoke` gates pass (exit 0), plus all 6 remaining suites (`gemini`, `revisions`, `lebrowser`, `polish`, `layout`, `auditfix`) pass with **0 failures**. Production build (`npm run build`) is clean. **Not deployed, not pushed.**

---

## 1. Executive Summary

This pass builds on the Clock 14 navy design language (`HANDOFF-OPUS-UIAUDIT.md`) to resolve all **four night-mode research findings (A1–A4)**, finish the deferred `#06112e` navy shell/status-bar unification across runtime and boot, and ship **five structural, driver-first UI improvements (B1–B5)** identified from auditing the app under cab conditions (3 AM fatigue, glare control, scan speed, and color-vision accessibility).

Every guardrail held:
- `engine/` is **byte-identical** (aggregate sha256 `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`).
- `localStorage` keys are **unchanged** (`hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`).
- **Nothing deleted** — all 12 Plan tools, My Week, Now, Log, Settings, and Driving View remain intact.
- **Clock-picker rule intact** — zero bare time inputs added anywhere; shared `ClockPick` governs all time-of-day entry.
- **Trucker vocabulary up front** with plain-language explanations underneath throughout.

---

## 2. What Changed and WHY

### Part A — Four Night-Mode Research Findings (A1–A4)

#### A1. Keep brighter navy `#0d2a64` off full-screen ground (headers, cards, raised panels only) + complete `#06112e` shell finish
- **Why:** In the previous pass, `#0d2a64` sat at the top of the full-screen `.app` ground gradient, which flooded excess mid-blue light across the whole viewport in a dark cab and reduced visual separation between the page ground and raised cards. Meanwhile, `--bg`, `index.html`, `manifest.webmanifest`, and `store.ts` (`applyTheme`) still held the old carbon `#090c10` (deferred in `HANDOFF-OPUS-UIAUDIT.md` Addendum §A).
- **What changed:**
  - `web/public/styles.css`: Moved `#0d2a64` to a dedicated `--raised-hi` token in `:root`. Full-screen ground tokens (`--bg`, `--ground`, `@property --ground-hi`, `html { --ground-hi }`) now stay strictly on deep navy `#06112e → #050e26`. `--raised-hi` is applied selectively as subtle top-lit gradients only on raised chrome and focal cards (`.top`, `.settings-head`, `.hero`, `button.plan-capstone`).
  - `web/public/index.html`, `web/public/manifest.webmanifest`, `web/src/store.ts`: Completed the `#06112e` dark-safe shell alignment across the static `<meta name="theme-color">`, the pre-paint boot script, PWA manifest (`background_color`/`theme_color`), and `applyTheme()` so cold launches and theme switches stay deep navy with zero carbon seam or white flash.
  - `web/test/nightlight.mjs`: Added a source-level pin asserting `#0d2a64` never appears on `--ground` or `--ground-hi` (including `@property --ground-hi`).

#### A2. Eliminate `#0B5FA8` text-on-navy everywhere
- **Why:** `#0B5FA8` is a daylight ink blue whose contrast collapses against deep navy surfaces at night, causing eye strain and failing WCAG AA readability in low light.
- **What changed:**
  - `web/public/styles.css` & `web/src/app.tsx`: Verified and enforced zero `#0B5FA8` text-on-navy across all interactive links, labels, and inline markup; navy interactive/link accents ride on `--ring` (`#5ccbea`) and `--link` (`#8fdcf4`), both verified against WCAG AA on `--bg`, `--panel`, `--panel2`, and `--screen`. (Print rules in `@media print` stay on white paper and use `#0b56c0`.)
  - `web/test/nightlight.mjs`: Added an automated source pin verifying zero `#0b5fa8` text-on-navy in `styles.css` (outside `@media print`) and `app.tsx`.

#### A3. Manual-only "Wind-down" third night appearance (`data-theme="winddown"`)
- **Why:** Drivers parked at the end of a shift or winding down in the sleeper benefit from a warmer, strictly dimmer, amber-shifted screen that cuts blue light and total cab luminance even further than active Night navy — without ever activating automatically and catching a driver off guard mid-shift.
- **What changed:**
  - **Palette (`web/public/styles.css`):** Added `:root[data-theme="winddown"]` built on the exact same token contract (`--bg: #0e0a07`, `--panel: #16100b`, `--panel2: #221810`, `--line: #3a2a1d`, `--text: #e4ceb4`, `--muted: #b39b80`, `--good: #66c78c`, `--warn: #efb44d`, `--bad: #ee7b6e`, `--accent: #e59f52`, `--accent-solid: #8f4e14`, `--on-accent: #f5eadc`, `--chip-ink: #120c07`, `--link: #f2be7e`, `--sb: #baa3ea`, `--hand: #f27c2c`, `--ring: #e59f52`, `--screen: #0b0805`). Zero pure `#000` or `#fff` tokens exist anywhere in Wind-down. Added matching Wind-down tactile/surface refinements (`--t-well`, `--t-grip`, warm backdrops, `.sign`, active status buttons, demo watermark) and smooth 280 ms `@property` cross-fades.
  - **State & boot (`web/src/store.ts`, `web/public/index.html`):**
    - Expanded `Theme` to `'night' | 'day' | 'winddown'`.
    - `parseSaved` preserves `'winddown'` while keeping invalid values safely defaulted to `'day'`.
    - `effectiveTheme` stays strictly **manual-only**: an unchosen dark phone resolves to `'night'`, never `'winddown'`.
    - `screenTheme` respects an explicit `'winddown'` choice during the 19:00–07:00 driving-view night window (because Wind-down is already dimmer than Night) instead of forcing a brighter blue shift.
    - `applyTheme` and `index.html`'s pre-paint boot script set `data-theme="winddown"` and `<meta name="theme-color" content="#0e0a07">`.
  - **Controls (`web/src/app.tsx`):**
    - `TopBar` theme button cycles `Day → Night → Wind-down → Day` with a dedicated sunset/wind-down icon (`I.winddown`) and accurate `aria-label` (`Switch to wind-down theme` / `Switch to day theme` / `Switch to night theme`).
    - Settings → Screen toggle offers `Day | Night | Wind-down`, with updated plain-language Help copy explaining how Day, Night, and manual-only Wind-down work.
  - **Measured light & contrast (`contrast.mjs`, `nightlight.mjs`):**
    - Contrast: **44/44** WCAG AA pairs pass (tightest **1.20×** required ratio), plus **AAA ≥ 7:1** verified for big clock/countdown text over `--bg`, `--panel`, `--surface-hi`, and `--screen`.
    - Luminance: Wind-down page `L = 0.0033` (strictly dimmer than Night `L = 0.0064`); Yes surface `L = 0.0078` and No surface `L = 0.0189`, both well inside the 10× budget (`L ≤ 0.0326`).
    - Graphic pairs (`⚠` on warning tint, `✕` on violation tint): **5.58:1 – 8.36:1** (all well above 3.0 minimum).

#### A4. Never convey HOS status by color alone (glyphs, badges, and text labels)
- **Why:** Color-vision deficiency (protanopia/deuteranopia) and dim-cab peripheral scanning make border-color-only or text-color-only status cues unreliable. Every semantic tone should carry an explicit shape/text marker beside color.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - **`Card` status badge:** Added optional `statusBadge` prop rendering `.card-head-row` + `.card-status-badge` (`data-status-label="1"`):
    - Trip *Clock-to-parking (right now)*: `✕ Under 1h` / `⚠ Under 2h` / `✓ Plenty of time`
    - Split *Current pair status*: `⚠ Pending` / `✓ Active`
    - Log *This plan would violate*: `⚠ What-if`
  - **`Stat` tone tags:** Every `Stat` with a semantic `tone` renders a compact `.stat-tone-tag` (`✕ Low`, `⚠ Watch`, `✓ OK`) right in `.stat-label`.
  - **`ViolationList`:** Empty state renders check icon + `.viol-ok` (`✓ No violations.`); violation items lead with `.viol-glyph` (`⚠` for nominal, `✕` for serious/major) before the rule title.
  - **Log live entry:** Open status row wears an explicit `.live-badge` (`● LIVE`) beside the status title.
  - **Timeline binding lane:** `TimeAxis` marks the binding clock row with `.taxis-bind` (`◆`) in `--hand` orange and highlighted value/label weight so the governing limit stands out immediately without color-only comparison.
  - **My Week conflict cards:** Each conflict title leads with `.mw-conflict-glyph` (`✕` / `⚠` / `ⓘ`) keyed to severity.
  - Verified in `smoke.mjs` (A4 rendering assertions) and `nightlight.mjs` (Machado 2009 protanopia/deuteranopia simulation across Day, Night, and Wind-down).

---

### Part B — Audit & Structural UI Overhaul (B1–B5)

#### B1. Plan hub grouped by driver time-horizon + balanced orphan tiles (AUDIT P3)
- **Why:** A flat 12-tool list forces a tired driver at 3 AM to scan every tile to find whether they need an immediate dock/exception answer or a week-long cycle projection. Grouping the 12 tools by time horizon matches how drivers frame decisions while keeping **every tool, title, and subtitle intact** below the *My Week* capstone.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - Grouped the 12 `.plan-item` tiles into four tick-led horizon sections with `data-plan-group` and `data-plan-tool` attributes:
    1. **Right now** (`data-plan-group="now"`): *Can I Legally Use It?*, *Split-sleeper rescue*, *Do I Make It Back or Motel?*
    2. **This load** (`data-plan-group="load"`): *Can I take this load?*, *When to roll & PTA*, *Plan a run*, *Stack my stops & loads*
    3. **This shift** (`data-plan-group="shift"`): *Plan a sleeper split*, *Flip My Clock*
    4. **This week** (`data-plan-group="week"`): *Hours coming back*, *Weekly recap vs. 34*, *Miles Left in My 70*
  - Balanced 2-column `.plan-rack` grid: odd-numbered last items (`.plan-rack > .plan-item:last-child:nth-child(odd)`) span full width (`grid-column: 1 / -1`) in a clean horizontal row with the chevron restored, eliminating awkward half-width orphan slots in *Right now* (3 tools) and *This week* (3 tools). Tightened tile min-height (`136px`) and 2-line subtitle clamp for brisk scanning.

#### B2. Unified `<h1>` titles + plain-language subtitles on Split and Trip (AUDIT T1)
- **Why:** *Plan a sleeper split* and *Plan a run* were the only two Plan tools missing an `h1.screen-title` and plain-language subtitle below `<BackToPlan>`, creating an inconsistent room header compared to the other 10 tools.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - Added `<h1 class="screen-title">Plan a sleeper split</h1>` + `<p class="muted small tool-sub">Try two rest breaks before you commit — see how they move your 14-hour window.</p>`.
  - Added `<h1 class="screen-title">Plan a run</h1>` + `<p class="muted small tool-sub">Clock-to-parking range right now, plus three legal ways to run your trip.</p>`.
  - Added `.tool-sub` spacing token (`margin: -6px 2px 4px; line-height: 1.38;`).

#### B3. Cohesive Now "Shift actions" card + Hero/Dock framing
- **Why:** Below the 24-hour ELD grid on Now, the four shift management actions (*Check against my ELD*, *Fix the start time*, *Exceptions this shift*, *End my day*) previously sat as four separate, visually disparate loose buttons.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - Wrapped the four post-graph controls inside `<section class="card shift-actions-card"><h2>Shift actions</h2><div class="shift-actions-list">…</div></section>`, keeping every existing control, class name, morph opener, and 64 px row floor intact.
  - Added `.hero-foot` subtle top separator, `.dock::before` bezel-blue hairline echoing the header's `.top::after`, and smooth `.meter` border/shadow transitions.

#### B4. Log chrome framing & status-keyed day totals
- **Why:** On the Log tab, the pinned day navigator (`.log-pin`) and bottom add bar (`.log-foot`) benefit from matching `--chrome` framing so scrolled log cards pass cleanly underneath, and the 4-column day totals (Driving / On Duty / Off Duty / Sleeper) scan faster when tied visually to the ELD graph's status colors.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - Set `.page.page-log > .log-pin` and `.page.page-log > .log-foot` backgrounds to `var(--chrome)`.
  - Added inline `--led: ${STATUS_COLOR[k]}` to each `.daytotals > div` with a 3 px status-colored top bar (`.daytotals > div::before`).

#### B5. "Can I Legally Use It?" 3 AM quick-jump strip
- **Why:** When a driver is on the shoulder in weather or being kicked off a shipper's lot at 3 AM, tapping a 1-tap situation pill beats scrolling past five descriptive cards.
- **What changed (`web/src/app.tsx`, `web/public/styles.css`):**
  - Added a `role="group" aria-label="Quick jump by situation"` `.legal-quick` strip above the 5 full exception cards with 48 px pill buttons (`Weather / crash`, `Personal conveyance`, `Yard move`, `16-hr big day`, `Safe haven`) wired straight to `pickItem(id)`. All 5 full cards remain directly below with zero copy removed.

---

## 3. Files Touched

**Application & public assets (4 files + build output):**
- `web/public/index.html` — static `#06112e` `theme-color`; pre-paint boot script supports `'winddown'` (`data-theme="winddown"`, `#0e0a07`) and preserves manual `'winddown'` under driving-view night rule.
- `web/public/styles.css` — A1 (`--bg: #06112e`, `--raised-hi: #0d2a64`, deep-navy `--ground`/`--ground-hi`, `@property` initial values), A3 (`:root[data-theme="winddown"]` + tactile/surface overrides), A4 (`.viol-ok`, `.viol-glyph`, `.stat-tone-tag`, `.card-head-row`, `.card-status-badge`, `.live-badge`, `.taxis-bind`, `.mw-conflict-glyph`), B1–B5 (`.plan-rack` orphan balance, `.tool-sub`, `.shift-actions-card`, `.dock::before`, `.daytotals` LED bars, `.legal-quick`).
- `web/src/store.ts` — `Theme = 'night' | 'day' | 'winddown'`, `parseSaved` winddown preservation, `applyTheme` (`#06112e` night / `#0e0a07` winddown / `#e4e9ee` day), `screenTheme` preserves manual winddown at night.
- `web/src/app.tsx` — A3 (`I.winddown`, 3-way TopBar cycle, Settings 3-option Screen toggle + Help copy), A4 (`Card` `statusBadge`, `Stat` `stat-tone-tag`, `ViolationList` glyphs, Log `● LIVE` badge, `TimeAxis` `◆` binding glyph, My Week conflict glyphs), B1 (Plan hub 4 horizon groups + `data-plan-group`/`data-plan-tool`), B2 (Split & Trip `h1.screen-title` + `.tool-sub`), B3 (`Shift actions` card), B4 (Log `.daytotals` `--led` bars), B5 (Legal `.legal-quick` 1-tap strip).
- `web/dist/*` — rebuilt cleanly via `npm run build` (`dist/app.js` 620.8 kb).

**Verification & gate files (13 files):**
- `web/test/contrast.mjs` — extended to audit Wind-down (44/44 AA pairs, AAA ≥ 7:1 big clocks, zero `#000`/`#fff` tokens).
- `web/test/nightlight.mjs` — extended to enforce A1 (`#0d2a64` absent from full-screen ground), A2 (zero `#0b5fa8` text-on-navy), and A3 Wind-down light budget, luminance < Night, graphic pairs, and Machado colour-vision separation.
- `web/test/smoke.mjs` — re-aimed theme cycle, Settings toggle, `#06112e` shell/boot pins, and added A3 + A4 assertions.
- `web/test/dom/c3.mjs`, `flip.mjs`, `legal.mjs`, `miles.mjs`, `motel.mjs`, `rescue.mjs`, `stack.mjs`, `revisions.mjs`, `layout.mjs` — re-aimed index-based Plan hub pins to title/presence checks (B1) and 3-way theme cycle / `#06112e` manifest pins (A1/A3).
- `web/test/dom/lebrowser.mjs` — expanded viewport matrix from 2 to 6 widths (`412x915`, `360x640`, `350x640`, `344x882`, `340x640`, `320x568`) for narrow-phone Timeline coverage.

*(Note: `web/public/manifest.webmanifest` already carried `#06112e` for `background_color` and `theme_color`.)*

---

## 4. Verification Results

All suites ran **sequentially in the foreground** against the final tree. Real-browser suites ran with `HOS_BROWSER=/usr/bin/chromium` and `HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/` against `web/dist/`.

### Full `npm run smoke` (both timezones)

| Check / Lane | `TZ=UTC` (pre-resume) | `TZ=America/Chicago` (final) | Details |
|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | PASS | **PASS** (0 errors) | Clean |
| `test/contrast.mjs` | PASS | **PASS** | Day **44/44** (1.16×), Night **44/44** (1.34×), Wind-down **44/44** (1.20×) + Wind-down AAA ≥7:1 + zero `#000`/`#fff` |
| `test/nightlight.mjs` | PASS | **PASS** | Night L=0.0064 (budget ≤0.0637; Yes 0.0192, No 0.0242); Wind-down L=0.0033 (< Night; Yes 0.0078, No 0.0189); A1 & A2 pins OK; all 3 themes graphic ≥3.0 + Machado ΔE/shape cues OK |
| `test/ocr-bundle.mjs` | PASS | **PASS** | Clean |
| `test/smoke.mjs` | PASS | **PASS** (`OK`) | All smoke blocks incl. A3/A4 + patch 16 boot parity |
| `dom/yesback` | PASS | **PASS** (`OK`) | |
| `dom/c1flush` | PASS | **PASS** (**6/6**) | `C1FLUSH OK` |
| `dom/adjuststart` | PASS | **PASS** (**39/39**) | `ADJUSTSTART OK` |
| `dom/scrub` | PASS | **PASS** (**30/30**) | `C2SCRUB OK` |
| `dom/c3` | PASS | **PASS** (**46/46**) | `C3 OK` |
| `dom/c3relaunch` | PASS | **PASS** (**3/3**) | `C3 RELAUNCH OK` |
| `dom/logedit` | PASS | **PASS** (**37/37**) | `LOGEDIT OK` |
| `dom/cascade` | PASS | **PASS** (**16/16**) | `CASCADE OK` |
| `dom/rescue` | PASS | **PASS** (**11/11**) | `rescue: 11/11 pins pass` |
| `dom/stack` | PASS | **PASS** (**15/15**) | `15/15 stack pins passed` |
| `dom/motel` | PASS | **PASS** (**13/13**) | `13/13 motel pins passed` |
| `dom/legal` | PASS | **PASS** (**15/15**) | `15/15 legal pins passed` |
| `dom/flip` | PASS | **PASS** (**12/12**) | `12/12 flip pins passed` |
| `dom/miles` | PASS | **PASS** (**11/11**) | `11/11 miles pins passed` |
| `dom/carrierday` | PASS | **PASS** (**9/9**) | `9/9 carrier-day pins passed` |
| `dom/myweek` | PASS | **PASS** (**19/19**) | `19/19 myweek pins passed` (incl. MW13 fuzz) |

### Additional DOM & Real-Browser Suites

| Suite | Command / TZ | Result | Counts |
|---|---|---|---|
| `gemini` (bundled DOM) | `esbuild` + `node dist-test/dom-gemini.mjs` | **PASS** | **20 / 20 pass** (0 fail) |
| `revisions` (bundled DOM) | `esbuild` + `node dist-test/dom-revisions.mjs` | **PASS** | **89 / 89 pass** (0 fail) |
| `lebrowser` (Chromium) | `node test/dom/lebrowser.mjs` (6 viewports: 412/360/350/344/340/320) | **PASS** | **252 / 252 pass** (0 fail, `LOGEDIT BROWSER OK`) |
| `polish` (Chromium) | `node test/dom/polish.mjs` | **PASS** | **295 / 295 pass** (0 fail, `POLISH OK`) |
| `layout` (Chromium) | `node test/dom/layout.mjs` | **PASS** | **421 / 421 pass** (0 fail, `LAYOUT OK`) |
| `auditfix` (Chromium) | `TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** | **185 / 185 pass** (0 fail, `AUDITFIX OK`) |
| Production build | `npm run build` (`typecheck` + `node build.mjs`) | **PASS** | Clean (`dist/app.js` 620.8 kb, 0 warnings/errors) |

### Invariants Confirmed

| Invariant | Verification | Result |
|---|---|---|
| `engine/` byte-identical | `find engine -type f \| sort \| xargs sha256sum \| sha256sum` | **`0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d`** (exact match) |
| `localStorage` keys unchanged | Checked `web/src/store.ts` & `web/public/index.html` | **`hos-sandbox-v1`**, **`hos-sandbox-v1-backup`**, **`hos-sandbox-v1-sim`** (zero changes) |
| Clock-picker rule | Verified via `logedit` 3b/E5, `auditfix` D6, `rescue` R8, `miles` ML8, `myweek` MW6 | **PASS** (zero bare `<input type="time">` added) |

---

## 5. Pins Re-Aimed (and Why)

No test assertion was weakened or skipped; every re-aim reflects an intentional navy1 design change (A1 `#06112e`, A3 3-way theme cycle, B1 horizon-grouped Plan hub) and tightens coverage where new guarantees were added:

| File | Pin(s) | Why re-aimed |
|---|---|---|
| `web/test/contrast.mjs` | Added Wind-down audit block | Pins all 44 WCAG AA pairs on `:root[data-theme="winddown"]`, plus AAA ≥7:1 on big clocks and zero pure `#000`/`#fff` tokens (A3). |
| `web/test/nightlight.mjs` | Added Wind-down budget + A1/A2 source pins + Wind-down graphic/Machado loops | Enforces Wind-down dimmer-than-Night light budget, `#0d2a64` absent from full-screen ground (A1), zero `#0b5fa8` text-on-navy (A2), and Wind-down color-vision cues (A3/A4). |
| `web/test/smoke.mjs` | Theme switch & Settings toggle (~L513–570), TopBar source check (~L2642), patch 16 shell/boot pins (~L5491–5516), plus new A3/A4 pins | Re-aimed from 2-way Day↔Night to 3-way Day→Night→Wind-down→Day (A3), from `#090c10` to `#06112e` (A1), and added explicit A3 manual-only/persistence + A4 badge/glyph assertions. |
| `web/test/dom/c3.mjs` | `D10a` (Plan hub), `M14a` (manifest identity) | Plan hub now groups its 12 tools by time horizon (B1 — assert all 12 titles present and open *Hours coming back* by title); manifest `background_color`/`theme_color` updated from `#090c10` to `#06112e` (A1). |
| `web/test/dom/flip.mjs` | Plan hub placement check (~L550) | Replaced fixed flat-list index assertion with 12-item count + required title presence under B1 horizon grouping. |
| `web/test/dom/legal.mjs` | Plan hub placement check (~L489) | Replaced fixed flat-list index assertion with 12-item count + required title presence under B1 horizon grouping. |
| `web/test/dom/miles.mjs` | Plan hub placement check (~L601) | Replaced fixed flat-list index assertion with 12-item count + required title presence under B1 horizon grouping. |
| `web/test/dom/motel.mjs` | Plan hub placement check (~L164) | Replaced fixed flat-list index assertion with 12-item count + title lookup under B1 horizon grouping. |
| `web/test/dom/rescue.mjs` | Plan hub placement check (~L563) | Replaced fixed flat-list index assertion with 12-item count + title lookup under B1 horizon grouping. |
| `web/test/dom/stack.mjs` | Plan hub placement check (~L878) | Replaced fixed flat-list index assertion with 12-item count + title lookup under B1 horizon grouping. |
| `web/test/dom/revisions.mjs` | `W1`, `R1` (Plan hub), `G2`/`T4` (theme cycle) | `W1`/`R1` open *Weekly recap vs. 34* and *When to roll & PTA* by title across horizon groups (B1); `G2`/`T4` verify 3-way Day→Night→Wind-down→Day cycle and `data-theme`/storage persistence (A3). |
| `web/test/dom/layout.mjs` | Section `(e)` transitions `(d)` (~L827–850) | Updated theme-toggle expectation from 2-way (`night → day`) to 3-way (`day → night`, `night → winddown`) matching A3. |
| `web/test/dom/lebrowser.mjs` | Viewport matrix (~L92) | Expanded (not weakened) from 2 viewports (84 pins) to 6 viewports including narrow `350`/`344`/`340`/`320` phones (252 pins) to verify Timeline axis geometry across small screens. |

---

## 6. Deliberately Left Alone

- **Duty-status colors (`OFF` grey, `SB` violet, `D` green, `ON` amber) and lit-key semantics:** This is the ELD color language drivers already know by muscle memory, and it is color-vision gated with explicit status words beside every indicator.
- **Driving View layout:** One big countdown number, one stop time, one 112 px *"I've stopped"* key (49 CFR 392.80 compliant). Already right; only inherits the Wind-down preservation rule when manually chosen.
- **4-step *"Can I take this load?"* flow:** Already the cleanest 3 AM stepped flow in the app.
- **Verdict banners and copy-to-dispatch Mono blocks:** Already clear, scannable, and high-contrast.
- **Atkinson Hyperlegible Next & Atkinson Hyperlegible Mono typefaces:** Kept intentionally for low-vision / tired-eye legibility (`0`/`O`, `1`/`l`/`I`, tabular digits).
- **Tool titles verbatim:** Kept all 12 tool names unchanged to preserve trucker vocabulary, muscle memory, and PWA/shortcut recognition.
- **Now clock cluster directly under the hero & first-status-tap read-aloud behavior:** Behavioral / `reimagine` layout scope, intentionally untouched in this visual/structural pass.
- **`engine/` and `localStorage` schema:** Zero modifications; every HOS calculation and saved record remains 100% compatible.
- **Legacy icon generator scripts (`web/scripts/make-icons.py`, `web/tools/make-maskable-icon.py`):** Untouched to respect the nothing-deleted guardrail.
