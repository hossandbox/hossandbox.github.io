# HOS Sandbox — Bug Bounty Launch Kit

Placeholders to fill before posting: **[PAY-METHODS]** (URL and report channel are filled in).

---

## Bounty rules (post these verbatim, or link to them)

**What you get**
- **$10** for a completed test report (template below) — one per driver, first 20 drivers.
- **$5 per confirmed bug**, first reporter only. Cap **$50 per driver**.
- Paid via [PAY-METHODS] within 48 hours of confirmation.

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

## Test report template (use the in-app 🐞 button, or open an issue at https://github.com/loricoestrellado-jpg/hos-sandbox/issues/new/choose)

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

**Title:** I built a free "what-if" calculator for split sleeper / recap / parking math. Not an ELD. Need drivers to break it — I'll pay for bugs.

Been reading this sub a long time. The thing that comes up over and over: the ELD tells you what you've got *right now*, but not what you'll have *after* the 3-hour nap at the receiver and the 7 in the bunk tonight. So everybody does the 8/2 and 7/3 math in their head at 2 AM and hopes.

I made a scratchpad for that. It's a web app you add to your home screen. No ECM, no login, no carrier, no account, nothing leaves your phone.

What it does:

- **Split Lab** — sliders for break 1, drive, break 2. Tells you if the pair qualifies, what your 11 and 14 look like when you wake up, where the anchor lands, and — this is the part ELDs don't show — **what happens to you if you don't finish the second break.**
- **Recap** — 8-day grid. Type in your last 7 days, see what drops off at each midnight, and get a yes/no on "can I take this 1,200-mile load."
- **Clock-to-parking** — turns "2h15m left" into "you have 110 miles, park by 6:40, here's the 60/45/30-minute buffer lines."
- **Trip** — itinerary two ways, side by side: full 10-hour resets vs. sleeper splits, with arrival times. Breaks and rests placed where the rules force them.
- Adverse-conditions (+2h) and 16-hour short-haul day toggles, personal conveyance / yard move buttons, 60/7 or 70/8, carrier day-start hour.

The math is built from the actual CFR text and FMCSA's 2020 FAQ, not from blogs — and I found out along the way that several popular trucking sites have the split rule *wrong* (they say only the 7-hour period comes out of your 14; the reg and FMCSA say both do). That's exactly why I don't trust my own testing and want yours.

**I'm paying:** $10 for a filled-out test report comparing it to your ELD on a real day, $5 for every bug you're first to find. Rules and the report form are on the GitHub page linked from the app. If your ELD and my app disagree, I want to know either way — we'll look up the reg together.

What it is NOT: it is not an ELD, it's not registered with anybody, it doesn't log anything for you. It's the napkin, not the logbook.

Link: https://loricoestrellado-jpg.github.io/hos-sandbox/ — open in Chrome/Safari, "Add to Home Screen."

Built by one person. It's rough. Tell me where.

---

## Post 2 — Short form (Facebook driver groups, X/Twitter, Threads)

Made a free split-sleeper / recap / parking calculator for drivers. Not an ELD — a scratchpad. Sliders for "3-hour nap now, 7 in the bunk tonight, what do I wake up with?" Plus 70-hour recap forecast and miles-to-parking.

Need CDL drivers to break it. **$10 to compare it against your ELD on a real day, $5 per bug you find first.**

https://loricoestrellado-jpg.github.io/hos-sandbox/ — add to home screen. Nothing leaves your phone.

---

## Post 3 — Comment version (when someone in a thread asks the split question)

Not to hijack, but I built a free calculator for exactly this — sliders for the nap + the bunk time, shows your 11/14 after the pair completes and what happens if you skip the second break. Not an ELD, nothing to install, nothing leaves your phone: https://loricoestrellado-jpg.github.io/hos-sandbox/. I'm paying drivers $5 per bug right now because I don't trust my own testing, so if it disagrees with your ELD tell me.

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
