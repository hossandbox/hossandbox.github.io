# HOS Sandbox — Regulatory Grounding (verified 2026-09-19)

Sources: eCFR 49 CFR 395.1 / 395.3 (current as of 9/17/2026); FMCSA "FAQs Relating to 2020
Changes to HOS Regulations" (issued 2020-11-19, csa.fmcsa.dot.gov/Documents/HOS_Frequently_Asked_Questions_11-19-2020.pdf).
Property-carrying drivers only (passenger rules differ and are OUT OF SCOPE for v1).

## Core limits — §395.3
- **10-hr rule** (a)(1): may not drive without first taking 10 consecutive hours off duty.
- **14-hr window** (a)(2): may not drive after the 14th consecutive hour after coming on duty
  following ≥10 consecutive hrs off. Off-duty time inside the window does NOT pause it (except
  qualifying split pairs — below).
- **11-hr driving** (a)(3)(i): max 11 hrs driving within the 14-hr window.
- **30-min break** (a)(3)(ii): no driving once >8 cumulative hrs driving have passed without a
  ≥30-min consecutive non-driving interruption (off, SB, or on-duty-not-driving all count).
  Short-haul (§395.1(e)(1)/(e)(2)) drivers are exempt.
- **60/7 and 70/8** (b): no driving after 60 on-duty hrs in 7 days (carrier not 7-day) or 70 in
  8 days (carrier operates every day). Rolling window.
- **34-hr restart** (c): any 7/8-day period may end with ≥34 consecutive hrs off duty. It ALSO
  satisfies the (a)(1) 10-hour daily rest — 34 consecutive hours off duty is by definition ≥10. Never
  describe the restart as doing "nothing" for the 11/14: its distinctive benefit is resetting the
  60/70, and it happens to cover the daily reset at the same time (consumer-review-4, finding 2).

## Split sleeper berth — §395.1(g)(1)(ii)-(iii)  ⚠️ THE PART THE WEB GETS WRONG
Qualifying pair:
- Exactly two periods (extra rests don't count toward the 10).
- Neither shorter than 2 consecutive hrs.
- One is ≥7 consecutive hrs **in the sleeper berth** (off-duty-not-in-berth does NOT satisfy this).
- The other ≥2 hrs: SB, off-duty, or combination.
- Total ≥10 hrs. Any order. 7/3, 8/2, 7.5/2.5, 5+7, 3+10 all valid — minimums, not fixed ratios.
- Driving in the periods immediately before and after each rest, summed, ≤11; and no 14-hr
  violation.

Recalculation (iii):
- Both limits recalculated **from the end of the FIRST of the two periods** — not the second.
- **BOTH qualifying periods are excluded from the 14-hr window** (iii)(B) — "does not include
  qualifying rest periods", confirmed by FMCSA FAQ ("both periods would be excluded from the
  14-hour driving window"). Sites claiming only the 7/8-hr period is excluded (otrucking.com,
  fleetregulators.com) are WRONG. Do not build to them.
- Exclusion is retroactive: nothing is credited until the second period completes. UI must show
  "pending pair" state honestly.
- 11-hr clock does NOT reset — after pairing, available driving = 11 − driving between end of
  period 1 and start of period 2. Available window = 14 − (all non-excluded time in that span).
- Split does NOT touch the 60/70.
- A ≥10-hr break is dual-purpose: full reset AND can be the 7+ SB leg of a pair (if it was in SB).
- Chaining: the second period of one pair may serve as the first period of the next pair.
- **A ≥10h rest that comes FIRST — updated by FMCSA FAQ 22 (effective 2026-07-01):** a 10-consecutive-hour
  rest that *includes ≥7 consecutive hours in the sleeper berth* may EITHER reset the 11/14 OR be paired with
  a later ≥2h off-duty/SB period, "whichever choice is most advantageous to the driver." Pairing keeps the
  anchor at the reset's end (shift start) and excludes the later break from the 14; it cannot restore driving
  time. A pure off-duty 10h rest (no 7h SB) is NOT covered — treat it as reset-only (the pre-2021 FAQ said a
  10h off-duty period cannot be paired; that FAQ was rescinded 2021-02-17 and nothing replaced it for the
  pure-OFF case). Source: fmcsa.dot.gov/regulations/hours-service/can-driver-pair-rest-period-10-consecutive-hours-includes-7-consecutive
  Engine: the opening reset is offered as a candidate first leg when `qualifiesLongSB`; ranking picks.
  Also: FAQ07 (3h OFF then 10h SB) was re-issued 2026-07-01 with the same answer (compliant pairing) and a
  pointer to FAQ22. The 2020-11-19 PDF is partly superseded — prefer the guidance portal pages.
- Multiple possible pairings: FMCSA picks the pairing with fewest/least-severe violations
  (nominal <15 min → violation → OOS/>3hr); ties → the pairing giving the most available
  on-duty/driving time going forward. The engine must enumerate candidate pairings, not greedy-pick.

## Short-haul 150 air-mile — §395.1(e)(1)
- Exempt from §395.8 (RODS) and §395.11 (supporting docs) — and, via §395.3(a)(3)(ii), from the
  30-min break — IF, on that day:
  - operates within **150 air-miles = 172.6 statute miles** (air mile = nautical mile;
    150 nmi × 1.15078 = 172.6 mi) of the normal work reporting location;
  - returns to the reporting location and is released within **14 consecutive hours**;
  - has ≥10 consecutive hrs off separating each 14 hrs on duty;
  - carrier keeps time records (report time, release time, daily total) 6 months.
- Breach of ANY condition → full RODS required for that day (the "you just lost the exemption"
  warning the app should fire). 60/70 still applies to short-haul drivers.
- (e)(2) non-CDL 150-mile variant: exempt from 14-hr rule, may drive up to 16th hour 2 days per
  7; cannot use (e)(1), (g) split, or (o) 16-hr. Note for v2 — CDL drivers are the v1 audience.

## Other exceptions to model (v1 = flag/annotate only, not full engine)
- **Adverse driving** §395.1(b)(1): +2 hrs driving AND window (13/16) if conditions unknown at
  dispatch. Not usable on same day as… (verify before implementing).
- **16-hr short-haul** §395.1(o): once per 7 days (or after a 34 restart), if released at
  reporting location previous 5 duty tours and this one.
- **Personal conveyance**: off-duty; guidance-driven; out of scope for v1 engine.

## Record handling — how the engine reads a log (correctness, not a CFR exception)
- The clocks are computed from the record **as logged** — §395.8 requires an accurate RODS, and a
  scratchpad that quietly changes what the log said is worse than no scratchpad.
- Where two entries overlap, the **later entry wins over the time it actually covers**, and the
  **earlier entry is split** — the part before the overlap AND the part after it are both kept. A
  6-hour driving entry with a 1-hour off-duty entry dropped inside it leaves **5 hours of driving**,
  not 2.
- Truncating the earlier entry instead deletes its tail and silently inflates the available driving
  and cycle time (measured: driving-left 5h → 9h, cycle-left 64h → 68h, "No violations"). That is
  the exact failure a driver would trust and take a violation on. Covered by
  `engine/test/overlap.test.ts` and the overlap cases in `web` smoke.
- The UI must flag overlapping entries, because the row list shows the raw entries while the clocks
  use the resolved timeline — otherwise the two disagree silently.
- **Unlogged time is not rest.** A gap in the record reads as OFF (that is what "not logged" means
  for a driver who was not working), so any *future* time the driver hasn't decided about must
  never be left as a gap. The trip planner takes the status the driver will actually be in until
  departure (`TripInput.untilDeparture`) and the UI shows it as an assumed row. Left implicit, a
  delayed departure manufactures a qualifying split leg out of the wait and can call a load legal
  on an assumption nobody made — the app inventing hours is the same failure as the app losing them.
- Driver-facing copy never shows internal ids or timestamps: no `DRIVE_11`/`BREAK_30` in an
  itinerary or a violation heading, no ISO/UTC stamp in a violation. The engine emits plain English;
  the UI renders clock times from the minute values. The enum ids are internal and stay internal.
- Every slider carries an exact numeric box and −/+ steppers beside it. A driver on a phone must be
  able to type "550 miles" rather than drag a range input until it lands on 550.
- Segment rows offer a named **Edit** action and a one-level **Undo** after an edit or delete. Edits
  match the segment by identity so the other rows — and their delete controls — are undisturbed.
- **Never assert what the driver wasn't asked.** With nothing logged the engine correctly returns a
  fresh 11/14/70 — arithmetic that is right, but not a fact about anyone's day. The UI labels it as
  an assumption (`isFreshLog`) on the clocks and on the trip verdict, and the wait before a future
  departure defaults to On duty (no rest credit) when no current status is set. **A guess may make
  the plan look worse than reality, never better** — being told a load doesn't fit is an annoyance;
  being told it fits when it doesn't is a violation.
- The Log tab can show the **resolved timeline** — the normalized record the clocks actually use,
  including the live current segment, with per-status totals. Read-only; the entry list stays the
  editable record.
- **Offer every rest strategy side by side.** `planTripAll` returns the 10-hour-reset, sleeper-split
  *and* 34-hour-restart plans, because waiting for recap hours can cost a day or more while a restart
  is always available under §395.3(c). The restart plan is identical to the reset plan unless the
  60/70 is what binds — never collapse the two, or the driver never sees the shorter wait.
- **Inputs are validated, never silently substituted.** Out-of-range typed values are refused with a
  message; a stop past the destination is reported (by the planner, in `plan.warnings`) and kept in
  the control rather than dropped or clamped. An invalid IANA time zone is refused outright — it
  would make `Intl.DateTimeFormat` throw inside the engine and blank every tab.
- Plans running past a week print **calendar dates**, not just a weekday, because "Wed 08:00" stops
  being unambiguous once the week repeats.
- **A range input's exposed value must equal the real value.** `clock()` renders in the *device*
  zone while carrier days and recap returns are computed in `config.timeZone`; when those differ the
  UI must say so, because a terminal-midnight recap does not read as 00:00 on the device clock.
- Range controls use `step=1` so the browser cannot snap the exposed value away from the real one
  (with `min=1, step=25`, typing 20 exposed 26 and the 3000 maximum was unreachable at 2976). Coarse
  increments belong on the −/+ buttons, never on the range element.
- **Copy claims only what the app can know.** It cannot confirm a download reached the device, so it
  says "Download requested: <file>" — never "Exported". Every claim in the UI should be traceable to
  something the app actually observed.
- `exportState` and `applyImportedState` are one contract: everything the export carries comes back
  (log, settings, speed, trip scenario, report address), **except `nowOverride`** — a simulated clock
  must never return silently and make the app lie about the time. Adding a field to one without the
  other is the bug; the round-trip smoke test fails if they drift apart.
- **Contrast is verified, not eyeballed.** `web/test/contrast.mjs` parses the real palette out of
  `styles.css` and fails the suite if any documented pair drops below WCAG AA (4.5:1 for text, 3:1
  for graphics), for both themes. It reads the colours rather than copying them, so a palette change
  cannot pass by being made in one place only.
- **Night is the product default; day is an opt-in for sunlight**, where a dark screen is the worst
  case. The status colours are re-tuned for light rather than inverted, and `--chip-ink` flips from
  black to white — inverting a palette wholesale is how you ship unreadable text.
- Never indicate selection with **opacity**: dimming the "I am now…" chips dropped their labels to
  2.23:1. Use a ring at full contrast instead.
- **A current status is not history.** Tapping "Driving" says what is happening *now*; it says
  nothing about the days behind it. The incomplete-basis disclosure stays until the driver explicitly
  acknowledges the record starts here (or the log genuinely reaches back a full day). Unknown past
  days must never look like confirmed zero-hour days — `historyBasis()` is the single source.
- **Every planning screen's scenario persists.** Trip, Split Lab and the Recap load checker keep
  their inputs in the store, because looking at the Log tab must never rewrite the numbers the driver
  is comparing. Clearing one is an explicit action, never a side effect of navigation.
- **A plan's violations are not the driver's violations.** Violations carry `tentative`; the Log tab
  shows "Violations in your log" and "This plan would violate" separately. Never file a what-if under
  a heading that reads as though the driver has already violated.
- **Arrival is not unloading.** `arrival` includes a trailing dwell; `driveEnd` is the wheels-stop
  time. Any number that depends on which hour you mean has to name the event it belongs to.
- **Every slider's rejected input says so.** A blank field, a browser-refused value ("3,500" reads as
  empty in a number input — check `validity.badInput`), and an out-of-range entry all leave the
  stored value alone, so all three must say what happened and what is still in effect.

## Engine invariants the stress-test rounds established

- **A row dated in the future is not history.** A non-tentative entry starting after `asOf` has not
  happened; treating it as record merges it with the preceding gap into a phantom ≥10h rest (a fresh
  clock the driver never earned) and can overwrite a plan's own driving so an illegal run reads
  feasible. Tentative rows are plans and stay. Whatever is excluded gets reported on screen.
- **Overlap resolution is by entry order, not by start time.** `Segment.createdAt` is a monotonic entry
  key; `normalize()` places rows in it when present and falls back to (start, end) for imported records.
  Without it a correction lost to the row it corrected — including forgotten driving.
- **The split-chain search must be EXACT — do not bound or trim it.** `evaluateShift` is a dynamic
  programme over every qualifying rest (state = the chain's last two rests), exact in O(n³), with
  `MAX_DP_RESTS` as an absurd-record valve only. Round 1 trimmed the candidate list to the 12 most
  recent rests and I argued the trim "errs downward, never upward" — the clocks did, but the
  *violations* did not: judging older driving with no split credit made the ranking pick a worse
  interpretation, and 7 days of legal 8/2 splits showed four phantom "well over" violations that
  never happened. Fewer available hours is conservative; **inventing a violation is not.** `U2c`
  compares the DP against brute force on 1,500 random shifts — if you change `anchorAt` or
  `excludedMinutes`, `pieceCost`/`stateCost` must change to match, and U2c failing is the guard doing
  its job, not a flaky test.
- **Ties are resolved by a written rule, never by loop order.** FMCSA ranks interpretations by
  compliance — 1 fewest egregious, 2 fewest over, 3 fewest minor, 4 most drive+window time left — and
  says nothing about which of two *equally compliant* readings to show. That choice therefore has to be
  fixed, documented and tested, or it silently changes with code order. Order: 1–4 as above, then
  **5 least over the limits right now** (drive+window headroom *unclamped* — criterion 4 continued below
  zero), **6 fewest total minutes over**, **7 shortest rest still needed to finish a split**,
  **8 fewest rests in the chain**, **9 earliest-first by rest start**. `rankEvaluations()` is the
  reference; `evaluateShift()`'s DP carries the same order as an 8-component cost plus an additive
  `canon` key (`−Σ 2^(n−1−i)` over chain indices), and `U2c` holds the two together **on full visible
  output** — anchor, clocks, pending leg, chain, and each violation's kind/start/minutes. The earlier
  signature-only comparison is exactly why tied readings could resolve differently unnoticed. Adding or
  reordering a criterion means changing both, plus `U5`. **Do not move 6 ahead of 5:** once every
  reading is out of hours criterion 4 is 0 for all of them and loses the difference, so the displayed
  anchor flickers as time passes — `U7` is what catches that.
- **Ties were ~21% of random shifts**, and in about 9% of those the tied readings showed the driver
  different things (anchor, pending split leg, violation minutes). Measured effect of the fixed order:
  ~6% of readings change visibly while the **legal verdict — severity counts and every clock — is
  identical**; of the changed violation-minute totals the direction is overwhelmingly downward, and the
  few that rise are the deliberate 5-before-6 trade (a stable, current picture matters more to a driver
  who is already out of hours than the lowest historical total). If a driver compares a screenshot from
  before this change, expect the anchor or a violation's minutes to differ while the verdict does not.
- **A logged row never counts past "now".** Clipping happens in `evaluate()` (reported as
  `clippedFuture`) and in `planTrip()` at departure. Round 1 only dropped rows that *started* after
  `asOf`, so a row that started before now and ended after it still counted in full — OFF 08:00→22:00
  opened at 10:00 handed the driver a fresh 14-hour window. Fix the class, not the test.
- **`normalize()` ordering contract:** stamped rows by stamp; unstamped logged rows count as older
  than any stamped row; unstamped **tentative** rows go last, so a plan is never overwritten by
  history it overlaps. The live status carries the stamp of the moment it was tapped
  (`OpenSegment.createdAt`), so a correction typed during a status still wins.
- **Unlogged time is read as OFF, and must be disclosed.** That is the conservative reading, but it can
  manufacture a reset no one took, so `evaluate()` returns `gaps` and the UI shows them. Only gaps ≥2h
  are worth interrupting a driver for (below that it is just "went off duty and opened the app").
  `gaps` is limited to the current shift and the cycle window — an ancient hole is not actionable.
- **The 60/70 cycle needs its whole carrier window before it can call the history known.** `cycleBasis`
  (window days) is separate from `historyBasis` (a shift's worth) for exactly this reason.
- **The "Sleeper splits" strategy must be able to CREATE a split.** Pairing only with an existing rest
  made it identical to the 10h reset for a fresh driver, and the UI then said the choice made no
  difference. It opens a 7h sleeper long leg (or 8h if that plans earlier).
- **A carrier day start that falls in the DST spring-forward gap resolves FORWARD**, to the first real
  instant after the gap. Resolving early made the preceding day 23h and shifted every boundary near it.
- **Segment times must be finite numbers.** `normalize()` drops rows that are not; `evaluate()` reports
  them as `invalid` so an import can name what it rejected instead of throwing from deep inside.

## Geometry for the 150 air-mile circle
- Great-circle (haversine) distance from terminal, threshold 150 nautical miles = 277,800 m.
- Do NOT draw with Euclidean lat/lon; error is significant at 150 nmi across latitudes.

## Disclaimer copy (must ship)
"HOS Sandbox is a planning scratchpad. It is not an ELD, is not FMCSA-registered, and does not
replace your record of duty status. Your official log and your carrier's ELD govern."
