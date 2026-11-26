# HANDOFF — Clock 14 `drivers1fix2`

**Scope:** Root-cause and fix the single Modal `auditfix` failure (`193/194`, `locator('.warnbox button').filter({ hasText: /Use real clock/ }).first()` timing out after 30,000 ms in the `Drivers1fix P2` real-browser section). Work performed exclusively in `/home/lae/hos-build/work-drivers1fix2`.

---

## 1. Root Cause (Plain Statement)

The pin at `web/test/dom/auditfix.mjs:782` used an unscoped locator:

```js
await p.locator('.warnbox button', { hasText: /Use real clock/ }).first().click();
```

while the app was on **Now** (`section.page-now.is-active`).

By design (`web/src/app.tsx:12500–12502`, `12700–12747`), the horizontal scroll-snap strip (`<main class="pages">` with `scroll-snap-type: x mandatory`) keeps all three strip panels mounted side by side plus the hidden Settings room, mounting `{warnbox}` inside all four persistent `<section>` panels in DOM order:

| DOM index | Panel | `inert` | `aria-hidden` | Bounding rect (412×915, `chrome-headless-shell`) | `elementFromPoint` hit |
| ---: | :--- | :---: | :---: | :--- | :--- |
| **0** | `section.page-plan` | **`true`** | **`true`** | `{ x: -386, y: 167, w: 127, h: 56 }` (off-screen left) | `null` |
| **1** | `section.page-now.is-active` | `false` | `false` | `{ x: 26, y: 167, w: 127, h: 56 }` (on-screen) | `BUTTON.mini` (self) |
| 2 | `section.page-log` | `true` | `true` | `{ x: 438, y: 430, w: 127, h: 56 }` (off-screen right) | `null` |
| 3 | `section.page-settings` | `true` | `true` | `{ x: 26, y: 167, w: 127, h: 56 }` (`visibility: hidden; pointer-events: none`) | `BUTTON.mini` (Now's, not Settings') |

Unlike every other panel locator in `auditfix.mjs` (lines 275, 325, 381, 425, 475, 903, 935 — all scoped to `.page.is-active`), line 782 omitted `.page.is-active` / `section.page-now.is-active`. As a result, `.first()` **never targeted the visible button on Now** — it always targeted **DOM index 0**: the off-screen, `inert`, `aria-hidden="true"` copy inside `section.page-plan`.

### Why it failed on Modal while passing locally (by accident)

When Playwright attempts `.click()` on the `inert`, off-screen button in `section.page-plan`, hit-testing immediately fails because Chromium ignores `inert` subtrees in `elementFromPoint()`:

```text
  - waiting for locator('.warnbox button').filter({ hasText: /Use real clock/ }).first()
    - locator resolved to <button class="mini">Use real clock</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <main class="pages">…</main> intercepts pointer events
    - retrying click action
```

(In `modal-auditfix-fail.log` line 119, lines 3+ of this Call log were clipped because `auditfix.mjs:68` truncates error stacks with `.split('\n').slice(0, 3)`.)

Locally (with `playwright-core 1.62.1`, `/usr/bin/chromium 155.0.8059.84`, and `chrome-headless-shell 151.0.7922.34`), clicking the `inert` Plan button **only succeeded by fluke** (~340–370 ms at 1× CPU, ~886 ms at 12× CPU throttling):
1. Playwright's `DOM.scrollIntoViewIfNeeded` yanked `main.pages.scrollLeft` horizontally from `412` (Now) to `0` (Plan).
2. Hit-testing failed with `<main class="pages">…</main> intercepts pointer events` because `section.page-plan` was still `inert`.
3. During Playwright's retry backoff, `app.tsx`'s `onPagesScroll` 120 ms `stripSettle` timer fired, treated the scroll as a user swipe to Plan, switched `tab` from `'now'` to `'plan'`, and removed `inert` from `section.page-plan` — silently landing the test on `section.page-plan.is-active` instead of `Now`.

In Modal's `chrome-headless-shell` / Playwright environment, clicking an `inert` off-screen element inside a `scroll-snap-type: x mandatory` container never completes that accidental swipe-and-un-inert recovery (e.g., scroll-snap fighting `scrollIntoView` / font metrics placing the inline button in the right half of `page-plan` so `scrollIntoView` snaps `main.pages` back to `scrollLeft = 412`, or Playwright/Chromium rejecting `inert` actionability), causing the 30,000 ms timeout. We confirmed locally that shifting the inline button's horizontal wrap position causes `scrollIntoView({ inline: 'start' })` to snap `main.pages` back from `0` to `412` mid-retry.

---

## 2. Which Layer Was Fixed and Why

**Fixed layer:** The pin (`web/test/dom/auditfix.mjs:782`), **not** the app.

```diff
-    await p.locator('.warnbox button', { hasText: /Use real clock/ }).first().click(); await wait(p, 250);
+    await p.locator('section.page-now.is-active .warnbox button', { hasText: /Use real clock/ }).click(); await wait(p, 250);
```

**Why this is the right layer:**
- Mounting `{warnbox}` on each strip panel while marking inactive panels `inert` and `aria-hidden="true"` is intentional to the DESIGN-NAV horizontal snap-strip architecture (`app.tsx:12696–12720`). Removing `inert` from off-screen panels would be an accessibility regression; unmounting `{warnbox}` from adjacent panels would cause the banner to pop in after a swipe settles instead of travelling cleanly with each panel.
- On the active panel (`section.page-now.is-active`), the real `"Use real clock"` button has zero overlap, zero animation/transition gating, `inert === false`, `inViewport === true`, and `document.elementFromPoint` hits `BUTTON.mini` directly.
- Scoping the locator to `section.page-now.is-active .warnbox button` (and removing `.first()`, enabling Playwright strict mode) makes the pin actually test what a user taps on Now — with full real-pointer actionability checks (no `{ force: true }`, no raised timeout, no retries, no JS `.click()`).

---

## 3. Impact on a Real Driver Tapping "Use real clock" on a Slow Phone

**No — this root cause cannot affect a real driver tapping "Use real clock" on a slow phone.**

A real driver on Now can only tap the visible button inside `section.page-now.is-active`; they can never tap the off-screen `inert` copy in `section.page-plan` at `x < 0`.

To confirm there is no hidden render-timing, overlap, or animation-gating issue on slow phones right after PIN unlock, we tested clicking `section.page-now.is-active .warnbox button` with **0 ms extra wait** after `section.page-now.is-active` mounted, under **1× and 12× CDP CPU throttling**, at both **412×915** and **360×640**, on both browsers:

| Browser | Viewport & CPU | Pre-click (`inViewport`, `isSelfHit`, `inert`) | Click latency | Post-click (`panel`, `scrollLeft`, `nowOverride`) |
| :--- | :--- | :--- | ---: | :--- |
| `chrome-headless-shell` 151 | 412×915 @ 1× | `true`, `true`, `false` | 144 ms | `page-now.is-active`, `412`, `null` |
| `chrome-headless-shell` 151 | 360×640 @ 1× | `true`, `true`, `false` | 88 ms | `page-now.is-active`, `360`, `null` |
| `chrome-headless-shell` 151 | 360×640 @ 12× | `true`, `true`, `false` | 565 ms | `page-now.is-active`, `360`, `null` |
| `chrome-headless-shell` 151 | 412×915 @ 12× | `true`, `true`, `false` | 486 ms | `page-now.is-active`, `412`, `null` |
| `/usr/bin/chromium` 155 | 412×915 @ 1× | `true`, `true`, `false` | 183 ms | `page-now.is-active`, `412`, `null` |
| `/usr/bin/chromium` 155 | 360×640 @ 1× | `true`, `true`, `false` | 117 ms | `page-now.is-active`, `360`, `null` |
| `/usr/bin/chromium` 155 | 360×640 @ 12× | `true`, `true`, `false` | 641 ms | `page-now.is-active`, `360`, `null` |
| `/usr/bin/chromium` 155 | 412×915 @ 12× | `true`, `true`, `false` | 582 ms | `page-now.is-active`, `412`, `null` |

In every case the button was immediately in-viewport, non-inert, directly hit-testable, cleared `nowOverride` cleanly, and kept the driver on Now without any strip jump.

---

## 4. Mutant Evidence & What the Pin Still Asserts

**Mutant tested:** Temporarily changed `useRealClock()` in `web/src/app.tsx:899` from `return { ...restore, nowOverride: null };` to `return { nowOverride: null };` (so clicking `"Use real clock"` still cleared the simulated clock banner and `hos-sandbox-v1-sim`, but failed to discard the simulated-clock status write), rebuilt `web/dist`, and ran `auditfix.mjs` under `chrome-headless-shell`.

**Result (`194 pass, 1 fail — AUDITFIX FAIL`):**
```text
FAIL Drivers1fix P2 (real browser): simulated-clock quarantine survives hard reload and Use real clock discards sim writes  — {"simBeforeReload":{"simKey":true,"curStatus":"ON"},"simAfterReload":true,"afterRealClock":{"nowOverride":null,"curStatus":"ON","segCount":1,"simKey":false},"simSetup":{"segCount":0}}
```

The mutant was then reverted and `web/src/app.tsx` was verified byte-identical to its starting SHA-256 (`9e08edf3cdb5348283c99175094354769fbfa44437d3d460023f8d6a06bd3ec5`).

**What the fixed pin still asserts:**
1. Simulated clock can be armed via Settings → Testing (`datetime-local`) and a simulated `On Duty` tap writes `hos-sandbox-v1-sim` and updates `current.status` to `'ON'`.
2. After a full `page.reload()` + Startup Splash + PIN unlock (`4321`), `hos-sandbox-v1-sim` is still present.
3. Exactly one visible, non-inert, unobstructed `"Use real clock"` `.warnbox button` exists inside `section.page-now.is-active` and responds to a real Playwright pointer click (strict mode, no `force`).
4. Clicking it clears `nowOverride` to `null`, deletes `hos-sandbox-v1-sim`, restores Marcus's pre-sim status (`'SB'`), and restores `segments.length` to `simSetup.segCount` (`0`).

---

## 5. Verification Suite Counts (All Run Sequentially in Foreground)

Environment: `HOS_PLAYWRIGHT=/home/lae/.hermes/hermes-agent/` (`playwright-core 1.62.1`), `/usr/bin/chromium` (`155.0.8059.84`), and `chrome-headless-shell` (`/home/lae/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`, `151.0.7922.34`).

| # | Suite | Browser / TZ | Result |
| ---: | :--- | :--- | :--- |
| 1 | `npm run build` | Node (`tsc --noEmit` + `build.mjs`) | **PASS** (`dist/app.js` 656.8 kb) |
| 2 | `npm run smoke` | `TZ=UTC` (contrast + nightlight + ocr-bundle + `smoke.mjs` + all 18 `dom` suites incl. `myweek` 19/19, `drivers` 11/11, `drivers-relaunch` 6/6) | **PASS** |
| 3 | `npm run smoke` | `TZ=America/Chicago` (same full suite) | **PASS** |
| 4 | `revisions` (`test/dom/revisions.mjs`) | `TZ=America/Chicago` (Node DOM) | **89/89 PASS** |
| 5 | `gemini` (`test/dom/gemini.mjs`) | `TZ=America/Chicago` (Node DOM) | **20/20 PASS** |
| 6 | `contrast` (`test/contrast.mjs`) | Node | **44/44 day, 44/44 night, 44/44 wind-down PASS** |
| 7 | `nightlight` (`test/nightlight.mjs`) | Node | **OK** |
| 8 | `auditfix` (`test/dom/auditfix.mjs`) | `/usr/bin/chromium`, `TZ=America/Chicago` | **195/195 PASS (`AUDITFIX OK`)** |
| 9 | `auditfix` (`test/dom/auditfix.mjs`) | `chrome-headless-shell`, `TZ=America/Chicago` | **195/195 PASS (`AUDITFIX OK`)** |
| 10 | `lebrowser` (`test/dom/lebrowser.mjs`) | `/usr/bin/chromium`, `TZ=America/Chicago` | **252/252 PASS (`LOGEDIT BROWSER OK`)** |
| 11 | `polish` (`test/dom/polish.mjs`) | `/usr/bin/chromium`, `TZ=America/Chicago` | **295/295 PASS (`POLISH OK`)** |
| 12 | `layout` (`test/dom/layout.mjs`) | `/usr/bin/chromium`, `TZ=America/Chicago` | **421/421 PASS (`LAYOUT OK`)** |

---

## 6. Guardrail Confirmations & Flagged Observations

- **`engine/` byte-identical:** aggregate SHA-256 confirmed via `find engine -type f | LC_ALL=C sort | xargs sha256sum | sha256sum`:
  ```text
  0949296e6d02b6ce368e33e02e194426ef2b10c58fc4afc7c191f0fc6797208d
  ```
- **App source & storage keys unchanged:** `web/src/app.tsx` SHA-256 `9e08edf3cdb5348283c99175094354769fbfa44437d3d460023f8d6a06bd3ec5` (unchanged); no other `web/src/` or `web/public/` files modified; storage keys unchanged. Only `web/test/dom/auditfix.mjs` (line 782, 1-line fix) was edited, plus fresh `web/dist` and `web/dist-test` build outputs.
- **Flagged (not fixed, out of scope):** `web/test/dom/auditfix.mjs:68` formats section exceptions with `String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')`, which truncates Playwright's multi-line Call log right after `- waiting for locator(...)` and hides the actual actionability diagnosis (`locator resolved to ...`, `intercepts pointer events`, etc.). Expanding that slice in a future cleanup would make remote CI failures immediately self-diagnosing.
