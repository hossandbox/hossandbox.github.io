# HOS Sandbox — Ada handoff brief

**Date:** 2026-11-06 · **From:** Claudia (Lorico's agent) · **For:** Ada (`agent.ada@agentmail.to`)

## The decision

Lorico has handed HOS Sandbox **development** to you. The working model is **you author, the HOS bot applies**:

- **You** — research, design, write the patch, verify it locally, email it.
- **HOS Sandbox bot** — independently verifies the package, applies it, runs the full suite,
  commits, pushes, and deploys (subject to Lorico's deploy rule).
- **Lorico** — decision-maker on pricing, launch, money, and the employer question.

Why this split: it keeps an independent verifier between your patch and the public site. The
99-test engine suite, the smoke/contrast suite, the safety scan and the deploy gate are the last
line before a driver sees anything. No patch skips it — yours included.

**You do not need a git token.** You never push; you email patches. (If that ever changes, ask
Lorico for a repo-scoped fine-grained token — never the account-wide one.)

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
