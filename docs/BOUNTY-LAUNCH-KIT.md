# HOS Sandbox — Bug Bounty Launch Kit

All placeholders filled (URL, Venmo, hossandbox.app@gmail.com). Ready to post.

---

## Bounty rules (post these verbatim, or link to them)

**What you get**
- **$10** for a completed test report (template below) — one per driver, first 20 drivers.
- **$5 per confirmed bug**, first reporter only. Cap **$50 per driver**. Bounty pool closes at $400.
- Paid by **Venmo** within 48 hours of confirmation. When your issue is confirmed I'll comment on it; email your Venmo handle to hossandbox.app@gmail.com from there. Don't post payment handles in issues.

**What counts as a bug**
- The app's clocks disagree with the regulation (49 CFR 395.1(g) / 395.3) or with your ELD on the same inputs. *The ELD is not automatically right — if you think the ELD is wrong, say so and we'll check the reg together. You still get paid if the app is wrong.*
- Crash, freeze, lost data, button that does nothing, text you can't read on your phone.
- Anything that would get a driver a violation if they trusted it.

**What doesn't count (still want it, just not paid)**
- Feature requests, wording, colors, "I wish it did X."
- Things already listed under Known Gaps.
- The same bug someone already reported.

**Known gaps (v1 — don't report these)**
- Property-carrying, US interstate rules only — no passenger/bus rules, no Canada, Alaska, or oilfield rules.
- The planner's sleeper-split option pairs a sleeper period with a rest you already have (or an off-duty stop you plan). It won't invent a short break for you — use the Split Lab for that.
- Adverse-conditions and 16-hour-day exceptions are honor-system toggles: the app applies the extra hours, it can't verify you were eligible.
- It's a web app you add to your home screen, not on the app stores yet.

**This is not an ELD.** Do not use it to make compliance decisions during testing. Your official log governs.

---

## Test report template (use the in-app 🐞 button, or open an issue at https://github.com/hossandbox/hossandbox.github.io/issues/new/choose)

```
Phone + browser:            (e.g. Pixel 7 / Chrome, iPhone 13 / Safari)
Your operation:             (OTR 70/8, regional 60/7, local, team…)
Time zone / day start:      (e.g. Central, midnight)

1. Enter one REAL past day (or two) exactly as your ELD shows it.
   App said:   11-hr left ____  14-hr left ____  70-hr left ____
   ELD said:   11-hr left ____  14-hr left ____  70-hr left ____
   Match? Y/N  — if N, screenshot both.

2. Split Lab: set up a split you've actually run (or would run).
   Did the after-break clocks match what your ELD gave you? Y/N/never done one

3. Anything confusing, wrong, or broken:

4. One thing you'd want it to do that it doesn't:

Attach: Settings → Export JSON (so we can reproduce your exact log).
```

---

## Post 1 — Reddit long form (r/Truckers, r/TruckDrivers, r/CDL). Send to mods first.

**Title:** Built a free HOS "what-if" scratchpad that models your whole day — splits, recap, parking — and shows what happens if you DON'T finish the split. Not an ELD. Paying drivers to break it.

Been reading this sub a long time. The thing that comes up over and over: the ELD tells you what you've got *right now*, but not what you'll have *after* the 3-hour nap at the receiver and the 7 in the bunk tonight. So everybody does the 8/2 and 7/3 math in their head at 2 AM and hopes.

There are calculators out there. I tried them. They each do one slice: a recap calculator that knows nothing about your 14. A "do these two rest periods pair?" checker that won't tell you your remaining hours. A preset 7/3-or-8/2 button that can't handle a day with three breaks in it. A $7/month countdown timer that's just an ELD without the ELD. A dispatch trip planner whose FAQ says "sleeper splits: not yet."

So I built the thing I wanted: **one model of your whole day that you can poke at.** Web app, add to home screen. No ECM, no login, no account, no ads, no GPS, nothing leaves your phone, works offline.

What's different, concretely:

- **It runs all the rules together, on your actual log.** The 11, the 14, the 30-minute break, 60/70 recap, 34 restart, and split pairing — one engine, not six calculators that don't talk to each other. Change one thing and everything downstream moves.
- **Split Lab shows the downside.** Sliders for break 1, drive, break 2. You get your clocks *after* the pair — and, the part nothing else shows, **what you're sitting in if you don't finish break 2.** That's the number that actually keeps you legal.
- **It handles real days, not textbook ones.** Three breaks? It checks every legal pairing and picks the one FMCSA enforcement would (fewest violations, then most hours forward — that's their published rule). Chained splits where the 7 becomes the first leg of the next pair. A 10-hour sleeper reset that pairs with a later 2-hour lunch.
- **It's current with FMCSA's July 2026 guidance (FAQ 22).** A 10-hour sleeper reset can now *either* reset you *or* pair with a later 2h+ break, whichever helps more. Most blogs and a lot of vendor material still teach the 2020 answer. Check whether yours does.
- **Trip planner runs splits.** Every plan is shown two ways side by side — full 10-hour resets vs. sleeper splits — with arrival times. Mark a receiver stop off-duty and it becomes a split leg.
- **Clock-to-parking.** Turns "2h15m left" into "110 miles; here are the 60/45/30/15-minute buffer lines." Plan the 60-minute line, not the zero.
- **The math is open.** Every rule cites the CFR section. The source and the test suite — built from FMCSA's own worked examples — are public on GitHub. If you think it's wrong, you can read exactly why it thinks it's right, and so can I.

Found along the way: several popular trucking sites have the split rule *wrong* (they say only the 7-hour period comes out of your 14; the reg says both do). That's why I don't trust my own testing and want yours.

**I'm paying:** $10 for a filled-out test report comparing it to your ELD on a real day, $5 for every bug you're first to find. Rules and the report form are on the GitHub page linked from the app. If your ELD and my app disagree, I want to know either way — we'll look at the reg together, and you get paid if the app's wrong.

What it is NOT: it is not an ELD, it's not registered with anybody, it doesn't log for you. It's the napkin, not the logbook.

Link: https://hossandbox.github.io/ — open in Chrome/Safari, "Add to Home Screen."

Built by one person. It's rough. Tell me where.

---

## Post 2 — Short form (Facebook driver groups, X/Twitter, Threads)

Every HOS calculator I found does one slice — recap only, or "do these two rests pair," or a $7/mo countdown timer. None of them model your *whole day* or tell you what happens if you don't finish the split.

So I built one. Free, no account, no GPS, nothing leaves your phone. Sliders for "3-hour nap now, 7 in the bunk tonight — what do I wake up with, and what am I sitting in if I bail on the 7?" Plus 70-hour recap forecast, trip planner that runs splits, and miles-to-parking with buffer lines. Current with FMCSA's July 2026 split guidance. Math is open source, tested against FMCSA's own examples.

Need CDL drivers to break it. **$10 to compare it against your ELD on a real day, $5 per bug you find first.**

https://hossandbox.github.io/ — add to home screen.

---

## Post 3 — Comment version (when someone in a thread asks the split question)

Not to hijack, but I built a free calculator for exactly this — sliders for the nap + the bunk time, shows your 11/14 after the pair completes *and* what you're sitting in if you skip the second break (that's the part other calculators leave out). Handles days with multiple breaks and the new July 2026 FMCSA guidance on 10-hour sleeper resets. Not an ELD, nothing to install, nothing leaves your phone: https://hossandbox.github.io/ — I'm paying $5 per bug right now because I don't trust my own testing, so if it disagrees with your ELD, tell me.

---

## Differentiation notes (for you, not for posting verbatim)

Verified 2026-09-19 against what's live. Don't name competitors in public posts — describe the category. Every claim below is checkable.

| Claim | Basis |
|---|---|
| "One model, whole day" | Recap apps (Truck Recap, hoscalculator.com) do recap only; splitsleepercalc.com's own page lists 60/70, 30-min, restart, and driving-between as "what this tool does not decide" |
| "Shows the downside if you don't finish the pair" | No tool found does this; ELDs (EROAD blog) provisionally credit the 7h and then claw it back |
| "Every pairing, FMCSA ranking" | FMCSA FAQ ordering (fewest → nominal → violation → OOS; tie = most hours forward) implemented; splitsleepercalc rejects logs with >2 rest segments |
| "Current with FAQ 22 (July 2026)" | fmcsa.dot.gov guidance page, effective 2026-07-01. splitsleepercalc is also current — say "most," not "all" |
| "Trip planner runs splits" | MyCarrierVault dispatch planner FAQ: "Does it handle sleeper-berth splits? Not yet." |
| "Open source, tested against FMCSA examples" | github.com/hossandbox/hossandbox.github.io — 27 tests; none of the others publish code |
| "Free, no account, no GPS" | HOS Guard $6.99/mo or $99 lifetime; Trucker Timer uses background location |

Things NOT to claim: "the only" anything (splitsleepercalc is careful and current), "FMCSA-approved" (nothing is), "replaces your ELD."

---

## Modmail (send before posting on r/Truckers)

Hi mods — I'd like to post about a free split-sleeper/recap calculator I built (web app, not an ELD, no account, no ads, no data collection). I'm offering drivers a small payment ($10 + $5/bug) to test it against their ELDs and report mismatches. I know this brushes against the promotion rules — happy to post it however you prefer (weekly thread, flair, no link in the body, whatever works). Draft is below. Thanks for the community.

---

## Where to post, in order

1. **r/Truckers** (after modmail) — largest, most skeptical, best bug reports.
2. **r/TruckDrivers**, **r/CDL**, **r/Trucking** — same post, adjust the first line.
3. **TruckersReport forums** (Trucking Industry Regulations → Hours of Service board) — old-school, deeply knowledgeable about the reg, will catch legal-edge bugs.
4. **Facebook groups** — "Truckers Who Get It," "OTR Truck Drivers," regional groups. Short form.
5. **r/AlphaAndBetaUsers**, **r/BetaTestersNeeded** — low-value for drivers but zero risk.
6. Skip TikTok/YouTube until you have a 30-second screen recording of the Split Lab; then that's your best channel.

## Budget

20 testers × $10 = $200. Bugs: plan on 15–30 confirmed at $5 = $75–150. **Realistic total: $300–400.** Set a hard cap in the post ("first 20 drivers, bounty pool closes at $400") so it can't run away.
