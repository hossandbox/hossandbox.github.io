# Handoff — Carrier-Day Exact Start Time Fix Round (M1)

**Tree:** `/home/lae/hos-build/work-carrierdayfix` (copied from `/home/lae/hos-build/work-carrierday`)
**Scope:** App-layer fix for Opus review finding **M1** (`~/hos-build/REVIEW-CARRIERDAY.md`). Engine untouched; finding L1 untouched (reviewed and accepted as-is).

---

## 1. The Fix (M1 — Legacy Backup Import Inheriting Current `dayStartMinute`)

**File & lines:** `web/src/app.tsx:8515-8524` (inside `importJson`)

**Root cause:** `applyImportedState(cur, d)` in frozen `web/src/store.ts:1002` calls `sanitizeConfig(d.config, cur.config)`, which spreads `cur.config` before `d.config`. A backup exported before carrier-day minute support has `d.config` with `dayStartHour` (e.g. `6`) and **no `dayStartMinute` key**, so `cur.config.dayStartMinute` (e.g. `40`) survived and produced `06:40` instead of `06:00`.

**Change:** After `applyImportedState(cur, d)`, when `d.config` is a non-null, non-array object lacking a `dayStartMinute` key, force `out.config.dayStartMinute = 0`, then pass `out.config` through `safeRulesConfig(...)` so explicit valid minutes (e.g. `25`) are preserved and invalid/garbage values (e.g. `75`) are clamped to `0`:

```diff
--- /home/lae/hos-build/work-carrierday/web/src/app.tsx
+++ /home/lae/hos-build/work-carrierdayfix/web/src/app.tsx
@@ -8512,7 +8512,16 @@
       // Say what was replaced, exactly as the bad-zone case does: an imported draft that the app could
       // not use must not be silently swapped for a default.
       const resets = draftResets(d, cur);
-      setState((cur) => applyImportedState(cur, d));
+      setState((cur) => {
+        const out = applyImportedState(cur, d);
+        if (out.config) {
+          // A legacy backup exported before dayStartMinute existed has a config object without that key;
+          // store.ts sanitizeConfig spreads cur.config first, which would silently inherit the current minute.
+          const legacyCfg = d.config && typeof d.config === 'object' && !Array.isArray(d.config) && !('dayStartMinute' in d.config);
+          out.config = safeRulesConfig(legacyCfg ? { ...out.config, dayStartMinute: 0 } : out.config);
+        }
+        return out;
+      });
       setIoNote(`Imported ${(d.segments ?? []).length} segment(s) and ${(d.tentative ?? []).length} what-if row(s) from ${f.name}. Settings and the trip scenario came back with them; a simulated clock does not.${badZone ? ` The file's time zone "${badZone}" is not valid, so your home terminal zone stayed ${getState().config.timeZone}.` : ''}${resets.length ? ` Values the app could not use were replaced in ${resets.join(' and ')}.` : ''}`);
     }).catch((err) => setIoNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`));
   };
```

---

## 2. New Pin & Fail-Before / Pass-After Evidence

**Pin added:** `CD9` in `web/test/dom/carrierday.mjs:384-447`.
Exercises the real Settings `<input type="file" accept="application/json">` import handler (`importJson`) end-to-end:
1. Starts with current config at **18:40** (`dayStartHour: 18, dayStartMinute: 40, timeZone: 'America/Chicago'`), imports legacy backup `{ segments: [], config: { cycle: '70/8', dayStartHour: 6, timeZone: 'America/Chicago' } }` (no `dayStartMinute` key) → asserts resulting config is **06:00** (`dayStartHour: 6, dayStartMinute: 0`) and Settings button renders `Carrier day starts at 06:00`.
2. Converse: imports `{ segments: [], config: { cycle: '70/8', dayStartHour: 6, dayStartMinute: 25, timeZone: 'America/Chicago' } }` → asserts resulting config is **06:25** (`dayStartMinute: 25`) and button renders `Carrier day starts at 06:25`.
3. Clamp check: imports `{ segments: [], config: { cycle: '70/8', dayStartHour: 14, dayStartMinute: 75, timeZone: 'America/Chicago' } }` → asserts `safeRulesConfig` clamps to **14:00** (`dayStartMinute: 0`).

### Fail-Before Run (on unmodified `work-carrierday/web/src` — verified `diff -rq ../work-carrierday/web/src web/src` empty)

```text
PASS  CD1. Settings replaces hour-only select with Carrier day starts at 00:00 button
PASS  CD2. Settings opens shared ClockPick sheet, picks 18:40, saves hour 18 / minute 40
PASS  CD3. Persistence round-trip: dayStartMinute=40 survives save/load & export/import unchanged; legacy -> 0
PASS  CD4. Garbage dayStartMinute values (75, -1, 40.5, "x", NaN, null) clamped to 0 before evaluation & render
PASS  CD5. Now and Plan two-zones notices show exact 18:40 boundary
PASS  CD6. All app-layer boundary surfaces show exact HH:MM (18:40, 00:30, midnight for 00:00)
PASS  CD7. recap.ts wallMinuteInCarrierDay & projectRecapVs34 honor 18:40 boundary
PASS  CD8. DayStartSheet preset nudge keys and Reset to 00:00 button work cleanly
FAIL  CD9. Import JSON: legacy config (no dayStartMinute) resets minute to 0; explicit dayStartMinute=25 kept
      legacy import expected 6:0, got 6:40 (button: "Carrier day starts at 06:40Home terminal time · Central")

8/9 carrier-day pins passed
EXIT=1
```

### Pass-After Run (with M1 fix in `web/src/app.tsx`)

```text
PASS  CD1. Settings replaces hour-only select with Carrier day starts at 00:00 button
PASS  CD2. Settings opens shared ClockPick sheet, picks 18:40, saves hour 18 / minute 40
PASS  CD3. Persistence round-trip: dayStartMinute=40 survives save/load & export/import unchanged; legacy -> 0
PASS  CD4. Garbage dayStartMinute values (75, -1, 40.5, "x", NaN, null) clamped to 0 before evaluation & render
PASS  CD5. Now and Plan two-zones notices show exact 18:40 boundary
PASS  CD6. All app-layer boundary surfaces show exact HH:MM (18:40, 00:30, midnight for 00:00)
PASS  CD7. recap.ts wallMinuteInCarrierDay & projectRecapVs34 honor 18:40 boundary
PASS  CD8. DayStartSheet preset nudge keys and Reset to 00:00 button work cleanly
PASS  CD9. Import JSON: legacy config (no dayStartMinute) resets minute to 0; explicit dayStartMinute=25 kept

9/9 carrier-day pins passed
```

---

## 3. Hard Invariants & Diff Scope vs `work-carrierday`

- **`web/src/store.ts` byte-identical:**
  - `git hash-object /home/lae/hos-build/work-carrierdayfix/web/src/store.ts` → `1323046db6ba07b8c85805f89a103dc16f3776b5` (**MATCH**)
- **`engine/` unchanged vs `work-carrierday`:**
  - `diff -ru /home/lae/hos-build/work-carrierday/engine /home/lae/hos-build/work-carrierdayfix/engine | wc -c` → `0` (**EMPTY**)
- **Diff scope vs `work-carrierday` (excluding generated `web/dist` and `web/dist-test` and this handoff):**
  - `web/src/app.tsx` (+10/-1 lines at `importJson`)
  - `web/test/dom/carrierday.mjs` (+67/-1 lines, adding pin `CD9`)
- **No other behavior changes:** L1 (`rescue.ts:292`, `rollout.ts:284`, `stack.ts:344`) untouched.

---

## 4. Verification Suite Counts (Sequential Foreground Runs)

| Check | `TZ=America/Chicago` | `TZ=UTC` |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | PASS | PASS |
| `test/contrast.mjs` | 44/44 day, 44/44 night | 44/44 day, 44/44 night |
| `test/nightlight.mjs` | OK | OK |
| `test/ocr-bundle.mjs` | OK (pass 1 + pass 2) | OK (pass 1 + pass 2) |
| `test/smoke.mjs` | OK (all patches incl. carrier-day) | OK (all patches incl. carrier-day) |
| `dom/yesback.mjs` | OK | OK |
| `dom/c1flush.mjs` | C1FLUSH OK | C1FLUSH OK |
| `dom/adjuststart.mjs` | ADJUSTSTART OK | ADJUSTSTART OK |
| `dom/scrub.mjs` | C2SCRUB OK | C2SCRUB OK |
| `dom/c3.mjs` | C3 OK | C3 OK |
| `dom/c3relaunch.mjs` | C3 RELAUNCH OK | C3 RELAUNCH OK |
| `dom/logedit.mjs` | LOGEDIT OK | LOGEDIT OK |
| `dom/cascade.mjs` | CASCADE OK | CASCADE OK |
| `dom/rescue.mjs` | **11/11** pins pass | **11/11** pins pass |
| `dom/stack.mjs` | **15/15** stack pins passed | **15/15** stack pins passed |
| `dom/carrierday.mjs` | **9/9** carrier-day pins passed | **9/9** carrier-day pins passed |
| `npm run build` | PASS (`dist/app.js` 429.1kb) | — |
