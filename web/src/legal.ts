/**
 * Can I Legally Use It? — 3 AM HOS Exception & Edge-Case Sanity Check (Plan tool #10).
 *
 * Pure app-layer logic module over `engine/src/index.ts` (`evaluate()`) and read-only helpers
 * from `web/src/store.ts` and `web/src/carrierday.ts`.
 * Zero modifications to `engine/` or `web/src/store.ts`; zero `localStorage` usage; session-only state.
 *
 * Clock preview honesty:
 *   - Adverse Driving (§395.1(b)(1)) and 16-Hour Short-Haul (§395.1(o)) previews call `evaluate()`
 *     directly on today's real logged segments WITHOUT and WITH the exception applied (using the
 *     engine's existing `adverseShifts` / `sixteenHourShifts` config). Never hand-computes a delta.
 *   - Personal Conveyance and Yard Move are ELD duty-status categories not modeled as shift-limit
 *     extensions by `evaluate()`; their clock notes are strictly labeled as ELD logging guidance text.
 */
import type { Availability, FullEvaluation, RulesConfig, Segment } from '../../engine/src/index.ts';
import { evaluate } from '../../engine/src/index.ts';
import { isValidTimeZone, zoneShort } from './store.ts';
import { safeRulesConfig } from './carrierday.ts';

export type LegalTreeId = 'adverse' | 'pc' | 'yard' | 'sixteen';
export type LegalItemId = LegalTreeId | 'safehaven';
export type LegalAnswer = 'yes' | 'no';

export const LEGAL_ADVISORY_LINE =
  "Rule check only — not legal advice. Your carrier's policy can be stricter than FMCSA. Log and annotate on your carrier ELD.";

export interface LegalHomeItem {
  id: LegalItemId;
  title: string;
  shortCite: string;
  prompt: string;
  isMythCard?: boolean;
}

export const LEGAL_HOME_ITEMS: readonly LegalHomeItem[] = [
  {
    id: 'adverse',
    title: 'Adverse Driving Conditions',
    shortCite: '49 CFR §395.1(b)(1)',
    prompt: 'Unexpected crash closure or sudden ice after starting your day/dispatch? (+2h drive & window check)',
  },
  {
    id: 'pc',
    title: 'Personal Conveyance (PC)',
    shortCite: 'FMCSA 2018 PC Guidance',
    prompt: 'Ordered off a shipper/receiver lot out of hours? (Nearest safe parking + carrier policy)',
  },
  {
    id: 'yard',
    title: 'Yard Move (YM)',
    shortCite: '49 CFR §395.28',
    prompt: 'Private gated yard vs. public truck stop or fuel island?',
  },
  {
    id: 'sixteen',
    title: '16-Hour Short-Haul "Big Day"',
    shortCite: '49 CFR §395.1(o)',
    prompt: 'Property-carrying only: returning to home terminal tonight after 5 home-terminal tours?',
  },
  {
    id: 'safehaven',
    title: '"Safe Haven" — Myth Check',
    shortCite: '49 CFR §397.5',
    prompt: 'Class 1.1–1.3 explosives only — never extends HOS for general freight.',
    isMythCard: true,
  },
] as const;

export interface LegalQuestion {
  id: string;
  question: string;
  detail: string;
}

export interface LegalClockSnapshot {
  asOf: number;
  mustStopBy: number;
  mustStopHM: string;
  mustStopShort: string;
  driveNow: number;
  binding: Availability['binding'];
  bindingLabel: string;
  driveLimit: number;
  driveRemaining: number;
  driveDeadline: number;
  driveDeadlineHM: string;
  windowLimit: number;
  windowUsed: number;
  windowRemaining: number;
  windowEnd: number;
  windowEndHM: string;
  cycleLimit: number;
  cycleRemaining: number;
  breakRemaining: number;
}

export interface LegalClockPreview {
  kind: 'adverse' | 'sixteen';
  homeTimeZone: string;
  homeZoneName: string;
  nowHM: string;
  alreadyActiveOnLog: boolean;
  otherExceptionActive: 'adverse' | 'sixteen' | null;
  beforeLabel: string;
  stackWarning: string | null;
  blockedByLog: boolean;
  logBlockNote: string | null;
  before: LegalClockSnapshot;
  after: LegalClockSnapshot;
  bindingNote: string | null;
}

export interface LegalVerdict {
  treeId: LegalItemId;
  verdict: 'YES' | 'NO';
  verifyCarrierPolicy: boolean;
  verdictLabel: string;
  tone: 'good' | 'warn' | 'bad';
  sign: 'go' | 'warn' | 'stop';
  headline: string;
  explanation: string;
  citation: string;
  carrierPolicyWarning: string | null;
  standingReminder: string | null;
  annotation: string | null;
  clockGuidance: string | null;
  effectNote: string | null;
  advisoryLine: string;
  preview: LegalClockPreview | null;
}

export interface LegalStepState {
  treeId: LegalTreeId;
  title: string;
  shortCite: string;
  totalQuestions: number;
  answeredCount: number;
  currentQuestion: LegalQuestion | null;
  verdict: LegalVerdict | null;
  trail: { question: string; answer: LegalAnswer }[];
}

export interface LegalPreviewInput {
  kind: 'adverse' | 'sixteen';
  segments: Segment[];
  now: number;
  config: RulesConfig;
}

/* ---------- timezone formatting (DST-safe, host-TZ independent) ---------- */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function fmtHM(minute: number, tz: string): string {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${hour}:${get('minute')}`;
}

function fmtShort(minute: number, tz: string): string {
  const safeTz = isValidTimeZone(tz) ? tz : 'UTC';
  const parts = partsFormatter(safeTz).formatToParts(new Date(minute * 60000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('weekday')} ${hour}:${get('minute')}`;
}

function bindingLabelOf(ev: FullEvaluation): string {
  switch (ev.binding) {
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hr drive limit`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hr window`;
    case 'CYCLE': return `${ev.cycle.limit / 60}-hr cycle`;
    case 'BREAK_30': return '30-min break';
    default: return 'None';
  }
}

function snapshotOf(ev: FullEvaluation, tz: string): LegalClockSnapshot {
  const driveDeadline = ev.asOf + ev.shift.driveRemaining;
  // Unclamped window end matches engine's limits.window - windowUsed (and equals asOf + windowRemaining whenever unexpired).
  const windowEnd = ev.asOf + (ev.shift.limits.window - ev.shift.windowUsed);
  return {
    asOf: ev.asOf,
    mustStopBy: ev.mustStopBy,
    mustStopHM: fmtHM(ev.mustStopBy, tz),
    mustStopShort: fmtShort(ev.mustStopBy, tz),
    driveNow: ev.driveNow,
    binding: ev.binding,
    bindingLabel: bindingLabelOf(ev),
    driveLimit: ev.shift.limits.drive,
    driveRemaining: ev.shift.driveRemaining,
    driveDeadline,
    driveDeadlineHM: fmtHM(driveDeadline, tz),
    windowLimit: ev.shift.limits.window,
    windowUsed: ev.shift.windowUsed,
    windowRemaining: ev.shift.windowRemaining,
    windowEnd,
    windowEndHM: fmtHM(windowEnd, tz),
    cycleLimit: ev.cycle.limit,
    cycleRemaining: ev.cycle.remaining,
    breakRemaining: ev.shift.breakRemaining,
  };
}

/**
 * Run `evaluate()` on real logged segments without and with the exception applied
 * (`adverseShifts` or `sixteenHourShifts`), returning exact engine-derived before/after clocks.
 * Never hand-computes a delta; never double-adds if the exception is already active on the log.
 */
export function previewExceptionClock(input: LegalPreviewInput): LegalClockPreview {
  const cfg = safeRulesConfig(input.config);
  const homeTimeZone = isValidTimeZone(cfg.timeZone) ? cfg.timeZone : 'America/Chicago';
  const homeZoneName = zoneShort(homeTimeZone);
  const now = Math.round(input.now);
  const logged = input.segments.filter((s) => !s.tentative);
  const evRaw: FullEvaluation = evaluate(logged, { asOf: now, config: cfg });

  let evBefore: FullEvaluation;
  let evAfter: FullEvaluation;
  let alreadyActiveOnLog = false;
  let otherExceptionActive: 'adverse' | 'sixteen' | null = null;
  let beforeLabel = 'Before (standard)';
  let blockedByLog = false;
  let logBlockNote: string | null = null;

  if (input.kind === 'adverse') {
    const existingKey = evRaw.shift.exceptionKeys.adverse;
    alreadyActiveOnLog = existingKey !== null;
    const beforeCfg = existingKey !== null
      ? {
          ...cfg,
          adverseShifts: (cfg.adverseShifts ?? []).filter((k) => k !== existingKey),
        }
      : cfg;
    evBefore = existingKey !== null
      ? evaluate(logged, { asOf: now, config: beforeCfg })
      : evRaw;
    evAfter = existingKey !== null
      ? evRaw
      : evaluate(logged, {
          asOf: now,
          config: {
            ...cfg,
            adverseShifts: [...(cfg.adverseShifts ?? []), evBefore.shift.exceptionKey],
          },
        });
    const sixteenKey = evBefore.shift.exceptionKeys.sixteen;
    if (sixteenKey !== null) {
      const evWithoutSixteen = evaluate(logged, {
        asOf: now,
        config: {
          ...beforeCfg,
          sixteenHourShifts: (beforeCfg.sixteenHourShifts ?? []).filter((k) => k !== sixteenKey),
        },
      });
      if (evBefore.shift.limits.window > evWithoutSixteen.shift.limits.window) {
        otherExceptionActive = 'sixteen';
        beforeLabel = 'Before (16-hr day already on)';
      }
    }
  } else {
    const existingKey = evRaw.shift.exceptionKeys.sixteen;
    alreadyActiveOnLog = existingKey !== null;
    if (evRaw.shift.exceptionKeys.adverse !== null) {
      otherExceptionActive = 'adverse';
      beforeLabel = 'Before (Adverse already on)';
    }
    evBefore = existingKey !== null
      ? evaluate(logged, {
          asOf: now,
          config: {
            ...cfg,
            sixteenHourShifts: (cfg.sixteenHourShifts ?? []).filter((k) => k !== existingKey),
          },
        })
      : evRaw;
    evAfter = existingKey !== null
      ? evRaw
      : evaluate(logged, {
          asOf: now,
          config: {
            ...cfg,
            sixteenHourShifts: [...(cfg.sixteenHourShifts ?? []), evBefore.shift.exceptionKey],
          },
        });
    blockedByLog = evAfter.shift.limits.window === evBefore.shift.limits.window;
    if (blockedByLog) {
      const winH = evBefore.shift.limits.window / 60;
      const engineIneligibleNote = evAfter.shift.notes.find((n) => /§395\.1\(o\)\(3\)|^⚠/.test(n));
      // Engine's (o)(3) note hard-codes "window stays 14 hours", which is inaccurate when Adverse is already on (16h).
      logBlockNote = winH !== 14 || !engineIneligibleNote
        ? `49 CFR §395.1(o)(3) allows the 16-hour exception only once in 7 carrier days without an intervening 34-hour restart. Your window stays at ${winH} hours.`
        : engineIneligibleNote;
    }
  }

  const afterWindowHours = evAfter.shift.limits.window / 60;
  const stackWarning = otherExceptionActive !== null && !blockedByLog && afterWindowHours > 16
    ? `Stacking Adverse + 16-hour is NOT confirmed to allow an ${afterWindowHours}-hr window — check with your carrier before relying on anything past 16h.`
    : null;

  const before = snapshotOf(evBefore, homeTimeZone);
  const after = snapshotOf(evAfter, homeTimeZone);

  let bindingNote: string | null = null;
  if (blockedByLog) {
    bindingNote = logBlockNote;
  } else if (after.windowRemaining === 0 || after.windowEnd <= after.asOf) {
    bindingNote = `Your window ended at ${before.windowEndHM}; with the exception it ended at ${after.windowEndHM} — stop now.`;
  } else if (after.mustStopBy === before.mustStopBy) {
    if (after.binding === 'BREAK_30') {
      bindingNote = 'Must-stop time does not move until you take a 30-minute break (49 CFR §395.3(a)(3)(ii)).';
    } else if (after.binding === 'CYCLE') {
      bindingNote = `Must-stop time does not move — your ${after.cycleLimit / 60}-hr cycle binds first.`;
    } else if (after.binding === 'DRIVE_11' && input.kind === 'sixteen') {
      bindingNote = `Must-stop time does not move — your ${after.driveLimit / 60}-hr driving limit still binds first (§395.1(o) extends only the window, never driving time).`;
    } else if (after.binding === 'WINDOW_14') {
      bindingNote = `Must-stop time does not move — your ${after.windowLimit / 60}-hr shift window already binds.`;
    }
  } else if (input.kind === 'sixteen' && after.binding === 'DRIVE_11') {
    bindingNote = `Window extends to ${after.windowLimit / 60}h, so your ${after.driveLimit / 60}-hr driving limit now binds first — driving limit does NOT expand.`;
  }

  return {
    kind: input.kind,
    homeTimeZone,
    homeZoneName,
    nowHM: fmtHM(now, homeTimeZone),
    alreadyActiveOnLog,
    otherExceptionActive,
    beforeLabel,
    stackWarning,
    blockedByLog,
    logBlockNote,
    before,
    after,
    bindingNote,
  };
}

/* ---------- Static Safe Haven myth-buster card ---------- */

export function getSafeHavenCard(): LegalVerdict {
  return {
    treeId: 'safehaven',
    verdict: 'NO',
    verifyCarrierPolicy: false,
    verdictLabel: 'NO — EXPLOSIVES ONLY',
    tone: 'bad',
    sign: 'stop',
    headline: '"Safe Haven" is NOT an HOS exception for general freight.',
    explanation:
      '49 CFR §397.5 defines "safe haven" ONLY for attendance and surveillance of Class 1.1, 1.2, and 1.3 explosives. It NEVER extends your 11-hour driving limit, 14-hour window, or 60/70-hour cycle for general freight.',
    citation: '49 CFR §397.5',
    carrierPolicyWarning: null,
    standingReminder:
      'Do NOT write "Safe Haven" on your ELD for general freight HOS shortages — roadside inspectors treat that as an ordinary HOS violation.',
    annotation: null,
    clockGuidance: null,
    effectNote:
      'For general freight, check Adverse Driving Conditions (§395.1(b)(1)) or Personal Conveyance (FMCSA 2018 PC guidance — verify carrier policy), or park legally before clocks expire.',
    advisoryLine: LEGAL_ADVISORY_LINE,
    preview: null,
  };
}

/* ---------- Four HOS Exception Decision Trees ---------- */

interface TreeQuestionSpec extends LegalQuestion {
  noVerdict: Omit<LegalVerdict, 'treeId' | 'advisoryLine' | 'preview'>;
}

interface TreeSpec {
  id: LegalTreeId;
  title: string;
  shortCite: string;
  questions: readonly TreeQuestionSpec[];
  yesVerdict: Omit<LegalVerdict, 'treeId' | 'advisoryLine' | 'preview'>;
  previewKind: 'adverse' | 'sixteen' | null;
}

const TREES: Record<LegalTreeId, TreeSpec> = {
  adverse: {
    id: 'adverse',
    title: 'Adverse Driving Conditions',
    shortCite: '49 CFR §395.1(b)(1)',
    previewKind: 'adverse',
    questions: [
      {
        id: 'after_dispatch',
        question:
          'Was the condition unknown (and not reasonably knowable) at the most recent of: starting this duty day, or ending your last qualifying rest — AND unknown to dispatch before sending you out?',
        detail:
          'Qualifying rest means a 10-hr break, ≥7-hr sleeper, or the ≥2-hr split-sleeper leg (a 30-min break does NOT count). If you knew — or could reasonably have known — at the most recent of those moments (or if dispatch knew before sending you out), answer NO.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify for Adverse Driving Conditions.',
          explanation:
            'Under 49 CFR §395.2 & §395.1(b)(1), Adverse Driving applies ONLY when the condition was not known — and could not reasonably have been known — at the most recent of starting this duty day or ending your last qualifying rest (10-hr break, ≥7-hr sleeper, or ≥2-hr split leg; a 30-min break does not count), and was unknown to your carrier before dispatch.',
          citation: '49 CFR §395.1(b)(1) · §395.2',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Standard 11-hr driving and 14-hr shift window limits still apply. Do not claim Adverse Driving on your ELD.',
        },
      },
      {
        id: 'unforeseeable',
        question:
          'Was it genuinely unforeseeable — a crash closure or sudden ice — NOT rush hour, NOT forecasted snow, and NOT a full truck stop?',
        detail: 'Routine traffic, forecasted winter weather, dock detention, and full truck stops never qualify.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify for Adverse Driving Conditions.',
          explanation:
            'Rush hour traffic, forecasted snow or storms, shipper/receiver detention, and full truck stops are foreseeable and do NOT meet 49 CFR §395.1(b)(1).',
          citation: '49 CFR §395.1(b)(1)',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Standard 11-hr driving and 14-hr shift window limits still apply. Plan a legal stop before your clocks run out.',
        },
      },
    ],
    yesVerdict: {
      verdict: 'YES',
      verifyCarrierPolicy: false,
      verdictLabel: 'YES',
      tone: 'good',
      sign: 'go',
      headline: 'Qualifies under FMCSA Adverse Driving Conditions.',
      explanation:
        'Grants up to +2h driving (11h → 13h) and +2h shift window (14h → 16h) strictly to complete the run or reach a safe place to stop. Does NOT extend your 60/70-hr cycle or waive the 30-min break.',
      citation: '49 CFR §395.1(b)(1)',
      carrierPolicyWarning: null,
      standingReminder:
        'Use only the extra time needed to finish the run or reach a safe place to stop, and note the specific unexpected event on your ELD.',
      annotation: 'Unforeseen [crash/ice] closure [Hwy] MM [##] - 395.1(b)(1)',
      clockGuidance: null,
      effectNote: 'Edit the [placeholders] with your actual hazard, highway, and mile marker before saving on your ELD.',
    },
  },

  pc: {
    id: 'pc',
    title: 'Personal Conveyance (PC)',
    shortCite: 'FMCSA 2018 PC Guidance',
    previewKind: null,
    questions: [
      {
        id: 'ordered_off',
        question: 'Were you ordered off the shipper/receiver property (or otherwise out of hours and required to move)?',
        detail: 'Example: a shipper or receiver kicks you off their lot after loading/unloading with 0:00 left.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: "This check only covers being moved off a lot — for other PC uses, see your carrier's PC policy.",
          explanation:
            'FMCSA 2018 PC guidance covers out-of-hours moves to safe parking when ordered off a shipper/receiver property, as well as purely off-duty personal travel (such as motel to restaurant) with zero operational benefit. Never use PC to keep running a load.',
          citation: 'FMCSA 2018 PC Guidance (83 FR 26377) · 49 CFR §395.8 / §395.28',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'If you are moving for dispatch or operational purposes, log Driving (D).',
        },
      },
      {
        id: 'nearest_safe',
        question:
          'Are you going straight to the NEAREST reasonable safe parking — NOT advancing the load and NOT bypassing closer open parking?',
        detail:
          'Even if the nearest open parking happens to lie toward your next stop, you must stop at the FIRST reasonable safe spot — bypassing closer open parking is a top CVSA false-log citation.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify as Personal Conveyance.',
          explanation:
            'Advancing a load or bypassing closer open parking to get closer to home, a terminal, or your next pickup is operational driving — NOT Personal Conveyance under FMCSA 2018 PC guidance.',
          citation: 'FMCSA 2018 PC Guidance (83 FR 26377) · 49 CFR §395.8 / §395.28',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Stop at the nearest legal parking or log Driving (D). PC misuse is a leading roadside false-log OOS citation.',
        },
      },
    ],
    yesVerdict: {
      verdict: 'YES',
      verifyCarrierPolicy: true,
      verdictLabel: 'YES — VERIFY CARRIER POLICY',
      tone: 'warn',
      sign: 'warn',
      headline: 'Federally permitted — VERIFY CARRIER POLICY before using PC.',
      explanation:
        'FMCSA 2018 PC guidance permits moving strictly to the nearest reasonable safe parking after being ordered off a shipper/receiver lot out of hours (even laden), provided you do not advance the load or bypass closer open parking.',
      citation: 'FMCSA 2018 PC Guidance (83 FR 26377) · 49 CFR §395.8 / §395.28',
      carrierPolicyWarning:
        'VERIFY CARRIER POLICY: Many fleets disable Personal Conveyance completely or cap PC miles/minutes. Federal guidance never overrides a stricter carrier ban — confirm your carrier allows PC and enables it on your ELD.',
      standingReminder:
        'Stop at the first reasonable safe parking spot, take your full required off-duty rest (e.g. 10 hours off) there before driving on duty again, and clearly annotate who ordered you off the lot and where you parked.',
      annotation: 'Ordered off [shipper/receiver] - PC to nearest safe parking',
      clockGuidance:
        'ELD logging guidance (not an engine calculation): Personal Conveyance is logged as Off-Duty (PC). It does not add to your 11-hr drive or 60/70-hr cycle, and it does not pause a running 14-hr window.',
      effectNote: null,
    },
  },

  yard: {
    id: 'yard',
    title: 'Yard Move (YM)',
    shortCite: '49 CFR §395.28',
    previewKind: null,
    questions: [
      {
        id: 'private_restricted',
        question: 'Is the location a private, restricted-access yard (gated/fenced, no public access)?',
        detail: 'A public truck stop, travel plaza, rest area, or public fuel island is NOT yard move.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Cannot use Yard Move here.',
          explanation:
            'Yard Move (49 CFR §395.28) applies ONLY inside a private, restricted-access yard (gated/fenced, closed to public travel). A public truck stop or fuel island is open to public access and is NOT yard move.',
          citation: '49 CFR §395.28 · FMCSA Yard Move Guidance',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Movement at a public truck stop or fuel island must be logged as Driving (D).',
        },
      },
      {
        id: 'off_public_roads',
        question: 'Will you stay completely inside that private yard — never entering a public road or highway?',
        detail: 'Crossing or driving on any road open to public travel requires Driving (D).',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Cannot use Yard Move on any public road.',
          explanation:
            'Yard Move (49 CFR §395.28) ends the moment the truck enters a public street or highway. Public-road movement must be logged as Driving (D).',
          citation: '49 CFR §395.28 · FMCSA Yard Move Guidance',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Switch out of Yard Move before pulling onto any public road.',
        },
      },
    ],
    yesVerdict: {
      verdict: 'YES',
      verifyCarrierPolicy: false,
      verdictLabel: 'YES',
      tone: 'good',
      sign: 'go',
      headline: 'Qualifies as Yard Move (when enabled by your carrier ELD).',
      explanation:
        'Moving inside a private, restricted-access yard closed to public travel qualifies for Yard Move under 49 CFR §395.28 as long as you stay completely off public roads.',
      citation: '49 CFR §395.28 · FMCSA Yard Move Guidance',
      carrierPolicyWarning: null,
      standingReminder:
        'Yard Move is ON duty — it burns your 14-hr window and 70-hr (or 60-hr) cycle clocks, and only spares your 11-hr drive clock.',
      annotation: 'Private gated yard move at [facility/yard] - 395.28',
      clockGuidance:
        'ELD logging guidance (not an engine calculation): Yard Move is logged as On-Duty Not Driving (YM). Every minute in YM counts against your 14-hr shift window and 60/70-hr cycle — it only keeps the move off your 11-hr driving clock.',
      effectNote: null,
    },
  },

  sixteen: {
    id: 'sixteen',
    title: '16-Hour Short-Haul "Big Day"',
    shortCite: '49 CFR §395.1(o)',
    previewKind: 'sixteen',
    questions: [
      {
        id: 'prior_five',
        question: 'Have you returned to your home terminal on each of your last 5 duty tours?',
        detail:
          'Applies to property-carrying drivers only (§395.1(o)). You must have been released from duty at your normal work-reporting location on all 5 prior duty tours.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify for the 16-Hour Big Day.',
          explanation:
            '49 CFR §395.1(o)(1) (property-carrying drivers only) requires returning to your normal work-reporting location and being released from duty there on EACH of your previous 5 duty tours.',
          citation: '49 CFR §395.1(o)(1)',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Your shift window stays at 14 hours. Plan to shut down or arrange a motel/repower before hour 14.',
        },
      },
      {
        id: 'once_per_7',
        question: 'Is this your FIRST 16-hour day in the last 7 days (or since your last 34-hr restart)?',
        detail: 'Allowed only once in 7 consecutive carrier days unless a 34-hour restart reset the count.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify — 16-Hour Big Day already used.',
          explanation:
            '49 CFR §395.1(o)(3) allows the 16-hour exception only once in any 7-consecutive-day period unless you completed a 34-hour restart since the last use.',
          citation: '49 CFR §395.1(o)(3)',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Your shift window stays at 14 hours until the prior use rolls off or you complete a 34-hour restart.',
        },
      },
      {
        id: 'return_tonight',
        question: 'Will you return to the home terminal tonight?',
        detail: 'You must return to your normal work-reporting location and be released from duty there within 16 hours.',
        noVerdict: {
          verdict: 'NO',
          verifyCarrierPolicy: false,
          verdictLabel: 'NO',
          tone: 'bad',
          sign: 'stop',
          headline: 'Does not qualify — must return to home terminal tonight.',
          explanation:
            '49 CFR §395.1(o)(2) requires that you return to your normal work-reporting location and be released from duty there within the 16-hour window.',
          citation: '49 CFR §395.1(o)(2)',
          carrierPolicyWarning: null,
          standingReminder: null,
          annotation: null,
          clockGuidance: null,
          effectNote: 'Your shift window stays at 14 hours.',
        },
      },
    ],
    yesVerdict: {
      verdict: 'YES',
      verifyCarrierPolicy: false,
      verdictLabel: 'YES',
      tone: 'good',
      sign: 'go',
      headline: 'Qualifies for the 16-Hour Short-Haul "Big Day".',
      explanation:
        'For property-carrying drivers, your shift window extends from 14 hours to 16 hours so you can return to your home terminal and be released from duty. Your 11-hour driving limit does NOT expand — driving remains capped at 11 hours, and your 60/70-hr cycle still applies.',
      citation: '49 CFR §395.1(o)',
      carrierPolicyWarning: null,
      standingReminder:
        'Property-carrying only: window extends to 16 hours; the 11-hour drive limit does NOT expand.',
      annotation: '16-hr Big Day, returning to [home terminal] - 395.1(o)',
      clockGuidance: null,
      effectNote: null,
    },
  },
};

/**
 * Evaluate a decision tree given the answers tapped so far.
 * Any `'no'` answer ends immediately at that question's NO verdict.
 * Completing all questions with `'yes'` reaches the YES verdict and, for Adverse and 16-Hour,
 * computes a live before/after clock preview directly via `evaluate()`.
 */
export function evaluateLegalTree(
  treeId: LegalTreeId,
  answers: readonly LegalAnswer[],
  clockCtx?: { segments: Segment[]; now: number; config: RulesConfig },
): LegalStepState {
  const spec = TREES[treeId];
  const trail: { question: string; answer: LegalAnswer }[] = [];

  for (let i = 0; i < spec.questions.length; i++) {
    const q = spec.questions[i];
    if (i >= answers.length) {
      return {
        treeId,
        title: spec.title,
        shortCite: spec.shortCite,
        totalQuestions: spec.questions.length,
        answeredCount: trail.length,
        currentQuestion: { id: q.id, question: q.question, detail: q.detail },
        verdict: null,
        trail,
      };
    }
    const ans = answers[i];
    trail.push({ question: q.question, answer: ans });
    if (ans === 'no') {
      return {
        treeId,
        title: spec.title,
        shortCite: spec.shortCite,
        totalQuestions: spec.questions.length,
        answeredCount: trail.length,
        currentQuestion: null,
        verdict: {
          treeId,
          ...q.noVerdict,
          advisoryLine: LEGAL_ADVISORY_LINE,
          preview: null,
        },
        trail,
      };
    }
  }

  // All questions answered YES.
  const preview = spec.previewKind && clockCtx
    ? previewExceptionClock({
        kind: spec.previewKind,
        segments: clockCtx.segments,
        now: clockCtx.now,
        config: clockCtx.config,
      })
    : null;

  // If 16-Hour is blocked by an existing use in the driver's log within the prior 6 carrier days,
  // reflect the engine's own §395.1(o)(3) refusal honestly rather than saying YES.
  if (treeId === 'sixteen' && preview?.blockedByLog) {
    const winH = preview.before.windowLimit / 60;
    const drvH = preview.before.driveLimit / 60;
    return {
      treeId,
      title: spec.title,
      shortCite: spec.shortCite,
      totalQuestions: spec.questions.length,
      answeredCount: trail.length,
      currentQuestion: null,
      verdict: {
        treeId,
        verdict: 'NO',
        verifyCarrierPolicy: false,
        verdictLabel: 'NO — ALREADY USED IN LOG',
        tone: 'bad',
        sign: 'stop',
        headline: 'Your log already shows a 16-hour Big Day in the last 7 carrier days.',
        explanation:
          preview.logBlockNote ??
          `49 CFR §395.1(o)(3) allows the 16-hour exception only once in 7 carrier days without an intervening 34-hour restart. Your window stays at ${winH} hours.`,
        citation: '49 CFR §395.1(o)(3)',
        carrierPolicyWarning: null,
        standingReminder: `Property-carrying only: window stays at ${winH} hours; the ${drvH}-hour drive limit does NOT expand.`,
        annotation: null,
        clockGuidance: null,
        effectNote: null,
        advisoryLine: LEGAL_ADVISORY_LINE,
        preview,
      },
      trail,
    };
  }

  let yesCopy = spec.yesVerdict;
  if (preview && preview.otherExceptionActive !== null && preview.after.windowLimit / 60 > 16) {
    const dB = preview.before.driveLimit / 60;
    const dA = preview.after.driveLimit / 60;
    const wB = preview.before.windowLimit / 60;
    const wA = preview.after.windowLimit / 60;
    if (treeId === 'adverse' && preview.otherExceptionActive === 'sixteen') {
      yesCopy = {
        ...spec.yesVerdict,
        explanation:
          `Your logged record already has the 16-hr day on, so the preview below shows +2h driving (${dB}h → ${dA}h) and +2h shift window (${wB}h → ${wA}h) — stacking Adverse + 16-hour is NOT confirmed to allow an ${wA}-hr window; check with your carrier before relying on anything past 16h. Strictly to complete the run or reach a safe place to stop; does NOT extend your 60/70-hr cycle or waive the 30-min break.`,
      };
    } else if (treeId === 'sixteen' && preview.otherExceptionActive === 'adverse') {
      yesCopy = {
        ...spec.yesVerdict,
        explanation:
          `For property-carrying drivers (§395.1(o)): your logged record already has Adverse Driving on, so the preview below shows the shift window moving ${wB}h → ${wA}h while your ${dB}-hour driving limit stays at ${dA}h (does NOT expand). Stacking Adverse + 16-hour is NOT confirmed to allow an ${wA}-hr window — check with your carrier before relying on anything past 16h. Your 60/70-hr cycle still applies.`,
        standingReminder:
          `Property-carrying only: preview shows ${wB}h → ${wA}h because Adverse is already on (unconfirmed past 16h — check with your carrier); your ${dB}-hour drive limit does NOT expand.`,
      };
    }
  }

  return {
    treeId,
    title: spec.title,
    shortCite: spec.shortCite,
    totalQuestions: spec.questions.length,
    answeredCount: trail.length,
    currentQuestion: null,
    verdict: {
      treeId,
      ...yesCopy,
      advisoryLine: LEGAL_ADVISORY_LINE,
      preview,
    },
    trail,
  };
}
