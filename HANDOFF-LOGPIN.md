# HANDOFF-LOGPIN — Pinned Log Graph & Add Button, Now-Only Header Disclaimer, Log Bug Button Removal

**Workspace:** `/home/hatch/workspace/hos-patch/work-logpin` (copied from verified `work-nowplain` with `HANDOFF-NOWPLAIN.md` present).
**Date:** 2026-11-20
**Status:** Verified green across all lanes; **not deployed**.

---

## 1. Summary of Changes (Presentation / Layout Only)

Implemented Lorico's four 2026-11-20 (voice) presentation changes while preserving the `nowplain` nav state (`Plan — Now — Log — More`, equal `1fr` tabs, plain Now tab without `.tab-now` plate, Now-only status dock):

1. **Pinned Log top block (day navigation + graph card):** On the Log screen only, `<TimeHead kind="past" />`, `.daynav` (day title + Previous/Next day buttons), and `.log-graph-card` (`<Grid>` duty-status chart + `.daytotals`) sit in a fixed, non-scrolling `.log-pin` header band at the top of `section.page-log`. Only `.log-scroll` below it scrolls vertically. Day navigation updates both the pinned graph/daynav and the scrolled entry list together (and resets `.log-scroll` to top when switching days).
2. **Now-only planning disclaimer header line:** `TopBar` renders `<HeaderDisclaimer s={s} />` ("Planning only — not a log, not an ELD" + `Details` toggle) only when `onNow` is true (`s.tab === 'now'`). On Log, Plan (including sub-screens), and More it is omitted entirely, so `header.top` shrinks cleanly with no empty strip or gap. The Details panel (full disclaimer text + first-run home-terminal timezone picker when `!s.tzChosen`) is unchanged and remains reachable on Now (where the app opens).
3. **Removed duplicate bug button from Log:** Removed `<BugButton s={s} ev={ev} />` from the bottom of `LogTab`. Kept `BugButton`, `reportBug`, and the More screen's "Bug reports" card (`SettingsTab`) unchanged.
4. **Pinned bottom "Add a break or something I forgot" button:** Moved `<button class="addbtn">` into a fixed `.log-foot` band at the bottom of `section.page-log`, directly above `nav.tabs`. The scrolling log list sits cleanly between `.log-pin` and `.log-foot` with zero overlap, bottom padding so the last entry scrolls fully into view above the button, and full tappability at both `412x915` and `360x640`.

### Exact Files and Lines Changed

- **`web/src/app.tsx`**
  - Lines 1054–1055 (`TopBar`): gated `<HeaderDisclaimer s={s} />` behind `onNow` (`{onNow && <HeaderDisclaimer s={s} />}`).
  - Lines 3211–3214 (`LogTab`): accepted optional `notices?: ComponentChildren` prop and added `scrollRef` with `useEffect(() => { scrollRef.current?.scrollTo?.(0, 0); }, [back])`.
  - Lines 3266–3355 (`LogTab`): split render into three sibling flex regions inside `section.page-log`:
    - `<div class="log-pin">`: `<TimeHead kind="past" />`, `.daynav`, and `<section class="card log-graph-card">` (`<Grid>` + `.daytotals`).
    - `<div class="log-scroll" ref={scrollRef}>`: `{notices}`, overlaps warning, undo row, Entries `<Card>`, Violations `<Card>`, and tentative violations `<Card>`.
    - `<div class="log-foot">`: `<button class="addbtn">Add a break or something I forgot</button>`.
    - Removed `<BugButton s={s} ev={ev} />` from `LogTab` (kept in `SettingsTab` line 5535).
  - Lines 6061–6067 (`App`): passed `{warnbox}{themeNoticeCard}<Notices ev={ev} now={now} s={s} />` into `<LogTab notices={...} />` so notices scroll inside `.log-scroll` rather than pushing the pinned graph down or starving `.log-scroll` on short screens (`360x640`).
- **`web/public/styles.css`**
  - Lines 1195–1259 (`LOGPIN ROUND` append-only block): styled `.page.page-log` as a non-scrolling vertical flex container (`overflow-y: hidden; padding: 0 0 calc(61px + env(safe-area-inset-bottom)); gap: 0;`), `.log-pin` (`flex: 0 0 auto; background: var(--bg); border-bottom: 1px solid var(--line);`), `.log-scroll` (`flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior-x: auto; overscroll-behavior-y: none;`), `.log-foot` (`flex: 0 0 auto; background: var(--bg); border-top: 1px solid var(--line);`), plus compact responsive spacing at `@media (max-width: 380px)` (keeps `.addbtn` single-line at `56px` height) and `@media (max-height: 700px)` (ensures comfortable scrollport room on `360x640` with the first log entry cleanly visible).
- **`web/test/smoke.mjs`**
  - Lines 601–602: re-aimed `tab: 'log'` check (with justification comment) to assert the planning-only header line is absent on Log.
  - Lines 1283–1284: re-aimed `launch notice back` check (with justification comment) to return to `tab: 'now'` (where every fresh launch opens) before checking the header disclaimer.
  - Lines 6283–6298: added pins proving the header disclaimer is absent on `log`/`plan`/`split`/`settings`, `.log-pin` / `.log-scroll` / `.log-foot` structure on `page-log`, and `Report a bug (GitHub)` absent on `page-log` while preserved in `page-settings`'s "Bug reports" card.
- **`web/test/dom/revisions.mjs`**
  - Lines 571–635: added pins `L1` (Now-only header disclaimer + first-run timezone picker on Now), `L2` (Log has no bug button; More keeps Bug reports card), and `L3` (Log 3-region structure + Previous/Next day updating both pinned graph/totals and entry list).
- **`web/test/dom/layout.mjs`**
  - Lines 138–185 (Section `(b)`) and 226–245 (Section `(c)`): re-aimed vertical scroller probes (each with a one-line justification comment) so on `Log` the active vertical scroller is `.page-log > .log-scroll` (with `.page-log` itself `overflow-y: hidden` and `scrollTop === 0`), while `Now`, `Split`, and `More` remain unchanged on `.page`; updated `spot()` bounds to respect `.log-pin` and `.log-foot`.
  - Lines 714–915 (Section `(f)`): added full real-browser pins at both `412x915` and `360x640` with a 13-entry multi-day log proving:
    - Header disclaimer ("Planning only — not a log, not an ELD" + "Details") present on Now and absent on Plan/More/Log with zero leftover gap or overlap (`pgTop === hdrBottom`).
    - Log screen has no "Report a bug (GitHub)" button while More keeps it.
    - Scrolling `.log-scroll` to the bottom leaves `.log-pin` (`.daynav`, `.log-graph-card`, `svg.grid`, `.daytotals`) at the exact same bounding box, fully inside the viewport, with unclipped axis labels and clean top boundary above the first log entry.
    - `.log-foot` (`button.addbtn`) sits flush above `nav.tabs`, never moves on scroll, stays tappable (`elementFromPoint`), and opens the add sheet (`Step 1 of 4`) on click; the last log entry and end of list scroll fully into view above it.
    - Previous/Next day updates both pinned daynav/totals and the scrolled entry list together.

---

## 2. How the Pinned and Scroll Regions Are Structured

Inside `<main class="pages">` (flex row, `flex: 1; min-height: 0;`, running from `header.top`'s bottom edge to the viewport bottom behind the fixed `61px` `nav.tabs`), `section.page.page-log` uses a three-band vertical flexbox column:

```
section.page.page-log  (display: flex; flex-direction: column; overflow-y: hidden;
                        padding: 0 0 calc(61px + env(safe-area-inset-bottom)); gap: 0)
  ├── div.log-pin      (flex: 0 0 auto; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line))
  │     ├── p.timehead.timehead-past
  │     ├── div.daynav               (Previous day | Today, date + carrier day | Next day)
  │     └── section.card.log-graph-card  (<Grid /> SVG + div.daytotals)
  ├── div.log-scroll   (flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden;
  │                     overscroll-behavior-x: auto; overscroll-behavior-y: none; z-index: 1)
  │     ├── {notices}                (warnbox, themeNoticeCard, <Notices />)
  │     ├── overlaps / undo (when present)
  │     ├── Entries <Card>
  │     └── Violations <Card>(s)
  └── div.log-foot     (flex: 0 0 auto; z-index: 2; background: var(--bg); border-top: 1px solid var(--line))
        └── button.addbtn            ("Add a break or something I forgot")
```

- **Zero overlap / clean boundaries:** Because `.log-pin`, `.log-scroll`, and `.log-foot` are sibling flex items in a non-scrolling `.page-log`, `.log-scroll`'s clip box begins at `.log-pin`'s bottom border and ends at `.log-foot`'s top border. Entries can never slide behind the graph or under the bottom add button.
- **Swipe + scroll gesture disambiguation:** `.log-scroll` inherits the same `overscroll-behavior-x: auto; overscroll-behavior-y: none;` rule used by `.page`, so horizontal swipes starting on log entries chain seamlessly up to `<main class="pages">` while vertical drags scroll only `.log-scroll` without triggering pull-to-refresh or moving the shell.
- **Scope:** Only `.page.page-log` is restructured; `Now`, `Plan`, and `More` keep their exact `.page` vertical scrolling behavior.

---

## 3. Verification Results (Run One Lane at a Time)

| Lane | Command | Result |
| --- | --- | --- |
| Typecheck + Build | `cd web && npm run typecheck && npm run build` | **PASS** (exit 0; `dist/app.js` 266.7kb) |
| Full Smoke Gate (UTC) | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0; `contrast` 44/44 day + 44/44 night, `nightlight`, `ocr-bundle`, `smoke.mjs`, and all 8 `npm run dom` lanes: `yesback`, `c1flush`, `adjuststart`, `scrub`, `c3`, `c3relaunch`, `logedit` 37/37, `cascade` 16/16) |
| Auditfix (Chicago) | `cd web && TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** (139/139, exit 0) |
| Polish (Chicago) | `cd web && TZ=America/Chicago node test/dom/polish.mjs` | **PASS** (263/263, exit 0) |
| Layout (Chicago) | `cd web && TZ=America/Chicago node test/dom/layout.mjs` | **PASS** (342/342, exit 0) |
| Revisions (Chicago) | `cd web && TZ=America/Chicago npx esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (37/37, exit 0) |
| Gemini (Chicago) | `cd web && TZ=America/Chicago npx esbuild test/dom/gemini.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-gemini.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (20/20, exit 0) |

---

## 4. Guardrail & Hash Confirmation

- `git hash-object web/src/store.ts`: **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (exact match, unchanged).
- `engine/`: **zero changes** (`diff -rq ../work-nowplain/engine engine` returned empty / identical across all 24 files).
- `nowplain` nav state preserved: `Plan — Now — Log — More`, four equal `1fr` tabs, plain Now button (no `.tab-now` plate), Now-only status dock — all verified in `revisions` and `layout`.

---

## 5. Changed Files vs. the `work-nowplain` Tree

### Source & Test Files Edited
- `web/src/app.tsx`
- `web/public/styles.css`
- `web/test/smoke.mjs`
- `web/test/dom/revisions.mjs`
- `web/test/dom/layout.mjs`

### Handoff Added
- `HANDOFF-LOGPIN.md`

### Rebuilt Build & Test Outputs (regenerated by `npm run build` / `npm run smoke` / esbuild)
- `web/dist/` (`app.js`, `app.js.map`, `styles.css`, `sw.js`)
- `web/dist-test/` (`smoke.mjs`, `dom-adjuststart.mjs`, `dom-c1flush.mjs`, `dom-c3.mjs`, `dom-cascade.mjs`, `dom-gemini.mjs`, `dom-logedit.mjs`, `dom-revisions.mjs`, `dom-scrub.mjs`, `dom-yesback.mjs`)

---

## 6. Ada Verification Addendum (2026-11-21)

Ada independently re-ran the full gate against this tree: typecheck PASS, build PASS, TZ=UTC smoke gate PASS (incl. the log summary PDF pins), auditfix 139/139, polish 263/263, layout 354/354, revisions 40/40, gemini PASS; `store.ts` hash unchanged (`1323046d…`), `engine/` identical to `work-nowplain`. Two test-side defects were found and fixed by Ada (test files only, no app changes): (1) the PDF totals expectations in revisions P2 and layout (g) used sentence-case 'On duty'/'Off duty' while the app renders `STATUS_LABEL` ('On Duty'/'Off Duty') — the same labels as the Log screen's own daytotals — so the expectations were re-aimed; (2) layout fixtures anchored to wall-clock now broke just after midnight (seed segments straddling midnight left the displayed carrier day nearly empty) — `longLogSeed` now anchors via `nowOverride` at 20:00 on the displayed carrier day, and the (c) vertical-drag check steps back a day when the current day's list cannot overflow. A one-off probe confirmed a real touch drag scrolls `.log-scroll` (scrollTop 0 → 327) before the fixture fix, ruling out an app defect. Deploy approved by Lorico (voice) 2026-11-21.
