# Handoff: Clock-Picker Fix for "When to roll & PTA" (`RolloutTab`)

Date: 2026-11-21
Workspace: `/home/hatch/workspace/hos-patch/work-rollout`

## 1. Files Changed

- `web/src/app.tsx`
  - Imported `resolveWallDateTime` and `formatWallDateTime` from `./rollout.ts` (already exported; `rollout.ts` untouched).
  - Added `{ kind: 'rollouttime'; apptDate: string; apptTime: string; entryZoneName: string; entryTimeZone: string; fallbackMinute: number | null; onApply: (date: string, time: string) => void }` to `SheetKind`.
  - Updated `openRolloutPlanner(false)` to close an open `rollouttime` sheet if the driver leaves the sub-screen.
  - Added `RolloutTimeSheet` modeled on `LoadTimeSheet`, rendering `<Sheet title={\`Appointment (${k.entryZoneName})\`}>`, a zone label line (`Wall-clock time in ${k.entryZoneName} time.`), `<ClockPick at={at} set={setAt} now={pickerNow} future={true} say="Appointment" name="Appointment time" keys={KEYS_HOURS} />` (`anyDay` left at its default `true`), and an always-enabled `<button class="primary wide ed-go">` Apply button (`Apply · ${clockFull(at)} (${k.entryZoneName})`).
  - Replaced the two raw `<input type="date">` and `<input type="time">` controls in `RolloutTab` with a tappable `button.rowbtn` (`data-rollout-appt-btn="1"`) showing `plan.appointment.apptText` (and `plan.appointment.homeText (home)` when `!plan.sameZone`), opening `RolloutTimeSheet`. Kept the appointment facility time-zone `<select>`, entry-zone mode buttons, `apptDate`/`apptTime` state model, `planRollout` call, and `applyEarliestAppt` recovery completely unchanged.
  - Mounted `<RolloutTimeSheet>` in `App` when `!showDisclaimer && sheet?.kind === 'rollouttime' && s.tab === 'plan' && rolloutOpen`.
- `web/test/dom/revisions.mjs`
  - Updated existing pins `R2` and `R4` to drive the appointment through the `ClockPick` sheet instead of the removed raw `<input type="date">` / `<input type="time">` controls.
  - Added pins `R6`–`R9` covering all four required test cases.
- `web/dist/*` (rebuilt via `npm run build`).

## 2. Wall-Clock Conversion & Null Fallback

### Conversion approach
`RolloutTab` keeps `apptDate` (`YYYY-MM-DD`) and `apptTime` (`HH:MM`) as wall-clock strings in the active entry zone (`entryTz = entryZoneMode === 'local' ? apptTz : s.config.timeZone`), resolved by `planRollout` in `rollout.ts`.

Inside `RolloutTimeSheet`, `ClockPick` renders and parses epoch minutes using JavaScript local `Date` methods (`clock()`, `toInput()`, `atClock()`, `dayChips()`, `pickDate()`), which always operate in `deviceTz` (`Intl.DateTimeFormat().resolvedOptions().timeZone` from `store.ts`). Therefore `RolloutTimeSheet` bridges wall strings and `ClockPick` epoch minutes through `deviceTz` using `resolveWallDateTime` and `formatWallDateTime` from `./rollout.ts`:

- **Picker "now" for day chips**:
  ```ts
  const nowWall = formatWallDateTime(now, k.entryTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  ```
- **Sheet initial state**:
  ```ts
  const parsed = resolveWallDateTime(k.apptDate, k.apptTime, deviceTz);
  ```
- **On Apply**:
  ```ts
  const wall = formatWallDateTime(at, deviceTz);
  k.onApply(wall.date, wall.time);
  openSheet(null);
  ```

Note on `deviceTz` vs `s.config.timeZone`: whenever the phone/runtime is in the home terminal zone (e.g., `TZ=America/Chicago` with home zone `America/Chicago`), `deviceTz === s.config.timeZone` identically. Using `deviceTz` guarantees the exact wall-clock round-trip (`wall_stored -> at -> ClockPick display -> user picks wall_picked -> at' -> wall_saved === wall_picked`) ALSO holds when `deviceTz !== s.config.timeZone` (e.g., a Chicago-based driver currently in Pacific/Eastern time, or CI running under `TZ=UTC`).

### Null fallback chosen
If `resolveWallDateTime(k.apptDate, k.apptTime, deviceTz)` returns `null`:
1. If `k.fallbackMinute !== null` (`plan.validInput` was true), convert `k.fallbackMinute` into wall strings in `k.entryTimeZone` via `formatWallDateTime`, then resolve into `deviceTz` via `resolveWallDateTime`.
2. Otherwise (when `apptDate`/`apptTime` is unparseable and `plan.validInput` is false), fall back to `nextHour(pickerNow)` — current entry-zone wall time rounded up to the next whole hour.

## 3. Tests Added / Changed (DOM lane: `web/test/dom/revisions.mjs`)

### Existing pins updated (only those encoding the removed raw inputs)
- **`R2`** (*cross-zone timezone toggle: 08:00 Eastern (local) vs 07:00 Central (home terminal) yields identical dual-displayed roll-out, 08:00-10:00 sweet spot & PTA*): replaced direct writes to `input[aria-label="Appointment date"]` / `input[aria-label="Appointment time"]` on `planPg` with `setRolloutAppt(...)` driving the `ClockPick` sheet (`[data-rollout-appt-btn="1"]` -> `input.ed-day-input` + `input.ed-clock-input` -> `button.ed-go`). All assertions (`okDual && okSweet && okPta && okSame`) are unchanged.
- **`R4`** (*infeasible run: shows plain message, hides impossible checklist & PTA, one-tap shift recovers*): replaced direct writes to the old raw date/time inputs with `setRolloutAppt(planPg, '2026-11-12', '10:00')`. All assertions are unchanged.

No other existing pins were modified, weakened, or deleted.

### New pins added
- **`R6`** (requirement a): Asserts the rollout screen has zero `<input type="time">` or `<input type="date">` elements of its own (`planPg` and `root` both 0 when closed; `planPg` remains 0 while the sheet is open); ClockPick's internal sanctioned inputs (`1× type="time"`, `1× type="date"`) appear only inside the open `.sheet` and disappear on close.
- **`R7`** (requirement b): Asserts tapping `[data-rollout-appt-btn="1"]` opens `.sheet` naming the active entry zone (`Eastern`) in the title and body, containing `ClockPick`'s 4 `.ed-days` day chips, `.ed-clock` big `<output>` + `input[type="time"][aria-label="Appointment time"]`, both `.ed-keys` preset rows (`+ 1 hour` / `− 1 hour` and `−15` / `−5` / `+5` / `+15`), `"Another day"` (`input.ed-day-input`), and an always-enabled `button.ed-go` Apply button; verifies tapping `+ 1 hour` advances the big clock from `08:00` to `09:00`.
- **`R8`** (requirement c):
  - Cross-zone (`America/Chicago` home, `America/New_York` entry): sets `2026-11-12` + `08:00` in the sheet and taps Apply; asserts stored strings are `'2026-11-12'` and `'08:00'`, resolved appointment reads `Thu Nov 12, 08:00 Eastern` and `Thu Nov 12, 07:00 Central` (both on the appointment button and Step 4 arrival), and reopening the sheet displays `2026-11-12` / `08:00`.
  - Same-zone (`America/Chicago` home and entry): sets `2026-11-12` + `09:30` and taps Apply; asserts stored strings are `'2026-11-12'` and `'09:30'`, resolved appointment reads `Thu Nov 12, 09:30 Central`, and reopening the sheet displays `2026-11-12` / `09:30`.
- **`R9`** (requirement d): Triggers an infeasible run (`2026-11-12 10:00`), taps recovery `"Use earliest workable appointment"`, and asserts the stored `apptDate`/`apptTime` fields update (`2026-11-12 12:36`) and reopening the `ClockPick` sheet reflects the exact recovered date and time.

## 4. Local Verification Results

| Check | Command | Result |
|---|---|---|
| Typecheck | `cd web && npm run typecheck` | **PASS** (exit 0) |
| Build | `cd web && npm run build` | **PASS** (exit 0; `dist/app.js 329.1kb`) |
| Revisions DOM lane (Chicago) | `cd web && ./node_modules/.bin/esbuild test/dom/revisions.mjs --bundle --platform=node --format=esm --jsx=automatic --jsx-import-source=preact --define:__BUILD__='"dom"' --outfile=dist-test/dom-revisions.mjs --log-level=warning && TZ=America/Chicago node dist-test/dom-revisions.mjs` | **PASS** (**59/59**, exit 0) |
| Revisions DOM lane (UTC spot-check on R1–R9) | `cd web && TZ=UTC node dist-test/dom-revisions.mjs` | **R1–R9 all PASS** (9/9 rollout pins green under UTC too; only pre-existing Weekly Recap pin W2 expects Chicago TZ) |

## 5. Post-Change `store.ts` Hash & Untouched-Files Confirmation

- Post-change `git hash-object web/src/store.ts`: **`1323046db6ba07b8c85805f89a103dc16f3776b5`** (matches required hash).
- Explicitly confirmed **untouched**:
  - `engine/` (all files untouched)
  - `web/src/store.ts` (untouched)
  - `web/src/rollout.ts` (untouched)
  - `web/src/recap.ts` (untouched)
  - Weekly Recap's two raw `type="time"` inputs in `web/src/app.tsx` (out of scope, untouched)
  - `TimePicker` component in `web/src/app.tsx` (untouched)
