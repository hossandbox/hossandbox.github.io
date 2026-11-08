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
