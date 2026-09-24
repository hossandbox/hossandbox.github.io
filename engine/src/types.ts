/**
 * HOS Sandbox rules engine — core types.
 * All times are integer MINUTES since the Unix epoch (UTC). No floats in time math.
 * Property-carrying CMV drivers, 49 CFR Part 395 (see docs/RULES-GROUNDING.md).
 */

/** Duty status codes as used on a RODS grid. */
export type DutyStatus = 'OFF' | 'SB' | 'D' | 'ON';

export interface Segment {
  status: DutyStatus;
  /** inclusive start, minutes since epoch */
  start: number;
  /** exclusive end, minutes since epoch */
  end: number;
  /** optional user label ("Receiver dwell", "Fuel") */
  note?: string;
  /** true when this segment is a tentative "what-if" entry, not something that happened */
  tentative?: boolean;
  /**
   * Monotonic entry key: when the driver entered this row. Overlap resolution needs to know which
   * entry is NEWER, not which starts later — a correction typed over a logged row otherwise lost to
   * the row it was correcting, silently discarding forgotten driving (stress-test 2.3).
   * Absent on imported/legacy rows, where normalize() falls back to its start-time ordering.
   */
  createdAt?: number;
}

export interface RulesConfig {
  /** 60/7 or 70/8 cycle (§395.3(b)) */
  cycle: '60/7' | '70/8';
  /** Hour (0-23) at which the carrier's 24-hour period starts at the home terminal. Usually 0. */
  dayStartHour: number;
  /** IANA time zone of the home terminal, used to compute carrier days. */
  timeZone: string;
  /** Driver qualifies for §395.1(e)(1)/(2) short-haul: exempt from the 30-min break rule. */
  shortHaul: boolean;
  /** Shift-start minutes where adverse driving conditions (§395.1(b)(1)) were declared: +2h driving and window. */
  adverseShifts?: number[];
  /** Shift-start minutes where the 16-hour short-haul exception (§395.1(o)) is claimed: window 14→16. */
  sixteenHourShifts?: number[];
}

export const DEFAULT_CONFIG: RulesConfig = {
  cycle: '70/8',
  dayStartHour: 0,
  timeZone: 'America/Chicago',
  shortHaul: false,
};

/** Regulatory constants, in minutes. */
export const LIMITS = {
  DRIVE: 11 * 60,          // §395.3(a)(3)(i)
  WINDOW: 14 * 60,         // §395.3(a)(2)
  RESET: 10 * 60,          // §395.3(a)(1)
  BREAK_AFTER: 8 * 60,     // §395.3(a)(3)(ii) — driving accumulated before a break is required
  BREAK_LEN: 30,           // §395.3(a)(3)(ii)
  SPLIT_MIN_SHORT: 2 * 60, // §395.1(g)(1)(ii)(A)
  SPLIT_MIN_SB: 7 * 60,    // §395.1(g)(1)(ii)(B)
  SPLIT_TOTAL: 10 * 60,    // §395.1(g)(1)(ii)(C)
  RESTART: 34 * 60,        // §395.3(c)
  CYCLE_60_7: 60 * 60,
  CYCLE_70_8: 70 * 60,
} as const;

/** A contiguous block of non-working time (OFF and/or SB), merged. */
export interface RestPeriod {
  start: number;
  end: number;
  /** total minutes */
  duration: number;
  /** longest contiguous run of SB minutes inside this rest */
  longestSB: number;
  /** ≥10h: resets the 11 and 14 (§395.3(a)(1)) */
  isReset: boolean;
  /** ≥34h OFF/SB: restarts the 60/70 cycle (§395.3(c)) */
  isRestart: boolean;
  /** ≥2h: may serve as the short leg of a split (§395.1(g)(1)(ii)(A)) */
  qualifiesShort: boolean;
  /** ≥7h contiguous SB: may serve as the long leg (§395.1(g)(1)(ii)(B)) */
  qualifiesLongSB: boolean;
}

export type ViolationKind =
  | 'DRIVE_11'
  | 'WINDOW_14'
  | 'BREAK_30'
  | 'CYCLE';

export interface Violation {
  kind: ViolationKind;
  /** minute the violation began */
  start: number;
  /** minute it ended (driving stopped) */
  end: number;
  /** minutes in violation */
  minutes: number;
  /** FMCSA severity per 2020 FAQ: nominal <15m, violation, egregious >3h */
  severity: 'nominal' | 'violation' | 'egregious';
  detail: string;
  /**
   * True when this violation comes from a tentative ("what-if") row rather than the logged record.
   * The UI must never show a plan's violation under a heading that says the driver has violated.
   */
  tentative?: boolean;
}

/** The interpretation of a shift under one particular choice of split-sleeper chain. */
export interface ShiftEvaluation {
  shiftStart: number;
  shiftEnd: number | null;
  /** rests used as qualifying split periods, in order */
  chain: RestPeriod[];
  /** the point the 11/14 are currently measured from */
  anchor: number;
  violations: Violation[];
  /** at `asOf`: */
  driveUsed: number;
  windowUsed: number;
  driveRemaining: number;
  windowRemaining: number;
  /** minutes of driving since the last ≥30-min non-driving interruption */
  driveSinceBreak: number;
  /** minutes of driving permitted before a 30-min break is required (Infinity when shortHaul) */
  breakRemaining: number;
  /** if a rest ≥2h has been taken since anchor but no pair completed: the "pending" leg */
  pendingSplitLeg: RestPeriod | null;
  /** effective limits for this shift after exceptions */
  limits: { drive: number; window: number };
  /** exceptions applied and any eligibility warnings */
  notes: string[];
}

export interface CycleDay {
  /** carrier-day start, minutes since epoch */
  start: number;
  end: number;
  /** ISO date label in home-terminal zone, e.g. "2026-09-19" */
  label: string;
  onDuty: number;
}

export interface CycleEvaluation {
  limit: number;
  windowDays: number;
  /** the days in the current rolling window, oldest first; last is "today" */
  days: CycleDay[];
  used: number;
  remaining: number;
  /** minutes since last 34h restart ended, or null when none in record */
  restartEnd: number | null;
  /** for each of the next N carrier-days: hours dropping off and projected available at day start */
  forecast: { dayStart: number; label: string; dropsOff: number; availableAtStart: number }[];
}

export interface Availability {
  asOf: number;
  shift: ShiftEvaluation;
  cycle: CycleEvaluation;
  /** min(drive, window, cycle, break) — minutes of continuous driving legal from asOf */
  driveNow: number;
  /** which limit binds driveNow */
  binding: 'DRIVE_11' | 'WINDOW_14' | 'CYCLE' | 'BREAK_30' | 'NONE';
  /** asOf + driveNow */
  mustStopBy: number;
  /** all violations in the record (past + tentative) */
  violations: Violation[];
}
