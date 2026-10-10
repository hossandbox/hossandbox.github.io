import { useEffect, useState } from 'preact/hooks';
import type { Segment, RulesConfig, DutyStatus } from '../../engine/src/index.ts';
import { DEFAULT_CONFIG, normalize } from '../../engine/src/index.ts';

/**
 * The live status. `createdAt` is the stamp() taken when it was tapped: overlap resolution treats the
 * live row as an entry made at that moment, so a correction typed later still wins, while a row typed
 * earlier (e.g. "off 08:00 → 22:00" before dispatch called) can no longer hide live driving
 * (stress-test round 2, §2.1).
 */
export interface OpenSegment { status: DutyStatus; since: number; note?: string; createdAt?: number }

/**
 * Trip-tab scenario. Kept in the store (not component state) so switching tabs does not silently
 * throw away what the driver was comparing (consumer-review-2).
 */
export interface TripDraft {
  miles: number;
  pre: number;
  stopMile: number;
  stopMin: number;
  stopOff: boolean;
  /** datetime-local string; null follows the live clock */
  dep: string | null;
  /** status assumed between now and departure; 'CURRENT' = whatever the log says now */
  until: DutyStatus | 'CURRENT';
  /** which comparison is selected; null = whichever plan is fastest */
  view: 'reset10' | 'split' | 'restart34' | null;
}

export interface State {
  segments: Segment[];
  tentative: Segment[];
  current: OpenSegment | null;
  config: RulesConfig;
  mph: number;
  trip: TripDraft;
  /** Split Lab scenario — persisted so switching tabs does not rewrite the driver's plan. */
  split: SplitDraft;
  /** Recap "can I take this load?" scenario — same reason. */
  loadCheck: LoadCheckDraft;
  /**
   * The driver has explicitly confirmed the record starts here. Until then the app keeps disclosing
   * that its picture of past duty is incomplete — tapping a status is a statement about NOW, not
   * about the days behind it.
   */
  historyAcknowledged: boolean;
  /** Log tab: show the normalized timeline instead of the entries as typed */
  logResolved: boolean;
  /** day (default, Lorico 2026-09-25 — he drives in daylight) or night; see applyTheme */
  theme: Theme;
  /**
   * The driver picked a theme by hand. Recorded so a later change of default can tell "chose night"
   * from "never touched it" — before this flag, a stored 'night' was ambiguous (round-3 item 2).
   */
  themeChosen: boolean;
  /** True once, if a legacy save (night was then the default) was moved to the new day default. */
  themeNotice: boolean;
  /**
   * The driver has confirmed the home terminal time zone. Until then the app is using the phone's
   * zone, which is wrong for a driver who installed while on the road — and a wrong zone silently
   * moves day boundaries and corrupts the recap. So it is asked for rather than assumed (round-3 item 3).
   */
  tzChosen: boolean;
  /** simulated "now" for testing; null = wall clock */
  nowOverride: number | null;
  /**
   * Which screen is showing. 'now' is home (redesign, 2026-10-10); 'split', 'trip' and 'load' are the
   * planning screens reached from 'plan'; 'settings' is labelled "More". Navigation, not data: every
   * launch opens on 'now' (see parseSaved).
   */
  tab: 'now' | 'log' | 'plan' | 'split' | 'recap' | 'trip' | 'load' | 'settings';
  /** where "Report a bug" sends mail */
  bugEmail: string;
  /** Sound, vibration and notification alerts while driving (driver report 2026-10-06). Device setting: not exported. */
  alertsOn: boolean;
  /** Keep the screen on while the status is Driving, so a mounted phone keeps running its alerts. Device setting. */
  keepAwake: boolean;
}

const KEY = 'hos-sandbox-v1';
/** The browser's zone — what every `clock()` on screen renders in, which may differ from the terminal. */
export const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';

export const DEFAULT_TRIP: TripDraft = {
  miles: 550, pre: 30, stopMile: 0, stopMin: 0, stopOff: false, dep: null, until: 'CURRENT', view: null,
};

/** Split Lab scenario. Kept in the store so a trip to the Log tab cannot rewrite the plan. */
export interface SplitDraft {
  b1: number; b1s: 'OFF' | 'SB';
  dwell: number;
  drive: number;
  b2: number; b2s: 'OFF' | 'SB';
}
export const DEFAULT_SPLIT: SplitDraft = { b1: 180, b1s: 'OFF', dwell: 30, drive: 300, b2: 420, b2s: 'SB' };

/** Recap "can I take this load?" scenario. */
export interface LoadCheckDraft { miles: number; dwell: number; dwellOff: boolean }
export const DEFAULT_LOADCHECK: LoadCheckDraft = { miles: 1200, dwell: 120, dwellOff: false };

/** The state a fresh install starts from. Exported so the defaults are assertable, not folklore. */
export const INITIAL_STATE: State = {
  segments: [], tentative: [], current: null,
  config: { ...DEFAULT_CONFIG, timeZone: deviceTz },
  mph: 55, trip: { ...DEFAULT_TRIP }, split: { ...DEFAULT_SPLIT }, loadCheck: { ...DEFAULT_LOADCHECK },
  historyAcknowledged: false, logResolved: false, theme: 'day', themeChosen: false, themeNotice: false,
  tzChosen: false, nowOverride: null, tab: 'now', bugEmail: '', alertsOn: true, keepAwake: true,
};

/**
 * A config the engine can run on. An invalid zone makes Intl.DateTimeFormat throw inside evaluate(),
 * and once saved it blanked the app on every launch (bug report C2), so anything read from storage or
 * an imported file passes through here: bad fields fall back to the device zone / defaults.
 */
export function sanitizeConfig(c: Partial<RulesConfig> | null | undefined, fallback: RulesConfig = INITIAL_STATE.config): RulesConfig {
  const cfg = { ...fallback, ...(c && typeof c === 'object' ? c : {}) };
  if (typeof cfg.timeZone !== 'string' || !isValidTimeZone(cfg.timeZone)) cfg.timeZone = isValidTimeZone(fallback.timeZone) ? fallback.timeZone : deviceTz;
  if (!Number.isInteger(cfg.dayStartHour) || cfg.dayStartHour < 0 || cfg.dayStartHour > 23) cfg.dayStartHour = 0;
  if (cfg.cycle !== '60/7' && cfg.cycle !== '70/8') cfg.cycle = '70/8';
  const nums = (v: unknown) => (Array.isArray(v) ? v.filter((x) => Number.isFinite(x)) : []);
  cfg.adverseShifts = nums(cfg.adverseShifts);
  cfg.sixteenHourShifts = nums(cfg.sixteenHourShifts);
  cfg.shortHaul = !!cfg.shortHaul;
  return cfg;
}

function load(): State {
  try { return parseSaved(localStorage.getItem(KEY)); } catch { return INITIAL_STATE; }
}

/** What load() does with the saved string (exported so tests can exercise it without a reload). */
export function parseSaved(raw: string | null): State {
  try {
    if (!raw) return INITIAL_STATE;
    const s = JSON.parse(raw);
    const merged: State = { ...INITIAL_STATE, ...s,
      config: sanitizeConfig(s.config),
      trip: { ...DEFAULT_TRIP, ...(s.trip ?? {}) },
      split: { ...DEFAULT_SPLIT, ...(s.split ?? {}) },
      loadCheck: { ...DEFAULT_LOADCHECK, ...(s.loadCheck ?? {}) } };
    // A saved zone the engine cannot use was replaced by sanitizeConfig. Replacing it silently would move
    // every day boundary without a word, so ask again through the first-run zone prompt instead.
    if (typeof s.config?.timeZone === 'string' && s.config.timeZone !== merged.config.timeZone) merged.tzChosen = false;
    // Every launch opens on Now: the screen a driver opens the app for. The last tab is navigation, not
    // data, and reopening into a half-finished planning screen hides the clocks (redesign, 2026-10-10).
    merged.tab = 'now';
    // Legacy save: night was the DEFAULT when it was written, so a stored 'night' far more often means
    // "never touched it" than "chose night" — and `themeChosen` did not exist yet to tell them apart
    // (round-3 item 2). Move it to the new day default once, and raise a notice rather than rewriting
    // the driver's screen in silence.
    if (!('themeChosen' in s) && merged.theme === 'night') {
      merged.theme = 'day';
      merged.themeNotice = true;
    }
    return merged;
  } catch { return INITIAL_STATE; }
}

let state: State = load();
const subs = new Set<() => void>();

export function getState() { return state; }
export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  localStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach((f) => f());
}

/**
 * The driver picked a theme by hand (header switch or Settings). Sets the flag that keeps an explicit
 * choice distinguishable from a default nobody ever touched, so a future default change can honour it.
 */
export function chooseTheme(t: Theme) { setState({ theme: t, themeChosen: true }); }

/** The driver confirmed where their home terminal is. Until this is set the zone is the phone's. */
export function chooseTimeZone(tz: string) { setState({ tzChosen: true, config: { ...state.config, timeZone: tz } }); }

/**
 * A status tap: close the live row at the tap and open the new one there.
 *
 * Tapping the status the driver is ALREADY in returns null (no change). It used to re-stamp the row,
 * which reset the "time in this status" pill to 0m — a driver 2h into a rest saw "Off Duty · 0m" while
 * the rest of the app still said when driving comes back. The record was never wrong (the closed row
 * and the new one are contiguous and the same status, so every clock was identical — verified across
 * the 11/14/70 clocks, the 30-min break counter and a split-sleeper pair), but the pill is the number
 * the driver watches to know when his 10 hours are up, so the tap is now a no-op. (Driver report,
 * 2026-10-04: "the pill gets reset every time off duty is tagged".)
 *
 * `note` is part of the identity on purpose: Personal conveyance and Yard move still switch, because
 * they change the note and therefore the label.
 */
export function statusTap(cur: State, status: DutyStatus, note: string | undefined, now: number): Partial<State> | null {
  if (cur.current && cur.current.status === status && (cur.current.note ?? undefined) === (note ?? undefined)) return null;
  const segments = [...cur.segments];
  // The closed row keeps the stamp from when it was tapped, so a correction typed while it was live
  // still wins over it after it closes.
  if (cur.current && now > cur.current.since) segments.push({ status: cur.current.status, start: cur.current.since, end: now, note: cur.current.note, createdAt: cur.current.createdAt ?? stamp() });
  return { segments, current: { status, since: now, note, createdAt: stamp() } };
}
export function useStore(): State {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return state;
}

/* ---------- time helpers (device-local display; engine works in epoch minutes) ---------- */
export const nowMin = () => Math.floor(Date.now() / 60000);
export function useNow(): number {
  const s = useStore();
  const [n, setN] = useState(nowMin());
  // The app works in whole minutes, so a 30s tick recomputed every planning screen twice per
  // meaningful change — and each tick re-runs planTripAll (stress-test 2.2). One minute is the
  // finest thing any readout can show, so tick at the point where the displayed value can change:
  // on the minute boundary, not 60s after mount, which lagged the wall clock by up to a minute and
  // backdated status taps (bug report C5/L3). A phone that slept also re-reads the clock on wake.
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const schedule = () => { id = setTimeout(() => { setN(nowMin()); schedule(); }, 60000 - (Date.now() % 60000) + 20); };
    schedule();
    const wake = () => setN(nowMin());
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(id); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wake); };
  }, []);
  // Any render (e.g. right after a status tap) reads the real minute, never a stale tick.
  return s.nowOverride ?? Math.max(n, nowMin());
}
export function toInput(min: number): string {
  const d = new Date(min * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromInput(s: string): number | null {
  const t = new Date(s).getTime();
  return isNaN(t) ? null : Math.floor(t / 60000);
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clock(min: number, withDay = true): string {
  if (!isFinite(min)) return '—';
  const d = new Date(min * 60000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return withDay ? `${DOW[d.getDay()]} ${hm}` : hm;
}
/** Like clock(), but with the calendar date — for plans that run past a week, where the weekday repeats. */
export function clockFull(min: number): string {
  if (!isFinite(min)) return '—';
  const d = new Date(min * 60000);
  return `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * How the terminal's day roll (00:00 in `terminalTz`) reads on the device's clock, as "HH:MM".
 * Computed from the real offsets at `at` rather than assumed, so daylight saving is handled — the
 * LA/Chicago gap is 2 hours in summer and 2 in winter, but the US/Phoenix and UTC cases differ.
 */
export function terminalMidnightOnDevice(terminalTz: string, deviceTz: string, at: number): string {
  const offset = (tz: string) => {
    const d = new Date(at * 60000);
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of f.formatToParts(d)) p[part.type] = part.value;
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000);
  };
  const mins = (((offset(deviceTz) - offset(terminalTz)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Every IANA zone the runtime knows, for the settings picker. Falls back to the common US set. */
export const TIME_ZONES: string[] = (() => {
  try {
    const v = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (Array.isArray(v) && v.length) return v;
  } catch { /* older runtime */ }
  return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Winnipeg', 'America/Edmonton',
    'America/Vancouver', 'UTC'];
})();

/**
 * An invalid zone makes `Intl.DateTimeFormat` throw inside the engine, which would blank every tab.
 * Nothing may reach `config.timeZone` unless it passes this.
 */
export function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
export function dur(min: number): string {
  if (!isFinite(min)) return '∞';
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
export function hrs(min: number): string { return (min / 60).toFixed(1); }

export type HistoryBasis = 'fresh' | 'incomplete' | 'known';

/**
 * How much the app actually knows about the driver's past duty.
 *
 * A current status is a statement about NOW, not about the days behind it: tapping "Driving" must
 * not turn unknown past days into confirmed zero-hour days (consumer-review-6). Only an explicit
 * acknowledgement — or a record that genuinely reaches back a full day — makes the basis 'known'.
 */
export function historyBasis(s: State, now: number): HistoryBasis {
  if (s.historyAcknowledged) return 'known';
  if (s.segments.length === 0 && s.tentative.length === 0 && !s.current) return 'fresh';
  if (s.segments.length > 0 && now - Math.min(...s.segments.map((x) => x.start)) >= 1440) return 'known';
  return 'incomplete';
}

/**
 * Basis for the CYCLE specifically.
 *
 * The daily clocks only need a shift's worth of record, but the 60/70-hour cycle is measured over the
 * whole carrier window: a driver who installs the app with 60 hours already on his cycle sees ~56h
 * available after one day of use and, under the 24-hour test above, no warning at all (stress-test
 * 2.6). Treat the cycle as known only once the record genuinely spans the window, or the driver
 * confirms.
 */
export function cycleBasis(s: State, now: number, windowDays: number): HistoryBasis {
  if (s.historyAcknowledged) return 'known';
  if (s.segments.length === 0 && s.tentative.length === 0 && !s.current) return 'fresh';
  if (s.segments.length > 0 && now - Math.min(...s.segments.map((x) => x.start)) >= windowDays * 1440) return 'known';
  return 'incomplete';
}

/**
 * A gap only changes an answer once it is long enough to serve as a split leg (≥2h, §395.1(g)(1)(ii)(A))
 * or to stack into a reset. Disclosing every hole would nag about the ordinary case of going off duty
 * and opening the app an hour later, which teaches the driver to ignore the warning that matters.
 */
export const MEANINGFUL_GAP_MINUTES = 120;
export function meaningfulGaps(gapsIn: { start: number; end: number }[]): { start: number; end: number }[] {
  return gapsIn.filter((g) => g.end - g.start >= MEANINGFUL_GAP_MINUTES);
}

/**
 * Monotonic entry key for a row the driver just added or edited.
 *
 * Date.now() alone can repeat inside one interaction, and a phone clock can step backwards; overlap
 * resolution only needs the ORDER to be correct, so keep a counter that never goes back.
 */
let lastStamp = 0;
export function stamp(): number {
  const t = Date.now();
  lastStamp = t > lastStamp ? t : lastStamp + 1;
  return lastStamp;
}

/**
 * Does a Recap "set" entry fit inside its carrier day? applyDayPatch() clamps at the day's end, so an
 * entry that doesn't fit must be refused up front — silently recording 1h of a 15h day understated the
 * cycle by 14h (stress-test round 2, §2.5). Day length is 23/24/25h across DST.
 */
export function dayPatchOverflow(dayStart: number, dayEnd: number, drive: number, on: number, startHour: number): number {
  const need = startHour * 60 + Math.round(on * 60) + Math.round(drive * 60) + (drive > 8 ? 30 : 0);
  return Math.max(0, need - (dayEnd - dayStart));
}

/**
 * Write a day's drive + on-duty hours as real segments, leaving the rest of the record intact.
 *
 * The original filter dropped every segment that *touched* the day — including the part of it that
 * belongs to the neighbouring day. Setting Monday therefore erased 3h of Tuesday's on-duty time and
 * handed back 3h of cycle (stress-test 2.4). Straddling rows are clipped to the day boundary now, and
 * generated rows are clamped inside the day instead of spilling past it.
 */
export function applyDayPatch(
  segments: Segment[], dayStart: number, dayEnd: number,
  drive: number, on: number, startHour: number, createdAt: number,
): Segment[] {
  const kept: Segment[] = [];
  for (const x of segments) {
    if (x.end <= dayStart || x.start >= dayEnd) { kept.push(x); continue; } // outside the day
    if (x.start < dayStart) kept.push({ ...x, end: dayStart });             // keep its earlier part
    if (x.end > dayEnd) kept.push({ ...x, start: dayEnd });                 // keep its later part
  }
  const segs: Segment[] = [];
  let t = dayStart + startHour * 60;
  const add = (status: DutyStatus, minutes: number) => {
    if (minutes <= 0) return;
    const start = t;
    const end = Math.min(t + minutes, dayEnd); // a 13h day entered at 23:00 must not spill out of it
    if (end > start) segs.push({ status, start, end, note: 'recap entry', createdAt });
    t += minutes;
  };
  // pre-trip on-duty, then driving split around a 30-min break if needed, then post-trip on-duty
  const onPre = Math.min(on, 0.5);
  add('ON', Math.round(onPre * 60));
  if (drive > 8) {
    add('D', 480);
    add('OFF', 30);
    add('D', Math.round((drive - 8) * 60));
  } else {
    add('D', Math.round(drive * 60));
  }
  add('ON', Math.round((on - onPre) * 60));
  // The rest of the day is off duty: "set" replaces the whole day, and leaving it unlogged raised the
  // "unlogged time" warning and a provisional verdict for a day the driver had just filled in (L1).
  const off = (start: number, end: number) => { if (end > start) segs.push({ status: 'OFF', start, end, note: 'recap entry', createdAt }); };
  const workEnd = Math.min(t, dayEnd);
  if (segs.length) { off(dayStart, segs[0].start); off(workEnd, dayEnd); } else off(dayStart, dayEnd);
  return [...kept, ...segs].sort((a, b) => a.start - b.start);
}

/**
 * Apply an edit to one segment, matched by identity so every other entry keeps its reference (the
 * delete control and the undo snapshot both depend on that).
 */
export function applySegmentEdit(s: State, orig: Segment, next: Partial<Segment>): Pick<State, 'segments' | 'tentative'> {
  // An edit is a new entry: stamp it so it wins over the row it corrects rather than losing to it.
  const bump = (list: Segment[]) => list.map((x) => (x === orig ? { ...x, ...next, createdAt: stamp() } : x));
  return { segments: bump(s.segments), tentative: bump(s.tentative) };
}

/**
 * Restore a state from an exported payload (see `exportState`).
 *
 * Everything the export carries comes back — including the trip scenario, which the old inline
 * import dropped, so a backup/restore silently lost it. `nowOverride` is deliberately NOT restored:
 * a simulated clock must never come back on its own and quietly make the app lie about the time.
 */
export function applyImportedState(cur: State, d: Partial<State>): Partial<State> {
  return {
    segments: d.segments ?? [],
    tentative: d.tentative ?? [],
    current: d.current ?? null,
    config: sanitizeConfig(d.config, cur.config),
    mph: d.mph ?? cur.mph,
    trip: { ...DEFAULT_TRIP, ...(d.trip ?? {}) },
    bugEmail: typeof d.bugEmail === 'string' ? d.bugEmail : cur.bugEmail,
  };
}

const STATUSES = new Set(['OFF', 'SB', 'D', 'ON']);
const rowProblem = (x: unknown): string | null => {
  if (!x || typeof x !== 'object') return 'is not an entry';
  const r = x as Record<string, unknown>;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return 'has no valid duty status';
  if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) return 'has no valid start/end time';
  if ((r.end as number) <= (r.start as number)) return 'ends before it starts';
  return null;
};

/**
 * Check that a file is an HOS Sandbox export before it is allowed to replace anything. A JSON file
 * without a `segments` array used to import as an empty log, silently wiping the driver's record
 * (bug report C1). Returns a driver-facing reason, or null when the payload is usable.
 */
export function importProblem(d: unknown): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'This is not an HOS Sandbox export (expected a JSON object).';
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.segments)) return 'This is not an HOS Sandbox export: it has no "segments" list.';
  if (o.tentative !== undefined && !Array.isArray(o.tentative)) return 'The "tentative" field is not a list.';
  for (const [name, list] of [['segments', o.segments], ['tentative', (o.tentative ?? []) as unknown[]]] as const) {
    for (let i = 0; i < list.length; i++) {
      const p = rowProblem(list[i]);
      if (p) return `Entry ${i + 1} in "${name}" ${p}. Nothing was imported.`;
    }
  }
  if (o.current !== undefined && o.current !== null) {
    const c = o.current as Record<string, unknown>;
    if (typeof c !== 'object' || typeof c.status !== 'string' || !STATUSES.has(c.status) || !Number.isFinite(c.since)) return 'The current status in this file is not valid. Nothing was imported.';
  }
  if (o.config !== undefined && (o.config === null || typeof o.config !== 'object')) return 'The settings in this file are not valid. Nothing was imported.';
  return null;
}

/** Materialize the open segment up to `now` so the engine sees it. */
export function allSegments(s: State, now: number): Segment[] {
  const out = [...s.segments];
  // A live status saved before entries were stamped has no tap time; treat it as the newest entry.
  if (s.current && now > s.current.since) out.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note ?? 'current', createdAt: s.current.createdAt ?? Number.MAX_SAFE_INTEGER });
  return [...out, ...s.tentative];
}

/** A row's note for comparison: the live row's placeholder `current` counts as no note. */
const noteKey = (r: Segment) => (r.note === 'current' ? undefined : r.note ?? undefined);

/**
 * The resolved timeline, joined the way the LOG should show it: touching rows are joined only when
 * their LABEL matches too — same status, same note, same what-if flag.
 *
 * The engine's own merge joins on status alone and keeps the first row's note. That is right for the
 * clocks (a personal-conveyance row and a plain off-duty row are both off duty) but wrong for a list
 * that names each row by its note: "personal conveyance 06:00-06:30" followed by plain off duty showed
 * as one "Personal conveyance 06:00 → now" row, overstating PC time on the driver's own log. Personal
 * conveyance cannot be used to extend the duty day (§395.8 Q26), so an inflated PC row is exactly what
 * an auditor picks up. Rows are copied, never mutated: this is a display, not the record.
 */
export function joinDisplayRows(rows: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of rows) {
    const last = out[out.length - 1];
    if (last && last.status === s.status && last.end === s.start && !!last.tentative === !!s.tentative && noteKey(last) === noteKey(s)) last.end = s.end;
    else out.push({ ...s });
  }
  return out;
}

/**
 * How long the driver has been continuously in the status he is in now — the number in the header pill.
 *
 * Measured on the clocks' own timeline, so the pill and the clocks can never disagree. It used to be
 * measured from the raw tap times: a driver who tapped Off Duty at 06:00 and then added a correction
 * "drove 05:30-06:30" saw "Off Duty · 10h" at 16:00 while the same screen said "drive again at 16:30" —
 * the pill over-counted rest by exactly the correction (round-5 retest). Resolving the timeline also
 * joins the back-to-back rows an old duplicate tap left behind (driver report, 2026-10-04).
 *
 * The timeline is resolved but NOT merged: merging keeps the first row's note and would fold personal
 * conveyance into a later plain off-duty run. A row continues the run only if it has the same status and
 * the same note; the live row's placeholder note "current" counts as no note.
 */
export function currentRunStart(s: State, now: number): number {
  if (!s.current || now <= s.current.since) return now;
  const status = s.current.status, note = s.current.note ?? undefined;
  const rows = normalize(allSegments(s, now).filter((r) => !r.tentative), { merge: false });
  let i = rows.length - 1;
  // A correction that runs right up to now leaves nothing of the live status: 0m.
  if (i < 0 || rows[i].end !== now || rows[i].status !== status || noteKey(rows[i]) !== note) return now;
  let start = rows[i].start;
  for (i--; i >= 0; i--) {
    const r = rows[i];
    if (r.end !== start || r.status !== status || noteKey(r) !== note) break;
    start = r.start;
  }
  return start;
}

export const STATUS_LABEL: Record<DutyStatus, string> = { OFF: 'Off Duty', SB: 'Sleeper', D: 'Driving', ON: 'On Duty' };
export const STATUS_COLOR: Record<DutyStatus, string> = { OFF: 'var(--muted)', SB: 'var(--accent)', D: 'var(--good)', ON: 'var(--warn)' };

/**
 * 'night' is the product default and needs no attribute — `:root` carries the night palette.
 * 'day' sets `data-theme="day"` on the document root. Not part of the export: this is a
 * device preference, like `logResolved`, and a restored backup should not change how your screen
 * looks.
 */
export type Theme = 'night' | 'day';
export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return; // the node test harness has no DOM
  const root = document.documentElement;
  if (t === 'day') root.setAttribute('data-theme', 'day');
  else root.removeAttribute('data-theme');
  // Keep the browser chrome (address bar, status bar, PWA title bar) on the ACTIVE palette. Hardcoded
  // in index.html it would show a dark strip above the light app on a fresh install.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'day' ? '#f2f5fa' : '#0f1420');
}
/** Sub-statuses drivers think in. For HOS math PC is plain OFF and YM is plain ON (§395.2 / FMCSA guidance). */
export const SUB_STATUS: Record<string, string> = { PC: 'Personal conveyance', YM: 'Yard move' };
export function segLabel(status: DutyStatus, note?: string): string {
  return note && SUB_STATUS[note] ? `${SUB_STATUS[note]} (${status})` : STATUS_LABEL[status];
}

/** Everything a bug report needs. Kept small enough to paste into an email. */
export function exportState(s: State): string {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent, segments: s.segments, tentative: s.tentative, current: s.current, config: s.config, mph: s.mph, trip: s.trip, bugEmail: s.bugEmail, nowOverride: s.nowOverride });
}
