# HANDOFF-DISCLAIMER — Startup Disclaimer Pop-Up Patch

**Workspace:** `/home/hatch/workspace/hos-patch/work-disclaimer`  
**Date:** 2026-11-21  
**Status:** Verified green across all lanes; **not pushed or deployed**.

---

## 1. Files Changed

Zero CSS changes (`web/public/styles.css` already provides `.backdrop` and `.modal`), zero `web/src/store.ts` changes, zero `engine/` changes.

- **`web/src/app.tsx`** — Removed `HeaderDisclaimer` (the TopBar `"Planning only — not a log, not an ELD"` line and `Details` expander) from `TopBar`, removed unused `chooseTimeZone` import, added `DisclaimerDialog` (using existing `.backdrop`/`.modal` styles, verbatim More → About text, and a single `"Understood — don't show again"` button wired to `acknowledgeDisclaimer()`), and rendered it in `App` whenever `!s.disclaimerAcked` while marking background chrome `inert` and keeping sheets/`SpeakAskDialog` gated behind `!showDisclaimer`.
- **`web/test/smoke.mjs`** — Re-aimed the old header-disclaimer / non-blocking-C6 assertions (lines 837, 1291, 1615, 2621, 2780, 6073, 6275) to assert the new one-time startup modal on `disclaimerAcked: false`, absence of the old TopBar header line on Now, and reachability of `Home terminal time zone` under More → Rules.
- **`web/test/dom/c3.mjs`** — Re-aimed pin `M14e` to assert the TopBar `details.disclaimer-line` / `"Planning only — not a log, not an ELD"` header line is absent while `go=stopped` still opens immediately when `disclaimerAcked: true`.
- **`web/test/dom/revisions.mjs`** — Re-aimed pin `L1` (old header line absent on Now/Log/Plan/Split/More) and added 4 new DOM pins (`D1`–`D4`) covering fresh-state modal rendering with verbatim About text and single button, click-to-dismiss + `localStorage` persistence + reload absence, acked-state launch without modal or old header line, and More → Rules timezone-picker reachability.
- **`web/test/dom/layout.mjs`** — Re-aimed the `(f)` header check to assert `details.disclaimer-line` is absent on Now/Plan/More/Log with no empty header gap, and included `Understood` in the helper dismiss regex.
- **`web/test/dom/auditfix.mjs`** — Updated the `open()` dismiss locator to match `"Understood — don't show again"` and replaced the old C6 header-expander section with real-Chromium pins verifying fresh-launch modal (verbatim About text, single button, inert background, viewport fit at `412×915` and `360×740`), click dismiss + `localStorage` persistence + `page.reload()` non-reappearance, absence of the old TopBar header line on Now, and visibility/reachability of `Home terminal time zone` under More → Rules (while preserving the C1 read-aloud pins).
- **`HANDOFF-DISCLAIMER.md`** — Added this handoff report.

---

## 2. Timezone-Picker Finding

- **Case found:** `TimeZoneField` (`Home terminal time zone`) **already existed** in **More → Rules** (`SettingsTab` in `web/src/app.tsx`, inside `<Card title="Rules">`), alongside Cycle, Carrier day starts at, Short-haul, and Exceptions this shift.
- **Action taken:** Simply removed the duplicate `TimeZoneField` copy that lived inside the removed `HeaderDisclaimer` `Details` expander; the canonical picker stays untouched in **More → Rules** and is pinned as reachable in `smoke.mjs`, `revisions.mjs` (`D4`), and `auditfix.mjs`.

---

## 3. Verification Results (Full Gate)

All lanes ran and passed with exit code `0`:

| Lane | Command | Result |
| --- | --- | --- |
| Build + Typecheck | `cd web && npm run build` | **PASS** (exit 0; `tsc --noEmit` clean, `dist/app.js` 272.6kb) |
| Smoke (UTC) | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK (2 passes), `smoke.mjs` OK, `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Smoke (Chicago) | `cd web && TZ=America/Chicago npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK (2 passes), `smoke.mjs` OK, `dom`: `yesback` OK, `c1flush` 6/6, `adjuststart` 39/39, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Auditfix (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** (**185/185**, exit 0) |
| Polish (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/polish.mjs` | **PASS** (**263/263**, exit 0) |
| Layout (Chicago, Chromium) | `cd web && TZ=America/Chicago node test/dom/layout.mjs` | **PASS** (**354/354**, exit 0) |
| Revisions (Chicago, esbuild) | `cd web && ./node_modules/.bin/esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**46/46**, exit 0) |
| Gemini (Chicago, esbuild) | `cd web && ./node_modules/.bin/esbuild test/dom/gemini.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-gemini.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**, exit 0) |

### Pins Re-Aimed from Old Header-Line Behavior
- `web/test/smoke.mjs` (startup disclaimer, redesign 1, re-check N1, patch 7, patch 7.1, patch 19 B, C6): previously asserted `details.disclaimer-line` / `"Planning only — not a log, not an ELD"` in `TopBar` and no launch modal; updated to assert the one-time startup modal on `disclaimerAcked: false`, its absence on `disclaimerAcked: true`, absence of the old header line, and reachability of `Home terminal time zone` in More → Rules.
- `web/test/dom/c3.mjs` (`M14e`): previously asserted `details.disclaimer-line` in `TopBar`; updated to assert its absence.
- `web/test/dom/revisions.mjs` (`L1`): previously asserted `details.disclaimer-line` on Now only; updated to assert its absence on all tabs including Now.
- `web/test/dom/layout.mjs` (`(f)`): previously asserted `details.disclaimer-line` present on Now; updated to assert its absence on Now/Plan/More/Log.
- `web/test/dom/auditfix.mjs` (C6 section): previously expanded `header.top details.disclaimer-line`; updated to pin the new startup modal flow, reload persistence, absence of the old header line on Now, and More → Rules timezone-picker reachability.
- PDF log summary disclaimer footer (`PDF_DISCLAIMER`) and More → About card remain untouched and verified passing in `smoke.mjs`, `revisions.mjs`, and `layout.mjs`.

---

## 4. Engine Untouched Proof

- `git hash-object web/src/store.ts` **before**: `1323046db6ba07b8c85805f89a103dc16f3776b5`
- `git hash-object web/src/store.ts` **after**:  `1323046db6ba07b8c85805f89a103dc16f3776b5`
- `web/src/store.ts` is byte-identical; no new persisted state was added (uses existing `disclaimerAcked` and `acknowledgeDisclaimer()`).
