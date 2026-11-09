# HOS Sandbox — Ada handoff brief

**Date:** 2026-11-06 · **From:** Claudia (Lorico's agent) · **For:** Ada (`agent.ada@agentmail.to`)

## The decision

Lorico has handed HOS Sandbox **development** to you. The working model was **you author, the
HOS bot applies**; it changed on 2026-11-07 (Lorico's decision, below).

- **You** — research, design, write the patch, verify it locally.
- **HOS Sandbox bot** — independently verifies the package, applies it, runs the full suite,
  commits, pushes, and deploys (subject to Lorico's deploy rule).
- **Lorico** — decision-maker on pricing, launch, money, and the employer question.

Why this split: it keeps an independent verifier between your patch and the public site. The
99-test engine suite, the smoke/contrast suite, the safety scan and the deploy gate are the last
line before a driver sees anything. No patch skips it — yours included.

**You do not need a git token.** You never push; you email patches. (If that ever changes, ask
Lorico for a repo-scoped fine-grained token — never the account-wide one.)

## Lane update — 2026-11-07 (Lorico's decision)

The lane above is superseded for pushing and verification:

- **Ada pushes** via the Muse GitHub connector — OAuth under Lorico's own GitHub identity,
  the Muse GitHub App scoped to this repository only, every write individually approved.
  There is no token. Lorico's per-deploy go remains the gate; only the hands changed.
- **Opus (Claude Code, Lorico's Pro plan) verifies at checkpoints** — after the record-writing
  feature groups and in a final adversarial pass — instead of per-patch bot verification.
- **Claudia's bot lane is retained as fallback**, unchanged, until Lorico says otherwise.
- First deploy under the new lane: **Patch 9 + 9.1 + 9.2** ("Check against my ELD"), deployed
  2026-11-07 — source commit `27dac51`, gh-pages `a612baf`, live app.js sha256
  `209fe22934ba5b853d950b3c7348f1baf1fc87f84cda977769fc016686ba2a3d`. The originally
  bot-verified Patch 9 package was held and never deployed (two defects found on independent
  re-verification); 9.1/9.2 are its corrections.

## The product, in one paragraph

A driver's planning scratchpad for FMCSA hours-of-service: split-sleeper "what if", 70-hour recap
forecast, trip planning, clock-to-parking. It is **not** an ELD, not FMCSA-registered, not a legal
paper log; when an ELD fails, §395.34 still requires the driver's own paper RODS. Never write copy
that implies otherwise.

## Where everything lives

| Thing | Location |
|---|---|
| Repo (PUBLIC) | `github.com/hossandbox/hossandbox.github.io` |
| Live app | https://hossandbox.github.io/ |
| Branches | `main` = source · `gh-pages` = built site (both live) |
| Rule bible | `docs/RULES-GROUNDING.md` |
| Bot manual | `docs/BOT-HANDOFF.md` |
| Launch kit | `docs/LAUNCH-KIT.md` |
| Engine | `engine/` — pure TypeScript, zero deps. **99 tests must pass before anything ships.** |
| App | `web/` — Preact PWA, relative asset paths, GitHub Pages at the root |

## The patch contract — include all of this

The bot verifies each item before applying:

1. **Base commit** your patch was built against (it refuses if `main` has moved).
2. A **`git apply`-able diff**, plus full unhunked copies of every touched file.
3. **sha256 of the zip**, quoted in the email (the bot checks it).
4. **`git diff --stat <base>..<yours>`** so the file set is unambiguous.
5. **Test deltas** — engine suite count before/after, smoke + contrast result, build result.
6. **Falsification** — at least one mutation that makes your new test FAIL (proves it bites).
7. A short **handoff note** — what changed, why, and any caveat the bot cannot verify itself.

## Scope fences (don't cross without an explicit ask)

- `engine/` rule math — no number moves without a test that fails before and passes after.
- Pricing, launch, App Store, Capacitor/native work — Lorico's calls.
- Marketing copy must not name Lorico's full name or employer.

## The deploy rule (current as of 2026-11-06)

- Channel is **AgentMail** (no Tailscale drop folder).
- Deploys are Lorico's call. A deploy go from you that **names his approval** is treated as his
  authorization and relayed without a second confirmation. A go that does **not** name it is held
  — that would be out of policy.
- Every relayed deploy go produces a one-line heads-up to Lorico.
- Whatever ships gets an entry in `docs/BOT-HANDOFF.md`.

## State at handoff

- All three of your patches are **live and independently verified**:
  `#1 dd9af40` (declutter) → `#1.1 87aa008` (dial stop-by stack + Why dates) → `#2 da17fb9`
  (smoke guards the stack).
- Engine 99/99 · smoke clean · contrast 44/44 in both themes.
- **Open on your side:** the phone-width check for #1.1, and the suites re-check for #2.

Send patches to this thread — the bot and I both watch it.

— Claudia

## CI deploy lane (added 2026-11-08)

Deploys now build in GitHub Actions from main (`.github/workflows/deploy.yml`) and publish
gh-pages automatically; connector pushes remain text-only. The OCR corpus PNG fixtures are
generated artifacts kept locally (regenerate via `web/tools/make-ocr-corpus.py`).

## Patch 13 — deployed 2026-11-08 (day-done wrap + Now quick-row removal)

- **Item A — "End my day":** one tap on Now (real records only, never the demo clock) closes
  the open segment at the tap minute, opens OFF, and records a per-carrier-day close bookmark.
  The bookmark is honoured only while no later same-day work exists **and** no Driving/On-duty
  time runs at or across the close; "Your last 8 days" shows `Day closed <time>` for honoured
  days — the bookmark labels the day, it never feeds the totals. Reopen clears today's bookmark
  only; the whole tap is one undoable action. Malformed bookmarks are dropped at save-load, never
  poisoning the record.
- **Item B:** the Now quick-row "Plan a split" shortcut is removed (button, empty row, and its
  dead CSS). The split planner itself is untouched and stays in the Plan hub.
- **Verification arc:** Opus Verify-13 returned **FAIL** on Item A — the first validity rule only
  saw rows starting strictly *after* the close, so same-minute work, straddling rows, a stale
  bookmark over an imported record, and an out-of-day close timestamp all slipped through. A fix
  round applied Opus's prescribed widened rule verbatim; **Delta-13 PASS** (124 original probes +
  61 new repros, new pins bite, 13/14 mutations caught — the survivor errs in the safe direction;
  engine 99/99, smoke/contrast/typecheck/build green). Item B passed Verify-13 directly.
- **Standing note:** deleting the only post-close row can re-honour a bookmark. That is the
  undo-equivalence, stated precisely: after such a delete the log is byte-identical to the moment
  of closing, so the label reads the log as it stands. (This corrects the earlier local handoff
  wording, which implied the equivalence covered more than undo.)

## Patch 14 — deployed 2026-11-08 (Split Lab: pinned now-vs-after line + example split)

- **Item A — pinned line:** a strip at the top of the Split Lab, sticky while the driver
  scrolls or drags sliders, reading `Your 14 ends <T1> now → <T2> with this pair` — or
  `with this plan (no split credit)` when the engine does not confirm a pair. "Try an
  example split" (**Item B**) loads the worked `DEFAULT_SPLIT` into the draft only; the
  log and tentative rows are untouched. Item B passed verification unchanged.
- **Verification arc:** Opus Verify-14 returned **FAIL** on Item A. The first build
  computed each window end as `anchor + window`, which understates the end whenever a
  paired rest lies *after* the anchor — paired rests are excluded from the 14, so they
  push the real end later by their length. Every error was early (the safe direction),
  but the line contradicted the pair-status card directly below it by up to 7 hours,
  and in the FAQ 22 reset-as-first-leg shape it claimed a pair while showing no
  movement at all. **Fix round:** both derivations are now `asOf + limits.window −
  windowUsed` (identically `anchor + window + excluded`); the headline pin was
  re-seeded 540 → 960; new pins cover the merged-reset no-credit shape, an active pair
  with an empty draft, and the FAQ 22 reset-as-first-leg shape; wording-guard
  mutations M1/M4/M7, which previously passed every pin, are now caught.
  **Delta-14 PASS** — Opus's 13-scenario probe table renders the engine figure on
  14/14 rows; engine 99/99, smoke/contrast/typecheck/build green.
- **Design follow-ups (cosmetic, not blockers):** at 320 px width or ~110% text zoom
  the header grows and can cover the strip's first line; while driving with ≤60 min
  of drive time left, the alert banner can park the strip entirely under the header.
  Only the strip itself is ever hidden. Suggested remedy for the design patch: set a
  measured `--top-h` from a ResizeObserver on the header.

## Patch 15 — deployed 2026-11-08 (break-test safety bundle)

- **Source:** Opus's adversarial break-test of the shipped Patch-8 tree (12 confirmed
  breaks + 7 leads; the engine's rule math itself held under fuzz — every break lived
  in the record-keeping around it). Ten breaks plus Lead 4 (unvalidated stored undo)
  were still live on the Patch-14 tree and are fixed here; breaks #2 and #3 were
  already fixed by Patches 9.2 and 9.3 and were independently re-confirmed. Leads
  1, 2, 3, 5, 6, 7 are deliberately left out (interpretation/product questions, not
  defects).
- **Break #1 (Recap "set" overwrote live driving):** generated Recap rows are now
  stamped below the live status's stamp, so filler can never outrank the live span.
  Opus independently re-derived the disputed figure: the declared work honestly
  joins the live shift (600 min used, **60 left**) — the report's 180 was the
  optimistic reading. A later fix round pinned the RecapTab wiring itself (the one
  mutation that had survived with all suites green).
- **Break #5 (simulated-clock writes persisted into the real record):** the Testing
  clock now quarantines the record. **Verify-15 FAILED the first build** — the
  snapshot guarded only four write paths, and the Split Lab commit, the quick-start
  seed, Log edits, drift fill, Recap set and import all slipped past it (one repro
  left drive-left at 360 instead of 60 after "Use real clock"). **Fix round 15.1**
  moved the snapshot to the clock-set edge in `setState` itself, covering every
  write path by construction; **round 15.2** completed the snapshot (`seededAt`,
  `tzChosen`) and pinned the within-episode re-set property (Opus's F3b mutation
  previously survived the whole suite; it now fails first at the new pin).
- **Break #12 (engine, under the fence):** a future what-if row no longer absorbs a
  trailing unlogged gap into a fresh reset — `restPeriods` flushes the running rest
  when a tentative row closes the gap. Test written first and shown red; a
  3,000-record differential fuzz found no clock optimistic against the no-plan
  reference and log-only records unchanged.
- **Also fixed:** status taps before the open status are refused (strict `<`
  boundary; the same-minute tap still lands, per Patch 13); load/import validation
  now runs the sanitizers on every path, drops non-string notes, and rejects
  timestamps the engine cannot date — `dateable` keeps a **400-day margin** inside
  the JS Date limit (Verify-15 found values within ~8 days of the raw limit still
  froze the app); a wrong-shaped save with no usable backup starts clean instead
  of loading the rejected save; fractional minutes render rounded once ("3h 60m"
  is gone); a seeded record's Load verdict no longer claims a from-zero basis.
- **Verification chain:** Verify-15 (PASS with #5 failed) → fix 15.1 → **Delta-15
  PASS** → tidy 15.2 → **Delta-15B PASS** ("ready to deploy, no remaining
  defects"). Engine suite is now **105 tests** (99 + 6 new); smoke/contrast/
  typecheck/build green at every step.

## Patch 16 — deployed 2026-11-09 ("Night & Glance" design polish)

- **Source:** Opus's design brainstorm for the tired-trucker-at-3-a.m. lens
  (`DESIGN-BRAINSTORM-16.md`); Lorico approved Opus's recommendations across the
  board (decisions D1–D11, all the recommended options) plus sanctions **S1**
  (dark-safe shell), **S2** (collapsed two-zones line) and **S3** (status-tap undo
  owns the single undo slot). Engine untouched — byte-identical to the Patch 15
  tree; the contrast gate stays 44/44 in both themes.
- **The 14 steps, in build order:** one duration format everywhere (`dur()`);
  type roles with a 12 px floor and the trust list moved to a 15 px / 600 /
  full-colour `.trust` role; "The rules pair these two breaks" wording + press
  states on everything tappable; the load verdict rebuilt as a **sign** (border +
  left bar + ✓/✕, no full-panel tint flood — night luminance measured down from
  157×/87× background to ~2–3×/~6×); the Yes verdict names its rest plan;
  **hero-first Now** (notices collapse into a trust strip under the hero; the
  two-zones warnbox becomes a one-line chip that re-opens if either zone
  changes); the **trust ring** — the dial's arc carries the record basis (solid =
  from your log, dashed = estimate, hollow = demo), which is what makes the
  collapsed notices honest; End my day as a plain key below the grid with undo on
  Now; the Split Lab strip offset is now a **measured `--top-h`** (ResizeObserver
  on the header — the Patch 14 follow-up, closed); warnings gain shape (⚠ glyph +
  left bar; On duty stays amber per D3-A); **hazard stripes** frame the
  out-of-time state in both themes, with a new automated `web/test/nightlight.mjs`
  check (light budget + Machado 2009 colour-vision separation) wired into the
  smoke script; **status-tap undo** — an 8-second "On Duty since … · Undo" chip
  above the dock (S3: newest change owns the slot); a **dark driving screen at
  night** device setting (default on, 19:00–07:00 phone time, driving view only);
  and the **dark-safe shell** — a synchronous boot script in `index.html` decides
  the theme exactly as `effectiveTheme()` does before first paint, so a cold
  launch never flashes light at night.
- **Extra A — voice-privacy honesty (Patch 11 follow-up):** the shipped speech
  recognition never requested on-device processing, and Chrome's default
  `webkitSpeechRecognition` sends audio to Google's servers. The panel copy now
  says so plainly: "Your voice is turned into text by your browser's speech
  service — in Chrome the audio goes to Google. Only this does that; your log
  never leaves this phone."
- **Verification arc:** Opus **Verify-16 returned FAIL** with six small defects,
  each prescribed: the estimate ring rendered solid (round line caps filled the
  dashes) with the word "estimate" missing; the two-zones re-open pin was
  timezone-fragile (green under UTC, red under America/Chicago — the suite is
  now always run under Chicago time); `--top-h` was measured once on the
  mount-time header and went stale after the driving view; nightlight's CVD step
  used non-Machado gamma-space matrices and left the verdict icon unguarded; the
  boot script ignored the dark-driving rule, so a cold launch while Driving at
  night painted a light first frame; and the hero number had 0.3 px of slack
  with no `nowrap`. **Fix round** lifted Opus's own proven fixes plus the
  endorsed **N2 re-wording** (the "a stale undo must change nothing" guard now
  protects the status tap's own undo, per S3) and one Trip trust-class line.
  **Delta-16 PASS** — delta audit exact, probes green (boot-vs-app 27/27 under
  both timezones), all prescribed mutations red at their pins, suites green
  under Chicago and UTC, engine byte-identical.
- **Still open (Pixel-only):** dark-room / colourblind-simulator pass, a filmed
  cold launch (dark, light, and Driving-at-night), the Split strip at 320 px /
  Large font / driving banner, the estimate ring at arm's length, and the
  360×640 two-notice dock clearance. Next in the locked queue: spoken driving
  alerts (M3) as their own patch, then the final Opus UI audit capstone.

## Patch 17 — deployed 2026-11-09 ("Read It To Me" — spoken driving alerts, M3)

- **What it is:** the M3 item from the design brainstorm (§3), governed by
  decision **D7-A** (Lorico, 2026-11-09): the app asks **once** before it ever
  speaks — "Want the alerts read out loud?" / [Yes, say them] / [No thanks] —
  raised on the first real Driving tap, and that tap itself speaks nothing.
  Either answer is remembered; a settings switch, **"Read driving alerts out
  loud"** (shown only where `speechSynthesis` exists), also records the answer.
- **What speaks:** the driving alerts at the existing 60/30/15/0 marks are read
  aloud through the already-shipped `speakAloud` path (cancel-before-speak, so
  a newer alert supersedes a stale one), composed from the **same evaluation
  the screen shows** — no limit is ever recomputed for the voice. A Driving
  status tap speaks its confirmation from the post-tap record. A new
  time-to-words helper (`numWords`/`clockWords`/`durationWords` in
  `alerts.ts`) renders times and durations as spoken ("five forty", "twelve
  oh five", "one hour one"). No speech recognition anywhere in this patch;
  nothing speaks on load except the pre-existing zero-on-open alert for an
  already-opted-in driver at 0 left (see N1); sim-clock time never speaks and
  never asks.
- **Consent safety:** `speakAlerts`/`speechAsked` live in the existing state
  object (no new storage keys; out of export, import, and the sim snapshot)
  and count only as literal booleans in `parseSaved` — a damaged or older
  save repairs to **off and un-asked**, never to a phantom yes.
- **Verification arc:** Opus **Verify-17 returned FAIL** on **F1**: a
  back-dated Driving tap ("15 min ago") spoke a drive-left evaluated at the
  back-dated instant instead of now — optimistic by exactly the back-date
  (the Patch 14 failure class, in the voice a driver trusts without looking).
  The fix evaluates the post-tap record at **now**. **F2:** `parseSaved`
  could leave `speakAlerts: true` beside a non-true `speechAsked`, showing
  the switch ON while the app stayed silent and re-asked — repaired with
  `if (speechAsked !== true) speakAlerts = false`. **F3:** a pin now fences
  that OFF/SB/ON first taps never open the D7-A question (mutation M6 red).
  **N1:** the build handoff's "nothing speaks on load" claim was corrected —
  a cold open speaks only the zero alert, and only for an opted-in driver at
  0 left; pinned. Everything else passed hard: consent held in every
  corrupted state probed, alert-mark numbers matched Opus's independent
  oracle across 90 fuzzed days, the words table passed, and the two
  effect-gated wirings were exercised in a real DOM. **Delta-17 PASS** —
  delta audit exact (3 source files + smoke), F1's three repros speak
  exactly the screen's figures in the DOM under both timezones, suites green
  under Chicago and UTC, engine byte-identical.
- **Residual R1 (non-gating):** the consent-Yes suite pin is source-level;
  the behavioural proof lives in Opus's DOM `yesback` case. Adopting that
  case into the suite is the recommended **first item of a later patch**.
- **Still open (phone-only):** voice intelligibility over road noise, chime
  timing/clipping, Bluetooth/car-audio routing, the ask dialog's feel — and
  Chrome's user-activation rule may hold the spoken zero alert on a cold
  open until the first tap (the screen still shows it). The Patch 16
  Pixel-only list also remains open. Next in the locked queue: the final
  Opus UI audit capstone.

## Capstone Item 0 — deployed 2026-11-09 (yesback DOM lane + CSS token aliasing)

- **What:** the first step of the capstone Refine path (audit §4, decisions
  C0-A/C10-A, sanction **S12**). Two parts, **no app behaviour change**:
  (0a) Opus's DOM `yesback` case — the behavioural proof for Patch 17's
  spoken-alert consent Yes-path, until now living only in the verifier's
  scratch harness (residual **R1**) — is adopted into the suite as
  `web/test/dom/` (`domshim.mjs` + `yesback.mjs`, yesback phase only) and
  runs as part of `npm run smoke` via the new `dom` script, so CI exercises
  it on every deploy; (0b) `styles.css` spacing/radius values are aliased
  to `--s-*`/`--r-*` custom properties (one `html { }` token rule after the
  `@font-face` block; values inside test-pinned rules left literal), plus
  the two stale theme comments (audit S-2) rewritten — comments only.
- **Proof of invisibility:** the before/after stylesheets are
  **computed-equivalent** — identical (selector, property, value) multiset
  after token substitution, verified independently by the builder and by
  Opus. No source file under `web/src/` or `engine/` changed; the served
  app bundle is Patch 17's, modulo the build stamp.
- **Verification:** Opus **Verify-I0 OVERALL PASS, no defects** — assembly
  matches the audit spec exactly, the DOM lane is green under Chicago and
  UTC and across repeat runs, mutation M8b now goes red in the DOM lane
  with the predicted symptom (closing R1's guard gap), M8/RF1 still red at
  their pins, contrast 44/44 both themes, engine 105/0.
- **Next:** capstone C1 "Timeline" (TimeAxis lanes + STOP wall + lever
  chips), its own build → verify → deploy cycle.
