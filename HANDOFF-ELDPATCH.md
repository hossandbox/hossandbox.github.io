# Handoff — Clock 14 `eldpatch` (`work-eldpatch`)

**Tree:** `~/hos-build/work-eldpatch` (copied from `work-receptionfix2`)  
**Scope:** Three owner-decided patch items: (1) remove the Now ELD staleness chip while keeping all underlying drift/CTA behavior, (2) offline pick-your-ELD help flow inside both Refresh from ELD screenshot entry points sourced from `~/hos-build/RESEARCH-ELD-GUIDES.md`, and (3) extended Settings → "Email a bug report" mailto diagnostics snapshot with a hard privacy fence, ~1800-char size guard fallback, and disclosure line.  
**Status:** Built (`dist/app.js` 709.2 KB / 726,220 B), engine hash verified byte-identical, **all suites 100% green** sequentially in the foreground (zero flakes, including `layout` 421/421 in `America/Chicago`). **Not deployed, not pushed.**

---

## 1. Hard Invariants Verified

- **`engine/` byte-identical:**
  ```
  find engine -type f -not -path '*/node_modules*' -not -path '*/dist*' | sort | xargs sha256sum | sha256sum
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d  -
  ```
  Matches `0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d` exactly.
- **localStorage keys unchanged:** Only `hos-sandbox-v1`, `hos-sandbox-v1-backup`, `hos-sandbox-v1-sim`, and `hos-sandbox-undo-v1` are read or written.
- **Zero new persisted fields:** Persisted schema untouched; ELD picker choice is strictly session-only React state (`useState`), opening fresh every time.
- **Legal disclaimer text untouched:** `CLOCK14_DISCLAIMER_TEXT` unchanged.
- **Shared `ClockPick` untouched:** No new time-entry controls added.
- **Files touched (5 files — 3 modified, 2 added):**
  - Modified: `web/src/app.tsx`, `web/public/styles.css`, `web/test/dom/drivers.mjs`
  - Added: `web/src/eldguides.ts`, `web/src/eldguides-ui.tsx`

---

## 2. Per-Item Summary (`file:line` anchors)

### Item 1 — Remove the ELD staleness chip from Now
- **Removed Now chip rendering (`web/src/app.tsx:2781`):** Deleted the `<button class="eld-stale-chip ..." data-eld-staleness={stale.kind}>` block above `"Refresh from ELD screenshot"` on `NowTab` across all states (`never`, `fresh`, `stale`).
- **Removed dead code & CSS:**
  - Removed unused `ELD_STALE_MINUTES` and `eldStalenessInfo(...)` (including the receptionfix2 `N4` `"Nd ago"` duration formatter) from `web/src/app.tsx` (previously lines 416–432).
  - Removed unused `.eld-stale-chip`, `.eld-stale-chip span`, `.eld-stale-chip.is-never`, `.eld-stale-chip.is-stale`, and `.eld-stale-chip.is-fresh` rules from `web/public/styles.css` (previously lines 3476–3506).
- **Kept everything underneath intact:**
  - `lastEldCheckAt` stamping remains intact in `applyEldSeed` (`web/src/store.ts:2685`), `DriftSheet` compare (`web/src/app.tsx:3426`), `addDriftFill` (`web/src/app.tsx:3998`), `applyImportedState` clearing (`web/src/store.ts:2097`), `eraseAll`, `SimSnap`, and `parseSaved`.
  - `"Refresh from ELD screenshot"` CTA (`web/src/app.tsx:2784-2799`, `data-eld-screenshot-btn="1"`) retains its full B1 routing (fresh log → `QuickStartSheet` screenshot mode; populated log → `DriftSheet` screenshot mode; OCR failure → `DriftSheet` manual entry), and `"Check against my ELD"` inside the `Shift actions` card remains intact.

### Item 2 — Pick-your-ELD help flow inside Refresh
- **Offline data module (`web/src/eldguides.ts:1-656`):** Separate from app logic, zero runtime external links (no URLs shipped in the bundle), zero stitching claims (every day-switching note specifies one day at a time).
  - **Content stats:**
    - **36 total picker entries:** **31 documented ELDs** (`kind: 'documented'`, ordered by US interstate prevalence from `RESEARCH-ELD-GUIDES.md`) + **4 FMCSA-registered undocumented ELDs** (`kind: 'undocumented'`: `ELD Mandate`, `Lytx`, `Netradyne`, `Anytrek` — clearly labeled `"Generic steps"` with the generic 3-step pattern, zero invented menu steps) + **1 final `"Don't see your ELD?"`** (`kind: 'generic'`) entry with the generic 3-step pattern.
    - **9 split-screen ELDs flagged (`splitScreen: true`):** Samsara, Geotab GO / Geotab Drive, Platform Science, J.J. Keller Encompass, Verizon Connect Reveal, Garmin eLog, BigRoad DashLink, EROAD, Pedigree Technologies OneView. Steps land on the **clocks screen** and `whichScreen` explains in one plain line why (Clock 14 reads the four labeled countdown clocks, not graph grid lines).
    - **7 dash-mounted / no-phone-graph entries flagged (`noPhoneGraph: true`):** Platform Science (`PS HOS` tablet), Omnitracs (`IVG`), Trimble (`PeopleNet`), Zonar (`Zonar Connect`), ISAAC Instruments (`ISAAC InControl`), EROAD (`Ehubo2` without companion app), Pedigree (`POV` without OneView Mobile). Each renders an honest 1–2 line notice pointing to the companion app, straight-on photo of the cab screen, or manual clock entry.
    - **Discontinued search handling:** Searching `Stoneridge`, `EZ-ELD`, `VDO`, or `RoadLog` shows a quiet 1-line notice (`DISCONTINUED_NOTE`) pointing to manual clock entry without cluttering the main list.
  - **Bundle size impact:**
    - `web/src/eldguides.ts` raw source: **31,220 B** (656 lines); minified ESM: **25,179 B** (~24.6 KB).
    - `web/src/eldguides-ui.tsx` raw source: **4,254 B** (119 lines); combined `eldguides.ts` + `eldguides-ui.tsx` minified ESM: **27,843 B** (~27.2 KB).
    - Total built `web/dist/app.js`: **726,220 B (709.2 KB)** vs `work-receptionfix2` baseline `679.9 KB` (**+29.3 KB** total across Items 1–3).
- **Session-only picker & detail UI (`web/src/eldguides-ui.tsx:1-119`, CSS `web/public/styles.css:3479-3553`):**
  - Renders searchable, scrollable picker list (`data-eld-guide-picker="1"`, `data-eld-guide-list="1"`) and per-ELD detail view (`data-eld-guide-detail={id}`) with `← All ELDs` and `Back to screenshot` buttons.
  - Pure local `useState` inside the component — unmounts on close, opens fresh every time, never touches `localStorage`.
- **Wired into both Refresh entry points (`web/src/app.tsx`):**
  - `QuickStartSheet` (`web/src/app.tsx:3093,3181-3187,3281`): `"Need help finding your log screen?"` (`data-eld-help-btn="1"`) inside `data-eld-ocr-section="1"`; swaps sheet view to `<Sheet title="Find your ELD screen" onBack={() => setEldHelp(false)}><EldGuideFlow ... /></Sheet>` while preserving form state on return.
  - `DriftSheet` screenshot mode (`web/src/app.tsx:3353,3356-3362,3523`): identical `"Need help finding your log screen?"` (`data-eld-help-btn="1"`) inside `data-eld-ocr-section="1"` (`isShotMode`), returning straight to `DriftSheet` with boxes preserved.

### Item 3 — Bug report with diagnostics snapshot
- **Helpers (`web/src/app.tsx:388-502`):**
  - `BUG_REPORT_MAILTO_MAX = 1800`, `BUG_REPORT_EXPORT_LINE = 'Full log copy: Settings → Data → Export — please attach it to this email.'`.
  - `detectPlatformClass(nav?, win?)` (`web/src/app.tsx:394-407`): classifies `iOS` / `Android` / `desktop` + `(standalone)` vs `(browser tab)`.
  - `buildDiagnosticsSnapshot(s, now)` (`web/src/app.tsx:415-462`): constructs a fresh, strictly allowlisted object solely from active-driver HOS/log fields (never spreads `State` or reads storage/vault).
  - `bugReportMailtoHref(s, ev, now?, opts?)` (`web/src/app.tsx:469-502`): builds the `mailto:` URL carrying header lines + compact `State: {...}` JSON; if the encoded URL exceeds `1800` characters, falls back to a compact `Summary:` line (segment count, tentative count, current status/since, cycle basis, timeZone, dayStart, historyBasis, seededAt, lastEldCheckAt, now/nowOverride) + `BUG_REPORT_EXPORT_LINE`.
- **Settings UI & tap-time snapshot (`web/src/app.tsx:12428-12440`):**
  - `<a class="btn primary wide bug-email-btn" data-bug-email="1">` renders with `href={bugReportMailtoHref(s, ev, now)}` AND refreshes `e.currentTarget.href` synchronously in `onClick` using fresh `getState()`, `tapNow`, and `evaluate(...)` right before the driver's mail app opens.
  - Disclosure line directly below (`data-bug-email-disclosure="1"`): `"Sends your clock log and app state so we can diagnose the problem. No PIN, no account info."`

#### Item 3 Explicit Field Allowlist (Hard Privacy Fence)
**Header lines (plain text):**
- `Build` (`__BUILD__`)
- `Date` (ISO-8601 timestamp at tap time)
- `Screen` (`s.tab`)
- `Theme` (`effectiveTheme(s, devicePrefersDark())` — `day` | `night` | `winddown`)
- `Platform` (`detectPlatformClass()` — `iOS` / `Android` / `desktop` + `standalone` / `browser tab`)
- `Clocks` (existing 4-clock summary: `Status | Drive | Window | Break | Cycle`)

**Compact JSON `State:` object (strict allowlist):**
- `v` (`1`)
- `now` (evaluation epoch minute)
- `nowOverride` (`number | null`)
- `historyBasis` (`'fresh' | 'seeded' | 'logged' | 'acknowledged'`)
- `historyAcknowledged` (`boolean`)
- `seededAt` (`number | null`)
- `lastEldCheckAt` (`number | null`)
- `tzChosen` (`boolean`)
- `deviceTz` (IANA browser timezone string)
- `config`: `{ cycle, shortHaul, timeZone, dayStartHour, dayStartMinute, adverseShifts, sixteenHourShifts }`
- `current`: `null` or `{ status, since, note?, createdAt? }`
- `segments`: array of `{ status, start, end, note?, tentative?, createdAt? }`
- `tentative`: array of `{ status, start, end, note?, createdAt? }`
- `dayCloses`: array of `{ dayStart, at }`

**Explicitly excluded (never read or serialized):** `__drivers` vault, `profiles`, driver IDs, driver names (`driverName` / `getActiveDriverName()`), PINs, PIN hashes (`pin.hash`), PIN salts (`pin.salt`), recovery questions/answers/hashes/salts, `stayUnlocked`, other drivers' states, `undoRaw`, `simRaw`.

---

## 3. Updated & New Pins (`web/test/dom/drivers.mjs` — `19/19`, was `17/17`)

- **Updated `DR13` (`web/test/dom/drivers.mjs:842-907`):**
  - Replaced staleness chip visibility assertions with chip-ABSENT assertions (`data-eld-staleness` count === 0) across fresh, freshly-seeded, +6h, +1d, and +13d states, plus asserts `A.eldStalenessInfo === undefined`.
  - Kept `applyEldSeed` `lastEldCheckAt === T` assertion, fresh CTA → `QuickStartSheet`, active/populated CTA → `DriftSheet` screenshot mode end-to-end verification, and Plan `MilesTab` inline clock override verification.
- **Updated `DR14` (`web/test/dom/drivers.mjs:910-1015`):**
  - Updated the post-import N3 assertion (`drivers.mjs:1012-1014`) from checking `data-eld-staleness="never"` to asserting `data-eld-staleness` is ABSENT while keeping `impPatch.lastEldCheckAt === null`.
  - All existing bug-email assertions (`Email a bug report`, `mailto:lorico.estrellado@gmail.com?`, `subject=Clock%2014%20bug%20report`, `Build:`, `Theme:`, `Clocks:`) remain intact and pass unchanged.
- **Unchanged `DR15` (`web/test/dom/drivers.mjs:1018-1150`):** Continues to verify full B1 populated-log Now CTA → `DriftSheet` screenshot mode → OCR prefill → Compare → `lastEldCheckAt` stamped + log byte-unchanged + OCR failure → DriftSheet manual entry.
- **New `DR18` (`web/test/dom/drivers.mjs:1274-1425`) — Item 2:**
  - Verifies `"Need help finding your log screen?"` (`data-eld-help-btn="1"`) opens the ELD picker in **both** `QuickStartSheet` screenshot mode (fresh) and `DriftSheet` screenshot mode (populated).
  - Verifies exact counts: 31 `documented` + 4 `undocumented` (`anytrek,eld-mandate,lytx,netradyne`, all labeled `"Generic steps"`) + 1 `generic` (`"Don't see your ELD?"`) = 36 entries, with zero external `http(s)` links and zero persisted ELD choice in `localStorage`.
  - Verifies split-screen per-ELD pages (**Samsara** and **Geotab**) land on the clocks screen with plain clocks-vs-grid explanation and `"one day at a time"` (no `"stitch"` claims).
  - Verifies dash-mounted no-phone-graph page (**ISAAC Instruments**) shows the honest `"no phone screenshot"` notice (`data-eld-no-phone-graph="1"`).
  - Verifies undocumented (**Lytx**) and generic (`"Don't see your ELD?"`) pages render the 3-step generic pattern, and searching `"Stoneridge"` renders the quiet discontinued notice (`data-eld-discontinued="1"`).
- **New `DR19` (`web/test/dom/drivers.mjs:1427-1531`) — Item 3:**
  - Extracts **live vault secrets** (`__drivers.profiles`: every driver's `id`, `name`, `pin.salt`, `pin.hash`, and every `recovery[].salt` / `recovery[].hash`, plus PINs `1357`/`2468` and structural keys `__drivers`, `profiles`, `pinHash`, `recovery`, `sha256-2048`, `stayUnlocked`) from `localStorage`.
  - On a small active log: verifies verbatim disclosure line, triggers tap-time `click` refresh on `<a data-bug-email="1">`, asserts encoded URL `<= 1800` chars, parses `State: {...}` JSON and verifies all diagnostic fields (`segments`, `tentative`, `current`, `config.cycle`, `seededAt`, `lastEldCheckAt`, `historyBasis`), and asserts **zero** forbidden markers appear in raw or decoded `href`.
  - On a 45-segment synthetic log: verifies size-guard fallback keeps encoded URL `<= 1800` chars, omits raw `State: {`, includes `Summary: segments=45` and verbatim `"Full log copy: Settings → Data → Export — please attach it to this email."`, and leaks zero forbidden markers.
  - Verifies `detectPlatformClass` across iOS/Android/desktop × standalone/browser tab.

---

## 4. Test Suite Results (All Sequential, Foreground)

| # | Suite | Command | Result / Pin Counts |
|---:|---|---|---|
| 1 | **build** | `npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 709.2 KB) |
| 2 | **smoke (America/Chicago)** | `TZ=America/Chicago npm run smoke` | **PASS** — `typecheck` OK, `contrast` 44/44×3, `nightlight` OK, `ocr-bundle` OK, `smoke.mjs` PASS, and all 18 DOM suites PASS (`yesback`, `c1flush`, `adjuststart`, `scrub`, `c3`, `c3relaunch`, `logedit`, `cascade`, `rescue` 11/11, `stack` 15/15, `motel` 13/13, `legal` 15/15, `flip` 12/12, `miles` 11/11, `carrierday` 9/9, **`myweek` 20/20**, **`drivers` 19/19**, **`drivers-relaunch` 14/14**) |
| 3 | **smoke (UTC)** | `TZ=UTC npm run smoke` | **PASS** — full pass across all sub-suites (`myweek` 20/20, `drivers` 19/19, `drivers-relaunch` 14/14) |
| 4 | **revisions** | `./node_modules/.bin/esbuild test/dom/revisions.mjs ... && node dist-test/dom-revisions.mjs` | **89 / 89 PASS** |
| 5 | **gemini** | `./node_modules/.bin/esbuild test/dom/gemini.mjs ... && node dist-test/dom-gemini.mjs` | **20 / 20 PASS** |
| 6 | **auditfix** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium node test/dom/auditfix.mjs` | **200 pass, 0 fail** (`AUDITFIX OK`) |
| 7 | **polish** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run polish` | **295 pass, 0 fail** (`POLISH OK`) |
| 8 | **layout** | `TZ=America/Chicago HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/ HOS_BROWSER=/usr/bin/chromium npm run layout` | **421 pass, 0 fail** (`LAYOUT OK`, zero flakes) |

---

## 5. Judgment Calls Flagged for Opus

1. **ELD guide UI rendered as an in-sheet view inside `QuickStartSheet` and `DriftSheet` (`web/src/app.tsx:3181-3187,3356-3362`):** Kept the help picker as local `useState(false)` view state inside both sheets (using `<Sheet onBack={() => setEldHelp(false)}>`) rather than adding a new `SheetKind`. This preserves typed boxes and sheet mode when returning to screenshot import, guarantees zero persistence (state dies when sheet closes), avoids altering `MorphSheetKind`/`ES1–ES3` motion pins, and keeps `QuickStartSheet..DriftSheet..StatusSheet` source-slice invariants in `smoke.mjs` untouched.
2. **Help affordance also visible in `QuickStartSheet` non-screenshot mode (`web/src/app.tsx:3281`):** Placed `"Need help finding your log screen?"` inside `<div class="qs-section" data-eld-ocr-section="1">` so any driver tapping `"Start from my ELD clocks"` (as well as `"Refresh from ELD screenshot"` on fresh or populated logs) has the guide right beneath the screenshot button. Order `Import → type heading → h/m boxes` and `data-first` focus remain intact (`A10` passes in both `smoke` and `auditfix`).
3. **Item 2 OCR-aligned split-screen wording (`web/src/eldguides.ts`):** Because `eldocr.ts` reads the four labeled countdown clocks rather than RODS graph pixels, all split-screen ELDs (Samsara, Geotab, Platform Science, J.J. Keller, Verizon Connect Reveal, Garmin eLog, BigRoad, EROAD, Pedigree) land drivers on the **clocks** screen in `steps`, state why in `whichScreen`, and still give the exact documented day-switching taps in `switchDay` (always `"one day at a time"`). None of the source URLs from `RESEARCH-ELD-GUIDES.md` are bundled, keeping the bundle smaller and guaranteeing zero external links.
4. **Item 3 `createdAt` included on segments/current in diagnostics JSON (`web/src/app.tsx:440-458`):** Kept optional `createdAt` on `current`, `segments`, and `tentative` when present so overlap resolution reproduces identically from a bug report; `createdAt` is a monotonic counter/timestamp with zero identity information.
5. **Item 3 render + tap-time `onClick` refresh (`web/src/app.tsx:12428-12439`):** Computing `href` on render AND refreshing `e.currentTarget.href` synchronously inside `onClick` ensures tap-time freshness (including wall-clock `Date` and latest `getState()`) while also keeping direct `href` inspection (accessibility / right-click / DOM tests) accurate.
6. **Item 3 `now` parameter default (`web/src/app.tsx:478`):** `bugReportMailtoHref(s, ev, now?, opts?)` keeps `now` optional (defaulting to `s.nowOverride ?? nowMin()`) so any existing 2-arg callers remain backward-compatible.
