VERDICT: FIX-FIRST

# Review — Clock 14 `logpatch` (`work-logpatch` vs live `work-eldpatch`)

Reviewer: Opus (independent). Date: 2026-11-28. I did not edit any code. My probe scripts are in `~/hos-build/rv-probes-logpatch/`.

**Bottom line:** the day *binding* is solid. The day lives in the sheet descriptor, so the fill can't land on the wrong day, and the other days' rows stay byte-identical. The swipe is guarded properly. The problem is the day-scoped *comparison math*, which is wrong in two independent ways. Both make the app tell the driver "about Xh of driving isn't in the log yet" on a log that is correct, and then offer a one-tap **Add the missing driving** that writes driving that never happened. I drove this in the app: the driver taps the button and a phantom 1h drive row is written (D1 below). The Now Refresh flow, given the same state and the same ELD number, says "You're in sync". The driver still has to tap, so compare-and-choose technically holds. But a confident false recommendation is exactly the patch 9.1 hazard that `driftCheck`'s own doc comment says must never happen. I would not put my name on this day-scoping.

---

## Findings (most severe first)

### F1 — CRITICAL: day-scoped compare reads what-if (tentative) rows, which brings back the patch 9.1 phantom-fill bug
- **Where:** `web/src/store.ts:2809-2816` (`driftCheck` with `day`) and `store.ts:2851-2853` (`planDriftFill` with `day`). Both call `allSegments(s, now)`. That function (`store.ts:2432-2437`) appends `s.tentative`. The unscoped path uses `loggedSegments`, which filters what-if rows out.
- **Why it matters:** the doc comment right above `driftCheck` (`store.ts:2787-2797`) says "A stale plan must never be able to turn a correct log into a 'missing driving' verdict with a fill behind it (patch 9.1; an independent verification probe wrote 30 minutes of driving that never happened exactly that way)." The builder added a paragraph to that same comment saying the scoped path uses "segments + tentative". So it contradicts the fence it sits under.
- **Failure scenario:** It is Thursday 12:00. Logged rows: OFF until 06:00, Driving 06:00–10:00, an unlogged gap 10:00–11:00, ON 11:00–12:00. There is also a what-if OFF row 07:00–09:00: a planned break the driver drove through. The ELD truthfully shows 7:00 drive left.
  - Now Refresh: **sync**.
  - Log → "Compare today": **"Your ELD shows 2h 00m less driving left… isn't in the log yet"**. It offers **Add the missing driving**, and tapping it writes `D 10:00–11:00 "Drift check"`.
- **Evidence:**
  - `rv-probes-logpatch/probe1.mjs` (pure store, case A): unscoped `{"appLeft":420,"gap":0,"verdict":"sync"}`; scoped `{"appLeft":540,"gap":-120,"verdict":"missing"}`; plan `filled:60`.
  - `rv-probes-logpatch/dom-probe.mjs` (full App under domshim, case D1): `D1 Now-flow (unscoped) verdict: SYNC`, then `D1 Log "Compare today" verdict: … 2h 00m less …`, `Add-the-missing-driving offered: true`, `phantom rows written after tap: [["D",600,660]]`.
- **Fix:** use `loggedSegments(s, now)` in both scoped branches.

### F2 — CRITICAL: day-scoped `driftCheck` throws away all history before `day.start`, so shifts that cross midnight (or the carrier-day start) get the wrong "drive left"
- **Where:** `store.ts:2812-2815`. Segments are clipped to `[day.start, min(day.end, now)]` *before* `evaluate()`. The engine then sees the day's first row as the start of the record: no prior shift, no prior driving, no prior 14h window.
- **Failure scenario (today):** the driver comes off ≥10h rest at 20:00 Wednesday and drives 20:00–24:00 and 00:00–03:00. Then ON 03:00–04:00, an unlogged gap 04:00–04:30, and OFF until now (05:00 Thursday). The ELD and the app agree on 4:00 left, and Now Refresh says sync. Log → "Compare today" with the same 4:00 says **4h missing** and offers a 30m phantom fill at 04:00–04:30. Overnight driving across the carrier-day start is routine for this user base.
- **Failure scenario (past day):** for a past day, the evaluation runs at `day.end`. If the day ends in ≥10h of OFF/SB (normal for most days), the engine reports a fresh **11:00**, so almost any ELD number reads as "missing". The handoff concedes this as "Flagged Item #3". The LP1 fixture uses exactly 8h of OFF, which avoids it.
- **Evidence:**
  - `probe1.mjs` case B: unscoped `{"appLeft":240,"gap":0,"verdict":"sync"}`; scoped, same ELD value, `{"appLeft":480,"gap":-240,"verdict":"missing"}`; plan `{"filled":30,"remainder":210}`.
  - `probe2.mjs`: a Wednesday that ends in 21h of OFF gives `appLeft:660`.
- **Fix direction:** evaluate the full *logged* record up to `asOf = min(day.end, now)`, with no lower clip. Keep the day fence only on *where the fill may go* (`planDriftFill` stretches inside `[day.start, min(day.end, now)]`). For `back === 0`, the result then matches the Now flow exactly. That parity should be pinned.

### F3 — HIGH: past-day compare doesn't make sense as designed; the guide sends the driver to a screen whose numbers get misread as "drive left"
- **The mismatch:** ELD countdown clocks (Drive/Shift/Break/Cycle *left*) only exist for the live moment. The bundled `switchDay` guidance for all 36 guides (`src/eldguides.ts`, e.g. line 81 for Samsara: "To check another day's log graph, tap Daily Log…") sends the driver to a past day's **log graph / daily totals** view. The same Samsara entry's `whichScreen` (line 79) says "Screenshot the HoS clocks screen, not Daily Log — Clock 14 reads your four countdown clocks". The OCR maps the label `driving` to `driveLeft` (`src/eldocr.ts:324`). So a past day's total ("Driving 6:00") gets read as *6:00 left*.
- **Failure scenario:** on Wednesday the driver actually drove 6h but logged 4h. They follow the in-app guide, open Wednesday's Daily Log on the ELD, and screenshot it (it shows "Driving 6:00"). The app reads `driveLeft = 6:00`. Because of F2, Wednesday's app-left is 11:00, so the verdict says **"5h 00m less driving left"** and offers a fill. The numbers mean nothing. The fill happens to be 2h here only because the gap is 2h.
- **Evidence:** `probe2.mjs`: `OCR of past-day Daily Log total "Driving 6:00" -> {"driveLeft":{"minutes":360}}`; `Wed scoped check … {"appLeft":660,"eldLeft":360,"gap":-300,"verdict":"missing"}`.
- **Owner decision needed:** either (a) limit per-day compare to `back === 0` (today, against the live clocks), or (b) define a different past-day comparison (that day's logged *driving total* against the ELD's daily total). That would be a new comparison and should not reuse `driftCheck`'s drive-left math. Fixing F1 and F2 alone doesn't fix this.

### F4 — MEDIUM (owner-visible behavior change): swiping Log → Now no longer works from most of the Log page
- `touch-action: pan-y` on `.log-graph-card` and `.log-scroll` (`styles.css:1242, 1251`) means a rightward drag there now changes the day instead of paging the strip to Now. Strip paging from Log only starts from `.log-foot` / `.daynav`. At the earliest day (`canBack` false), a rightward drag on the rows does nothing at all; before, it went to Now.
- The handoff flags this (#2). The strip leg in `layout.mjs` was re-aimed from `button.entry` to `.log-foot button.addbtn`. I checked: no baseline layout pins were removed ("swiping left past Log stays on Log" and "a vertical drag on Log content scrolls" are both still there and pass). This is a reasonable consequence of item 2, but the owner should knowingly accept it.

### F5 — LOW: `lastEldCheckAt` is stamped to `now` on a past-day compare
- `app.tsx:3441` and `app.tsx:4026`. This is the same bookkeeping as the Now flow, so it doesn't diverge, and nothing else is added. Its only consumers are persistence, export, sim snapshot and the diagnostic summary (`grep lastEldCheckAt src/*`); no nudge reads it today. So the impact is a misleading "last checked" in exports. If F3 is solved with option (a), this goes away.

### F6 — LOW: the pins miss exactly the failure classes above
- Fail-before/pass-after holds. I ran `logpatch.mjs`, with imports rewritten, against both trees in America/Chicago and UTC:
  - **work-logpatch:** 4/4 PASS.
  - **work-eldpatch:**
    - LP1 FAIL (`missing Log per-day compare CTA`)
    - LP2 FAIL (`planDriftFill spilled outside full day1`)
    - LP3 **PASS**
    - LP4 FAIL (`missing swipe containers`)
- What they don't prove:
  - LP3 passes on both trees, so it is a regression fence, not evidence of the change.
  - LP2's baseline failure is partly artificial: baseline `planDriftFill` just ignores the 4th argument.
  - No pin has a what-if row (F1), a shift crossing midnight (F2), a past day ending in ≥10h rest (F2/F3), or **Log "Compare today" vs Now Refresh parity on the same state**. That parity pin would have caught F1 and F2 immediately.

### F7 — INFO: day binding and fencing are airtight; swipe guards hold
- **Binding:** the day travels as `{start, end, label, back}` inside `SheetKind` (`app.tsx:781-795`), is captured at CTA tap (`app.tsx:4320`), and goes to `driftCheck`/`planDriftFill`/`addDriftFill`. `addDriftFill` checks the window again (`app.tsx:4024`). LogTab's later `back` state is never read.
- **Probe D2 (cross-day):**
  - Opened the compare for Wed (back=1). A swipe with the sheet open was blocked; the title stayed "Wed, Nov 25".
  - I then *forced* a Next-day click behind the sheet (domshim doesn't enforce `inert`), so the Log showed **Today**, and applied.
  - The fill landed at Wed 11:00–12:00 (`inWed: true`). Today's rows and pre-Wed rows were byte-identical. The banner still read "Comparing Wed, Nov 25".
  - So applying while another day is on screen still writes to the picked day, and the banner says so. Small rough edge: "Back to Log" then returns to whatever day is showing, not the compared one.
- **Swipe** (`app.tsx:4072-4198`):
  - Blocked while any sheet, the edit sheet, the disclaimer or a morph is open, re-checked on start, move and end.
  - Single touch only.
  - Ignores touches that start on `input`/`select`/`textarea`.
  - Needs |dx| ≥ 56 and |dx| ≥ 1.5 × max|dy| seen during the move.
  - Locked during the 220ms swap animation.
  - Clicks are suppressed for 350ms after a committed swipe, so a swipe across a row doesn't open the row editor.
  - Boundaries use the same `canBack` / `back === 0` rules as the arrows (`app.tsx:4250-4253`), which are unchanged.
  - Editing a row happens in the edit sheet, so it's covered by the blocked check.
  - Real-browser pins pass at 412×915 and 360×640 (below).

---

## Invariants checked
| Invariant | Result | Evidence |
|---|---|---|
| `engine/` byte-identical | **PASS** | aggregate sha256 = `0949296e…797208d` in **both** trees (command from the brief) |
| localStorage keys | **PASS** | after the DOM probe: `hos-sandbox-v1-sim, hos-sandbox-v1, hos-sandbox-v1-backup, hos-sandbox-undo-v1`; no new `State` fields in `store.ts` diff |
| Compare-and-choose only | **Technically PASS, broken in substance** | Compare leaves segments/tentative/current byte-identical (LP1; D1/D2); writes happen only through the explicit button and `undoable`. But F1–F3 recommend false fills. |
| receptionfix2 B1 guard | **PASS** | No quickstart/reseed hunks in the diff. The only new route to quickstart is the existing `historyBasis === 'fresh'` screen (no segments, tentative or current, `store.ts:1760`), which by definition isn't a populated log. |
| Stay-unlocked | **PASS** | No diff hunks touch the driver/vault/stay-unlocked code (`store.ts` diff is drift-only; `app.tsx` hunks are the import line, `SheetKind`, `DriftSheet`, `addDriftFill`, swipe/LogTab, and `renderDisplayedSheet`). |
| No new network | **PASS** | No new `fetch`/XHR/beacon/WebSocket/dynamic import in the diff; `fetch(` count per file is identical between trees; `EldGuideFlow` reads the bundled `eldguides.ts` only (only change: `targetDayLabel` copy). |
| Scope | **PASS** | 7 files: `store.ts`, `app.tsx`, `eldguides-ui.tsx`, `styles.css`, `package.json` (adds logpatch to `dom`), `layout.mjs` (re-aimed leg + 2 pins), new `logpatch.mjs`. Nothing outside the two items. |

## Regression runs (mine, on work-logpatch)
- `TZ=America/Chicago npm run smoke`: all green, through to `logpatch: 4 passed, 0 failed`. The suite is chained with `&&`, so every earlier suite passed, including `smoke.mjs` patch 9 / DR checks, drivers and drivers-relaunch.
- `TZ=UTC node test/dom/layout.mjs` (real Chromium, run 01:18 CST): **425 pass, 0 fail, LAYOUT OK**, including the logpatch Item 2 pins, "swipe starting on Log footer pages log → now", "swiping left past Log stays on Log" and "vertical drag on Log content scrolls" at both viewports.
- Now Refresh (unscoped) is untouched in practice: the no-`day` branches call the original signatures; LP3 and D1 show the unscoped sheet with no banner and the correct "sync".
- I did not re-run revisions, gemini, auditfix or polish (the handoff reports them green).

## Bundle
- `web/dist/app.js`: **729,836 B** vs baseline **726,220 B** → **+3,616 B**. Confirmed by `ls -la`. The dist mtime (00:35:24) is later than every changed source (latest `app.tsx` 00:35:10 / `styles.css` 00:35:12), so dist matches the sources.

## Required before SHIP
1. F1: scoped `driftCheck`/`planDriftFill` read `loggedSegments`, never `allSegments`.
2. F2: evaluate the full logged history up to `asOf`, and fence only the fill to the day. Add a pin: for `back === 0`, Log "Compare today" must give the same verdict as Now Refresh on the same state (include a what-if row and an overnight shift).
3. F3: owner decides — restrict per-day compare to today, or design a real past-day comparison (daily driving total vs the ELD's daily total). Until then, past-day compare will recommend nonsense fills.
4. F4: owner explicitly accepts losing Log → Now strip paging from the Log grid and rows.
