# HOS Sandbox

**Open the app: https://hossandbox.github.io/** — in Chrome or Safari, then *Add to Home Screen*.

A driver's **planning scratchpad** for FMCSA hours-of-service: split-sleeper "what-if" lab,
60/70-hour recap forecaster, trip feasibility, clock-to-parking. Not an ELD. No ECM, no
FMCSA registration, no carrier reporting, no account. Everything stays on your phone.
Property-carrying drivers, 49 CFR Part 395.

> HOS Sandbox is a planning scratchpad. It is not an ELD, is not FMCSA-registered, and does not
> replace your record of duty status. Your official log and your carrier's ELD govern.

## Bug bounty

Testing by real CDL drivers, paid. **Open an issue** with the *Bug report* template (the in-app
🐞 button pre-fills it).

- **$10** for a completed test report comparing the app to your ELD on a real day — one per
  driver, first 20 drivers. Use the bug-report form and fill in *what the app showed* vs *what
  the ELD showed*, even when they match.
- **$5 per confirmed bug**, first reporter only, cap $50 per driver. Bounty pool closes at $400.
- Paid by Venmo within 48 hours of confirmation. When your issue is confirmed I'll comment on it and
  tell you where to send your Venmo handle — **don't post payment handles in issues.**

**Counts as a bug:** clocks that disagree with 49 CFR 395.1(g)/395.3 or with your ELD on the same
inputs (if the ELD is the one that's wrong, you still get paid — we'll look at the reg together);
crashes, lost data, dead buttons, unreadable text; anything that would earn a violation if trusted.

**Not paid (still wanted — use the *Suggestion* template):** feature requests, wording, colors,
duplicates, and the known gaps below.

**Known gaps — don't report these:** property-carrying US interstate rules only (no passenger,
Canada, Alaska, oilfield); the trip planner's split option pairs with a rest you already have or
an off-duty stop you plan — it won't invent a short break; adverse-conditions and 16-hour-day
toggles are honor-system; it's a web app, not on the app stores yet.

## Layout

```
engine/   Pure TypeScript rules engine. Zero dependencies. This is the product.
  src/types.ts        Segment / RulesConfig / limits / result types
  src/timeline.ts     normalize, rest periods (7h *consecutive* SB), shift split at ≥10h rests
  src/shift.ts        split-sleeper chain enumeration + FMCSA-preferred ranking, 30-min break
  src/cycle.ts        carrier-day arithmetic (tz + day start hour), 60/7 & 70/8, 34h restart, forecast
  src/availability.ts evaluate(): current clocks, binding limit, mustStopBy, violations; safeHaven()
  src/trip.ts         greedy trip planner (10h resets, 30-min breaks, recap waits, 34h fallback)
  test/engine.test.ts 19 tests incl. FMCSA worked examples — `npm test`
web/      Preact PWA (mobile-first). Imports the engine directly.
  src/store.ts        localStorage state, time helpers
  src/app.tsx         Log / Split Lab / Recap / Trip / Settings
  build.mjs           esbuild → dist/ (42 KB)
  server.mjs          static server :8776 (tailnet only; Tailscale serve → https :8777)
  test/smoke.mjs      renders every tab server-side — `npm run smoke`
docs/
  RULES-GROUNDING.md  the verified regulatory basis; read before touching engine logic
  user-outline.txt    Lorico's original UI/algorithm outline
```

## Run

```bash
cd engine && npm test                     # rules engine
cd web && npm run build && npm run smoke  # UI bundle + render smoke test
node server.mjs                           # serves dist/ on :8776 (watchdog cron keeps it alive)
```

Phone: https://hermes-vps.tail49c89e.ts.net:8777 (Tailscale). Add to home screen.

## Engine design in one paragraph

Duty segments are integer minutes since epoch. The record is split into **shifts** at every rest
≥10h. Within a shift, every rest ≥2h is a candidate split leg; the engine enumerates all
**chains** r1<r2<…<rk where consecutive pairs qualify (one leg ≥7h consecutive SB, both ≥2h,
sum ≥10h) and evaluates compliance under each, then picks per FMCSA's FAQ: fewest / least severe
violations, tie → most available time forward. Under a chain, the 11/14 anchor is the shift start
until the first pair completes, then the end of the first rest of the latest completed pair; all
chain rests are excluded from the 14. **Violations are "as planned"** (a tentative future rest
retroactively excludes its partner, as FMCSA evaluates finished records) but **clocks at `asOf`
are strict** (nothing is credited until the pair completes). `noSplit` is always returned so the
UI can show "if you skip Break 2, you're in violation by X".

## Roadmap

- v1 (now): Split Lab, Recap, Trip (10h-reset and split strategies side by side), Clock-to-parking,
  adverse-conditions and 16-hour-day exceptions, PC / yard move, in-app bug report — PWA over Tailscale
- v1.1: public hosting for the bounty (GitHub/Cloudflare Pages); driver-feedback fixes
- Skipped deliberately: passenger-carrier rules (different window structure), Canada/Alaska/oilfield
- v2: 150 air-mile geofence (needs location permission + background) — deliberately deferred
- App Store: wrap with Capacitor or port UI to React Native/Expo; engine ports unchanged
