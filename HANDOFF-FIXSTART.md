# HANDOFF-FIXSTART — Fix "Fix the start time" Stall on Live Entries (BUG-2026-11-20)

**Workspace:** `/home/hatch/workspace/hos-patch/work-fixstart` (copy of deployed removals build, commit `ca38b6f` on `main`, matching `work-removals`).
**Date:** 2026-11-21
**Status:** Verified green across all lanes; **not pushed or deployed**.

---

## 1. Root Cause

Reproducing the flow across all four live statuses (`Driving`, `On Duty`, `Sleeper`, `Off Duty`) and a non-live (closed) Log entry in headless Chromium (`412×915`, `412×750`, `360×640`) and `domshim` uncovered **two interlocking defects** in the `SinceSheet` ("Fix the start time") flow (plus a `TimePicker` `change`-event compatibility gap):

### Defect 1 — Live Driving (`drivingView: true`, opened from Now via `Details` → `Fix the start time`): `SinceSheet` unmounted on apply and stalled on the already-saved time
- When the driver is **Driving** with the default `drivingView: true`, reaching Now requires tapping **Details**, which sets `peekSince = s.current.since` (`web/src/app.tsx`). `showsDrivingView(s)` checks `peekSince !== s.current.since`.
- Opening **Fix the start time** from Now mounts `<SinceSheet />` inside the normal-Now branch of `App` (child index 4 of `<div class="app">`).
- Picking a new start time `at` and tapping **`Set start to ...`** called `adjustStartNow(at)` + `setDone(at)`:
  1. `adjustStartNow(at)` saved `s.current.since = at` **without updating `peekSince`** (still the old `since`).
  2. On the next render, `peekSince !== s.current.since` flipped `showsDrivingView(s)` from `false` to `true`, switching `App` to its separate `DrivingView` return branch where `<SinceSheet />` sits at child index 2.
  3. Preact **unmounted** `<SinceSheet />` (wiping its local `done` state to `null`) and **mounted a fresh `<SinceSheet />`** initialized with `at = cur.since` (the **already-saved** new time).
  4. Because `at === cur.since`, `unchanged` evaluated to `true`: the sheet stayed open over `DrivingView` showing the new time already entered in the clock face and a **disabled** primary button reading **`"Pick the real start time"`** — with no confirmation message, no `"See my clocks"` button, and no forward exit except **`X`**. Pressing `X` closed the sheet and revealed the start time had already saved.
- Existing lanes never caught this because `adjuststart.mjs` tested `SinceSheet` on `ON` (`fieldDay()`) and set `drivingView: false` in `drivingDay()`, and `auditfix.mjs` tested `SinceSheet` on `ON` (`DAY`) and `OFF` (`D8`).

### Defect 2 — All four live statuses (`Driving`, `On Duty`, `Sleeper`, `Off Duty`) on realistic phone heights (`412×750`, `360×640`): the apply button vanished below the fold on every time pick
- `SinceSheet` computed `const confirm = absorbed.length > 0 || knock.length > 0 || effects.some((e) => e.bad)` and added `.ed-absorb` (`position: static`, disabling `position: sticky; bottom: 0`) whenever `confirm` was true.
- Because fixing the start time of a live entry **always** adjusts the immediately preceding entry's end boundary, `knockOnLines(...)` was non-empty on **every** routine time pick across all four statuses.
- On viewports shorter than ~850px (`412×750` Android Chrome → `.sheet` `clientH = 659px`, `scrollH = 751–812px`; `360×640` → `clientH = 562px`, `scrollH = 770–832px`), the sticky button at the bottom of the sheet (`Pick the real start time`) suddenly dropped out of sticky and vanished completely off-screen (`inSheetView: false, inViewport: false`) the moment the driver picked a time.

### Secondary compatibility note — `TimePicker` `change` event
- `TimePicker` (`<input type="time">`, shared across `ClockPick` callers) only listened to `onInput`. Adding `onChange` (guarded by `v !== null && v !== at`) ensures mobile pickers that emit `change` rather than `input` also update the draft time without double-firing.

---

## 2. What Changed (Files + Lines)

Only three source/test files changed vs. `work-removals` (zero CSS edits, zero `store.ts` edits, zero `engine/` edits):

### `web/src/app.tsx`
- **Lines 405–408 (`SheetKind`):** Extended `{ kind: 'since' }` to `{ kind: 'since'; done?: number }` so the confirmation minute lives in sheet state and cannot be wiped by any parent re-seat.
- **Lines 653–678 (`adjustStartNow`):** Detected `const wasPeeked = cur.current?.status === 'D' && peekSince === cur.current.since;` and called `setDrivingPeek(newSince)` before `undoable(...)` / `setState(...)` (both `absorb` and plain branches) so adjusting the start of the same Driving run does not flip `showsDrivingView(s)` or break the driver's Details peek.
- **Lines 2781–2854 (`SinceSheet`):**
  - Accepts `done = null` prop from `sheet.done` and calls `openSheet({ kind: 'since', done: at })` on apply (replacing local `useState` for `done`).
  - Passes `focusKey={done !== null ? 'done' : 'pick'}` to `<Sheet>` so focus lands cleanly on **`See my clocks`** when the confirmation view opens.
  - Updated the confirmation view heading to **`Start time fixed — {label} since {clock(done)}`** (with conditional adjacent-entry text via `statusBeingLeft(s)`).
  - Narrowed `confirm` on `SinceSheet` to `absorbed.length > 0 || effects.some((e) => e.bad)` so routine adjacent-boundary fixes keep `button.ed-go` sticky and visible inside the sheet viewport on all phone heights (`412×915`, `412×750`, `360×640`) across all four statuses, while genuine absorb / bad-HOS warnings still drop `button.ed-go` into `.ed-absorb` (`position: static` below the warning, preserving A1) and scroll the warning into view (`block: 'nearest'`).
- **Lines 3067–3076 (`undoLast`):** Preserves `peekSince` when undoing a Driving start-time adjustment while peeked (`u.before.current.status === 'D' && u.after.current.status === 'D' && peekSince === u.after.current.since`).
- **Lines 3461–3469 (`TimePicker`, shared by `ClockPick`):** Added `onChange` handler guarded by `v !== null && v !== at` alongside `onInput`. *Shared-component callout:* this applies wherever `ClockPick` is used (Log add/edit start & end, Fix the start time, Load check leave & appointment, Trip departure) and strictly improves compatibility on pickers that emit `change` instead of `input`, without altering draft/apply semantics anywhere.
- **Lines 6289 & 6351 (`App`):** Passed `done={sheet.done ?? null}` to `<SinceSheet>` in both the `DrivingView` and normal-Now render branches.

### `web/test/dom/adjuststart.mjs`
- **Lines 301–401:** Added 4 regression pins (`C8`–`C11`):
  - `C8`: Live Driving (`drivingView: true`, via `Details` peek) — apply shows confirmation + `See my clocks` (never stalls on disabled picker), keeps peek on apply and `undoLast()`.
  - `C9`: All four live statuses (`Driving`, `On Duty`, `Sleeper`, `Off Duty`) — picker does not apply before confirm; `X` without confirming leaves start unchanged; `change` event updates draft; routine fix keeps `ed-go` sticky (not `.ed-absorb`); confirm matches `store.ts` `adjustCurrentStart` oracle, shows confirmation + `See my clocks`, and closes cleanly.
  - `C10`: Driving via `DrivingView` → `I've stopped` → `Still Driving? Fix its start time` confirms and returns cleanly to `DrivingView`.
  - `C11`: Non-live (closed) entry on Log — `X` without saving leaves entry unchanged; `Save the change` saves cleanly.
- No existing pins needed re-aiming.

### `web/test/dom/auditfix.mjs`
- **Lines 701–816:** Added 45 real-browser pins covering BUG-2026-11-20:
  - Live Driving (`drivingView: true`, via `Details` → Now → `Fix the start time`) at `412×915` and `360×640`: apply affordance visible in sheet + viewport after picking time, `X` cancels without saving, applying saves + shows `Start time fixed — Driving since Fri 22:20` + visible `See my clocks` (no remount stall, no unexpected `DrivingView` snap), `See my clocks` closes cleanly back to Now.
  - All four live statuses (`Driving`, `On Duty`, `Sleeper`, `Off Duty`) at `412×750` (Android Chrome height) and `360×640`: visible enabled `Set start to ...` button inside sheet + viewport after picking time, `X` does not save, confirming saves exact minute + shows confirmation + visible `See my clocks`, closes cleanly.
  - Non-live (closed) entry on Log at `412×750`: visible forward button, `X` leaves entry unchanged, saving updates start and closes sheet.
- No existing pins needed re-aiming.

---

## 3. Before / After Flow Behavior

| Flow | Before | After |
| --- | --- | --- |
| **Live Driving (`drivingView: true`, `Details` → Now → `Fix the start time`)** | Picking a time dropped `Set start to ...` off-screen on ≤750px viewports (`412×750`, `360×640`). Tapping `Set start to ...` saved the time, broke `peekSince`, flipped `showsDrivingView` to `true`, remounted `SinceSheet`, wiped `done`, and left the sheet open with a disabled `"Pick the real start time"` button — only `X` exited. | Picking a time does **not** save; enabled **`Set start to <time>`** stays sticky and visible in-viewport on all screen sizes. Pressing **`X`** without confirming leaves the start time unchanged. Tapping **`Set start to <time>`** saves the exact same times, preserves the Details peek, and transitions to **`Start time fixed — Driving since <time>`** with a focused primary **`See my clocks`** button that closes cleanly back to Now (with updated clocks and 8s undo chip). |
| **Live On Duty / Sleeper / Off Duty (Now → `Fix the start time`)** | Picking any time triggered `knock.length > 0` → `.ed-absorb` (`position: static`), pushing `Set start to ...` off-screen below the fold on `412×750` and `360×640` viewports. | Routine adjustments keep **`Set start to <time>`** sticky and immediately visible in-viewport on `412×915`, `412×750`, and `360×640`; `X` cancels without saving; confirming shows **`Start time fixed — <Status> since <time>`** + **`See my clocks`**. Genuine absorb or bad-HOS warnings still drop the confirm button below the warning (A1) and scroll the warning into view. |
| **Live Driving (`DrivingView` → `I've stopped` → `Still Driving? Fix its start time`)** | Same off-screen button issue on ≤750px viewports. | Sticky **`Set start to <time>`** visible on all viewports; confirm shows **`Start time fixed — Driving since <time>`** + **`See my clocks`**; closing returns cleanly to `DrivingView`. |
| **Non-live (closed) entry (Log → entry → `The times are wrong`)** | Multi-step wizard (`WhenStep` → `LongStep` → `CheckStep`) with sticky `Next:` buttons and A1 `CheckStep` confirm. | Unchanged; pinned at `412×750` (`Next:` visible, `X` cancels without saving, confirm saves and closes). |

**Behavior note:** Applying remains **explicit on confirm** (picking a time in the clock picker never silently saves, and pressing `X` before confirming leaves `current.since` untouched). The hours math for adjusted entries is **byte-identical** (`store.ts` `adjustCurrentStart` / `absorbCurrentStart` and `engine/` are untouched).

---

## 4. Verification Results

### Pre-fix reproduction (new pins run against the unfixed removals build)
- `adjuststart` (on unfixed `app.tsx`): **FAIL** (`36 pass, 3 fail` — `C8` failed with `applying Fix-start broke DrivingView peek`, `C10` failed missing confirmation lead).
- `auditfix` (on unfixed `web/dist`): **FAIL** (`141 pass, 2 fail` — `BUG-2026-11-20 Driving [412x915]` caught the exact remount stall: `{"text":"Pick the real start time","disabled":true,"driveUp":true}` and missing `See my clocks`).

### Post-fix verification (run strictly one lane at a time)

| Suite | Command | Result |
| --- | --- | --- |
| Typecheck & Production Build | `cd web && npm run typecheck && npm run build` | **PASS** (exit 0; `dist/app.js` 273.2kb) |
| Full Smoke Gate (UTC) | `cd web && TZ=UTC npm run smoke` | **PASS** (exit 0): `typecheck` OK, `contrast` 44/44 day + 44/44 night, `nightlight` OK, `ocr-bundle` OK (2 passes), `smoke.mjs` OK, plus all 8 `npm run dom` suites: `yesback` OK, `c1flush` 6/6, `adjuststart` **39/39**, `scrub` 30/30, `c3` 46/46, `c3relaunch` 3/3, `logedit` 37/37, `cascade` 16/16 |
| Auditfix (Chicago, real Chromium) | `cd web && TZ=America/Chicago node test/dom/auditfix.mjs` | **PASS** (**184/184**, exit 0) |
| Polish (Chicago, real Chromium) | `cd web && TZ=America/Chicago node test/dom/polish.mjs` | **PASS** (**263/263**, exit 0) |
| Layout (Chicago, real Chromium) | `cd web && TZ=America/Chicago node test/dom/layout.mjs` | **PASS** (**354/354**, exit 0) |
| Revisions (Chicago) | `cd web && ./node_modules/.bin/esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**42/42**, exit 0) |
| Gemini (Chicago) | `cd web && ./node_modules/.bin/esbuild test/dom/gemini.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-gemini.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-gemini.mjs` | **PASS** (**20/20**, exit 0) |

---

## 5. Guardrail & Engine Hash Confirmation

- `git hash-object web/src/store.ts`: **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (unchanged, byte-identical to removals base).
- `engine/`: **zero changes** (`diff -rq ../work-removals/engine engine` returned empty).
- Changed source/test files vs. removals tree (`../work-removals`, excluding `node_modules`, `dist`, `dist-test`):
  - `web/src/app.tsx`
  - `web/test/dom/adjuststart.mjs`
  - `web/test/dom/auditfix.mjs`
- Added handoff: `HANDOFF-FIXSTART.md`.
- Build outputs (`web/dist/`, `web/dist-test/`) regenerated by `npm run build`, `npm run smoke`, and `esbuild`.
- Not pushed or deployed.
