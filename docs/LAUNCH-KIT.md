# HOS Sandbox — Launch Kit

Free beta, paid App Store version later. All placeholders filled (URL, contact email). Ready to post.

---

## Beta rules (post these verbatim, or link to them)

**What you get**
- **$5 for every bug you're first to report and I confirm.** Cap $50 per driver; pool closes at $300.
- **The paid App Store version free when it launches** (a promo code — redeem within 30 days).
- The app is free to use now, during beta.
- **Never post a payment handle in a public issue.** When a bug is confirmed I comment on the issue;
  you then email your Venmo handle to hossandbox.app@gmail.com and I pay within 48 hours.

**What counts as a bug**
- The app's clocks disagree with the regulation (49 CFR 395.1(g) / 395.3) or with your ELD on the same inputs. *The ELD is not automatically right — if you think the ELD is wrong, say so and we'll check the reg together.*
- Crash, freeze, lost data, button that does nothing, text you can't read on your phone.
- Anything that would get a driver a violation if they trusted it.

**What doesn't count (still want it, no reward)**
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

**It's free while it's in beta** — and I'm asking for your eyes, not your money. $5 for every bug you're first to report and I confirm, plus the paid App Store version free when it launches. Rules and the report form are on the GitHub page linked from the app. If your ELD and my app disagree, I want to know either way — we'll look at the reg together.

What it is NOT: it is not an ELD, it's not registered with anybody, it doesn't log for you. It's the napkin, not the logbook.

Link: https://hossandbox.github.io/ — open in Chrome/Safari, "Add to Home Screen."

Built by one person. It's rough. Tell me where.

---

## Post 2 — Short form (Facebook driver groups, X/Twitter, Threads)

Every HOS calculator I found does one slice — recap only, or "do these two rests pair," or a $7/mo countdown timer. None of them model your *whole day* or tell you what happens if you don't finish the split.

So I built one. Free, no account, no GPS, nothing leaves your phone. Sliders for "3-hour nap now, 7 in the bunk tonight — what do I wake up with, and what am I sitting in if I bail on the 7?" Plus 70-hour recap forecast, trip planner that runs splits, and miles-to-parking with buffer lines. Current with FMCSA's July 2026 split guidance. Math is open source, tested against FMCSA's own examples.

Need CDL drivers to break it while it's free. **$5 per confirmed bug (first reporter), plus the paid App Store version free when it launches.**

https://hossandbox.github.io/ — add to home screen.

---

## Post 3 — Comment version (when someone in a thread asks the split question)

Not to hijack, but I built a free calculator for exactly this — sliders for the nap + the bunk time, shows your 11/14 after the pair completes *and* what you're sitting in if you skip the second break (that's the part other calculators leave out). Handles days with multiple breaks and the new July 2026 FMCSA guidance on 10-hour sleeper resets. Not an ELD, nothing to install, nothing leaves your phone: https://hossandbox.github.io/ — I want drivers to break it before it goes on the App Store, so it's $5 per confirmed bug plus the paid version free. If it disagrees with your ELD, tell me.

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

## Post 4 — Personal Facebook page (friends & family; the ask is "share with a driver you know")

Attach: `docs/screenshots/split-lab.png` and `docs/screenshots/trip.png` (phone screenshots of the live app).

---

Your draft, tightened — keeping your hook. "Has your ELD ever gone down and your supervisor said 'you gotta go on paper!'" is the strongest opener either of us has written: it names a moment every driver remembers. Four edits, all deliberate (explained below).

---

Hey guys — are you a trucker, or do you know one? Has your ELD ever gone down and your supervisor said, "you gotta go on paper!"? Send this to them.

Ask any trucker and they'll tell you HOS compliance is constant background stress. Federal rules say how many hours you can drive, how long your workday can be, and how much rest you need — and the rules for "splitting" your sleep into two chunks are so confusing that drivers argue about them on forums every single day. The device in the truck records what you *did*. It doesn't tell you what happens if you take a 3-hour nap now and sleep 7 hours tonight. Guess wrong and you're either stuck at a truck stop with hours you didn't know you had, or in violation looking at a fine.

So I built a free tool that answers the "what if." You slide the bars — nap here, drive this long, sleep this long — and it shows what your clocks look like when you wake up, whether the split is legal, and how many miles you can cover before you have to be parked. No account, no subscription, no tracking. It runs on your phone.

**It's called HOS Sandbox: https://hossandbox.github.io/**

To be clear: this is not a legal paper log and it's not an ELD. When your ELD is down, you still have to do your paper RODS the way your carrier requires. This is the scratchpad you use to *plan* the day — what your hours look like before you commit to them.

Here's the favor. I'm one person, and I built this by reading the actual federal regulations on top of driving for a living. Before I put it on the App Store I want real drivers to try to break it. It's free while it's in beta, and anyone who's first to report a confirmed bug gets **$5 and the paid version free** when it launches.

Found a bug? Use the "Report a bug" link in the app. **Please don't post your payment info publicly** — I'll reply on your report once I confirm it, and you can send me your Venmo handle privately. 🚛

---

**What I changed and why:**
- **"include your Venmo creds!" → removed.** Never collect payment handles in a public post or issue. Venmo exposes the account holder's real name, anyone can send a payment *request* against a handle, and you'd be publishing a list of drivers' identities tied to your app. The safe flow — now in the README, the issue form, and the app — is: report publicly → I confirm → handle emailed privately to hossandbox.app@gmail.com → paid within 48 h. ("Creds" also means passwords; asking for credentials in a post reads like phishing.)
- **"driving for UPS" → "driving for a living."** Naming your employer while promoting a personal product is exactly what corporate social-media policies exist to catch, and you have a pension and a possible buyout in play. Same credibility, no exposure. Check the policy if you'd rather name them.
- **Added the paper-log disclaimer.** When an ELD fails, §395.34 puts the driver on paper RODS. This app can't satisfy that, and a driver who thinks it does is in real trouble. One line protects both of you.
- **"send this github link" → the app link.** Drivers want the app, not a repository. GitHub reads as techy to a Facebook audience; the app URL installs to a home screen in two taps.

---

**Shorter variant (if the long one feels like too much for your page):**

Hey guys — trucker, or know one? Has your ELD ever gone down and your supervisor said "you gotta go on paper!"? 🚛

I built a free tool for the question no logging device answers: "if I nap 3 hours now and sleep 7 tonight, what do my hours look like tomorrow?" Slide the bars, see your clocks, see how far you can go before you have to park. Free, no account, nothing tracked. (It's a planner, not a legal paper log — your paper RODS are still your paper RODS.)

https://hossandbox.github.io/

Know a CDL driver? Send it to them. It's free while it's in beta, and the first to report a confirmed bug gets $5 and the paid version free. Tag them below. Thank you!

---

Tips for the personal page:
- Post the long version once with both screenshots; use the short one if you re-share in a week.
- Reply to every comment from a driver with the same line: "Thank you — the report form is the 🐞 button in the app."
- If a friend asks "what's an HOS?": Hours of Service — the federal driving-time rules.
- When someone reports a bug in the comments, move it to GitHub (or ask them to) so it's tracked; never ask for payment details in the thread.

---

## Modmail (send before posting on r/Truckers)

Hi mods — I'd like to post about a free split-sleeper/recap calculator I built (web app, not an ELD, no account, no ads, no data collection). It's in free beta and I'm asking drivers to test it against their ELDs and report mismatches; the first person to report a confirmed bug gets the paid App Store version free when it launches. No money changes hands. I know this brushes against the promotion rules — happy to post it however you prefer (weekly thread, flair, no link in the body, whatever works). Draft is below. Thanks for the community.

---

## Where to post, in order

1. **r/Truckers** (after modmail) — largest, most skeptical, best bug reports.
2. **r/TruckDrivers**, **r/CDL**, **r/Trucking** — same post, adjust the first line.
3. **TruckersReport forums** (Trucking Industry Regulations → Hours of Service board) — old-school, deeply knowledgeable about the reg, will catch legal-edge bugs.
4. **Facebook groups** — "Truckers Who Get It," "OTR Truck Drivers," regional groups. Short form.
5. **r/AlphaAndBetaUsers**, **r/BetaTestersNeeded** — low-value for drivers but zero risk.
6. Skip TikTok/YouTube until you have a 30-second screen recording of the Split Lab; then that's your best channel.

## Cost of the beta

**Cash reward: $5 per confirmed bug**, first reporter only, cap **$50 per driver**, pool closes at
**$300**. Plan on 10–25 confirmed bugs = $50–125; the cap is what keeps it bounded. Pay by Venmo
within 48 hours of confirming — and only after the reporter emails their handle to
hossandbox.app@gmail.com. Never collect a handle from a public post or issue.

**Non-cash reward:** the paid app free at launch (promo code, redeem within 30 days). Keep the
founders list under **100** — Apple's promo-code limit per app version — and don't promise "free
forever"; promise the code and the window, which is what you can actually deliver.

Real costs: the $5s above, plus the Apple Developer Program ($99/yr) when you're ready to ship.

## Pricing & the App Store path (decide before launch)

**Recommended: free download + one-time $9.99 unlock.** Split Lab free forever; Recap, Trip planner,
parking buffers, exception toggles and offline mode behind one non-consumable in-app purchase.
Why: free downloads rank better and collect reviews, drivers hate subscriptions, and the app has no
server costs — so one-time pricing is sustainable. Apple takes 30%; apply to the **Small Business
Program** (15%) since you're under $1M/yr.

**Alternative: paid app at $7.99.** Simpler, but fewer installs and no free tier to convert.

**Don't: subscription.** HOS Guard charges $6.99/mo or $99 lifetime and drivers complain about it
everywhere. A subscription on a static calculator reads as a money grab.

**Before you can ship:**
1. **Apple Developer Program, $99/yr.** Required, and also required for TestFlight — so a real
   "beta download" is a step that comes *after* the dev account, not before. The free beta today is
   the web app.
2. **A build.** You have no Mac, but you don't need one: Expo EAS Build or Codemagic compile iOS in
   the cloud. The engine ports as-is (pure TypeScript, zero deps); rebuild the UI in React Native,
   or wrap the existing one with Capacitor.
3. **Guideline 4.2 — the real risk.** A thin wrapper around a website gets rejected for "minimum
   functionality." The iOS app must add what the web can't: offline-first storage, local
   notifications for clock/break deadlines, a home-screen widget, share-sheet export. Plan those
   before you wrap.
4. **Decide what the web becomes at launch.** Keep it as **Lite** (Log + Split Lab) or the free web
   version cannibalizes every sale. This is why the beta copy says "free while it's in beta."
