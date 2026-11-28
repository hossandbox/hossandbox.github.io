VERDICT: SHIP

# Clock 14 — Independent review of `eldpatch` (`work-eldpatch` vs `work-receptionfix2`)

Reviewer: Opus (read-only). I made no changes to either tree. Every build, suite run and probe ran on rsync copies in `/tmp/rv/{new,base}`, with `node_modules` symlinked from the real trees. The probe scripts lived only in those copies.

## Blocking findings

None. No privacy or regression defect survived checking. All three items do what the handoff claims, and the engine is byte-identical.

---

## A. Change surface

`diff -rq` (ignoring node_modules, dist, test-results):

| File | Change | Item |
|---|---|---|
| `web/src/app.tsx` | modified (254-line unified diff) | 1, 2, 3 |
| `web/src/eldguides.ts` | added (656 lines) | 2 |
| `web/src/eldguides-ui.tsx` | added (119 lines) | 2 |
| `web/public/styles.css` | modified: `.eld-stale-chip*` removed, `.eld-help-link`/`.eld-guide-*` added. `.eld-shot-cta` only shows up as a diff hunk artefact; it is pre-existing and used at `app.tsx:2787` | 1, 2 |
| `web/test/dom/drivers.mjs` | DR13/DR14 updated, DR18/DR19 added | tests |
| `web/dist-test/*` | rebuilt test bundles (artefacts) | — |

- `package.json`, `public/sw.js` and the list of public files are all unchanged.
- No change falls outside the three items.
- The `app.tsx` diff touches only these places: the import, the bug-report helpers (`app.tsx:388-496`), removal of `eldStalenessInfo` and `ELD_STALE_MINUTES`, removal of the Now chip block, the `eldHelp` state, early return and help button in `QuickStartSheet` (`3093`, `3181-3187`, `3281`) and `DriftSheet` (`3353`, `3356-3362`, `3523`), and the Settings bug-report card (`12428-12440`).

## B. Engine and storage

```
work-eldpatch      engine aggregate: 0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d
work-receptionfix2 engine aggregate: 0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d
```

Both match the required hash.

- `store.ts` is unchanged, so storage keys and the persisted schema are unchanged.
- No new persisted fields. The ELD pick is `useState` inside `EldGuideFlow`. The component does not import the store and does not touch `localStorage`.

## C. Item 1: staleness chip

- **Removed from Now in every state.** The only render site was `NowTab` (baseline `app.tsx:2701-2716`) and it is gone. The baseline used `eldStalenessInfo`/`data-eld-staleness`/`.eld-stale-chip` nowhere else, so no other screen lost a staleness cue.
- **The drift entry points are still there:**
  - "Refresh from ELD screenshot" with B1 routing (`app.tsx:2781+`).
  - "Check against my ELD" in Shift actions (`app.tsx:2820`).
  - The More-tab pointer (`app.tsx:682`).
- **`lastEldCheckAt` is still stamped:**
  - `applyEldSeed` (`store.ts:2685`)
  - drift compare (`app.tsx:3427`)
  - `addDriftFill` (`app.tsx:4000`)
  - cleared on import (`store.ts:2097`) and on erase (`app.tsx:12536`)
  - carried in SimSnap (`app.tsx:1113`, `1146`, `1181`) and in the sim record (`store.ts:1445`)
- **The field still has a reader.** The bug-report snapshot now reads it (`buildDiagnosticsSnapshot`: `lastEldCheckAt`, plus the fallback `Summary:` line). So it is not a dead write, and the bookkeeping is coherent.
- **DR13 tests the new behaviour and is not vacuous.**
  - It asserts zero `[data-eld-staleness]` nodes on Now in these states: fresh/never-checked, freshly seeded, +6h, +1d, +13d. DR14 adds the post-import (never-checked) state.
  - It asserts `lastEldCheckAt === T` after the seed, and that the populated-log CTA opens DriftSheet in screenshot mode.
  - On the baseline it fails. To prove it fails on the chip itself and not only on its "helper must be gone" guard, I deleted that guard and re-ran it on the baseline. It failed on the chip text "…tap to check".

## D. Item 2: pick-your-ELD guides

### Offline behaviour and bundle cost

- The data and the strings are in the main `dist/app.js` (`grep -l "Samsara Driver App" dist/*.js` → `dist/app.js`). That file is in `sw.js` `ASSETS`, so it is precached.
- No URLs are in either module (`grep http src/eldguides*` returns nothing) and there are no fetches.
- Bundle cost:
  - `eldguides-ui.tsx` and `eldguides.ts` minified together: **27,843 B**. That matches the claimed +27.8 kB (27.2 KiB).
  - Full `dist/app.js`: **726,220 B (new) vs 696,218 B (base)**, +30,002 B across all three items.

### Reachability

DR18 covers both entry points, and I confirmed them in the code:

- **Fresh log:** Now → Refresh → `QuickStartSheet` (screenshot mode) → "Need help finding your log screen?" → picker.
- **Populated log:** Now → Refresh → `DriftSheet` (screenshot mode) → the same button → picker.

The help view is an early return inside each sheet that comes after all of that sheet's hooks. I checked that no hooks follow the return in either `QuickStartSheet` (2990–3343) or `DriftSheet` (3344+), so hook order is safe. Typed form state survives the round trip.

### Spot-checks against `RESEARCH-ELD-GUIDES.md`

I dumped all 36 entries from the compiled module and read them against the research. Faithful = matches the research; Nit = see N5/N6 below.

| Entry | Research | App | Verdict |
|---|---|---|---|
| **Samsara** (split) | 4 dials on **HoS**; grid on HoS → Daily Log | Steps: park → Home → HoS, "Stop right here". Says to screenshot HoS, not Daily Log. Daily Log arrows appear only under "Change the day" | Faithful, correct target |
| **Geotab** (split) | Clocks on the HOS screen; grid on the Logs tab | Dashboard → HOS tile, stop there. Says "not the Logs tab". 5 mph lock matches §D's motion-lockout list | Faithful |
| **Verizon Connect Reveal** (split) | Timers on the main Dashboard; Logs → Graph is grid only | Dashboard, "not Logs → Graph". Calendar covers 6 months | Faithful |
| **Garmin eLog** (split) | HOS → Drive hours vs HOS → Hours of service chart | HOS → Drive hours, "not Hours of service chart" | Faithful |
| **Platform Science** (split + tablet) | Clocks on the HOS opening screen; Logs tab; PS Driver companion app | HOS opening screen. Honest notice about the cab tablet | Faithful |
| **ISAAC InControl** (no phone graph) | Dash tablet; current Duty Status (lower-left) → Activities; inspection needs a PIN | Warnbox: "there is no phone screenshot to grab … photo … or type your 4 clocks". Steps describe what to photograph | Faithful, honest |
| **Omnitracs IVG** (no phone graph) | Three variants; on IVG, photo or clocks from Summary/Status | Notice says IVG has no phone screenshot. All three variants listed verbatim | Faithful |
| **Zonar Connect** (no phone graph) | Dash tablet; clocks visible on Daily Logs | Notice plus a photo-of-Daily-Logs target | Faithful |
| **Lytx** (NOT FOUND) | Exact menus behind the portal; often a Geotab-style HOS layout | Labeled "Generic steps"; only the 3 generic steps; no invented menus | Faithful |
| **Generic "Don't see your ELD?"** | §C pattern; the cab-tablet escape hatch; inspection-mode fallback with PIN warning | Same pattern. Step 3 is rewritten from "switch to Graph/Grid" to "stay on the 4 clocks", which is what §D.1 recommends for an OCR that reads clocks. Proprietary fleets (UPS/FedEx/Walmart/JB Hunt) are aliases on this entry. Discontinued ELDs get a search-only note (§F.7) | Faithful; one nit (N6) |
| **J.J. Keller Encompass** (split) | Only the grid path is documented | "Open … to the main Dashboard where your HOS clocks show." Not stated in the research; inferred from §D Tier-2 "stop one tap earlier" | Nit (N5) |

### Menu names, coverage and honesty

- **No invented menu names.** Every tap label I checked appears in the research. The only gaps are clock-location wording on some entries (N5).
- **Counts:** 31 documented, 4 NOT FOUND entries labeled "Generic steps", and 1 generic entry, for 36. The research's "Proprietary Fleet Systems" row (#38) has no row of its own; the generic entry's aliases cover it. That is a reasonable fit with the brief's "discontinued/proprietary/generic entries".
- **Devices with no phone graph say so plainly.** Seven entries carry `noPhoneGraph` with a warnbox notice and no fake steps: Platform Science, Omnitracs, Trimble, Zonar, ISAAC, EROAD Ehubo2, and Pedigree POV. The picker footer also has the cab-tablet escape hatch.

## E. Item 3: bug-report diagnostics snapshot (the main check)

### Construction

`buildDiagnosticsSnapshot` (`app.tsx:415-462`) builds a new object literal by naming each field. It does not spread `State`, read `localStorage`, read the vault, or call `getActiveDriverName`.

- `segments` and `tentative` are copied with `.map`, one named field at a time.
- `config` goes through `safeRulesConfig` and then seven named fields.
- `bugReportMailtoHref` (`app.tsx:469-496`) adds only the named header lines.
- The `onClick` at `12432-12437` rebuilds the href from `getState()` (the active driver's runtime state) at tap time.

This is a genuine allowlist.

### Every field in the emitted body, with a privacy verdict

**Subject**

| Field | Content | Verdict |
|---|---|---|
| `Clock 14 bug report` | constant | OK |

**Header lines**

| Field | Content | Verdict |
|---|---|---|
| `Build:` | `__BUILD__` stamp | OK, non-personal |
| `Date:` | ISO time of the tap (UTC) | OK |
| `Screen:` | `s.tab` (for example `settings`) | OK |
| `Theme:` | day/night/winddown | OK |
| `Platform:` | `iOS`/`Android`/`desktop` plus `(standalone)` or `(browser tab)`. A coarse class; the raw UA string is **not** included | OK |
| `Clocks:` | status label plus 4 clock durations (already in the baseline). The label comes from `segLabel` | OK. A 3000-char current note did not reach the URL; status rendered as a label only |

**`State:` JSON** (key paths taken from the probe's actual output)

| Field | Content | Verdict |
|---|---|---|
| `v` | constant 1 | OK |
| `now`, `nowOverride` | epoch minutes | OK |
| `historyBasis` | string. The probe saw `known`; the handoff's value list is out of date | OK |
| `historyAcknowledged`, `tzChosen` | booleans | OK |
| `seededAt`, `lastEldCheckAt` | epoch minutes or null | OK |
| `deviceTz` | IANA zone, for example `America/Chicago` | OK. Coarse location only, and needed for diagnosis |
| `config.{cycle, shortHaul, timeZone, dayStartHour, dayStartMinute, adverseShifts[], sixteenHourShifts[]}` | rules config | OK |
| `current.{status, since, note?, createdAt?}` | open status | OK, see the note on `note` below |
| `segments[].{status, start, end, note?, tentative?, createdAt?}` | log rows | OK, see below |
| `tentative[].{status, start, end, note?, createdAt?}` | what-if rows | OK, see below |
| `dayCloses[].{dayStart, at}` | timestamps | OK |

**Fallback body** (used when the URL would exceed 1800 chars): the same header lines, then `Summary: segments=N, tentative=N, current=<label> since <min>, cycle=…, tz=…, dayStart=…, basis=…, seededAt=…, lastEldCheckAt=…, now=…[, nowOverride=…]`, then the export-attach line and "What happened:". **OK.**

**Judgment on free text in `note`.** The UI has no general Notes field on log rows. In practice `note` holds:

- app constants: `PC`, `YM`, the ELD-seed and drift provenance notes, `recap entry`
- `break:<preset name>`, where the preset name is the only driver-typed text. The input is capped at 24 chars (`app.tsx:12279`; `store.ts:340` `.slice(0,24)`).

The handoff does list `note?` in its allowlist, but it does not say that this field can carry driver-typed text. I accept it: the text is short, it is the break's label (useful for diagnosing break or split bugs), and the driver sees it in the compose window. See N2 for the import edge case.

Other driver-typed strings are **not** included: load tags (`weekPlan`), Stack stop labels, break preset names that were never logged, trip and split drafts.

### Driven probe

Script: `/tmp/rv/new/web/test/dom/probe-rv.mjs`, run against the new tree's real `App`, with the gate bypass OFF.

1. Registered driver **"Alicia Probeworth"** (PIN 7391, recovery answers `Peterbiltzz`/`Bucceesxx`). Gave her a log containing `break:MomsKitchen` and current `YM`, an unused preset `UnusedPresetQQ`, and a week-plan load tag `SECRETLOADALPHA`.
2. Registered a second driver, **"Bobby Otherdriver"** (PIN 8642, answers `Amarilloyy`/`RubberDuckww`), with marker row `break:BOBMARKER`, createdAt 987654/987655, and start `T-4321`.
3. Locked the session, unlocked Alicia, and opened Settings.
4. Fired a click on `<a data-bug-email>` and decoded the href.
5. Stubbed `fetch`, `navigator.sendBeacon` and `XMLHttpRequest` as tripwires that log any call.

Output (abridged; the body is verbatim):

```
activeName Alicia Probeworth segs 3
---- HREF length 1446
Build: probe
Date: 2026-11-28T01:08:00.319Z
Screen: settings
Theme: day
Platform: iOS (standalone)
Clocks: Status: Yard move | Drive: 7h 00m | Window: 9h 30m | Break: 8h 00m | Cycle: 65h 30m

State: {"v":1,"now":29928480,"nowOverride":29928480,"historyBasis":"known","historyAcknowledged":true,"seededAt":null,"lastEldCheckAt":null,"tzChosen":false,"deviceTz":"America/Chicago","config":{"cycle":"70/8","shortHaul":false,"timeZone":"America/Chicago","dayStartHour":0,"dayStartMinute":0,"adverseShifts":[],"sixteenHourShifts":[]},"current":{"status":"ON","since":29928450,"note":"YM","createdAt":4},"segments":[{"status":"OFF","start":29927580,"end":29928180,"createdAt":1},{"status":"OFF","start":29928180,"end":29928210,"note":"break:MomsKitchen","createdAt":2},{"status":"D","start":29928210,"end":29928450,"createdAt":3}],"tentative":[],"dayCloses":[]}

What happened:
---- forbidden markers checked: 46 LEAKS: []
---- driver-typed break name present (MomsKitchen): true
---- 400-seg href length 779 fallback true
---- 3000-char current note href length 791
---- network calls observed: []
```

The 46 forbidden markers checked, all absent (case-insensitive, raw and decoded):

- both driver names (each part)
- both PINs
- all four recovery answers
- all five curated recovery question texts
- both driver ids
- every pin and recovery salt and hash from the vault
- `__drivers`, `profiles`, `stayUnlocked`, `sha256`, `salt`, `hash`, `recovery`, `question`
- Bobby's `BOBMARKER`, his createdAt values and his row start
- `SECRETLOADALPHA`, `UnusedPresetQQ`

### Size

- A **400-segment** log produces a 779-char href (the Summary fallback).
- A 3000-char note smuggled in through state (the import route) produces a 791-char href.
- The fallback is bounded in every case I tried; mailto stays well under the ~2000-char client limits.
- **Threshold:** the full JSON embeds only up to about **7 rows plus current**. From 8 rows on, the fallback is used (see N1).

### Send path

- The report goes out only through the user-tapped `mailto:` anchor. Nothing is attached or sent through any other channel.
- `grep` of the `app.tsx` diff and both new modules for `fetch(`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `navigator.share`, `clipboard`, `window.open`, `location.href` and `http(s)://` found only the pre-existing GitHub `reportBug` doc comment, which is unchanged context.
- The probe's network tripwires recorded zero calls.
- The mail compose window is the preview. The driver sees the full body and can edit it before sending.

## F. Regression sanity (new tree, `TZ=America/Chicago npm run smoke`, exit 0)

- All sub-suites passed: typecheck, contrast, nightlight, ocr-bundle, smoke.mjs, and all 18 DOM suites, including `myweek 20/20`.
- **drivers 19/19** and **drivers-relaunch 14/14**.
- Stay-unlocked gating passes: DR12, DR16, DRR7–DRR14.
- The B1 reseed guard (populated log → DriftSheet, log byte-unchanged, forced reseed confirms and Undo restores) passes: DR15.
- The drift flow passes: DR13, DR15.
- I did not re-run layout, polish, auditfix, gemini or revisions. They were not in this brief; the handoff reports them green.

## G. Fail-before / pass-after

The new `drivers.mjs` was run against a baseline copy.

```
FAIL DR13 — dead helper eldStalenessInfo should be removed   (guard)
  (guard deleted → FAIL DR13 — chip text "...tap to check" found: real chip-presence failure)
FAIL DR14 — backup nudge missing …  (cascade from DR13 aborting mid-pin; the original baseline drivers.mjs passes 17/17 on base)
FAIL DR18 — QuickStartSheet missing ELD help affordance
FAIL DR19 — wrong or missing disclosure line
drivers: 15/19 on base   |   19/19 on new
```

- None of the four new or updated pins is vacuous.
- Weak spot: DR18 captures `rawStorageBefore` and then only does `void rawStorageBefore` (`drivers.mjs:1276`, `1392`). Its "no persisted ELD choice" check therefore compares only the set of storage keys, not the contents. By construction the claim holds anyway (only `useState` is used); see N8.

---

## Non-blocking findings (recommended follow-ups)

**N1. The snapshot almost never carries the log.** `app.tsx:489-495`. The full `State:` JSON fits only up to about 7 rows plus current. A single realistic shift (8 or more rows), and any multi-day log, falls back to `Summary:` plus "please attach Export". For most real reports, the owner's "app data needed to diagnose the bug" then depends on the driver attaching a file. The disclosure line ("Sends your clock log and app state…", `app.tsx:12439`) overstates what is sent in that common case. Overstating is the privacy-safe direction, so this is not a blocker. Suggested fix: keep the JSON but trim `segments` to the most recent rows that fit, for example newest-first until the 1800 budget runs out, plus a `truncated: N` count. Keep the export line as well.

**N2. Imported notes are not length- or content-bounded.** `parseSaved`/`applyImportedState` keep any string `note`, so an imported file's notes could ride into a small-log JSON. The fallback bounds the size (probe: 791 chars), so the residual risk is only arbitrary imported text in a body the driver can see and edit. Optional: clamp `note` in the snapshot to about 24 chars, or keep only the `break:`/`PC`/`YM`/provenance patterns.

**N3. Discontinued-ELD notice gives false positives.** `eldguides.ts:652-656`. Because of the `term.includes(q)` match, these searches show the "Stoneridge EZ-ELD … VDO RoadLog are discontinued" warnbox:

- `eld`, which is very common ("Apollo ELD", "ELD Mandate")
- `road` and `roa` (BigRoad, EROAD)
- `con` (Verizon Connect, Zonar Connect, InControl)

The probe confirmed all of these. It looks like a warning that the driver's own ELD is dead. Suggested fix: match only when the query is a prefix of a discontinued term and at least 4 chars long, and drop the generic substring `eld`.

**N4. "Change the day … Screenshot one day at a time" contradicts the OCR target.** All entries do this. The `switchDay` lines tell drivers how to open past days' graph grids and to screenshot them. Clock 14 reads only the 4 live clocks, so those screenshots will not import. Suggested wording: "…to view past days on your ELD (for your own check; Clock 14 reads today's clocks)."

**N5. Clock locations not in the research.** For several entries the research documents only the grid path; the clock location is an inference from §D Tier-2 ("stop one tap earlier"). No menu names were invented, but these sentences state the location as fact. Affected wording:

- J.J. Keller: "main Dashboard where your HOS clocks show"
- BigRoad: "Home screen where your HOS clocks show"
- EROAD: "Open the EROAD Driver App … to see your HOS clocks"
- Pedigree: "Open OneView Mobile to check your HOS clocks"
- Trimble: "check your HOS clocks"
- Motive: "log and hours"
- TrackEnsure: "log and clocks"
- VisTracks and TruckingOffice: "your hours"
- Switchboard, Gorilla, Matrack, Linxup: "view/check your clocks"
- Konexial: "Select the view showing your clocks"

Suggested fix: hedge ("usually on…") or fall back to the generic step 3 wording.

**N6. Unsupported legal claim in the generic notice.** "Every FMCSA-registered ELD must show your HOS clocks and 24-hour log" (`eldguides.ts`, generic entry). The research (§C, §E.1) supports only the graph-grid display requirement, not countdown clocks. Suggested wording: "…must show your 24-hour log; most also show your HOS clocks."

## Nits

- **N7.** The handoff lists `historyBasis` values as `'fresh'|'seeded'|'logged'|'acknowledged'`, but the probe emitted `known`. Documentation only.
- **N8.** `void rawStorageBefore` in DR18 (`drivers.mjs:1392`): either compare it or drop it.
- **N9.** In DR19, `forbiddenStrings` includes the bare PINs `1357`/`2468`. These could in principle collide with digits in epoch minutes or createdAt values and fail spuriously. It is deterministic today because `Tms` is fixed.
- **N10.** The render-time `href` uses the render-time `Date:`, and only the `onClick` refresh corrects it. That is fine in browsers. A long-press "copy link" would carry a stale timestamp only, which is harmless.

---

## Evidence actually run

1. `diff -rq` across both trees (src, public, test, package.json) and `diff -u` of `app.tsx` (254 lines), `styles.css` and `drivers.mjs`. All were read in full.
2. Engine aggregate sha256 on both trees (shown in B).
3. `npm run build` on copies of both trees: app.js 726,220 B (new) vs 696,218 B (base). Minified `eldguides.ts` alone is 25,189 B; with the UI module it is 27,843 B. `grep` showed the guide strings are in `dist/app.js`, which is precached by `sw.js`.
4. All 36 guide entries dumped from the compiled module and read against `RESEARCH-ELD-GUIDES.md` §A–§F.
5. `TZ=America/Chicago npm run smoke` on the new copy: exit 0, all PASS (drivers 19/19, drivers-relaunch 14/14).
6. The new `drivers.mjs` on the baseline copy: 15/19, with DR13, DR14, DR18 and DR19 failing. The same run with the DR13 helper guard removed still failed DR13 on chip presence. The original baseline `drivers.mjs` passes 17/17 on the baseline.
7. Privacy probe `probe-rv.mjs` (output in E): two drivers, a vault, PINs, recovery answers, notes, a load tag, network tripwires, a 400-row log and a 3000-char note.
8. Threshold probe `probe-th.mjs`: the fallback starts at 8 rows plus current (full JSON at 6 rows is 1658 chars).
9. Network-call grep over the diff and the new modules: no new network calls.
10. `filterEldGuides`/`matchesDiscontinuedEld` probe for the queries `eld`, `road`, `con`, `roa`, `stoneridge`, `vdo`, `samsara`, `big road`, `apollo eld` (the source of N3).
