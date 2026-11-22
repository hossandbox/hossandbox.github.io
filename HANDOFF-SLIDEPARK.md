# HANDOFF — SLIDEPARK (slide-up "instant twin" fix)

Date: 2026-11-22. Tree: work-slidepark (base: work-retime). Author: Ada (patch author) — build executed on Lorico's MacBook lane; verified by Ada's Modal gate run 20261122-105401 (all lanes green, store hash byte-identical).

## Problem (reported by Lorico on the live app)
Opening a slide-up pop-up (seen on "Check against my ELD") showed TWO sheets: one appearing instantly at its final position, and a second sliding up a few milliseconds behind it, "bouncing" as they merged. The retime patch (300ms entrance) made no visible difference. Slide-down was always clean.

## Diagnosis
Frame-level inspection: the app creates exactly ONE sheet; the slide animation itself is clean (no bounce keyframes). The ghost is a pre-animation paint: before the entrance animation's first frame is composited, the sheet can be painted at its natural resting position (translateY(0)) for a frame, and the animated copy then slides up behind/over it. On close there is no equivalent leak, which is why the exit always looked perfect.

## Fix (styles.css only — 3 lines)
- `.sheet.slide-up` base state now carries `transform: translateY(100%)` — the sheet is parked one sheet-height below the viewport in its resting state, so any pre-animation paint happens off-screen. The entrance animation's fill holds it at translateY(0) while open; the closing animation already ended at the parked position.
- `@media (prefers-reduced-motion: reduce)`: the slide-up rule now also sets `transform: none` alongside `animation: none`, so reduced-motion users still get the sheet instantly at rest (not parked forever).

No app.tsx changes. No engine changes (store.ts hash 1323046db6ba07b8c85805f89a103dc16f3776b5, byte-identical).

## Pins
- layout.mjs: new pins lock the parked base state (translateY(100%) on `.sheet.slide-up`) — layout lane 392/392 on Modal (was 390).
- revisions.mjs: reduced-motion pin re-aimed to require `transform: none` together with `animation: none` — revisions 84/84. RT1 (retime split) still passes: entrance 300ms cubic-bezier(0.32, 0.72, 0.35, 1), exit 200ms ease-out, 220ms retained-exit unchanged.

## Gate
Modal run 20261122-105401: build ✓, smoke-utc ✓, smoke-chicago ✓, auditfix 185/185, polish 275/275, layout 392/392, revisions 84/84, gemini 20/20. GATE DONE, store hash exact.
