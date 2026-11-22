# HANDOFF — SLOWSLIDE (slide-up entrance 300ms → 450ms)

Date: 2026-11-22. Tree: work-slowslide (base: work-slidepark). Author: Ada — presentation-only timing change (skips Opus per the Nov 21 pipeline rule); verified by Ada's Modal gate.

## Why
Lorico confirmed on his phone (2026-11-22 ~11:54 CT) that the slidepark build fixed the double pop-up — "it's working now" — and asked for the entrance to be slowed down more. The retime patch had set 300ms; he wants a more deliberate glide.

## Change (styles.css only, 2 declarations)
- `.sheet.slide-up`: `animation: sheet-slide-up 300ms …` → **450ms**, same fill.
- `.sheet-wrap.slide-up > button.sheet-backdrop`: `sheet-backdrop-in 300ms` → **450ms** (backdrop stays paired with the sheet, as RT1 requires).
- **Curve changed too** (added 2026-11-22 ~12:05 CT on Lorico's battery-saver evidence): cubic-bezier(0.32, 0.72, 0.35, 1) → **cubic-bezier(0.33, 0.35, 0.25, 1)** on both entrance declarations. Rationale: the old curve is heavily front-loaded (~⅔ of travel in the first third), which at his phone's full 120Hz reads as an instant pop plus a second settling slide; in battery saving (60Hz, throttled) the same entrance looked right, and Ada's 60Hz-class desktop capture was clean. The new curve starts gently (initial slope ≈ 1.06 vs 2.25), does its travel mid-flight, and lands softly. If a literal static twin still survives this build on his phone, the next step is a visibility-gated entrance rebuild — this build is the discriminator.
- Exit untouched: sheet-slide-down / sheet-backdrop-out stay 200ms ease-out; the 220ms retained-exit lifecycle is unchanged (Lorico has always judged the slide-down perfect).
- The slidepark base-state park (`transform: translateY(100%)`) and the reduced-motion `transform: none` are unchanged.
- Header comment updated to say 450ms.

## Pins re-aimed (no pin weakened — same assertions, new constant)
- revisions.mjs RT1: title + sheet/backdrop entrance regexes now require 450ms; exit/keyframe/reduced-motion assertions unchanged.
- revisions.mjs N4: the two entrance regexes now require 450ms; exit regexes unchanged.
- layout.mjs: six COMPUTED-style assertions re-aimed — the lever/drift/combined slide pins read the live animation via getComputedStyle and asserted `animDur === '0.3s'` + the old timing string; they now assert `'0.45s'` + cubic-bezier(0.33, 0.35, 0.25, 1) for both sheet and backdrop. Descriptive labels updated to match (450ms / 0.45s / new curve). Exit assertions ('0.2s', ease-out) untouched.

No app.tsx changes. No engine changes (store.ts hash must remain 1323046db6ba07b8c85805f89a103dc16f3776b5).
