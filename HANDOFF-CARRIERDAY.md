# HANDOFF — Carrier-Day Exact Start Time (`HH:MM`)

**Workspace:** `/home/lae/hos-build/work-carrierday` (branched from `/home/lae/hos-build/work-stackfix3`; earlier trees untouched)  
**Scope:** Owner-authorized engine + app-layer change allowing the carrier day to start at an exact minute (`dayStartHour:dayStartMinute`, `00:00`–`23:59`, default `00:00`), picked via the shared `ClockPick` component in Settings and displayed as exact `HH:MM` across every boundary label.

---

## 1. Hard Invariant Confirmations

1. **`web/src/store.ts` BYTE-IDENTICAL:**
   ```text
   $ git hash-object web/src/store.ts
   1323046db6ba07b8c85805f89a103dc16f3776b5
   ```
   Matches the required hash `1323046db6ba07b8c85805f89a103dc16f3776b5` exactly.
2. **Bit-identical behavior for `dayStartMinute = 0` or absent:** Proven by the 100,000-scenario randomized sweep against the untouched `work-stackfix3` engine — **0 mismatches** across all 100,000 scenarios (50,000 explicit `0`, 50,000 omitted).
3. **Shared `ClockPick` only:** Settings "Carrier day starts at" opens `DayStartSheet` using `<ClockPick timeOnly ... />`. No new `<input type="time">` anywhere outside `ClockPick`/`TimePicker`.
4. **Exact `HH:MM` boundary labels:** Every user-facing surface stating the carrier-day boundary displays `HH:MM` (`18:40`, `00:30`, etc.), using `"midnight"` only when `dayStartHour === 0 && dayStartMinute === 0`.

---

## 2. Full Engine Diff (`work-stackfix3/engine/src` → `work-carrierday/engine/src`)

Every `dayStartHour` consumer in `engine/src/` was audited (`types.ts`, `cycle.ts`, `availability.ts`, `trip.ts`, `shift.ts`, `timeline.ts`, `index.ts`). All carrier-day math funnels through `carrierDayStart()` / `nextCarrierDayStart()` / `dayLabel()` in `cycle.ts`, and `evaluate()` (`availability.ts`) and `pruneHistory()` (`trip.ts`) normalize `RulesConfig`. `dayLabel()` was also tightened from `localParts(dayStart + 1, ...)` to `localParts(dayStart, ...)` so a `23:59` boundary never rolls the label to the next calendar date (while remaining identical for `:00`).

```diff
diff -ru /home/lae/hos-build/work-stackfix3/engine/src/availability.ts /home/lae/hos-build/work-carrierday/engine/src/availability.ts
--- /home/lae/hos-build/work-stackfix3/engine/src/availability.ts
+++ /home/lae/hos-build/work-carrierday/engine/src/availability.ts
@@ -48,7 +48,12 @@
  * the FMCSA-preferred split interpretation, all violations, and the cycle picture.
  */
 export function evaluate(raw: Segment[], opts: EvaluateOptions = {}): FullEvaluation {
-  const config: RulesConfig = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
+  const rawConfig: RulesConfig = { ...DEFAULT_CONFIG, ...(opts.config ?? {}) };
+  const dsm = rawConfig.dayStartMinute;
+  const config: RulesConfig = {
+    ...rawConfig,
+    dayStartMinute: typeof dsm === 'number' && Number.isInteger(dsm) && dsm >= 0 && dsm <= 59 ? dsm : 0,
+  };
   const readable = (s: Segment) => Number.isFinite(s?.start) && Number.isFinite(s?.end) && s.end > s.start;
   const invalid = raw.filter((s) => !readable(s));
   const normalized = normalize(invalid.length ? raw.filter(readable) : raw);

diff -ru /home/lae/hos-build/work-stackfix3/engine/src/cycle.ts /home/lae/hos-build/work-carrierday/engine/src/cycle.ts
--- /home/lae/hos-build/work-stackfix3/engine/src/cycle.ts
+++ /home/lae/hos-build/work-carrierday/engine/src/cycle.ts
@@ -3,7 +3,12 @@
 import { minutesOf, WORK } from './timeline.ts';
 import { severityOf, fmt } from './shift.ts';
 
-/* ---------- carrier-day arithmetic (24h periods starting at dayStartHour in home-terminal zone) ---------- */
+/* ---------- carrier-day arithmetic (24h periods starting at dayStartHour:dayStartMinute in home-terminal zone) ---------- */
+
+function dayStartMin(cfg: RulesConfig): number {
+  const m = cfg.dayStartMinute;
+  return typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 59 ? m : 0;
+}
 
 const fmtCache = new Map<string, Intl.DateTimeFormat>();
 function dtf(tz: string) {
@@ -24,9 +29,9 @@
   return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
 }
 
-/** Minutes since epoch for local wall time (y,m,d,h) in tz. Handles DST via two-pass correction. */
-export function localToMinute(y: number, m: number, d: number, h: number, tz: string): number {
-  const target = Math.floor(Date.UTC(y, m - 1, d, h) / 60000);
+/** Minutes since epoch for local wall time (y,m,d,h,min) in tz. Handles DST via two-pass correction. */
+export function localToMinute(y: number, m: number, d: number, h: number, tz: string, min = 0): number {
+  const target = Math.floor(Date.UTC(y, m - 1, d, h, min) / 60000);
   const at = (minute: number) => {
     const p = localParts(minute, tz);
     return { asUtc: Math.floor(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) / 60000) };
@@ -41,23 +46,23 @@
     if (seen.has(next)) break; // oscillating: this wall time never appears on the clock
     guess = next;
   }
-  // Spring-forward gap. The requested wall time does not exist on this date (02:00 on the transition
-  // day, when the clock jumps 02:00 → 03:00), so the fixed-point iteration cannot settle. Resolve it
-  // FORWARD to the first real instant after the gap: that is when the driver's clock actually reads.
-  // The old code landed an hour early, which made the carrier day before the change 23 hours long and
-  // shifted every day's boundaries around it (stress-test 2.8).
+  // Spring-forward gap. The requested wall time does not exist on this date (02:00..02:59 on the
+  // transition day, when the clock jumps 02:00 → 03:00), so the fixed-point iteration cannot settle.
+  // Resolve it FORWARD to the real instant shifted past the gap: that keeps the preceding carrier
+  // day a full 24h and the spring-forward carrier day 23h (stress-test 2.8).
   const ascending = [...seen].sort((a, b) => a - b);
   return ascending.find((x) => at(x).asUtc >= target) ?? ascending[ascending.length - 1];
 }
 
 /** Start minute of the carrier day containing `minute`. */
 export function carrierDayStart(minute: number, cfg: RulesConfig): number {
+  const min = dayStartMin(cfg);
   const p = localParts(minute, cfg.timeZone);
-  let start = localToMinute(p.y, p.m, p.d, cfg.dayStartHour, cfg.timeZone);
+  let start = localToMinute(p.y, p.m, p.d, cfg.dayStartHour, cfg.timeZone, min);
   if (start > minute) {
-    // before today's dayStartHour → belongs to previous carrier day
+    // before today's carrier-day start → belongs to previous carrier day
     const prev = new Date(Date.UTC(p.y, p.m - 1, p.d - 1));
-    start = localToMinute(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), cfg.dayStartHour, cfg.timeZone);
+    start = localToMinute(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), cfg.dayStartHour, cfg.timeZone, min);
   }
   return start;
 }
@@ -68,7 +73,7 @@
 }
 
 export function dayLabel(dayStart: number, cfg: RulesConfig): string {
-  const p = localParts(dayStart + 1, cfg.timeZone);
+  const p = localParts(dayStart, cfg.timeZone);
   return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
 }

diff -ru /home/lae/hos-build/work-stackfix3/engine/src/trip.ts /home/lae/hos-build/work-carrierday/engine/src/trip.ts
--- /home/lae/hos-build/work-stackfix3/engine/src/trip.ts
+++ /home/lae/hos-build/work-carrierday/engine/src/trip.ts
@@ -226,7 +226,12 @@
  */
 export function pruneHistory(history: Segment[], from: number, config?: Partial<RulesConfig>): Segment[] {
   if (history.length < 50) return history;
-  const cfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
+  const rawCfg = { ...DEFAULT_CONFIG, ...(config ?? {}) };
+  const dsm = rawCfg.dayStartMinute;
+  const cfg: RulesConfig = {
+    ...rawCfg,
+    dayStartMinute: typeof dsm === 'number' && Number.isInteger(dsm) && dsm >= 0 && dsm <= 59 ? dsm : 0,
+  };
   const { windowDays } = cycleParams(cfg);
   let winStart = carrierDayStart(from, cfg);
   for (let i = 0; i < windowDays + 1; i++) winStart = carrierDayStart(winStart - 1, cfg);

diff -ru /home/lae/hos-build/work-stackfix3/engine/src/types.ts /home/lae/hos-build/work-carrierday/engine/src/types.ts
--- /home/lae/hos-build/work-stackfix3/engine/src/types.ts
+++ /home/lae/hos-build/work-carrierday/engine/src/types.ts
@@ -31,6 +31,8 @@
   cycle: '60/7' | '70/8';
   /** Hour (0-23) at which the carrier's 24-hour period starts at the home terminal. Usually 0. */
   dayStartHour: number;
+  /** Minute (0-59) within dayStartHour at which the carrier's 24-hour period starts. Usually 0. */
+  dayStartMinute: number;
   /** IANA time zone of the home terminal, used to compute carrier days. */
   timeZone: string;
   /** Driver qualifies for §395.1(e)(1)/(2) short-haul: exempt from the 30-min break rule. */
@@ -44,6 +46,7 @@
 export const DEFAULT_CONFIG: RulesConfig = {
   cycle: '70/8',
   dayStartHour: 0,
+  dayStartMinute: 0,
   timeZone: 'America/Chicago',
   shortHaul: false,
 };
```

---

## 3. Files Changed / Added (16 source & test files)

| File | Status | Reason |
|---|---|---|
| `engine/src/types.ts` | Modified | Add `dayStartMinute: number` (0–59) to `RulesConfig` and default `0` in `DEFAULT_CONFIG`. |
| `engine/src/cycle.ts` | Modified | Add `min = 0` param to `localToMinute`, clamp `dayStartMinute` in `carrierDayStart`, and drop `+ 1` in `dayLabel` so `23:59` keeps its starting date. |
| `engine/src/availability.ts` | Modified | Clamp `dayStartMinute` (integer `0..59`, else `0`) when resolving `config` inside `evaluate()`. |
| `engine/src/trip.ts` | Modified | Clamp `dayStartMinute` when resolving `config` inside `pruneHistory()`. |
| `engine/test/carrier-day-minute.test.ts` | Added | Fail-before/pass-after engine pins `(a)` 18:40 boundary & recap drop-off, `(b)` DST spring-forward/fall-back at `02:40`/`01:40` + `23:59` label, `(c)` `dayStartMinute = 0` parity. |
| `engine/test/carrier-day-sweep.ts` | Added | 100,000-scenario baseline-equivalence sweep (Pass 1) + 25,000-scenario `dayStartMinute 1..59` consistency sweep (Pass 2). |
| `web/src/carrierday.ts` | Added | App-layer `clampDayStartMinute()`, `safeRulesConfig()`, `formatDayStartHM()`, and `dayStartWord()` helpers (since `store.ts` is frozen). |
| `web/src/app.tsx` | Modified | Clamp `s.config` at `App()` root and every engine entry point (incl. `defaultApptTime`); replace Settings hour `<select>` with button opening `DayStartSheet` (`<ClockPick timeOnly />`); format `HH:MM` / `dayStartWord` across Now/Plan two-zones notices, Log daynav, Recap/WeekRecap/History/PrintReport. |
| `web/src/levers.ts` | Modified | Clamp config via `safeRulesConfig()` and format L4 `dayStartLabel` using `dayStartWord()`. |
| `web/src/recap.ts` | Modified | Clamp config via `safeRulesConfig()`, add `dayStartMinute` to `RecapComparison`, and make `wallMinuteInCarrierDay()` compare against `dayStartHour * 60 + dayStartMinute` and call `localToMinute(..., min)`. |
| `web/src/rescue.ts` | Modified | Clamp config via `safeRulesConfig()` in `evaluateSplitPairing()` / `simulateRescue()` and pass `min` directly to `localToMinute()`. |
| `web/src/rollout.ts` | Modified | Clamp config via `safeRulesConfig()` in `defaultAppointmentFor()` / `planRollout()` and pass `min` directly to `localToMinute()`. |
| `web/src/stack.ts` | Modified | Clamp config via `safeRulesConfig()` in `evaluateStackChain()`, pass `min` directly to `localToMinute()`, and use `dayStartWord()` instead of hardcoded `"midnight"` on recap-wait labels & dispatch text. |
| `web/test/dom/carrierday.mjs` | Added | 8 DOM pins (`CD1`–`CD8`) covering Settings ClockPick 18:40 selection, save/load/export/import round-trip, garbage clamping, Now/Plan/Log/Recap/WeekRecap/History/L4 formatting, `recap.ts` boundary split, and preset/reset controls (fixed clean `render(null, root); process.exit(...)` teardown during resume). |
| `web/test/smoke.mjs` | Modified | Add SSR smoke block pinning 18:40 persistence, garbage clamping, Settings/Notices/Log `18:40` output, and absence of bare `<input type="time">` on Settings. |
| `web/package.json` | Modified | Wire `test/dom/carrierday.mjs` into `npm run dom` (and thus `npm run smoke`). |

### Audit Fixes Applied During Resume
1. **`web/src/stack.ts`**: Replaced the last hardcoded `'midnight recap wait'` and `'Wait for midnight recap hours'` strings with `dayStartWord(config)` so `00:00` continues to say `"midnight"` while non-zero boundaries (e.g. `18:40`) state `"18:40 recap wait"` / `"Wait for 18:40 recap hours"`.
2. **`web/src/app.tsx`**: Wrapped `s.config` with `safeRulesConfig()` inside exported `defaultApptTime(s, now)`.
3. **`web/test/dom/carrierday.mjs`**: Added `render(null, root); process.exit(pass === res.length ? 0 : 1);` at the end of the harness. Without explicit teardown/exit, `App`'s live `setInterval` timers kept the Node event loop open after printing `8/8 carrier-day pins passed`, which caused the previous run to hit the timeout.

---

## 4. 100,000-Scenario Sweep Design & Results

**Harness:** `engine/test/carrier-day-sweep.ts`  
**Command:** `cd engine && node test/carrier-day-sweep.ts`

### Design
- **PRNG:** Deterministic Mulberry32 (`0xca771e01` for Pass 1, `0xca771e02` for Pass 2).
- **Zones (13, including half-hour offset & southern/northern DST):** `America/Chicago`, `America/New_York`, `America/Denver`, `America/Los_Angeles`, `America/Anchorage`, `America/Phoenix`, `America/St_Johns`, `America/Havana`, `Europe/London`, `Europe/Berlin`, `Australia/Sydney`, `Pacific/Auckland`, `UTC`.
- **Timestamps & Segments:** 40% clustered within ±4 days of 9 global 2026–2027 DST transition anchors, 60% uniform across 2026–2027; random `cycle` (`60/7` 30%, `70/8` 70%), `shortHaul` (20%), `dayStartHour` (`0..23`), 0–16 random `OFF`/`SB`/`D`/`ON` segments (including gaps and tentative rows) spanning up to 9 days before `asOf`.
- **Pass 1 Comparison Method (100,000 scenarios):** Imports the untouched baseline engine (`../../../work-stackfix3/engine/src/index.ts`) alongside the new engine (`../src/index.ts`). Runs every scenario twice — once on baseline (no `dayStartMinute`), once on new engine alternating `dayStartMinute: 0` (50,000 scenarios) and `dayStartMinute` omitted (50,000 scenarios). Strips only `config.dayStartMinute` from the new `FullEvaluation` and asserts:
  - `assert.strictEqual(nextStart, baseStart)` (`carrierDayStart`)
  - `assert.strictEqual(nextNext, baseNext)` (`nextCarrierDayStart`)
  - `assert.strictEqual(nextLbl, baseLbl)` (`dayLabel`)
  - `assert.strictEqual(nextEv.config.dayStartMinute, 0)`
  - `assert.deepStrictEqual(stripped, baseEv)` (full deep equality on `evaluate()`, including `cycle.days`, `cycle.forecast`, `cycle.used`, `cycle.remaining`, `shift`, `noSplit`, `driveNow`, `binding`, `mustStopBy`, `violations`, `gaps`).
- **Pass 2 Consistency Checks (25,000 scenarios, random `dayStartMinute` 1..59):** Asserts zero throws, finite non-negative clocks, `sum(cycle.days.onDuty) === cycle.used`, `ds <= asOf < ns`, idempotence of `carrierDayStart`, every carrier day length strictly in `{1380, 1440, 1500}` (23h/24h/25h), every `dayLabel` matches the local date of `d.start` (including `23:59`), and every day/forecast boundary lands on exact local `dayStartHour:dayStartMinute` (or +60m forward across a verified spring-forward DST gap).

### Recorded Output
```text
PASS 1 (baseline vs new dayStartMinute=0/absent): 100000 scenarios (50000 explicit 0, 50000 omitted), mismatches=0, elapsed=441.55s
PASS 2 (dayStartMinute 1..59 consistency): 25000 scenarios, 0 failures, dayLengths={23h:1220, 24h:190062, 25h:1292}, dstGapResolutions=50, elapsed=57.99s
```

---

## 5. Fail-Before / Pass-After Evidence

### Fail-Before (running `engine/test/carrier-day-minute.test.ts` against untouched `work-stackfix3/engine/src/index.ts`)
```text
✖ (a) boundary at 18:40: segment ending 18:39 vs starting 18:40 land in different carrier days, and recap drops off at 18:40
  AssertionError [ERR_ASSERTION]: 18:39 and 18:40 must belong to different carrier days
  actual: 29823780, expected: 29823780, operator: 'notStrictEqual'
✖ (b) DST spring-forward and fall-back with minute-offset start (02:40 and 01:40) resolve sanely
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + '2026-03-07 02:00'
  - '2026-03-07 02:40'
✔ (c) dayStartMinute = 0 reproduces today boundaries exactly on fixed cases
ℹ tests 3 | pass 1 | fail 2
```

### Pass-After (on `work-carrierday/engine/src/index.ts`)
```text
✔ (a) boundary at 18:40: segment ending 18:39 vs starting 18:40 land in different carrier days, and recap drops off at 18:40
✔ (b) DST spring-forward and fall-back with minute-offset start (02:40 and 01:40) resolve sanely
✔ (c) dayStartMinute = 0 reproduces today boundaries exactly on fixed cases
```
(Included in the full `108/108` engine test pass below.)

---

## 6. Persistence, Clamping & UI Pin Results (`web/test/dom/carrierday.mjs` + `web/test/smoke.mjs`)

- **CD1 (PASS):** Settings replaces hour-only `<select>` with `Carrier day starts at 00:00` button (`data-carrier-day-btn="1"`), zero bare `<input type="time">` and zero hour `<select>` in Settings.
- **CD2 (PASS):** Tapping the Settings button opens `DayStartSheet` on shared `ClockPick` (`timeOnly`, no day chips), setting `18:40` and clicking Apply updates state to `dayStartHour: 18, dayStartMinute: 40` and button text to `Carrier day starts at 18:40`.
- **CD3 (PASS):** `dayStartMinute = 40` survives `localStorage` save → `parseSaved()` / `loadSaved()` AND `exportState()` → `applyImportedState()` unchanged; legacy saves omitting `dayStartMinute` default to `0`.
- **CD4 (PASS):** Garbage `dayStartMinute` values (`75`, `-1`, `40.5`, `"x"`, `NaN`, `null`, `undefined`, `Infinity`, `-Infinity`, `{}`, `[]`) are clamped to `0` by `clampDayStartMinute` / `safeRulesConfig` before evaluation (matching `dayStartMinute: 0` cycle output identically) and before UI render (`18:00`).
- **CD5 (PASS):** Now and Plan two-zones notices render `rolls at 18:40 <otherTz>` and `18:40 recap is not 18:40`.
- **CD6 (PASS):** `dayStartWord` produces `"midnight"` for `00:00`, `"00:30"` for `00:30`, `"18:40"` for `18:40`; Log day nav (`Carrier day from 18:40`), Lever L4 (`18:40`), `hoursBackSentence` (`(18:40 ...)`), RecapTab (`Days roll at 18:40`), HistoryTab (`days roll at 18:40`), and WeekRecapTab (`rolls at 18:40`) all render exact `18:40`.
- **CD7 (PASS):** `recap.ts` `wallMinuteInCarrierDay()` places `18:15` on the next calendar date inside `[18:40, next 18:40)` and `projectRecapVs34()` splits a 10h shift starting `16:00` across `18:40` into exact `160m + 440m` (`2h40m + 7h20m`).
- **CD8 (PASS):** `DayStartSheet` preset nudge buttons (`+5`, `−1` → `18:44`) and `Reset to 00:00 (midnight)` + Apply work end-to-end.
- **SSR Smoke Pin (PASS, both `TZ=America/Chicago` and `TZ=UTC`):** `carrier-day exact start (18:40 persistence, garbage clamping, SSR Settings/Notices/Log): OK`.

---

## 7. Self-Check Suite Counts (All Sequential, Foreground)

| Suite | Environment / Command | Result | Baseline |
|---|---|---|---|
| Engine tests | `cd engine && npm test` | **108 / 108 pass** (0 fail) | ≥105 + new pins |
| 100k Equivalence Sweep | `cd engine && node test/carrier-day-sweep.ts` | **Pass 1: 100,000/100,000 (0 mismatches)**<br>**Pass 2: 25,000/25,000 (0 failures)** | 100k + minute>0 pass |
| Web build + typecheck | `cd web && npm run build` (`tsc --noEmit` + `build.mjs`) | **PASS** (0 errors, `dist/app.js` 428.9kb) | pass |
| Web smoke (`America/Chicago`) | `cd web && TZ=America/Chicago npm run smoke` | **PASS** (typecheck, contrast 44/44 day + 44/44 night, nightlight, ocr-bundle, SSR smoke, all 11 DOM suites incl. stack **15/15**, rescue **11/11**, carrierday **8/8**) | full pass, stack 15/15 |
| Web smoke (`UTC`) | `cd web && TZ=UTC npm run smoke` | **PASS** (full suite green; exact same counts: c1flush 6/6, adjuststart 39/39, scrub 30/30, c3 46/46, c3relaunch 3/3, logedit 37/37, cascade 16/16, rescue 11/11, stack 15/15, carrierday 8/8) | full pass |
| Revisions DOM suite | `cd web && esbuild ... revisions.mjs && node dist-test/dom-revisions.mjs` | **89 / 89 pass** (0 fail) | 89/89 |
| Auditfix browser suite | `TZ=America/Chicago HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=~/.hermes/hermes-agent node test/dom/auditfix.mjs` | **185 / 185 pass** (0 fail) | 185/185 |
| Polish browser suite | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=~/.hermes/hermes-agent node test/dom/polish.mjs` | **279 / 279 pass** (0 fail) | full pass |
| Layout browser suite | `HOS_BROWSER=/usr/bin/chromium HOS_PLAYWRIGHT=~/.hermes/hermes-agent node test/dom/layout.mjs` | **421 / 421 pass** (0 fail) | full pass |

---

## 8. Notes / Pre-Existing Observations

- **Nothing stopped on** — all requirements, invariants, sweep targets, and browser/DOM/engine suites are green.
- **`engine/` standalone `tsc`:** `engine/node_modules` is not installed in the baseline tree (`work-stackfix3` also has `node_modules` under `web/` only), so `web`'s `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) is the active TypeScript check covering both `web/src` and `engine/src`; it passes with 0 errors.
- **Transient timing flake observed once in `dom-scrub.mjs` P4 under `TZ=UTC`:** On the first chained `TZ=UTC` run, pre-existing `scrub.mjs` pin P4 missed its 40ms `sleep(40)` window after firing an input event. Immediate re-runs (`node dist-test/dom-scrub.mjs` twice) passed `30/30` both times, and the full `TZ=UTC npm run smoke` run passed completely with exit code 0.
