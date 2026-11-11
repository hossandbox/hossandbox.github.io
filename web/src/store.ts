import { useEffect, useState } from 'preact/hooks';
import type { Segment, RulesConfig, DutyStatus, TripInput, TripPlan, TripStrategy, FullEvaluation } from '../../engine/src/index.ts';
import { DEFAULT_CONFIG, normalize, carrierDayStart, nextCarrierDayStart, dayLabel, evaluate, minutesOf, LIMITS, planTrip, planTripAll, pruneHistory, driveAgainAt, TRIP_STRATEGIES } from '../../engine/src/index.ts';

/**
 * The live status. `createdAt` is the stamp() taken when it was tapped: overlap resolution treats the
 * live row as an entry made at that moment, so a correction typed later still wins, while a row typed
 * earlier (e.g. "off 08:00 → 22:00" before dispatch called) can no longer hide live driving
 * (stress-test round 2, §2.1).
 */
export interface OpenSegment { status: DutyStatus; since: number; note?: string; createdAt?: number }

/**
 * A day-close bookmark (patch 13): the driver tapped "End my day" and meant it. OFF duty is a
 * status; this is a deliberate close of the DAY — a label the history view prints on the day it
 * belongs to, and nothing more. `dayStart` is that carrier day (terminal zone, the same day
 * math as Recap/history) and `at` the tap moment, both epoch minutes. App-layer only: no rule
 * math reads a bookmark, ever.
 */
export interface DayClose { dayStart: number; at: number }

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
   * Which main card Now shows (capstone C1, audit §2.6 — decision D2-A): the dial the app has
   * always had, or the Timeline (the four limits as lanes ending at their clock times, on one
   * axis). A display preference in the style of `theme`: it lives in the state object (no new
   * storage key) and is NOT exported. INITIAL_STATE says 'dial'; the first full-disclaimer
   * acknowledgement on a fresh device (no segments, no current status) flips it to 'timeline'
   * (decision C1-A, in app.tsx's acknowledgeDisclaimer), so new installs open on the Timeline
   * while existing installs keep the dial they learned. parseSaved guards it: anything that
   * is not the literal 'timeline' reads as 'dial' — the familiar surface is the careful side.
   */
  nowCard: 'dial' | 'timeline';
  /**
   * The one-time Timeline chip has been answered (capstone C1-A): an existing install on the
   * dial sees "New: your limits on a timeline — [Show me] [Keep the dial]" once, under the
   * hero; either tap — and the More → Planning switch — sets this, and it never shows again.
   * Counts only as a literal true, like disclaimerAcked: a save from before the field existed
   * reads as not asked, which is what puts the chip in front of existing installs exactly once.
   */
  nowCardAsked: boolean;
  /**
   * The driver has tapped "I understand" on the full startup disclaimer at least once (patch 7).
   * Later launches show the compact version instead; a save from before this flag existed has it
   * missing, which the merge reads as false — the full box shows once more, then compact.
   */
  disclaimerAcked: boolean;
  /**
   * When the record was seeded from the four ELD clocks (patch 8), else null. Informational —
   * the rows themselves carry the provenance (see ELD_SEED_NOTE); this just dates the seeding.
   * A save from before the field existed has it missing, which parseSaved reads as null.
   */
  seededAt: number | null;
  /**
   * Day-close bookmarks (patch 13), one per closed carrier day — the history view spans eight
   * days, so each closed day keeps its own closing time. Sanitised on load by
   * sanitizeDayCloses: a save from before the field existed, and a damaged list alike, read as
   * only their well-formed entries.
   */
  dayCloses: DayClose[];
  /**
   * The driver has confirmed the home terminal time zone. Until then the app is using the phone's
   * zone, which is wrong for a driver who installed while on the road — and a wrong zone silently
   * moves day boundaries and corrupts the recap. So it is asked for rather than assumed (round-3 item 3).
   */
  tzChosen: boolean;
  /**
   * The zone pair the driver has acknowledged on the collapsed two-zones line (patch 16,
   * decision D5-A): "device zone|terminal zone". While it differs from the pair in play the
   * line stands open; once it matches, the line stays one line. It re-opens on its own when
   * either zone changes, because it is the pair that is stored, not a bare yes.
   */
  zoneAck: string | null;
  /** simulated "now" for testing; null = wall clock */
  nowOverride: number | null;
  /**
   * Which screen is showing. 'now' is home (redesign, 2026-10-10); 'split', 'trip' and 'load' are the
   * planning screens; 'settings' is labelled "More". Navigation, not data: every
   * launch opens on 'now' (see parseSaved).
   */
  tab: 'now' | 'log' | 'plan' | 'split' | 'recap' | 'trip' | 'load' | 'settings' | 'history';
  /**
   * Where a planning screen's back button returns to: the screen the driver entered it from
   * (patch 7.1). 'load' is entered from Now (patch 7), from the Plan hub, and from Recap;
   * 'split' from the hub. Before this field the back buttons were hard-wired
   * to Plan, so a driver who came from Now landed on Plan instead (Lorico, on his Pixel, live
   * patch 7). Defaults to 'plan' — the behaviour before the field existed — and parseSaved takes
   * only the three real origins, so an old or damaged save behaves exactly as the app did before.
   */
  planReturn: 'now' | 'plan' | 'recap';
  /** where "Report a bug" sends mail */
  bugEmail: string;
  /** Sound, vibration and notification alerts while driving (driver report 2026-10-06). Device setting: not exported. */
  alertsOn: boolean;
  /** Keep the screen on while the status is Driving, so a mounted phone keeps running its alerts. Device setting. */
  keepAwake: boolean;
  /** Show the full-screen driving view on Now while the status is Driving (redesign). Device setting. */
  drivingView: boolean;
  /**
   * "Dark driving screen at night" (patch 16, decision D1-A): between 19:00 and 07:00 on the
   * phone's own clock the driving view wears the night palette, whatever theme the rest of
   * the app is using. Device setting: not exported, like the other driving-view settings.
   */
  darkDriveAtNight: boolean;
  /**
   * "Speak driving alerts" (patch 17, M3 — decision D7-A): the driving alerts and the
   * status-tap confirmation are read aloud. Device setting: not exported. Unlike the other
   * device settings this one defaults OFF and may only ever be turned on by the driver's own
   * answer (the one-time question, or the Settings switch): D7-A is a consent gate, so a
   * save that predates the field, or a damaged one, never turns speech on by itself.
   */
  speakAlerts: boolean;
  /** The D7-A question has been asked and answered (either way). Asked once, never again. */
  speechAsked: boolean;
  /**
   * The D7-A question is on screen. Transient UI in the style of `tab`: parseSaved always
   * reads it back as closed, so a launch never reopens a question the driver walked away from.
   */
  speakAskOpen: boolean;
  /**
   * The driver's break buttons for the Log's add panel (driver report 2026-10-13: "I can't find a way to
   * add break"). A break is not a duty status: each button is a name, a length and the status the driver
   * actually logs it as. Device setting, like the alerts: not exported.
   */
  breakPresets: BreakPreset[];
}

const KEY = 'hos-sandbox-v1';
/** The save the current one replaced, kept by setState as the last-known-good copy (see loadSaved). */
const BACKUP_KEY = 'hos-sandbox-v1-backup';
/** The simulated clock's quarantine snapshot: the record as it stood when the simulated clock was set (patch 15; written by setState below, restored by useRealClock in app.tsx). */
export const SIM_KEY = 'hos-sandbox-v1-sim';
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
/**
 * "Can I take this load?" (redesign 4/5: its own step-by-step screen under Plan). `leaveIn` is minutes
 * from now; until then the driver is on duty unless `waitOff` — unlogged waiting is never assumed to be
 * rest (consumer-review-2). `answered` = the steps were completed once, so the screen reopens on the
 * answer rather than the first question.
 */
/*
 * Capstone C3 (audit §3 M7, dispatch mode): `appt` is the receiver's appointment, an absolute
 * minute (epoch minutes); null or absent = "no appointment". It lives inside the existing load
 * draft (no new storage key), is sanitized like the other draft fields (a value that is not
 * null or a whole dateable minute falls back — on a damaged save, to none: the side that
 * claims nothing), and rides the export with the rest of `loadCheck`. Absent is a real state,
 * not a gap: a draft written before C3 has no key and must round-trip byte-identical (re-check
 * M8's import pin), so the key appears only once the driver answers the appointment question.
 */
export interface LoadCheckDraft { miles: number; dwell: number; dwellOff: boolean; leaveIn: number; waitOff: boolean; answered: boolean; appt?: number | null }
export const DEFAULT_LOADCHECK: LoadCheckDraft = { miles: 1200, dwell: 120, dwellOff: false, leaveIn: 0, waitOff: false, answered: false };

/** The state a fresh install starts from. Exported so the defaults are assertable, not folklore. */
/** One break button: what the driver calls it, how long it is, and how it is logged (never Driving or Sleeper). */
export interface BreakPreset { name: string; minutes: number; status: 'OFF' | 'ON' }
/** The federal one is the only default. A carrier's own breaks (a 20-minute paid break, a lunch) are the driver's to add. */
export const DEFAULT_BREAKS: BreakPreset[] = [{ name: '30-min break', minutes: 30, status: 'OFF' }];
export const MAX_BREAKS = 6;
/**
 * Break buttons read from storage or typed in Settings, made safe: a name of 1–24 characters, 5–240
 * minutes in steps of 5, Off or On only, at most six. Anything else is dropped, never guessed at.
 */
export function sanitizeBreaks(d: unknown): BreakPreset[] {
  if (!Array.isArray(d)) return DEFAULT_BREAKS.map((b) => ({ ...b }));
  const out: BreakPreset[] = [];
  for (const x of d) {
    if (out.length >= MAX_BREAKS || !x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 24) : '';
    const m = Number(r.minutes);
    if (!name || !Number.isFinite(m) || (r.status !== 'OFF' && r.status !== 'ON')) continue;
    out.push({ name, minutes: Math.min(240, Math.max(5, Math.round(m / 5) * 5)), status: r.status });
  }
  return out;
}
/** A logged row's note for a break: the name travels with the row, so renaming a button never relabels history. */
export const BREAK_NOTE = 'break:';
export const breakNote = (name: string) => `${BREAK_NOTE}${name}`;

export const INITIAL_STATE: State = {
  segments: [], tentative: [], current: null,
  config: { ...DEFAULT_CONFIG, timeZone: deviceTz },
  mph: 55, trip: { ...DEFAULT_TRIP }, split: { ...DEFAULT_SPLIT }, loadCheck: { ...DEFAULT_LOADCHECK },
  historyAcknowledged: false, logResolved: false, theme: 'day', themeChosen: false, themeNotice: false,
  nowCard: 'dial', nowCardAsked: false,
  disclaimerAcked: false, seededAt: null, dayCloses: [],
  tzChosen: false, zoneAck: null, nowOverride: null, tab: 'now', planReturn: 'plan', bugEmail: '', alertsOn: true, keepAwake: true, drivingView: true, darkDriveAtNight: true, speakAlerts: false, speechAsked: false, speakAskOpen: false,
  breakPresets: DEFAULT_BREAKS.map((b) => ({ ...b })),
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

/**
 * The farthest a timestamp may sit from the epoch and still be a date. The engine turns
 * minutes into Dates, and a finite-but-undateable value (1e12 minutes is the year 1.9M)
 * throws "Invalid time value" from deep inside it — so on every path that reads stored or
 * imported data, a timestamp outside the Date range is rejected like a non-finite one
 * (break-test #8). The JavaScript Date range is ±8.64e15 ms = ±1.44e11 minutes. Spelled
 * out as a plain function here because usableSave runs at module load, before the helpers
 * further down exist.
 */
export const MAX_DATE_MIN = 144_000_000_000;
/**
 * The bound dateable actually accepts: the raw Date limit minus a 400-day margin. The
 * engine needs headroom PAST every timestamp it is handed — carrier-day and window
 * arithmetic reach days beyond the value — and a timestamp at the limit itself, though
 * a perfectly good Date, still froze every tab (break-test #8, the boundary probed
 * after the first fix round). 400 days is far beyond the ~8 days that arithmetic can
 * reach, and far inside any timestamp a real record can hold.
 */
const DATEABLE_MAX = MAX_DATE_MIN - 400 * 1440;
export function dateable(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= DATEABLE_MAX;
}

/** A row with its note dropped when the note is not a string (see parseSaved, break-test #7). */
function fixNoteRow(r: Segment): Segment {
  return r && r.note !== undefined && typeof r.note !== 'string' ? { ...r, note: undefined } : r;
}

/*
 * The draft sanitizers' small helpers, defined up here rather than beside them (patch 15):
 * parseSaved now runs the same sanitizers the import path applies, and parseSaved runs at
 * module load — long before the sanitizers' own home further down — so everything they
 * touch has to exist this early. They are pure and depend on nothing else in the module.
 */
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const numIn = (v: unknown, lo: number, hi: number, fallback: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const boolAt = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);

export const SPLIT_MS = ['OFF', 'SB'] as const;
export const TRIP_UNTILS = ['OFF', 'SB', 'D', 'ON', 'CURRENT'] as const;
export const TRIP_VIEWS = ['reset10', 'split', 'restart34'] as const;

/**
 * Could this string be a save at all? parseSaved merges whatever JSON it is given, so a save that
 * parses but whose record lists are the wrong shape (a string where the segments belong) would flow
 * straight into the state and blank the app on every render, not just on load. Only a plain object
 * whose lists — when present — are lists of real rows, and whose live segment — when present — is
 * a real one, counts as usable.
 */
function usableSave(raw: string | null): raw is string {
  if (!raw) return false;
  try {
    const s: unknown = JSON.parse(raw);
    if (!s || typeof s !== 'object' || Array.isArray(s)) return false;
    const o = s as Record<string, unknown>;
    if (o.segments !== undefined && !Array.isArray(o.segments)) return false;
    if (o.tentative !== undefined && !Array.isArray(o.tentative)) return false;
    // The rows inside the lists get the same check rowProblem gives an imported file's entries:
    // each must be an object with a known duty status, finite start/end, and an end after its
    // start. parseSaved does not sanitize rows on the load path either, so without this a save
    // whose only defect is one malformed row counts as usable: the row flows straight into the
    // state, and setState rotates the save into the backup slot, evicting a genuinely good copy.
    // The optional fields (note, tentative, createdAt) are deliberately NOT checked — the import
    // path does not check them, and the rows the app itself writes carry them in varying
    // combinations. The statuses are spelled out here for the same reason as `current` below:
    // this runs at module load, before rowProblem and the STATUSES set further down exist.
    const rowOk = (x: unknown): boolean => {
      if (!x || typeof x !== 'object') return false;
      const r = x as Record<string, unknown>;
      if (r.status !== 'OFF' && r.status !== 'SB' && r.status !== 'D' && r.status !== 'ON') return false;
      if (!dateable(r.start) || !dateable(r.end)) return false;
      if ((r.end as number) <= (r.start as number)) return false;
      return true;
    };
    if (Array.isArray(o.segments) && !o.segments.every(rowOk)) return false;
    if (Array.isArray(o.tentative) && !o.tentative.every(rowOk)) return false;
    // The live segment gets the same check importProblem gives an imported file: present-and-not-null
    // means an object with a known duty status and a finite start. Nothing else sanitizes `current`
    // on the load path, so without this a save whose ONLY defect is a malformed one counts as usable:
    // it renders as a nonsense status row, and worse, setState rotates it into the backup slot,
    // evicting a genuinely good copy (Claudia's catch reviewing patch 5). The statuses are spelled
    // out here because this runs at module load, before the STATUSES set further down exists.
    if (o.current !== undefined && o.current !== null) {
      const c = o.current as Record<string, unknown>;
      if (typeof c !== 'object' || Array.isArray(c)) return false;
      if (c.status !== 'OFF' && c.status !== 'SB' && c.status !== 'D' && c.status !== 'ON') return false;
      if (!dateable(c.since)) return false;
    }
    return true;
  } catch { return false; }
}

/**
 * What a launch reads: the current save — or, when it is damaged (unparseable, or the wrong shape),
 * the last-known-good copy setState kept, so one bad write cannot blank the app or cost the driver
 * his record. Exported so tests can exercise it without a reload, like parseSaved.
 */
export function loadSaved(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (usableSave(raw)) return parseSaved(raw);
    const bak = localStorage.getItem(BACKUP_KEY);
    if (usableSave(bak)) return parseSaved(bak);
    // Neither slot is usable: start clean rather than parse a save usableSave has just
    // rejected — the merge would flow its wrong-shaped fields (a tally-shaped "segments",
    // say) straight into the state, and no path ever re-checks the shape, so the driver
    // lands on a recovery card no offered fix can clear (break-test #9).
    return INITIAL_STATE;
  } catch { return INITIAL_STATE; }
}

/** What load() does with the saved string (exported so tests can exercise it without a reload). */
export function parseSaved(raw: string | null): State {
  try {
    if (!raw) return INITIAL_STATE;
    const s = JSON.parse(raw);
    const merged: State = { ...INITIAL_STATE, ...s,
      config: sanitizeConfig(s.config),
      // The drafts go through the same sanitizers the import path applies (applyImportedState):
      // this merge used to spread them raw, so a damaged save could hang the Split tab on a
      // 1e9-minute draft or print "Range NaN mi" from a string mph (break-test #6).
      trip: sanitizeTrip(s.trip, INITIAL_STATE.trip),
      split: sanitizeSplit(s.split, INITIAL_STATE.split),
      loadCheck: sanitizeLoadCheck(s.loadCheck, INITIAL_STATE.loadCheck),
      // a save from before break buttons has none: it gets the default; a damaged list is cleaned, not trusted
      breakPresets: s.breakPresets === undefined ? DEFAULT_BREAKS.map((b) => ({ ...b })) : sanitizeBreaks(s.breakPresets) };
    // A saved zone the engine cannot use was replaced by sanitizeConfig. Replacing it silently would move
    // every day boundary without a word, so ask again through the first-run zone prompt instead.
    if (typeof s.config?.timeZone === 'string' && s.config.timeZone !== merged.config.timeZone) merged.tzChosen = false;
    // Every launch opens on Now: the screen a driver opens the app for. The last tab is navigation, not
    // data, and reopening into a half-finished planning screen hides the clocks (redesign, 2026-10-10).
    merged.tab = 'now';
    // The planning screens' back target counts only as one of the three real origins: a save from
    // before the field existed (missing) and a damaged one (anything else) both read as 'plan',
    // which is where those buttons went before the field existed.
    if (s.planReturn !== 'now' && s.planReturn !== 'plan' && s.planReturn !== 'recap') merged.planReturn = 'plan';
    // Legacy save: night was the DEFAULT when it was written, so a stored 'night' far more often means
    // "never touched it" than "chose night" — and `themeChosen` did not exist yet to tell them apart
    // (round-3 item 2). Move it to the new day default once, and raise a notice rather than rewriting
    // the driver's screen in silence.
    if (!('themeChosen' in s) && merged.theme === 'night') {
      merged.theme = 'day';
      merged.themeNotice = true;
    }
    // The compact disclaimer is earned by one tap on the full box, so the flag counts only as a
    // literal true: a save from before patch 7 (missing) and a damaged one (anything else) both
    // read as not acknowledged, and the full box shows once more.
    if (s.disclaimerAcked !== true) merged.disclaimerAcked = false;
    // The Now main card (capstone C1-A): only the literal 'timeline' counts. A save from
    // before the field existed (missing) and a damaged one (anything else) both read as
    // 'dial' — the surface every existing driver already knows is the careful default. A
    // save so damaged that it falls back to INITIAL_STATE is treated as a fresh device at
    // the next acknowledgement (HANDOFF-C1 judgment call 10). The
    // one-time chip's flag counts only as a literal true, like disclaimerAcked above.
    if (s.nowCard !== 'timeline') merged.nowCard = 'dial';
    if (s.nowCardAsked !== true) merged.nowCardAsked = false;
    // The dark-driving-screen switch (patch 16) counts only as a literal boolean: a save from
    // before the field existed (missing) and a damaged one (anything else) both read as the
    // default, on.
    if (typeof s.darkDriveAtNight !== 'boolean') merged.darkDriveAtNight = true;
    // Spoken alerts (patch 17, D7-A) invert that rule on purpose: speech counts only as a
    // literal boolean the driver's own answer wrote, and anything else — a save from before
    // the field existed, or a damaged one — reads as NOT asked and NOT on. A default-on
    // repair here would put words in the driver's cab that he never agreed to.
    if (typeof s.speakAlerts !== 'boolean') merged.speakAlerts = false;
    if (typeof s.speechAsked !== 'boolean') merged.speechAsked = false;
    // Consent is the pair (Verify-17 F2): an un-asked device is never "on", however the
    // toggle field was damaged — otherwise Settings would show the switch ON for a device
    // that stays silent and asks again.
    if (merged.speechAsked !== true) merged.speakAlerts = false;
    // The spoken-alerts question is a moment, not a state: a launch never reopens it.
    merged.speakAskOpen = false;
    // The two-zones acknowledgement (patch 16) is the zone pair it was given for; anything
    // that is not that string reads as never given, so the line stands open and asks again.
    if (typeof s.zoneAck !== 'string') merged.zoneAck = null;
    // The ELD seed stamp counts only as a real minute: a save from before patch 8 (missing) and
    // a damaged one (anything else) both read as never seeded.
    if (typeof s.seededAt !== 'number' || !Number.isFinite(s.seededAt)) merged.seededAt = null;
    // The day-close bookmarks (patch 13) are labels, not record — a damaged one costs the label,
    // never the log. The list is rebuilt from its well-formed entries only, the same treatment
    // the other self-sanitising fields get above; usableSave never has to reject a whole save
    // over a bookmark, because this field can be fully repaired here.
    merged.dayCloses = sanitizeDayCloses(s.dayCloses);
    // mph counts only inside the range the import path clamps to; anything else is the default
    // (break-test #6 — a string mph made every range read "Range NaN mi").
    merged.mph = typeof s.mph === 'number' && Number.isFinite(s.mph) ? Math.min(100, Math.max(5, s.mph)) : INITIAL_STATE.mph;
    // A simulated "now" counts only as a real, dateable minute: a string or an out-of-range
    // number would blank every clock behind a "now" no reset could clear (break-test #6/#8).
    merged.nowOverride = dateable(s.nowOverride) ? s.nowOverride : null;
    // Notes are deliberately unvalidated at rest, so a damaged save can carry a non-string one —
    // and segLabel calls startsWith on it, blanking the app on every launch when it sits on the
    // live status. Drop any note that is not a string (break-test #7).
    if (Array.isArray(merged.segments)) merged.segments = merged.segments.map(fixNoteRow);
    if (Array.isArray(merged.tentative)) merged.tentative = merged.tentative.map(fixNoteRow);
    if (merged.current && merged.current.note !== undefined && typeof merged.current.note !== 'string') merged.current = { ...merged.current, note: undefined };
    return merged;
  } catch { return INITIAL_STATE; }
}

let state: State = loadSaved();
const subs = new Set<() => void>();

export function getState() { return state; }

/**
 * Snapshot the record exactly as it stands before a simulated-clock episode, so that
 * "Use real clock" can throw away everything the episode wrote (break-test #5). The
 * snapshot carries the whole editable record — rows, the live status, day closes, the
 * history acknowledgement and the config — because an episode can write any of them,
 * and the restore in useRealClock puts each back. Patch 15.2 completed the set with
 * seededAt and tzChosen, the last two fields an episode could leave behind: a seed
 * under the simulated clock set seededAt (flipping the cycle basis to "known" over
 * a record the driver never confirmed), and picking a zone set tzChosen (so a
 * driver who had never confirmed a zone was never asked again). Storage failing
 * leaves the episode unquarantined; it never blocks the write itself.
 */
function snapshotSimRecord(s: State) {
  try {
    const record = { segments: s.segments, tentative: s.tentative, current: s.current, dayCloses: s.dayCloses, historyAcknowledged: s.historyAcknowledged, config: s.config, seededAt: s.seededAt, tzChosen: s.tzChosen };
    localStorage.setItem(SIM_KEY, JSON.stringify({ record }));
  } catch { /* storage failing leaves the session's writes unquarantined, never blocks the write */ }
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  // The simulated clock's quarantine snapshot is taken HERE, at the moment the clock
  // is set — the nowOverride null → value edge (patch 15.1). Patch 15 took it at the
  // first of four specific writes (a tap, End my day, Reopen, Start over), and every
  // other write path — a Split Lab commit, the ELD seed, a Log edit, a drift fill, a
  // Recap set, an import — wrote straight into the real record (break-test #5, holes
  // H1–H4). On the edge, ANY way the clock gets set snapshots the pre-sim record, so
  // every later write is quarantined by construction. Within an episode there is no
  // second edge — the value changing, or any other write, keeps the first snapshot,
  // which is the real record.
  if (state.nowOverride === null && p.nowOverride != null) snapshotSimRecord(state);
  state = { ...state, ...p };
  // Autosave, with the save being replaced kept as the last-known-good copy: if the new write is
  // ever found damaged, loadSaved falls back to it instead of a fresh, empty record. Only a usable
  // save is kept — rotating a damaged one in would destroy the very copy the fallback needs.
  const prev = localStorage.getItem(KEY);
  const next = JSON.stringify(state);
  if (prev && prev !== next && usableSave(prev)) localStorage.setItem(BACKUP_KEY, prev);
  localStorage.setItem(KEY, next);
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
  // A tap BEFORE the open status's start would close nothing and replace the open status
  // outright — the time already spent in it silently vanished (a clock set backwards, or a
  // simulated "now" moved behind it; break-test #4). Refuse instead: a tap never discards
  // logged duty time. A tap in the very minute the status began is different — nothing has
  // elapsed yet, nothing is lost, and patch 13's day-close rule depends on it landing (a
  // mis-tap corrected at once, work begun in the close minute reopening the day).
  if (cur.current && now < cur.current.since) return null;
  const segments = [...cur.segments];
  // The closed row keeps the stamp from when it was tapped, so a correction typed while it was live
  // still wins over it after it closes.
  if (cur.current && now > cur.current.since) segments.push({ status: cur.current.status, start: cur.current.since, end: now, note: cur.current.note, createdAt: cur.current.createdAt ?? stamp() });
  return { segments, current: { status, since: now, note, createdAt: stamp() } };
}

/* ============================================================ the day-close bookmark (patch 13) */

/** Bookmarks are labels, not records: keep enough for the history window and then some. */
export const MAX_DAY_CLOSES = 40;

/**
 * Rebuild the bookmark list from whatever a save carried: only plain entries whose dayStart and
 * at are both finite minutes, with the close not before its own day began, survive — one per
 * carrier day (a day closed twice keeps the latest close), oldest first, capped at the most
 * recent MAX_DAY_CLOSES. Anything else in the list is dropped, entry by entry, so a damaged
 * bookmark can never cost the driver his log.
 */
export function sanitizeDayCloses(d: unknown): DayClose[] {
  if (!Array.isArray(d)) return [];
  const byDay = new Map<number, number>();
  for (const x of d) {
    if (!x || typeof x !== 'object') continue;
    const dayStart = (x as DayClose).dayStart, at = (x as DayClose).at;
    if (!Number.isFinite(dayStart) || !Number.isFinite(at) || at < dayStart) continue;
    if (at > (byDay.get(dayStart) ?? -Infinity)) byDay.set(dayStart, at);
  }
  return [...byDay.entries()]
    .map(([dayStart, at]) => ({ dayStart, at }))
    .sort((a, b) => a.dayStart - b.dayStart)
    .slice(-MAX_DAY_CLOSES);
}

/**
 * The ONE validity rule for a bookmark, shared by the close action's idempotency test, the Now
 * screen's closed state and the history view's closing line, so the three can never disagree:
 * a bookmark is honoured only while nothing logged starts after it INSIDE its own carrier day,
 * and no Driving or On-duty time runs at or across the close either — work that begins in the
 * very minute of the close, or that straddles it, is work after it in every way that matters
 * (Verify-13 defect A1; a bookmark whose close falls outside its own carrier day — A3 — is
 * never honoured).
 * Work on a later day never reopens an earlier closed day, and what-if time — the tentative
 * list and tentative-flagged rows — never counts: planning is not activity. The rule is derived
 * from the log rather than cleared eagerly in every mutation path, so a new way of writing the
 * log cannot forget to reopen the day, and undo — which restores the log — restores the
 * bookmark's meaning with it.
 */
export function dayCloseFor(s: State, dayStart: number): DayClose | null {
  const bm = s.dayCloses.find((c) => c.dayStart === dayStart);
  if (!bm) return null;
  const dayEnd = nextCarrierDayStart(dayStart, s.config);
  if (bm.at >= dayEnd) return null;                                        // A3
  const breaks = (status: DutyStatus, start: number, end: number) =>
    (start > bm.at && start < dayEnd)                                      // existing rule
    || ((status === 'D' || status === 'ON') && start <= bm.at && end > bm.at); // A1/A2: work at/over the close
  if (s.current && breaks(s.current.status, s.current.since, Infinity)) return null;
  for (const x of s.segments) if (!x.tentative && breaks(x.status, x.start, x.end)) return null;
  return bm;
}

/** Today's bookmark, when the day stands closed: the Now screen's question. */
export function dayCloseToday(s: State, now: number): DayClose | null {
  return dayCloseFor(s, carrierDayStart(now, s.config));
}

/**
 * The "End my day" tap as one pure patch (the statusTap pattern): the open status closes at
 * the tap moment into a normal logged segment, OFF duty opens at the tap moment, and the
 * bookmark for the tap's carrier day is recorded — a single patch, so the app's undo machinery
 * restores all three together. Idempotent: a day that already stands closed returns null.
 * Re-closing a day that was reopened by later activity replaces its stale bookmark.
 */
export function dayClosePatch(cur: State, now: number): Partial<State> | null {
  const dayStart = carrierDayStart(now, cur.config);
  if (dayCloseFor(cur, dayStart)) return null;
  const tap = statusTap(cur, 'OFF', undefined, now);
  const closes = [...cur.dayCloses.filter((c) => c.dayStart !== dayStart), { dayStart, at: now }]
    .sort((a, b) => a.dayStart - b.dayStart)
    .slice(-MAX_DAY_CLOSES);
  return { ...(tap ?? {}), dayCloses: closes };
}

/**
 * "Reopen": clears today's bookmark and ONLY today's bookmark — the segment the close wrote
 * and the OFF status it opened stay exactly as they are. Null when today carries no bookmark.
 */
export function reopenDayPatch(cur: State, now: number): Partial<State> | null {
  const dayStart = carrierDayStart(now, cur.config);
  if (!cur.dayCloses.some((c) => c.dayStart === dayStart)) return null;
  return { dayCloses: cur.dayCloses.filter((c) => c.dayStart !== dayStart) };
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
 * The picker's friendly names for the zones drivers actually pick between (patch 7): the value
 * saved is still the IANA name — the engine and daylight-saving rules need it — but the list can
 * lead with the words a driver uses ("Central"), not a programmer's path. Zones not listed here
 * show their IANA name, exactly as before.
 */
export const ZONE_LABELS: Record<string, string> = {
  'America/New_York': 'Eastern — New York',
  'America/Chicago': 'Central — Chicago',
  'America/Denver': 'Mountain — Denver',
  'America/Phoenix': 'Mountain, no daylight time — Phoenix',
  'America/Los_Angeles': 'Pacific — Los Angeles',
  'America/Anchorage': 'Alaska — Anchorage',
  'Pacific/Honolulu': 'Hawaii — Honolulu',
  'America/Toronto': 'Eastern — Toronto',
  'America/Winnipeg': 'Central — Winnipeg',
  'America/Edmonton': 'Mountain — Edmonton',
  'America/Vancouver': 'Pacific — Vancouver',
  'UTC': 'UTC',
};
export const zoneLabel = (z: string): string | undefined => ZONE_LABELS[z];
/** A zone's short name for one-line use ("Central", "Eastern"): the friendly label's head, or the IANA name when the zone is unlisted. */
export const zoneShort = (z: string): string => (zoneLabel(z) ?? z).split(' — ')[0];

/**
 * An invalid zone makes `Intl.DateTimeFormat` throw inside the engine, which would blank every tab.
 * Nothing may reach `config.timeZone` unless it passes this.
 */
/**
 * A zone the driver may pick: one of the listed Area/City names (any letter case), or UTC. Old short
 * names are valid to the browser but not accepted here: "EST" and "MST" never switch to daylight saving
 * time while "CST" and "PST" do, so a driver who typed "EST" for an Eastern terminal would be an hour off
 * all summer with nothing on screen to say so (re-check). Returns the canonical spelling, or null.
 */
export function listedZone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^(etc\/)?utc$/i.test(t)) return 'UTC';
  const listed = TIME_ZONES.find((z) => z.toLowerCase() === t.toLowerCase());
  if (listed) return listed;
  // Older browsers list only a dozen zones, so also accept any Area/City name the browser knows (it
  // follows daylight time where that city does). Never the Etc/ offsets or a bare short name.
  if (!/^[a-z]+\/[a-z0-9_+\-/]+$/i.test(t) || /^etc\//i.test(t) || !isValidTimeZone(t)) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: t }).resolvedOptions().timeZone; } catch { return null; }
}
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
  // A record seeded from the ELD clocks (patch 8) states the whole cycle in the driver's own
  // numbers — the seed's rows ARE that statement, synthesized across the window — so the basis
  // is known while any seeded row stands, even though the rows span less than the window on
  // the clock. Without this the seeded Load verdict claimed it "assumes you started from
  // zero", the opposite of what the driver just told it (break-test #10).
  if (s.seededAt !== null && s.segments.some((x) => x.note === ELD_SEED_NOTE)) return 'known';
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
  liveCreatedAt?: number,
): Segment[] {
  // The generated rows are stamped BELOW the live status's own stamp whenever the caller
  // passes it: the filler that pads the rest of the day out to its end is unlogged time the
  // engine merges with the live span, and overlap resolution drops the OLDER-stamped row
  // where they collide — stamped "now", the filler won and erased live driving the driver
  // was still doing (break-test #1). An unstamped live status needs no help: allSegments
  // already treats it as the newest entry there is.
  const genStamp = liveCreatedAt !== undefined && Number.isFinite(liveCreatedAt) ? Math.min(createdAt, liveCreatedAt - 1) : createdAt;
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
    if (end > start) segs.push({ status, start, end, note: 'recap entry', createdAt: genStamp });
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
  const off = (start: number, end: number) => { if (end > start) segs.push({ status: 'OFF', start, end, note: 'recap entry', createdAt: genStamp }); };
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
/*
 * An imported file's DRAFTS used to be merged with no checks at all: a Split Lab draft of
 * {drive: 1e9} made the screen unresponsive for minutes and a 10,000,000-mile load produced nonsense
 * (a tester, re-check 2, R2). They are UI state, but they are consumed by real math, so each field is
 * checked the way an imported config already was: a value the controls could not have produced falls
 * back to the default (or to what is on screen), and finite numbers are clamped to the allowed range.
 * `mph`, `current` and the trip draft had the same gap. (The helpers themselves — isObj, numIn,
 * boolAt, oneOf and the allowed-value lists — live near the top of the file: since patch 15 the
 * load path runs these same sanitizers, and the load path runs at module load.)
 */
export function sanitizeSplit(d: unknown, fallback: SplitDraft): SplitDraft {
  if (!isObj(d)) return fallback;
  return {
    b1: numIn(d.b1, 0, 600, fallback.b1),
    b1s: oneOf(d.b1s, SPLIT_MS, fallback.b1s),
    dwell: numIn(d.dwell, 0, 240, fallback.dwell),
    drive: numIn(d.drive, 0, 660, fallback.drive),
    b2: numIn(d.b2, 0, 600, fallback.b2),
    b2s: oneOf(d.b2s, SPLIT_MS, fallback.b2s),
  };
}

export function sanitizeLoadCheck(d: unknown, fallback: LoadCheckDraft): LoadCheckDraft {
  if (!isObj(d)) return fallback;
  return {
    miles: numIn(d.miles, 1, 3000, fallback.miles),
    dwell: numIn(d.dwell, 0, 1440, fallback.dwell),
    dwellOff: boolAt(d.dwellOff, fallback.dwellOff),
    leaveIn: numIn(d.leaveIn, 0, 1440, fallback.leaveIn),
    waitOff: boolAt(d.waitOff, fallback.waitOff),
    answered: boolAt(d.answered, fallback.answered),
    // A draft saved or exported before appointments existed has none: absent stays absent.
    ...('appt' in d ? apptField(sanitizeAppt(d.appt, fallback.appt ?? null)) : {}),
  };
}
// A hoisted declaration, not a const arrow: loadSaved → parseSaved runs at MODULE LOAD, before a
// const further down this file is initialised (a const here threw in its TDZ and a relaunch with a
// saved appointment fell back to a blank state — caught by the c3 browser lane, run 21).
function apptField(v: number | null | undefined): { appt?: number | null } { return v === undefined ? {} : { appt: v }; }

/** The load draft's appointment (capstone C3, M7): null, or a whole dateable minute; anything else falls back. */
export function sanitizeAppt(v: unknown, fallback: number | null): number | null {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isInteger(v) && dateable(v)) return v;
  return fallback !== null && Number.isInteger(fallback) && dateable(fallback) ? fallback : null;
}

export function sanitizeTrip(d: unknown, fallback: TripDraft): TripDraft {
  if (!isObj(d)) return fallback;
  // A departure string that does not parse is the same class of defect as a non-finite number.
  const dep = d.dep === null ? null : typeof d.dep === 'string' && Number.isFinite(Date.parse(d.dep)) ? d.dep : fallback.dep;
  return {
    miles: numIn(d.miles, 1, 5000, fallback.miles),
    pre: numIn(d.pre, 0, 240, fallback.pre),
    stopMile: numIn(d.stopMile, 0, 5000, fallback.stopMile),
    stopMin: numIn(d.stopMin, 0, 1440, fallback.stopMin),
    stopOff: boolAt(d.stopOff, fallback.stopOff),
    dep,
    until: oneOf(d.until, TRIP_UNTILS, fallback.until),
    view: d.view === null ? null : oneOf(d.view, TRIP_VIEWS, fallback.view ?? 'reset10'),
  };
}

const DUTY = ['OFF', 'SB', 'D', 'ON'] as const;
/** The live status, checked: a bad one is the same class as a bad segment row. */
export function sanitizeCurrent(d: unknown): State['current'] {
  if (!isObj(d)) return null;
  const status = oneOf(d.status, DUTY, 'OFF' as const);
  if (!dateable(d.since)) return null;
  const out: NonNullable<State['current']> = { status, since: d.since as number };
  if (typeof d.note === 'string') out.note = d.note;
  if (Number.isFinite(d.createdAt)) out.createdAt = d.createdAt as number;
  return out;
}

export function applyImportedState(cur: State, d: Partial<State>): Partial<State> {
  return {
    // Rows come back raw from an import, and the renderers trust their notes to be strings —
    // a non-string note in the file is dropped here, the same repair the load path makes
    // (break-test #7). (The imported `current` is already note-safe via sanitizeCurrent.)
    segments: (d.segments ?? []).map(fixNoteRow),
    tentative: (d.tentative ?? []).map(fixNoteRow),
    current: 'current' in d ? sanitizeCurrent(d.current) : cur.current,
    config: sanitizeConfig(d.config, cur.config),
    mph: numIn(d.mph, 5, 100, cur.mph),
    trip: sanitizeTrip(d.trip, cur.trip),
    // The Split Lab plan and the load question came back from a backup too (re-check M8). A backup made
    // before they were exported has neither, and then what is on screen stays rather than being reset.
    split: 'split' in d ? sanitizeSplit(d.split, cur.split) : cur.split,
    loadCheck: 'loadCheck' in d ? sanitizeLoadCheck(d.loadCheck, cur.loadCheck) : cur.loadCheck,
    bugEmail: typeof d.bugEmail === 'string' ? d.bugEmail : cur.bugEmail,
  };
}

/** Names of the imported drafts whose values were unusable and got replaced, for the import message. */
export function draftResets(d: unknown, cur: State): string[] {
  if (!isObj(d)) return [];
  const out: string[] = [];
  const sameSplit = (a: SplitDraft, b: SplitDraft) =>
    a.b1 === b.b1 && a.b1s === b.b1s && a.dwell === b.dwell && a.drive === b.drive && a.b2 === b.b2 && a.b2s === b.b2s;
  const sameLoad = (a: LoadCheckDraft, b: LoadCheckDraft) =>
    a.miles === b.miles && a.dwell === b.dwell && a.dwellOff === b.dwellOff && a.leaveIn === b.leaveIn && a.waitOff === b.waitOff && a.answered === b.answered && (a.appt ?? null) === (b.appt ?? null);
  if (isObj(d.split) && !sameSplit(sanitizeSplit(d.split, cur.split), { ...DEFAULT_SPLIT, ...d.split } as SplitDraft)) out.push('the Split Lab plan');
  if (isObj(d.loadCheck) && !sameLoad(sanitizeLoadCheck(d.loadCheck, cur.loadCheck), { ...DEFAULT_LOADCHECK, ...d.loadCheck } as LoadCheckDraft)) out.push('the load question');
  if (isObj(d.trip)) {
    const raw = { ...DEFAULT_TRIP, ...d.trip } as TripDraft;
    const got = sanitizeTrip(d.trip, cur.trip);
    if (raw.miles !== got.miles || raw.pre !== got.pre || raw.stopMile !== got.stopMile || raw.stopMin !== got.stopMin || raw.dep !== got.dep || raw.until !== got.until || raw.view !== got.view) out.push('the trip plan');
  }
  return out;
}

const STATUSES = new Set(['OFF', 'SB', 'D', 'ON']);
const rowProblem = (x: unknown): string | null => {
  if (!x || typeof x !== 'object') return 'is not an entry';
  const r = x as Record<string, unknown>;
  if (typeof r.status !== 'string' || !STATUSES.has(r.status)) return 'has no valid duty status';
  if (!Number.isFinite(r.start) || !Number.isFinite(r.end)) return 'has no valid start/end time';
  if (!dateable(r.start) || !dateable(r.end)) return 'has a start/end time outside the range a date can hold';
  if ((r.end as number) <= (r.start as number)) return 'ends before it starts';
  return null;
};

/**
 * Check that a file is an HOS Sandbox export before it is allowed to replace anything. A JSON file
 * without a `segments` array used to import as an empty log, silently wiping the driver's record
 * (bug report C1). Returns a driver-facing reason, or null when the payload is usable.
 */
export function importProblem(d: unknown): string | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'This is not a Split Decision export (expected a JSON object).';
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.segments)) return 'This is not a Split Decision export: it has no "segments" list.';
  if (o.tentative !== undefined && !Array.isArray(o.tentative)) return 'The "tentative" field is not a list.';
  for (const [name, list] of [['segments', o.segments], ['tentative', (o.tentative ?? []) as unknown[]]] as const) {
    for (let i = 0; i < list.length; i++) {
      const p = rowProblem(list[i]);
      if (p) return `Entry ${i + 1} in "${name}" ${p}. Nothing was imported.`;
    }
  }
  if (o.current !== undefined && o.current !== null) {
    const c = o.current as Record<string, unknown>;
    if (typeof c !== 'object' || typeof c.status !== 'string' || !STATUSES.has(c.status) || !dateable(c.since)) return 'The current status in this file is not valid. Nothing was imported.';
  }
  if (o.config !== undefined && (o.config === null || typeof o.config !== 'object')) return 'The settings in this file are not valid. Nothing was imported.';
  return null;
}

/* ---------- "Adjust current status start" (patch 19) ---------- */

/**
 * Why an adjustment of the current status's start is refused:
 *  - 'none'    there is no current status to adjust;
 *  - 'invalid' the minute is not a whole, dateable minute, or the record it would leave fails
 *              the app's own record check (importProblem, the one an imported file must pass);
 *  - 'same'    it is the start the status already has — nothing to change;
 *  - 'future'  it is now or later: a current status always keeps its start in the past (the
 *              spirit of statusTap's guard — never leave current.since >= now);
 *  - 'erase'   it is at or before the start of the status being left, which would erase that
 *              status: an edit for the Log, not a start-time correction;
 *  - 'overlap' another logged entry covers part of the time the start would move across.
 */
export type AdjustStartProblem = 'none' | 'invalid' | 'same' | 'future' | 'erase' | 'overlap';
export type AdjustStartResult =
  | { ok: true; patch: Pick<State, 'segments' | 'current' | 'dayCloses'> }
  | { ok: false; problem: AdjustStartProblem };

/**
 * The status the current one follows: the logged (not what-if) row that ends exactly where
 * the current status starts — the row a status tap closed. When more than one row ends
 * there, the one that starts latest is the status that was actually being left. Null when
 * nothing abuts the current status (it is the first thing in the record, or unlogged time
 * sits before it).
 */
export function statusBeingLeft(s: Pick<State, 'segments' | 'current'>): Segment | null {
  if (!s.current) return null;
  let prev: Segment | null = null;
  for (const x of s.segments) if (!x.tentative && x.end === s.current.since && (!prev || x.start > prev.start)) prev = x;
  return prev;
}

/**
 * Move the CURRENT (open) status's start to an exact minute (patch 19; field report: a
 * driver went On Duty on his ELD at arrival and tapped the app seven minutes late — the
 * closed rows could be edited, the open one could not, so the app overstated his driving
 * by the late minutes). The boundary between the status being left and the current one
 * moves as ONE edge: the row that ends at the current start ends at the new start instead
 * — earlier shortens it by exactly the minutes moved, later lengthens it by exactly those
 * minutes — and no other row is touched (each keeps its reference, as applySegmentEdit's
 * callers rely on). Stamps are kept: this is the same tap, corrected, so anything typed
 * over either row since still wins over it.
 *
 * Pure, in the statusTap pattern: it returns the patch for setState — so the simulated
 * clock's quarantine and the save/backup rotation apply untouched — or the reason it is
 * refused, and a refusal changes nothing. See AdjustStartProblem for the guards. A
 * day-close bookmark written by the same tap (its `at` is the old start) moves with the
 * start while it stays inside its own carrier day; any other bookmark is left for the
 * store's one validity rule (dayCloseFor) to judge, as after every other edit.
 */
export function adjustCurrentStart(cur: State, newSince: number, now: number): AdjustStartResult {
  const no = (problem: AdjustStartProblem): AdjustStartResult => ({ ok: false, problem });
  if (!cur.current) return no('none');
  if (!Number.isInteger(newSince) || !dateable(newSince)) return no('invalid');
  const since = cur.current.since;
  if (newSince === since) return no('same');
  if (newSince >= now) return no('future');
  const prev = statusBeingLeft(cur);
  if (prev && newSince <= prev.start) return no('erase');
  // Any OTHER logged row inside the stretch the start moves across is a correction the
  // driver typed there on purpose; moving the edge through it would silently change what
  // that time counts as. That is a job for the Log's editor, where the overlap is shown.
  const lo = Math.min(since, newSince), hi = Math.max(since, newSince);
  for (const x of cur.segments) if (x !== prev && !x.tentative && x.end > lo && x.start < hi) return no('overlap');
  const segments = prev ? cur.segments.map((x) => (x === prev ? { ...x, end: newSince } : x)) : cur.segments;
  const current: OpenSegment = { ...cur.current, since: newSince };
  const dayCloses = cur.dayCloses.some((c) => c.at === since && carrierDayStart(newSince, cur.config) === c.dayStart)
    ? cur.dayCloses.map((c) => (c.at === since && carrierDayStart(newSince, cur.config) === c.dayStart ? { ...c, at: newSince } : c))
    : cur.dayCloses;
  // The record this leaves must pass the same check a file must pass to be imported.
  if (importProblem({ segments, tentative: cur.tentative, current }) !== null) return no('invalid');
  return { ok: true, patch: { segments, current, dayCloses } };
}

/**
 * One typed "minutes ago" box, whole minutes only — read by readEldEntry itself (an empty
 * hours box and this box as the minutes), so a fraction is refused here exactly the way
 * patch 9.2 refuses it in the drift check and the quick start: never rounded, never
 * converted. An empty box is not zero here: it is no answer yet ('empty').
 */
export type MinutesAgoRead = { ok: true; minutes: number } | { ok: false; problem: 'empty' | 'fraction' | 'junk' };
export function readMinutesAgo(text: string): MinutesAgoRead {
  if (text.trim() === '') return { ok: false, problem: 'empty' };
  const r = readEldEntry('', text);
  return r.ok ? { ok: true, minutes: r.minutes } : { ok: false, problem: r.problem };
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

/** One stretch of a carrier day in the reflection view: a logged row, or `status: null` for time no entry covers. */
export interface HistoryItem { start: number; end: number; status: DutyStatus | null; note?: string }
export interface HistoryDay {
  start: number; end: number; label: string; isToday: boolean;
  items: HistoryItem[];
  totals: Record<DutyStatus, number>;
  /** Minutes inside the day that no logged row covers — shown as not logged, never as rest. */
  notLogged: number;
}

/**
 * The last 8 carrier days as the driver actually logged them (patch 7.2) — the data behind the
 * read-only "Your last 8 days" reflection view. Pure selection and arithmetic over the record:
 * nothing here writes state, and nothing here touches the engine.
 *
 * Three fences, all deliberate:
 *  - LOGGED rows only. The tentative list is never read, and a row inside `segments` that is
 *    flagged tentative is dropped too: planned time must not pose as history. The live status
 *    counts — it is logged time, materialized up to now the way allSegments does it — or today
 *    would show nothing since the driver's last status change.
 *  - Unlogged time stays unlogged. A stretch no row covers comes back as a `status: null` item,
 *    never as off duty: going quiet is not the same as resting, and a view that filled gaps with
 *    rest would invent exactly the history it claims only to reflect.
 *  - Days are CARRIER days, rolled at dayStartHour in the terminal zone via the engine's own
 *    day arithmetic — the same boundaries Recap uses — not the phone's midnight.
 *
 * Rows are resolved (overlaps settled the way the clocks settle them) and joined for display the
 * way the Log's resolved timeline joins them, so the totals here are the totals the clocks count.
 * Today is clipped at `now`: the view never shows time that has not happened yet.
 */
export function historyDays(s: State, now: number): HistoryDay[] {
  const cfg = s.config;
  const logged: Segment[] = s.segments.filter((x) => !x.tentative);
  if (s.current && now > s.current.since) {
    logged.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note, createdAt: s.current.createdAt ?? Number.MAX_SAFE_INTEGER });
  }
  const resolved = joinDisplayRows(normalize(logged, { merge: false }));
  const starts: number[] = [];
  let start = carrierDayStart(now, cfg);
  for (let i = 0; i < 8; i++) { starts.unshift(start); start = carrierDayStart(start - 1, cfg); }
  return starts.map((dayStart, i) => {
    const dayEnd = i + 1 < starts.length ? starts[i + 1] : nextCarrierDayStart(dayStart, cfg);
    const until = Math.min(dayEnd, now);
    const totals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
    const items: HistoryItem[] = [];
    let cursor = dayStart;
    for (const r of resolved) {
      if (r.end <= dayStart || r.start >= until) continue;
      const a = Math.max(r.start, dayStart), b = Math.min(r.end, until);
      if (b <= a) continue;
      if (a > cursor) items.push({ start: cursor, end: a, status: null });
      items.push({ start: a, end: b, status: r.status, note: r.note });
      totals[r.status] += b - a;
      cursor = Math.max(cursor, b);
    }
    if (until > cursor) items.push({ start: cursor, end: until, status: null });
    const notLogged = items.reduce((n, x) => (x.status === null ? n + (x.end - x.start) : n), 0);
    return { start: dayStart, end: dayEnd, label: dayLabel(dayStart, cfg), isToday: i === starts.length - 1, items, totals, notLogged };
  });
}

/* ---------- "Start from my ELD clocks" (patch 8) ---------- */

/**
 * The note every row built from the four ELD clocks carries. Provenance lives on the rows, not
 * only in state, so it survives edits and exports and the estimate can be recognised wherever the
 * rows travel. `note` is the field the save validators deliberately leave unchecked (patch 5.2),
 * so seeded rows pass validation exactly like hand-typed ones, and a pre-patch-8 save — which
 * simply has no such rows — loads unchanged.
 */
export const ELD_SEED_NOTE = 'ELD clocks';

/** The four clocks, in minutes, exactly as the driver read them off the ELD's clocks screen. */
export interface EldClocks { driveLeft: number; windowLeft: number; breakDueIn: number; cycleLeft: number }

export interface EldSeed { segments: Segment[]; notes: string[]; anchor: number }

const WORK_SET = new Set(['D', 'ON']);

/** The cycle limit and window length for a config — the engine's own parameters, restated. */
export function cycleParamsOf(cfg: RulesConfig): { limit: number; windowDays: number } {
  return cfg.cycle === '60/7' ? { limit: LIMITS.CYCLE_60_7, windowDays: 7 } : { limit: LIMITS.CYCLE_70_8, windowDays: 8 };
}

/**
 * Build an ordinary record that makes the app's clocks read the four numbers the driver typed —
 * or less, never more.
 *
 * The layout, ending at `now`: a 10-hour rest (the reset the current shift counts from), then
 * inside the shift: on-duty filler for window time that was neither driving nor the break, the
 * driving done before the break — interrupted every ≤8 hours by 30 of those filler minutes,
 * since a longer unbroken stretch would itself break the 30-minute-break rule — a 30-minute
 * break, and the driving done since it. Earlier cycle
 * usage is one on-duty block ending right where that reset begins — placed as RECENTLY as the
 * numbers allow, so recap hours come back as LATE as possible, never early.
 *
 * Pessimism is the hard rule (the codebase's law for estimates: never optimistic). Each clock is
 * first clamped to its legal range; then, where the four numbers disagree among themselves, the
 * stricter reading wins and the loser comes out LOWER than typed — driving implied by the break
 * clock counts even when the drive clock denies it, and the window is stretched until it can hold
 * the driving and the break, which lowers the shift time left. Cycle time left likewise absorbs
 * the shift's own on-duty time. Every such adjustment is reported in `notes`, in driver words.
 * No split pair is ever synthesised: the only rests are the opening reset and the 30-minute
 * break, so no split answer can rest on a pair the driver never took.
 */
export function synthesizeEldSeed(input: EldClocks, cfg: RulesConfig, now: number, createdAt: number): EldSeed {
  const notes: string[] = [];
  const { limit: cycleLimit, windowDays } = cycleParamsOf(cfg);
  const clampIn = (v: number, max: number, label: string): number => {
    const r = Math.round(v);
    if (!Number.isFinite(r) || r < 0) { notes.push(`${label} can't be under zero — counted as 0m.`); return 0; }
    if (r > max) { notes.push(`${label} can't be more than ${dur(max)} — counted as ${dur(max)}.`); return max; }
    return r;
  };
  const driveLeft = clampIn(input.driveLeft, LIMITS.DRIVE, 'Drive time left');
  const windowLeft = clampIn(input.windowLeft, LIMITS.WINDOW, 'Shift time left');
  const breakDueIn = clampIn(input.breakDueIn, LIMITS.BREAK_AFTER, 'Break due in');
  const cycleLeft = clampIn(input.cycleLeft, cycleLimit, 'Cycle time left');

  // Driving used, and driving since the last break. If the break clock implies more driving
  // than the drive clock leaves room for, the break clock wins — it is the stricter reading.
  let driveUsed = LIMITS.DRIVE - driveLeft;
  const sinceBreak = LIMITS.BREAK_AFTER - breakDueIn;
  if (sinceBreak > driveUsed) {
    driveUsed = sinceBreak;
    notes.push('Your drive and break clocks disagreed — the stricter one won, so Drive time left came out lower than you typed.');
  }
  const earlyDrive = driveUsed - sinceBreak;
  const breakLen = earlyDrive > 0 ? LIMITS.BREAK_LEN : 0;
  // The driving done before the break can itself span more than 8 hours (driveUsed reaches
  // 11h when the break clock stands freshly reset). §395.3(a)(3)(ii) is met by any 30-minute
  // interruption — on-duty-not-driving counts — so that driving must be laid down in ≤8h
  // stretches separated by 30 minutes of the shift's own on-duty filler, or the seed would
  // manufacture a break violation and an invented continuous drive. The interruption minutes
  // come out of the filler, never out of the driving, so every clock total is unchanged;
  // the window stretch below must hold them alongside the driving and the break.
  const extraBreaks = earlyDrive > LIMITS.BREAK_AFTER ? Math.floor((earlyDrive - 1) / LIMITS.BREAK_AFTER) : 0;
  // Window elapsed. It must at least hold the driving, the break and those interruptions;
  // stretching it lowers the shift time left rather than granting time none of the four
  // clocks showed.
  let windowUsed = LIMITS.WINDOW - windowLeft;
  if (windowUsed < driveUsed + breakLen + extraBreaks * LIMITS.BREAK_LEN) {
    windowUsed = driveUsed + breakLen + extraBreaks * LIMITS.BREAK_LEN;
    notes.push('Your shift clock was too small to hold the driving and the break — Shift time left came out lower than you typed.');
  }

  const anchor = now - windowUsed;
  const segments: Segment[] = [];
  const push = (status: DutyStatus, a: number, b: number) => {
    if (b > a) segments.push({ status, start: a, end: b, note: ELD_SEED_NOTE, createdAt });
  };
  let t = anchor;
  const filler = windowUsed - driveUsed - breakLen;
  // The filler leads, minus the minutes held back to interrupt the pre-break driving (the
  // stretch above guarantees the filler covers them, so this never goes negative).
  const fillerLead = filler - extraBreaks * LIMITS.BREAK_LEN;
  if (fillerLead > 0) { push('ON', t, t + fillerLead); t += fillerLead; }
  let preBreak = earlyDrive;
  while (preBreak > LIMITS.BREAK_AFTER) {
    push('D', t, t + LIMITS.BREAK_AFTER); t += LIMITS.BREAK_AFTER;
    push('ON', t, t + LIMITS.BREAK_LEN); t += LIMITS.BREAK_LEN;
    preBreak -= LIMITS.BREAK_AFTER;
  }
  if (preBreak > 0) { push('D', t, t + preBreak); t += preBreak; }
  if (earlyDrive > 0) { push('OFF', t, t + LIMITS.BREAK_LEN); t += LIMITS.BREAK_LEN; }
  if (sinceBreak > 0) { push('D', t, t + sinceBreak); t += sinceBreak; }

  // Cycle: the shift just built already spends some of the cycle inside the window. Whatever
  // usage is still missing goes on duty in one block ending where the opening reset begins —
  // the most recent placement possible, so those hours drop off at the latest day they can.
  let winStart = carrierDayStart(now, cfg);
  for (let i = 1; i < windowDays; i++) winStart = carrierDayStart(winStart - 1, cfg);
  const shiftWork = minutesOf(segments, WORK_SET, winStart, now);
  const stillNeeded = (cycleLimit - cycleLeft) - shiftWork;
  if (stillNeeded < 0) notes.push("Your cycle clock shows more time left than fits with this shift's work — Cycle time left came out lower than you typed.");
  const out: Segment[] = [];
  if (stillNeeded > 0) out.push({ status: 'ON', start: anchor - LIMITS.RESET - stillNeeded, end: anchor - LIMITS.RESET, note: ELD_SEED_NOTE, createdAt });
  out.push({ status: 'OFF', start: anchor - LIMITS.RESET, end: anchor, note: ELD_SEED_NOTE, createdAt }, ...segments);
  return { segments: out, notes, anchor };
}

/**
 * Seed the state from the four ELD clocks. The DEMO state ends (the record is no longer empty),
 * and the driver lands on Now set to Off Duty: the seed describes the day up to now and invents
 * nothing after it, so the driver sets their real status with the normal controls.
 */
export function applyEldSeed(s: State, input: EldClocks, now: number): { patch: Partial<State>; notes: string[] } {
  const seed = synthesizeEldSeed(input, s.config, now, stamp());
  return {
    notes: seed.notes,
    patch: {
      segments: seed.segments, tentative: [],
      current: { status: 'OFF', since: now, createdAt: stamp() },
      seededAt: now, tab: 'now',
    },
  };
}

/**
 * Do split answers still rest on the typed-in ELD clocks? True while any seeded row stands
 * inside the ground the current shift's split math is measured over: the shift itself plus the
 * rest that opened it. Once the driver's own entries — or a reset they actually took — cover
 * that whole stretch, the estimate has firmed up and the label clears. A seeded row the driver
 * edited keeps its note and still counts: it is still the ELD's number, not a logged entry.
 */
export function splitEstimateActive(s: State, now: number): boolean {
  if (!s.segments.some((x) => x.note === ELD_SEED_NOTE)) return false;
  try {
    const ev = evaluate(allSegments(s, now), { asOf: now, config: s.config });
    const from = ev.shift.shiftStart - LIMITS.RESET;
    return s.segments.some((x) => !x.tentative && x.note === ELD_SEED_NOTE && x.end > from && x.start <= now);
  } catch { return false; }
}

/* ---------- reading the ELD boxes (patches 8 + 9, whole numbers only — patch 9.2) ---------- */

export type EldEntryRead = { ok: true; minutes: number } | { ok: false; problem: 'fraction' | 'junk' };

/**
 * Reading one hours+minutes pair off an ELD panel — the quick start's four clocks and the
 * drift check's one number share this, so the two panels can never drift apart in how they
 * read a typed clock. The boxes take WHOLE numbers only, and a fraction is refused, never
 * rounded and never converted: patches 8/9 read the boxes with `Math.round`, so "7.25"
 * hours silently became 420 (15 minutes lost — enough to turn a correct log into a
 * "missing" verdict whose back-fill wrote driving that never happened) and "0.5" became
 * 60 (30 invented). There is no safe silent reading of a fraction: rounding invents or
 * destroys minutes, and converting it (7.25 → 7h 15m) guesses that the driver meant a
 * decimal hour rather than a mistyped 7:25. So the entry is refused with the problem
 * named — 'fraction' so the panel can teach the fix (whole hours in the hours box, the
 * rest in minutes), 'junk' for anything else that is not plain digits. An empty box is
 * zero, as it has always been on these panels. The invariant the panels rely on: the
 * minutes used are exactly 60 × (whole hours entered) + (minutes entered).
 */
export function readEldEntry(hoursText: string, minutesText: string): EldEntryRead {
  const box = (t: string): number | 'fraction' | 'junk' => {
    const v = t.trim();
    if (v === '') return 0;
    if (/^\d+$/.test(v)) return Number(v);
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && v.includes('.') ? 'fraction' : 'junk';
  };
  const h = box(hoursText), m = box(minutesText);
  if (h === 'fraction' || m === 'fraction') return { ok: false, problem: 'fraction' };
  if (h === 'junk' || m === 'junk') return { ok: false, problem: 'junk' };
  return { ok: true, minutes: h * 60 + m };
}

/* ---------- "Check against my ELD" — the drift check (patch 9) ---------- */

/**
 * The note a back-filled row carries. Provenance lives on the row, like the seed's (patch 8):
 * `note` is the field the save validators deliberately leave unchecked (patch 5.2), so a filled
 * row passes validation exactly like a hand-typed one, and the Log shows where it came from.
 */
export const DRIFT_NOTE = 'Drift check';

/**
 * How far apart the ELD's number and the app's may sit and still count as agreement. Both work
 * in whole minutes, but the driver reads the ELD a moment after the app last computed, and a
 * minute or two of reading time is not drift. Past two minutes, the difference is a real gap
 * with a cause, and the check says which direction it runs.
 */
export const DRIFT_TOLERANCE_MIN = 2;

export type DriftVerdict = 'sync' | 'missing' | 'extra';
export interface DriftComparison { appLeft: number; eldLeft: number; gap: number; verdict: DriftVerdict }

/**
 * The logged record, materialized to `now`: the rows in `segments` that are not flagged
 * tentative, plus the live status — and NOT the tentative list. This is the one selection
 * both sides of the drift check use (the comparison reads it, the fill places into it), and
 * it is the same selection the Patch #7.2 history view makes. What-if rows are plans, not
 * record: they are never evidence about what the driver actually did.
 */
export function loggedSegments(s: State, now: number): Segment[] {
  const logged: Segment[] = s.segments.filter((x) => !x.tentative);
  if (s.current && now > s.current.since) {
    logged.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note, createdAt: s.current.createdAt ?? Number.MAX_SAFE_INTEGER });
  }
  return logged;
}

/**
 * The drift check's one comparison: the drive time left the driver read off his ELD against the
 * drive time left this app computes for the same moment — computed on the LOGGED RECORD
 * (loggedSegments), not on allSegments. The difference matters: allSegments folds in the
 * tentative list, and a what-if row whose time has gone by — a break the driver planned and
 * then drove through — otherwise inflates this number and steers the verdict. A stale plan
 * must never be able to turn a correct log into a "missing driving" verdict with a fill
 * behind it (patch 9.1; an independent verification probe wrote 30 minutes of driving that
 * never happened exactly that way). Where a stale what-if still inflates the Now screen,
 * the check can therefore disagree with the screen — deliberately: the ELD can only be
 * lined up against what was actually logged.
 *
 * `gap` is ELD minus app. Negative is the dangerous direction: the ELD shows LESS left, so the
 * driver has driven more than the log knows, and every answer the app gives runs optimistic
 * until the missing driving is in. Positive means the app is the pessimist — something the ELD
 * credited (most often a break or an off-duty stretch) is missing from the log. That direction
 * is only ever reported, never "fixed" by taking logged driving back out (see planDriftFill).
 */
export function driftCheck(s: State, eldLeftMin: number, now: number): DriftComparison {
  const ev = evaluate(loggedSegments(s, now), { asOf: now, config: s.config });
  const appLeft = Math.max(0, Math.round(ev.shift.driveRemaining));
  const eldLeft = Math.max(0, Math.round(eldLeftMin));
  const gap = eldLeft - appLeft;
  const verdict: DriftVerdict = Math.abs(gap) <= DRIFT_TOLERANCE_MIN ? 'sync' : gap < 0 ? 'missing' : 'extra';
  return { appLeft, eldLeft, gap, verdict };
}

export interface DriftFillPlan { start: number; end: number; filled: number; remainder: number }

/**
 * Where a back-fill of `minutes` of missing driving can honestly go: ONE Driving block in an
 * unlogged stretch of the logged record, anchored at that stretch's end so it butts against
 * whatever the driver did next — usually the status he is in now, which is what makes "you
 * started driving earlier than you tapped" read as one run of driving.
 *
 * Which stretch: the most recent one that can hold the whole gap. If none can, the most recent
 * stretch there is fills what fits and `remainder` names the rest — the fill is never split
 * across the day and never forced. The fences, all deliberate:
 *  - Logged rows only. Tentative (what-if) rows are never read and never touched, and the fill
 *    takes only time no logged row claims in the resolved timeline — it overlaps nothing.
 *  - Never past now, and never before the record begins: the time before the first row is the
 *    driver's stated beginning, not a hole to fill.
 *  - The fill only ever ADDS driving. Nothing here deletes, shortens or re-statusses a row, in
 *    either drift direction — a re-sync must not be a tool for erasing duty.
 * Returns null when the record has no unlogged stretch at all.
 */
export function planDriftFill(s: State, minutes: number, now: number): DriftFillPlan | null {
  const want = Math.max(0, Math.round(minutes));
  if (want <= 0) return null;
  const logged = loggedSegments(s, now);
  if (logged.length === 0) return null;
  const rows = normalize(logged, { merge: false });
  const stretches: { start: number; end: number }[] = [];
  let prevEnd: number | null = null;
  for (const r of rows) {
    // A stretch is clipped to `now`: a logged row can be dated in the future (an import can
    // carry one — the engine warns about them rather than refusing them), and the unlogged
    // time in front of such a row runs past the present. None of that time exists yet, so
    // no fill minute may land in it (patch 9.1; an independent verification probe wrote a
    // fill at 12:10–13:00 with now at 12:00 before this clip).
    const end = Math.min(r.start, now);
    if (prevEnd !== null && end > prevEnd) stretches.push({ start: prevEnd, end });
    prevEnd = prevEnd === null ? r.end : Math.max(prevEnd, r.end);
  }
  if (prevEnd !== null && now > prevEnd) stretches.push({ start: prevEnd, end: now });
  if (stretches.length === 0) return null;
  const whole = [...stretches].reverse().find((g) => g.end - g.start >= want);
  const best = whole ?? stretches[stretches.length - 1];
  const filled = Math.min(want, best.end - best.start);
  return { start: best.end - filled, end: best.end, filled, remainder: want - filled };
}

/* ---------- Patch 10: load-verdict advice + the Why counterfactual ----------
 * Display-only. Nothing here writes state or a log row: every number is produced by running the
 * EXISTING engine (planTrip / planTripAll / evaluate / driveAgainAt) on modified inputs — a later
 * departure, an added rest — never by new rule math in this file.
 */

/** The plan the verdict screen stands on: earliest arrival, ties to the simplest strategy.
 *  The same rule as app.tsx's earliestStrategy — keep the two in step. */
export function verdictPlan(both: Record<TripStrategy, TripPlan>): TripPlan {
  const key = TRIP_STRATEGIES.reduce<TripStrategy>((a, k) => (both[k].arrival < both[a].arrival ? k : a), TRIP_STRATEGIES[0]);
  return both[key];
}

/** How far past the planned departure the "leave by" search may look (12 hours). */
export const LATEST_DEPARTURE_SPAN_MIN = 720;

/**
 * Long stops a plan makes EN ROUTE: rests of 10 hours or more (a reset, a recap wait, a
 * restart) inserted between departure and the last driving minute. A rest counts as ONE
 * stop however the planner steps it: contiguous OFF/SB steps merge into a single run,
 * because a reset planned as OFF 30 + OFF 570 ("extend to a full 10") is one 10-hour
 * stop, not zero stops (checkpoint 1, D3 — counting single steps let that shape slip
 * through and the leave-by line named a departure 40 minutes too late). Non-contiguous
 * legs do NOT merge: a split's 7-hour sleeper leg separated by driving is not a
 * continuous 10-hour rest, and this count stays blind to it by definition.
 *
 * Each run is measured only over [departure, driveEnd): the pre-departure wait row is
 * a step too, but it is the driver's own wait, not a stop the trip costs him — a run
 * that is only the wait row measures zero here however long he waits — and the
 * receiver dwell sits after the wheels stop and is likewise his own plan.
 */
const longStops = (plan: TripPlan, departure: number): number => {
  let stops = 0;
  let runStart: number | null = null;
  let runEnd = 0;
  const flush = () => {
    if (runStart !== null && Math.min(runEnd, plan.driveEnd) - Math.max(runStart, departure) >= LIMITS.RESET) stops++;
    runStart = null;
  };
  for (const st of plan.steps) {
    const g = st.segment;
    if (g.status === 'OFF' || g.status === 'SB') {
      if (runStart !== null && g.start <= runEnd) { if (g.end > runEnd) runEnd = g.end; }
      else { flush(); runStart = g.start; runEnd = g.end; }
    } else flush();
  }
  flush();
  return stops;
};

/**
 * The latest minute the driver can start this load and still run it the way it is planned — or
 * null when no honest answer exists inside the search window. "The way it is planned" is the
 * only departure boundary this simulation has: the planner will complete the load from almost
 * any departure by inserting a 10-hour stop en route, so bare feasibility never turns. What
 * turns is the trip's shape. The answer is the last departure whose winning plan needs no MORE
 * ≥10-hour stops than the planned departure's plan — leave later than that and the load costs
 * an extra long stop (and arrives that much later). The search stays inside the run containing
 * the planned departure: a coarse 60-minute scan with the verdict's own winning strategy finds
 * the bracket where that run ends, and the bracket is then walked MINUTE BY MINUTE with the
 * scan oracle itself — the stop count is not monotone in departure time (a rest planned as
 * one step at one minute can be two steps at the next), so a binary search can land on the
 * wrong side of a notch (checkpoint 1, D3). The boundary is finally confirmed against the
 * full verdict computation (planTripAll), which may only pull it EARLIER, never later: if
 * the verdict's own winning plan already needs an extra stop at the scan's boundary minute,
 * the walk continues down to where the verdict agrees — the printed minute must be safe
 * under both readings of the trip's shape.
 */
export function latestLegalDeparture(segs: Segment[], input: TripInput, strategy: TripStrategy, waitStatus: DutyStatus): number | null {
  const planned = input.departure;
  // The wait between now and a later departure must be modelled, never left as a gap: the
  // engine reads unlogged time as off duty, which would hand the driver rest he may not take.
  // `waitStatus` is the status the driver said the wait will be (or, for a leave-now check, the
  // status he is in — on duty when driving or unset, the careful side that earns no rest credit).
  const waitFrom = input.untilDeparture?.from ?? planned;
  const sim = (dep: number): TripInput => ({ ...input, departure: dep, untilDeparture: { from: waitFrom, status: waitStatus, label: 'Waiting until departure' } });
  const baseStops = longStops(verdictPlan(planTripAll(segs, sim(planned))), planned);
  const quick = (dep: number) => { const p = planTrip(segs, { ...sim(dep), restStrategy: strategy }); return p.feasible && longStops(p, dep) <= baseStops; };
  const full = (dep: number) => { const p = verdictPlan(planTripAll(segs, sim(dep))); return p.feasible && longStops(p, dep) <= baseStops; };
  if (!quick(planned)) return null; // caller only asks on a Yes verdict; the scan strategy must agree there
  let lastOk = 0, firstBad = -1;
  for (let off = 60; off <= LATEST_DEPARTURE_SPAN_MIN; off += 60) {
    if (quick(planned + off)) lastOk = off; else { firstBad = off; break; }
  }
  if (firstBad === -1) return null; // still the same shape at the cap — no true "latest" inside the window to name
  // Per-minute walk of the final bracket: the first minute whose plan changes shape
  // ends the run, whatever the count does afterwards (see the header: not monotone).
  let boundary = planned + lastOk;
  for (let m = planned + lastOk + 1; m <= planned + firstBad; m++) {
    if (!quick(m)) break;
    boundary = m;
  }
  // Confirm against the verdict computation itself: the verdict's winning plan may
  // only move the boundary earlier. (It never has to move it later: the boundary is
  // defined by the planned strategy's shape, and where the verdict switches to a
  // split plan past it — a 7-hour sleeper leg this count is blind to — the printed
  // minute still names a departure that runs the load the way it was planned.)
  if (!full(boundary)) {
    let fixed = -1;
    for (let d = boundary - 1; d >= planned; d--) if (full(d)) { fixed = d; break; }
    if (fixed === -1) return null;
    boundary = fixed;
  }
  return boundary;
}

/** The most pre-departure rest the smallest-fix search may offer (10 hours). */
export const SMALLEST_FIX_CAP_MIN = 600;

/**
 * On a No verdict: the smallest added rest before departure (15-minute steps, up to 10 hours)
 * that flips the load to legal, with the winning plan at that rest — or null when no amount in
 * range flips it. The rest is modelled exactly the way the app models the wait itself: the
 * driver's stated wait stays a row in the record, and the extra rest becomes the plan's
 * untilDeparture lead (off duty, ending at the shifted departure). Every candidate is judged by
 * the full verdict computation. Rest only ever helps these clocks, so the first feasible step is
 * found by binary search; both neighbours of the answer are real verdicts, so the printed claim
 * ("this much flips it") is verified even where the monotonicity assumption is only approximate.
 */
export function smallestRestFix(segs: Segment[], input: TripInput): { minutes: number; plan: TripPlan } | null {
  const planned = input.departure;
  const hist = [...segs];
  if (input.untilDeparture && input.untilDeparture.from < planned) {
    const u = input.untilDeparture;
    hist.push({ status: u.status, start: u.from, end: planned, tentative: true, note: u.label ?? 'Until departure' });
  }
  const at = (r: number) => verdictPlan(planTripAll(hist, {
    ...input, departure: planned + r,
    untilDeparture: { from: planned, status: 'OFF' as DutyStatus, label: 'Extra rest before departure' },
  }));
  const top = at(SMALLEST_FIX_CAP_MIN);
  if (!top.feasible) return null;
  let lo = 0, hi = SMALLEST_FIX_CAP_MIN / 15; // step indices; step hi is feasible, step 0 is the No verdict itself
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (at(mid * 15).feasible) hi = mid; else lo = mid; }
  const plan = at(hi * 15);
  return plan.feasible ? { minutes: hi * 15, plan } : null;
}

export type WhyLever =
  | { kind: 'rest'; minutes: number; status: 'OFF' | 'SB'; stopBy: number }
  | { kind: 'recap'; at: number; dropsOff: number; available: number };

/**
 * The Why sheet's counterfactual: what single change hands the driver more driving time.
 * The lever is added rest from now (15-minute steps, up to 10 hours), judged by re-running
 * evaluate() on the logged record extended with that rest — the same construction driveAgainAt
 * uses. When the cycle binds and no rest in range changes the answer, the true lever is the
 * next recap gain-back, taken from the evaluation's own forecast. Null when nothing in range
 * changes the answer — the sheet then omits the line rather than guessing. Callers pass the
 * logged record (tentative what-if rows excluded, again driveAgainAt's convention) and the
 * evaluation computed from it.
 */
export function whyLever(segs: Segment[], config: RulesConfig, now: number, ev: FullEvaluation): WhyLever | null {
  const logged = pruneHistory(segs.filter((x) => !x.tentative), now, config);
  const evalRest = (r: number, status: 'OFF' | 'SB') =>
    evaluate([...logged, { status, start: now, end: now + r }], { asOf: now + r, config });
  // The payoff is DRIVING time regained, never the wall clock: any pause pushes a stop-by time
  // later minute-for-minute while the binding clock waits, so comparing stop-by times would
  // call every rest a lever. A rest only changes the answer when it hands back driving time the
  // driver does not already have — a break taken, a split paired, a reset completed, cycle
  // hours rolled off. While he cannot drive at all, the bar is the driving time the SHORTEST
  // restoring rest would give him: a longer rest must beat that, not merely restore it.
  let baseDrive: number | null = null;
  let firstStep = 1;
  let resumedBinding: string | null = null;
  if (ev.driveNow > 0) {
    baseDrive = ev.driveNow;
  } else {
    const again = driveAgainAt(logged, { asOf: now, config }, 'OFF');
    if (again !== null && again - now <= SMALLEST_FIX_CAP_MIN) {
      const resumed = evaluate([...logged, { status: 'OFF' as DutyStatus, start: now, end: again }], { asOf: again, config });
      if (resumed.driveNow > 0) { baseDrive = resumed.driveNow; firstStep = Math.floor((again - now) / 15) + 1; resumedBinding = resumed.binding; }
    }
  }
  if (baseDrive !== null) {
    for (let step = firstStep; step <= SMALLEST_FIX_CAP_MIN / 15; step++) {
      const r = step * 15;
      for (const status of ['SB', 'OFF'] as const) {
        const e2 = evalRest(r, status);
        if (e2.driveNow > baseDrive) return { kind: 'rest', minutes: r, status, stopBy: e2.mustStopBy };
      }
    }
  }
  // The cycle is the lever when it binds now — or when it is what binds once the shortest
  // restoring rest is taken (a dead window in front of a nearly-dead cycle: the reset is
  // already assumed in the baseline above, and only the recap moves what comes after it).
  if (ev.binding === 'CYCLE' || resumedBinding === 'CYCLE') {
    const f = ev.cycle.forecast.find((x) => x.dayStart > now && x.dropsOff > 0);
    if (f) return { kind: 'recap', at: f.dayStart, dropsOff: f.dropsOff, available: f.availableAtStart };
  }
  return null;
}

export const STATUS_LABEL: Record<DutyStatus, string> = { OFF: 'Off Duty', SB: 'Sleeper', D: 'Driving', ON: 'On Duty' };
// Sleeper has its own colour: the accent is the ice blue of the dials and links in the cab look.
export const STATUS_COLOR: Record<DutyStatus, string> = { OFF: 'var(--muted)', SB: 'var(--sb)', D: 'var(--good)', ON: 'var(--warn)' };

/**
 * 'night' is the product default and needs no attribute — `:root` carries the night palette.
 * 'day' sets `data-theme="day"` on the document root. Not part of the export: this is a
 * device preference, like `logResolved`, and a restored backup should not change how your screen
 * looks.
 */
export type Theme = 'night' | 'day';

/** Does the phone itself run dark? Guarded like everything DOM here: the node harness has no window. */
export function devicePrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch { return false; }
}

/**
 * The theme the screen actually wears (patch 7). A theme the driver picked by hand always wins.
 * Until then the stored value is only the old day default nobody chose, so the screen follows the
 * phone: dark phone, night palette — no more light blast in a dark cab at 3 a.m. `prefersDark` is a
 * parameter so the rule is testable without a DOM; callers pass devicePrefersDark().
 */
export function effectiveTheme(s: Pick<State, 'theme' | 'themeChosen'>, prefersDark: boolean): Theme {
  if (s.themeChosen) return s.theme;
  return prefersDark ? 'night' : 'day';
}

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return; // the node test harness has no DOM
  const root = document.documentElement;
  if (t === 'day') root.setAttribute('data-theme', 'day');
  else root.removeAttribute('data-theme');
  // Keep the browser chrome (address bar, status bar, PWA title bar) on the ACTIVE palette. Hardcoded
  // in index.html it would show a dark strip above the light app on a fresh install.
  const meta = document.querySelector('meta[name="theme-color"]');
  // The page colour of each palette (--bg in styles.css; the smoke test holds the two together).
  if (meta) meta.setAttribute('content', t === 'day' ? '#e4e9ee' : '#090c10');
}

/** The hour (0–23) an epoch minute falls in on the DEVICE's own clock — what "at night" means for a screen rule. */
export function deviceHour(min: number): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: deviceTz, hour: 'numeric', hourCycle: 'h23' }).format(new Date(min * 60000))) % 24;
  } catch { return new Date(min * 60000).getHours(); }
}
/**
 * The night window of decision D1-A (patch 16): 19:00–07:00 on the phone's own clock. While the
 * driving view is up inside that window and the setting is on, the screen wears the night palette —
 * a light-mode phone otherwise drives all night under a lit panel (brainstorm P1b: the calm day
 * driving view measures L ≥ 0.81, lit for hours).
 */
export function darkDriveAtNightApplies(s: Pick<State, 'darkDriveAtNight'>, nowMinutes: number): boolean {
  if (!s.darkDriveAtNight) return false;
  const h = deviceHour(nowMinutes);
  return h >= 19 || h < 7;
}
/** The theme the screen actually wears: the driving view's night rule sits on top of the effective theme, and only while that view is up. */
export function screenTheme(s: State, prefersDark: boolean, drivingViewUp: boolean, nowMinutes: number): Theme {
  if (drivingViewUp && darkDriveAtNightApplies(s, nowMinutes)) return 'night';
  return effectiveTheme(s, prefersDark);
}
/** The zone pair the two-zones line names, device zone first: the acknowledgement stores this string (patch 16). */
export const zonePair = (s: Pick<State, 'config'>): string => `${deviceTz}|${s.config.timeZone}`;
/** Sub-statuses drivers think in. For HOS math PC is plain OFF and YM is plain ON (§395.2 / FMCSA guidance). */
export const SUB_STATUS: Record<string, string> = { PC: 'Personal conveyance', YM: 'Yard move' };
/**
 * Whether a row's label still fits its status. Personal conveyance is off duty and a yard move is on duty
 * (49 CFR 395 guidance; the ELD records them as special categories of those two), and a break is logged off
 * or on duty, never Driving or Sleeper. An edit that moves a row out of its status drops the label, or a
 * personal-conveyance row edited to Driving would read "Personal conveyance (D)". Other notes always fit.
 */
export function noteFits(note: string | undefined, status: DutyStatus): boolean {
  if (!note || typeof note !== 'string') return true;
  if (note === 'PC') return status === 'OFF';
  if (note === 'YM') return status === 'ON';
  if (note.startsWith(BREAK_NOTE)) return status === 'OFF' || status === 'ON';
  return true;
}
export function segLabel(status: DutyStatus, note?: string): string {
  // Notes are deliberately unvalidated at rest; a non-string one that slipped a path reads
  // as no note rather than throwing out of a renderer (break-test #7).
  const n = typeof note === 'string' ? note : undefined;
  if (n && n.startsWith(BREAK_NOTE) && n.length > BREAK_NOTE.length) return `${n.slice(BREAK_NOTE.length)} (${status})`;
  return n && SUB_STATUS[n] ? `${SUB_STATUS[n]} (${status})` : STATUS_LABEL[status];
}

/** Everything a bug report needs. Kept small enough to paste into an email. */
export function exportState(s: State): string {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent, segments: s.segments, tentative: s.tentative, current: s.current, config: s.config, mph: s.mph, trip: s.trip, split: s.split, loadCheck: s.loadCheck, bugEmail: s.bugEmail, nowOverride: s.nowOverride });
}
