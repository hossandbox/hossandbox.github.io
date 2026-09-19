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
- **34-hr restart** (c): any 7/8-day period may end with ≥34 consecutive hrs off duty.

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

## Geometry for the 150 air-mile circle
- Great-circle (haversine) distance from terminal, threshold 150 nautical miles = 277,800 m.
- Do NOT draw with Euclidean lat/lon; error is significant at 150 nmi across latitudes.

## Disclaimer copy (must ship)
"HOS Sandbox is a planning scratchpad. It is not an ELD, is not FMCSA-registered, and does not
replace your record of duty status. Your official log and your carrier's ELD govern."
