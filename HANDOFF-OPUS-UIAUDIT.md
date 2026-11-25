# Handoff — Opus UI audit + redesign pass (Clock 14)

**Tree:** `~/hos-build/work-opusdesign` (copy of the live Clock 14 build)
**Author:** Opus 5.5 (design lead for this pass, reassigned from Fable by Lorico on Nov 25, 2026)
**Status:** implemented, full gate run in both timezones with **no new failures** against the pristine tree (§6). **Not deployed, not pushed.** Ada verifies,
and deployment waits for Lorico's explicit go.
**Companion:** `AUDIT.md` (findings, and the cue system in §0). The previous first-run audit was
preserved as `AUDIT-FIRSTRUN-PRIOR.md`.

---

## 1. What changed (complete file list vs. the pristine copy)

`diff -rq` against a byte copy of the starting tree (`~/hos-build/opusdesign-scratch/pristine-tree`),
excluding node_modules/dist/dist-test:

| File | Change |
|---|---|
| `web/public/styles.css` | (a) Night and day token blocks re-derived from the logo. (b) `@property` initial values and `--ground-hi/lo` in the motion system updated so the 280 ms theme cross-fade lands on the new colours. (c) A new block appended at the end, **"CLOCK 14 DESIGN LANGUAGE"** (~110 lines), carrying every structural re-skin. Nothing earlier was deleted, so reverting the pass means restoring two token blocks and removing one trailing block. |
| `web/src/app.tsx` | Two presentation edits, 6 lines in total. **TopBar:** the theme key's word is wrapped in `<span class="theme-word">` (aria-label unchanged). **PlanTab:** the twelve tool buttons are wrapped in `<div class="plan-rack">`, and the section heading reads "The toolbox" instead of "Single-load & shift tools". DOM order, classes, titles, subtitles and handlers are untouched. |
| `web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Regenerated from the logo master, optically centred (§4). |
| `web/tools/make-logo-icons.sh` | **New.** Reproducible ImageMagick script for the icon set (logo in → three PNGs out). It is tooling, not shipped, and the build doesn't run it. |
| `AUDIT.md` | **Replaced** with this pass's audit. The old one was moved, not deleted, to `AUDIT-FIRSTRUN-PRIOR.md`. |
| `HANDOFF-OPUS-UIAUDIT.md` | This file. |

**Hard lines, verified:**
- `engine/` is byte-identical (`diff -rq` clean).
- `web/src/store.ts` is byte-identical (sha256 `21bc674d…51db7f`, the same hash recorded in
  HANDOFF-RENAME). No presentation state was added.
- Every number on screen still comes from the engine. No computation was touched; the only TSX edits
  are a span and a wrapper div.
- Same twelve Plan tools + My Week + Now/Log/More: none added, none removed, none renamed.
- ClockPick and the duration boxes are untouched (no form markup changed).
- Dark, mobile-first: night stays the product default, and everything was checked at 412 px. The
  layout lane covers 360 px.
- **No test file was edited.** Two pins that restricted the design are documented in §5 instead.

---

## 2. The design system (short version; the full table is in AUDIT.md §0)

The **logo is the source**. Five cues, each as a rule:

1. **Field:** navy, lit from the top. Ground `#0d2a64 → #050e26`; chrome (header/dock/tab bar)
   `#06112e`; panels `#0b1a3c` / `#11244d`; wells `#06122f`. Day theme: cool blue-white paper with
   **navy ink** `#071331`.
2. **Bezel:** light blue `#5ccbea` (`--ring`, `--accent`). *Every indicator is a ring*: tool icons,
   the capstone icon, the selected meter, focus rings, the tab lamp and the dial arc.
3. **Face:** royal blue `#1857c8` (`--accent-solid`). The one solid commit key per screen.
4. **Hand:** orange `#ff7a1f` (`--hand`, new token). *Orange means NOW and nothing else*: the dial's
   moving tip, the timeline's present edge, the dot on the live header clock. Warnings stay amber,
   pushed slightly toward yellow (`#ffbd4a`) so the two can't be confused.
5. **Ticks:** section labels are led by a 3×12 hour-mark in the bezel colour.

Shapes: containers are rounded squares (the logo tile); indicators are circles (the dial).
Type: Atkinson Hyperlegible kept on purpose (a low-vision face); titles at 800 weight with tight
tracking echo the wordmark; every clock is in Atkinson Mono.

New tokens: `--hand`, `--chrome`, `--ring` (both themes). Every pre-existing token keeps its name.

---

## 3. Before → after, per screen

Side-by-side images: `~/hos-build/opusdesign-scratch/before-after/*.png`. Full sets:
`shots-before/` and `shots-a/` (night), `shots-d/` (day), `shots-t/` (all tools, night).

| Screen | Before | After | Why |
|---|---|---|---|
| **Header** | Carbon bar; the status pill wrapped to two lines at 412 px ("On Duty ·" / "20m"); muted grey clock; theme key "☀ Day" | Navy chrome with a bezel-blue hairline under it. The pill holds one line (≥380 px). The live clock is full-strength ink with an orange hand dot. The theme key shows only the sun/moon icon on phones; the word stays in the DOM, and the aria-label and title are unchanged | One line reads in a glance. The clock is the app's name, so it gets the hand. |
| **Now (hero)** | Carbon card, sky-blue arc, white-blue knob | Navy card with a royal "clock face" glow at the centre, a bezel-blue arc, and an **orange knob** at the moving tip | The dial *is* the logo's clock. The tip is "now". |
| **Now (cluster, dock)** | Carbon wells, black dock | Navy wells and chrome dock. The status keys are unchanged (their fill is pinned, and it is the ELD language) | |
| **Driving view** | Carbon | Navy field, orange dial tip; nothing else changed | That screen is already right. |
| **Log** | Plain uppercase section captions | Captions led by the tick; navy graph screen | One system for section labels across the app. |
| **Plan hub** | Capstone with a thick left accent bar (a warning idiom); 12 identical 84 px rows; **3 screens** of scroll | Capstone as **the clock**: a 2 px bezel ring, a halo, a royal face glow, a 56 px ringed icon. The 12 tools are a **two-column rack** of tiles: ringed icon, bold title, subtitle clamped to three lines (full text still in the DOM), and no chevron because the whole tile is the door. The rack takes **~1.6 screens** | Scan time and thumb travel; the capstone finally looks like the capstone. |
| **Every Plan tool** | Two generations of styling | One family through the shared skin: navy chrome, tick-led sections, bezel-edged royal commit keys, navy wells. Verdict banners keep their sign shapes | The old/new split is now a matter of headers only (see §7). |
| **More / Settings** | Carbon | Navy, tick-led sections | |
| **Sheets / modals** | Carbon backdrop | Navy-tinted backdrop `rgba(2,8,26,.62)` | Keeps the field consistent even under a sheet. |
| **Day theme** | Brushed-titanium grey | Cool blue-white paper, navy ink, royal accent, dark-orange hand `#d4570a` | The logo in sunlight. |
| **Home-screen icon** | Square crop of the logo: the tile's bevel visible across the top, the ring centre ~34 px low, the truck spilling right, so it read off-centre in a circle | Emblem cut out (disc + truck), optically centred on a clean navy field (§4) | Lorico's catch from his phone. |

---

## 4. The icon, in detail

`web/tools/make-logo-icons.sh <logo.jpg> <out-dir>` (ImageMagick 7 + python3, no PIL):

1. **Matte:** the clock disc (r = 242 around the ring centre 512,438) plus the truck silhouette. The
   silhouette is G-channel > 30% in the band y 440–695, closed with a 9 px disc so the windows and
   tyres fill, then dilated 2 px. The wordmark (y > 695) and the tile bevel are excluded.
2. **Optical centre:** logo pixel **(518,435)**. That is between the ring centre (512,438) and the
   bright-pixel centroid (532,427, measured), because the truck adds weight to the right. This point
   lands exactly on the canvas centre.
3. **Field:** a radial `#0c4cb0 → #03144a` gradient, centred slightly high, matching the logo tile's
   top light.
4. **Scale:** maskable 0.58× (the ring sits inside Android's 40% safe circle; only the bumper tip
   reaches past it). Any-purpose 192/512 at 0.66× (fills iOS's rounded square without touching the
   corners).
5. Output is 8-bit opaque RGB (colour type 2). The contrast gate's maskable full-bleed check accepts
   this.

| File | sha256 |
|---|---|
| `icon-192.png` | `9fcb2e16bea3cc7cb7b37ae042c406d5bc7db659a2d4753825608d61341e2142` |
| `icon-512.png` | `5b8f7cc87ede0d03f1bd2467c5223b030a19dcb81b6386b2bbd8bd794f4de85a` |
| `icon-maskable-512.png` | `8095805cf0aab0635afdf05b6b2917b149c69af340678c3d426798c588ea33d0` |

Previews in circle and rounded-square masks:
`~/hos-build/opusdesign-scratch/icon/preview.png` and `before-after/icon-before-after.png`.
Lorico should still check it on his own phone after deploy. Launchers differ, and the service worker
will serve the old icon until the new build's cache rolls over (the `hos-sandbox-<build>` cache name
changes with every build, so this happens on its own).

**Left alone:** `web/scripts/make-icons.py` and `web/tools/make-maskable-icon.py` still draw the
retired green/purple clock. Nothing runs them, but they are misleading. I'd delete them in a cleanup
pass and didn't do it here because that is outside UI scope.

---

## 5. Pins that limited the design (none were edited)

1. **`#090c10` is pinned as the page/chrome colour.** smoke.mjs (patch 16, ~line 5463),
   c3.mjs M14a, and contrast.mjs (meta theme-color == night `--bg`) all pin it. So `--bg`, the
   browser status-bar colour and the install splash stay near-black. I routed every visible surface
   through the new `--chrome` / ground tokens, so on screen only the phone's status bar shows it.
   **To finish:** change `--bg` to `#06112e` in `:root`, update `index.html` (meta + boot script),
   `manifest.webmanifest`, and the literal `#090c10` in those three pins. That is a one-commit change
   once Lorico OKs the pin edit.
2. **The night rocker colours are pinned to the old carbon.** polish.mjs:141 requires the chosen
   key `rgb(25,33,42)` on an `rgb(9,12,16)` track. My first navy version of `.toggle` failed polish
   (15 pins) and quickfix (15 pins). I put the carbon rocker back explicitly in the new block
   (`.toggle { background-color: var(--bg) }`, `:root:not([data-theme="day"]) .toggle button.on {
   background-color: #19212a }`). Both lanes now pass 295/295 and 20/20. **To finish:** re-aim
   polish.mjs:141 to compare against the tokens rather than literal RGB.
3. **The tab bar's ink is pinned to the old palette.** layout.mjs (e), lines ~632–634 and 760,
   compares the bar's active text, inactive (muted) text, active icon and lamp against literal RGB:
   night `rgb(243,238,228)` / `rgb(170,167,157)` / `rgb(124,200,255)`, day `rgb(11,17,23)` /
   `rgb(69,82,95)` / `rgb(11,95,168)`. My first full run failed 8 of these pins. The last rule in
   styles.css now re-declares those four values **scoped to `nav.tabs` only**, and the lane is back to
   its baseline result. Visually, the bar's inactive labels are a slightly warmer grey than the rest
   of the app, and its lamp is sky-blue `#7cc8ff` instead of bezel `#5ccbea`. Close enough that only
   a side-by-side shows it. **To finish:** re-aim those three `want*` constants to read the tokens
   (as contrast.mjs does), then delete the scoped rule.
4. **The Plan tool order is pinned by index.** revisions W1/R1 and polish `nth(i)` click the tools by
   position, and the titles are pinned verbatim. That blocked grouping by time horizon (AUDIT P3) and
   one copy voice for tool names (AUDIT A6). Both are written up as recommendations with exact
   proposed wording.
5. **The Now page's clock cluster sits directly under the hero** (reimagine.mjs). That blocked
   collapsing the duplicate 11-hr gauge (AUDIT N2).

---

## 6. Verification

The harness is in `~/hos-build/opusdesign-scratch/gate.sh` + `bundled.sh`:
- engine `npm test`;
- `npm run build` + `npm run smoke` (typecheck, contrast, nightlight, ocr-bundle, smoke, and all 16
  `npm run dom` lanes);
- the browser lanes layout / polish / reimagine / quickfix / c2browser / c3browser / lebrowser /
  auditfix;
- the esbuild-bundled shim lanes revisions and gemini.

All of it runs in `TZ=America/Chicago` and `TZ=UTC`, with `HOS_PLAYWRIGHT=~/.hermes/hermes-agent/`
and `HOS_BROWSER=/usr/bin/chromium`. **The same harness was run on the pristine copy**, so every
failure is classified as new or pre-existing.

**Final run** (`gate-final/`, after the last CSS change) next to the **pristine baseline**
(`gate-baseline/`). Logs: `~/hos-build/opusdesign-scratch/gate-{final,baseline}/`.

| Lane | Chicago: baseline → final | UTC: baseline → final | Verdict |
|---|---|---|---|
| engine `npm test` | 108/108 → **108/108** | 108/108 → **108/108** | same |
| `npm run smoke`: typecheck, contrast (44/44 day, 44/44 night), nightlight, ocr-bundle, smoke, all 16 dom lanes (stack 15, motel 13, legal 15, flip 12, miles 11, carrier-day 9, myweek 19, …) | exit 0 → **exit 0** | exit 0 → **exit 0** | same |
| revisions (bundled) | 89/89 → **89/89** | 88/89 → **88/89** | same. The one UTC failure is the known W2 quirk recorded in HANDOFF-RENAME. |
| gemini (bundled) | 20/20 → **20/20** | 20/20 → **20/20** | same |
| layout (browser) | crashed† → **421/421** | 421/421 → **421/421** | same |
| polish | 295/295 → **295/295** | 295/295 → **295/295** | same |
| quickfix | 20/20 → **20/20** | 20/20 → **20/20** | same |
| lebrowser | 84/84 → **84/84** | 84/84 → **84/84** | same |
| auditfix | 185/185 → **185/185** | refuses to run outside Chicago, by design | same |
| reimagine | 292/6 → **292/6** | 296/2 → **296/2** | identical failure set (pre-existing) |
| c2browser | 21/25 → **21/25** | 21/25 → **21/25** | identical failure set (pre-existing) |
| c3browser | 66/4 → **66/4** | 66/4 → **66/4** | identical failure set (pre-existing) |

For every browser lane, the FAIL lines were diffed with numbers stripped: **zero new failure kinds**
in either timezone. reimagine, c2browser and c3browser were not in the last handoff's gate and fail
identically on the untouched tree. They are stale lanes that need their own re-aim, separate from
this pass.

† **Time-of-day quirks, seen during the session on both trees:**
- The baseline's Chicago layout run crashed at 01:50 local, waiting for a closed Log entry that
  doesn't exist yet that early in the carrier day.
- Separately, the timeline-gemini "nothing reaches past the track" pin failed 2× when an hour
  gridline landed on the track's right edge. I reran both trees back to back at 08:53/08:55 UTC and
  got **419/2 on both**, with the identical message, so it is a pre-existing flake and not this pass.

**Regressions found and fixed during the pass (honest record):**
1. polish (15) and quickfix (15) failed when I put the rockers on a navy track. Fixed by restoring
   the pinned carbon rocker (§5.2).
2. layout (e) failed 8 pins on the tab bar's literal colours. Fixed by the scoped `nav.tabs` rule
   (§5.3).

**Invariants:** `engine/` `diff -rq` clean; `web/src/store.ts` `cmp` clean; no test file edited.


---

## 7. Deliberately left alone

- **Status colours** (OFF grey / SB violet / D green / ON amber) and the lit-key flood. That is the
  ELD's language, gated for colour-vision separation, and the lit-key ink is pinned.
- **The driving view's structure.** One number, one stop time, a 112 px "I've stopped" key: already
  correct.
- **The 4-step "Can I take this load?" flow.** It is the best 3 AM pattern in the app.
- **Verdict banners and copy-to-dispatch Mono blocks.** Both are right as they are.
- **Typeface.** Atkinson Hyperlegible stays; legibility for tired eyes beats matching the wordmark's
  geometry.
- **Tool `<h1>` titles for Split and Trip, and Mono-for-prose in the newer tools.** Both are worth
  doing (AUDIT T1, A7). I scoped them out because they touch the most heavily pinned tool screens.
  They are the next pass.
- **Speed-streak motif.** Decoration on a driving screen is a distraction, so I didn't add it.
- **The read-aloud question interrupting the first status tap** (AUDIT N3). That is behaviour, not
  glass.

## 8. Suggested next pass (in order)

1. Lorico OKs the three pin re-aims (§5.1–§5.3). That finishes the navy field: status bar, splash,
   rockers and tab-bar ink.
2. Re-aim the index-based Plan pins to title-based ones, then group the rack by horizon (Right now /
   This load / This shift / This week, as in AUDIT P3) and put the tool names in one voice (A6).
3. Typography pass on the eight newer tools: Mono for figures only (A7). Add `<h1>`s to Split and Trip
   (T1).
4. Move the read-aloud question out of the undo window (N3).

---

## Addendum — navy finish (Lorico-approved pin re-aims)

**Date:** Nov 25, 2026. **Scope:** items 1–3 of §5 only. **Not deployed, not pushed.**
**Status:** re-aims **2 (rocker)** and **3 (tab-bar ink)** are done and gated. Re-aim **1
(background navy) is HELD.** Finishing it needs a one-literal edit to `web/src/store.ts`, which this
brief's hard lines forbid (details below). Nothing for item 1 was changed, so the tree is consistent.

### A. Re-aim 1: background navy (HELD, needs a store.ts OK)

The brief lists five places that hold `#090c10`. There is a sixth: the **runtime** theme setter.

- `web/src/store.ts:2202` (`applyTheme`):
  `meta.setAttribute('content', t === 'day' ? '#e4e9ee' : '#090c10')`.
  Every theme toggle and every app mount rewrites the browser status-bar colour from this literal.
- `web/test/smoke.mjs:540–548` pins it to the stylesheet: it reads the night `--bg` from `:root {` in
  styles.css and requires `applyTheme('night')` to write exactly that value.

So changing `--bg` to `#06112e` without touching store.ts **fails smoke** ("night must set the dark
chrome colour #06112e, got #090c10"). Skipping that pin would also not finish the job: the static
shell would boot navy, and then the app would flip the status bar back to near-black on mount. The
brief says "store.ts untouched", and its only allowed exception is app.tsx. I didn't cross that line.

**The complete change, ready to apply once Lorico OKs the store.ts literal (all presentation, no
logic):**

| File:line | Before | After |
|---|---|---|
| `web/public/styles.css:32` (`:root`) | `--bg: #090c10` | `--bg: #06112e` |
| `web/public/styles.css:1960` (`@property --bg` initial) | `#090c10` | `#06112e` |
| `web/public/styles.css:1974` (`@property --t-well` initial) | `#090c10` | `#06112e` (cross-fade start value only) |
| `web/public/styles.css:29` (comment) | "--bg stays #090c10 …" | updated |
| `web/public/index.html:6` (meta theme-color) | `#090c10` | `#06112e` |
| `web/public/index.html:43` (boot script) | `'#090c10'` | `'#06112e'` |
| `web/public/manifest.webmanifest:9–10` | `#090c10` ×2 | `#06112e` ×2 |
| **`web/src/store.ts:2202`** (`applyTheme`) | `'#090c10'` | `'#06112e'` (**needs the OK**) |
| `web/test/smoke.mjs:5463–5464, 5468, 5483–5485` (patch 16) | `#090c10` | `#06112e` |
| `web/test/dom/c3.mjs:604` (M14a manifest identity) | `'#090c10', '#090c10'` | `'#06112e', '#06112e'` |
| `web/test/contrast.mjs` | — | **no edit needed:** it already compares the meta and the manifest against the parsed night `--bg` (lines 126–138) |

### B. Re-aim 2: rocker navy (DONE)

| File:line | Before | After |
|---|---|---|
| `web/test/dom/polish.mjs:44–50` (new) | — | Token reader: parses `:root {` and `:root[data-theme="day"]` from the shipped `dist/styles.css`, using the same block-scan as contrast.mjs's `vars()`. Exposes `NIGHT`, `DAY` and `tokRgb()`. |
| `web/test/dom/polish.mjs:147` (was 141) | night key `=== 'rgb(25, 33, 42)'`, track `=== 'rgb(9, 12, 16)'` | key `=== tokRgb(NIGHT['--panel2'])`, track `=== tokRgb(NIGHT['--screen'])`, which is the well that `--t-well` resolves to at night |
| `web/test/dom/quickfix.mjs:41–47` (new) + `:97` (was 91) | the same carbon literal pin | the same token pin. **Not named in the brief, but forced:** quickfix carries a duplicate of the polish:141 assertion (§5.2 recorded that it also failed 15 pins). Leaving it would have made removing the workaround impossible. |
| `web/public/styles.css` (was 2708–2712, CLOCK 14 block) | the comment, then `.toggle { background-color: var(--bg); }` and `:root:not([data-theme="day"]) .toggle button.on { background-color: #19212a; }` | **deleted** |

Result: the night rocker is navy, key `#11244d` (`--panel2`) on track `#06122f` (`--screen` well),
confirmed by the passing pin. The day rocker now sits on the theme's own well, `#d5deeb` instead of
`--bg #e4e9ee`, and still clears the ≥1.2:1 key contrast pin in polish and quickfix.

### C. Re-aim 3: tab-bar ink (DONE)

| File:line | Before | After |
|---|---|---|
| `web/test/dom/layout.mjs:83–89` (new) | — | the same token reader |
| `web/test/dom/layout.mjs:638–641` (was 632–634) | `wantText` day `rgb(11, 17, 23)` / night `rgb(243, 238, 228)`; `wantMuted` `rgb(69, 82, 95)` / `rgb(170, 167, 157)`; `wantAccent` `rgb(11, 95, 168)` / `rgb(124, 200, 255)` | `wantText = tokRgb(T['--text'])`, `wantMuted = tokRgb(T['--muted'])`, `wantAccent = tokRgb(T['--ring'])`, with `T` = the active theme's tokens. Line ~766 (inactive Now = `wantMuted`) picks this up unchanged. |
| `web/public/styles.css` (was 2790–2796, end of file) | the comment, then `nav.tabs { --text: #f3eee4; --muted: #aaa79d; --accent: #7cc8ff; --ring: #7cc8ff; --glow: … }` and the day twin (`#0b1117 / #45525f / #0b5fa8`) | **deleted** |

Result: the bar uses the app palette. Night: text `#eef5fd`, muted `#a3b6d4`, icon and lamp in bezel
`#5ccbea`. Day: `#071331` / `#3c4d6e` / `#0b56c0`.

### D. Hard lines

- `engine/`: `diff -rq` against the pristine copy is clean.
- `web/src/store.ts`: sha256 `21bc674d…51db7f`, unchanged. `web/src/app.tsx`: sha256 `a4c71c41…fcbbb`,
  unchanged (no token change forced it).
- No new `<input type="time">`; no localStorage changes; no behaviour changes. The only files changed
  are `styles.css` (two deletions) and the three test lanes above.

### E. Lane results

Run sequentially in the foreground. Recipe: `HOS_BROWSER=/usr/bin/chromium`,
`HOS_PLAYWRIGHT=~/.hermes/hermes-agent/`. Logs are in `~/hos-build/opusdesign-scratch/navy/`. The
comparison column is the §6 final gate (`gate-final/`). "Same fail set" means the FAIL lines were
diffed with numbers stripped and came out identical.

| Lane | America/Chicago | UTC | vs §6 final |
|---|---|---|---|
| build + `npm run smoke` (typecheck, contrast, nightlight, ocr-bundle, smoke, all 16 dom lanes incl. c3/M14a) | exit 0 | exit 0 | same |
| contrast | 44/44 day, 44/44 night | 44/44, 44/44 | same |
| c3 (dom, inside smoke) | C3 OK, C3 RELAUNCH OK | same | same |
| polish | **295/295** | **295/295** | same count, night pin now on tokens |
| quickfix | **20/20** | **20/20** | same count, night pin now on tokens |
| layout | **421/421** | **421/421** | same count, (e) ink pins now on tokens |
| gemini (bundled) | 20/20 | 20/20 | same |
| revisions (bundled; run because it reads `public/styles.css`) | 89/89 | 88/89 | same: the known W2 UTC baseline failure |
| lebrowser | 84/84 | 84/84 | same |
| auditfix | 185/185 | refuses outside Chicago, by design | same |
| c3browser | 66 / 4 fail | 66 / 4 fail | same fail set (pre-existing) |
| c2browser | 21 / 25 fail | 21 / 25 fail | same fail set (pre-existing) |
| reimagine | 292 / 6 fail | 296 / 2 fail | same fail set (pre-existing) |

Every lane that was green in §6 is still green. No new failure kinds in either timezone. engine
`npm test` was not rerun because `engine/` is byte-identical.

**Next step for Lorico:** OK the one-literal `store.ts:2202` change, then apply table A as a single
commit and rerun smoke (both TZs) and c3. That completes the navy field (status bar and splash).
