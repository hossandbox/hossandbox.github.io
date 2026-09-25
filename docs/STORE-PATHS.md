# Which store first — the honest comparison

Written 2026-09-25, after Lorico asked "iOS has an easier barrier of entry, correct?" and noted the
MacBook runs Omarchy, not macOS. **Partly correct — and the half that isn't is the half that
decides the schedule.**

## The four barriers, scored separately

People say "easier" meaning one of four different things. They don't agree.

| Barrier | Google Play | Apple App Store |
|---|---|---|
| **Gate to publish** | **Hard.** Personal accounts need 12 testers opted in for 14 continuous days before you may even apply | **Easy.** No testers required. Submit and review directly |
| **Cost** | $25 one-time | **$99/year, recurring** |
| **Build machine** | Any OS (TWA builds fine on Linux CI) | **macOS + Xcode required** — but see below, this is solvable |
| **Acceptance** | Laxer — a TWA is an officially supported, first-class pattern | **Strict.** Guideline 4.2 rejects repackaged websites |

So: **Apple is easier to submit and harder to pass.** Google is the reverse.

## The Omarchy caveat is NOT a blocker

Building for iOS requires a macOS toolchain — but not a Mac *you own*. GitHub-hosted macOS runners
are **free and unlimited on public repositories** (macOS 3-core M1, 14 GB RAM, Xcode preinstalled)
and this repo is public. Source:
<https://docs.github.com/en/billing/concepts/product-billing/github-actions>

Enrolling in the Apple Developer Program also needs no Mac — web or the Apple Developer app, with
an Apple Account that has 2FA. Source: <https://developer.apple.com/programs/enroll/>

The existing handoff already names the same conclusion (Expo EAS Build or Codemagic "compile in the
cloud — no Mac needed"). So: **a Linux-only laptop is not the reason to pick one store over the
other.**

## The Guideline 4.2 problem is the real one — and it bites earlier than expected

Guideline 4.2: *"Your app should include features, content, and UI that elevate it beyond a
repackaged website."* The standard rejection wording: *"not sufficiently different from a mobile
browsing experience."* Source: <https://developer.apple.com/app-store/review/guidelines/>

A WKWebView wrapper around hossandbox.github.io is the textbook 4.2 rejection.

**The sting:** the *first* TestFlight build of an app is itself sent to App Review.
Source: <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/>

So on iOS you cannot even run an external beta of a thin wrapper. On Play, by contrast, you can put
a TWA in front of 12 testers regardless of how thin it is. **Apple's acceptance bar applies at the
beta stage; Google's does not.**

Passing 4.2 means building real native features first. For this product that is genuinely worth
doing — not checkbox work:

- **Live Activity / Lock Screen widget** showing hours remaining and the split countdown. A driver
  glances at the phone in a cradle without unlocking. Unambiguously "beyond a website," and
  genuinely useful in the cab.
- **Local notifications** — break due, drive window expiring, split leg complete.
- Offline behaviour is already there via the service worker.

That is weeks of engineering, and it cannot be tested on this box.

## The blocker nobody has mentioned: the test device

An iOS build can only be tested on an iPhone or iPad. **Lorico's phone is a Pixel 9 Pro XL
(Android).** Android he can test today, on the phone in his pocket, by installing the AAB or joining
the closed test. iOS he cannot test at all without an iPhone.

Worth confirming before committing to iOS-first — it is the one constraint that no amount of CI can
work around.

## Recommendation

Do not treat these as exclusive. The two tracks have opposite shapes:

- **Play's 14-day gate is passive.** It runs by itself while nothing else happens. Starting closed
  testing this weekend costs $25 and no engineering, and it completes on its own schedule.
- **iOS's 4.2 requirement is active engineering.** Native features must be designed, built and
  device-tested before the app can be submitted *at all*.

So the efficient order is **start the Play clock now and build the iOS native features in
parallel** — rather than parking Play for three weeks while doing iOS work. If iOS-first is still
preferred, the honest price is: real native features, an iPhone to test on, and $99/year, before
anything reaches a store.

## Open questions

1. Is there an iPhone available to test on? (Blocks iOS-first entirely if not.)
2. Play Console account: exists? personal or organization? created when?
3. Does $99/year recurring fit, given the Play route is $25 once?
4. Package id / bundle id to use — permanent once published.