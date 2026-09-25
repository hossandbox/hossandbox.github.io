# Google Play release plan

Written 2026-09-25. This is a plan, not a promise — the schedule is set by a Google policy gate,
not by how fast the code moves. Read §1 first; it changes what "this weekend" can mean.

## 1. The gate that decides the date

Google requires that **new personal** Play developer accounts run a **closed test with at least
12 testers opted in continuously for the last 14 days** before the developer can even *apply* for
production access. Production and Pre-registration stay disabled in Play Console until then.

Source: <https://support.google.com/googleplay/android-developer/answer/14151465>

Details that matter:

- It applies to **personal** accounts created **on or after 2023-11-13**. Organization accounts
  (registered with a D-U-N-S number) are outside it — but a D-U-N-S number can take ~30 days, so
  that escape hatch is slower than the test window, not faster.
- The 14 days must be the **most recent, unbroken** 14 days at the moment of applying. The clock
  starts when the **12th** tester opts in. Falling below 12 restarts it.
- Opting in is not enough on its own: production access is a **reviewed questionnaire** about how
  the test ran, what feedback came back and what changed. Vague answers get bounced and restart the
  clock. **Recruit 15–18 testers** so ordinary attrition never drops below 12.
- Every new app needs its own fresh test. Testers do not carry over between apps.

**Consequence:** a public production launch is not achievable in one weekend on a personal account.
Realistic shape: **weekend = account + closed test live and testers opted in**, then
**~3 weeks total** to production (14 continuous days, then the application, then review).

## 2. What only Lorico can do

These are account/identity/payment decisions. I cannot and should not do them.

1. **Confirm whether a Play Console account already exists**, and if so: personal or organization,
   and the creation date. This single answer decides the timeline above.
2. **Register** if needed — $25 one-time — and complete **identity verification** (can take days).
   He pays; I never touch payment details.
3. **Recruit 15–18 testers** (Google accounts, email addresses). His driver network is the asset
   here. They must click the opt-in link *and* use the app during the window.
4. **Decide**: application/package id (e.g. `io.github.hossandbox.app` — permanent once published),
   the store listing's category, and the support email to publish as the privacy-policy contact.

## 3. Technical path

The product is a PWA. The standard Play route is a **Trusted Web Activity (TWA)** — a thin native
shell that renders the existing site full-screen with no browser chrome.

**Build the AAB in GitHub Actions, not on this box.** This container has no JDK and no Android SDK,
~480 MB free RAM, and Gradle on 2 GB is a bad bet. The repo is **public**, so GitHub-hosted runners
are free and ship with the Android toolchain. A workflow can build and sign the release bundle and
upload it as an artifact. (Alternative: PWABuilder generates a signed AAB in the cloud; also fine,
but the Actions route keeps everything in the repo and reproducible.)

Requirements the TWA brings:

- **Digital Asset Links.** The site must serve
  `https://hossandbox.github.io/.well-known/assetlinks.json` containing the app's signing
  key SHA-256, or Android shows the URL bar and the app fails the "no browser chrome" expectation.
  This file cannot be written until the keystore exists — order: generate keystore → get
  fingerprint → publish assetlinks → then test.
- **Keystore + Play App Signing.** Generate a release keystore; enroll in Play App Signing so
  Google holds the app-signing key. **The keystore is not committed to the repo.** Losing it (or
  the upload key) is the classic unrecoverable mistake — it must be backed up somewhere durable.
- **Target API level** — Play requires new apps to target a recent API level; Bubblewrap's current
  template does this, just do not pin an old one.
- The manifest already has `display: standalone`, 192 and 512 icons — good. Fixed 2026-09-25:
  `background_color`/`theme_color` were still the night palette while the app default is now day,
  which would have splashed a dark screen onto a light UI.

## 4. Store listing requirements (not optional)

- **Privacy policy URL** — mandatory for every app. Simple and honest here: the app stores
  everything on the device, has no accounts and transmits nothing. The policy must say that and be
  reachable at a public URL.
- **Data safety form** — declare no data collected/shared (verify against the built app; the export
  is a local file the driver shares himself).
- **Content rating questionnaire.**
- **Store listing**: title, short description (80 chars), full description, 512×512 icon,
  1024×500 feature graphic, and **phone screenshots** (minimum 2). Screenshots need a real render —
  the browser harness is currently down on this box (Chromium killed by memory pressure), so these
  are a genuine gap to close before submitting.
- **App content declarations** (ads: none; target audience: adults).

## 5. Honesty constraints that carry over

These are standing rules, not preferences:

- **Never claim the app is an ELD, FMCSA-registered, or a legal paper log.** The store listing and
  the app's About screen must say what it is: a planning scratchpad. When an ELD fails, §395.34
  still requires the driver's own paper RODS.
- **Never name the employer** anywhere in the listing or promo copy. The author is "one person who
  drives for a living."

## 6. What I can do before Lorico is back

- [x] Fix the manifest palette mismatch and gate it in `contrast.mjs`
- [ ] Draft the privacy policy (device-local data, no collection) — needs the support email
- [ ] Draft store listing copy under the §5 constraints
- [ ] Scaffold the TWA project + GitHub Actions workflow that builds and signs the AAB
- [ ] Add a `.well-known/assetlinks.json` scaffold with the fill-in step documented
- [ ] Screenshots — blocked until a browser is available again

## 7. Open questions

1. Play Console account: exists? personal or organization? created when?
2. Package id to use (permanent).
3. Support/privacy contact email to publish.
4. Is a ~3-week path acceptable, or should we look at the organization/D-U-N-S route?