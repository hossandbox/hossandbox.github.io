import { useEffect, useLayoutEffect, useMemo, useState, useRef, useContext } from 'preact/hooks';
import { Component, createContext, type ComponentChildren, type JSX } from 'preact';
import { createBackNav, type BackNav } from './backnav.ts';
import { alertTick, holdWakeLock, type WakeEnv, alertBanner, alertMessage, wantsWakeLock, unlockAudio, chime, buzz, tapTick, statusHaptic, sound, audioReady, clearPendingSound, notify, notifyState, askNotify, canKeepAwake, NO_ALERTS, type AlertMemory, type NotifyState, speechReady, shouldAskSpeech, alertSpeech, statusSpeech } from './alerts.ts';

/** A crashing tab shows an error card (with a one-tap bug report) instead of blanking the whole app. */
class TabBoundary extends Component<{ tab: string; children: ComponentChildren }, { err: string | null }> {
  state = { err: null as string | null };
  componentDidCatch(e: unknown) { this.setState({ err: e instanceof Error ? `${e.message}\n${(e.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(e) }); }
  render() {
    if (!this.state.err) return this.props.children;
    const issue = `https://github.com/hossandbox/hossandbox.github.io/issues/new?template=bug-report.yml&title=${encodeURIComponent(`[bug] ${this.props.tab} tab crashed`)}&expected=${encodeURIComponent('Tab should render')}&app_said=${encodeURIComponent(this.state.err)}&build=${encodeURIComponent(__BUILD__)}`;
    return (
      <div class="card warn">
        <h3>This tab hit a bug</h3>
        <p class="small">Your log is safe. The other tabs still work. Please report this:</p>
        <pre class="small" style="white-space:pre-wrap">{this.state.err}</pre>
        <a class="btn" href={issue} target="_blank" rel="noopener">🐞 Report this crash</a>
        <button class="ghost" onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    );
  }
}
import {
  evaluate, driveAgainAt, pruneHistory, planTripAll, carrierDayStart, nextCarrierDayStart, dayLabel, TRIP_STRATEGIES, safeHaven, normalize, restPeriods, LIMITS, type TripStrategy, type Segment, type DutyStatus, type FullEvaluation, type Violation, type TripPlan, type TripInput, type RestPeriod,
} from '../../engine/src/index.ts';
import {
  useStore, setState, useNow, allSegments, loggedSegments, toInput, fromInput, clock, clockFull, dur, hrs, STATUS_LABEL, STATUS_COLOR, segLabel as storeSegLabel, BREAK_NOTE, exportState, applySegmentEdit, adjustCurrentStart, absorbCurrentStart, placeEntry, dropCurrentPatch, type Absorbed, statusBeingLeft, readMinutesAgo, type AdjustStartProblem, sanitizeBreaks, breakNote, noteFits, MAX_BREAKS, type BreakPreset, isValidTimeZone, listedZone, zoneLabel, zoneShort, zonePair, screenTheme, TIME_ZONES, deviceTz, applyImportedState, draftResets, applyTheme, effectiveTheme, devicePrefersDark, chooseTheme, historyBasis, historyDays, cycleBasis, applyDayPatch, dayPatchOverflow, stamp, meaningfulGaps, statusTap, dayClosePatch, reopenDayPatch, dayCloseFor, dayCloseToday, currentRunStart, joinDisplayRows, applyEldSeed, synthesizeEldSeed, splitEstimateActive, cycleParamsOf, type EldClocks, readEldEntry, driftCheck, planDriftFill, DRIFT_NOTE, type DriftComparison, type DriftFillPlan, ELD_SEED_NOTE, latestLegalDeparture, smallestRestFix, whyLever, DEFAULT_TRIP, DEFAULT_SPLIT, DEFAULT_LOADCHECK, DEFAULT_WEEK_LOAD, DEFAULT_WEEK_PLAN, WEEK_MAX_LOADS, sanitizeWeekPlan, type State, type TripDraft, type SplitDraft, type LoadCheckDraft, type WeekPlanDraft, type WeekLoadDraft, type WeekHomeTarget, type Theme, nowMin, importProblem, INITIAL_STATE, getState, dateable, sanitizeDayCloses, sanitizeConfig, SIM_KEY,
  useDrivers, getActiveDriverName, lockDriverSession, registerSessionHooks, setDriverGateBypassForTest, reloadVaultFromStorage, syncActiveUndoRaw,
  STAY_UNLOCKED_SPLASH_MS, completeAutoUnlock, getStayUnlocked, isStayUnlockedEffective, getPendingAutoUnlockId, setStayUnlocked, getIosInstallNoteDismissed, dismissIosInstallNote,
} from './store.ts';
import { driverFileSlug, driverInitials } from './drivers.ts';
import { StartupSplash, ActiveDriverStrip, DriverSettingsCard, DisclosureModal, CLOCK14_DISCLAIMER_TEXT } from './driver-ui.tsx';
import { EldGuideFlow } from './eldguides-ui.tsx';
export { setDriverGateBypassForTest, reloadVaultFromStorage, lockDriverSession, STAY_UNLOCKED_SPLASH_MS, completeAutoUnlock, getStayUnlocked, isStayUnlockedEffective, getPendingAutoUnlockId, setStayUnlocked, getIosInstallNoteDismissed, dismissIosInstallNote };
import { clampDayStartMinute, safeRulesConfig, formatDayStartHM, dayStartWord } from './carrierday.ts';
import {
  projectRecapVs34, defaultResetStart, wallMinuteInCarrierDay, fmtWallHM, parseIsoDay,
  PROJECTION_SHIFTS, SHIFT_BUDGET_PRESETS, SHIFT_START_PRESETS, RESET_TIME_PRESETS,
} from './recap.ts';
import {
  planRollout, defaultAppointmentFor, resolveWallDateTime, formatWallDateTime, COMMON_APPT_ZONES,
  MIN_MPH, MAX_MPH, DEFAULT_MPH, DEFAULT_BUFFER_MIN, DEFAULT_DOCK_MIN, DEFAULT_PRETRIP_MIN, DEFAULT_MILES,
  MPH_PRESETS, MILES_PRESETS, HOURS_PRESETS, BUFFER_PRESETS, DOCK_PRESETS, PRETRIP_PRESETS,
  type ZoneEntryMode, type DistanceMode,
} from './rollout.ts';
import {
  simulateRescue, resolveRescueDeadline, fmtRescueShort, fmtRescueFull,
  SPLIT_SB_CALLOUT, RESCUE_MIN_MPH, RESCUE_MAX_MPH, RESCUE_DEFAULT_MPH,
  RESCUE_DEFAULT_MILES, RESCUE_DEFAULT_WAIT_MIN, RESCUE_DEFAULT_DRIVE_DIRECT,
  RESCUE_WAIT_PRESETS, RESCUE_MILES_PRESETS, RESCUE_MPH_PRESETS, RESCUE_HOURS_PRESETS,
  type RescueDistanceMode, type RescueStrategyResult,
} from './rescue.ts';
import {
  evaluateStackChain, createDefaultStops, loadStackDraft, saveStackDraft, clearStackDraft,
  clampStackMph, stackLegDriveMinutes, deadheadMilesFor, resolveStackWallMinute, fmtStackFull,
  STACK_MIN_STOPS, STACK_MAX_STOPS, STACK_MIN_MPH, STACK_MAX_MPH, STACK_DEFAULT_MPH,
  STACK_MAX_MILES, STACK_MAX_DWELL_MIN, STACK_MAX_DEPARTURE_FUTURE_MIN, STACK_SPLIT_SB_CALLOUT,
  STACK_MILES_PRESETS, STACK_MPH_PRESETS, STACK_DWELL_PRESETS, STACK_COMMON_ZONES,
  type StackStopInput, type StackResult, type StackStopOutcome, type StackLimitKind,
} from './stack.ts';
import {
  evaluateMotel, loadMotelDraft, saveMotelDraft, clearMotelDraft, defaultMotelDraft, clampMotelMph,
  MOTEL_MIN_MPH, MOTEL_MAX_MPH, MOTEL_DEFAULT_MPH, MOTEL_MAX_MILES, MOTEL_MAX_DRIVE_MIN, MOTEL_MAX_HOOK_MIN,
  MOTEL_HOOK_PRESETS, MOTEL_MILES_PRESETS, MOTEL_MPH_PRESETS, MOTEL_DRIVE_PRESETS,
  type MotelDistanceMode, type MotelResult,
} from './motel.ts';
import {
  LEGAL_ADVISORY_LINE, LEGAL_HOME_ITEMS, evaluateLegalTree, getSafeHavenCard,
  type LegalAnswer, type LegalItemId, type LegalVerdict,
} from './legal.ts';
import {
  FLIP_PRESETS, FLIP_STANDING_LINE, defaultShutdownMinute, planFlipBridges,
  formatFlipWallDateTime, resolveFlipWallMinute, formatHM,
  type FlipOptionA, type FlipOptionB, type FlipOptionC,
} from './flip.ts';
import {
  MILES_STANDING_LINE, MILES_GOAL_PRESETS, MILES_OVERHEAD_PRESETS, MILES_DOW_LABELS,
  MILES_DEFAULT_RUN, MILES_DEFAULT_GOAL, MILES_DEFAULT_MPH, MILES_MIN_MPH, MILES_MAX_MPH,
  MILES_DEFAULT_OVERHEAD_MIN, MILES_MAX_OVERHEAD_MIN, MILES_DEFAULT_CUTOFF_DOW,
  MILES_DEFAULT_CUTOFF_HOUR, MILES_DEFAULT_CUTOFF_MIN, MILES_MAX_RUN, MILES_MAX_GOAL,
  evaluateMilesLeft, fmtHMM, fmtMilesNum, formatCutoffHM,
} from './miles.ts';
import {
  synthesizeWeek, createNextWeekLoad, getWeekHubSummary, primeWeekHubCache, clearWeekHubCache,
  getWeekSynthesisCount, resetWeekSynthesisCount, computeWeekHubFingerprint,
  WEEK_MILES_PRESETS, WEEK_DOCK_PRESETS,
  WEEK_USUAL_BUDGET_PRESETS, WEEK_USUAL_START_PRESETS,
  type WeekSynthesisResult, type WeekLoadOutcome, type WeekConflict, type WeekHubSnapshot, type WeekStrategyId,
} from './week.ts';
export {
  synthesizeWeek, createNextWeekLoad, getWeekHubSummary, clearWeekHubCache,
  getWeekSynthesisCount, resetWeekSynthesisCount, computeWeekHubFingerprint,
};
import {
  speechRecognitionCtor, speechSynthesisAvailable, speakAloud, parseClockUtterance, composeReadBack,
  beginVoice, voiceAccept, voiceFailure, voiceDiscard, type VoiceFlow, type SpeechRecognitionLike,
} from './voiceclocks.ts';
import { extractEldClocks, mergeExtractions, type OcrWord } from './eldocr.ts';
import { computeLevers, pickChips, leverTitle, leverSub, leverRule, leverAfter, leverSplitPrefill, type Lever } from './levers.ts';

/* ============================================================ shared bits */

/** D5 (audit): the one order the four statuses appear in (ELD grid order, the dock's). */
export const STATUS_ORDER: DutyStatus[] = ['OFF', 'SB', 'D', 'ON'];

/**
 * C7 (taste): plain-language row labels on screen — "30-min break · off duty" instead of
 * "30-min break (OFF)", and "Personal conveyance" / "Yard move" without "(OFF)"/"(ON)".
 * store.ts's segLabel() stays unchanged (store is frozen).
 */
export function displaySegLabel(status: DutyStatus, note?: string): string {
  const n = typeof note === 'string' ? note : undefined;
  if (n && n.startsWith(BREAK_NOTE) && n.length > BREAK_NOTE.length) {
    return `${n.slice(BREAK_NOTE.length)} · ${STATUS_LABEL[status].toLowerCase()}`;
  }
  if (n === 'PC') return 'Personal conveyance';
  if (n === 'YM') return 'Yard move';
  return storeSegLabel(status, note);
}
const segLabel = displaySegLabel;

function Card({ title, children, tone, statusBadge }: { title?: string; children: ComponentChildren; tone?: 'warn' | 'bad' | 'good'; statusBadge?: { tone: 'good' | 'warn' | 'bad'; label: string } }) {
  return (
    <section class={`card ${tone ?? ''}`}>
      {title && (statusBadge
        ? <div class="card-head-row"><h2>{title}</h2><span class={`card-status-badge ${statusBadge.tone}`} data-status-label="1">{statusBadge.label}</span></div>
        : <h2>{title}</h2>)}
      {children}
    </section>
  );
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  const tag = tone === 'bad' ? '✕ Low' : tone === 'warn' ? '⚠ Watch' : tone === 'good' ? '✓ OK' : null;
  return (
    <div class={`stat ${tone ?? ''}`}>
      <div class="stat-label">{label}{tag && <span class={`stat-tone-tag ${tone}`} data-status-label="1">{tag}</span>}</div>
      <div class="stat-value">{value}</div>
      {sub && <div class="stat-sub">{sub}</div>}
    </div>
  );
}
/**
 * A4 (audit): ONE way to type a duration — hours and minutes boxes, the ELD quick start's form —
 * wherever the app used to take raw minutes (the Split block sheet's "Exact length · min",
 * the Fine-tune and trip sliders' number box). Typed values are validated, never silently
 * substituted: anything that cannot be used says so and leaves the old value in place.
 */
export function readDurationBoxes(hText: string, mText: string, min: number, max: number): { ok: true; minutes: number } | { ok: false; problem: string } {
  const h = hText.trim(), m = mText.trim();
  if (h === '' && m === '') return { ok: false, problem: `Enter hours and minutes (${dur(min)} to ${dur(max)}).` };
  const hn = h === '' ? 0 : Number(h), mn = m === '' ? 0 : Number(m);
  if (!Number.isInteger(hn) || !Number.isInteger(mn) || hn < 0 || mn < 0) return { ok: false, problem: 'Whole hours and minutes only.' };
  if (mn > 59) return { ok: false, problem: 'Minutes go 0 to 59.' };
  const t = hn * 60 + mn;
  if (t < min || t > max) return { ok: false, problem: `Enter ${dur(min)} to ${dur(max)} — your entry was not applied.` };
  return { ok: true, minutes: t };
}
function useDurationBoxes(label: string, value: number, min: number, max: number, onChange: (v: number) => void) {
  const [h, setH] = useState(String(Math.floor(value / 60)));
  const [m, setM] = useState(String(value % 60));
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setH(String(Math.floor(value / 60))); setM(String(value % 60)); setNote(null); }, [value]);
  const typed = (nh: string, nm: string) => {
    setH(nh); setM(nm);
    const r = readDurationBoxes(nh, nm, min, max);
    if (!r.ok) { setNote(`${r.problem} Still using ${dur(value)}.`); return; }
    setNote(null);
    if (r.minutes !== value) onChange(r.minutes);
  };
  const reset = () => { setH(String(Math.floor(value / 60))); setM(String(value % 60)); setNote(null); };
  const boxes = (
    <span class="qs-inputs dur-boxes">
      <input type="number" class="num" inputMode="numeric" min={0} step={1} aria-label={`${label}, hours`} value={h}
        onInput={(e) => typed((e.target as HTMLInputElement).value, m)} onBlur={reset} />
      <span aria-hidden="true">h</span>
      <input type="number" class="num" inputMode="numeric" min={0} max={59} step={1} aria-label={`${label}, minutes`} value={m}
        onInput={(e) => typed(h, (e.target as HTMLInputElement).value)} onBlur={reset} />
      <span aria-hidden="true">m</span>
    </span>
  );
  return { boxes, note };
}

function Slider({ label, value, min, max, step, onChange, fmt, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string; unit?: string }) {
  // Text state so the driver can clear the box and type a fresh number; the slider and the steppers
  // write straight through. Numeric entry matters most on a phone (consumer-review-1/2).
  const [text, setText] = useState(String(value));
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { setText(String(value)); }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  const set = (v: number) => { if (Number.isFinite(v)) onChange(clamp(v)); };
  /** Typed values are validated, never silently substituted — a 20-mile run must not become 50. */
  const typed = (el: HTMLInputElement) => {
    const raw = el.value;
    const keep = `Still using ${fmt(value)}.`;
    if (raw === '') {
      // Empty covers two cases: the driver cleared the box, and the browser refusing text it cannot
      // parse (a number input reports an empty value for "3,500"). `badInput` flags the second case
      // when the browser sets it; either way the stored value is untouched, and silently reverting is
      // how a driver ends up reading the OLD route believing they changed it (consumer-review-6, #4).
      setText('');
      setNote(el.validity?.badInput
        ? `That isn't a number this field can read — try 3500 rather than 3,500. ${keep}`
        : `Enter ${min}–${max}${unit ? ` ${unit}` : ''}. ${keep}`);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) { setNote(`Enter a number. ${keep}`); return; }
    if (n < min || n > max) { setNote(`Enter ${min}–${max}${unit ? ` ${unit}` : ''} — your entry was not applied. ${keep}`); return; }
    setNote(null);
    onChange(Math.round(n));
  };
  // A4 (audit): a minutes slider is typed as hours + minutes, never as raw minutes.
  const minutes = unit === 'min';
  const dbox = useDurationBoxes(label, value, min, max, onChange);
  return (
    <div class="slider">
      <div class="slider-head"><span>{label}{unit && !minutes && <span class="muted"> · {unit}</span>}</span><b>{fmt(value)}</b></div>
      <div class={minutes ? 'slider-row nobox' : 'slider-row'}>
        {/* step=1 on both inputs so the range's exposed value always equals the real value. A coarse
            step makes the browser snap the control to min + k*step — 20 reads as 26, and with
            min=1/step=25 even the maximum (3000) was unreachable at 2976 (consumer-review-4). The
            −/+ buttons keep the coarse increment. */}
        <input type="range" style={`--fill:${max > min ? Math.max(0, Math.min(100, Math.round(((value - min) / (max - min)) * 100))) : 0}%`} aria-label={`${label}${unit ? ` (${unit})` : ''}`} min={min} max={max} step={1} value={value} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} />
        <button class="mini" title={`Decrease by ${step}${unit ? ` ${unit}` : ''}`} aria-label={`Decrease ${label} by ${step}${unit ? ` ${unit}` : ''}`} onClick={() => set(value - step)}>−{step}</button>
        {minutes ? null : <input
          type="number" class="num" inputMode="numeric" aria-label={`${label}, type an exact value${unit ? ` in ${unit}` : ''}`}
          min={min} max={max} step={1} value={text}
          onInput={(e) => typed(e.target as HTMLInputElement)}
          onBlur={() => setText(String(value))}
        />}
        <button class="mini" title={`Increase by ${step}${unit ? ` ${unit}` : ''}`} aria-label={`Increase ${label} by ${step}${unit ? ` ${unit}` : ''}`} onClick={() => set(value + step)}>+{step}</button>
      </div>
      {note && <div class="warnbox small">{note}</div>}
      {minutes && <div class="qs-row slider-exact"><span class="qs-label">Exact</span>{dbox.boxes}</div>}
      {minutes && dbox.note && <div class="warnbox small">{dbox.note}</div>}
    </div>
  );
}
function Toggle<T extends string | boolean>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  // aria-pressed so the selected state exists for assistive tech, not only as a CSS class
  // (consumer-review-6, finding 6).
  return <div class="toggle" role="group">{options.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
/**
 * Patch L1 item 5: the Now card's Timeline / Dial choice, on the card itself. It is the SAME
 * setting as More → Planning → "Main card on Now" — one field in the store (`nowCard`), one
 * setter, one option list — so the two switches are two views of one value and changing
 * either moves the other. Either one also answers the one-time "New: timeline" question.
 */
export const NOW_CARD_OPTIONS: [State['nowCard'], string][] = [['timeline', 'Timeline'], ['dial', 'Dial']];
export function setNowCard(v: State['nowCard']) { setState({ nowCard: v, nowCardAsked: true }); }
/** The on-card switch. NowTab provides it through CardSwitchCtx; a hero drawn anywhere else (a sheet) gets none. */
function NowCardSwitch({ value }: { value: State['nowCard'] }) {
  return (
    <div class="card-switch" role="group" aria-label="Main card on Now">
      <span class="card-switch-l">Show as</span>
      <Toggle options={NOW_CARD_OPTIONS} value={value} onChange={(v) => setNowCard(v)} />
    </div>
  );
}
const CardSwitchCtx = createContext<ComponentChildren>(null);
function CardSwitchSlot() { return <>{useContext(CardSwitchCtx)}</>; }
/**
 * Time-zone picker. The text is held locally and only applied once it names a real zone: an invalid
 * zone makes Intl.DateTimeFormat throw inside the engine, which would blank every tab behind the
 * error boundary (consumer-review-3 follow-up).
 */
function TimeZoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(value); setBad(false); }, [value]);
  // Only a listed city name is saved. That also stops a half-typed entry being saved on the way to the
  // real one, and keeps out short names like "EST" that never switch to daylight time.
  const typed = (raw: string) => {
    setText(raw);
    const z = listedZone(raw);
    if (z) { setBad(false); onChange(z); } else setBad(true);
  };
  const shortName = (t: string) => isValidTimeZone(t.trim()) && !listedZone(t);
  return (
    <>
      <label>Home terminal time zone
        <input list="tz-list" aria-label="Home terminal time zone" value={text} onInput={(e) => typed((e.target as HTMLInputElement).value)} />
        {/* The saved value stays the IANA name; common zones also carry the driver's own words
            as the option label, so the list can be scanned by "Central", not by path (patch 7). */}
        <datalist id="tz-list">{TIME_ZONES.map((z) => <option key={z} value={z} label={zoneLabel(z)} />)}</datalist>
      </label>
      {bad && (shortName(text)
        ? <div class="warnbox small">"{text.trim()}" is an old short name, so the setting is unchanged: some of these never switch to daylight saving time. Pick your terminal's city from the list — for example <b>America/New_York</b>.</div>
        : <div class="warnbox small">"{text}" isn't a time-zone name, so the setting is unchanged. Start typing a city and pick from the list — for example <b>America/Chicago</b>.</div>)}
      {!bad && shortName(value) && <div class="warnbox small">Your zone is saved as the short name "<b>{value}</b>". Some short names never switch to daylight saving time, which puts every clock an hour off for half the year. Pick your terminal's city from the list.</div>}
    </>
  );
}
function ViolationList({ items, from }: { items: Violation[]; from?: number }) {
  const list = from === undefined ? items : items.filter((v) => v.start >= from);
  if (!list.length) return <p class="ok viol-ok" data-status-label="1"><Icon d={I.check} size={16} /> No violations.</p>;
  return <ul class="viol">{list.map((v, i) => <li key={i} class={v.severity}><span class={`viol-glyph ${v.severity}`} aria-hidden="true" data-status-label="1">{v.severity === 'nominal' ? '⚠' : '✕'}</span><b>{violationLabel[v.kind]}</b> · {dur(v.minutes)} · {clock(v.start)} → {clock(v.end)}{' '}<span class="sev" title="Size only says how much time is involved — any of these can be cited.">{severityWord[v.severity]}</span><br /><small>{v.detail}</small></li>)}</ul>;
}
/** Severity in the driver's words. The internal enum says "nominal", which reads as "acceptable" —
 *  nothing short of zero hours is acceptable; it is simply less (stress-test 2.8). */
const severityWord: Record<Violation['severity'], string> = { nominal: 'minor', violation: 'over', egregious: 'well over' };
/**
 * The binding limit in the driver's words.
 * C3 (taste): BREAK_30 reads plainly as "30-min break due in 3h 00m" (or "30-min break due" when
 * the counter has reached 0) instead of "8 hours of driving (30-min break in 3h 00m)".
 */
function bindingLabel(ev: FullEvaluation): string {
  if (ev.binding === 'BREAK_30') return ev.shift.breakRemaining <= 0 ? '30-min break due' : `30-min break due in ${dur(ev.shift.breakRemaining)}`;
  // Name the limit in full, with its number: "driving limit" did not say which one (redesign).
  switch (ev.binding) {
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hour driving limit`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hour window`;
    case 'CYCLE': return `${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day cycle`;
    default: return 'no limit';
  }
}
/** C3 (taste): BREAK_30 already stands on its own without a "limited by" prefix; other limits keep "limited by …". */
function bindingSentence(ev: FullEvaluation): string {
  return ev.binding === 'BREAK_30' ? bindingLabel(ev) : `limited by ${bindingLabel(ev)}`;
}
/**
 * The binding rule's citation — the Why rows' mapping (see WhySheet), for the binding row only.
 * Keep the two in step: a text to dispatch that names a different paragraph than the panel does
 * would be worse than none.
 */
function bindingCite(ev: FullEvaluation): string | null {
  const sh = ev.shift;
  const adv = sh.exceptionKeys.adverse !== null;
  const six = sh.exceptionKeys.sixteen !== null;
  switch (ev.binding) {
    case 'DRIVE_11': return `49 CFR 395.3(a)(3)(i)${adv ? ' · adverse §395.1(b)(1)' : ''}`;
    case 'BREAK_30': return '49 CFR 395.3(a)(3)(ii)';
    case 'WINDOW_14': return `49 CFR 395.3(a)(2)${adv ? ' · adverse §395.1(b)(1)' : ''}${six ? ' · 16-hour day §395.1(o)' : ''}`;
    case 'CYCLE': return `49 CFR 395.3(b)(${ev.cycle.windowDays === 7 ? '1' : '2'})`;
    default: return null;
  }
}
/**
 * Patch #4: the verdict as plain text for dispatch — the same numbers the dial shows, in two
 * lines a dispatcher can read at a glance, with the binding rule's citation attached (the
 * "show your work" layer, Patch #3, in the driver's pocket). Pure: the smoke suite pins its
 * exact wording. `againOff` is the drive-again time when stopped (null = not within 36h).
 */
export function shareText(ev: FullEvaluation, againOff: number | null): string {
  const cite = bindingCite(ev);
  const by = `${bindingSentence(ev)}${cite ? ` (${cite})` : ''}`;
  if (ev.driveNow > 0) {
    return `I can drive ${dur(ev.driveNow)}. Stop by ${clockFull(ev.mustStopBy)}.\n${by.charAt(0).toUpperCase() + by.slice(1)}.`;
  }
  const back = againOff !== null ? `I can drive again at ${clockFull(againOff)}.` : 'Driving does not come back within 36 hours of rest.';
  return `I'm out of driving time — ${by}.\n${back}`;
}
/**
 * Hand the text to the OS share sheet where there is one; elsewhere copy it, following the
 * bug report's clipboard pattern. A cancelled share sheet is the driver's choice, not a
 * failure to route around — it does NOT fall through to a copy he didn't ask for.
 */
async function shareVerdictText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if ('share' in navigator) {
    try { await navigator.share({ text }); return 'shared'; }
    catch (e) { if ((e as Error)?.name === 'AbortError') return 'failed'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
/** The Share button for the hero feet: the label itself is the feedback (Copied / Couldn't share). */
function useShareButton(text: string, label = 'Share') {
  const [note, setNote] = useState('');
  const onClick = async () => {
    const r = await shareVerdictText(text);
    if (r === 'shared') return;
    setNote(r === 'copied' ? 'Copied ✓' : 'Couldn’t share');
    window.setTimeout(() => setNote(''), 2500);
  };
  return <button class="link" onClick={onClick}><Icon d={I.share} size={18} /> {note || label}</button>;
}
/** Driver-facing names for a violation. The enum id (WINDOW_14, BREAK_30…) is internal, never UI copy. */
const violationLabel: Record<Violation['kind'], string> = {
  DRIVE_11: '11-hour driving limit',
  WINDOW_14: '14-hour duty window',
  BREAK_30: '30-minute break',
  CYCLE: '60/70-hour cycle limit',
};

const REPO = 'hossandbox/hossandbox.github.io';
export const BUG_REPORT_EMAIL = 'lorico.estrellado@gmail.com';
export const BUG_REPORT_SUBJECT = 'Clock 14 bug report';
export const BUG_REPORT_MAILTO_MAX = 1800;
export const BUG_REPORT_EXPORT_LINE = 'Full log copy: Settings → Data → Export — please attach it to this email.';

/** Coarse platform classification for bug-report diagnostics (iOS/Android/desktop + standalone vs browser tab). */
export function detectPlatformClass(
  nav?: { userAgent?: string; maxTouchPoints?: number; standalone?: boolean },
  win?: { matchMedia?: (q: string) => { matches: boolean } },
): string {
  const n = nav ?? (typeof navigator !== 'undefined' ? (navigator as unknown as { userAgent?: string; maxTouchPoints?: number; standalone?: boolean }) : undefined);
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  const ua = typeof n?.userAgent === 'string' ? n.userAgent : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (n?.maxTouchPoints ?? 0) > 1);
  const isAndroid = !isIos && /Android/i.test(ua);
  const os = isIos ? 'iOS' : isAndroid ? 'Android' : 'desktop';
  const standalone = n?.standalone === true
    || Boolean(w && typeof w.matchMedia === 'function' && w.matchMedia('(display-mode: standalone)').matches);
  return `${os} (${standalone ? 'standalone' : 'browser tab'})`;
}

/**
 * Strictly allowlisted active-driver diagnostics snapshot for mailto bug reports.
 * HARD PRIVACY FENCE: builds a fresh object solely from active-driver log/HOS State fields;
 * never reads or includes the driver vault (__drivers), PIN/recovery hashes or salts,
 * other drivers' states, or any driver name.
 */
export function buildDiagnosticsSnapshot(s: State, now: number) {
  const cfg = safeRulesConfig(s.config);
  const basis = historyBasis(s, now);
  return {
    v: 1 as const,
    now,
    nowOverride: s.nowOverride,
    historyBasis: basis,
    historyAcknowledged: s.historyAcknowledged,
    seededAt: s.seededAt,
    lastEldCheckAt: s.lastEldCheckAt ?? null,
    tzChosen: s.tzChosen,
    deviceTz,
    config: {
      cycle: cfg.cycle,
      shortHaul: cfg.shortHaul,
      timeZone: cfg.timeZone,
      dayStartHour: cfg.dayStartHour,
      dayStartMinute: cfg.dayStartMinute,
      adverseShifts: cfg.adverseShifts,
      sixteenHourShifts: cfg.sixteenHourShifts,
    },
    current: s.current
      ? {
          status: s.current.status,
          since: s.current.since,
          ...(s.current.note ? { note: s.current.note } : {}),
          ...(s.current.createdAt !== undefined ? { createdAt: s.current.createdAt } : {}),
        }
      : null,
    segments: s.segments.map((seg) => ({
      status: seg.status,
      start: seg.start,
      end: seg.end,
      ...(seg.note ? { note: seg.note } : {}),
      ...(seg.tentative ? { tentative: true } : {}),
      ...(seg.createdAt !== undefined ? { createdAt: seg.createdAt } : {}),
    })),
    tentative: s.tentative.map((seg) => ({
      status: seg.status,
      start: seg.start,
      end: seg.end,
      ...(seg.note ? { note: seg.note } : {}),
      ...(seg.createdAt !== undefined ? { createdAt: seg.createdAt } : {}),
    })),
    dayCloses: s.dayCloses.map((dc) => ({ dayStart: dc.dayStart, at: dc.at })),
  };
}

/**
 * Zero-account mailto: link carrying build stamp, date/time, current screen, theme, platform class,
 * 4-clock summary, and compact allowlisted active-driver state JSON. Falls back to a compact summary
 * + export-attach guidance when the encoded URL would exceed BUG_REPORT_MAILTO_MAX (~1800 chars).
 */
export function bugReportMailtoHref(
  s: State,
  ev: FullEvaluation,
  now?: number,
  opts?: {
    isoNow?: string;
    nav?: { userAgent?: string; maxTouchPoints?: number; standalone?: boolean };
    win?: { matchMedia?: (q: string) => { matches: boolean } };
  },
): string {
  const evalNow = now ?? (s.nowOverride ?? nowMin());
  const isoNow = opts?.isoNow ?? new Date().toISOString();
  const theme = effectiveTheme(s, devicePrefersDark());
  const platform = detectPlatformClass(opts?.nav, opts?.win);
  const statusStr = s.current ? segLabel(s.current.status, s.current.note) : 'none';
  const breakStr = Number.isFinite(ev.shift.breakRemaining) ? dur(ev.shift.breakRemaining) : 'exempt';
  const summary = `Status: ${statusStr} | Drive: ${dur(ev.shift.driveRemaining)} | Window: ${dur(ev.shift.windowRemaining)} | Break: ${breakStr} | Cycle: ${dur(ev.cycle.remaining)}`;
  const header = `Build: ${__BUILD__}\nDate: ${isoNow}\nScreen: ${s.tab}\nTheme: ${theme}\nPlatform: ${platform}\nClocks: ${summary}`;
  const snap = buildDiagnosticsSnapshot(s, evalNow);
  const makeUrl = (body: string) =>
    `mailto:${BUG_REPORT_EMAIL}?subject=${encodeURIComponent(BUG_REPORT_SUBJECT)}&body=${encodeURIComponent(body)}`;
  const fullUrl = makeUrl(`${header}\n\nState: ${JSON.stringify(snap)}\n\nWhat happened:\n`);
  if (fullUrl.length <= BUG_REPORT_MAILTO_MAX) return fullUrl;
  const cfg = snap.config;
  const curSummary = snap.current ? `${statusStr} since ${snap.current.since}` : 'none';
  const fallbackSummary = `Summary: segments=${snap.segments.length}, tentative=${snap.tentative.length}, current=${curSummary}, cycle=${cfg.cycle}${cfg.shortHaul ? ' (short-haul)' : ''}, tz=${cfg.timeZone}, dayStart=${formatDayStartHM(cfg)}, basis=${snap.historyBasis}, seededAt=${snap.seededAt ?? 'none'}, lastEldCheckAt=${snap.lastEldCheckAt ?? 'none'}, now=${evalNow}${snap.nowOverride != null ? `, nowOverride=${snap.nowOverride}` : ''}`;
  return makeUrl(`${header}\n\n${fallbackSummary}\n${BUG_REPORT_EXPORT_LINE}\n\nWhat happened:\n`);
}

/** Copies the exported state to the clipboard and opens a prefilled GitHub issue. */
function reportBug(s: State, ev: FullEvaluation) {
  const json = exportState(s, '');
  // GitHub rejects issue URLs past ~8 KB (414/500), and the log is URL-encoded at roughly 1.5×, so
  // only a short log rides in the URL; anything longer goes via the clipboard (bug report C4).
  const clocks = `drive now ${dur(ev.driveNow)} (${ev.binding}) · ${ev.shift.limits.drive / 60}-hr left ${dur(ev.shift.driveRemaining)} · ${ev.shift.limits.window / 60}-hr left ${dur(ev.shift.windowRemaining)} · cycle left ${dur(ev.cycle.remaining)}`;
  navigator.clipboard?.writeText(json).catch(() => {});
  const q = new URLSearchParams({ template: 'bug-report.yml', title: '[bug] ', build: __BUILD__, clocks, log: json.length < 2500 ? json : '(log too long — it is on your clipboard; paste it here)' });
  window.open(`https://github.com/${REPO}/issues/new?${q}`, '_blank', 'noopener');
}
function BugButton({ s, ev }: { s: State; ev: FullEvaluation }) {
  return <button class="ghost" onClick={() => reportBug(s, ev)}>🐞 Report a bug (GitHub)</button>;
}

/* ============================================================ Reception-fix helpers (storage safety, iOS Safari, inline clock overrides) */

/** 30 days in minutes for the Settings backup nudge & dismissal window. */
export const BACKUP_NUDGE_WINDOW_MIN = 30 * 1440;

export function shouldShowBackupNudge(s: Pick<State, 'segments' | 'tentative' | 'current' | 'lastExportAt' | 'exportNudgeDismissedAt'>, now: number): boolean {
  const hasData = s.segments.length > 0 || s.tentative.length > 0 || s.current !== null;
  if (!hasData) return false;
  if (s.lastExportAt != null && Number.isFinite(s.lastExportAt) && now - s.lastExportAt < BACKUP_NUDGE_WINDOW_MIN) return false;
  if (s.exportNudgeDismissedAt != null && Number.isFinite(s.exportNudgeDismissedAt) && now - s.exportNudgeDismissedAt < BACKUP_NUDGE_WINDOW_MIN) return false;
  return true;
}

let persistentStorageRequested = false;
/** Request browser persistent storage silently at boot when available; no-op where unsupported. */
export function requestPersistentStorage(): void {
  if (persistentStorageRequested) return;
  persistentStorageRequested = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      void Promise.resolve(navigator.storage.persist()).catch(() => {});
    }
  } catch { /* unsupported or blocked: silent no-op */ }
}
/** Test hook: reset the one-shot guard so unit tests can verify requestPersistentStorage(). */
export function resetPersistentStorageGuardForTest(): void { persistentStorageRequested = false; }

/** True only in iOS Safari when NOT running as a standalone Home Screen web app. */
export function isIosSafariNonStandalone(
  nav?: { userAgent?: string; maxTouchPoints?: number; standalone?: boolean },
  win?: { matchMedia?: (q: string) => { matches: boolean } },
): boolean {
  const n = nav ?? (typeof navigator !== 'undefined' ? (navigator as unknown as { userAgent?: string; maxTouchPoints?: number; standalone?: boolean }) : undefined);
  const w = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!n || typeof n.userAgent !== 'string') return false;
  const ua = n.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (n.maxTouchPoints ?? 0) > 1);
  if (!isIos) return false;
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  if (!isSafari) return false;
  if (n.standalone === true) return false;
  try {
    if (typeof w?.matchMedia === 'function' && w.matchMedia('(display-mode: standalone)').matches) return false;
  } catch { /* ignore */ }
  return true;
}

/**
 * Shared inline session-only clock override bar for Plan tools (receptionfix Scope 2 item 11).
 * Collapsed by default (zero extra inputs, zero log mutation) so existing tool flows and layouts
 * stay untouched; expanding lets any driver punch in their 4 ELD clocks for this planning check
 * without maintaining an up-to-date live log.
 */
function InlineClockOverride({
  s,
  now,
  override,
  onChange,
  toolId,
}: {
  s: State;
  now: number;
  override: EldClocks | null;
  onChange: (clocks: EldClocks | null) => void;
  toolId: string;
}) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cyc = cycleParamsOf(s.config);
  const liveEv = useMemo(
    () => evaluate(loggedSegments(s, now), { asOf: now, config: safeRulesConfig(s.config) }),
    [s.segments, s.current, s.config, now],
  );
  const defaultClocks = (): EldClocks => ({
    driveLeft: Math.max(0, Math.round(liveEv.shift.driveRemaining)),
    windowLeft: Math.max(0, Math.round(liveEv.shift.windowRemaining)),
    breakDueIn: Number.isFinite(liveEv.shift.breakRemaining) ? Math.max(0, Math.round(liveEv.shift.breakRemaining)) : LIMITS.BREAK_AFTER,
    cycleLeft: Math.max(0, Math.round(liveEv.cycle.remaining)),
  });
  const toBoxes = (c: EldClocks): Record<keyof EldClocks, [string, string]> => ({
    driveLeft: [String(Math.floor(c.driveLeft / 60)), String(c.driveLeft % 60)],
    windowLeft: [String(Math.floor(c.windowLeft / 60)), String(c.windowLeft % 60)],
    breakDueIn: [String(Math.floor(c.breakDueIn / 60)), String(c.breakDueIn % 60)],
    cycleLeft: [String(Math.floor(c.cycleLeft / 60)), String(c.cycleLeft % 60)],
  });
  const [txt, setTxt] = useState<Record<keyof EldClocks, [string, string]>>(() => toBoxes(override ?? defaultClocks()));
  const fields: { key: keyof EldClocks; label: string; max: number }[] = [
    { key: 'driveLeft', label: 'Drive left', max: LIMITS.DRIVE },
    { key: 'windowLeft', label: '14h window left', max: LIMITS.WINDOW },
    { key: 'breakDueIn', label: 'Break due in', max: LIMITS.BREAK_AFTER },
    { key: 'cycleLeft', label: `${cyc.limit / 60}h cycle left`, max: cyc.limit },
  ];
  const openEditor = () => {
    setTxt(toBoxes(override ?? defaultClocks()));
    setErr(null);
    setOpen(true);
  };
  const apply = (e: Event) => {
    e.preventDefault();
    const next = {} as EldClocks;
    for (const f of fields) {
      const r = readEldEntry(txt[f.key][0], txt[f.key][1]);
      if (!r.ok) {
        setErr(r.problem === 'fraction'
          ? `${f.label}: use whole hours and minutes (e.g. 7h 15m, not 7.25).`
          : `${f.label}: enter plain whole numbers.`);
        return;
      }
      next[f.key] = Math.min(f.max, Math.max(0, r.minutes));
    }
    setErr(null);
    onChange(next);
    setOpen(false);
  };
  const activeClocks = override ?? defaultClocks();
  return (
    <div class={`clock-override-bar${override ? ' is-custom' : ''}`} data-clock-override={toolId} data-clock-override-active={override ? '1' : '0'}>
      <div class="clock-override-head">
        <span class="small">
          {override ? (
            <><b>Custom ELD clocks</b> · <span class="mono">{dur(activeClocks.driveLeft)}</span> drive · <span class="mono">{dur(activeClocks.windowLeft)}</span> win · <span class="mono">{dur(activeClocks.cycleLeft)}</span> cycle</>
          ) : (
            <span class="muted">Planning from your log — want to plug in your ELD clocks instead?</span>
          )}
        </span>
        <span class="clock-override-acts">
          {override && (
            <button type="button" class="mini" data-clock-override-clear={toolId} onClick={() => { onChange(null); setOpen(false); }}>Use my log</button>
          )}
          <button type="button" class="mini" data-clock-override-toggle={toolId} onClick={() => (open ? setOpen(false) : openEditor())}>
            {open ? 'Hide' : override ? 'Edit clocks' : 'Use custom clocks'}
          </button>
        </span>
      </div>
      {open && (
        <form class="clock-override-form" data-clock-override-form={toolId} onSubmit={apply}>
          <p class="muted small" style="margin:0">Session-only — runs this check on the four clocks below without changing your log.</p>
          {fields.map((f) => (
            <div class="qs-row" key={f.key}>
              <span class="qs-label">{f.label}</span>
              <span class="qs-inputs">
                <input
                  type="number"
                  class="num"
                  inputMode="numeric"
                  min={0}
                  aria-label={`${f.label}, hours`}
                  data-co-h={f.key}
                  value={txt[f.key][0]}
                  onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => ({ ...p, [f.key]: [v, p[f.key][1]] })); }}
                />
                <span aria-hidden="true">h</span>
                <input
                  type="number"
                  class="num"
                  inputMode="numeric"
                  min={0}
                  aria-label={`${f.label}, minutes`}
                  data-co-m={f.key}
                  value={txt[f.key][1]}
                  onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => ({ ...p, [f.key]: [p[f.key][0], v] })); }}
                />
                <span aria-hidden="true">m</span>
              </span>
            </div>
          ))}
          {err && <p class="warnbox small" role="alert" style="margin:0">{err}</p>}
          <div class="row">
            <button type="submit" class="primary" data-clock-override-apply={toolId}>Apply to this check</button>
          </div>
          <p class="muted small" style="margin:0">To check your live log against your ELD, use Now → Check against my ELD.</p>
        </form>
      )}
    </div>
  );
}

/* ============================================================ icons */

/** Stroke icons, drawn in the current text colour. Decorative: every one sits next to a word. */
const I = {
  now: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  plan: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  recap: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  winddown: 'M12 10a4 4 0 0 0-4 4h8a4 4 0 0 0-4-4zM12 4v2M4.9 6.9l1.4 1.4M17.7 8.3l1.4-1.4M3 14h2M19 14h2M4 18h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  share: 'M12 14V4M7 9l5-5 5 5M5 13v8h14v-8',
  x: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM17 19.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  bunk: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  cup: 'M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v3M10 2v3M14 2v3',
  case: 'M4 7h16v13H4zM9 7V5a3 3 0 0 1 6 0v2',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14v7M10.2 11.2 3.5 9.5M13.8 11.2l6.7-1.7',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  week: 'M4 19h16M6 16v-5M11 16V8M16 16v-8M20 16v-3M4 5h16',
  rollout: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  rescue: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  stack: 'M12 3 3 7.5 12 12 21 7.5 12 3zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5',
  motel: 'M3 20V9M3 16h18v4M21 16v-3a3 3 0 0 0-3-3h-7v6M7 14.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM14 5h6m-3-3 3 3-3 3',
  legal: 'M12 3 5 6v6c0 5 3.5 8.5 7 9.5 3.5-1 7-4.5 7-9.5V6l-7-3zM9 12l2 2 4-4',
  flip: 'M21 12a9 9 0 0 0-15.5-6.3L3 8M3 3v5h5M3 12a9 9 0 0 0 15.5 6.3L21 16M16 16h5v5M12 7v5l3 2',
  miles: 'M12 20a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12l4-3M7 16h10M12 6v1M6.5 11.5h1M16.5 11.5h1',
  myweek: 'M4 5h16v14H4zM4 9h16M8 3v4M16 3v4M8 13h3M13 13h3M8 16h5',
};
function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const STATUS_ICON: Record<DutyStatus, string> = { OFF: I.cup, SB: I.bunk, D: I.wheel, ON: I.case };

/**
 * The state sign (reimagine, 2026-11-12): every answer card opens with a small road sign that
 * says where the clocks stand before a digit is read. Shape AND colour carry it, the way the
 * signs a driver reads all day do — a green guide rectangle (hours available), a yellow
 * warning diamond (under an hour, or a break due), a red octagon (out of hours), and the blue
 * rest-area square (resting) — so colour is never the only cue. The words are descriptive,
 * never a command: this is a planning tool. Presentation only; it reads the same evaluation
 * the card under it prints.
 */
/**
 * A folded explanation (reimagine, 2026-11-12): on More, the settings are the content and
 * the long "how this works" paragraphs wait one tap away behind a 48px row — a driver
 * scanning for the cycle switch at a fuel island should not have to scroll past an essay.
 * The wording itself is unchanged and stays in the page. Safety lines are never folded.
 */
function Help({ label, children }: { label: string; children: ComponentChildren }) {
  return <details class="help"><summary><Icon d={I.info} size={18} /> <span>{label}</span></summary>{children}</details>;
}
type SignKind = 'go' | 'warn' | 'stop' | 'rest';
const SIGN_SHAPE: Record<SignKind, string> = {
  go: 'M4 6.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 16V8A1.5 1.5 0 0 1 4 6.5z',
  warn: 'M12 2.2 21.8 12 12 21.8 2.2 12z',
  stop: 'M8.1 2.5h7.8l5.6 5.6v7.8l-5.6 5.6H8.1l-5.6-5.6V8.1z',
  rest: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
};
const SIGN_MARK: Record<SignKind, string> = {
  go: 'M7.5 12h8M12.5 9l3 3-3 3',
  warn: 'M12 7.5v5.5M12 16.2v.3',
  stop: 'M8 12h8',
  rest: 'M7 15.5v-6M7 13h10v2.5M17 13v-1.2a1.8 1.8 0 0 0-1.8-1.8H10.5V13',
};
function Sign({ kind, children }: { kind: SignKind; children: ComponentChildren }) {
  return (
    <div class={`sign sign-${kind}`}>
      <svg class="sign-shape" width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path class="sign-face" d={SIGN_SHAPE[kind]} /><path class="sign-mark" d={SIGN_MARK[kind]} /></svg>
      <span class="sign-word">{children}</span>
    </div>
  );
}

/* ============================================================ sheets */

/**
 * Slide-up panels for occasional jobs (redesign, 2026-10-10): change status, why this stop time, the
 * shift's exceptions, edit or add a log entry. The clocks are never put behind one: a panel is opened
 * by a tap and closed by a tap, the backdrop, or Escape, and everything behind it is inert while open.
 * Kept outside the persisted store on purpose: an open panel is not something to restore on launch.
 */
export type SheetKind =
  | { kind: 'status' }
  // Patch 19: fix the start time of the status the driver is in now (the after-the-fact door).
  // `done` (BUG-2026-11-20) carries the saved minute in sheet state so the confirmation screen
  // survives even if a DrivingView/Now transition re-seats the sheet.
  | { kind: 'since'; done?: number }
  | { kind: 'quickstart'; mode?: 'screenshot' }
  | { kind: 'drift'; mode?: 'screenshot' }
  | { kind: 'why' }
  | { kind: 'exceptions' }
  // A lever chip's sheet (capstone C1): the chip's sentence, its ghost axis, the rule and
  // the caveat. The lever travels in the descriptor, computed when the chip was tapped.
  | { kind: 'lever'; lever: Lever }
  // A Split Lab block's sheet (capstone C2, P7): steppers, the exact box, the block's fixes.
  | { kind: 'splitblock'; block: 'b1' | 'dwell' | 'drive' | 'b2' }
  // The load check's big clock (capstone C3, M7): the departure, or the receiver appointment.
  | { kind: 'loadtime'; field: 'leave' | 'appt' }
  // Patch L1 item 3: the trip planner's departure, on the same shared clock picker.
  | { kind: 'triptime' }
  // Clock-picker fix: "When to roll & PTA" appointment date & time on the shared clock picker.
  | { kind: 'rollouttime'; apptDate: string; apptTime: string; entryZoneName: string; entryTimeZone: string; fallbackMinute: number | null; onApply: (date: string, time: string) => void }
  // Split-sleeper rescue simulator: optional target delivery deadline on the shared clock picker.
  | { kind: 'rescuetime'; deadlineMinute: number; homeZoneName: string; homeTimeZone: string; onApply: (minute: number) => void }
  // Stack My Stops & Loads: per-stop optional appointment or start time on the shared clock picker.
  | { kind: 'stacktime'; mode: 'appt' | 'departure'; title: string; initialMinute: number; entryZoneName: string; entryTimeZone: string; onApply: (minute: number) => void }
  // Flip My Clock: shutdown time or custom target roll-out time on the shared clock picker.
  | { kind: 'fliptime'; mode: 'shutdown' | 'target'; initialMinute: number; targetHour?: number; targetMinute?: number; homeZoneName: string; homeTimeZone: string; onApplyShutdown?: (minute: number) => void; onApplyTarget?: (hour: number, minute: number) => void }
  // Miles Left in My 70: pay-week cutoff time-of-day on the shared clock picker.
  | { kind: 'milestime'; cutoffHour: number; cutoffMinute: number; cutoffDowName: string; homeZoneName: string; homeTimeZone: string; onApply: (hour: number, minute: number) => void }
  // My Week: home-time target, per-load hard appointment, or usual nightly start on the shared clock picker.
  | { kind: 'myweektime'; mode: 'home' | 'appt' | 'usualstart'; title: string; dateStr: string; timeStr: string; entryZoneName: string; entryTimeZone: string; onApply: (date: string, time: string) => void }
  // A9 (audit): More's two destructive actions confirm in the app's own sheet, not confirm().
  | { kind: 'confirm'; what: 'startover' | 'erase' }
  // Carrier-day exact start time (HH:MM) picker in Settings, on the shared ClockPick.
  | { kind: 'daystart' }
  // The Log's editor: which step is showing and the entry so far (see "the log editor" below).
  // `live` (patch L1 item 1): `seg` is the OPEN status, materialised up to the minute it was tapped.
  // `via: 'what'` (A2): the check was reached straight from "It wasn't …" (no counted steps).
  | { kind: 'edit'; seg: Segment; step?: EdStep; draft?: Draft; live?: boolean; via?: 'what' }
  // `inside`: add something inside this entry. `day`: a minute of the day being viewed on the Log.
  // `resume`: the step a "Change" came from, to return to once the new answer is in.
  | { kind: 'add'; step?: EdStep; draft?: Draft; inside?: Segment; day?: number; resume?: EdStep; via?: 'what' };
type MorphSheetKind = 'drift' | 'since' | 'exceptions' | 'status';
function isConvertedMorphKind(kind: SheetKind['kind']): kind is MorphSheetKind {
  return kind === 'drift' || kind === 'since' || kind === 'exceptions' || kind === 'status';
}
interface MorphRect { left: number; top: number; width: number; height: number }
interface SheetMorphOrigin { mode: 'log' | 'opener'; key?: string; el?: HTMLElement | null; rect: MorphRect | null }
let activeMorphOrigin: SheetMorphOrigin | null = null;
let openingWithMorph = false;
function logEntryKey(seg: Pick<Segment, 'status' | 'start' | 'end' | 'tentative'>): string {
  return `${seg.status}-${seg.start}-${seg.end}${seg.tentative ? '-t' : ''}`;
}
function openLogEntryEditor(k: Extract<SheetKind, { kind: 'edit' }>, entryKey: string, el: HTMLElement | null) {
  const r = el?.getBoundingClientRect?.();
  if (r && r.width > 0 && r.height > 0) {
    activeMorphOrigin = { mode: 'log', key: entryKey, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
  } else {
    activeMorphOrigin = null;
  }
  openingWithMorph = true;
  try { openSheet(k); } finally { openingWithMorph = false; }
}
function captureOpenerRect(el: HTMLElement | null): MorphRect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  if (!(r && r.width > 0 && r.height > 0)) return null;
  if (typeof window !== 'undefined') {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    if (vw > 0 && vh > 0 && (r.right <= 0 || r.left >= vw || r.bottom <= 0 || r.top >= vh)) return null;
  }
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function openMorphSheet(k: Extract<SheetKind, { kind: MorphSheetKind }>, el: HTMLElement | null) {
  activeMorphOrigin = { mode: 'opener', el, rect: captureOpenerRect(el) };
  openingWithMorph = true;
  try { openSheet(k); } finally { openingWithMorph = false; }
}
function updateActiveMorphKey(key: string) {
  if (activeMorphOrigin?.mode === 'log') activeMorphOrigin = { ...activeMorphOrigin, key };
}
function resolveLogEntryRect(key: string): MorphRect | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const logPage = document.querySelector('section.page-log.is-active');
  if (!logPage) return null;
  const scroller = logPage.querySelector('.log-scroll');
  if (!scroller || typeof scroller.getBoundingClientRect !== 'function') return null;
  const rows = scroller.querySelectorAll<HTMLElement>('[data-entry-key]');
  let target: HTMLElement | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute('data-entry-key') === key) { target = rows[i]; break; }
  }
  if (!target || typeof target.getBoundingClientRect !== 'function') return null;
  const r = target.getBoundingClientRect();
  const sr = scroller.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0 && sr.width > 0 && sr.height > 0)) return null;
  const visTop = Math.max(sr.top, 0);
  const visBot = Math.min(sr.bottom, window.innerHeight || sr.bottom);
  if (r.bottom <= visTop + 8 || r.top >= visBot - 8) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function resolveOpenerRect(el: HTMLElement | null): MorphRect | null {
  if (!el || !el.isConnected || typeof el.getBoundingClientRect !== 'function') return null;
  if (typeof el.closest === 'function') {
    if (el.closest('[aria-hidden="true"]')) return null;
    const page = el.closest('section.page');
    if (page && page.classList && !page.classList.contains('is-active')) return null;
  }
  const r = el.getBoundingClientRect();
  if (!(r.width > 0 && r.height > 0)) return null;
  const vw = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
  const vh = typeof window !== 'undefined' ? (window.innerHeight || 0) : 0;
  if (vw > 0 && vh > 0) {
    if (r.right <= 8 || r.left >= vw - 8 || r.bottom <= 8 || r.top >= vh - 8) return null;
  }
  const scroller = typeof el.closest === 'function' ? el.closest<HTMLElement>('section.page') : null;
  if (scroller && typeof scroller.getBoundingClientRect === 'function') {
    const sr = scroller.getBoundingClientRect();
    if (sr.width > 0 && sr.height > 0) {
      const visTop = Math.max(sr.top, 0);
      const visBot = Math.min(sr.bottom, vh || sr.bottom);
      const visLeft = Math.max(sr.left, 0);
      const visRight = Math.min(sr.right, vw || sr.right);
      if (r.bottom <= visTop + 8 || r.top >= visBot - 8 || r.right <= visLeft + 8 || r.left >= visRight - 8) return null;
    }
  }
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
function fallbackBottomCenterRect(wrap: HTMLElement): MorphRect | null {
  if (typeof wrap.getBoundingClientRect !== 'function') return null;
  const wr = wrap.getBoundingClientRect();
  if (!(wr.width > 0 && wr.height > 0)) return null;
  const w = Math.min(wr.width * 0.88, Math.max(1, wr.width - 24));
  const h = 48;
  return { left: wr.left + (wr.width - w) / 2, top: wr.bottom - h - 12, width: w, height: h };
}
function applyMorphVars(el: HTMLElement, wrap: HTMLElement, rect: MorphRect): boolean {
  if (typeof wrap.getBoundingClientRect !== 'function') return false;
  const wrapRect = wrap.getBoundingClientRect();
  if (!(wrapRect.width > 0 && wrapRect.height > 0)) return false;
  const tw = el.offsetWidth || wrapRect.width;
  const th = el.offsetHeight || Math.min(wrapRect.height * 0.6, 420);
  if (!(tw > 0 && th > 0)) return false;
  const tx = wrapRect.left + wrapRect.width / 2;
  const ty = wrapRect.bottom - th / 2;
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const dx = ox - tx;
  const dy = oy - ty;
  const sx = Math.max(0.84, Math.min(0.98, rect.width / tw));
  const sy = Math.max(0.32, Math.min(0.75, rect.height / th));
  el.style?.setProperty?.('--morph-dx', `${dx.toFixed(1)}px`);
  el.style?.setProperty?.('--morph-dy', `${dy.toFixed(1)}px`);
  el.style?.setProperty?.('--morph-sx', sx.toFixed(3));
  el.style?.setProperty?.('--morph-sy', sy.toFixed(3));
  return true;
}

let sheetNow: SheetKind | null = null;
const sheetSubs = new Set<() => void>();
export function openSheet(k: SheetKind | null) {
  if (k !== null) {
    if (k.kind === 'edit') {
      if (!openingWithMorph && sheetNow?.kind !== 'edit') activeMorphOrigin = null;
    } else if (isConvertedMorphKind(k.kind)) {
      if (!openingWithMorph) {
        if (sheetNow?.kind !== k.kind || activeMorphOrigin?.mode !== 'opener') {
          activeMorphOrigin = { mode: 'opener', el: null, rect: null };
        }
      }
    } else {
      activeMorphOrigin = null;
    }
  }
  sheetNow = k;
  sheetSubs.forEach((f) => f());
}
export function currentSheet(): SheetKind | null { return sheetNow; }
function useSheet(): SheetKind | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); sheetSubs.add(f); return () => { sheetSubs.delete(f); }; }, []);
  return sheetNow;
}

const SheetMotionCtx = createContext<{ closing: boolean; morphOrigin: SheetMorphOrigin | null }>({ closing: false, morphOrigin: null });

function Sheet({ title, children, onBack, focusKey, slideUp = false, closing: closingProp, morphOrigin: morphProp }: { title: string; children: ComponentChildren; onBack?: () => void; focusKey?: string; slideUp?: boolean; closing?: boolean; morphOrigin?: SheetMorphOrigin | null }) {
  const ctx = useContext(SheetMotionCtx);
  const closing = closingProp ?? ctx.closing;
  const morphOrigin = morphProp !== undefined ? morphProp : ctx.morphOrigin;
  const wrapRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const didMorphOpenRef = useRef(false);
  const prevFocusRef = useRef<string | undefined>(focusKey);
  const stepEpochRef = useRef(0);
  const activeStepRef = useRef(0);
  const [, setStepDone] = useState(0);
  if (!closing && focusKey !== undefined && prevFocusRef.current !== focusKey) {
    prevFocusRef.current = focusKey;
    activeStepRef.current = prefersReducedMotion() ? 0 : ++stepEpochRef.current;
  }
  const stepSwap = !closing && !prefersReducedMotion() && activeStepRef.current > 0;
  useEffect(() => {
    const epoch = activeStepRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeStepRef.current = 0;
      setStepDone((n) => n + 1);
      return;
    }
    const id = setTimeout(() => {
      if (activeStepRef.current === epoch) {
        activeStepRef.current = 0;
        setStepDone((n) => n + 1);
      }
    }, 160);
    return () => clearTimeout(id);
  }, [focusKey]);
  useLayoutEffect(() => {
    if (!morphOrigin || !box.current || !wrapRef.current || prefersReducedMotion()) return;
    if (!closing) {
      if (!didMorphOpenRef.current) {
        didMorphOpenRef.current = true;
        const openRect = morphOrigin.rect ?? (morphOrigin.mode === 'opener' ? fallbackBottomCenterRect(wrapRef.current) : null);
        if (openRect) applyMorphVars(box.current, wrapRef.current, openRect);
      }
      return;
    }
    if (morphOrigin.mode === 'opener') {
      box.current.classList?.remove('morph-fallback');
      const liveRect = resolveOpenerRect(morphOrigin.el ?? null) ?? fallbackBottomCenterRect(wrapRef.current);
      if (liveRect) applyMorphVars(box.current, wrapRef.current, liveRect);
      return;
    }
    const closeKey = (activeMorphOrigin?.mode === 'log' ? activeMorphOrigin.key : undefined) ?? morphOrigin.key;
    const liveRect = closeKey ? resolveLogEntryRect(closeKey) : null;
    if (liveRect && applyMorphVars(box.current, wrapRef.current, liveRect)) {
      box.current.classList?.remove('morph-fallback');
    } else {
      box.current.classList?.add('morph-fallback');
    }
  }, [closing, morphOrigin]);
  useEffect(() => {
    if (closing) return;
    // Focus the panel's own first action (marked data-first), else its first control. Again on each new
    // step of a panel that has steps (the Log's editor), so the new question is what is read out.
    const el = box.current?.querySelector<HTMLElement>('[data-first]') ?? box.current?.querySelector<HTMLElement>('button, input, select');
    el?.focus();
  }, [focusKey, closing]);
  useEffect(() => {
    if (closing) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') openSheet(null); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [closing]);
  const useMorph = morphOrigin !== null;
  const wrapCls = `sheet-wrap${useMorph ? ' morph-origin' : slideUp ? ' slide-up' : ''}${closing ? ' is-closing' : ''}`;
  const sheetCls = `sheet${useMorph ? ' morph-origin' : slideUp ? ' slide-up' : ''}${closing ? ' is-closing' : ''}`;
  return (
    <div ref={wrapRef} class={wrapCls} inert={closing || undefined} aria-hidden={closing || undefined}>
      <button class="sheet-backdrop" tabIndex={-1} aria-label="Close" onClick={() => openSheet(null)} />
      <div class={sheetCls} role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-step-swap={stepSwap ? '1' : undefined} ref={box}>
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          {onBack && <button class="icon-btn" aria-label="Back" onClick={onBack}><Icon d={I.back} /></button>}
          <h2 id="sheet-title">{title}</h2>
          <button class="icon-btn" aria-label="Close" onClick={() => openSheet(null)}><Icon d={I.x} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ============================================================ status taps */

/**
 * A status tap from anywhere (the Now dock, the status panel). `minutesAgo` is "it started a few
 * minutes ago" — the commonest correction there is (the driver forgot to tap). It can never reach back
 * past the start of the status being left: that would erase it, which is an edit, not a tap.
 */
export function tapStatus(st: DutyStatus, note?: string, minutesAgo = 0): boolean {
  // A tap is the browser's permission to play sound later, so a driving alert can be heard (alerts.ts).
  unlockAudio();
  // A tap changes the driver's record, so it goes through the undo slot like every other change
  // (patch 16, P10 — decision D8-A, sanction S3): a status tap was the one edit in the app with
  // no way back, and a mis-tap at 3 a.m. is exactly when there is no spare attention for repair
  // work. The change is probed first with the same pure store function the tap always used,
  // read at the tap rather than the last render's minute (bug report C5/L3): when the tap
  // would change nothing it records nothing and offers no undo, exactly as before — tapping
  // the status you are already in (statusTap returns null), or a "minutes ago" that would
  // reach back past the start of the status being left, which would erase it: that is an
  // edit, not a tap.
  const cur = getState();
  const now = cur.nowOverride ?? nowMin();
  const at = now - Math.max(0, minutesAgo);
  // (Patch 19: the same guard covers the status panel's typed "minutes ago" — a preset and a
  // typed value arrive here as the same number, so neither has a way round it. The return
  // value says whether the tap landed; nothing about what it does changed.)
  if (minutesAgo > 0 && cur.current && at <= cur.current.since) return false;
  if (!statusTap(cur, st, note, at)) return false;
  undoable(`${segLabel(st, note)} since ${clock(at, false)}`, () => {
    setState((c) => statusTap(c, st, note, at) ?? {});
  });
  // C1 (taste, 2026-11-20): never pop the read-aloud question on a Driving tap — that is the
  // moment the truck is about to roll. Ask it once on Now after the first non-Driving status
  // tap instead; Driving taps stay uninterrupted, and the switch stays under More → Driving alerts.
  // A simulated clock is planning (patch 15): it never speaks and never asks. Nothing speaks
  // before the driver's yes: the tap that triggers the question is confirmed on screen only.
  const sim = cur.nowOverride !== null;
  if (st !== 'D' && shouldAskSpeech(cur, sim)) {
    setState({ speakAskOpen: true });
  } else if (speechReady(cur, sim)) {
    if (st === 'D') {
      try {
        const post = getState();
        const ev2 = evaluate(allSegments(post, now), { asOf: now, config: safeRulesConfig(post.config) });
        speakAloud(statusSpeech('D', at, ev2.driveNow, ev2.mustStopBy));
      } catch { speakAloud(statusSpeech('D', at)); }
    } else {
      speakAloud(statusSpeech(st, at));
    }
  }
  return true;
}

/* ---------- the simulated clock's quarantine (patch 15, break-test #5) ---------- */
/* The snapshot itself is written by setState (store.ts) at the moment the simulated
 * clock is set; this section holds the reading side: the shape checks a stored
 * snapshot must pass, and useRealClock, which restores it. */

type SimSnap = Pick<State, 'segments' | 'tentative' | 'current' | 'dayCloses' | 'historyAcknowledged' | 'config' | 'seededAt' | 'lastEldCheckAt' | 'tzChosen'> & { weekPlan?: WeekPlanDraft };
const SIM_STATUSES = new Set(['OFF', 'SB', 'D', 'ON']);
/**
 * A row read back from storage (a sim snapshot, a stored undo) is only trusted when it is
 * shaped like a row the app itself writes: a known status, dateable start/end in order,
 * and a note that is a string or absent — the fields the renderers and the engine trust.
 */
const storedRowOk = (r: unknown): boolean => {
  if (!r || typeof r !== 'object') return false;
  const x = r as Segment;
  return SIM_STATUSES.has(x.status) && dateable(x.start) && dateable(x.end) && x.end > x.start
    && (x.note === undefined || typeof x.note === 'string');
};
const storedSnapOk = (v: unknown): v is SimSnap => {
  if (!v || typeof v !== 'object') return false;
  const s = v as SimSnap;
  if (!Array.isArray(s.segments) || !s.segments.every(storedRowOk)) return false;
  if (!Array.isArray(s.tentative) || !s.tentative.every(storedRowOk)) return false;
  if (s.current !== null && s.current !== undefined) {
    const c = s.current as { status?: unknown; since?: unknown; note?: unknown };
    if (typeof c !== 'object' || !SIM_STATUSES.has(c.status as string) || !dateable(c.since) || (c.note !== undefined && typeof c.note !== 'string')) return false;
  }
  // The acknowledgement rides in the sim snapshot (patch 15.1) and in every undo
  // snapshot; when it is present it must be the boolean the app writes. (The config
  // is deliberately not shape-checked here — undo snapshots carry none. useRealClock
  // runs a sim snapshot's config through sanitizeConfig before restoring it.)
  if (s.historyAcknowledged !== undefined && typeof s.historyAcknowledged !== 'boolean') return false;
  // Patch 15.2's two fields, same discipline: when present, seededAt must be the
  // null or the dateable minute the app writes, and tzChosen the boolean. Absence
  // is fine — a snapshot written before 15.2 (or an undo snapshot, which carries
  // neither) is still trusted on the fields it does carry; sim snapshots are
  // per-episode and dropped at episode end, so nothing older outlives its episode.
  if (s.seededAt !== undefined && s.seededAt !== null && !dateable(s.seededAt)) return false;
  if (s.lastEldCheckAt !== undefined && s.lastEldCheckAt !== null && !dateable(s.lastEldCheckAt)) return false;
  if (s.tzChosen !== undefined && typeof s.tzChosen !== 'boolean') return false;
  return true;
};
/**
 * "Use real clock": leave the simulated clock AND throw away everything written while it
 * was up. Taps made under a simulated "now" used to be written into the real record and
 * stay there — 48 hours of invented driving in the break test's repro (break-test #5).
 * Refusing the taps instead would make the Testing clock display-only (and this app's own
 * checks drive it with taps), so the writes are quarantined instead: setting the clock
 * snapshots the record (setState, on the null → value edge — patch 15.1; patch 15
 * snapshotted at the first of four writes and let every other write path through), and
 * coming back restores that snapshot. The simulated-now banner says so on every screen
 * while the clock is up.
 */
export function useRealClock() {
  setState((cur) => {
    let restore: Partial<State> = {};
    try {
      const raw = localStorage.getItem(SIM_KEY);
      localStorage.removeItem(SIM_KEY);
      if (raw && cur.nowOverride !== null) {
        const snap = JSON.parse(raw) as { record?: unknown };
        if (snap && storedSnapOk(snap.record)) {
          restore = { segments: snap.record.segments, tentative: snap.record.tentative, current: snap.record.current ?? null, dayCloses: sanitizeDayCloses(snap.record.dayCloses) };
          // The episode's quieter writes go too (patch 15.1): an acknowledgement or a
          // settings change made under the simulated clock must not survive it. The
          // config comes back through the same sanitizer an import passes through.
          if (typeof snap.record.historyAcknowledged === 'boolean') restore.historyAcknowledged = snap.record.historyAcknowledged;
          if (snap.record.config && typeof snap.record.config === 'object') restore.config = sanitizeConfig(snap.record.config, cur.config);
          // The episode's last two quiet writes go too (patch 15.2): a seed's
          // seededAt and a zone pick's tzChosen are part of the record the
          // snapshot took, so they come back with it — storedSnapOk has already
          // vouched for their shapes.
          if (snap.record.seededAt !== undefined) restore.seededAt = snap.record.seededAt;
          if (snap.record.lastEldCheckAt !== undefined) restore.lastEldCheckAt = snap.record.lastEldCheckAt;
          if (typeof snap.record.tzChosen === 'boolean') restore.tzChosen = snap.record.tzChosen;
          restore.weekPlan = snap.record.weekPlan !== undefined
            ? sanitizeWeekPlan(snap.record.weekPlan, DEFAULT_WEEK_PLAN)
            : { ...DEFAULT_WEEK_PLAN, loads: [] };
        }
      }
    } catch { /* a damaged snapshot is dropped, never fatal */ }
    return { ...restore, nowOverride: null };
  });
}
/** How far back "started earlier" may reach: only while the status being left is still running. */
export function startOffsets(cur: State, now: number): { minutes: number; ok: boolean }[] {
  return [0, 5, 15, 30].map((m) => ({ minutes: m, ok: backdateOk(cur, now, m) }));
}
/**
 * The ONE rule for a "started earlier" tap, shared by the presets' ok-flags above and the
 * typed whole-minutes entry (patch 19), so a typed value can never be offered where a preset
 * of the same size would be greyed out: the backdated start must still fall after the start
 * of the status being left. (tapStatus enforces the same thing again at the tap.)
 */
export function backdateOk(cur: State, now: number, minutes: number): boolean {
  return minutes === 0 || !cur.current || now - minutes > cur.current.since;
}
/** A typed backdate is for a late tap, not for rebuilding a day: past this it belongs on the Log. */
export const MAX_TYPED_BACKDATE_MIN = 1440;
/** Why a typed "minutes ago" cannot be used for a status tap, or null when it can (or the box is empty). */
export function typedBackdateProblem(cur: State, now: number, text: string): string | null {
  const r = readMinutesAgo(text);
  if (!r.ok) {
    return r.problem === 'empty' ? null
      : r.problem === 'fraction' ? 'Whole minutes only — 7, not 7.5.'
      : 'That box needs a plain number of minutes.';
  }
  if (r.minutes > MAX_TYPED_BACKDATE_MIN) return 'That is more than a day back — add it on the Log tab instead.';
  if (!backdateOk(cur, now, r.minutes)) return `That reaches back to or past the start of the ${segLabel(cur.current!.status, cur.current!.note)} you are in (${clock(cur.current!.since)}) — it would erase it. Earlier than that? Add it on the Log tab.`;
  return null;
}

/* ============================================================ adjust the current status's start (patch 19) */

/** A refusal from the store's adjustCurrentStart, in the driver's words. */
export function adjustStartProblemText(problem: AdjustStartProblem, cur: State, now: number): string {
  const prev = statusBeingLeft(cur);
  switch (problem) {
    case 'none': return 'There is no current status yet — tap one on Now first.';
    case 'same': return 'That is the start time it already has.';
    case 'future': return `That is not in the past yet (now is ${clock(now)}). The status you are in has already started.`;
    case 'erase': return prev
      ? `That is at or before the start of the ${segLabel(prev.status, prev.note)} you were in before (${clock(prev.start)}) — it would erase it. To change that entry, use the Log tab.`
      : 'That would erase the entry before it. To change that entry, use the Log tab.';
    case 'overlap': return 'Another entry in your log covers part of that time. Fix it on the Log tab, where you can see both.';
    default: return 'That time cannot be used. Pick another.';
  }
}
/**
 * Set the current status's start to an exact minute — the after-the-fact door (patch 19).
 * One store operation (adjustCurrentStart) does the work and holds every guard; this wraps
 * it in the app's single undo slot, labelled the way a status tap is ("On Duty since
 * 14:07"), so the same chip above the dock and the same line on the Log take it back.
 * Returns the driver-facing reason it was refused, or null when it landed. It never speaks
 * and never asks the speech question: it is a correction, not a tap.
 */
export function adjustStartNow(newSince: number, absorb = false): string | null {
  const cur = getState();
  const now = cur.nowOverride ?? nowMin();
  // BUG-2026-11-20: adjusting the start of the SAME Driving run is not a status change. Keep the
  // Details peek pinned to the new start before setState runs so showsDrivingView does not flip
  // mid-apply and unmount SinceSheet.
  const wasPeeked = cur.current?.status === 'D' && peekSince === cur.current.since;
  // Patch L1 item 4b: with the driver's one confirmation (`absorb`), a start that reaches back
  // over the status being left — or across another entry — takes that stretch in instead of
  // being refused. Without it the plain operation's guards stand exactly as before.
  if (absorb) {
    const r = absorbCurrentStart(cur, newSince, now);
    if (!r.ok) return adjustStartProblemText(r.problem, cur, now);
    if (wasPeeked) setDrivingPeek(newSince);
    undoable(`${segLabel(cur.current!.status, cur.current!.note)} since ${clock(newSince, false)}`, () => {
      setState((c) => { const x = absorbCurrentStart(c, newSince, now); return x.ok ? x.patch : {}; });
    });
    return null;
  }
  const r = adjustCurrentStart(cur, newSince, now);
  if (!r.ok) return adjustStartProblemText(r.problem, cur, now);
  if (wasPeeked) setDrivingPeek(newSince);
  undoable(`${segLabel(cur.current!.status, cur.current!.note)} since ${clock(newSince, false)}`, () => {
    setState((c) => { const x = adjustCurrentStart(c, newSince, now); return x.ok ? x.patch : {}; });
  });
  return null;
}

/* ---------- absorb, never overlap (patch L1, item 4): the warning and its one confirmation ---------- */

/** One absorbed neighbour, in the driver's words: what it was, and what is left of it. */
export function absorbedLine(a: Absorbed, now: number): string {
  const name = a.live ? `your current ${segLabel(a.seg.status, a.seg.note)} (since ${clock(a.seg.start)})` : `your ${segLabel(a.seg.status, a.seg.note)} ${clock(a.seg.start)} → ${clock(a.seg.end)}`;
  const span = (x: Segment) => `${clock(x.start)} → ${x.end >= now && a.live ? 'now' : clock(x.end)}`;
  if (a.live) {
    if (a.kind === 'removed') return `${name} would start at ${clock(a.seg.end)} instead`;
    if (a.kind === 'split') return `${name} would be split around it: ${span(a.left[0])}, then again from ${clock(a.left[1].start)}`;
    return a.left[0].start > a.seg.start ? `${name} would start at ${clock(a.left[0].start)} instead` : `${name} would end at ${clock(a.left[0].end)}, then this`;
  }
  if (a.kind === 'removed') return `${name} would be taken in whole`;
  if (a.kind === 'split') return `${name} would be split around it: ${span(a.left[0])} and ${span(a.left[1])}`;
  return `${name} would become ${span(a.left[0])}`;
}
/**
 * The absorb warning (item 4): what the change runs into and exactly what happens to each
 * entry, said BEFORE anything is saved. The panel's main button becomes the one explicit
 * confirmation ("Change the others and …" — P1, audit: never the word "absorb"); nothing is trimmed until it is tapped, and it can be undone.
 */
function AbsorbNote({ absorbed, now }: { absorbed: Absorbed[]; now: number }) {
  if (!absorbed.length) return null;
  return (
    <div class="warnbox absorb" role="alert">
      <b>This runs into {absorbed.length === 1 ? 'another entry' : `${absorbed.length} other entries`}.</b> Your log can only show one status at a time, so to save it:
      <ul class="absorb-list">{absorbed.map((a, i) => <li key={i}>{absorbedLine(a, now)}.</li>)}</ul>
      <span class="small">Nothing changes until you confirm below.</span>
    </div>
  );
}

/* ---------- D8 (audit): what else a save moves, and what it does to the hours ---------- */

/**
 * Every OTHER logged row the save changes that the absorb list does not already name — the
 * patch L3 join (the next row's start following a shortened end, the previous row's end
 * following a later start) and the row before an open status whose start moves. Read-only:
 * a diff of the record before and the very patch the save will apply (placeEntry /
 * absorbCurrentStart), so it can never disagree with what is saved. `ownCurrent` is set when
 * the change IS the open status's start (then its own move is not a knock-on).
 */
export function knockOnLines(before: Pick<State, 'segments' | 'current'>, after: Pick<State, 'segments' | 'current'>, orig: Segment | null, absorbed: Absorbed[], now: number, ownCurrent = false): string[] {
  const out: string[] = [];
  const named = new Set(absorbed.map((a) => a.seg));
  const fresh = after.segments.filter((y) => !before.segments.includes(y));
  for (const x of before.segments) {
    if (x.tentative || x === orig || named.has(x) || after.segments.includes(x)) continue;
    const y = fresh.find((r) => r.status === x.status && r.createdAt === x.createdAt && (r.start === x.start || r.end === x.end));
    const name = `your ${segLabel(x.status, x.note)} ${clock(x.start)} → ${clock(x.end)}`;
    if (!y) { out.push(`${name} would be taken out`); continue; }
    const d = (y.end - y.start) - (x.end - x.start);
    out.push(`${name} would become ${clock(y.start)} → ${clock(y.end)}${d ? ` (${dur(Math.abs(d))} ${d > 0 ? 'longer' : 'shorter'})` : ''}`);
  }
  const b = before.current, a = after.current;
  if (!ownCurrent && b && a && a.since !== b.since && !absorbed.some((x) => x.live)) {
    out.push(`your current ${segLabel(b.status, b.note)} would start at ${clock(a.since)} instead of ${clock(b.since)}`);
  }
  return out;
}

export interface Consequence { text: string; bad: boolean }
/**
 * What the save does to the driver's hours — the existing engine, run read-only on the record
 * before and on the record the save leaves (never on anything the save would not write):
 * a 10-hour break (or 34-hour restart) that stops being one, a violation that appears or
 * clears, and the drive time left now. No rule is computed here; evaluate() and
 * restPeriods() answer, this only compares their two answers.
 */
export function consequenceLines(before: State, after: State, now: number): Consequence[] {
  const out: Consequence[] = [];
  const logged = (st: State) => normalize(allSegments(st, now).filter((x) => !x.tentative));
  const rb = restPeriods(logged(before)), ra = restPeriods(logged(after));
  for (const r of rb) {
    if (!r.isReset) continue;
    const meets = ra.filter((x) => x.start < r.end && x.end > r.start);
    const left = meets.length ? Math.max(...meets.map((x) => x.duration)) : 0;
    const span = `${clock(r.start)} → ${r.end >= now ? 'now' : clock(r.end)}`;
    if (left < LIMITS.RESET) out.push({ bad: true, text: `Your ${dur(r.duration)} break (${span}) would become ${left ? dur(left) : 'nothing'} — under 10 hours, so it would no longer reset your 11 and 14 hours.` });
    else if (r.isRestart && left < LIMITS.RESTART) out.push({ bad: true, text: `Your ${dur(r.duration)} break (${span}) would become ${dur(left)} — under 34 hours, so it would no longer restart your week.` });
  }
  let evB: FullEvaluation, evA: FullEvaluation;
  try {
    evB = evaluate(allSegments(before, now), { asOf: now, config: safeRulesConfig(before.config) });
    evA = evaluate(allSegments(after, now), { asOf: now, config: safeRulesConfig(after.config) });
  } catch { return out; }
  const same = (v: Violation, w: Violation) => v.kind === w.kind && v.start < w.end + 1 && w.start < v.end + 1;
  for (const v of evA.violations) {
    const was = evB.violations.find((w) => same(v, w));
    if (!was) out.push({ bad: true, text: `A violation would appear: ${limitName(v.kind, evA)} — ${dur(v.minutes)} ${severityWord[v.severity]} (${clock(v.start)} → ${clock(v.end)}).` });
    else if (v.minutes > was.minutes) out.push({ bad: true, text: `Your ${limitName(v.kind, evA)} violation would grow from ${dur(was.minutes)} to ${dur(v.minutes)}.` });
  }
  for (const w of evB.violations) {
    if (!evA.violations.some((v) => same(v, w))) out.push({ bad: false, text: `It would clear a violation: ${limitName(w.kind, evB)} — ${dur(w.minutes)}.` });
  }
  if (evA.driveNow !== evB.driveNow) {
    const f = (m: number) => (m > 0 ? dur(m) : 'none — out of hours');
    out.push({ bad: evA.driveNow <= 0 && evB.driveNow > 0, text: `Drive time left now: ${f(evB.driveNow)} → ${f(evA.driveNow)}.` });
  }
  return out;
}

/** D8: the knock-on rows and the hours consequences, said before the one confirmation. */
function KnockOn({ rows, effects }: { rows: string[]; effects: Consequence[] }) {
  const bad = effects.filter((e) => e.bad), info = effects.filter((e) => !e.bad);
  return (
    <>
      {rows.length > 0 && (
        <div class="warnbox absorb knockon" role="alert">
          <b>It also moves {rows.length === 1 ? 'another entry' : `${rows.length} other entries`}:</b>
          <ul class="absorb-list">{rows.map((t, i) => <li key={i}>{t}.</li>)}</ul>
        </div>
      )}
      {bad.length > 0 && (
        <div class="warnbox knockon-bad" role="alert">
          <b>What this does to your hours:</b>
          <ul class="absorb-list">{bad.map((e, i) => <li key={i}>{e.text}</li>)}</ul>
        </div>
      )}
      {info.length > 0 && <ul class="brk-hint knockon-info">{info.map((e, i) => <li key={i}>{e.text}</li>)}</ul>}
    </>
  );
}

// Keyed through the engine: during a ≥10h rest the shift start is "now" and moves every minute, so
// storing it orphaned the flag a minute later (bug report C3). exceptionKey is stable for the shift.
function toggleException(ev: FullEvaluation, key: 'adverseShifts' | 'sixteenHourShifts') {
  setState((cur) => {
    const list = new Set(cur.config[key] ?? []);
    const matched = key === 'adverseShifts' ? ev.shift.exceptionKeys.adverse : ev.shift.exceptionKeys.sixteen;
    if (matched !== null) list.delete(matched); else list.add(ev.shift.exceptionKey);
    return { config: { ...cur.config, [key]: [...list] } };
  });
}

/* ============================================================ out of hours */

/** Minutes of unbroken rest (OFF/SB) that ended exactly when the current status began. */
function restBefore(s: State, now: number): number {
  if (!s.current) return 0;
  const rows = normalize(allSegments(s, now)).filter((r) => !r.tentative);
  let cursor = s.current.since, total = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.end > cursor) continue; // the live row, and anything after it
    if (r.end < cursor || (r.status !== 'OFF' && r.status !== 'SB')) break;
    total += r.end - r.start; cursor = r.start;
  }
  return total;
}

type DriveAgain = { off: number | null; sb: number | null; before: number };
/**
 * When driving comes back, computed once per screen (Now's hero and the header line share it). Round 4:
 * the time comes from the engine (driveAgainAt), so a 30-min break, a sleeper split and the 60/70 cycle
 * are answered by the same rules that drive the clocks — never a hard-coded "10 hours". Null while the
 * driver still has driving time.
 */
function useDriveAgain(s: State, now: number, ev: FullEvaluation | null): DriveAgain | null {
  const status = s.current?.status ?? 'OFF';
  const resting = status === 'OFF' || status === 'SB';
  const out = ev !== null && ev.driveNow <= 0;
  return useMemo(() => {
    if (!out) return null;
    // Right after tapping On duty or Driving the new row is 0 minutes long, so the engine still sees the
    // rest as unbroken and would promise the old time. The tap is the driver's intent: count it as begun.
    const t = !resting && s.current ? Math.max(now, s.current.since + 1) : now;
    // History older than the cycle window cannot change the answer (the same cut the Trip planner uses,
    // checked against the unpruned answer on 60 long records); it more than halves the cost.
    const cfg = safeRulesConfig(s.config);
    const segs = pruneHistory(allSegments(s, t), t, cfg), opts = { asOf: t, config: cfg };
    return {
      off: driveAgainAt(segs, opts, status === 'SB' ? 'SB' : 'OFF'),
      sb: resting ? null : driveAgainAt(segs, opts, 'SB'),
      before: resting ? 0 : restBefore(s, now),
    };
    // While resting, the answer is a fixed clock time that only a new entry can move, so it is not
    // recomputed every minute; on duty or driving it moves with the clock.
  }, [out, s.segments, s.current, s.config, resting ? 0 : now]);
}

/**
 * Out of driving hours: the Now screen's main card says WHEN driving comes back and WHAT is still
 * allowed. Round 4, reported by a driver: after a 14-hour day nothing on screen said when he could drive
 * again, and tapping On duty after 6 hours off reset the only rest number on screen without saying the
 * rest had ended — or that on-duty work was allowed all along.
 */
function RestHero({ s, now, ev, again, tail, dissolve }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain; tail?: ComponentChildren; dissolve?: boolean }) {
  const status = s.current?.status ?? 'OFF';
  const resting = status === 'OFF' || status === 'SB';
  const { off, sb, before } = again;
  const cycleWord = `${ev.cycle.limit / 60}-hour`;
  const lead = status === 'D' ? <p class="hero-lead">No driving time left — stop driving.</p> : null;
  const why = <button class="link" onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button>;
  const share = useShareButton(shareText(ev, again.off));
  const heroCls = (tone?: string) => ['hero', tone, dissolve ? 'now-card-dissolve' : ''].filter(Boolean).join(' ');
  if (off === null) {
    return (
      <section class={heroCls('bad')}>
        <Sign kind="stop">Out of hours</Sign>
        {lead}
        <div class="hero-label">Out of driving time</div>
        <p class="hero-text"><b>Driving does not come back within 36 hours of rest.</b> See <b>Hours coming back</b> under <b>Plan</b> for when your {cycleWord} hours return.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
        <CardSwitchSlot />
      </section>
    );
  }
  const time = (label: string) => (
    <>
      <div class="hero-label">{label}</div>
      <div class="hero-value">{clock(off)}</div>
      {/* The big time stays time-only (a full date will not fit at this size); the date stacks
          quietly under it (patch 16, P6) — under, not over, so the sentence the label and the
          time make together ("…can drive again at Sat 09:00") still reads as one statement. */}
      <div class="hero-stop-date">{clockFull(off).split(', ')[0]}</div>
      <div class="hero-stop">{dur(off - now)} from now{resting && ev.binding !== 'BREAK_30' ? `, if you stay ${status === 'SB' ? 'in the sleeper' : 'off duty'}.` : ''}</div>
    </>
  );
  if (ev.binding === 'BREAK_30') {
    return (
      <section class={heroCls('warn')}>
        {status === 'D' ? <Sign kind="stop">Out of hours</Sign> : resting ? <Sign kind="rest">On break</Sign> : <Sign kind="warn">Break due</Sign>}
        {lead}
        {time('30-min break needed — you can drive again at')}
        <p class="hero-text">Any 30 minutes in a row without driving counts — off duty, sleeper, or on-duty work like fueling.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
        <CardSwitchSlot />
      </section>
    );
  }
  if (ev.binding === 'CYCLE') {
    return (
      <section class={heroCls('warn')}>
        {resting ? <Sign kind="rest">Resting</Sign> : <Sign kind="stop">Out of hours</Sign>}
        {lead}
        {time(`Out of ${cycleWord} hours — ${resting ? 'if you stay off duty, you' : 'go off duty now and you'} can drive again at`)}
        <p class="hero-text">On-duty work is allowed, but it counts toward your {cycleWord} hours and can push this later.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
        <CardSwitchSlot />
      </section>
    );
  }
  if (resting) {
    return (
      <section class={heroCls()}>
        <Sign kind="rest">Resting</Sign>
        {time('You can drive again at')}
        <p class="hero-text">Going on duty before then is allowed (only driving is not), but it ends this rest: you will need 10 consecutive hours off, or a sleeper-berth split, before you drive.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
        <CardSwitchSlot />
      </section>
    );
  }
  return (
    <section class={heroCls('warn')}>
      <Sign kind="stop">Out of hours</Sign>
      {lead ?? <div class="hero-label">Out of driving hours</div>}
      <p class="hero-text"><b>On-duty work is allowed; driving is not.</b></p>
      {time('Go off duty now and you can drive again at')}
      {sb !== null && sb < off && <p class="hero-text">In the sleeper berth instead: <b>{clock(sb)}</b> ({dur(sb - now)} from now) — that completes a split.</p>}
      {before >= 30 && before < 600 && <p class="hero-text">Your {dur(before)} off before this does not count toward the 10 hours — they have to be consecutive{before >= 120 ? ', though it can still be the short half of a sleeper split' : ''}.</p>}
      <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
      {tail}
      <CardSwitchSlot />
    </section>
  );
}

/* ============================================================ driving alerts */

/** Which limit is running out, in words for an alert. */
function alertReason(ev: FullEvaluation): string {
  switch (ev.binding) {
    case 'BREAK_30': return '8-hour driving limit before a 30-minute break';
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hour driving limit`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hour duty window`;
    case 'CYCLE': return `${ev.cycle.limit / 60}-hour cycle limit`;
    default: return 'driving limit';
  }
}

/** Sound + vibration + background notification when driving time crosses an alert mark (alerts.ts). */
function useDrivingAlerts(s: State, now: number, ev: FullEvaluation | null) {
  const mem = useRef<AlertMemory>(NO_ALERTS);
  // No evaluation (the error card) counts as not driving: nothing to measure against.
  const driving = s.current?.status === 'D' && ev !== null;
  const driveNow = ev?.driveNow ?? Infinity;
  useEffect(() => {
    const r = alertTick(mem.current, driving, driveNow, now, s.nowOverride !== null);
    mem.current = r.mem;
    if (!driving) clearPendingSound();
    // A simulated clock is for planning: show the banner, but never sound off.
    if (r.fire === null || !ev || !s.alertsOn || s.nowOverride !== null) return;
    const m = alertMessage(r.fire, alertReason(ev));
    // Capstone C3 (M13): the mark rides along, so the vibration is that mark's own pattern.
    sound(r.fire <= 15, r.fire); void notify(m.title, m.body);
    // Patch 17 (M3): the same alert, read aloud — after the chime, from the same numbers.
    // Two gates on top of this effect's own: speechReady (the D7-A yes, and a real clock —
    // already guaranteed here) and alertsOn, the master alert switch: a driver who silenced
    // the alerts does not get a voice instead.
    if (speechReady(s, false) && s.alertsOn) speakAloud(alertSpeech(r.fire, driveNow, ev.mustStopBy, alertReason(ev)));
  }, [now, driveNow, driving, s.alertsOn, s.nowOverride, s.speakAlerts, s.speechAsked]);
}

/** Hold a screen wake lock while `active` (alerts.ts holdWakeLock: re-taken on return and after a drop). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !canKeepAwake()) return;
    type Lock = Awaited<ReturnType<WakeEnv['request']>>;
    return holdWakeLock({
      request: () => (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<Lock> } }).wakeLock.request('screen'),
      visible: () => document.visibilityState === 'visible',
      onVisible: (f) => {
        const h = () => { if (document.visibilityState === 'visible') f(); };
        document.addEventListener('visibilitychange', h);
        return () => document.removeEventListener('visibilitychange', h);
      },
      later: (f, ms) => { setTimeout(f, ms); },
    });
  }, [active]);
}

function AlertBanner({ s, ev }: { s: State; ev: FullEvaluation }) {
  const b = alertBanner(s.current?.status === 'D', ev.driveNow, dur(ev.driveNow), alertReason(ev));
  if (!b) return null;
  return <div class={`alertbox ${b.level}`} role="alert"><b>{b.title}.</b> {b.text}</div>;
}

/* ============================================================ header and notices */

/**
 * The header: slim and opaque (redesign, 2026-10-10). It carries only what every screen needs:
 * the status, the time, the theme switch, and the driving alert.
 */
function TopBar({ ev, now, s, inert, ariaHidden, onNow, onSettings, settingsActive }: { ev: FullEvaluation; now: number; s: State; inert?: boolean; ariaHidden?: boolean; onNow: boolean; onSettings: () => void; settingsActive: boolean }) {
  const status = s.current?.status ?? 'OFF';
  // The switch cycles manual appearance states: Day → Night → Wind-down → Day. The tap records the
  // choice so the phone's setting no longer moves it (patch 7 + A3 wind-down, manual only).
  const curTheme = effectiveTheme(s, devicePrefersDark());
  const next: Theme = curTheme === 'day' ? 'night' : curTheme === 'night' ? 'winddown' : 'day';
  const nextLabel = next === 'night' ? 'Night' : next === 'winddown' ? 'Wind-down' : 'Day';
  const nextAria = next === 'winddown' ? 'wind-down' : next;
  const nextIcon = next === 'night' ? I.moon : next === 'winddown' ? I.winddown : I.sun;
  // P3: the header measures ITSELF into --top-h for as long as it is on screen (the driving view
  // unmounts it, and a new header element comes back after Details).
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--top-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header class="top" inert={inert} aria-hidden={ariaHidden || undefined} ref={headerRef}>
      <div class="top-row">
        <span class="pill" style={`--led: ${STATUS_COLOR[status]}`}>{segLabel(status, s.current?.note)}{s.current ? ` · ${dur(now - currentRunStart(s, now))}` : ''}</span>
        <span class="top-right">
          <span class="muted clock">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
          <button type="button" class={settingsActive ? 'theme-btn gear-btn on' : 'theme-btn gear-btn'} aria-label="Settings" title="Settings" aria-current={settingsActive ? 'page' : undefined} onClick={onSettings}><Icon d={I.gear} size={18} /></button>
          <button class="theme-btn" data-theme-current={curTheme} aria-label={`Switch to ${nextAria} theme`} title={`Switch to ${nextAria} theme`} onClick={() => chooseTheme(next)}><Icon d={nextIcon} size={18} /><span class="theme-word">{nextLabel}</span></button>
        </span>
      </div>
      {/* On Now the out-of-hours card already says this; a second box saying the same thing was noise. */}
      {!(onNow && ev.driveNow <= 0) && <AlertBanner s={s} ev={ev} />}
    </header>
  );
}

/**
 * Notices about the RECORD, shown at the top of every screen: they scroll with the page instead of
 * pinning it, and they follow the driver to the planning screens, because every answer there rests on
 * the same record.
 */
/**
 * One notice as a collapsible line (patch 16, P2): the summary is the whole surface until the
 * driver opens it — a 48px row at 15px semibold carrying the warning glyph — and the body
 * keeps the full wording and any control the box always had.
 */
function NoticeLine({ summary, open, children }: { summary: string; open?: boolean; children: ComponentChildren }) {
  return (
    <details class="notice" open={open ? true : undefined}>
      <summary>{summary}</summary>
      <div class="notice-body">{children}</div>
    </details>
  );
}

function Notices({ ev, now, s, strip }: { ev: FullEvaluation; now: number; s: State; strip?: boolean }) {
  const hist = historyBasis(s, now);
  const gaps = meaningfulGaps(ev.gaps);
  if (strip) {
    // On Now the notices ride UNDER the answer as one-line chips (patch 16, P2): nothing about
    // the record may push the one number off the first screenful, so each notice is one 48px
    // line naming its subject, with the full wording — and its controls — one tap down,
    // unchanged. The DEMO chip stands open: it carries the quick-start button, the way into a
    // real day. The two-zones chip (decision D5-A) stands open until the driver acknowledges
    // THIS pair of zones; it re-opens on its own when either zone changes, because the pair is
    // what the acknowledgement stores.
    const gapsBody = (
      <>
        <b>Unlogged time is being counted as off duty.</b>{' '}
        {gaps.map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} — {dur(gaps.reduce((a, g) => a + (g.end - g.start), 0))} in total.
        A hole in the record can look like a rest you never took, so a reset or a split may be resting on it. Fill it in on the <b>Log</b> tab to be sure.
      </>
    );
    return (
      <>
        {hist === 'fresh' && (
          <NoticeLine summary="DEMO — assumed full clocks, not your day" open>
            <b class="demo-word">DEMO — not your day.</b> <b>Assumed fresh clock.</b> Nothing is logged, so these numbers assume a full {ev.shift.limits.drive / 60}-hour driving / {ev.shift.limits.window / 60}-hour window and an empty {ev.cycle.limit / 60}-hour cycle — not your actual day.
            Tap your current status or add today's duty on the <b>Log</b> tab before you trust them.
            <span class="qs-cta">
              <button class="primary" onClick={() => openSheet({ kind: 'quickstart' })}>Start from my ELD clocks</button>
              <span class="small">Already mid-shift? Type the four clocks your ELD shows — about 20 seconds — and start from your real day instead.</span>
            </span>
          </NoticeLine>
        )}
        {hist === 'incomplete' && (
          <NoticeLine summary="Estimates — nothing logged before your current status">
            <b>History incomplete — estimates only.</b> You have a current status but nothing behind it, so these numbers still assume you started from zero. Duty you haven't entered cannot be counted.{' '}
            <button class="mini" onClick={() => setState({ historyAcknowledged: true })}>It really does start here</button>
          </NoticeLine>
        )}
        {splitEstimateActive(s, now) && (
          <NoticeLine summary="Estimate — built from the ELD clocks you typed">
            <b>Estimate — from the clocks you entered; firms up as your own entries replace them.</b>{' '}
            Split answers rest on those typed-in clocks until a stretch you logged yourself covers the ground they stand on.
          </NoticeLine>
        )}
        {gaps.length === 1 && (
          <NoticeLine summary={`Unlogged ${clock(gaps[0].start, false)}–${clock(gaps[0].end, false)} counted as off duty`}>{gapsBody}</NoticeLine>
        )}
        {gaps.length > 1 && (
          <NoticeLine summary={`Unlogged time counted as off duty (${gaps.length} stretches)`}>{gapsBody}</NoticeLine>
        )}
        {ev.invalid.length > 0 && (
          <NoticeLine summary={`${ev.invalid.length} ${ev.invalid.length === 1 ? 'entry' : 'entries'} ignored — fix ${ev.invalid.length === 1 ? 'it' : 'them'} on the Log`}>
            <b>{ev.invalid.length} entr{ev.invalid.length === 1 ? 'y' : 'ies'} could not be read and {ev.invalid.length === 1 ? 'is' : 'are'} being ignored.</b>{' '}
            A row needs a real start and end time. Re-enter {ev.invalid.length === 1 ? 'it' : 'them'} on the <b>Log</b> tab.
          </NoticeLine>
        )}
        {ev.futureLogged.length > 0 && (
          <NoticeLine summary={`${ev.futureLogged.length} ${ev.futureLogged.length === 1 ? 'entry' : 'entries'} dated in the future — ignored`}>
            <b>{ev.futureLogged.length} entr{ev.futureLogged.length === 1 ? 'y is' : 'ies are'} dated in the future and {ev.futureLogged.length === 1 ? 'is' : 'are'} being ignored.</b>{' '}
            You cannot have already logged time that has not happened, so it is left out of every clock. Fix the date on the <b>Log</b> tab, or make it a what-if if you meant to plan it.
          </NoticeLine>
        )}
        {ev.clippedFuture.length > 0 && (
          <NoticeLine summary={`${ev.clippedFuture.length} ${ev.clippedFuture.length === 1 ? 'entry runs' : 'entries run'} past now — only part counted`}>
            <b>{ev.clippedFuture.length} entr{ev.clippedFuture.length === 1 ? 'y runs' : 'ies run'} past now.</b>{' '}
            {ev.clippedFuture.map((x) => `${segLabel(x.status, x.note)} ${clock(x.start)} → ${clock(x.end)}`).join(', ')}. Only the part up to now is counted — the rest hasn't happened. Shorten {ev.clippedFuture.length === 1 ? 'it' : 'them'} on the <b>Log</b> tab, or tap your status when it changes.
          </NoticeLine>
        )}
        {s.config.timeZone !== deviceTz && (
          <NoticeLine summary={`Clock times: ${zoneShort(deviceTz)} (phone) · carrier day: ${zoneShort(s.config.timeZone)}`} open={s.zoneAck !== zonePair(s)}>
            <div class="warnbox">
              <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {formatDayStartHM(s.config)} <b>{s.config.timeZone}</b>. A {dayStartWord(s.config)} recap is not {dayStartWord(s.config)} on the clock above.
            </div>
            <button class="mini" onClick={() => setState({ zoneAck: zonePair(s) })}>Got it</button>
          </NoticeLine>
        )}
      </>
    );
  }
  return (
    <>
      {hist !== 'known' && (
        <div class="warnbox small">
          {hist === 'fresh' ? (
            <>
              <b class="demo-word">DEMO — not your day.</b> <b>Assumed fresh clock.</b> Nothing is logged, so these numbers assume a full {ev.shift.limits.drive / 60}-hour driving / {ev.shift.limits.window / 60}-hour window and an empty {ev.cycle.limit / 60}-hour cycle — not your actual day.
              Tap your current status or add today's duty on the <b>Log</b> tab before you trust them.
              <span class="qs-cta">
                <button class="primary" onClick={() => openSheet({ kind: 'quickstart' })}>Start from my ELD clocks</button>
                <span class="small">Already mid-shift? Type the four clocks your ELD shows — about 20 seconds — and start from your real day instead.</span>
              </span>
            </>
          ) : (
            <>
              <b>History incomplete — estimates only.</b> You have a current status but nothing behind it, so these numbers still assume you started from zero. Duty you haven't entered cannot be counted.{' '}
              <button class="mini" onClick={() => setState({ historyAcknowledged: true })}>It really does start here</button>
            </>
          )}
        </div>
      )}
      {splitEstimateActive(s, now) && (
        <div class="warnbox small">
          <b>Estimate — from the clocks you entered; firms up as your own entries replace them.</b>{' '}
          Split answers rest on those typed-in clocks until a stretch you logged yourself covers the ground they stand on.
        </div>
      )}
      {meaningfulGaps(ev.gaps).length > 0 && (
        <div class="warnbox small">
          <b>Unlogged time is being counted as off duty.</b>{' '}
          {meaningfulGaps(ev.gaps).map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} — {dur(meaningfulGaps(ev.gaps).reduce((a, g) => a + (g.end - g.start), 0))} in total.
          A hole in the record can look like a rest you never took, so a reset or a split may be resting on it. Fill it in on the <b>Log</b> tab to be sure.
        </div>
      )}
      {ev.invalid.length > 0 && (
        <div class="warnbox small">
          <b>{ev.invalid.length} entr{ev.invalid.length === 1 ? 'y' : 'ies'} could not be read and {ev.invalid.length === 1 ? 'is' : 'are'} being ignored.</b>{' '}
          A row needs a real start and end time. Re-enter {ev.invalid.length === 1 ? 'it' : 'them'} on the <b>Log</b> tab.
        </div>
      )}
      {ev.futureLogged.length > 0 && (
        <div class="warnbox small">
          <b>{ev.futureLogged.length} entr{ev.futureLogged.length === 1 ? 'y is' : 'ies are'} dated in the future and {ev.futureLogged.length === 1 ? 'is' : 'are'} being ignored.</b>{' '}
          You cannot have already logged time that has not happened, so it is left out of every clock. Fix the date on the <b>Log</b> tab, or make it a what-if if you meant to plan it.
        </div>
      )}
      {ev.clippedFuture.length > 0 && (
        <div class="warnbox small">
          <b>{ev.clippedFuture.length} entr{ev.clippedFuture.length === 1 ? 'y runs' : 'ies run'} past now.</b>{' '}
          {ev.clippedFuture.map((x) => `${segLabel(x.status, x.note)} ${clock(x.start)} → ${clock(x.end)}`).join(', ')}. Only the part up to now is counted — the rest hasn't happened. Shorten {ev.clippedFuture.length === 1 ? 'it' : 'them'} on the <b>Log</b> tab, or tap your status when it changes.
        </div>
      )}
      {s.config.timeZone !== deviceTz && (
        <div class="warnbox">
          <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {formatDayStartHM(s.config)} <b>{s.config.timeZone}</b>. A {dayStartWord(s.config)} recap is not {dayStartWord(s.config)} on the clock above.
        </div>
      )}
    </>
  );
}

/* ============================================================ Now */

/* ============================================================ the dial */

/** Hours on the dial's scale: the full length of the limit that binds (11, 14, 8 for the break, 60/70). */
function bindingHours(ev: FullEvaluation): number {
  const sh = ev.shift;
  return (ev.binding === 'WINDOW_14' ? sh.limits.window : ev.binding === 'BREAK_30' ? 480 : ev.binding === 'CYCLE' ? ev.cycle.limit : sh.limits.drive) / 60;
}

/**
 * The dial's geometry, in a `size`-square box: a 270° arc from bottom-left, clockwise, filled for the
 * share of the binding limit that is left — a fuel gauge, emptying as the driver drives. The scale is
 * printed OUTSIDE the arc, so nothing crosses the number in the middle. Exported for the tests.
 */
export function dialGeometry(share: number, hours: number, size: number) {
  const f = Math.max(0, Math.min(1, share));
  const c = size / 2, r = size * 0.4, sw = size * 0.05;
  const at = (rad: number, deg: number) => { const a = (deg * Math.PI) / 180; return [+(c + rad * Math.cos(a)).toFixed(2), +(c + rad * Math.sin(a)).toFixed(2)] as const; };
  const arc = (to: number) => {
    const [x0, y0] = at(r, 135), [x1, y1] = at(r, 135 + 270 * to);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${270 * to > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  // one mark per hour up to 16h; a week (60/70h) gets one per 10h
  const n = hours <= 16 ? Math.max(1, Math.round(hours)) : Math.round(hours / 10);
  const ticks = Array.from({ length: n + 1 }, (_, i) => {
    const deg = 135 + (270 * i) / n;
    const major = n <= 11 || i === 0 || i === n || i === Math.round(n / 2);
    const [x1, y1] = at(r + sw * 0.95, deg), [x2, y2] = at(r + sw * 0.95 + size * (major ? 0.04 : 0.025), deg);
    return { x1, y1, x2, y2, major };
  });
  const [ex, ey] = at(r, 135 + 270 * f);
  const [lx, ly] = at(r, 135), [rx] = at(r, 45);
  return { size, track: arc(1), fill: f > 0.004 ? arc(f) : null, end: { x: ex, y: ey }, ticks, sw, scale: { y: +(ly + sw * 2.2).toFixed(2), left: lx, right: rx, max: `${Math.round(hours)}h` } };
}

/** A gauge for the limit that binds; children go in the middle. tone: calm (accent), warn, bad. */
function Dial({ share, hours, tone, size, basis, children }: { share: number; hours: number; tone: 'calm' | 'warn' | 'bad'; size: number; basis?: 'log' | 'estimate' | 'demo'; children?: ComponentChildren }) {
  const g = dialGeometry(share, hours, size);
  return (
    <div class={`dial ${tone}${basis && basis !== 'log' ? ` basis-${basis}` : ''}`}>
      <svg viewBox={`0 0 ${size} ${size * 0.9}`} aria-hidden="true">
        <path class="dial-track" d={g.track} stroke-width={g.sw * 1.3} />
        <g class="dial-ticks">{g.ticks.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke-width={t.major ? 2.5 : 1.5} />)}</g>
        {g.fill && <path class="dial-fill" d={g.fill} stroke-width={g.sw} />}
        {g.fill && <circle class="dial-cap" cx={g.end.x} cy={g.end.y} r={g.sw * 0.62} />}
        <text class="dial-scale" x={g.scale.left} y={g.scale.y} text-anchor="middle">0</text>
        <text class="dial-scale" x={g.scale.right} y={g.scale.y} text-anchor="middle">{g.scale.max}</text>
      </svg>
      <div class="dial-center">{children}</div>
    </div>
  );
}

/**
 * The split pair the clocks are using right now: the most recent pair in the chosen chain whose second
 * rest has finished by asOf. Null when no pair is in use (a planned pair still to come does not count).
 * Presentation only — the engine chose the chain; this just names it so a driver can check the clock.
 */
export function activePair(ev: FullEvaluation): [RestPeriod, RestPeriod] | null {
  const c = ev.shift.chain;
  for (let i = c.length - 1; i >= 1; i--) if (c[i].end <= ev.asOf) return [c[i - 1], c[i]];
  return null;
}
/** One rest in driver words: "Thu 13:00–Fri 06:00 sleeper (17h 00m)". */
function restWords(r: RestPeriod): string {
  const allSB = r.longestSB >= r.duration;
  const kind = allSB ? 'sleeper' : r.longestSB > 0 ? 'sleeper and off duty' : 'off duty';
  const len = !allSB && r.longestSB > 0 ? `${dur(r.duration)}, ${dur(r.longestSB)} in a row in the sleeper` : dur(r.duration);
  return `${clock(r.start)}–${clock(r.end)} ${kind} (${len})`;
}
/**
 * Both rests and what allows the pair. A first rest of 10h+ is a full reset being used as a split leg,
 * which FMCSA FAQ 22 (July 2026) allows when it holds 7h+ in a row in the sleeper; any other pair is the
 * split itself, §395.1(g)(1)(ii).
 */
export function pairWords([a, b]: [RestPeriod, RestPeriod]): string {
  return `${restWords(a)} + ${restWords(b)} — split pair (${a.isReset ? 'FMCSA FAQ 22' : '49 CFR 395.1(g)'})`;
}
/** The split-pair paragraph itself, shared by the dial mode's line and the timeline mode's chip (audit §2.6: the wording survives verbatim in both). */
function SplitPairWords({ ev }: { ev: FullEvaluation }) {
  const pair = activePair(ev);
  if (!pair) return null;
  const leg = ev.shift.pendingSplitLeg;
  return (
    <p class="trust split-pair">
      <b>Split in use:</b> {pairWords(pair)}. Your {ev.shift.limits.drive / 60}-hour driving limit and {ev.shift.limits.window / 60}-hour window count from {clock(ev.shift.anchor)}, the end of the first rest. The second rest does not count against your {ev.shift.limits.window / 60}-hour window.
      {leg && leg.start === pair[1].start && leg.end === pair[1].end ? ` Your ${clock(leg.start)}–${clock(leg.end)} rest can also be the first half of your next pair.` : ''}
    </p>
  );
}

/** Now's line under the hero: which rests the clocks paired, and where they count from. */
function SplitPairLine({ ev }: { ev: FullEvaluation }) {
  if (!activePair(ev)) return null;
  return <SplitPairWords ev={ev} />;
}

/**
 * What the hero ring may claim (patch 16, M11): the ring is the app's loudest statement, so its
 * substance says what the number stands on — solid from the driver's own log, dotted while any
 * part of the answer is estimated (a quick-start seed still in force, unlogged stretches being
 * counted as rest, or a history with nothing behind the current status), and a hollow outline
 * on the demo clock, which stands on nothing the driver did. The words beside the number have
 * always said this; now the picture does too.
 */
function ringBasis(s: State, now: number, ev: FullEvaluation): 'log' | 'estimate' | 'demo' {
  const basis = historyBasis(s, now);
  if (basis === 'fresh') return 'demo';
  if (basis === 'incomplete' || splitEstimateActive(s, now) || meaningfulGaps(ev.gaps).length > 0) return 'estimate';
  return 'log';
}

/** The one number a driver needs, in the size he needs it: driving left, the stop time, and why. */
/**
 * A11 (audit): the stop date with the month in its own span, so a narrow phone can drop it
 * ("FRI 20" instead of "FRI NOV 20", in the stylesheet) — the words read the same otherwise.
 */
function StopDate({ d }: { d: string }) {
  const m = /^(\S+) (\S+) (\S+)$/.exec(d);
  return m ? <>{m[1]} <span class="sd-mon">{m[2]} </span>{m[3]}</> : <>{d}</>;
}
function HeroDrive({ ev, basis, dissolve }: { ev: FullEvaluation; basis?: 'log' | 'estimate' | 'demo'; dissolve?: boolean }) {
  const share = useShareButton(shareText(ev, null));
  const tone = ev.driveNow < 60 ? 'warn' : 'good';
  const left = dur(ev.driveNow);
  // The full-date stop time from Declutter #1 is too wide for one line inside the dial at phone
  // widths — it wrapped mid-string and crossed the ring. Stack it deliberately instead: the date
  // as a quiet line over a larger time (patch #1.1). Split from clockFull so the dial can never
  // disagree with the wording every other surface shows.
  const [stopDate, stopTime] = clockFull(ev.mustStopBy).split(', ');
  return (
    <section class={dissolve ? 'hero now-card-dissolve' : 'hero'}>
      {tone === 'warn' ? <Sign kind="warn">Under 1 hour</Sign> : <Sign kind="go">Hours left</Sign>}
      <Dial share={bindingShare(ev)} hours={bindingHours(ev)} tone={tone === 'warn' ? 'warn' : 'calm'} size={270} basis={basis}>
        <div class="hero-label">You can drive</div>
        <div class={`hero-value ${tone}`}>{left}</div>
        <div class="hero-stop"><span class="hero-stop-date">Stop by <StopDate d={stopDate} /></span>{' '}<span class="hero-stop-time">{stopTime}</span></div>
        {basis === 'estimate' && <div class="hero-basis">estimate</div>}
      </Dial>
      <div class="hero-foot">
        <span class="limit-plate">{bindingSentence(ev)}</span>
        <span class="hero-actions">{share}<button class="link" data-why onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button></span>
      </div>
      {(ev.shift.pendingSplitLeg || ev.shift.notes.length > 0) && (
        <div class="trust">{[ev.shift.pendingSplitLeg ? 'First half of a split logged' : '', ev.shift.notes.length ? 'Exception active' : ''].filter(Boolean).join(' · ')}</div>
      )}
      <CardSwitchSlot />
    </section>
  );
}

/** Every limit as a bar: what is left of it, with the one that sets the stop time marked. */
function Meters({ ev }: { ev: FullEvaluation }) {
  const sh = ev.shift;
  const rows: { key: FullEvaluation['binding']; label: string; left: number; of: number; value?: string }[] = [
    { key: 'DRIVE_11', label: `${sh.limits.drive / 60}-hr driving`, left: sh.driveRemaining, of: sh.limits.drive },
    { key: 'WINDOW_14', label: `${sh.limits.window / 60}-hr window`, left: sh.windowRemaining, of: sh.limits.window },
    ...(Number.isFinite(sh.breakRemaining)
      ? [{ key: 'BREAK_30' as const, label: '30-min break', left: sh.breakRemaining, of: 480, value: sh.breakRemaining <= 0 ? 'due now' : `due in ${dur(sh.breakRemaining)}` }]
      : []),
    { key: 'CYCLE', label: `${ev.cycle.limit / 60}-hr / ${ev.cycle.windowDays}-day cycle`, left: ev.cycle.remaining, of: ev.cycle.limit },
  ];
  return (
    <section class="meters" aria-label="Your limits">
      {rows.map((r) => (
        <div key={r.key} class={`meter ${ev.binding === r.key ? 'on' : ''}`}>
          <span class="meter-label">{r.label}</span>
          <span class="meter-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (r.left / r.of) * 100)).toFixed(0)}%` }} /></span>
          <span class="meter-value">{r.value ?? `${dur(r.left)} left`}</span>
        </div>
      ))}
    </section>
  );
}

/* ============================================================ the time axis (capstone C1) */

/**
 * One lane of the time axis (audit §2.1): a label, an 8px bar from `from` to `end`, an
 * end-cap, and a value column that carries the clock time — the chart is also a readable
 * table, which is what solves the tick-collision problem by construction. `ghostEnd` is a
 * lever sheet's "before" end, drawn as an outline bar in the same row. Trust basis rides
 * on the bars exactly as it rides on the dial's ring (M11): estimate → dashed, demo →
 * hollow. `tone` is comeback mode's solid (the lane he is on) vs outline (the alternative).
 */
export interface AxisLane {
  key: string;
  label: string;
  short: string;
  end: number | null;
  value: string;
  ghostEnd?: number | null;
  basis?: 'log' | 'estimate' | 'demo';
  binding?: boolean;
  tone?: 'solid' | 'outline';
  onTap?: () => void;
  bracket?: string;
}

/** A lane end as the value column prints it: the time alone on the headline's own day, day + time beyond it. */
const dayKeyOf = (m: number) => new Intl.DateTimeFormat('en-US', { timeZone: deviceTz, year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(m * 60000));
export const laneValue = (end: number, now: number): string => (dayKeyOf(end) === dayKeyOf(now) ? clock(end, false) : clock(end));
/** A length in plain words for the axis's text twin: "59 hours 6 minutes". */
const twinDur = (m: number): string => {
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h === 1 ? '' : 's'}${r ? ` ${r} minute${r === 1 ? '' : 's'}` : ''}`;
};

/**
 * The one axis every future surface draws on (audit §2.0/§2.1): clock time left to right,
 * "now" at the left edge, fixed lane order, a STOP wall at mustStopBy, the drivable
 * stretch tinted left of the wall and lanes faded right of it. Geometry is percentages of
 * one span, computed once and shared by every row, so the wall and the gridlines line up
 * through all lanes by construction. The picture is aria-hidden; a text twin sentence
 * carries the same facts in the lanes' end order.
 */
function TimeAxis({ from, lanes, wall, ghostWall, hazard, twin, onTrack, plan }: {
  from: number;
  lanes: AxisLane[];
  wall?: number | null;
  ghostWall?: number | null;
  hazard?: boolean;
  twin: string;
  /** Capstone C2 (audit §2.3): a tap on a lane's track, as the clock time under the finger. Now's card alone passes it. */
  onTrack?: (t: number) => void;
  /** Capstone C2 (audit §2.5): plan mode — the Split Lab's one bar, on the same left-to-right scale. */
  plan?: PlanAxis;
}) {
  if (plan) return <PlanBar from={from} plan={plan} twin={twin} />;
  const ends = lanes.flatMap((l) => [l.end, l.ghostEnd]).filter((x): x is number => x != null && Number.isFinite(x));
  const latest = Math.max(from, ...ends.filter((e) => e <= from + 960));
  const to = Math.max(from + 180, Math.min(from + 960, Math.ceil(latest / 30) * 30));
  const span = to - from;
  const step = span <= 360 ? 60 : span <= 720 ? 120 : 180;
  const grid: number[] = [];
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) grid.push(m);
  const pct = (m: number) => Math.max(0, Math.min(100, ((m - from) / span) * 100));
  const inTrack = (p: number) => `clamp(1.5px, ${p}%, calc(100% - 1.5px))`;
  const hourLabel = (m: number) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23' }).format(new Date(m * 60000));
  const wallPct = wall != null && wall > from ? pct(wall) : null;
  const ghostWallPct = ghostWall != null && ghostWall > from ? pct(ghostWall) : null;
  // The scrubber's entry (§2.3): the tapped spot on a track is a clock time on this axis's
  // one scale. A lane that is itself a button (comeback's sleeper lane) keeps its own tap.
  const tapAt = onTrack ? (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Number.isFinite(e.clientX) && r.width > 0 ? (e.clientX - (r.left || 0)) / r.width : 0;
    onTrack(from + Math.max(0, Math.min(1, x)) * span);
  } : undefined;
  const track = (l?: AxisLane) => (
    <span class={`taxis-track ${l?.ghostEnd != null ? 'has-ghost' : ''}`} onClick={l?.onTap ? undefined : tapAt}>
      {wallPct !== null && <span class="taxis-tint" style={{ width: `${wallPct}%` }} />}
      {grid.map((g) => <span key={g} class="taxis-grid" style={{ left: `${pct(g)}%` }} />)}
      {hazard && <span class="taxis-hazard" />}
      {l?.ghostEnd != null && <span class="taxis-bar ghost" style={{ width: `${pct(l.ghostEnd)}%` }} />}
      {l?.end != null && (
        <>
          {wallPct !== null && l.end > (wall as number)
            ? <>
                <span class={`taxis-bar ${l.basis === 'estimate' ? 'basis-estimate' : l.basis === 'demo' ? 'basis-demo' : ''} ${l.tone === 'outline' ? 'outline' : ''}`} style={{ width: `${wallPct}%` }} />
                <span class={`taxis-bar faded ${l.basis === 'estimate' ? 'basis-estimate' : l.basis === 'demo' ? 'basis-demo' : ''} ${l.tone === 'outline' ? 'outline' : ''}`} style={{ left: `${wallPct}%`, width: `${pct(l.end) - wallPct}%` }} />
              </>
            : <span class={`taxis-bar ${l.basis === 'estimate' ? 'basis-estimate' : l.basis === 'demo' ? 'basis-demo' : ''} ${l.tone === 'outline' ? 'outline' : ''}`} style={{ width: `${pct(l.end)}%` }} />}
          {/* Gemini round, item F: the 3px cap/wall is centred on its x, so at 0% or 100% half
              of it hung outside the track; clamp the centre 1.5px inside either end. */}
          <span class="taxis-cap" style={{ left: inTrack(pct(l.end)) }} />
          {l.end > to && <span class="taxis-arrow">→</span>}
        </>
      )}
      {ghostWallPct !== null && <span class="taxis-wall ghost" style={{ left: inTrack(ghostWallPct) }} />}
      {wallPct !== null && <span class="taxis-wall" style={{ left: inTrack(wallPct) }} />}
      {l?.bracket && <span class="taxis-bracket" title={l.bracket}>[</span>}
    </span>
  );
  return (
    <div class="taxis-wrap">
      <p class="vh">{twin}</p>
      <div class="taxis" aria-hidden="true">
        <div class="taxis-row taxis-head">
          <span class="taxis-label" />
          <span class={`taxis-track taxis-track-head${wallPct !== null || ghostWallPct !== null ? ' has-tag' : ''}`} onClick={tapAt}>
            {grid.map((g) => <span key={g} class="taxis-hour" style={{ left: `${pct(g)}%` }}>{hourLabel(g)}</span>)}
            {wallPct !== null && <span class="taxis-tag" style={{ left: `${wallPct}%` }}>STOP {clock(wall as number, false)}</span>}
            {ghostWallPct !== null && <span class="taxis-tag ghost" style={{ left: `${ghostWallPct}%` }}>STOP {clock(ghostWall as number, false)}</span>}
          </span>
          <span class="taxis-value" />
        </div>
        {lanes.map((l) => {
          const inner = (
            <>
              <span class="taxis-label">{l.binding && <span class="taxis-bind" aria-hidden="true" data-status-label="1">◆</span>}<span class="tl-full">{l.label}</span><span class="tl-short">{l.short}</span></span>
              {track(l)}
              <span class="taxis-value mono">{l.value}</span>
            </>
          );
          const rowCls = l.binding ? 'taxis-row is-binding' : 'taxis-row';
          return l.onTap
            ? <button key={l.key} class={`${rowCls} taxis-tap`} data-binding={l.binding ? '1' : undefined} onClick={l.onTap}>{inner}</button>
            : <div key={l.key} class={rowCls} data-binding={l.binding ? '1' : undefined}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

/**
 * The four limits as lanes, in the meters' fixed order (audit §2.1): 11-hr driving,
 * 14-hr window, 30-min break, cycle. Every end is asOf + what the evaluation says is
 * left — the window lane's end is the #14 formula (asOf + window − windowUsed) in its
 * remaining-minutes form, never a recomputation. The cycle shows its length left as a
 * duration when its end is more than a day out, which on a normal day it always is.
 */
export function limitsLanes(ev: FullEvaluation, basis: 'log' | 'estimate' | 'demo'): AxisLane[] {
  const sh = ev.shift, now = ev.asOf;
  const pair = activePair(ev);
  const lane = (key: string, label: string, short: string, left: number, bindingKey: FullEvaluation['binding'], cycle = false): AxisLane => {
    const end = now + left;
    return {
      key, label, short, end, basis,
      value: cycle && left > 1440 ? `${dur(left)} left` : laneValue(end, now),
      binding: ev.binding === bindingKey,
      ...(key === 'WINDOW_14' && pair ? { bracket: `Your clocks count from ${clock(sh.anchor)}, the end of the first rest in your split pair` } : {}),
    };
  };
  return [
    lane('DRIVE_11', `${sh.limits.drive / 60}-hr driving`, `${sh.limits.drive / 60}-hr`, sh.driveRemaining, 'DRIVE_11'),
    lane('WINDOW_14', `${sh.limits.window / 60}-hr window`, `${sh.limits.window / 60}-hr`, sh.windowRemaining, 'WINDOW_14'),
    ...(Number.isFinite(sh.breakRemaining) ? [lane('BREAK_30', '30-min break', '30-min', sh.breakRemaining, 'BREAK_30')] : []),
    lane('CYCLE', `${ev.cycle.limit / 60}-hr cycle`, `${ev.cycle.limit / 60}-hr`, ev.cycle.remaining, 'CYCLE', true),
  ];
}

/** The limits axis's text twin: the ends in the order they fall, the cycle as a length when it is a day or more out. */
export function limitsTwin(ev: FullEvaluation): string {
  const sh = ev.shift, now = ev.asOf;
  const rows: { name: string; end: number; due?: boolean }[] = [
    { name: `${sh.limits.drive / 60}-hour driving`, end: now + sh.driveRemaining },
    { name: `${sh.limits.window / 60}-hour window`, end: now + sh.windowRemaining },
    ...(Number.isFinite(sh.breakRemaining) ? [{ name: '30-min break', end: now + sh.breakRemaining, due: true }] : []),
  ].sort((a, b) => a.end - b.end);
  const parts = rows.map((r) => `${r.name}${r.due ? ' due' : ''} ${laneValue(r.end, now)}`);
  const cycle = ev.cycle.remaining > 1440
    ? ` Cycle: ${twinDur(ev.cycle.remaining)} left.`
    : ` ${ev.cycle.limit / 60}-hour cycle ends ${laneValue(now + ev.cycle.remaining, now)}.`;
  return `Limits end in this order: ${parts.join(', ')}.${cycle}`;
}

/**
 * Comeback mode (audit §2.2, states B–D): when driving comes back, one lane per way back.
 * The off-duty lane always shows; the sleeper lane shows when it differs (at equal times
 * they are one lane, §2.2 state C on the seed). The lane for the status he is in is solid,
 * the alternative outline — and the sleeper lane is a tap into the L3 sheet when the
 * sleeper is sooner. State D adds the recap lane from the cycle forecast.
 */
export function comebackLanes(s: State, ev: FullEvaluation, again: DriveAgain, sleeperAt: number | null, onSleeper?: () => void): AxisLane[] {
  const now = ev.asOf;
  const status = s.current?.status ?? 'OFF';
  const basis = ringBasis(s, now, ev);
  const lanes: AxisLane[] = [];
  if (again.off !== null) {
    lanes.push({
      key: 'OFF', label: status === 'SB' ? 'Sleeper' : 'Off duty', short: status === 'SB' ? 'Sleeper' : 'Off',
      end: again.off, value: laneValue(again.off, now), basis, tone: 'solid',
    });
  }
  const sb = status === 'SB' ? null : (again.sb ?? sleeperAt);
  if (sb !== null && again.off !== null && sb !== again.off && sb < again.off) {
    lanes.push({
      key: 'SB', label: 'Sleeper', short: 'Sleeper', end: sb, value: laneValue(sb, now), basis,
      tone: status === 'OFF' ? 'outline' : 'solid',
      ...(onSleeper ? { onTap: onSleeper } : {}),
    });
  }
  if (ev.binding === 'CYCLE') {
    const f = ev.cycle.forecast.find((x) => x.dayStart > now && x.dropsOff > 0);
    if (f) lanes.push({ key: 'RECAP', label: 'Recap', short: 'Recap', end: f.dayStart, value: `+${dur(f.dropsOff)}`, basis, tone: 'outline' });
  }
  return lanes;
}

/** The comeback axis's text twin. */
export function comebackTwin(ev: FullEvaluation, again: DriveAgain, sleeperAt: number | null): string {
  const now = ev.asOf;
  const parts: string[] = [];
  if (again.off !== null) parts.push(`off duty ${laneValue(again.off, now)}`);
  const sb = again.sb ?? sleeperAt;
  if (sb !== null && again.off !== null && sb !== again.off && sb < again.off) parts.push(`sleeper ${laneValue(sb, now)}`);
  let out = `Driving comes back: ${parts.join(', ')}.`;
  if (ev.binding === 'CYCLE') {
    const f = ev.cycle.forecast.find((x) => x.dayStart > now && x.dropsOff > 0);
    if (f) out += ` Recap: +${twinDur(f.dropsOff)} comes back at ${laneValue(f.dayStart, now)}.`;
  }
  return out;
}

/**
 * Now's Timeline card, state A/F (audit §2.2): the dial's centre, unchanged — the same
 * hero label, value and stacked stop-by, the same limit plate and Why link — with the
 * ring become lanes. Only the picture under the number is new.
 */
function TimelineDrive({ s, now, ev, basis, onTrack, dissolve }: { s: State; now: number; ev: FullEvaluation; basis: 'log' | 'estimate' | 'demo'; onTrack?: (t: number) => void; dissolve?: boolean }) {
  const share = useShareButton(shareText(ev, null));
  const tone = ev.driveNow < 60 ? 'warn' : 'good';
  const [stopDate, stopTime] = clockFull(ev.mustStopBy).split(', ');
  return (
    <section class={dissolve ? 'hero now-card-dissolve' : 'hero'}>
      {tone === 'warn' ? <Sign kind="warn">Under 1 hour</Sign> : <Sign kind="go">Hours left</Sign>}
      <div class="tl-head">
        <div class="tl-main">
          <div class="hero-label">You can drive</div>
          <div class={`hero-value ${tone}`}>{dur(ev.driveNow)}</div>
          {basis === 'estimate' && <div class="hero-basis">estimate</div>}
        </div>
        <div class="hero-stop"><span class="hero-stop-date">Stop by <StopDate d={stopDate} /></span>{' '}<span class="hero-stop-time">{stopTime}</span></div>
      </div>
      <TimeAxis from={now} lanes={limitsLanes(ev, basis)} wall={ev.mustStopBy} twin={limitsTwin(ev)} onTrack={onTrack} />
      <div class="hero-foot">
        <span class="limit-plate">{bindingSentence(ev)}</span>
        <span class="hero-actions">{share}<button class="link" data-why onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button></span>
      </div>
      {(ev.shift.pendingSplitLeg || ev.shift.notes.length > 0) && (
        <div class="trust">{[ev.shift.pendingSplitLeg ? 'First half of a split logged' : '', ev.shift.notes.length ? 'Exception active' : ''].filter(Boolean).join(' · ')}</div>
      )}
      <CardSwitchSlot />
    </section>
  );
}

/* ============================================================ future scrubber (capstone C2, M16) */

/**
 * The future scrubber (audit §2.3): "if I drive — or stay put — until T, where will I
 * stand?", previewed on the Timeline card's own axis. Everything here is pure and local:
 * the preview time lives in NowTab's component state and nowhere else (rail 4 — it is not
 * in State, parseSaved, the export or the sim snapshot), the continuation row exists only
 * inside the array handed to evaluate(), and nothing below reads or feeds the alerts or
 * the voice (rail 5 — those read App's own evaluation).
 */
export const PREVIEW_STEP_MIN = 15;
/** Rail 6: now < T <= now + 24h. The past belongs to Log and History. */
export const PREVIEW_MAX_MIN = 1440;
/** Rail 3: the preview snaps back this long after the last interaction. */
export const PREVIEW_IDLE_MS = 10000;
export type PreviewCont = 'drive' | 'stay';

export function previewInBounds(t: number, now: number): boolean {
  return Number.isFinite(t) && t > now && t <= now + PREVIEW_MAX_MIN;
}
/** A tapped time snapped to the clock's quarter hours and held inside the bounds. */
export function previewSnap(t: number, now: number): number {
  let q = Math.round(t / PREVIEW_STEP_MIN) * PREVIEW_STEP_MIN;
  if (!(q > now)) q = Math.floor(now / PREVIEW_STEP_MIN) * PREVIEW_STEP_MIN + PREVIEW_STEP_MIN;
  if (q > now + PREVIEW_MAX_MIN) q = Math.floor((now + PREVIEW_MAX_MIN) / PREVIEW_STEP_MIN) * PREVIEW_STEP_MIN;
  return q;
}
/** [Driving] is the default while there is time to drive (state A); [Staying …] otherwise (states B–D). */
export function previewDefaultCont(ev: FullEvaluation): PreviewCont {
  return ev.driveNow > 0 ? 'drive' : 'stay';
}
/** Rail 1: a parked driver's tool — only on the Timeline card, never while the status is Driving. */
export function previewOffered(s: State): boolean {
  return s.nowCard === 'timeline' && s.current?.status !== 'D';
}
/** A limit by the name the strip and the preview use for an overrun: "14-hour window", "11-hour driving". */
export function limitName(kind: Violation['kind'], ev: FullEvaluation): string {
  switch (kind) {
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hour driving`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hour window`;
    case 'BREAK_30': return '30-minute break rule';
    default: return `${ev.cycle.limit / 60}-hour cycle`;
  }
}
/** Overruns as the strip lists them: "14-hour window by 2h 54m · 11-hour driving by 1h 54m". */
export function overrunList(viol: Violation[], ev: FullEvaluation): string {
  return viol.map((v) => `${limitName(v.kind, ev)} by ${dur(v.minutes)}`).join(' · ');
}

export interface PreviewResult {
  at: number;
  cont: PreviewCont;
  /** The status the previewed stretch is spent in. */
  status: DutyStatus;
  ev: FullEvaluation;
  /** Limits the previewed stretch itself runs over (violations beginning at or after now). */
  violations: Violation[];
  /** When driving comes back if he rests from T — only when the preview leaves no driving time. */
  again: { off: number | null; sb: number | null } | null;
}
/**
 * The preview's evaluation — the calls the app already makes, on the record extended by
 * one continuation row from now to T (audit §2.3). The row is tentative inside evaluate(),
 * exactly as specified; driveAgainAt, which by its own contract ignores tentative rows
 * ("if I rest now", never a plan), is asked from T with the same row as part of the
 * record — otherwise it would answer for a day in which the previewed stretch never
 * happened. Pure: reads the state, writes nothing.
 */
export function previewEval(s: State, now: number, t: number, cont: PreviewCont): PreviewResult {
  const cur = s.current;
  const cfg = safeRulesConfig(s.config);
  const status: DutyStatus = cont === 'drive' ? 'D' : cur?.status ?? 'OFF';
  const note = cont === 'stay' && cur?.note ? { note: cur.note } : {};
  const record = allSegments(s, now);
  const ev = evaluate([...record, { status, start: now, end: t, tentative: true, ...note }], { asOf: t, config: cfg });
  let again: PreviewResult['again'] = null;
  if (ev.driveNow <= 0) {
    const segs = pruneHistory([...record, { status, start: now, end: t, ...note }], t, cfg), opts = { asOf: t, config: cfg };
    again = { off: driveAgainAt(segs, opts, 'OFF'), sb: driveAgainAt(segs, opts, 'SB') };
  }
  return { at: t, cont, status, ev, violations: ev.violations.filter((v) => v.start >= now).sort((a, b) => a.start - b.start), again };
}
const STAY_WORDS: Record<DutyStatus, string> = { OFF: 'off duty', SB: 'in the sleeper', ON: 'on duty', D: 'driving' };
/** The frame every preview number sits behind (rail 2): "At 12:00, if you stay off duty:". */
export function previewFrame(r: PreviewResult, now: number): string {
  return `At ${laneValue(r.at, now)}, if you ${r.cont === 'drive' ? 'drive until then' : `stay ${STAY_WORDS[r.status]}`}:`;
}
/** The band across the card top (rail 2), verbatim from the audit: "PREVIEW 12:00 — not now". */
export function previewBand(t: number, now: number): string {
  return `PREVIEW ${laneValue(t, now)} — not now`;
}

/**
 * The Timeline card in preview (audit §2.2 state E, §2.3): the PREVIEW band and the
 * dashed border on every frame, the frame sentence ahead of every number, the headline
 * and the axis as of T, and the three 56px controls. A preview past the wall shows the
 * hazard block and names the limit it is over — never a positive number.
 */
function PreviewCard({ s, now, basis, t, cont, onCont, onStep, onBack, onTrack }: {
  s: State; now: number; basis: 'log' | 'estimate' | 'demo'; t: number; cont: PreviewCont;
  onCont: (c: PreviewCont) => void; onStep: (delta: number) => void; onBack: () => void; onTrack: (t: number) => void;
}) {
  const r = useMemo(() => previewEval(s, now, t, cont), [s.segments, s.current, s.tentative, s.config, now, t, cont]);
  const pev = r.ev;
  const stayStatus = s.current?.status ?? 'OFF';
  const frame = previewFrame(r, now);
  const out = pev.driveNow <= 0;
  const [stopDate, stopTime] = clockFull(pev.mustStopBy).split(', ');
  const off = r.again?.off ?? null, sb = r.again?.sb ?? null;
  const sbSooner = sb !== null && off !== null && sb < off;
  const comeback: AxisLane[] = [
    ...(off !== null ? [{ key: 'OFF', label: 'Off duty', short: 'Off', end: off, value: laneValue(off, t), basis, tone: 'solid' as const }] : []),
    ...(sbSooner ? [{ key: 'SB', label: 'Sleeper', short: 'Sleeper', end: sb, value: laneValue(sb as number, t), basis, tone: 'outline' as const }] : []),
  ];
  return (
    <section class="hero preview" data-preview={t}>
      <div class="pv-band">{previewBand(t, now)}</div>
      <Toggle options={[['drive', 'Driving'], ['stay', `Staying ${STAY_WORDS[stayStatus]}`]] as [PreviewCont, string][]} value={cont} onChange={onCont} />
      <p class="pv-frame">{frame}</p>
      {!out ? (
        <>
          <div class="tl-head">
            <div class="tl-main">
              <div class="hero-label">You can drive</div>
              <div class={`hero-value ${pev.driveNow < 60 ? 'warn' : 'good'}`}>{dur(pev.driveNow)}</div>
              {basis === 'estimate' && <div class="hero-basis">estimate</div>}
            </div>
            <div class="hero-stop"><span class="hero-stop-date">Stop by <StopDate d={stopDate} /></span>{' '}<span class="hero-stop-time">{stopTime}</span></div>
          </div>
          <TimeAxis from={t} lanes={limitsLanes(pev, basis)} wall={pev.mustStopBy} twin={`${frame} ${limitsTwin(pev)}`} onTrack={onTrack} />
          <div class="hero-foot"><span class="limit-plate">{bindingSentence(pev)}</span></div>
        </>
      ) : (
        <>
          <div class="hero-label pv-over">{r.violations.length ? `Over the ${limitName(r.violations[0].kind, pev)}` : 'Out of driving time'}</div>
          <div class="hero-value bad">{dur(0)}</div>
          {r.violations.length > 0 && <p class="hero-text pv-viol">{r.violations.length} limit{r.violations.length === 1 ? '' : 's'} broken by then: {overrunList(r.violations, pev)}.</p>}
          {off !== null
            ? <p class="hero-text">Rest from then and driving comes back at <b>{laneValue(off, t)}</b> off duty{sbSooner ? <>, or <b>{laneValue(sb as number, t)}</b> in the sleeper</> : ''}.</p>
            : <p class="hero-text">Driving does not come back within 36 hours of rest from then.</p>}
          <TimeAxis from={t} lanes={comeback} hazard={r.status === 'D' || r.status === 'ON'} twin={`${frame} no driving time.${off !== null ? ` Driving comes back at ${laneValue(off, t)} off duty.` : ''}`} onTrack={onTrack} />
        </>
      )}
      <div class="pv-steps">
        <button class="pv-step" disabled={!previewInBounds(t - PREVIEW_STEP_MIN, now)} onClick={() => onStep(-PREVIEW_STEP_MIN)}>−15 min</button>
        <button class="pv-step" disabled={!previewInBounds(t + PREVIEW_STEP_MIN, now)} onClick={() => onStep(PREVIEW_STEP_MIN)}>+15 min</button>
        <button class="primary pv-step pv-back" data-first onClick={onBack}>Back to now</button>
      </div>
    </section>
  );
}

/** The lever chips under the Timeline card (audit §2.4, decision C3-A): at most two, 56px, never the words should/legal/safe/allowed. */
function LeverChips({ chips }: { chips: Lever[] }) {
  if (!chips.length) return null;
  return (
    <>
      {chips.map((l) => (
        <button key={l.id} class="lever" onClick={() => openSheet({ kind: 'lever', lever: l })}>
          <span class="lever-text"><b>{leverTitle(l)}</b>{leverSub(l) && <span class="lever-sub">{leverSub(l)}</span>}</span>
          <Icon d={I.next} />
        </button>
      ))}
    </>
  );
}

/**
 * A lever chip's sheet (audit §2.4): the chip's sentence as the title, the ghost axis
 * (before as outlines, after solid, the wall moved), one rule sentence with its
 * citation, the log-it-exactly caveat, and — for L2/L3 — a Split Lab pre-fill that
 * writes the DRAFT only, behind the Lab's one-level draft undo. Nothing here writes
 * to the log.
 */
function LeverSheet({ s, now, ev, lever, closing = false }: { s: State; now: number; ev: FullEvaluation; lever: Lever; closing?: boolean }) {
  const { rule, cite, caveat } = leverRule(lever, ev);
  const after = leverAfter(s, now, lever);
  const prefill = leverSplitPrefill(s, now, lever);
  let ghost: ComponentChildren = null;
  if ((lever.id === 'L1' || lever.id === 'L2') && after) {
    const before = limitsLanes(ev, 'log');
    const lanes = limitsLanes(after, 'log').map((a) => ({ ...a, ghostEnd: before.find((b) => b.key === a.key)?.end ?? null }));
    ghost = <TimeAxis from={now} lanes={lanes} wall={after.mustStopBy} ghostWall={ev.mustStopBy} twin={`After the rest: ${limitsTwin(after)}`} />;
  } else if (lever.id === 'L3') {
    ghost = <TimeAxis from={now} lanes={[{ key: 'AGAIN', label: 'Drive again', short: 'Again', end: lever.sbAt, ghostEnd: lever.offAt, value: laneValue(lever.sbAt, now) }]} twin={`In the sleeper, driving comes back at ${laneValue(lever.sbAt, now)}; off duty, ${laneValue(lever.offAt, now)}.`} />;
  } else if (lever.id === 'L4') {
    ghost = <TimeAxis from={now} lanes={[{ key: 'CYCLE', label: `${ev.cycle.limit / 60}-hr cycle`, short: `${ev.cycle.limit / 60}-hr`, end: lever.at, ghostEnd: lever.at + lever.available, value: laneValue(lever.at, now) }]} twin={`At ${laneValue(lever.at, now)}, ${twinDur(lever.dropsOff)} of cycle time comes back.`} />;
  }
  return (
    <Sheet title={leverTitle(lever)} slideUp closing={closing}>
      {ghost}
      <p class="small">{rule}</p>
      <div class="why-cite">{cite}</div>
      <p class="trust">{caveat}</p>
      {/* The pre-fill jump lands in the Lab with Now recorded as the return, so the Lab's
          back bar brings the driver home. This sheet action is the one Split jump the
          capstone audit §2.4 specifies; under sanction S11 (Lorico, Nov 9 2026) the
          Patch 13 pin guards NowTab's own body against a Split door, and this call —
          the only one of its shape in the app — stands here in the open. */}
      {prefill && (
        <button class="wide" onClick={() => { replaceSplitDraft({ ...getState().split, ...prefill }); openSheet(null); setState({ tab: 'split', planReturn: 'now' }); }}>Try it in Split Lab</button>
      )}
      <button class="primary wide" data-first onClick={() => openSheet(null)}>Close</button>
    </Sheet>
  );
}

/**
 * The split pair in timeline mode (audit §2.6, N-3): a trust-strip chip naming the
 * anchor, with the dial mode's paragraph kept verbatim one tap down inside it.
 */
function SplitPairChip({ ev }: { ev: FullEvaluation }) {
  const pair = activePair(ev);
  if (!pair) return null;
  return (
    <NoticeLine summary={`Split in use — clocks count from ${clock(ev.shift.anchor)}`}>
      <SplitPairWords ev={ev} />
    </NoticeLine>
  );
}

/** The four statuses, always at the bottom of Now, within thumb reach. */
function StatusDock({ s }: { s: State }) {
  // Gemini round, item C: the dock measures ITSELF into --dock-h (the header's --top-h pattern),
  // so Now's scroll-padding keeps anything scrolled into view (focus, scrollIntoView) clear of it.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--dock-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div class="dock" ref={dockRef}>
      {/* D2 (audit): the tap's undo rides the dock itself — the dock is sticky, so the chip
          is on screen wherever Now is scrolled, one glance above the key just pressed. */}
      <StatusUndoChip />
      <div class="status-buttons">{STATUS_ORDER.map((st) => {
        const on = s.current?.status === st && !s.current?.note;
        // Capstone C3 (M13): a dock key that changes the status answers with the 20ms status
        // pulse instead of the 12ms tap tick (data-haptic keeps the global tick off it).
        return <button key={st} data-haptic="status" style={`--led: ${STATUS_COLOR[st]}`} class={on ? 'on' : ''} aria-pressed={on} onClick={() => statusHaptic(tapStatus(st), getState().alertsOn)}>{on && <Icon d={I.check} size={16} />}<span class="dock-ico"><Icon d={STATUS_ICON[st]} size={26} /></span>{STATUS_LABEL[st]}</button>;
      })}</div>
      <button class="link dock-more" onClick={(e) => openMorphSheet({ kind: 'status' }, e.currentTarget)}>PC, yard move, or started earlier…</button>
    </div>
  );
}

/**
 * The status tap's own undo (patch 16, P10 — decision D8-A, sanction S3): for eight seconds
 * after a tap, the change it made sits directly above the dock with its Undo — one glance
 * down from where the thumb just was. The undo SLOT is the app's single slot and the newest
 * change owns it, so the chip shows only while the pending undo is a status tap's; anything
 * newer takes the slot and the chip is gone. The chip is only a view of the slot: when the
 * slot retires — undone, or replaced — so does the chip, and the change itself is never on
 * a timer.
 */
function StatusUndoChip({ drive = false }: { drive?: boolean }) {
  const undo = useUndo();
  const [visible, setVisible] = useState(false);
  const isTap = !!undo && /^.+ since \d{2}:\d{2}$/.test(undo.label);
  useEffect(() => {
    if (!isTap) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(t);
  }, [undo, isTap]);
  if (!isTap || !visible || !undo) return null;
  return (
    <div class={drive ? 'row undo status-undo drive-undo' : 'row undo status-undo'} role="status">
      <span>{undo.label}.</span>
      <button class="mini" onClick={undoLast}>Undo</button>
    </div>
  );
}

/* ---------- the welcome-back check (capstone C3, audit §3 M5 — decision C8-A) ---------- */

/** Trigger 1: Driving, and the record has been out of driving time this long (engine violations). */
export const WELCOME_OVER_MIN = 30;
/** Trigger 2: On duty for more than this long in a row. */
export const WELCOME_ON_MIN = 16 * 60;
export interface WelcomeBack { key: string; status: DutyStatus; note?: string; since: number }
const welcomeRunKey = (s: State): string => (s.current ? `${s.current.status}|${s.current.note ?? ''}|${s.current.since}` : '');
/**
 * Is the live status implausible? Exactly two triggers, nothing else (the Off > 34h trigger was
 * dropped: a long rest is normal after home time). Never under a simulated clock. Trigger 1
 * reads the engine's own violations — one still running at now, 30 minutes or more — so there
 * is no new arithmetic; trigger 2 is now − the run's start (currentRunStart).
 */
export function welcomeBackDue(s: State, now: number, ev: FullEvaluation | null): WelcomeBack | null {
  if (!s.current || !ev || s.nowOverride !== null) return null;
  const st = s.current.status;
  const since = currentRunStart(s, now);
  const hit = (st === 'D' && ev.violations.some((v) => !v.tentative && v.end >= now && v.minutes >= WELCOME_OVER_MIN))
    || (st === 'ON' && now - since > WELCOME_ON_MIN);
  return hit ? { key: welcomeRunKey(s), status: st, note: s.current.note, since } : null;
}
/**
 * The check runs on app open and on each return to the foreground — the moment a wrong status
 * can still be fixed — and the chip it raises stays until a tap. In memory only: nothing here is
 * stored, and nothing in the record changes until the driver taps a status. "Yes" dismisses it
 * for this status run.
 */
let welcomeRaised: string | null = null;
const welcomeDismissed = new Set<string>();
const welcomeSubs = new Set<() => void>();
export function welcomeCheck(s: State, now: number, ev: FullEvaluation | null) {
  const w = welcomeBackDue(s, now, ev);
  const k = w && !welcomeDismissed.has(w.key) ? w.key : null;
  if (k !== welcomeRaised) { welcomeRaised = k; welcomeSubs.forEach((f) => f()); }
}
export function welcomeYes() {
  if (welcomeRaised) welcomeDismissed.add(welcomeRaised);
  welcomeRaised = null;
  welcomeSubs.forEach((f) => f());
}
/** Test hook: forget every raised and dismissed check. */
export function resetWelcomeForTest() { welcomeRaised = null; welcomeDismissed.clear(); }
function useWelcome(): string | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); welcomeSubs.add(f); return () => { welcomeSubs.delete(f); }; }, []);
  return welcomeRaised;
}
/** The chip itself: open, under the answer, never a modal. */
function WelcomeBackChip({ w, now }: { w: WelcomeBack; now: number }) {
  const label = segLabel(w.status, w.note);
  return (
    <div class="welcome" role="status">
      <p><b>Still {label}?</b> Since {now - w.since < 1440 ? clock(w.since, false) : clock(w.since)} — {dur(now - w.since)}.</p>
      <div class="row">
        <button class="mini primary" onClick={welcomeYes}>Yes, still {label.toLowerCase()}</button>
        <button class="mini" onClick={(e) => openMorphSheet({ kind: 'status' }, e.currentTarget)}>I stopped at…</button>
      </div>
    </div>
  );
}

function NowTab({ s, now, ev, again, onExitPeek, driverName }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain | null; onExitPeek: () => void; driverName: string }) {
  const warn = ev.shift.notes.filter((n) => n.startsWith('⚠'));
  const active = [ev.shift.exceptionKeys.adverse !== null ? 'Adverse conditions' : '', ev.shift.exceptionKeys.sixteen !== null ? '16-hour day' : ''].filter(Boolean);
  /** Today's day-close bookmark, when the day stands closed (patch 13; the store's one rule). */
  const closedToday = dayCloseToday(s, now);
  const [endAsk, setEndAsk] = useState(false);
  const basis = ringBasis(s, now, ev);
  /**
   * Capstone C1 (decisions D2-A / C1-A): the Timeline is a second main card beside the
   * dial, the driver's choice, kept in the state object. Dial mode renders the shipped
   * Now exactly as before; timeline mode keeps the same headline and swaps the dial's
   * ring for the lanes (the lanes ARE the meters there, §2.6 — Meters is not rendered),
   * seats the lever chips under the card, and turns the split-pair paragraph into a
   * trust-strip chip.
   */
  const timeline = s.nowCard === 'timeline';
  const status = s.current?.status ?? 'OFF';
  /**
   * The levers (fix round, Verify-C1 defect D5): audit §2.4 specified them computed in
   * an idle callback after paint, on the audit's key (segments, current, config,
   * minute). The first build memoised them on the render path instead, and the true
   * worst case costs ~27 evaluations synchronously on every render — so the
   * computation now runs from this effect, scheduled with requestIdleCallback
   * (setTimeout fallback), holds its result in state, and the chips render when it
   * lands. The minute stays in the key for every status: the resting searches
   * read it too (L3 asks about a sleeper rest starting now, L1 about a break
   * starting now, L4 about the next roll-off after now), so a resting driver's
   * levers recompute once a minute in the idle callback rather than freezing
   * at the last entry (delta defect D6). The snapshot the effect closes over is
   * the render its key describes, so it is never a minute stale. The previous
   * result stays up until the new one lands rather than blinking out; the gap
   * is one idle tick, and any tap that changes the record re-keys the effect
   * at once.
   */
  const [levers, setLevers] = useState<Lever[]>([]);
  useEffect(() => {
    if (!timeline) { setLevers([]); return; }
    let live = true;
    const run = () => { if (live) setLevers(computeLevers(s, now, ev, basis, again)); };
    const w = globalThis as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(run, { timeout: 1000 });
      return () => { live = false; w.cancelIdleCallback?.(id); };
    }
    const t = setTimeout(run, 0);
    return () => { live = false; clearTimeout(t); };
  }, [timeline, s.segments, s.current, s.config, s.tentative, basis, now]);
  const chips = pickChips(levers);
  // M5: the welcome-back chip, while the run it was raised for is still the live one.
  const raised = useWelcome();
  const welcome = raised !== null && raised === welcomeRunKey(s) ? welcomeBackDue(s, now, ev) : null;
  const l3 = levers.find((l): l is Extract<Lever, { id: 'L3' }> => l.id === 'L3');
  /**
   * Capstone C2 — the future scrubber (audit §2.3). The preview time and its
   * continuation live HERE, in component state, and nowhere else (rail 4): not in the
   * store, so not in parseSaved, the export or the sim snapshot; a tab change unmounts
   * this component and the preview with it. `pv` is replaced on every interaction, so
   * its identity is the "last interaction" the 10-second snap-back counts from.
   */
  const [pv, setPv] = useState<{ t: number; cont: PreviewCont } | null>(null);
  const [snap, setSnap] = useState(false);
  const pvRef = useRef(pv); pvRef.current = pv;
  const sheetOpen = useSheet() !== null;
  // Rail 1: never while the status is Driving. Rail 6: only inside now < T <= now + 24h.
  const canPreview = previewOffered(s);
  const preview = canPreview && pv && previewInBounds(pv.t, now) ? pv : null;
  const backToNow = () => { if (pvRef.current) { setPv(null); setSnap(true); } };
  const enterPreview = (t: number) => {
    if (!previewOffered(getState())) return;
    setPv({ t: previewSnap(t, now), cont: pvRef.current?.cont ?? previewDefaultCont(ev) });
  };
  // With the status Driving (the Details peek) the axis is not a scrubber: a tap opens Why.
  const onTrack = !timeline ? undefined : status === 'D' ? () => openSheet({ kind: 'why' }) : enterPreview;
  // Rail 3 — the snap-back triggers. Ten seconds after the last interaction:
  useEffect(() => {
    if (!pv) return;
    const t = setTimeout(backToNow, PREVIEW_IDLE_MS);
    return () => clearTimeout(t);
  }, [pv]);
  // …any store write (a status tap is one; so is the simulated clock moving):
  useEffect(() => { backToNow(); }, [s]);
  // …any sheet opening:
  useEffect(() => { if (sheetOpen) backToNow(); }, [sheetOpen]);
  // …the clock reaching the previewed time (the bound is now < T):
  useEffect(() => { if (pvRef.current && !previewInBounds(pvRef.current.t, now)) backToNow(); }, [now]);
  // …and the app going to the background.
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'hidden') backToNow(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  // The snap is a 200ms slide (instant under prefers-reduced-motion, in the stylesheet).
  useEffect(() => {
    if (!snap) return;
    const t = setTimeout(() => setSnap(false), 200);
    return () => clearTimeout(t);
  }, [snap]);
  // Soft dissolve on Now hero card body when toggling s.nowCard (Timeline <-> Dial).
  // Fires ONLY on an actual s.nowCard change (never on initial mount), skipped under
  // prefers-reduced-motion: reduce, and cleans up after the 200ms fade completes.
  const prevCardRef = useRef<State['nowCard']>(s.nowCard);
  const cardFadeEpochRef = useRef(0);
  const activeFadeRef = useRef(0);
  const [, setCardFadeDone] = useState(0);
  if (prevCardRef.current !== s.nowCard) {
    prevCardRef.current = s.nowCard;
    activeFadeRef.current = prefersReducedMotion() ? 0 : ++cardFadeEpochRef.current;
  }
  const cardDissolve = !preview && !prefersReducedMotion() && activeFadeRef.current > 0;
  useEffect(() => {
    const epoch = activeFadeRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeFadeRef.current = 0;
      setCardFadeDone((n) => n + 1);
      return;
    }
    const t = setTimeout(() => {
      if (activeFadeRef.current === epoch) {
        activeFadeRef.current = 0;
        setCardFadeDone((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [s.nowCard]);
  // Calm in-place reveal for Now open-day <-> End of Day chooser <-> closed-day swaps.
  const dayPhase = closedToday ? 'closed' : endAsk ? 'ask' : 'open';
  const prevDayPhaseRef = useRef(dayPhase);
  const daySwapEpochRef = useRef(0);
  const activeDaySwapRef = useRef(0);
  const [, setDaySwapDone] = useState(0);
  if (prevDayPhaseRef.current !== dayPhase) {
    prevDayPhaseRef.current = dayPhase;
    activeDaySwapRef.current = prefersReducedMotion() ? 0 : ++daySwapEpochRef.current;
  }
  const daySwapIn = !prefersReducedMotion() && activeDaySwapRef.current > 0;
  useEffect(() => {
    const epoch = activeDaySwapRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeDaySwapRef.current = 0;
      setDaySwapDone((n) => n + 1);
      return;
    }
    const t = setTimeout(() => {
      if (activeDaySwapRef.current === epoch) {
        activeDaySwapRef.current = 0;
        setDaySwapDone((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [dayPhase]);
  return (
    <>
      {!preview && driverName && <ActiveDriverStrip name={driverName} onSwitch={lockDriverSession} />}
      {drivingPeeked(s) && <button class="wide" onClick={onExitPeek}>‹ Back to the driving view</button>}
      {snap && !preview && <span class="pv-snapmark" aria-hidden="true" />}
      <CardSwitchCtx.Provider value={<NowCardSwitch value={s.nowCard} />}>
      {timeline ? (
        preview
          ? <PreviewCard s={s} now={now} basis={basis} t={preview.t} cont={preview.cont}
              onCont={(c) => setPv({ t: preview.t, cont: c })}
              onStep={(d) => setPv({ t: previewInBounds(preview.t + d, now) ? preview.t + d : preview.t, cont: preview.cont })}
              onBack={backToNow} onTrack={enterPreview} />
          : ev.driveNow > 0 || !again
          ? <TimelineDrive key={s.nowCard} s={s} now={now} ev={ev} basis={basis} onTrack={onTrack} dissolve={cardDissolve} />
          : <RestHero key={s.nowCard} s={s} now={now} ev={ev} again={again} dissolve={cardDissolve} tail={<TimeAxis from={now} lanes={comebackLanes(s, ev, again, l3?.sbAt ?? null, l3 ? () => openSheet({ kind: 'lever', lever: l3 }) : undefined)} hazard={status === 'ON' || status === 'D'} twin={comebackTwin(ev, again, l3?.sbAt ?? null)} onTrack={onTrack} />} />
      ) : (
        ev.driveNow > 0 || !again
          ? <HeroDrive key={s.nowCard} ev={ev} basis={basis} dissolve={cardDissolve} />
          : <RestHero key={s.nowCard} s={s} now={now} ev={ev} again={again} dissolve={cardDissolve} />
      )}
      </CardSwitchCtx.Provider>
      {/* The scrubber's entry without the picture (the axis is aria-hidden): one plain
          button for a screen reader or a keyboard, into the same preview. */}
      {canPreview && !preview && <button class="vh" onClick={() => enterPreview(now + PREVIEW_STEP_MIN)}>Preview a later time</button>}
      {/* Rail 2: while a preview is up, everything else on Now is inert and dimmed, so a
          real-now number never sits beside a preview number unmarked. The wrapper makes
          no box of its own (display: contents), so the dock's sticky slot is unchanged. */}
      <div class={preview ? 'now-rest pv-dim' : 'now-rest'} inert={preview ? true : undefined}>
      {/* Reimagine: the four clocks sit directly under the answer they explain (dial mode;
          on the Timeline the lanes are the clocks). */}
      {!timeline && <Meters ev={ev} />}
      {/* The one-time Timeline chip (decision C1-A): an existing install — a save holding
          a record — that is still on the dial sees it once, under the hero. Either tap
          answers it for good; the More → Planning switch is the standing way back. */}
      {!timeline && !s.nowCardAsked && (s.segments.length > 0 || s.current !== null) && (
        <div class="newcard">
          <span><b>New:</b> your limits on a timeline</span>
          <span class="newcard-btns">
            <button class="mini primary" onClick={() => setNowCard('timeline')}>Show me</button>
            <button class="mini" onClick={() => setState({ nowCardAsked: true })}>Keep the dial</button>
          </span>
        </div>
      )}
      {timeline && !preview && <LeverChips chips={chips} />}
      {/* M5: never in a preview (and never in the driving view, which does not render NowTab). */}
      {welcome && !preview && <WelcomeBackChip w={welcome} now={now} />}
      {/* Receptionfix Scope 4 item 18: one-time dismissible iOS Safari non-standalone warning. */}
      {!preview && isIosSafariNonStandalone() && !getIosInstallNoteDismissed() && (
        <div class="ios-install-note warnbox small" role="note" data-ios-install-note="1">
          <span>Add Clock 14 to your Home Screen — Safari can erase web-app data after about a week.</span>
          <button type="button" class="mini" data-ios-install-dismiss="1" onClick={() => dismissIosInstallNote()}>Got it</button>
        </div>
      )}
      {/* Receptionfix Scope 2 item 9 & B1 (receptionfix2): prominent ELD screenshot refresh front door.
          Fresh logs launch QuickStartSheet (screenshot mode) to seed; populated logs route into
          DriftSheet (screenshot mode) so a mid-week check compares against the ELD without wiping rows. */}
      {!preview && (
        <button
          type="button"
          class="plan-item eld-shot-cta"
          data-eld-screenshot-btn="1"
          onClick={(e) => {
            if (historyBasis(s, now) === 'fresh') openSheet({ kind: 'quickstart', mode: 'screenshot' });
            else openMorphSheet({ kind: 'drift', mode: 'screenshot' }, e.currentTarget);
          }}
        >
          <span class="plan-icon"><Icon d={I.share} size={24} /></span>
          <span class="plan-text">
            <b>Refresh from ELD screenshot</b>
            <span class="muted small">Snap your ELD clocks screen — read on this phone, never uploaded.</span>
          </span>
          <Icon d={I.next} />
        </button>
      )}
      {/* The record's notices ride under the answer as one-line chips (patch 16, P2): the hero
          leads the screen now — in the cab and in the 3 a.m. review alike, the wrap-up business
          (splitting, ending the day) waits below the number it wraps up. */}
      <Notices ev={ev} now={now} s={s} strip />
      {timeline ? <SplitPairChip ev={ev} /> : <SplitPairLine ev={ev} />}
      {/* Declutter (Lorico, 2026-11-20): the load check lives on Plan only, not Now. */}
      <Card title="Last 24 hours"><Grid segments={allSegments(s, now)} from={now - 1440} to={now} /></Card>
      {/* Navy1 UI overhaul (B3): group post-graph shift actions into one cohesive cab control card
          instead of four mismatched loose buttons, keeping every control, class, and 64px floor intact. */}
      <section class="card shift-actions-card">
        <h2>Shift actions</h2>
        <div class="shift-actions-list">
          {/* The drift check (patch 9): one number from the ELD, compared against the app's own.
              Only on a real record — on the DEMO clock there is no day to compare, and the DEMO
              notice already offers the quick start that creates one. */}
          {historyBasis(s, now) !== 'fresh' && (
            <button class="plan-item" onClick={(e) => openMorphSheet({ kind: 'drift' }, e.currentTarget)}>
              <span class="plan-icon"><Icon d={I.check} size={26} /></span>
              <span class="plan-text"><b>Check against my ELD</b><span class="muted small">One number lines this app up with your ELD.</span></span>
              <Icon d={I.next} />
            </button>
          )}
          {/* Patch 19: the status the driver is in, with the way to fix when it started — the
              after-the-fact door for a tap made late (or early). The Log's live row says
              "change it on Now"; this is where. */}
          {s.current && (
            <button class="rowbtn" onClick={(e) => openMorphSheet({ kind: 'since' }, e.currentTarget)}>
              <span><span class="muted">{segLabel(s.current.status, s.current.note)} since {clock(s.current.since)}</span><br /><b>Fix the start time</b></span>
              <Icon d={I.next} />
            </button>
          )}
          <button class="rowbtn" onClick={(e) => openMorphSheet({ kind: 'exceptions' }, e.currentTarget)}>
            <span><span class="muted">Exceptions this shift</span><br /><b>{active.length ? active.join(' · ') : 'None'}</b></span>
            <Icon d={I.next} />
          </button>
          {/* End my day (patch 13; D19 audit): ONE control once closed (Reopen); asks Off Duty or Sleeper before closing. */}
          {historyBasis(s, now) !== 'fresh' && (closedToday ? (
            <div class={`row undo${daySwapIn ? ' day-swap-in' : ''}`}>
              <span>Day closed · {clock(closedToday.at, false)} · {segLabel(s.current?.status ?? 'OFF', s.current?.note)}</span>
              <button class="mini" onClick={() => reopenDay(now)}>Reopen</button>
            </div>
          ) : endAsk ? (
            <div class={`endday-ask${daySwapIn ? ' day-swap-in' : ''}`} role="group" aria-label="End the day in">
              <p class="endday-q"><b>End the day in…</b></p>
              <div class="row">
                <button class="primary" onClick={() => { setEndAsk(false); endDay(now, 'OFF'); }}>{STATUS_LABEL.OFF}</button>
                <button class="primary" onClick={() => { setEndAsk(false); endDay(now, 'SB'); }}>{STATUS_LABEL.SB}</button>
              </div>
              <button class="link" onClick={() => setEndAsk(false)}>Not yet</button>
            </div>
          ) : (
            <button class={`wide${daySwapIn ? ' day-swap-in' : ''}`} onClick={() => setEndAsk(true)}>End my day</button>
          ))}
        </div>
      </section>
      {/* The engine's shift notes carry their own ⚠; the warnbox shape now supplies it (patch 16, P5), so the baked-in one is dropped here to keep it single. */}
      {warn.map((n, i) => <p key={i} class="warnbox small">{n.replace(/^⚠\s*/, '')}</p>)}
      <StatusDock s={s} />
      </div>
    </>
  );
}

/* ============================================================ driving view */

/**
 * While the status is Driving, Now becomes a glance view: one number, the stop time, one button. A
 * mounted phone is looked at, not read — and federal rules bar a CMV driver from reading text on, or
 * typing into, a device while driving (49 CFR 392.80) — so nothing here needs reading past a word or
 * two, and the only control is the one big button. It turns amber at an hour left and red at zero; at
 * night it uses a coloured frame instead of flooding the cab with light.
 *
 * "Details" shows the normal Now screen until the status next changes.
 */
let peekSince: number | null = null;
export function setDrivingPeek(since: number | null) { peekSince = since; }
/**
 * What the driving view says about sound. Browsers block sound until the page is tapped, so before
 * that it must not claim sound is on (re-check N3: it did, and the alerts were silent).
 */
export function soundNote(alertsOn: boolean, ready: boolean): string {
  if (!alertsOn) return 'alerts off';
  return ready ? 'sound and vibration on' : 'sound is off until you tap the screen once';
}

export function showsDrivingView(s: State): boolean {
  return s.tab === 'now' && s.drivingView && s.current?.status === 'D' && peekSince !== s.current.since;
}

/**
 * Driving, big view on, but the driver has tapped Details. The driving view comes back on its own only
 * when the status next changes — so while the peek is up, Now must offer the way back explicitly.
 * Without this the driver taps Details once and loses the glance screen for the rest of the drive
 * (Lorico, 2026-10-10, on the live preview).
 */
export function drivingPeeked(s: State): boolean {
  return s.tab === 'now' && s.drivingView && s.current?.status === 'D' && peekSince === s.current.since;
}

/** How much of the binding limit is left, 0–1, for the dials on Now and in the driving view. */
function bindingShare(ev: FullEvaluation): number {
  const sh = ev.shift;
  const [left, of] = ev.binding === 'WINDOW_14' ? [sh.windowRemaining, sh.limits.window]
    : ev.binding === 'BREAK_30' ? [sh.breakRemaining, 480]
    : ev.binding === 'CYCLE' ? [ev.cycle.remaining, ev.cycle.limit]
    : [sh.driveRemaining, sh.limits.drive];
  return Math.max(0, Math.min(1, left / of));
}

function DrivingView({ s, now, ev, again, onDetails, enter = false }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain | null; onDetails: () => void; enter?: boolean }) {
  // 'calm', not 'ok': .ok is the app-wide green-text class and turned the whole screen green.
  const level = ev.driveNow <= 0 ? 'bad' : ev.driveNow <= 60 ? 'warn' : 'calm';
  const left = dur(ev.driveNow);
  return (
    <main class={`drive ${level}${enter ? ' drive-enter' : ''}`} aria-live="polite">
      <div class="top-row">
        <span class="pill" style={`--led: ${STATUS_COLOR.D}`}>{segLabel('D', s.current?.note)} · {dur(now - currentRunStart(s, now))}</span>
        <span class="top-right">
          {/* time only: the weekday pushed the row onto two lines next to the capsule and Details */}
          <span class="drive-clock">{s.nowOverride ? `SIM ${clock(now, false)}` : clock(now, false)}</span>
          <button class="drive-details" onClick={onDetails}>Details</button>
        </span>
      </div>
      <div class="drive-body">
        <Sign kind={level === 'bad' ? 'stop' : level === 'warn' ? 'warn' : 'go'}>{level === 'bad' ? 'Out of hours' : level === 'warn' ? 'Under 1 hour' : 'Hours left'}</Sign>
        <Dial share={bindingShare(ev)} hours={bindingHours(ev)} tone={level} size={320} basis={ringBasis(s, now, ev)}>
          <div class="drive-label">{level === 'bad' ? 'Out of driving time' : 'Driving left'}</div>
          <div class={`drive-num ${left.length > 4 ? '' : 'short'}`}>{left}</div>
        </Dial>
        <div class="drive-head">{level === 'bad' ? 'Park as soon as it is safe' : level === 'warn' ? 'Plan where you\u2019ll park' : `Stop by ${clockFull(ev.mustStopBy)}`}</div>
        <div class="drive-why">{level === 'bad' ? `Over the ${alertReason(ev)}` : level === 'warn' ? `Stop by ${clockFull(ev.mustStopBy)} · ${bindingLabel(ev)}` : bindingSentence(ev)}</div>
        {level === 'bad' && again?.off != null && <div class="drive-why">Off duty from now: drive again at <b>{clock(again.off)}</b></div>}
      </div>
      <div class="drive-foot">
        {/* D3 (audit): a Driving tap gets the same 8-second undo as every other status tap —
            a pocket tap of Driving no longer needs a trip to the Log to repair. */}
        <StatusUndoChip drive />
        <div class="drive-note">{s.keepAwake ? 'Screen stays on' : 'Screen may lock'} · {soundNote(s.alertsOn, audioReady())}</div>
        <button class="drive-stop" onClick={(e) => openMorphSheet({ kind: 'status' }, e.currentTarget)}>I've stopped</button>
      </div>
    </main>
  );
}

/* ============================================================ panels */

/**
 * "Start from my ELD clocks" (patch 8): the four clocks the ELD already shows on one screen,
 * typed once — the app builds a starting record from them (store.ts: synthesizeEldSeed) instead
 * of asking a mid-shift driver to rebuild a day the ELD already knows. Manual entry only; the
 * numbers are read the strict way where they disagree, and the adjustments are named on the
 * result step rather than applied in silence.
 *
 * Patch 11 adds a second way into the same boxes: where the browser offers speech
 * recognition, "Say my clocks" walks the four clocks one at a time, each spoken value
 * lands in the boxes, and after the fourth the panel reads all four back (on screen,
 * and aloud where speech synthesis exists) — seeding still takes the driver's tap on
 * "Set my clocks", and cancelling restores the boxes untouched (voiceclocks.ts).
 *
 * Patch 12 adds a third: "Import from a screenshot" reads a screenshot of the ELD's
 * clocks screen on this device (eldocr-run.ts, lazy-loaded on first use) and
 * eldocr.ts (eldocr.ts) decides which of the words found may land in the boxes —
 * confident, label-matched, in-range values only; anything doubtful stays out and
 * is named. The image is never stored or sent anywhere, and seeding still takes
 * the same tap on "Set my clocks".
 */
/**
 * C2 (taste): the actual clocks the seeded record evaluates to (so any strict-reading
 * adjustment prints "6h 20m → 6h 00m" instead of only "came out lower than you typed").
 */
export function eldActualClocks(clocks: EldClocks, evAfter: FullEvaluation, shortHaul: boolean): EldClocks {
  return {
    driveLeft: evAfter.shift.driveRemaining,
    windowLeft: evAfter.shift.windowRemaining,
    breakDueIn: !shortHaul && Number.isFinite(evAfter.shift.breakRemaining)
      ? evAfter.shift.breakRemaining
      : Math.min(LIMITS.BREAK_AFTER, Math.max(0, Math.round(clocks.breakDueIn))),
    cycleLeft: evAfter.cycle.remaining,
  };
}

/** Test-only hook to deterministically exercise OCR screenshot flows in Node DOM tests without loading Tesseract WASM. */
type EldOcrRunner = (file: File) => Promise<{ auto: OcrWord[]; sparse: OcrWord[] }>;
let eldOcrOverrideForTest: EldOcrRunner | null = null;
export function setEldOcrOverrideForTest(fn: EldOcrRunner | null): void { eldOcrOverrideForTest = fn; }

const SEED_UNDO_LABEL = 'Replaced log from ELD clocks';

function QuickStartSheet({ s, now, mode, closing = false }: { s: State; now: number; mode?: 'screenshot'; closing?: boolean }) {
  const isShotMode = mode === 'screenshot';
  const sheetTitle = isShotMode ? 'Refresh from ELD screenshot' : 'Start from my ELD clocks';
  const cyc = cycleParamsOf(s.config);
  const fields: { key: keyof EldClocks; label: string; sub: string; max: number }[] = [
    { key: 'driveLeft', label: 'Drive time left', sub: '11-hour driving clock', max: LIMITS.DRIVE },
    { key: 'windowLeft', label: 'Shift time left', sub: '14-hour window clock', max: LIMITS.WINDOW },
    { key: 'breakDueIn', label: 'Break due in', sub: 'until a 30-minute break is required', max: LIMITS.BREAK_AFTER },
    { key: 'cycleLeft', label: 'Cycle time left', sub: `${cyc.limit / 60}-hour / ${cyc.windowDays}-day clock`, max: cyc.limit },
  ];
  // Text state, like the Slider's box: the driver can clear a box and retype without the value
  // snapping back mid-edit. The boxes open on the full clocks — the DEMO assumption — so a
  // driver whose ELD agrees taps one button; everyone else edits what differs.
  const [txt, setTxt] = useState<Record<string, [string, string]>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, [String(Math.floor(f.max / 60)), String(f.max % 60)]])));
  const [err, setErr] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<{ clocks: EldClocks; count: number } | null>(null);
  const [done, setDone] = useState<{ notes: string[]; clocks: EldClocks; actual: EldClocks; at: number } | null>(null);
  // Voice entry (patch 11): the same four clocks, spoken one at a time into the same
  // boxes. The session itself is pure state (voiceclocks.ts) — this component owns only
  // the microphone and the spoken read-back. Nothing here seeds: accepted values land
  // in the boxes, the driver checks the read-back, and "Set my clocks" below does the
  // seeding, exactly as it does for typed numbers. The button exists only where the
  // browser offers speech recognition — where it does not, there is no dead control.
  const SR = speechRecognitionCtor();
  const [voice, setVoice] = useState<VoiceFlow | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const shotResultRef = useRef<HTMLDivElement | null>(null);
  const voiceResultRef = useRef<HTMLDivElement | null>(null);
  const stopListening = () => {
    try { recogRef.current?.abort(); } catch { /* already stopped */ }
    recogRef.current = null;
    setListening(false);
  };
  const startVoice = () => { setErr(null); setVoiceMsg(null); setVoice(beginVoice(txt)); };
  const cancelVoice = () => {
    if (voice) setTxt(voiceDiscard(voice));
    stopListening();
    setVoice(null);
    setVoiceMsg(null);
  };
  const heard = (transcript: string) => {
    if (!voice || voice.done) return;
    const f = fields[voice.idx];
    const r = parseClockUtterance(transcript, f.max);
    if (r.ok) {
      const a = voiceAccept(voice, txt, f.key, r, fields.length);
      setTxt(a.boxes);
      setVoice(a.flow);
      setVoiceMsg(null);
      if (a.flow.done && speechSynthesisAvailable()) {
        speakAloud(composeReadBack(fields.map((x) => ({
          label: x.label,
          minutes: Number(a.boxes[x.key][0]) * 60 + Number(a.boxes[x.key][1]),
        }))));
      }
      return;
    }
    const v = voiceFailure(voice, txt);
    setTxt(v.boxes);
    setVoice(v.flow);
    if (v.exited) {
      stopListening();
      setVoiceMsg(null);
      setErr('Voice entry stopped — that clock didn’t read twice. The boxes are back as they were; type the clocks, or tap “Say my clocks” to try again.');
    } else {
      setVoiceMsg(r.reason === 'fraction'
        ? `Heard “${transcript}” — that has a fraction in it, and these clocks are whole hours and minutes. Say it like “seven fifteen”.`
        : r.reason === 'range'
          ? `Heard “${transcript}” — that’s more than this clock can hold (${dur(f.max)} at most). Say it again.`
          : `Heard “${transcript}” — that didn’t read as a clock. Say it like “seven fifteen”.`);
    }
  };
  const listen = () => {
    if (!SR || !voice || voice.done) return;
    let rec: SpeechRecognitionLike;
    try { rec = new SR(); } catch { return; }
    recogRef.current = rec;
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const t = e.results?.[0]?.[0]?.transcript ?? '';
      setListening(false);
      if (t) heard(t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  // Screenshot import (patch 12): a third way into the same boxes. The driver picks
  // a screenshot of the ELD's clocks screen; it is read on this device (the reader
  // in eldocr-run.ts loads only on this tap) and eldocr.ts decides what may land:
  // confident, label-matched, in-range values only, written as whole hours and
  // minutes like a typed value. The panel then says, per clock, what was read and
  // what was not. The image is never stored or sent anywhere, nothing here seeds,
  // and a failed read leaves the boxes exactly as they were.
  const [shotBusy, setShotBusy] = useState(false);
  const [shotNote, setShotNote] = useState<string[] | null>(null);
  const [shotErr, setShotErr] = useState<string | null>(null);
  const [eldHelp, setEldHelp] = useState(false);
  const shotRef = useRef<HTMLInputElement | null>(null);
  // A10 (taste): after a screenshot import or voice read-back lands, scroll the sheet so the read-out list is visible.
  useEffect(() => {
    if (shotNote || shotErr) shotResultRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [shotNote, shotErr]);
  useEffect(() => {
    if (voice?.done) voiceResultRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [voice?.done]);
  const importShot = async (file: File) => {
    setShotBusy(true);
    setShotErr(null);
    setShotNote(null);
    setErr(null);
    try {
      const reads = eldOcrOverrideForTest
        ? await eldOcrOverrideForTest(file)
        : await (await import('./eldocr-run.ts')).recognizeEldScreenshot(file);
      const specs = fields.map((f) => ({ key: f.key, max: f.max }));
      const r = mergeExtractions(extractEldClocks(reads.auto, specs), extractEldClocks(reads.sparse, specs));
      setTxt((p) => {
        const next = { ...p };
        for (const f of fields) {
          const got = r.filled[f.key];
          if (got) next[f.key] = [String(Math.floor(got.minutes / 60)), String(got.minutes % 60)];
        }
        return next;
      });
      const notes = fields.map((f) => {
        const got = r.filled[f.key];
        if (got) return `${f.label}: read ${dur(got.minutes)} from the screenshot — check it against your ELD.`;
        const clash = r.disagreed[f.key];
        if (clash) return `${f.label}: the screenshot read two different ways (${dur(clash[0])} and ${dur(clash[1])}) — not used; type it as usual.`;
        return `${f.label}: couldn't read it from the screenshot — the box is as it was; type it as usual.`;
      });
      if (r.unplaced.length > 0) {
        notes.push(`Also found ${r.unplaced.map((m) => dur(m)).join(', ')} but couldn't tell which clock ${r.unplaced.length === 1 ? 'it belongs' : 'they belong'} to — not used.`);
      }
      if (r.rejected > 0) notes.push('Some numbers on the screenshot were too unclear to use.');
      setShotNote(notes);
    } catch {
      setShotErr('That screenshot couldn’t be read. Type the clocks, or try a clearer screenshot of the clocks screen.');
    } finally {
      setShotBusy(false);
    }
  };
  const applySeedNow = (clocks: EldClocks) => {
    const cur = getState();
    const { patch, notes } = applyEldSeed(cur, clocks, now);
    // C2 (taste): compute the actual clocks from the seeded record so adjusted clocks print
    // "6h 20m → 6h 00m", and hold off on forcing Off Duty — the result screen asks for the
    // driver's real status with the four status buttons.
    const seeded: State = { ...cur, ...patch, current: null };
    const evAfter = evaluate(allSegments(seeded, now), { asOf: now, config: safeRulesConfig(cur.config) });
    const actual = eldActualClocks(clocks, evAfter, cur.config.shortHaul);
    // B1 (receptionfix2): wrap every reseed over a non-empty log in undoable(...) so Undo restores all prior rows.
    if (cur.segments.length > 0) {
      undoable(SEED_UNDO_LABEL, () => setState({ ...patch, current: null }));
    } else {
      setState({ ...patch, current: null });
    }
    setReplaceConfirm(null);
    setDone({ notes, clocks, actual, at: now });
  };
  const confirm = () => {
    const clocks = {} as EldClocks;
    for (const f of fields) {
      const [hs, ms] = txt[f.key];
      // Whole numbers only (patch 9.2, store.ts: readEldEntry): a fraction is refused,
      // never rounded — rounding "7.25" hours destroyed 15 minutes here in patch 8.
      const r = readEldEntry(hs, ms);
      if (!r.ok) {
        setErr(r.problem === 'fraction'
          ? `The ${f.label.toLowerCase()} boxes take whole hours only — part of an hour goes in the minutes box (7.25 hours is 7 in the hours box, 15 in the minutes).`
          : `The ${f.label.toLowerCase()} boxes need plain numbers — check them and try again.`);
        return;
      }
      clocks[f.key] = r.minutes;
    }
    const cur = getState();
    // B1 (receptionfix2): belt-and-braces confirmation whenever a reseed would overwrite a populated log.
    if (cur.segments.length > 0) {
      setErr(null);
      setReplaceConfirm({ clocks, count: cur.segments.length });
      return;
    }
    applySeedNow(clocks);
  };
  if (eldHelp) {
    return (
      <Sheet title="Find your ELD screen" focusKey="qs-eld-help" onBack={() => setEldHelp(false)} closing={closing}>
        <EldGuideFlow onDone={() => setEldHelp(false)} />
      </Sheet>
    );
  }
  if (replaceConfirm) {
    const rowWord = replaceConfirm.count === 1 ? 'row' : 'rows';
    return (
      <Sheet title={sheetTitle} focusKey="qs-replace" closing={closing}>
        <div class="warnbox" role="alert" data-qs-replace-confirm="1" tabIndex={-1} data-first>
          <b>This replaces your {replaceConfirm.count} logged {rowWord}.</b>
          <p class="small" style="margin:6px 0 0">Your current log will be replaced with an estimate built from these four ELD clocks. If you only want to line up your log with your ELD without replacing it, use <b>Check against my ELD</b> instead. Undo on the Log restores your prior rows.</p>
        </div>
        <ul class="small">{fields.map((f) => <li key={f.key}>{f.label}: <b>{dur(replaceConfirm.clocks[f.key])}</b></li>)}</ul>
        <div class="row">
          <button class="danger" data-qs-replace-proceed="1" onClick={() => applySeedNow(replaceConfirm.clocks)}>Replace my log &amp; set clocks</button>
          <button class="primary" data-qs-replace-cancel="1" onClick={() => setReplaceConfirm(null)}>Keep my log</button>
        </div>
      </Sheet>
    );
  }
  if (done) {
    const finishStatus = (st: DutyStatus) => {
      unlockAudio();
      const cur = getState();
      const at = done.at;
      const prevUndo = currentUndo();
      setState({ current: { status: st, since: at, createdAt: stamp() } });
      // B1 (receptionfix2): keep the reseed Undo armed after the driver picks their current status.
      if (prevUndo?.label === SEED_UNDO_LABEL) {
        setUndo({ label: prevUndo.label, before: prevUndo.before, after: pick(getState()) });
      }
      openSheet(null);
      const sim = cur.nowOverride !== null;
      if (st !== 'D' && shouldAskSpeech(cur, sim)) {
        setState({ speakAskOpen: true });
      } else if (speechReady(cur, sim)) {
        if (st === 'D') {
          try {
            const post = getState();
            const ev2 = evaluate(allSegments(post, at), { asOf: at, config: safeRulesConfig(post.config) });
            speakAloud(statusSpeech('D', at, ev2.driveNow, ev2.mustStopBy));
          } catch { speakAloud(statusSpeech('D', at)); }
        } else {
          speakAloud(statusSpeech(st, at));
        }
      }
    };
    return (
      <Sheet title={sheetTitle} focusKey="qs-done" closing={closing}>
        <p tabIndex={-1} data-first>Your clocks are set from those four numbers.</p>
        <p class="small">The four clocks:</p>
        <ul class="small">{fields.map((f) => {
          const typed = done.clocks[f.key], got = done.actual[f.key];
          return <li key={f.key}>{f.label}: <b>{got !== typed ? `${dur(typed)} → ${dur(got)}` : dur(got)}</b></li>;
        })}</ul>
        {done.notes.length > 0 ? (
          <>
            <p class="small">Read the strict way, because the numbers disagreed or ran past a limit:</p>
            <ul class="small">{done.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </>
        ) : <p class="small">Nothing had to be adjusted.</p>}
        <p class="trust">The rows this built are marked “Estimate from your ELD clocks” (and drawn dotted) on the Log, and split answers carry an <b>Estimate</b> label until your own entries replace them.</p>
        <h3>What are you doing right now?</h3>
        <div class="big-status">{STATUS_ORDER.map((st) => (
          <button key={st} style={`--led: ${STATUS_COLOR[st]}`} onClick={() => finishStatus(st)}>
            <Icon d={STATUS_ICON[st]} size={26} /><span>{STATUS_LABEL[st]}</span>
          </button>
        ))}</div>
      </Sheet>
    );
  }
  return (
    <Sheet title={sheetTitle} focusKey="qs-form" closing={closing}>
      {/* A10 (taste): focus starts at the top of the sheet (not "Set my clocks" at the bottom) so
          the sheet opens at scrollTop 0 with its grabber and top padding intact, matching every
          other sheet. Order: Import from screenshot → Say my clocks → type the four clocks. */}
      <p class="small" tabIndex={-1} data-first={isShotMode ? undefined : true}>
        {isShotMode
          ? 'Pick a screenshot of your ELD clocks screen — it is read on this phone (never sent anywhere) and fills the four clocks below so you can check and apply them.'
          : 'Import a screenshot, say your clocks, or type the four clocks your ELD shows. The app builds a starting record from them — an estimate that firms up as you log your real day.'}
      </p>
      {!voice && (
        <div class="qs-section" data-eld-ocr-section="1">
          <div class="row">
            <button
              class={isShotMode ? 'primary wide' : 'ghost'}
              data-first={isShotMode ? true : undefined}
              data-eld-choose-shot="1"
              disabled={shotBusy}
              onClick={() => shotRef.current?.click()}
            >
              {shotBusy ? 'Reading screenshot…' : isShotMode ? 'Choose ELD screenshot' : 'Import from a screenshot'}
            </button>
          </div>
          <input type="file" accept="image/*" style="display:none" ref={shotRef}
            onChange={(e) => { const el = e.target as HTMLInputElement; const f = el.files?.[0]; el.value = ''; if (f) void importShot(f); }} />
          <p class="muted small">Pick a screenshot of your ELD's clocks screen. It is read on this phone and thrown away — never sent or saved anywhere.</p>
          <button type="button" class="link eld-help-link" data-eld-help-btn="1" onClick={() => setEldHelp(true)}>Need help finding your log screen?</button>
          {(shotNote || shotErr) && (
            <div ref={shotResultRef} class="qs-result">
              {shotNote && <ul class="small">{shotNote.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {shotErr && <p class="warnbox small">{shotErr}</p>}
            </div>
          )}
        </div>
      )}
      {SR && !voice && (
        <div class="row"><button class="ghost" onClick={startVoice}>Say my clocks</button></div>
      )}
      {SR && voice && !voice.done && (
        <div>
          <p class="muted small">Your voice is turned into text by your browser's speech service — in Chrome the audio goes to Google. Only this does that; your log never leaves this phone.</p>
          <p style="font-size:1.35rem;font-weight:700">{fields[voice.idx].label}</p>
          <p class="small">Tap “Say it”, then say the clock — like “seven fifteen” for 7 hours 15.</p>
          {voiceMsg && <p class="warnbox small">{voiceMsg}</p>}
          <div class="row">
            <button class="primary" disabled={listening} onClick={listen}>{listening ? 'Listening…' : 'Say it'}</button>
            <button class="ghost" onClick={cancelVoice}>Cancel voice entry</button>
          </div>
        </div>
      )}
      {SR && voice && voice.done && (
        <div ref={voiceResultRef} class="qs-result">
          <p><b>Here’s what I heard — check it before you set anything:</b></p>
          <ul class="small">{fields.map((f) => <li key={f.key}>{f.label}: <b>{dur(Number(txt[f.key][0]) * 60 + Number(txt[f.key][1]))}</b></li>)}</ul>
          <p class="small">A wrong number? Fix its box by hand — nothing is set until you tap “Set my clocks”.</p>
          <div class="row"><button class="ghost" onClick={cancelVoice}>Start over</button></div>
        </div>
      )}
      <div class="ed-lab">Or type the four clocks</div>
      <p class="muted small">Whole hours in the hours box — part of an hour goes in the minutes box.</p>
      {fields.map((f) => (
        <div class="qs-row" key={f.key}>
          <span class="qs-label">{f.label}<span class="muted small"> — {f.sub}</span></span>
          <span class="qs-inputs">
            <input type="number" class="num" inputMode="numeric" min={0} aria-label={`${f.label}, hours`} value={txt[f.key][0]}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => ({ ...p, [f.key]: [v, p[f.key][1]] })); }} />
            <span aria-hidden="true">h</span>
            <input type="number" class="num" inputMode="numeric" min={0} aria-label={`${f.label}, minutes`} value={txt[f.key][1]}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => ({ ...p, [f.key]: [p[f.key][0], v] })); }} />
            <span aria-hidden="true">m</span>
          </span>
        </div>
      ))}
      {s.config.shortHaul && <p class="muted small">You're set as break-exempt (short-haul), so the break clock won't bind — type it anyway if your ELD shows one.</p>}
      {err && <p class="warnbox small">{err}</p>}
      <div class="row"><button class="primary" onClick={confirm}>Set my clocks</button></div>
    </Sheet>
  );
}

/**
 * "Check against my ELD" (patch 9): the drift check. Mid-shift the log and the real world
 * quietly drift apart — a fuel-stop drive stretch never got tapped — and every answer the app
 * gives inherits the error. The driver types ONE number, the drive time left his ELD shows,
 * and the app compares it against its own (store.ts: driftCheck). In sync: nothing changes.
 * ELD shows less: the missing driving is named and one tap back-fills it where it belongs
 * (planDriftFill). ELD shows more: no fix is offered — this check never takes driving out of
 * a log; the likely missing break belongs on the Log.
 */
function DriftSheet({ s, now, mode, closing = false }: { s: State; now: number; mode?: 'screenshot'; closing?: boolean }) {
  const isShotMode = mode === 'screenshot';
  const [txt, setTxt] = useState<[string, string]>(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<{ check: DriftComparison; at: number; eld: number } | null>(null);
  const [filled, setFilled] = useState<{ plan: DriftFillPlan; after: DriftComparison } | null>(null);
  const [shotBusy, setShotBusy] = useState(false);
  const [shotNote, setShotNote] = useState<string | null>(null);
  const [shotErr, setShotErr] = useState<string | null>(null);
  const [eldHelp, setEldHelp] = useState(false);
  const shotRef = useRef<HTMLInputElement | null>(null);

  if (eldHelp) {
    return (
      <Sheet title="Find your ELD screen" focusKey="drift-eld-help" onBack={() => setEldHelp(false)} closing={closing}>
        <EldGuideFlow onDone={() => setEldHelp(false)} />
      </Sheet>
    );
  }

  // On the DEMO clock there is no real day to compare against — send the driver to the quick
  // start that creates one instead of running a comparison against assumed numbers.
  if (historyBasis(s, now) === 'fresh') {
    return (
      <Sheet title="Check against my ELD" closing={closing}>
        <p class="small">There's nothing to check yet — this app is still on its demo clock, so there's no real day to compare with your ELD. Start from your ELD clocks first; the check works once your real day is in.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet({ kind: 'quickstart', ...(isShotMode ? { mode: 'screenshot' as const } : {}) })}>Start from my ELD clocks</button></div>
      </Sheet>
    );
  }

  // B1 (receptionfix2): on a populated log, "Refresh from ELD screenshot" reads the screenshot
  // on-device and prefills the drift-compare drive-left boxes — never reseeding or wiping rows.
  const importDriftShot = async (file: File) => {
    setShotBusy(true);
    setShotNote(null);
    setShotErr(null);
    setErr(null);
    try {
      const cyc = cycleParamsOf(s.config);
      const specs = [
        { key: 'driveLeft' as const, max: LIMITS.DRIVE },
        { key: 'windowLeft' as const, max: LIMITS.WINDOW },
        { key: 'breakDueIn' as const, max: LIMITS.BREAK_AFTER },
        { key: 'cycleLeft' as const, max: cyc.limit },
      ];
      const reads = eldOcrOverrideForTest
        ? await eldOcrOverrideForTest(file)
        : await (await import('./eldocr-run.ts')).recognizeEldScreenshot(file);
      const r = mergeExtractions(extractEldClocks(reads.auto, specs), extractEldClocks(reads.sparse, specs));
      const got = r.filled.driveLeft;
      if (got) {
        setTxt([String(Math.floor(got.minutes / 60)), String(got.minutes % 60)]);
        setShotNote(`Drive time left: read ${dur(got.minutes)} from the screenshot — check it against your ELD, then tap Compare.`);
      } else if (r.disagreed.driveLeft) {
        const [a, b] = r.disagreed.driveLeft;
        setShotErr(`The screenshot read Drive time left two different ways (${dur(a)} and ${dur(b)}) — type the drive time left your ELD shows below and tap Compare.`);
      } else {
        setShotErr("Couldn't read drive time left from that screenshot — type the drive time left your ELD shows below and tap Compare.");
      }
    } catch {
      setShotErr("That screenshot couldn't be read — type the drive time left your ELD shows below and tap Compare.");
    } finally {
      setShotBusy(false);
    }
  };

  const compare = () => {
    const [hs, ms] = txt;
    if (hs.trim() === '' && ms.trim() === '') { setErr('Type the drive time left your ELD shows — hours and minutes.'); return; }
    // Whole numbers only (patch 9.2, store.ts: readEldEntry): this parse used to round,
    // and rounding "7.25" hours to 420 turned a correct log into a "missing" verdict
    // whose one-tap fill wrote driving that never happened.
    const r = readEldEntry(hs, ms);
    if (!r.ok) {
      setErr(r.problem === 'fraction'
        ? 'Whole hours in the hours box — part of an hour goes in the minutes box (7.25 hours is 7 in the hours box, 15 in the minutes).'
        : 'The boxes need plain numbers — check them and try again.');
      return;
    }
    const eld = r.minutes;
    setErr(null);
    const cmp = driftCheck(getState(), eld, now);
    setState({ lastEldCheckAt: now });
    setFound({ check: cmp, at: now, eld });
  };

  if (filled && found) {
    const { plan, after } = filled;
    return (
      <Sheet title="Check against my ELD" closing={closing}>
        {after.verdict === 'sync' ? (
          <p><b>Now in sync</b> — drive time left matches your ELD: {dur(after.eldLeft)}.</p>
        ) : (
          <p>Added {dur(plan.filled)} of driving. This app now shows {dur(after.appLeft)} of driving left against your ELD's {dur(after.eldLeft)} — the two still differ, so the rest needs a look in the <b>Log</b>.</p>
        )}
        <p class="small">The added driving is on the Log, marked “{DRIFT_NOTE}” — Undo there takes it back out.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>See my clocks</button></div>
      </Sheet>
    );
  }

  if (found) {
    const { check, at, eld } = found;
    if (check.verdict === 'sync') {
      return (
        <Sheet title="Check against my ELD" closing={closing}>
          <p><b>You're in sync</b> — this app and your ELD agree. Drive time left: {dur(check.appLeft)} either way you read it.</p>
          <p class="small">Your ELD says: <b>{dur(check.eldLeft)}</b> of drive time left.</p>
          <p class="small">Nothing was changed.</p>
          <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>Done</button></div>
        </Sheet>
      );
    }
    if (check.verdict === 'extra') {
      return (
        <Sheet title="Check against my ELD" closing={closing}>
          <p>Your ELD shows <b>{dur(check.gap)} more</b> driving left than this app ({dur(check.eldLeft)} against {dur(check.appLeft)}).</p>
          <p class="small">Your ELD says: <b>{dur(check.eldLeft)}</b> of drive time left.</p>
          <p class="small">This check never takes driving out of a log, so there's no one-tap fix in this direction. The usual reason: a break or an off-duty stretch your ELD counted isn't in the log yet. Add it on the Log and the two will line up.</p>
          <div class="row">
            <button class="primary" data-first onClick={() => { setState({ tab: 'log' }); openSheet(null); }}>Open the Log</button>
            <button onClick={() => openSheet(null)}>Not now</button>
          </div>
        </Sheet>
      );
    }
    const plan = planDriftFill(getState(), -check.gap, at);
    return (
      <Sheet title="Check against my ELD" closing={closing}>
        <p>Your ELD shows <b>{dur(-check.gap)} less</b> driving left than this app — about {dur(-check.gap)} of driving isn't in the log yet. Until it's in, every answer here runs optimistic.</p>
        <p class="small">Your ELD says: <b>{dur(check.eldLeft)}</b> of drive time left.</p>
        {plan && plan.filled > 0 ? (
          <>
            <p class="small">It fits as Driving, {clock(plan.start)} → {clock(plan.end)}, in the unlogged stretch before what you did next{plan.remainder > 0 ? <> — only {dur(plan.filled)} of the {dur(-check.gap)} fits there; the rest needs a look in the Log</> : ''}. It goes on the Log marked “{DRIFT_NOTE}”, and Undo there takes it back out.</p>
            <div class="row">
              <button class="primary" data-first onClick={() => { const r = addDriftFill(eld, at); if (r) setFilled({ plan: r.plan, after: r.after }); }}>Add the missing driving</button>
              <button onClick={() => openSheet(null)}>Not now</button>
            </div>
          </>
        ) : (
          <>
            <p class="small">There's no unlogged stretch in the record to put it in — add the driving on the Log tab instead.</p>
            <div class="row">
              <button class="primary" data-first onClick={() => { setState({ tab: 'log' }); openSheet(null); }}>Open the Log</button>
              <button onClick={() => openSheet(null)}>Not now</button>
            </div>
          </>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet title="Check against my ELD" closing={closing}>
      <div data-drift-sheet="1" data-drift-shot-mode={isShotMode ? '1' : '0'}>
        <p class="small">Your ELD is the official record — this just lines the app up with it. {isShotMode ? 'Pick a screenshot of your ELD clocks screen (or type your drive time left below) to compare against your log without replacing your entries.' : 'Type the drive time left your ELD shows, and the app compares it with its own.'}</p>
        {isShotMode && (
          <div class="qs-section" data-eld-ocr-section="1">
            <div class="row">
              <button
                type="button"
                class="primary wide"
                data-first
                data-eld-choose-shot="1"
                disabled={shotBusy}
                onClick={() => shotRef.current?.click()}
              >
                {shotBusy ? 'Reading screenshot…' : 'Choose ELD screenshot'}
              </button>
            </div>
            <input
              type="file"
              accept="image/*"
              style="display:none"
              ref={shotRef}
              onChange={(e) => { const el = e.target as HTMLInputElement; const f = el.files?.[0]; el.value = ''; if (f) void importDriftShot(f); }}
            />
            <p class="muted small">Read on this phone and thrown away — never sent or saved anywhere. Prefills your drive time left below; your log stays untouched.</p>
            <button type="button" class="link eld-help-link" data-eld-help-btn="1" onClick={() => setEldHelp(true)}>Need help finding your log screen?</button>
            {shotNote && <p class="ok small" data-drift-shot-note="1">{shotNote}</p>}
            {shotErr && <p class="warnbox small" data-drift-shot-err="1">{shotErr}</p>}
          </div>
        )}
        <p class="muted small">Whole hours in the hours box — part of an hour goes in the minutes box.</p>
        <div class="qs-row">
          <span class="qs-label">Drive time left on your ELD<span class="muted small"> — the {LIMITS.DRIVE / 60}-hour driving clock</span></span>
          <span class="qs-inputs">
            <input type="number" class="num" inputMode="numeric" min={0} aria-label="Drive time left on your ELD, hours" data-drift-h="1" value={txt[0]}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => [v, p[1]]); }} />
            <span aria-hidden="true">h</span>
            <input type="number" class="num" inputMode="numeric" min={0} aria-label="Drive time left on your ELD, minutes" data-drift-m="1" value={txt[1]}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => [p[0], v]); }} />
            <span aria-hidden="true">m</span>
          </span>
        </div>
        {err && <p class="warnbox small">{err}</p>}
        <div class="row"><button class="primary" data-first={isShotMode ? undefined : true} data-drift-compare="1" onClick={compare}>Compare</button></div>
      </div>
    </Sheet>
  );
}

function StatusSheet({ s, now, closing = false }: { s: State; now: number; closing?: boolean }) {
  const [ago, setAgo] = useState(0);
  // Patch 19: an exact, typed "minutes ago" beside the presets (the field report's 7 minutes
  // sits between 5 and 15). While the box holds anything it is the answer — a preset tap
  // clears it — and a value that cannot be used (a fraction, or one reaching back to the
  // start of the status being left) blocks the status buttons rather than falling back to
  // some other time the driver did not ask for.
  const [typed, setTyped] = useState('');
  const [blocked, setBlocked] = useState(false);
  const offsets = startOffsets(s, now);
  const typedRead = readMinutesAgo(typed);
  const typedProblem = typedBackdateProblem(s, now, typed);
  const inUse = typed.trim() !== '';
  const agoNow: number | null = !inUse ? ago : typedRead.ok && !typedProblem ? typedRead.minutes : null;
  const pick = (st: DutyStatus, note?: string) => {
    if (agoNow === null) { setBlocked(true); return; }
    tapStatus(st, note, agoNow); openSheet(null);
  };
  const cur = s.current;
  const isOn = (st: DutyStatus, note?: string) => cur?.status === st && (cur?.note ?? undefined) === note;
  return (
    <Sheet title="What are you doing now?" closing={closing}>
      <h3 tabIndex={-1} data-first>When did it start?</h3>
      <div class="toggle" role="group" aria-label="When did it start?">
        {offsets.map((o) => <button key={o.minutes} class={!inUse && ago === o.minutes ? 'on' : ''} aria-pressed={!inUse && ago === o.minutes} disabled={!o.ok} onClick={() => { setAgo(o.minutes); setTyped(''); setBlocked(false); }}>{o.minutes ? `${o.minutes} min ago` : 'Now'}</button>)}
      </div>
      <div class="qs-row">
        <span class="qs-label">Or the exact minutes<span class="muted small"> — whole minutes ago</span></span>
        <span class="qs-inputs">
          <input type="number" class="num" inputMode="numeric" min={0} aria-label="Started this many minutes ago" value={typed}
            onInput={(e) => { setTyped((e.target as HTMLInputElement).value); setBlocked(false); }} />
          <span aria-hidden="true">min ago</span>
        </span>
      </div>
      {typedProblem && <p class="warnbox small" role={blocked ? 'alert' : undefined}>{typedProblem}{blocked ? ' Nothing was changed.' : ''}</p>}
      {agoNow !== null && <p class="muted small">{agoNow ? `Starts at ${clock(now - agoNow)}. Use this when you forgot to tap.` : `Starts at ${clock(now)} — right now.`} Earlier than that? Add it on the <b>Log</b> tab.</p>}
      {/* D4 (audit): the time comes first, the status tap commits — reading top-down the thumb
          passes "When did it start?" on its way to the status. D5: the dock's order (Off ·
          Sleeper · Driving · On), read row by row. */}
      <h3>What are you doing?</h3>
      <div class="big-status">{STATUS_ORDER.map((st) => (
        <button key={st} style={`--led: ${STATUS_COLOR[st]}`} class={isOn(st) ? 'on' : ''} aria-pressed={isOn(st)} onClick={() => pick(st)}>
          <Icon d={STATUS_ICON[st]} size={26} /><span>{STATUS_LABEL[st]}</span>
        </button>
      ))}</div>
      <div class="row">
        <button class={isOn('OFF', 'PC') ? 'on-outline' : ''} aria-pressed={isOn('OFF', 'PC')} onClick={() => pick('OFF', 'PC')}>Personal conveyance</button>
        <button class={isOn('ON', 'YM') ? 'on-outline' : ''} aria-pressed={isOn('ON', 'YM')} onClick={() => pick('ON', 'YM')}>Yard move</button>
      </div>
      {cur && (
        <div class="row">
          <button onClick={(e) => openMorphSheet({ kind: 'since' }, e.currentTarget)}>Still {segLabel(cur.status, cur.note)}? Fix its start time</button>
        </div>
      )}
    </Sheet>
  );
}

/**
 * "Fix the start time" (patch 19): the after-the-fact door. The driver is already in the
 * status; only WHEN it started is wrong (the field report: On Duty tapped seven minutes
 * after the ELD). The editor follows the Log editor's "when" step — day buttons, the big
 * clock, nudge keys, another-day picker — and adds the two exact entries the report asked
 * for: a time of day, and whole minutes ago (a fraction is refused the way the drift check
 * refuses one). Every control moves one draft minute; the store's adjustCurrentStart
 * judges it on every render, so the reason a time cannot be used is on screen before the
 * button is. On apply the panel shows the resulting "since" time.
 */
function SinceSheet({ s, now, done = null, closing = false }: { s: State; now: number; done?: number | null; closing?: boolean }) {
  const cur = s.current;
  const [at, setAt] = useState<number>(cur ? cur.since : now);
  const [err, setErr] = useState<string | null>(null);
  const warnRef = useRef<HTMLDivElement>(null);
  // Patch L1 item 4b: a start at or before the status being left's start, or across another
  // entry, is no longer refused — the panel says what it would absorb and the main button
  // becomes the one explicit confirmation. The other refusals (future, invalid) stand.
  const check = cur ? absorbCurrentStart(s, at, now) : null;
  const unchanged = !cur || at === cur.since;
  const problem = !cur || unchanged || check!.ok ? null : adjustStartProblemText(check!.problem, s, now);
  const absorbed = cur && !problem && !unchanged && check!.ok ? check!.absorbed : [];
  // D8 (audit): the same disclosure as the Log's check step, from the patch this save applies.
  const after: State | null = cur && !problem && !unchanged && check!.ok ? { ...s, ...check!.patch } : null;
  const knock = after ? knockOnLines(s, after, null, absorbed, now, true) : [];
  const effects = after ? consequenceLines(s, after, now) : [];
  // BUG-2026-11-20: routine start-time fixes always move the adjacent entry's end boundary
  // (`knock`), so only genuine warnings (absorbing other entries or bad HOS consequences) drop
  // the apply button out of its sticky bottom slot (A1). Routine fixes keep the confirm button
  // visible in-viewport on all screen heights; when a warning does drop it below, scroll the
  // warning into view.
  const confirm = absorbed.length > 0 || effects.some((e) => e.bad);
  useEffect(() => {
    if (confirm) (warnRef.current?.querySelector?.('.warnbox') as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [confirm]);
  if (!cur) {
    return (
      <Sheet title="Fix the start time" closing={closing}>
        <p class="small">{adjustStartProblemText('none', s, now)}</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>Close</button></div>
      </Sheet>
    );
  }
  const label = segLabel(cur.status, cur.note);
  if (done !== null) {
    return (
      <Sheet title="Fix the start time" focusKey="done" closing={closing}>
        <p><b>Start time fixed — {label} since {clock(done)}</b></p>
        <p class="small">{statusBeingLeft(s) ? 'The entry before it ends at that time now, and every clock has been worked out again from it.' : 'Every clock has been worked out again from it.'}</p>
        <p class="muted small">Undo is on the Log until your next change.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>See my clocks</button></div>
      </Sheet>
    );
  }
  const set = (v: number) => { setAt(v); setErr(null); };
  const apply = () => {
    if (problem || unchanged) return;
    const e = adjustStartNow(at, absorbed.length > 0);
    if (e) setErr(e); else openSheet({ kind: 'since', done: at });
  };
  return (
    <Sheet title="Fix the start time" focusKey="pick" closing={closing}>
      <div class="ed-ctx">
        <span class="dot" style={{ background: STATUS_COLOR[cur.status] }} />
        <span class="ed-ctx-t">{label} since {clock(cur.since)}</span>
        <span />
      </div>
      <Question>When did it really start?</Question>
      {/* D6 (audit): one way in — the picker clock, its day chips and nudge keys. "Minutes
          ago" stays on the status sheet, where it is the natural question. */}
      <ClockPick at={at} set={set} now={now} future={false} say="Started" name="Start time" keys={KEYS_MINUTES} />
      {(problem || err) && <div class="warnbox small">{problem ?? err}</div>}
      <div ref={warnRef} style="display:contents">
        <AbsorbNote absorbed={absorbed} now={now} />
        <KnockOn rows={knock} effects={effects} />
      </div>
      <button class={`primary wide ed-go${confirm ? ' ed-absorb' : ''}`} disabled={!!problem || unchanged} onClick={apply}>{unchanged ? 'Pick the real start time' : absorbed.length ? `Change the others and set start to ${clock(at)}` : `Set start to ${clock(at)}`}</button>
      <p class="muted small ed-foot">Undo is on the Log until your next change.</p>
    </Sheet>
  );
}

/** Each rule's own stop time, if he drove from now without stopping; the earliest one is the answer. */
function WhySheet({ s, now, ev, closing = false }: { s: State; now: number; ev: FullEvaluation; closing?: boolean }) {
  const sh = ev.shift;
  const split = sh.chain.length >= 2;
  const pair = activePair(ev);
  // Patch #3.1: an active exception changes the numbers under a different paragraph —
  // name it beside the base cite, or a 13-hour row next to (a)(3)(i) reads as a contradiction.
  const adv = sh.exceptionKeys.adverse !== null;
  const six = sh.exceptionKeys.sixteen !== null;
  const rows = [
    { key: 'DRIVE_11', name: `${sh.limits.drive / 60}-hour driving`, left: sh.driveRemaining, cite: `49 CFR 395.3(a)(3)(i)${adv ? ' · adverse §395.1(b)(1)' : ''}`,
      text: pair
        ? `You have driven ${dur(sh.driveUsed)} since ${clock(sh.anchor)}, the end of the first rest in your split pair. ${dur(sh.driveRemaining)} more is allowed.`
        : `You have driven ${dur(sh.driveUsed)} since your last 10-hour rest${split ? ' (counting your sleeper split)' : ''}. ${dur(sh.driveRemaining)} more is allowed.` },
    // The time on this row is the LATEST the break can start, not a time it must be finished by, and
    // the break can come any time before it. "After 8 hours of driving you need 30 minutes" next to a
    // bare clock time left a driver asking which (Lorico, 2026-10-10).
    ...(Number.isFinite(sh.breakRemaining) ? [{ key: 'BREAK_30', name: '30-minute break', left: sh.breakRemaining, timeLabel: 'latest start', cite: '49 CFR 395.3(a)(3)(ii)',
      text: `Stop for 30 minutes in a row before your driving adds up to 8 hours. Take it any time before then: off duty, sleeper, or on duty without driving (fueling, an inspection) all count. ${sh.driveSinceBreak > 0 ? `You have driven ${dur(sh.driveSinceBreak)} since your last one.` : 'Your last stop counted, so the 8 hours start when you next drive.'}` }] : []),
    { key: 'WINDOW_14', name: `${sh.limits.window / 60}-hour window`, left: sh.windowRemaining, cite: `49 CFR 395.3(a)(2)${adv ? ' · adverse §395.1(b)(1)' : ''}${six ? ' · 16-hour day §395.1(o)' : ''}`,
      text: `No driving once ${sh.limits.window / 60} hours have passed since your shift started — breaks don't stop it${split ? ', except a qualifying sleeper split' : ''}.` },
    { key: 'CYCLE', name: `${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day cycle`, left: ev.cycle.remaining, cite: `49 CFR 395.3(b)(${ev.cycle.windowDays === 7 ? '1' : '2'})`,
      text: `${dur(ev.cycle.remaining)} left in this ${ev.cycle.windowDays}-day period.` },
  ];
  // Patch #1.1: rule end times carry the full date, like the sheet title above them — a stop
  // after midnight read as today's time when the rows showed weekday + time only. The
  // 'Not today' branch stays: a rule more than a day out does not need a date here.
  const when = (left: number) => (left <= 0 ? 'Now' : left > 1440 ? 'Not today' : clockFull(now + left));
  // Patch 10: the counterfactual — the one change that moves the headline time, computed by the
  // store from the logged record. With what-if rows in play the sheet is explaining a
  // hypothetical, and a lever computed on the real record could mislead — the line is omitted.
  const lever = s.tentative.length === 0 ? whyLever(allSegments(s, now), s.config, now, ev) : null;
  return (
    <Sheet title={ev.driveNow > 0 ? `Why stop by ${clockFull(ev.mustStopBy)}?` : 'Why can’t I drive?'} closing={closing}>
      <p class="sheet-lead">If you drove from now without stopping, each rule would end at its own time. The earliest one is the one that counts.</p>
      {/* The same lanes as the Timeline card, in both modes (audit §2.6): one detailed view.
          Out of time, every end is at or behind now and the wall is gone — the lanes then
          say when each rule ended, which is the sheet's question in that state. */}
      <TimeAxis from={now} lanes={limitsLanes(ev, ringBasis(s, now, ev))} wall={ev.driveNow > 0 ? ev.mustStopBy : null} twin={limitsTwin(ev)} />
      {pair && <p class="small"><b>Split in use:</b> {pairWords(pair)}.</p>}
      <ul class="why">{rows.map((r) => (
        <li key={r.key} class={ev.binding === r.key ? 'on' : ''}>
          <div class="why-head"><b>{r.name}</b><span class="why-time">{'timeLabel' in r && r.left > 0 && r.left <= 1440 && <small>{r.timeLabel}</small>}{when(r.left)}</span></div>
          <div class="small">{r.text}</div>
          <div class="why-cite">{r.cite}</div>
          {ev.binding === r.key && <div class="why-tag">Earliest — this sets your stop time</div>}
        </li>
      ))}</ul>
      {lever?.kind === 'rest' && <p class="trust"><b>What changes it:</b> +{dur(lever.minutes)} {lever.status === 'SB' ? 'in the sleeper' : 'off duty'} → you can drive until {clockFull(lever.stopBy)}.</p>}
      {lever?.kind === 'recap' && <p class="trust"><b>What changes it:</b> your next cycle hours come back {clockFull(lever.at)} — +{dur(lever.dropsOff)} drops off, {dur(lever.available)} available.</p>}
      <p class="muted small">Rules: 49 CFR 395.3. Your ELD is your official record.</p>
      <button class="primary wide" data-first onClick={() => openSheet(null)}>Got it</button>
    </Sheet>
  );
}

function ExceptionsSheet({ ev, closing = false }: { ev: FullEvaluation; closing?: boolean }) {
  const adverseOn = ev.shift.exceptionKeys.adverse !== null;
  const sixteenOn = ev.shift.exceptionKeys.sixteen !== null;
  return (
    <Sheet title="Exceptions this shift" closing={closing}>
      <label class="check"><input type="checkbox" data-first checked={adverseOn} onChange={() => toggleException(ev, 'adverseShifts')} /> Adverse driving conditions — +2h driving and window (§395.1(b)(1))</label>
      <label class="check"><input type="checkbox" checked={sixteenOn} onChange={() => toggleException(ev, 'sixteenHourShifts')} /> 16-hour short-haul day — window to 16h, driving stays 11 (§395.1(o))</label>
      {ev.shift.notes.map((n, i) => <p key={i} class={`small ${n.startsWith('⚠') ? 'warnbox' : 'muted'}`}>{n}</p>)}
      <p class="muted small">Adverse conditions must have been unknown when you were dispatched — snow that was forecast doesn't count. The 16-hour day requires returning to and being released at your normal work reporting location.</p>
      <button class="primary wide" onClick={() => openSheet(null)}>Done</button>
    </Sheet>
  );
}

/* ============================================================ RODS grid */

/**
 * The hour marks for a grid: one per real hour from `from`. A carrier day is 23 or 25 hours long on the
 * days the clocks change; dividing it into 24 equal parts put the marks up to half an hour off the real
 * hours (re-check). With `tz`, the heavy marks fall on 00/06/12/18 of that zone's clock, so they stay
 * on the right hours after the change; without it, every sixth mark from the start.
 */
export function gridTicks(from: number, to: number, tz?: string): { m: number; major: boolean }[] {
  const fmt = tz ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }) : null;
  const out: { m: number; major: boolean }[] = [];
  for (let m = from, i = 0; m <= to; m += 60, i++) {
    const major = fmt ? Number(fmt.format(new Date(m * 60000))) % 6 === 0 : i % 6 === 0;
    out.push({ m, major });
  }
  return out;
}

/**
 * The hour under a major gridline, the way the paper log prints its ruler (reimagine,
 * 2026-11-12): M for midnight, N for noon, the hour between them; a line that does not fall
 * on the hour (the rolling "last 24 hours" view) carries its clock time instead.
 */
export function gridHourLabel(m: number, tz?: string): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz ?? deviceTz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(m * 60000));
  const hh = p.find((x) => x.type === 'hour')?.value ?? '', mm = p.find((x) => x.type === 'minute')?.value ?? '';
  if (mm !== '00') return `${hh}:${mm}`;
  return hh === '00' ? 'M' : hh === '12' ? 'N' : String(Number(hh));
}

function Grid({ segments, from, to, tz, mark }: { segments: Segment[]; from: number; to: number; tz?: string; mark?: { start: number; end: number } }) {
  const rows: DutyStatus[] = ['OFF', 'SB', 'D', 'ON'];
  // Reimagine: 14 more units of height for the hour ruler under the four rows; the rows
  // themselves sit exactly where they did.
  const W = 360, H = 102, left = 34, rowH = 18;
  const x = (m: number) => left + ((Math.min(Math.max(m, from), to) - from) / (to - from)) * (W - left - 4);
  const rowY = (st: DutyStatus) => 12 + rows.indexOf(st) * rowH + 9;
  // The paper log's line is ONE line: where one status hands over to the next, a vertical
  // stroke joins the two rows — the stair-step every driver has drawn with a ruler.
  const shown = segments.filter((s) => s.end > from && s.start < to).slice().sort((a, b) => a.start - b.start);
  const steps = shown.flatMap((s, i) => {
    const prev = shown[i - 1];
    return prev && prev.end === s.start && prev.status !== s.status && s.start > from && s.start < to
      ? [{ at: s.start, y1: rowY(prev.status), y2: rowY(s.status), dashed: !!(s.tentative || prev.tentative || s.note === ELD_SEED_NOTE || prev.note === ELD_SEED_NOTE) }]
      : [];
  });
  const ticks = gridTicks(from, to, tz);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="grid">
      {rows.map((r, i) => <g key={r}><text x={2} y={12 + i * rowH + 8} class="grid-label">{r}</text><line x1={left} x2={W - 4} y1={12 + i * rowH + 9} y2={12 + i * rowH + 9} class="grid-line" /></g>)}
      {ticks.map((t, i) => <line key={i} x1={x(t.m)} x2={x(t.m)} y1={10} y2={82} class={t.major ? 'grid-tick major' : 'grid-tick'} />)}
      {ticks.filter((t) => t.major).map((t, i) => <text key={`h${i}`} x={x(t.m)} y={97} text-anchor={x(t.m) > W - 20 ? 'end' : x(t.m) < left + 8 ? 'start' : 'middle'} class="grid-hour">{gridHourLabel(t.m, tz)}</text>)}
      {steps.map((st, i) => <line key={`s${i}`} class="grid-step" x1={x(st.at)} x2={x(st.at)} y1={st.y1} y2={st.y2} stroke-dasharray={st.dashed ? '3 3' : undefined} />)}
      {segments.filter((s) => s.end > from && s.start < to).map((s, i) => {
        const y = 12 + rows.indexOf(s.status) * rowH + 9;
        return <line key={i} class={`s-${s.status}`} x1={x(s.start)} x2={x(s.end)} y1={y} y2={y} stroke-width={6} stroke-dasharray={s.tentative ? '4 3' : s.note === ELD_SEED_NOTE ? '2 2' : undefined} />;
      })}
      {mark && mark.end > from && mark.start < to && <rect class="grid-mark" x={x(mark.start) - 2} y={6} width={Math.max(4, x(mark.end) - x(mark.start) + 4)} height={74} rx={3} />}
    </svg>
  );
}

/* ============================================================ Log tab */

/**
 * One level of undo for the Log: the state before the last edit, delete, add or start-over. Module
 * state, because the edit panel lives outside the Log screen (behind a panel, the screen is inert).
 *
 * An undo is only offered while the log is exactly as that action left it. Restoring a whole snapshot
 * after anything else has changed the record (a status tap on Now closing a row, another add) would
 * throw that later change away without a word (re-check N2), so any other change retires the undo.
 */
type Saved = Pick<State, 'segments' | 'tentative' | 'current' | 'historyAcknowledged' | 'dayCloses'>;
type Undo = { label: string; before: Saved; after: Saved };
const UNDO_KEY = 'hos-sandbox-undo-v1';
let undoNow: Undo | null = null;
/** True when undoNow was restored from storage at launch: its snapshot was re-read, so its arrays are new objects and identity cannot vouch for it (see currentUndo). */
let undoRestored = false;
const undoSubs = new Set<() => void>();
function setUndo(u: Undo | null) {
  undoNow = u; undoRestored = false;
  // The offer is persisted too: a driver who deletes an entry and has the app closed on him — the
  // phone restarted, the PWA swiped away — before he reconsiders has not lost the way back. Storage
  // failing (full, blocked) leaves the in-session undo working exactly as before.
  const raw = u ? JSON.stringify(u) : null;
  try {
    if (raw) localStorage.setItem(UNDO_KEY, raw); else localStorage.removeItem(UNDO_KEY);
  } catch { /* the undo still works for this session */ }
  syncActiveUndoRaw(raw);
  undoSubs.forEach((f) => f());
}
/**
 * What a launch does with the stored undo (exported so tests can exercise it without a reload).
 * A damaged stored undo is dropped, never fatal.
 */
/** A stored undo snapshot is trusted only when both halves would survive the record's own checks. */
const storedClosesOk = (v: unknown): boolean => v === undefined
  || (Array.isArray(v) && v.every((c) => !!c && typeof c === 'object' && Number.isFinite((c as { dayStart?: unknown }).dayStart) && Number.isFinite((c as { at?: unknown }).at)));
const savedSnapOk = (v: unknown): boolean => storedSnapOk(v) && storedClosesOk((v as SimSnap).dayCloses);
export function restoreUndo(raw: string | null) {
  undoNow = null; undoRestored = false;
  if (!raw) return;
  try {
    const u = JSON.parse(raw) as Undo;
    // Shape alone is not enough (break-test lead #4): the snapshots were restored unchecked,
    // so a stored undo carrying a non-string note or an undateable row put the crash class
    // #7/#8 fixed for saves straight back into the live record through Undo. Both snapshots
    // now have to pass the same row checks a sim snapshot does, or the offer is dropped.
    if (u && typeof u.label === 'string' && savedSnapOk(u.before) && savedSnapOk(u.after)) { undoNow = u; undoRestored = true; }
  } catch { /* dropped */ }
}
try { restoreUndo(localStorage.getItem(UNDO_KEY)); } catch { /* no storage at launch: nothing to restore */ }
// A sim snapshot (patch 15) only means anything while its simulated clock is up: a launch on
// the real clock means that episode ended without the restore path (an erase, a damaged save
// falling back to a clean record), the record on disk is the real one, and the leftover
// snapshot is stale by definition — drop it rather than let a later episode restore it.
try { if (getState().nowOverride === null) localStorage.removeItem(SIM_KEY); } catch { /* ignore */ }
const pick = (s: State): Saved => ({ segments: s.segments, tentative: s.tentative, current: s.current, historyAcknowledged: s.historyAcknowledged, dayCloses: s.dayCloses });
/** A record and a snapshot reading the same, field by field — the restored undo's only possible check. */
const sameSaved = (s: State, a: Saved): boolean =>
  JSON.stringify(s.segments) === JSON.stringify(a.segments)
  && JSON.stringify(s.tentative) === JSON.stringify(a.tentative)
  && JSON.stringify(s.current ?? null) === JSON.stringify(a.current ?? null)
  // A stored undo from before patch 13 has no bookmark list in its snapshot; it reads as empty.
  && JSON.stringify(s.dayCloses ?? []) === JSON.stringify(a.dayCloses ?? []);
/** The pending undo, or null once the record has changed since (compared by identity: every change makes new arrays). */
export function currentUndo(): Undo | null {
  if (!undoNow) return null;
  const s = getState(), a = undoNow.after;
  if (s.segments === a.segments && s.tentative === a.tentative && s.current === a.current) return undoNow;
  // A restored undo's snapshot was re-read from storage, so identity is gone: it stands only while
  // the record still reads exactly as the action left it, compared by value.
  if (undoRestored && sameSaved(s, a)) return undoNow;
  if (undoRestored) {
    try { localStorage.removeItem(UNDO_KEY); } catch { /* ignore */ }
    syncActiveUndoRaw(null);
  }
  undoNow = null; undoRestored = false;
  return null;
}
function useUndo(): Undo | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); undoSubs.add(f); return () => { undoSubs.delete(f); }; }, []);
  return currentUndo();
}
/** Put the record back as it was before the action. Refused (returns false) if anything changed since. */
export function undoLast(): boolean {
  const u = currentUndo();
  if (!u) { setUndo(null); return false; }
  if (u.after.current?.status === 'D' && u.before.current?.status === 'D' && peekSince === u.after.current.since) {
    setDrivingPeek(u.before.current.since);
  }
  setState({ ...u.before });
  setUndo(null);
  return true;
}
const describe = (seg: Segment) => `${segLabel(seg.status, seg.note)} ${clock(seg.start)} → ${clock(seg.end)}`;
/** Run a change to the record and make it undo-able. */
function undoable(label: string, change: () => void) {
  const before = pick(getState());
  change();
  setUndo({ label, before, after: pick(getState()) });
}
/** Save an edited entry; returns a reason it was refused, or null. Undo-able from the Log. */
export function saveEntry(seg: Segment, next: { status: DutyStatus; start: number; end: number; note?: string }, now: number): string | null {
  if (next.end <= next.start) return 'End must be after start.';
  // "Only up to now" is a rule for logged time. A what-if row is a plan, and a plan is in the future;
  // applying the rule to it meant a what-if could only ever be deleted (re-check N5).
  if (!seg.tentative && next.end > now) return `End is after now (${clock(now)}). Logged time can only run up to now.`;
  // ...but a plan must not reach BACK into logged time either. A what-if row is drawn last in the
  // resolved timeline on purpose (a plan must never be silently overwritten by the history it overlaps),
  // so a what-if moved into the past masks the logged driving underneath it and every clock is then read
  // off the plan instead of the record: 6h of logged driving disappeared, "You can drive" went 5h -> 8h
  // and the week 63h -> 69h left (a tester, re-check 2, R1). N5 still holds: a what-if inside the
  // future is editable.
  if (seg.tentative && next.start < now) return `A what-if plan can only cover time from now on (${clock(now)}). Pushing it back would hide logged time — edit the logged entry instead.`;
  // The label: the one the panel picked, else the row's own, and only while it fits the status.
  const picked = 'note' in next ? next.note : seg.note;
  const fixed = { status: next.status, start: next.start, end: next.end, note: noteFits(picked, next.status) ? picked : undefined };
  // Patch L1 item 4: the corrected entry ABSORBS whatever it now covers (placeEntry), so the
  // saved log never holds two entries for one minute. The panel shows what that trims and asks
  // for one confirmation before it calls this (CheckStep).
  undoable(editedLabel(seg, fixed), () => setState((cur) => placeEntry(cur, editedRow(seg, fixed), seg, now).patch));
  return null;
}
/**
 * D10 (audit): the undo line after an edit leads with the NEW entry and says the old one as
 * "was" — "Edited On Duty 19:20 → 20:10" read as the new value at a glance.
 */
export function editedLabel(seg: Segment, fixed: { status: DutyStatus; start: number; end: number; note?: string }): string {
  const sameName = segLabel(seg.status, seg.note) === segLabel(fixed.status, fixed.note);
  return `Changed to ${segLabel(fixed.status, fixed.note)} ${clock(fixed.start)} → ${clock(fixed.end)} · was ${sameName ? '' : segLabel(seg.status, seg.note) + ' '}${clock(seg.start)} → ${clock(seg.end)}`;
}
/** The corrected row as the store will hold it: an edit is a new entry, stamped so it wins (applySegmentEdit's rule). */
function editedRow(seg: Segment, fixed: Partial<Segment>): Segment {
  return { ...seg, ...fixed, createdAt: stamp() };
}
/** Delete an entry. Undo-able from the Log. */
export function deleteEntry(seg: Segment) {
  undoable(`Deleted ${describe(seg)}`, () => setState((cur) => ({ segments: cur.segments.filter((x) => x !== seg), tentative: cur.tentative.filter((x) => x !== seg) })));
}
/** Add a forgotten entry; returns a reason it was refused, or null. Undo-able from the Log. */
export function addEntry(status: DutyStatus, start: number, end: number, now: number, note?: string): string | null {
  if (end <= start) return 'End must be after start.';
  if (end > now) return `End is after now (${clock(now)}). This log is for time that has happened — use Plan to look ahead, or tap your status on Now when it changes.`;
  const row: Segment = { status, start, end, createdAt: stamp(), ...(note ? { note } : {}) };
  // Item 4a: a back-filled entry absorbs what it covers — never saved as an overlap.
  undoable(`Added ${describe(row)}`, () => setState((cur) => placeEntry(cur, row, null, now).patch));
  return null;
}
/** The open status, materialised as a row up to now — what the Log's live entry edits (item 1). */
export function liveSeg(s: Pick<State, 'current'>, now: number): Segment | null {
  const c = s.current;
  if (!c) return null;
  return { status: c.status, start: c.since, end: Math.max(now, c.since), ...(c.note ? { note: c.note } : {}), ...(c.createdAt !== undefined ? { createdAt: c.createdAt } : {}) };
}
/** "It wasn't …" on the live entry: the open status relabelled, its start kept. Undo-able. */
export function restatusCurrent(status: DutyStatus, note?: string): void {
  const c = getState().current;
  if (!c) return;
  const fits = noteFits(note, status) ? note : undefined;
  undoable(`${segLabel(status, fits)} since ${clock(c.since, false)}`, () => setState((cur) => (cur.current ? { current: { status, since: cur.current.since, ...(fits ? { note: fits } : {}), ...(cur.current.createdAt !== undefined ? { createdAt: cur.current.createdAt } : {}) } } : {})));
}
/** "It never happened" on the live entry: the status before it is open again. Undo-able. */
export function dropCurrent(): boolean {
  const p = dropCurrentPatch(getState());
  if (!p) return false;
  const c = getState().current!;
  undoable(`Deleted ${segLabel(c.status, c.note)} since ${clock(c.since)}`, () => setState((cur) => dropCurrentPatch(cur) ?? {}));
  return true;
}
/**
 * Add the driving a drift check found missing, as one ordinary row on the Log (patch 9).
 * Undo-able like any other add. Refused — returns null — unless the comparison says driving
 * is missing AND an unlogged stretch can take some of it: the check never writes in the
 * "ELD shows more" direction, and never writes at all when the two already agree.
 */
export function addDriftFill(eldLeftMin: number, now: number): { row: Segment; plan: DriftFillPlan; check: DriftComparison; after: DriftComparison } | null {
  const check = driftCheck(getState(), eldLeftMin, now);
  if (check.verdict !== 'missing') return null;
  const plan = planDriftFill(getState(), -check.gap, now);
  if (!plan || plan.filled <= 0) return null;
  const row: Segment = { status: 'D', start: plan.start, end: plan.end, note: DRIFT_NOTE, createdAt: stamp() };
  undoable(`Added ${describe(row)}`, () => setState((cur) => ({ segments: [...cur.segments, row], lastEldCheckAt: now })));
  return { row, plan, check, after: driftCheck(getState(), eldLeftMin, now) };
}
/** Replace the whole record with a fresh 10-hour rest ending now. Undo-able from the Log. */
export function startOver(now: number) {
  undoable('Started over with a fresh 10-hour rest', () => setState(() => ({ segments: [{ status: 'OFF', start: now - 600, end: now }], tentative: [], current: { status: 'ON', since: now, createdAt: stamp() }, historyAcknowledged: true, dayCloses: [] })));
}
/**
 * "End my day" (patch 13): one undoable close of the day — the open status ends at the tap,
 * OFF duty opens, and the day-close bookmark is recorded, all in the store's one patch, so a
 * single Undo restores the segments, the current status and the bookmark together. Tapping
 * while the day already stands closed does nothing at all — no state change, no undo entry.
 */
export function endDay(now: number, as: 'OFF' | 'SB' = 'OFF') {
  if (!dayClosePatch(getState(), now)) return;
  undoable('Closed the day', () => setState((cur) => endDayPatch(cur, now, as) ?? {}));
}
/**
 * D19 (audit): the close in the status the driver actually ends the day in. The store's
 * dayClosePatch is the close (bookmark + Off Duty); for Sleeper the same tap moment opens
 * Sleeper instead, through the same pure statusTap — so the bookmark, the closed row and the
 * new status are still one patch and one undo. Store functions only composed, never changed.
 */
export function endDayPatch(cur: State, now: number, as: 'OFF' | 'SB'): Partial<State> | null {
  const p = dayClosePatch(cur, now);
  if (!p || as === 'OFF') return p;
  return { ...(statusTap(cur, 'SB', undefined, now) ?? {}), dayCloses: p.dayCloses };
}
/**
 * "Reopen" (patch 13): clears today's day-close bookmark and only the bookmark — the segment
 * the close wrote and the OFF status it opened stay exactly as they are. Undoable like the
 * close, through the same machinery.
 */
export function reopenDay(now: number) {
  if (!reopenDayPatch(getState(), now)) return;
  undoable('Reopened the day', () => setState((cur) => reopenDayPatch(cur, now) ?? {}));
}

/** The carrier day `back` days before the one holding `now`: [start, end) in epoch minutes. */
function carrierDay(now: number, back: number, s: State): { start: number; end: number } {
  const cfg = safeRulesConfig(s.config);
  let start = carrierDayStart(now, cfg);
  for (let i = 0; i < back; i++) start = carrierDayStart(start - 1, cfg);
  return { start, end: nextCarrierDayStart(start, cfg) };
}

/**
 * The Log (redesign 3/5): one carrier day at a time, on the four-line grid drivers know from paper
 * logs and ELDs, with that day's totals and its entries as full-width rows. A row is one tap to an
 * edit panel — the small Edit and × buttons (25×28px) are gone, and delete lives inside the panel,
 * with undo. The resolved timeline and the overlap and violation reports are unchanged.
 */
function LogTab({ s, now, ev, notices }: { s: State; now: number; ev: FullEvaluation; notices?: ComponentChildren }) {
  const [back, setBack] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo?.(0, 0); }, [back]);
  const openEditSheet = useSheet();
  const morphSourceKey = openEditSheet?.kind === 'edit' && activeMorphOrigin?.mode === 'log' ? activeMorphOrigin.key ?? null : null;
  const logViewKey = `${back}:${s.logResolved ? 1 : 0}`;
  const prevLogViewRef = useRef(logViewKey);
  const logSwapEpochRef = useRef(0);
  const activeLogSwapRef = useRef(0);
  const [, setLogSwapDone] = useState(0);
  if (prevLogViewRef.current !== logViewKey) {
    prevLogViewRef.current = logViewKey;
    activeLogSwapRef.current = prefersReducedMotion() ? 0 : ++logSwapEpochRef.current;
  }
  const logSwapIn = !prefersReducedMotion() && activeLogSwapRef.current > 0;
  useEffect(() => {
    const epoch = activeLogSwapRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeLogSwapRef.current = 0;
      setLogSwapDone((n) => n + 1);
      return;
    }
    const t = setTimeout(() => {
      if (activeLogSwapRef.current === epoch) {
        activeLogSwapRef.current = 0;
        setLogSwapDone((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [logViewKey]);
  const day = carrierDay(now, back, s);
  const earliest = Math.min(now, ...s.segments.map((x) => x.start), ...s.tentative.map((x) => x.start));
  const canBack = day.start > earliest;
  // The carrier day is the TERMINAL's day, so its date is read in the terminal zone. Read in the phone's
  // zone, a terminal east of the phone showed Saturday as "Fri, Oct 9" (re-check N6).
  const dayName = new Date(day.start * 60000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: s.config.timeZone });
  const twoZones = s.config.timeZone !== deviceTz;

  /**
   * Overlapping raw entries. The engine resolves them (a later entry wins over the range it
   * covers, and the earlier one is split), so the clocks can disagree with the rows below.
   * Say so, rather than letting a 6h row sit next to a 5h calculation.
   */
  const overlaps: Segment[] = [];
  {
    const list = [...s.segments, ...s.tentative].filter((x) => x.end > x.start).sort((a, b) => a.start - b.start || a.end - b.end);
    let covered = -Infinity;
    for (const x of list) {
      if (x.start < covered) overlaps.push(x);
      covered = Math.max(covered, x.end);
    }
  }

  const showResolved = s.logResolved;
  const setShowResolved = (v: boolean) => setState({ logResolved: v });
  /**
   * The timeline the clocks actually use: overlaps already resolved, and the live "current" status
   * materialized. Read-only — the rows in edit mode stay the record the driver typed.
   *
   * Resolved but NOT merged, then joined on the LABEL: the engine's merge joins touching rows of one
   * status and keeps the first row's note, so a personal-conveyance row followed by plain off duty
   * displayed as a single "PC" row running to now — the clocks were right, the label was not, and it
   * overstated PC time on the driver's own log (cover-note §6, round 5).
   */
  const resolved = joinDisplayRows(normalize(allSegments(s, now), { merge: false }));
  const totals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
  for (const x of resolved) totals[x.status] += x.end - x.start;
  // The shown day's totals, from the same resolved timeline, clipped to the day and to now.
  const dayTotals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
  for (const x of resolved) if (!x.tentative) dayTotals[x.status] += Math.max(0, Math.min(x.end, day.end, now) - Math.max(x.start, day.start));
  const dayRows = [...s.segments, ...s.tentative].filter((x) => x.end > day.start && x.start < day.end).sort((a, b) => b.start - a.start);
  // Gemini round, item A: the open entry is a row of this list whenever it is drawn (same gate
  // as the row below), so the title counts it too — "Entries on this day (0)" sat over a live row.
  const liveRow = !!(s.current && s.current.since < day.end && back === 0);
  const entryCount = dayRows.length + (liveRow ? 1 : 0);
  // P2 (audit): the holes between logged rows on this day, said in the list where they are.
  const holes = logHoles(s, now, day.start, day.end);
  const listed: ({ seg: Segment } | { g: { start: number; end: number } })[] = [...dayRows.map((seg) => ({ seg })), ...holes.map((g) => ({ g }))]
    .sort((a, b) => ('g' in b ? b.g.start : b.seg.start) - ('g' in a ? a.g.start : a.seg.start));

  return (
    <>
      <div class="log-pin">
        <div class="daynav">
          <button class="icon-btn" aria-label="Previous day" disabled={!canBack} onClick={() => setBack(back + 1)}><Icon d={I.back} /></button>
          <div class="daynav-title"><b>{back === 0 ? `Today, ${dayName}` : dayName}</b><span class="muted small">Carrier day from {formatDayStartHM(s.config)}{twoZones ? <> {s.config.timeZone} · {clock(day.start)} on this phone</> : null}</span></div>
          <button class="icon-btn" aria-label="Next day" disabled={back === 0} onClick={() => setBack(back - 1)}><Icon d={I.next} /></button>
        </div>
        <p class="muted small log-scratchpad-note" data-log-scratchpad="1">Planning scratchpad — your ELD is the record.</p>
        <section class="card log-graph-card">
          {/* The resolved timeline, as the clocks read it: drawn raw, a break added inside a drive showed the
              drive running straight through it, on top of the break (log editor redesign, 2026-10-13). */}
          <Grid segments={resolved} from={day.start} to={day.end} tz={s.config.timeZone} />
          <div class="daytotals">
            {(['D', 'ON', 'OFF', 'SB'] as DutyStatus[]).map((k) => <div key={k} style={`--led: ${STATUS_COLOR[k]}`}><span class="muted small">{STATUS_LABEL[k]}</span><b>{dur(dayTotals[k])}</b></div>)}
          </div>
        </section>
      </div>
      <div class="log-scroll" ref={scrollRef}>
        {notices}
        {overlaps.length > 0 && (
          <div class="warnbox">
            <b>These entries overlap.</b> The later entry wins over the time it covers and the earlier one is split — so the clocks count the day without double-counting, which can be less than the rows below appear to add up to.
            <ul class="seglist">{overlaps.map((seg, i) => (
              <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
            ))}</ul>
          </div>
        )}
        <Card title={showResolved ? `What the clocks count (${resolved.length})` : `Entries on this day (${entryCount})`}>
          <div class="row">
            <button class={showResolved ? 'on-outline' : ''} onClick={() => setShowResolved(!showResolved)}>{showResolved ? '← Back to entries' : 'See what the clocks count'}</button>
          </div>
          {showResolved ? (
            <div key="resolved" class={logSwapIn ? 'log-swap-in' : undefined}>
              <p class="muted small">Oldest first — this is what the clocks actually count across your whole log, with any overlaps settled and your current status included. Read-only; go back to entries to change anything.</p>
              <ul class="seglist">{resolved.map((seg, i) => (
                <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
              ))}
              {s.current && now <= s.current.since && (
                <li><span class="dot" style={{ background: STATUS_COLOR[s.current.status] }} /><span>{segLabel(s.current.status, s.current.note)}</span><span class="muted">since {clock(s.current.since)} · just started</span></li>
              )}</ul>
              <p class="small">Driving <b>{dur(totals.D)}</b> · On duty <b>{dur(totals.ON)}</b> · Off duty <b>{dur(totals.OFF)}</b> · Sleeper <b>{dur(totals.SB)}</b></p>
              <p class="muted small">Set your current status on the Now screen to keep this timeline moving.</p>
            </div>
          ) : (
            <div key={`day-${back}`} class={logSwapIn ? 'log-swap-in' : undefined}>
              {liveRow && s.current && (
                /* Patch L1 item 1: the open entry is edited like every other row — same panel, same steps. */
                <button class={`entry live${morphSourceKey === 'live' ? ' is-morph-source' : ''}`} aria-label={`Edit ${segLabel(s.current.status, s.current.note)} since ${clock(s.current.since)}, now`} data-entry-key="live" onClick={(e) => openLogEntryEditor({ kind: 'edit', seg: liveSeg(s, now)!, live: true }, 'live', e.currentTarget)}>
                  <span class="dot" style={{ background: STATUS_COLOR[s.current.status] }} />
                  <span><b class="entry-title-row">{segLabel(s.current.status, s.current.note)} <span class="live-badge" data-status-label="1">● LIVE</span></b><span class="muted small">since {clock(s.current.since)} · now — tap to fix it</span></span>
                  <span class="entry-len">{dur(Math.max(0, now - s.current.since))}</span>
                  <Icon d={I.next} size={18} />
                </button>
              )}
              {listed.map((it, i) => 'g' in it ? <HoleRow key={`h${it.g.start}`} g={it.g} /> : (() => { const seg = it.seg; const ek = logEntryKey(seg); return (
                <button key={i} class={`entry${morphSourceKey === ek ? ' is-morph-source' : ''}`} aria-label={`Edit ${seg.tentative ? 'what-if ' : ''}${describe(seg)}`} data-entry-key={ek} onClick={(e) => openLogEntryEditor({ kind: 'edit', seg }, ek, e.currentTarget)}>
                  <span class={seg.note === ELD_SEED_NOTE ? 'dot eld-dot' : 'dot'} style={{ background: STATUS_COLOR[seg.status], color: STATUS_COLOR[seg.status] }} />
                  <span><b>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</b><span class="muted small">{clock(seg.start)} → {clock(seg.end)}</span>
                    {/* D11 (audit): the quick start's rows say where they came from — an estimate
                        built from the four ELD clocks, not a day the driver logged. */}
                    {seg.note === ELD_SEED_NOTE && <span class="eld-tag">Estimate from your ELD clocks</span>}</span>
                  <span class="entry-len">{dur(seg.end - seg.start)}</span>
                  <Icon d={I.next} size={18} />
                </button>
              ); })())}
              {!dayRows.length && !(s.current && back === 0) && <p class="muted">Nothing logged on this day.</p>}
            </div>
          )}
        </Card>
        <Card title="Violations in your log"><ViolationList items={ev.violations.filter((v) => !v.tentative)} /></Card>
        {ev.violations.some((v) => v.tentative) && (
          <Card title="This plan would violate" tone="warn" statusBadge={{ tone: 'warn', label: '⚠ What-if' }}>
            <p class="muted small">These come from the what-if rows you placed, not from duty you have logged. Nothing here has happened yet.</p>
            <ViolationList items={ev.violations.filter((v) => v.tentative)} />
          </Card>
        )}
      </div>
      <div class="log-foot">
        <button class="addbtn" onClick={() => openSheet(back === 0 ? { kind: 'add' } : { kind: 'add', day: day.start + 720 })}><Icon d={I.plus} /> Add a break or something I forgot</button>
      </div>
    </>
  );
}

/* ============================================================ the log editor */

/**
 * The Log's editor (redesign, 2026-10-13; a tester: "the log editor is very confusing"). The old panel put
 * every choice on one screen: four statuses, break buttons, two extra labels, then a start AND an end, each
 * with its own steppers and a date picker, and "Start over" one tap from Add. A driver who is not at ease
 * with phones had to work out which of those mattered.
 *
 * Now it asks one question per screen, in the driver's words:
 *   1. What were you doing?   one tap moves on
 *   2. When did it start?     a day, then a big clock with hour and minute keys
 *   3. How long?              common lengths, then fine adjust (a break button already knows, and skips it)
 *   4. Check and add          the day with the entry in it, and what it does to entries already there
 * Tapping an entry asks what is wrong with it instead of showing every field at once.
 *
 * The whole flow lives in the open panel's descriptor (SheetKind): each step is openSheet() with the next
 * step and the draft, so every screen renders from data (the tests open any step directly), and the phone's
 * Back steps back through it instead of throwing the entry away (sheetBack).
 */
export type EdStep = 'menu' | 'what' | 'when' | 'long' | 'check';
/** An entry being made or fixed: what, when it started, how long. `fixedLen` marks a break button's length. */
export interface Draft { status: DutyStatus; note?: string; start: number; len: number; fixedLen?: boolean }

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const round5 = (m: number) => Math.floor(m / 5) * 5;
/** `min`'s time of day on the calendar day holding `day` (device-local, as every clock in the app is). */
/**
 * P2 (audit): the unlogged stretches between logged rows (and before the open status) that
 * fall on [from, to) — what a deleted row leaves behind. Display only: it reads the record,
 * changes nothing, and says what the app already says on Now ("Unlogged time is being counted
 * as off duty") — no rule is decided here.
 */
export function logHoles(s: Pick<State, 'segments' | 'current'>, now: number, from: number, to: number): { start: number; end: number }[] {
  const rows = s.segments.filter((x) => !x.tentative).map((x) => ({ start: x.start, end: x.end }));
  if (s.current) rows.push({ start: s.current.since, end: Math.max(now, s.current.since) });
  rows.sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  let reach = -Infinity;
  for (const r of rows) {
    if (reach > -Infinity && r.start > reach) {
      const a = Math.max(reach, from), b = Math.min(r.start, to);
      if (b > a) out.push({ start: a, end: b });
    }
    reach = Math.max(reach, r.end);
  }
  return out;
}
function HoleRow({ g }: { g: { start: number; end: number } }) {
  return (
    <div class="gap-row" role="note">
      <span class="dot gap-dot" aria-hidden="true" />
      <span><b>No entry</b><span class="muted small">{clock(g.start)} → {clock(g.end)} · nothing logged here. The clocks count unlogged time as off duty — add what you were doing if that's wrong.</span></span>
      <span class="entry-len">{dur(g.end - g.start)}</span>
      <span />
    </div>
  );
}
export function onDay(min: number, day: number): number {
  const a = new Date(min * 60000), d = new Date(day * 60000);
  d.setHours(a.getHours(), a.getMinutes(), 0, 0);
  return Math.floor(d.getTime() / 60000);
}
const sameDay = (a: number, b: number) => new Date(a * 60000).toDateString() === new Date(b * 60000).toDateString();
/** The day buttons: today and the three days before it (or, for a what-if plan, after it). */
export function dayChips(now: number, future: boolean): { at: number; label: string }[] {
  return [0, 1, 2, 3].map((i) => {
    const d = new Date(now * 60000);
    d.setDate(d.getDate() + (future ? i : -i));
    const label = i === 0 ? 'Today' : i === 1 ? (future ? 'Tomorrow' : 'Yesterday') : `${DOW_SHORT[d.getDay()]} ${d.getDate()}`;
    return { at: Math.floor(d.getTime() / 60000), label };
  });
}
const dateInput = (min: number) => toInput(min).slice(0, 10);

/* ---------- the one clock picker (patch L1, items 2 + 3) ---------- */

/**
 * A typed time of day: "0641", "641", "06:41" or "6:41". 'partial' is a time still being typed
 * (one or two digits); 'range' has the shape but is no time (25:00, 06:75). Exported for the tests.
 */
export type TypedClock = { ok: true; h: number; m: number } | { ok: false; problem: 'empty' | 'partial' | 'junk' | 'range' };
export function readTypedClock(text: string): TypedClock {
  const t = text.trim();
  if (!t) return { ok: false, problem: 'empty' };
  const m = /^(\d{1,2}):?(\d{2})$/.exec(t);
  if (!m) return /^\d{1,2}:?\d?$/.test(t) ? { ok: false, problem: 'partial' } : { ok: false, problem: 'junk' };
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return { ok: false, problem: 'range' };
  return { ok: true, h, m: mi };
}
/** `at`'s calendar day (device-local, as every clock in the app is) at h:m. */
export function atClock(at: number, h: number, m: number): number {
  const t = new Date(at * 60000);
  t.setHours(h, m, 0, 0);
  return Math.floor(t.getTime() / 60000);
}
/** The clock picker's own input ("HH:MM", what the phone's time picker reports), on `at`'s day; null if unreadable. */
function fromTimeInput(at: number, v: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(v);
  return m ? atClock(at, +m[1], +m[2]) : null;
}

/**
 * The phone's own clock picker (patch 19) — the app's ONE type=time input, shared by the
 * "Exact time" box and the log editor's big clock. A tap opens the phone's picker; where a tap
 * alone does not (a desktop browser focuses the field instead), showPicker() is asked too,
 * guarded — it is absent on older engines and throws without a user gesture.
 */
function TimePicker({ at, set, name, cls }: { at: number; set: (v: number) => void; name: string; cls?: string }) {
  return (
    <input type="time" class={cls} aria-label={name} value={toInput(at).slice(11, 16)}
      onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* the tap's own picker stands */ } }}
      onInput={(e) => { const v = fromTimeInput(at, (e.target as HTMLInputElement).value); if (v !== null) set(v); }}
      onChange={(e) => { const v = fromTimeInput(at, (e.target as HTMLInputElement).value); if (v !== null && v !== at) set(v); }} />
  );
}

/** The preset keys under the clock: [minutes, text, aria] per key, one row per array. */
type ClockKeys = [number, string, string][][];
const KEYS_HOURS: ClockKeys = [
  [[-60, '− 1 hour', '1 hour earlier'], [60, '+ 1 hour', '1 hour later']],
  [[-15, '−15', '15 minutes earlier'], [-5, '−5', '5 minutes earlier'], [5, '+5', '5 minutes later'], [15, '+15', '15 minutes later']],
];
const KEYS_MINUTES: ClockKeys = [[[-5, '−5', '5 minutes earlier'], [-1, '−1', '1 minute earlier'], [1, '+1', '1 minute later'], [5, '+5', '5 minutes later']]];

/**
 * THE clock picker (patch L1 item 3) — one shared component wherever a time is edited: the Log
 * editor's start and end, "Fix the start time", the load check's departure and appointment, and
 * the trip planner's departure. Day buttons, the big clock, the preset keys and another-day.
 * `say` reads the big clock's time aloud ("Started 06:41"); `name` labels the picker input.
 *
 * D6/D7 (audit): the big clock IS the phone's clock picker everywhere (the feel round's
 * `pickerOnly`, made the only behaviour). The tap-to-type keypad box and the separate 12-hour
 * "Exact time" field are gone from every caller, so one control means one thing in every
 * sheet. "Another day" shows the app's own date words ("Fri Nov 20") over a transparent date
 * input, the same way the big clock sits over the time input.
 */
function ClockPick({ at, set, now, future, say, name, keys, extra, anyDay = true, timeOnly = false, sub }: {
  at: number; set: (v: number) => void; now: number; future: boolean; say: string; name: string; keys: ClockKeys; extra?: ComponentChildren; anyDay?: boolean; timeOnly?: boolean; sub?: string;
}) {
  const chips = timeOnly ? [] : dayChips(now, future);
  const onChip = timeOnly ? true : chips.some((c) => sameDay(c.at, at));
  const pickDate = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return;
    const t = new Date(at * 60000);
    set(Math.floor(new Date(+m[1], +m[2] - 1, +m[3], t.getHours(), t.getMinutes()).getTime() / 60000));
  };
  return (
    <>
      {!timeOnly && (
        <div class="chips ed-days" role="group" aria-label="Day">
          {chips.map((c) => <button key={c.label} class={sameDay(c.at, at) ? 'on' : undefined} aria-pressed={sameDay(c.at, at)} onClick={() => set(onDay(at, c.at))}>{c.label}</button>)}
        </div>
      )}
      <div class="ed-clock">
        {/* The picker input covers the whole clock face (transparent): a tap anywhere on the
            big time lands on the input itself, which is what opens a phone's time picker. */}
        <label class="ed-clock-pick">
          <output class="mono" aria-live="polite" aria-label={`${say} ${timeOnly ? clock(at, false) : clock(at)}`}>{clock(at, false)}</output>
          <TimePicker at={at} set={set} name={name} cls="ed-clock-input" />
        </label>
        <span>{timeOnly ? (sub ?? 'Tap the time to pick it') : `${new Date(at * 60000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · tap the time to pick it`}</span>
      </div>
      {extra}
      {keys.map((row, i) => <div key={i} class={`ed-keys ${row.length === 2 ? 'two' : 'four'}`}>{row.map(([d, t, a]) => <button key={d} aria-label={a} onClick={() => set(at + d)}>{t}</button>)}</div>)}
      {!timeOnly && anyDay && (
        <label class="ed-day">Another day
          <span class={onChip ? 'ed-day-pick' : 'ed-day-pick on'}>
            <span class="ed-day-val" aria-hidden="true">{dayWords(at)}</span>
            <input type="date" class="ed-day-input" aria-label={`Another day, ${dayWords(at)}`} value={dateInput(at)}
              onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* the tap's own picker stands */ } }}
              onInput={(e) => pickDate((e.target as HTMLInputElement).value)} />
          </span>
        </label>
      )}
    </>
  );
}
/** D7 (audit): a date the way the rest of the app writes one — "Fri Nov 20". */
export function dayWords(at: number): string {
  return new Date(at * 60000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
}

/**
 * The draft after "what" is answered.
 * C4 (taste): when adding a fresh entry with `s` supplied, prefer placing the first suggestion
 * inside the most recent unlogged gap (so it usually needs no overlap confirmation), else end
 * at the current status's start (if recent), else fall back to the hour before `end` (or
 * `end - minutes` for a fixed-length break). A changed answer keeps the times already chosen.
 */
export function draftFor(pick: { status: DutyStatus; note?: string; minutes?: number }, prev: Draft | undefined, now: number, inside?: Segment, day?: number, s?: Pick<State, 'segments' | 'current'>): Draft {
  const fixedLen = pick.minutes !== undefined;
  if (prev) return { status: pick.status, note: pick.note, start: prev.start, len: pick.minutes ?? prev.len, fixedLen };
  if (inside) {
    const room = inside.end - inside.start;
    const len = Math.min(pick.minutes ?? 30, room);
    const start = Math.min(Math.max(round5(inside.start + (room - len) / 2), inside.start), inside.end - len);
    return { status: pick.status, note: pick.note, start, len, fixedLen };
  }
  const end = day === undefined ? now : Math.min(now, onDay(now, day));
  if (s) {
    const winStart = day === undefined ? now - 1440 : atClock(day, 0, 0);
    const gaps = logHoles(s, now, winStart, end);
    // If there is no open status and the last logged row ended before `end`, that trailing stretch is also a gap.
    if (!s.current) {
      const logged = s.segments.filter((x) => !x.tentative && x.end > x.start);
      if (logged.length) {
        const lastEnd = Math.max(...logged.map((x) => x.end));
        if (lastEnd >= winStart && lastEnd < end) gaps.push({ start: lastEnd, end });
      }
    }
    const minNeed = fixedLen ? pick.minutes! : 5;
    for (let i = gaps.length - 1; i >= 0; i--) {
      const g = gaps[i];
      if (g.end - g.start >= minNeed) {
        const len = fixedLen ? pick.minutes! : Math.min(60, g.end - g.start);
        return { status: pick.status, note: pick.note, start: g.end - len, len, fixedLen };
      }
    }
    // No suitable gap: end at the current status's start (if on today and within 24h) so it never overlaps the live status.
    if (day === undefined && s.current && s.current.since <= now && now - s.current.since <= 1440) {
      const len = fixedLen ? pick.minutes! : 60;
      return { status: pick.status, note: pick.note, start: s.current.since - len, len, fixedLen };
    }
  }
  if (fixedLen) return { status: pick.status, note: pick.note, start: end - pick.minutes!, len: pick.minutes!, fixedLen };
  const start = round5(end - 60);
  return { status: pick.status, note: pick.note, start, len: Math.max(5, Math.min(60, now - start)), fixedLen };
}
const draftOf = (seg: Segment): Draft => ({ status: seg.status, note: seg.note, start: seg.start, len: seg.end - seg.start });

/** Why the start time cannot be used yet, or null. Logged time is the past; a what-if plan is the future. */
export function whenProblem(d: Draft, now: number, tentative: boolean): string | null {
  if (tentative) return d.start < now ? `A what-if plan can only start from now on (${clock(now)}).` : null;
  if (d.start >= now) return `That is later than now (${clock(now)}). This log is for time that has happened.`;
  if (d.fixedLen && d.start + d.len > now) return `A ${dur(d.len)} break starting then would still be going. Pick an earlier start, or “It just ended”.`;
  return null;
}
/** Why the draft cannot be saved yet, or null. */
export function draftProblem(d: Draft, now: number, tentative: boolean): string | null {
  const w = whenProblem({ ...d, fixedLen: false }, now, tentative);
  if (w) return w;
  if (d.len < 1) return 'Pick how long it lasted.';
  if (!tentative && d.start + d.len > now) return `That runs past now (${clock(now)}). Pick a shorter length, or “Until now”.`;
  return null;
}

/**
 * What the entry will do to the entries already there, in plain words, or null if it touches none. A later
 * entry wins over the time it covers (the engine's rule), so the driver is told before, not after.
 * `rows` is the resolved timeline without the entry itself.
 */
export function overlapNote(rows: Segment[], d: Draft, now: number): string | null {
  const end = d.start + d.len;
  const key = (r: Segment) => (r.note === 'current' ? undefined : r.note ?? undefined);
  const hit = rows.filter((r) => !r.tentative && r.end > d.start && r.start < end && !(r.status === d.status && key(r) === (d.note ?? undefined)));
  if (!hit.length) return null;
  const name = (r: Segment) => segLabel(r.status, key(r));
  const to = (r: Segment) => (r.end >= now ? 'now' : clock(r.end));
  const it = d.note?.startsWith('break:') ? 'the break' : 'it';
  if (hit.length === 1 && hit[0].start < d.start && hit[0].end > end) {
    const r = hit[0];
    return `This goes inside your ${name(r)} from ${clock(r.start)} to ${to(r)}. Your log will show that ${r.status === 'D' ? 'drive' : 'entry'} split around ${it}.`;
  }
  const list = hit.slice(0, 3).map((r) => `${name(r)} from ${clock(r.start)} to ${to(r)}`).join(', ') + (hit.length > 3 ? ` and ${hit.length - 3} more` : '');
  return `This takes over part of your ${list}. Where they overlap, that time will count as ${segLabel(d.status, d.note)} instead.`;
}

/** What the rules make of the entry, when there is something worth saying. */
export function draftNotes(d: Draft, cycleHours: number): string[] {
  if (d.note?.startsWith('break:') && (d.status === 'OFF' || d.status === 'ON')) return breakHint(d.len, d.status, cycleHours);
  if (d.note === 'PC' || d.note === 'YM') return [SUB_HINT[d.note]];
  if (d.status !== 'D' && d.len >= 30) return ['Long enough for the 30-minute break rule: 30 minutes in a row without driving.'];
  return [];
}

/**
 * The label a fixed entry keeps when the driver picks another status for it: the one picked (personal
 * conveyance, yard move), else the entry's break name while it still fits (a break logged off duty can be
 * moved to on duty, as its button allows), else none.
 */
export function relabel(seg: Segment, status: DutyStatus, picked?: string): string | undefined {
  if (picked) return picked;
  return seg.note?.startsWith('break:') && noteFits(seg.note, status) ? seg.note : undefined;
}

/** The step before this one, or null when Back should close the panel. */
export function stepBack(k: SheetKind): SheetKind | null {
  if (k.kind !== 'add' && k.kind !== 'edit') return null;
  const step = k.step ?? (k.kind === 'edit' ? 'menu' : 'what');
  const d = k.draft;
  if (k.kind === 'edit') {
    if (step === 'menu') return null;
    if (step === 'what' || step === 'when') return { ...k, step: 'menu' };
    if (step === 'long') return { ...k, step: 'when' };
    return { ...k, step: d?.fixedLen || k.live ? 'when' : 'long' };
  }
  if (step === 'what') return d ? { ...k, step: k.resume ?? 'check', resume: undefined } : null; // came from a "Change": go back there
  // Back to the first question starts the answer again (a "what" holding a draft means a "Change" is open).
  if (step === 'when') return { ...k, step: 'what', draft: undefined, resume: undefined };
  if (step === 'long') return { ...k, step: 'when' };
  return { ...k, step: d?.fixedLen ? 'when' : 'long' };
}
/** The phone's Back, and the panel's own Back button: one step back, or close. */
export function sheetBack() {
  const k = currentSheet();
  openSheet(k ? stepBack(k) : null);
}

/** Save the draft: a new entry, or the fixed one. Returns a reason it was refused, or null. */
export function commitDraft(k: SheetKind, d: Draft, now: number): string | null {
  const end = d.start + d.len;
  if (k.kind === 'edit') return saveEntry(k.seg, { status: d.status, start: d.start, end, note: d.note }, now);
  return addEntry(d.status, d.start, end, now, d.note);
}

/** The special categories a driver logs from the Log as well as from Now (driver report 2026-10-13). */
const SUB_HINT: Record<'PC' | 'YM', string> = {
  PC: 'Personal conveyance is off duty: personal use of the truck, never to move a load forward or for the carrier’s business (FMCSA guidance, 2018). Your carrier can restrict or forbid it.',
  YM: 'A yard move is on duty, not driving: it uses your 14-hour window and your week, but not your 11 hours of driving.',
};
type WhatOpt = { status: DutyStatus; note?: 'PC' | 'YM'; title: string; sub: string };
// D5 (audit): the same four, in the dock's order and under the dock's names, everywhere.
const WHAT: WhatOpt[] = [
  { status: 'OFF', title: STATUS_LABEL.OFF, sub: 'Done with work, free to do as you like' },
  { status: 'SB', title: STATUS_LABEL.SB, sub: 'Resting in the sleeper berth' },
  { status: 'D', title: STATUS_LABEL.D, sub: 'Behind the wheel' },
  { status: 'ON', title: STATUS_LABEL.ON, sub: 'Working, not driving: fueling, loading, inspecting' },
];
const ALSO: WhatOpt[] = [
  { status: 'OFF', note: 'PC', title: 'Personal conveyance', sub: 'Off duty, using the truck for yourself' },
  { status: 'ON', note: 'YM', title: 'Yard move', sub: 'On duty, moving the truck in the yard' },
];

/**
 * What a break does under the rules, in the driver's words: whether it can satisfy the 30-minute break on
 * its own, what logging it on duty costs, and the off-duty test. Exported for the tests.
 *
 * §395.3(a)(3)(ii): no driving once 8 hours of driving have passed without a 30-minute consecutive
 * interruption, and since 2020 on-duty time that is not driving counts. Off duty, per FMCSA's 2013
 * guidance, means relieved of all duty and responsibility for the vehicle and free to do as one chooses;
 * pay is not part of that test.
 */
export function breakHint(minutes: number, status: 'OFF' | 'ON', cycleHours: number): string[] {
  const out = [minutes < 30
    ? 'On its own this does not satisfy the 30-minute break rule: that needs 30 minutes in a row without driving. Back to back with other time off the wheel (fueling, a meal), it all counts together.'
    : 'Long enough for the 30-minute break rule: 30 minutes in a row without driving.'];
  out.push(status === 'ON'
    ? `Logged on duty: it still counts toward the 30-minute break, but it uses ${dur(minutes)} of your ${cycleHours}-hour week.`
    : 'Off duty means relieved of all work and free to do as you choose (FMCSA guidance). Whether a break is paid is not part of that test.');
  return out;
}

function Question({ children }: { children: ComponentChildren }) {
  // Focused when the step opens, so a screen reader reads the question first.
  return <h3 class="ed-q" tabIndex={-1} data-first>{children}</h3>;
}
function StepCount({ at, of, label, optAt, barClass }: { at: number; of: number; label?: string; optAt?: number; barClass?: string }) {
  return (
    <div class="ed-steps">
      <div class={`ed-bar${barClass ? ` ${barClass}` : ''}`} aria-hidden="true">{Array.from({ length: of }, (_, i) => {
        const cls = `${i < at ? 'on' : ''}${optAt === i + 1 ? ' opt' : ''}`.trim();
        return <span key={i} class={cls || undefined} />;
      })}</div>
      <span class="ed-count">Step {at} of {of}{label ? ` — ${label}` : ''}</span>
    </div>
  );
}
/**
 * A2 (audit): one counter for the whole wizard, the check screen counted. Add: what · when ·
 * end · check (4), or what · when · check (3) for a fixed-length break. Edit ("The times are
 * wrong"): when · end · check (3), or when · check (2) for the open status or a break. The
 * edit menu, "It wasn't …" and a check reached straight from it are single taps: no counter.
 */
export function edCounter(k: EdKind, step: EdStep): { at: number; of: number } | null {
  const fixed = !!k.draft?.fixedLen;
  if (k.kind === 'add') {
    const of = fixed ? 3 : 4;
    return { at: step === 'what' ? 1 : step === 'when' ? 2 : step === 'long' ? 3 : of, of };
  }
  if (k.via === 'what' || step === 'menu' || step === 'what') return null;
  const of = k.live || fixed ? 2 : 3;
  return { at: step === 'when' ? 1 : step === 'long' ? 2 : of, of };
}
function EdCount({ k, step }: { k: EdKind; step: EdStep }) {
  const c = edCounter(k, step);
  return c ? <StepCount at={c.at} of={c.of} label={step === 'check' ? 'Check' : undefined} /> : null;
}
function OptRow({ o, on, onPick }: { o: WhatOpt; on?: boolean; onPick: () => void }) {
  return (
    <button class="opt" aria-pressed={on ? true : undefined} onClick={onPick}>
      <span class="led" style={{ background: STATUS_COLOR[o.status] }} />
      <span><b>{o.title}</b><span class="sub">{o.sub}</span></span>
      <Icon d={on ? I.check : I.next} size={20} />
    </button>
  );
}
/** A3 (audit): an edit keeps the entry's original times in view — " · was Thu 19:20 → 20:10". */
export function wasText(k: EdKind): string {
  if (k.kind !== 'edit') return '';
  const g = k.seg;
  return k.live ? ` · was since ${clock(g.start)}` : ` · was ${clock(g.start)} → ${clock(g.end, !sameDay(g.start, g.end))}`;
}
/** The answer so far, above the next question, with a way back to change it. */
function Context({ d, onChange, k }: { d: Draft; onChange?: () => void; k?: EdKind }) {
  return (
    <div class="ed-ctx">
      <span class="dot" style={{ background: STATUS_COLOR[d.status] }} />
      <span class="ed-ctx-t">{segLabel(d.status, d.note)}{k ? wasText(k) : ''}</span>
      {onChange ? <button class="link" onClick={onChange}>Change</button> : <span />}
    </div>
  );
}

type EdKind = Extract<SheetKind, { kind: 'add' } | { kind: 'edit' }>;

function WhatStep({ k, s, now }: { k: EdKind; s: State; now: number }) {
  const [err, setErr] = useState<string | null>(null);
  const edit = k.kind === 'edit' ? k.seg : null;
  const tentative = !!edit?.tentative;
  const inside = k.kind === 'add' ? k.inside : undefined;
  const choose = (status: DutyStatus, note?: string, minutes?: number) => {
    if (edit) {
      if (isOn({ status, note: note as WhatOpt['note'], title: '', sub: '' })) { openSheet(null); return; } // already that: nothing to change
      // The open status (item 1): relabelled in place, its start kept.
      if (k.kind === 'edit' && k.live) { restatusCurrent(status, relabel(edit, status, note)); openSheet(null); return; }
      // Item 4: an entry that already overlaps another (an older record) would absorb it — that
      // is never done on a status tap; the check step shows it and asks first.
      const next = { status, start: edit.start, end: edit.end, note: relabel(edit, status, note) };
      if (placeEntry(s, { ...edit, ...next }, edit, now).absorbed.length) {
        openSheet({ ...k, step: 'check', via: 'what', draft: { status, note: next.note, start: edit.start, len: edit.end - edit.start } });
        return;
      }
      // A different status is one tap, kept as the times were; undo is on the Log.
      const e = saveEntry(edit, next, now);
      setErr(e);
      if (!e) {
        updateActiveMorphKey(logEntryKey({ status: next.status, start: next.start, end: next.end, tentative: edit.tentative }));
        openSheet(null);
      }
      return;
    }
    const d = draftFor({ status, note, minutes }, k.draft, now, inside, k.kind === 'add' ? k.day : undefined, s);
    openSheet({ ...k, draft: d, step: k.draft ? (k.kind === 'add' && k.resume) || 'check' : 'when', ...(k.kind === 'add' ? { resume: undefined } : {}) });
  };
  // The row lit in an edit: its status, as personal conveyance or yard move when it is one.
  function isOn(o: WhatOpt): boolean {
    if (!edit) return false;
    const sub = edit.note === 'PC' || edit.note === 'YM' ? edit.note : undefined;
    return edit.status === o.status && o.note === sub;
  }
  const breaks = edit ? [] : s.breakPresets;
  const breakRow = breaks.length > 0 && (
    <>
      <div class="ed-lab">A break</div>
      <div class="ed-brk" role="group" aria-label="Break buttons">{breaks.map((p, i) => (
        <button key={i} onClick={() => choose(p.status, breakNote(p.name), p.minutes)}><b>{p.name}</b><span>{dur(p.minutes)} · {p.status === 'ON' ? 'on duty' : 'off duty'}</span></button>
      ))}</div>
    </>
  );
  // Inside a drive or a work stretch, the likeliest answer is a break: it comes first there.
  const breaksFirst = !!inside && (inside.status === 'D' || inside.status === 'ON');
  return (
    <>
      <EdCount k={k} step="what" />
      <Question>{edit ? 'What were you really doing?' : breaksFirst ? 'Which break did you take?' : inside ? 'What happened in the middle?' : 'What were you doing?'}</Question>
      {breaksFirst && breakRow}
      {breaksFirst && <div class="ed-lab">Or</div>}
      {WHAT.map((o) => <OptRow key={o.status} o={o} on={isOn(o)} onPick={() => choose(o.status)} />)}
      {!breaksFirst && breakRow}
      {!tentative && (
        <>
          <div class="ed-lab">Also</div>
          {ALSO.map((o) => <OptRow key={o.note} o={o} on={isOn(o)} onPick={() => choose(o.status, o.note)} />)}
        </>
      )}
      {err && <div class="warnbox small">{err}</div>}
      {edit && <p class="muted small ed-foot">Keeps the times. Undo is on the Log until your next change.</p>}
    </>
  );
}

function WhenStep({ k, now }: { k: EdKind; now: number }) {
  const d = k.draft!;
  const tentative = k.kind === 'edit' && !!k.seg.tentative;
  const live = k.kind === 'edit' && !!k.live;
  // D8 (Lorico, decided 2026-11-20): in EDIT, nudging the start keeps the END fixed — the
  // length absorbs the nudge. Add keeps the length (the end moves with the start); a
  // fixedLen break keeps its length by definition, and the live entry's end is now itself.
  const set = (start: number) => openSheet({ ...k, draft: k.kind === 'edit' && !live && !d.fixedLen ? { ...d, start, len: d.start + d.len - start } : { ...d, start } });
  // The open status (item 1) has no length to pick — it runs until now — so its next step is the check.
  const problem = live ? (d.start >= now ? `That is not in the past yet (now is ${clock(now)}). The status you are in has already started.` : null) : whenProblem(d, now, tentative);
  const next: EdStep = live || d.fixedLen ? 'check' : 'long';
  return (
    <>
      <EdCount k={k} step="when" />
      <Context d={d} k={k} onChange={k.kind === 'add' ? () => openSheet({ ...k, step: 'what', resume: 'when' }) : undefined} />
      <Question>{k.kind === 'edit' ? 'When did it really start?' : 'When did it start?'}</Question>
      <ClockPick at={d.start} set={set} now={now} future={tentative} say="Started" name="Start time" keys={KEYS_HOURS}
        extra={d.fixedLen && !tentative ? <button class="wide-btn" onClick={() => set(now - d.len)}>It just ended: started {clock(now - d.len, false)}</button> : undefined} />
      {problem && <div class="warnbox small">{problem}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={() => openSheet({ ...k, step: next })}>{next === 'check' ? 'Next: check it' : 'Next: when it ended'}</button>
    </>
  );
}

function LongStep({ k, now }: { k: EdKind; now: number }) {
  const d = k.draft!;
  const tentative = k.kind === 'edit' && !!k.seg.tentative;
  // Item 2/3: the end time is a time too. An exact end is taken as given (no 5-minute floor), as
  // long as it is after the start; an end at or before the start is ignored (nothing moves).
  // Patch L3 (field report 2026-11-17): the end is picked on the SAME clock picker as the
  // start, day included — a status can end on a later day than it began (Off Duty from
  // Saturday 00:00 to Monday 18:40 could not be said at all when the end was a time of day
  // on the start's day); the day chips and the "Another day" date sit alongside it.
  const setEnd = (end: number) => { if (end > d.start) openSheet({ ...k, draft: { ...d, len: end - d.start, fixedLen: false } }); };
  const sinceStart = now - d.start;
  const problem = draftProblem(d, now, tentative);
  // Owner amendment B (Lorico, 2026-11-20): the driver says when it ENDED, on the same clock
  // picker as the start — the duration presets are gone and the length is derived from
  // start → end (read out under the clock). "Until now" stays as an end-time shortcut.
  // EDIT-FIX (Lorico, 2026-11-20): the edit flow's end step is this same step ("When did it
  // really end?"), so Add and Edit feel identical. A what-if (tentative) row may end in the
  // future and has no "Until now".
  const add = k.kind === 'add';
  const end = d.start + d.len;
  return (
    <>
      <EdCount k={k} step="long" />
      <Context d={d} k={k} onChange={add ? () => openSheet({ ...k, step: 'what', resume: 'long' }) : undefined} />
      <p class="ed-from">From <b class="mono">{clock(d.start)}</b></p>
      <Question>{add ? 'When did it end?' : 'When did it really end?'}</Question>
      <ClockPick at={end} set={setEnd} now={now} future={tentative} say="Ended" name="End time" keys={KEYS_HOURS}
        extra={!tentative && sinceStart >= 5 && end !== now ? <button class="wide-btn" onClick={() => setEnd(now)}>Until now: ended {clock(now, false)}</button> : undefined} />
      <p class="ed-ends">Lasted <output class="mono" aria-live="polite">{dur(d.len)}</output></p>
      {problem && <div class="warnbox small">{problem}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={() => openSheet({ ...k, step: 'check' })}>Next: check it</button>
    </>
  );
}

function CheckStep({ k, s, now }: { k: EdKind; s: State; now: number }) {
  const [err, setErr] = useState<string | null>(null);
  const d = k.draft!;
  const edit = k.kind === 'edit' ? k.seg : null;
  const live = k.kind === 'edit' && !!k.live;
  const tentative = !!edit?.tentative;
  const end = live ? Math.max(now, d.start) : d.start + d.len;
  const cycleHours = s.config.cycle === '60/7' ? 60 : 70;
  // The timeline without this entry (for what it overlaps), and with it (for the picture). The
  // picture is the record the save will leave (item 4): the entry placed, what it covers absorbed.
  const without: State = live ? { ...s, current: null } : edit ? { ...s, segments: s.segments.filter((x) => x !== edit), tentative: s.tentative.filter((x) => x !== edit) } : s;
  const row: Segment = { status: d.status, start: d.start, end, createdAt: Number.MAX_SAFE_INTEGER, ...(d.note ? { note: d.note } : {}), ...(tentative ? { tentative: true } : {}) };
  const liveCheck = live ? absorbCurrentStart(s, d.start, now) : null;
  const placed = live ? null : placeEntry(s, row, edit, now);
  const withIt: State = live
    ? (liveCheck!.ok ? { ...s, ...liveCheck!.patch } : s)
    : { ...s, ...placed!.patch };
  const absorbed = live ? (liveCheck!.ok ? liveCheck!.absorbed : []) : placed!.absorbed;
  // Resolved, then joined on the label as the Log shows it: a drive logged as two touching rows is one drive.
  const before = joinDisplayRows(normalize(allSegments(without, now), { merge: false }));
  const after = joinDisplayRows(normalize(allSegments(withIt, now), { merge: false }));
  const from = carrierDayStart(d.start, s.config), to = nextCarrierDayStart(from, s.config);
  const overlap = live ? null : overlapNote(before, d, now);
  const notes = live ? [] : draftNotes(d, cycleHours);
  const unchanged = live && d.start === s.current?.since;
  const problem = live
    ? (unchanged ? null : liveCheck!.ok ? null : adjustStartProblemText(liveCheck!.problem, s, now))
    : draftProblem(d, now, tentative);
  // D8 (audit): every other row the save moves, and what it does to the hours — computed from
  // the same patch the save applies, read-only.
  const knock = problem || unchanged ? [] : knockOnLines(s, withIt, edit, absorbed, now, live);
  const effects = problem || unchanged ? [] : consequenceLines(s, withIt, now);
  const confirm = absorbed.length > 0 || knock.length > 0 || effects.some((e) => e.bad);
  const go = (step: EdStep) => openSheet({ ...k, step });
  const save = () => {
    if (unchanged) { openSheet(null); return; }
    const e = live ? adjustStartNow(d.start, absorbed.length > 0) : commitDraft(k, d, now);
    setErr(e);
    if (!e) {
      if (k.kind === 'edit') {
        updateActiveMorphKey(live ? 'live' : logEntryKey({ status: d.status, start: d.start, end, tentative: k.seg.tentative }));
      }
      openSheet(null);
    }
  };
  const verb = edit ? 'Save the change' : 'Add to my log';
  return (
    <>
      <EdCount k={k} step="check" />
      <Question>{edit ? 'Check the change' : 'Check and add'}</Question>
      {/* A2 (audit): each row names what its Change opens — Starts opens the start, Ends the end. */}
      <div class="ed-sum">
        <div><span>What</span><b>{segLabel(d.status, d.note)}</b>{edit ? <span /> : <button class="link" onClick={() => go('what')} aria-label="Change what you were doing">Change</button>}</div>
        <div><span>Starts</span><b class="mono">{clock(d.start)}</b><button class="link" onClick={() => go('when')} aria-label="Change when it started">Change</button></div>
        {live
          ? <div><span>Ends</span><b class="mono">now · {dur(end - d.start)} so far</b><span /></div>
          : d.fixedLen
          ? <div><span>Ends</span><b class="mono">{clock(end, !sameDay(d.start, end))} · {dur(d.len)}</b><span /></div>
          : <div><span>Ends</span><b class="mono">{clock(end, !sameDay(d.start, end))} · {dur(d.len)}</b><button class="link" onClick={() => go('long')} aria-label="Change when it ended">Change</button></div>}
      </div>
      <div>
        <div class="ed-lab">Your day with it {edit ? 'changed' : 'added'}</div>
        <Grid segments={after} from={from} to={to} tz={s.config.timeZone} mark={{ start: d.start, end }} />
      </div>
      {/* D12 (audit): one warning, not two — the absorb list has the concrete before → after per
          row, so the general overlap sentence only shows when there is no list. */}
      {overlap && !absorbed.length && <p class="warnbox">{overlap}</p>}
      <AbsorbNote absorbed={absorbed} now={now} />
      <KnockOn rows={knock} effects={effects} />
      {notes.length > 0 && <ul class="brk-hint">{notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {(problem || err) && <div class="warnbox small">{problem ?? err}</div>}
      {/* Item 4: when the entry runs into others, this button IS the one explicit confirmation. */}
      <button class={`primary wide ed-go${confirm ? ' ed-absorb' : ''}`} disabled={!!problem} onClick={save}>{absorbed.length ? (edit ? 'Change the others and save' : 'Change the others and add it') : verb}</button>
      <p class="muted small ed-foot">Undo is on the Log until your next change.</p>
    </>
  );
}

/** Tapping an entry: what is wrong with it, in the driver's words, rather than every field at once. */
function MenuStep({ k, s }: { k: Extract<SheetKind, { kind: 'edit' }>; s: State }) {
  const seg = k.seg;
  const d = draftOf(seg);
  const label = segLabel(seg.status, seg.note);
  const middle = !seg.tentative && seg.end - seg.start >= 10;
  // Item 1: the open status gets the same menu. "It never happened" puts the status before it
  // back as the open one — offered only when there is one to go back to.
  const back = k.live ? statusBeingLeft(s) : null;
  const worked = seg.status === 'D' || seg.status === 'ON';
  const act = (icon: string, title: string, sub: string, onClick: () => void, cls?: string) => (
    <button class={`act${cls ? ` ${cls}` : ''}`} onClick={onClick}>
      <Icon d={icon} size={24} />
      <span><b>{title}</b><span class="sub">{sub}</span></span>
      {cls ? <span /> : <Icon d={I.next} size={20} />}
    </button>
  );
  return (
    <>
      <p class="ed-when mono">{clock(seg.start)} → {k.live ? 'now' : clock(seg.end)} · {dur(seg.end - seg.start)}{k.live ? ' so far' : ''}</p>
      <Question>What do you want to fix?</Question>
      {act(I.log, `It wasn’t ${label}`, 'Change what you were doing', () => openSheet({ ...k, step: 'what', draft: d, via: undefined }))}
      {act(I.now, 'The times are wrong', 'Change when it started or when it ended', () => openSheet({ ...k, step: 'when', draft: d, via: undefined }))}
      {middle && act(I.plus, worked ? 'I took a break in the middle' : 'I worked or drove in the middle', worked ? `Add a break inside this ${seg.status === 'D' ? 'drive' : 'entry'}` : 'Add something inside this entry', () => openSheet({ kind: 'add', inside: seg }))}
      {k.live
        ? back && act(I.trash, 'It never happened', `Go back to ${segLabel(back.status, back.note)} since ${clock(back.start)}`, () => { dropCurrent(); openSheet(null); }, 'del')
        : act(I.trash, seg.tentative ? 'Remove this what-if' : 'It never happened', seg.tentative ? 'Take it out of the plan' : 'Delete this entry', () => { deleteEntry(seg); openSheet(null); }, 'del')}
      <p class="muted small ed-foot">The Log can undo your last change — only the last one.</p>
    </>
  );
}

function EditorSheet({ k, s, now, closing = false, morphOrigin = null }: { k: EdKind; s: State; now: number; closing?: boolean; morphOrigin?: SheetMorphOrigin | null }) {
  const step: EdStep = k.step ?? (k.kind === 'edit' ? 'menu' : 'what');
  // A step that needs a draft without one (a stale descriptor) starts over at the first question.
  const ok = step === 'menu' || step === 'what' || !!k.draft;
  const at: EdStep = ok ? step : k.kind === 'edit' ? 'menu' : 'what';
  const title = k.kind === 'add' ? 'Add to your log' : `${segLabel(k.seg.status, k.seg.note)}${k.seg.tentative ? ' (what-if)' : ''}`;
  const first = at === (k.kind === 'edit' ? 'menu' : 'what') && !(k.kind === 'add' && k.draft);
  return (
    <Sheet title={title} onBack={first ? undefined : sheetBack} focusKey={at} closing={closing} morphOrigin={morphOrigin}>
      {at === 'menu' && k.kind === 'edit' && <MenuStep k={k} s={s} />}
      {at === 'what' && <WhatStep k={k} s={s} now={now} />}
      {at === 'when' && <WhenStep k={k} now={now} />}
      {at === 'long' && <LongStep k={k} now={now} />}
      {at === 'check' && <CheckStep k={k} s={s} now={now} />}
    </Sheet>
  );
}

/* ============================================================ Plan */

/**
 * Back out of a planning screen — to wherever the driver entered it from (patch 7.1). The Plan hub
 * is the default and the label says so, but patch 7 put doors to these screens on Now and Recap,
 * and a back button that always lands on Plan strands a driver who never came through Plan
 * (Lorico, on his Pixel, live patch 7). The label names the real destination.
 */
function BackToPlan({ s }: { s: State }) {
  // Never target the screen we are already on (e.g. returning History/Load → Recap where
  // planReturn stayed 'recap'): fall back to 'plan' so the driver is never stranded in a room.
  const dest: State['planReturn'] = s.planReturn === s.tab ? 'plan' : s.planReturn;
  const label = dest === 'now' ? 'Now' : dest === 'recap' ? 'Recap' : 'Plan';
  return <button class="back" onClick={() => (dest === s.planReturn ? setState({ tab: s.planReturn }) : setState({ tab: dest, planReturn: 'plan' }))}><Icon d={I.back} /> {label}</button>;
}

/**
 * Reactive sub-screen flag for the Weekly Recap vs. 34-Hour Reset & Home-Time Planner.
 * Held outside `store.ts` (store is frozen) in the exact style of `useSheet()` above:
 * lives under the Plan tab and resets automatically when navigating away or tapping Plan/Back.
 */
let weekPlannerOpen = false;
const weekPlannerSubs = new Set<() => void>();
export function openWeekPlanner(open = true) {
  weekPlannerOpen = open;
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  weekPlannerSubs.forEach((f) => f());
}
export function isWeekPlannerOpen(): boolean { return weekPlannerOpen; }
function useWeekPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); weekPlannerSubs.add(f); return () => { weekPlannerSubs.delete(f); }; }, []);
  return weekPlannerOpen;
}

/** G7 parameter handoff payload for drilling into When to roll & PTA from My Week (or Load Check). */
export interface RolloutPrefill {
  apptDate?: string;
  apptTime?: string;
  apptTimeZone?: string;
  distanceMode?: DistanceMode;
  miles?: number;
  mph?: number;
  driveMinutes?: number;
  bufferMinutes?: number;
  dockMinutes?: number;
  preTripMinutes?: number;
  returnToMyWeek?: boolean;
  /** H4: Prior planned loads' simulated segments & cursor from My Week chain. */
  chainedPriorSegments?: Segment[];
  chainedCursor?: number;
  chainedFromLabel?: string;
  /** B3 (receptionfix2): My Week custom ELD clocks & synthesized base carried into drill-downs (Load 1 & Load 2+). */
  chainedCustomClocks?: EldClocks;
  chainedBaseSegments?: Segment[];
}
let pendingRolloutPrefill: RolloutPrefill | null = null;
let rolloutReturnToMyWeek = false;

/**
 * Reactive sub-screen flag for the Work-Backwards Appointment & Departure Planner ("When to roll & PTA").
 * Held outside `store.ts` (store is frozen) in the exact style of `useWeekPlanner()` above.
 */
let rolloutPlannerOpen = false;
const rolloutPlannerSubs = new Set<() => void>();
export function openRolloutPlanner(open = true, prefill?: RolloutPrefill) {
  rolloutPlannerOpen = open;
  if (open) {
    pendingRolloutPrefill = prefill ?? null;
    rolloutReturnToMyWeek = Boolean(prefill?.returnToMyWeek);
  } else {
    pendingRolloutPrefill = null;
    rolloutReturnToMyWeek = false;
  }
  if (!open && currentSheet()?.kind === 'rollouttime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  rolloutPlannerSubs.forEach((f) => f());
}
export function isRolloutPlannerOpen(): boolean { return rolloutPlannerOpen; }
function useRolloutPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); rolloutPlannerSubs.add(f); return () => { rolloutPlannerSubs.delete(f); }; }, []);
  return rolloutPlannerOpen;
}

/** G7 parameter handoff payload for drilling into Split-sleeper rescue from My Week. */
export interface RescuePrefill {
  dockWaitMinutes?: number;
  distanceMode?: RescueDistanceMode;
  miles?: number;
  mph?: number;
  driveMinutes?: number;
  deadlineMinute?: number | null;
  returnToMyWeek?: boolean;
  /** H4: Prior planned loads' simulated segments & cursor from My Week chain. */
  chainedPriorSegments?: Segment[];
  chainedCursor?: number;
  chainedFromLabel?: string;
  /** B3 (receptionfix2): My Week custom ELD clocks & synthesized base carried into drill-downs (Load 1 & Load 2+). */
  chainedCustomClocks?: EldClocks;
  chainedBaseSegments?: Segment[];
}
let pendingRescuePrefill: RescuePrefill | null = null;
let rescueReturnToMyWeek = false;

/**
 * Reactive sub-screen flag for the Split-Sleeper Rescue Simulator ("Split-sleeper rescue").
 * Held outside `store.ts` (store is frozen) in the exact style of `useWeekPlanner()` / `useRolloutPlanner()`.
 */
let rescuePlannerOpen = false;
const rescuePlannerSubs = new Set<() => void>();
export function openRescuePlanner(open = true, prefill?: RescuePrefill) {
  rescuePlannerOpen = open;
  if (open) {
    pendingRescuePrefill = prefill ?? null;
    rescueReturnToMyWeek = Boolean(prefill?.returnToMyWeek);
  } else {
    pendingRescuePrefill = null;
    rescueReturnToMyWeek = false;
  }
  if (!open && currentSheet()?.kind === 'rescuetime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  rescuePlannerSubs.forEach((f) => f());
}
export function isRescuePlannerOpen(): boolean { return rescuePlannerOpen; }
function useRescuePlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); rescuePlannerSubs.add(f); return () => { rescuePlannerSubs.delete(f); }; }, []);
  return rescuePlannerOpen;
}

/**
 * Reactive sub-screen flag for Stack My Stops & Loads (Multi-Stop & Pre-Plan Chain Checker).
 * Held outside `store.ts` (store is frozen) in the exact style of the other Plan tools.
 */
let stackPlannerOpen = false;
const stackPlannerSubs = new Set<() => void>();
export function openStackPlanner(open = true) {
  stackPlannerOpen = open;
  if (!open && currentSheet()?.kind === 'stacktime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  stackPlannerSubs.forEach((f) => f());
}
export function isStackPlannerOpen(): boolean { return stackPlannerOpen; }
function useStackPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); stackPlannerSubs.add(f); return () => { stackPlannerSubs.delete(f); }; }, []);
  return stackPlannerOpen;
}

/**
 * Reactive sub-screen flag for Do I Make It Back or Motel? (Meet-and-Turn & Relay Wait Cutoff Timer).
 * Held outside `store.ts` (store is frozen) in the exact style of the other Plan tools.
 */
let motelPlannerOpen = false;
const motelPlannerSubs = new Set<() => void>();
export function openMotelPlanner(open = true) {
  motelPlannerOpen = open;
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  motelPlannerSubs.forEach((f) => f());
}
export function isMotelPlannerOpen(): boolean { return motelPlannerOpen; }
function useMotelPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); motelPlannerSubs.add(f); return () => { motelPlannerSubs.delete(f); }; }, []);
  return motelPlannerOpen;
}

/**
 * Reactive sub-screen flag for Can I Legally Use It? (3 AM HOS Exception Sanity Check).
 * Held outside `store.ts` (store is frozen) in the exact style of the other Plan tools.
 */
let legalPlannerOpen = false;
const legalPlannerSubs = new Set<() => void>();
export function openLegalPlanner(open = true) {
  legalPlannerOpen = open;
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  legalPlannerSubs.forEach((f) => f());
}
export function isLegalPlannerOpen(): boolean { return legalPlannerOpen; }
function useLegalPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); legalPlannerSubs.add(f); return () => { legalPlannerSubs.delete(f); }; }, []);
  return legalPlannerOpen;
}

/**
 * Reactive sub-screen flag for Flip My Clock (Shift-Start & Schedule-Flip Bridge Planner).
 * Held outside `store.ts` (store is frozen) in the exact style of the other Plan tools.
 */
let flipPlannerOpen = false;
const flipPlannerSubs = new Set<() => void>();
export function openFlipPlanner(open = true) {
  flipPlannerOpen = open;
  if (!open && currentSheet()?.kind === 'fliptime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  flipPlannerSubs.forEach((f) => f());
}
export function isFlipPlannerOpen(): boolean { return flipPlannerOpen; }
function useFlipPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); flipPlannerSubs.add(f); return () => { flipPlannerSubs.delete(f); }; }, []);
  return flipPlannerOpen;
}

/**
 * Reactive sub-screen flag for Miles Left in My 70 (Weekly Miles & Governed-Truck Cycle Pace Check).
 * Held outside `store.ts` (store is frozen) in the exact style of the other Plan tools.
 */
let milesPlannerOpen = false;
const milesPlannerSubs = new Set<() => void>();
export function openMilesPlanner(open = true) {
  milesPlannerOpen = open;
  if (!open && currentSheet()?.kind === 'milestime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && myWeekPlannerOpen) {
    myWeekPlannerOpen = false;
    myWeekPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  milesPlannerSubs.forEach((f) => f());
}
export function isMilesPlannerOpen(): boolean { return milesPlannerOpen; }
function useMilesPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); milesPlannerSubs.add(f); return () => { milesPlannerSubs.delete(f); }; }, []);
  return milesPlannerOpen;
}

/**
 * Reactive sub-screen flag for My Week (Master Week Synthesizer — Plan capstone tool).
 */
let myWeekPlannerOpen = false;
const myWeekPlannerSubs = new Set<() => void>();
export function openMyWeekPlanner(open = true) {
  myWeekPlannerOpen = open;
  if (!open && currentSheet()?.kind === 'myweektime') openSheet(null);
  if (open && weekPlannerOpen) {
    weekPlannerOpen = false;
    weekPlannerSubs.forEach((f) => f());
  }
  if (open && rolloutPlannerOpen) {
    rolloutPlannerOpen = false;
    rolloutPlannerSubs.forEach((f) => f());
  }
  if (open && rescuePlannerOpen) {
    rescuePlannerOpen = false;
    rescuePlannerSubs.forEach((f) => f());
  }
  if (open && stackPlannerOpen) {
    stackPlannerOpen = false;
    stackPlannerSubs.forEach((f) => f());
  }
  if (open && motelPlannerOpen) {
    motelPlannerOpen = false;
    motelPlannerSubs.forEach((f) => f());
  }
  if (open && legalPlannerOpen) {
    legalPlannerOpen = false;
    legalPlannerSubs.forEach((f) => f());
  }
  if (open && flipPlannerOpen) {
    flipPlannerOpen = false;
    flipPlannerSubs.forEach((f) => f());
  }
  if (open && milesPlannerOpen) {
    milesPlannerOpen = false;
    milesPlannerSubs.forEach((f) => f());
  }
  if (open && getState().tab !== 'plan') setState({ tab: 'plan', planReturn: 'plan' });
  myWeekPlannerSubs.forEach((f) => f());
}
export function isMyWeekPlannerOpen(): boolean { return myWeekPlannerOpen; }
function useMyWeekPlanner(): boolean {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); myWeekPlannerSubs.add(f); return () => { myWeekPlannerSubs.delete(f); }; }, []);
  return myWeekPlannerOpen;
}

/** The planning tools, one big button each: a question a driver asks, not a tool name. */
function PlanTab({ s, now, ev, isActive = true }: { s: State; now: number; ev: FullEvaluation; isActive?: boolean }) {
  const lastHubRef = useRef<{ fp: string; snap: WeekHubSnapshot } | null>(null);
  const nonDoneCount = s.weekPlan.loads.filter((l) => !l.done).length;
  const hubFp = useMemo(() => {
    if (nonDoneCount === 0) return '';
    const { windowDays } = cycleParamsOf(s.config);
    return computeWeekHubFingerprint({
      segments: s.segments,
      current: s.current,
      now,
      config: s.config,
      mph: s.mph,
      draft: s.weekPlan,
      historyBasis: cycleBasis(s, now, windowDays),
    });
  }, [nonDoneCount, s.segments, s.current, s.config, s.mph, s.weekPlan, s.historyAcknowledged, s.seededAt, now]);

  type PlanHubDisplay = WeekHubSnapshot & { placeholder?: boolean };
  const weekSnap: PlanHubDisplay = useMemo(() => {
    if (nonDoneCount === 0) {
      lastHubRef.current = null;
      return {
        activeLoadCount: 0,
        staleLoadCount: 0,
        verdictStatus: 'all_clear',
        verdictTone: 'good',
        hubSummary: 'Stack 1–5 upcoming loads + home time — one chained verdict, priced conflicts, and Recaps vs. 34.',
        recommendedStrategy: 'recaps',
      };
    }
    if (!isActive) {
      if (lastHubRef.current && lastHubRef.current.fp === hubFp) return lastHubRef.current.snap;
      return {
        activeLoadCount: nonDoneCount,
        staleLoadCount: 0,
        verdictStatus: 'provisional',
        verdictTone: 'warn',
        hubSummary: `${nonDoneCount} load${nonDoneCount === 1 ? '' : 's'} planned — tap to review`,
        recommendedStrategy: 'recaps',
        placeholder: true,
      };
    }
    const { windowDays } = cycleParamsOf(s.config);
    const snap = getWeekHubSummary({
      segments: s.segments,
      current: s.current,
      now,
      config: s.config,
      mph: s.mph,
      draft: s.weekPlan,
      historyBasis: cycleBasis(s, now, windowDays),
    });
    lastHubRef.current = { fp: hubFp, snap };
    return snap;
  }, [isActive, nonDoneCount, hubFp]);

  const hasWeekContent = weekSnap.activeLoadCount > 0 || weekSnap.staleLoadCount > 0;
  const capstoneTone = !hasWeekContent || weekSnap.placeholder ? '' : ` tone-${weekSnap.verdictTone}`;
  const capstonePill =
    !hasWeekContent
      ? '1–5 loads'
      : weekSnap.placeholder
        ? 'Review'
        : weekSnap.verdictStatus === 'all_clear'
          ? 'All clear'
          : weekSnap.verdictStatus === 'conflict'
            ? 'Conflict'
            : weekSnap.verdictStatus === 'provisional'
              ? 'Provisional'
              : 'Tight';

  const item = (tab: State['tab'], icon: string, title: string, sub: string) => (
    <button class="plan-item" data-plan-tool={tab} onClick={() => setState({ tab, planReturn: 'plan' })}>
      <span class="plan-icon"><Icon d={icon} size={26} /></span>
      <span class="plan-text"><b>{title}</b><span class="muted small">{sub}</span></span>
      <Icon d={I.next} />
    </button>
  );
  return (
    <>
      <h1 class="screen-title">Plan</h1>
      <button
        type="button"
        class={`plan-capstone${capstoneTone}`}
        data-myweek-entry="1"
        onClick={() => openMyWeekPlanner(true)}
      >
        <span class="plan-capstone-top">
          <span class="plan-capstone-kicker">Your Week Ahead</span>
          <span class={`plan-capstone-pill${capstoneTone}`}>{capstonePill}</span>
        </span>
        <span class="plan-capstone-main">
          <span class="plan-capstone-icon"><Icon d={I.myweek} size={26} /></span>
          <span>
            <b class="plan-capstone-title">My Week</b>
            <span class="plan-capstone-sub">{weekSnap.hubSummary}</span>
          </span>
          <Icon d={I.next} />
        </span>
      </button>
      {/* Navy1 UI overhaul (B1): group the 12 planning tools by driver time-horizon so a tired
          driver at 3 AM finds the right answer by question, not by scanning a 12-item flat dump. */}
      <h2 class="plan-section-head">Right now</h2>
      <div class="plan-rack" data-plan-group="now">
        <button class="plan-item" data-plan-tool="legal" onClick={() => openLegalPlanner(true)}>
          <span class="plan-icon"><Icon d={I.legal} size={26} /></span>
          <span class="plan-text"><b>Can I Legally Use It?</b><span class="muted small">3 AM HOS exception check — Adverse, PC, Yard Move, 16-hr Big Day, Safe Haven.</span></span>
          <Icon d={I.next} />
        </button>
        <button class="plan-item" data-plan-tool="rescue" onClick={() => openRescuePlanner(true)}>
          <span class="plan-icon"><Icon d={I.rescue} size={26} /></span>
          <span class="plan-text"><b>Split-sleeper rescue</b><span class="muted small">Stuck at the dock? Compare a straight 10 against 7/3 and 8/2 splits before you commit.</span></span>
          <Icon d={I.next} />
        </button>
        <button class="plan-item" data-plan-tool="motel" onClick={() => openMotelPlanner(true)}>
          <span class="plan-icon"><Icon d={I.motel} size={26} /></span>
          <span class="plan-text"><b>Do I Make It Back or Motel?</b><span class="muted small">Meet-and-turn or relay wait? Exact walk-away minute to make home terminal legal.</span></span>
          <Icon d={I.next} />
        </button>
      </div>

      <h2 class="plan-section-head">This load</h2>
      <div class="plan-rack" data-plan-group="load">
        {item('load', I.truck, 'Can I take this load?', 'Four quick questions, get a yes or no.')}
        <button class="plan-item" data-plan-tool="rollout" onClick={() => openRolloutPlanner(true)}>
          <span class="plan-icon"><Icon d={I.rollout} size={26} /></span>
          <span class="plan-text"><b>When to roll &amp; PTA</b><span class="muted small">Work backwards from a hard appointment for shutdown, roll-out, break, and dispatch PTA.</span></span>
          <Icon d={I.next} />
        </button>
        {item('trip', I.route, 'Plan a run', 'Where you will need to rest, three ways, and where to park now.')}
        <button class="plan-item" data-plan-tool="stack" onClick={() => openStackPlanner(true)}>
          <span class="plan-icon"><Icon d={I.stack} size={26} /></span>
          <span class="plan-text"><b>Stack my stops &amp; loads</b><span class="muted small">Chain 2–5 stops or back-to-back pre-plans — see where clocks break and how to rescue.</span></span>
          <Icon d={I.next} />
        </button>
      </div>

      <h2 class="plan-section-head">This shift</h2>
      <div class="plan-rack" data-plan-group="shift">
        {item('split', I.bunk, 'Plan a sleeper split', 'Try the two breaks before you take them.')}
        <button class="plan-item" data-plan-tool="flip" onClick={() => openFlipPlanner(true)}>
          <span class="plan-icon"><Icon d={I.flip} size={26} /></span>
          <span class="plan-text"><b>Flip My Clock</b><span class="muted small">Shift your roll-out onto a 21:00, 00:01, 03:00, or custom start window — compare legal bridges.</span></span>
          <Icon d={I.next} />
        </button>
      </div>

      <h2 class="plan-section-head">This week</h2>
      <div class="plan-rack" data-plan-group="week">
        {/* Capstone C3 (D10-A): one of the two founding workflows leaves the settings drawer. */}
        {item('recap', I.recap, 'Hours coming back', `When your ${ev.cycle.limit / 60}-hour hours return, day by day.`)}
        <button class="plan-item" data-plan-tool="week" onClick={() => openWeekPlanner(true)}>
          <span class="plan-icon"><Icon d={I.week} size={26} /></span>
          <span class="plan-text"><b>Weekly recap vs. 34</b><span class="muted small">Compare recaps against a 34-hour reset and plan home time.</span></span>
          <Icon d={I.next} />
        </button>
        <button class="plan-item" data-plan-tool="miles" onClick={() => openMilesPlanner(true)}>
          <span class="plan-icon"><Icon d={I.miles} size={26} /></span>
          <span class="plan-text"><b>Miles Left in My 70</b><span class="muted small">Convert remaining cycle + recaps through pay-week cutoff into max legal miles.</span></span>
          <Icon d={I.next} />
        </button>
      </div>
    </>
  );
}

/* ============================================================ Split Lab */

/* ============================================================ Split Lab draft undo */

/**
 * One level of undo for the Split Lab DRAFT (capstone C1, audit §2.4): replacing the
 * whole draft at once — "Try an example split", or a lever sheet's [Try it in Split Lab]
 * pre-fill — keeps the draft it replaced behind one Undo. It is the DRAFT only: nothing
 * here touches the log or the what-if rows. Any other draft change (a slider, a toggle)
 * retires the offer, the Log undo's N2 rule: restoring a whole snapshot after the driver
 * has since changed the draft would throw that later change away without a word.
 * Module state, like the Log's undo; not persisted — a replaced draft is a moment's
 * second thought, not part of the record.
 */
let splitDraftBefore: SplitDraft | null = null;
/** What the pending draft undo says it undoes ("Draft replaced." for a whole-draft load, "Draft changed." for a fix). */
let splitDraftUndoLabel = 'Draft replaced.';
/** Keep the current Split draft behind one undo (shared by every replace path). */
export function snapshotSplitDraft(label = 'Draft replaced.') { loadDraftBefore = null; splitDraftBefore = { ...getState().split }; splitDraftUndoLabel = label; }
/** Replace the whole Split draft, keeping the replaced one behind one undo. */
export function replaceSplitDraft(next: SplitDraft, label?: string) {
  snapshotSplitDraft(label);
  setState({ split: { ...next } });
}
export function undoSplitDraft(): boolean {
  if (!splitDraftBefore) return false;
  const b = splitDraftBefore;
  splitDraftBefore = null;
  setState({ split: b });
  return true;
}
export function splitDraftUndoPending(): boolean { return splitDraftBefore !== null; }
export function clearSplitDraftUndo() { splitDraftBefore = null; }

/*
 * The same one-level DRAFT undo, shared by the load check's fix (capstone C3, audit §3 M4):
 * "Plan it" replaces the load draft's departure and keeps the draft it replaced behind the one
 * Undo. One level for both drafts: the newest draft replace owns the slot (a load fix retires
 * a pending Split undo and the other way round), and any other change to the load draft
 * retires the offer (the N2 rule above). Draft only — never the log, never persisted.
 */
let loadDraftBefore: LoadCheckDraft | null = null;
export function replaceLoadDraft(patch: Partial<LoadCheckDraft>) {
  splitDraftBefore = null;
  loadDraftBefore = { ...getState().loadCheck };
  setState({ loadCheck: { ...getState().loadCheck, ...patch } });
}
export function undoLoadDraft(): boolean {
  if (!loadDraftBefore) return false;
  const b = loadDraftBefore;
  loadDraftBefore = null;
  setState({ loadCheck: b });
  return true;
}
export function loadDraftUndoPending(): boolean { return loadDraftBefore !== null; }
export function clearLoadDraftUndo() { loadDraftBefore = null; }
/** Any ordinary change to the load draft: it retires a pending load-fix undo first (N2). */
export function editLoadDraft(patch: Partial<LoadCheckDraft>) {
  clearLoadDraftUndo();
  setState({ loadCheck: { ...getState().loadCheck, ...patch } });
}

/* ============================================================ Split Lab plan (capstone C2, P7 + M4) */

export type SplitBlockKey = 'b1' | 'dwell' | 'drive' | 'b2';
/** The Lab's own ranges, the sliders' and the store sanitizer's. */
export const SPLIT_BLOCK_MAX: Record<SplitBlockKey, number> = { b1: 600, dwell: 240, drive: 660, b2: 600 };

/**
 * The Split Lab's plan and everything the screen says about it, from one place: the
 * strip, the bar, the cards and the block sheet all read this, so a fix button can never
 * be computed from a different plan than the bar shows. The construction is the one the
 * screen has always used (plan rows from the end of the log; `after` at the instant
 * Break 2 ends; the #14 window-end formula) — moved, not changed. Pure.
 */
export function splitScenario(s: State, now: number, ev: FullEvaluation) {
  const sd = s.split;
  const { b1, b1s, dwell, drive, b2, b2s } = sd;
  const base = allSegments(s, now).filter((x) => !x.tentative);
  // The record in time order with overlaps resolved. `base` is in the order rows were ENTERED, so its last
  // row is not the latest one once a forgotten entry has been added (re-check M9).
  const timeline = normalize(base);
  const t0 = Math.max(now, ...base.map((x) => x.end));
  const plan: Segment[] = [];
  let t = t0;
  const push = (status: DutyStatus, m: number, note: string) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
  push(b1s, b1, 'Break 1'); push('ON', dwell, 'On duty'); push('D', drive, 'Drive'); push(b2s, b2, 'Break 2');
  const endB1 = t0 + b1, endDwell = t0 + b1 + dwell, endDrive = t0 + b1 + dwell + drive, endB2 = t;

  // Evaluate at the instant Break 2 ends — every result card on this screen describes that
  // moment. Using endB2 + 1 put "stop by" a minute past the stated evaluation time (consumer-review-1).
  const after = evaluate([...base, ...plan], { asOf: endB2, config: safeRulesConfig(s.config) });
  const atDriveEnd = evaluate([...base, ...plan.filter((r) => r.note !== 'Break 2')], { asOf: endDrive, config: safeRulesConfig(s.config) });
  const paired = after.shift.chain.length >= 2 && after.shift.chain[after.shift.chain.length - 1].end === endB2;
  // The pinned now-vs-after line (patch #14): the END of the 14-hour window itself, from the
  // same two evaluations this screen already makes. Paired rests after the anchor are
  // excluded from the 14, so the true window end is anchor + window + excluded — which is
  // asOf + window − windowUsed on each evaluation (windowUsed already nets the exclusions
  // out). Unclamped on purpose: an expired window shows its true past end, not "now". Never
  // mustStopBy: that folds in the drive and break limits, which are not what the line claims.
  const windowEndNow = ev.asOf + ev.shift.limits.window - ev.shift.windowUsed;
  const windowEndAfter = after.asOf + after.shift.limits.window - after.shift.windowUsed;
  const longOk = (b1s === 'SB' && b1 >= LIMITS.SPLIT_MIN_SB) || (b2s === 'SB' && b2 >= LIMITS.SPLIT_MIN_SB);
  const totalOk = b1 + b2 >= LIMITS.SPLIT_TOTAL;
  const planViol = after.violations.filter((v) => v.start >= t0);
  const strictViol = atDriveEnd.noSplit.violations.filter((v) => v.start >= t0);
  return { sd, base, timeline, t0, plan, endB1, endDwell, endDrive, endB2, after, atDriveEnd, paired, windowEndNow, windowEndAfter, longOk, totalOk, planViol, strictViol };
}
export type SplitScenario = ReturnType<typeof splitScenario>;

/**
 * M4 fix-it buttons (audit §3): one per ✗ in "Does it pair?", each a DRAFT patch with
 * the value set exactly — the engine then re-evaluates and the bar shows the truth.
 * `block` is the bar block whose sheet carries the button. The merged-reset warning's
 * fix is not built: it needs a new draft field (a leading on-duty stretch), which the
 * audit flags as skippable when it fights the draft shape — it does (the draft is a
 * persisted, sanitized object with a fixed key set).
 */
export interface SplitFix { id: 'short2h' | 'sleeper7' | 'total10' | 'shortenDrive'; block: SplitBlockKey; label: string; patch: Partial<SplitDraft> }
export function splitFixes(s: State, sc: SplitScenario): SplitFix[] {
  const { b1, b2, dwell, drive } = sc.sd;
  const out: SplitFix[] = [];
  if (!(b1 >= 120 && b2 >= 120)) {
    const k = b1 <= b2 ? 'b1' : 'b2';
    out.push({ id: 'short2h', block: k, label: 'Make the shorter break 2h', patch: { [k]: 120 } });
  }
  if (!sc.longOk) out.push({ id: 'sleeper7', block: 'b2', label: 'Make Break 2 sleeper, 7h', patch: { b2s: 'SB', b2: Math.max(b2, 420) } });
  if (!sc.totalOk) out.push({ id: 'total10', block: 'b1', label: `Add ${dur(600 - b1 - b2)} to Break 1`, patch: { b1: b1 + (600 - b1 - b2) } });
  if (sc.planViol.length > 0) {
    // The engine's own driving time at the end of Break 1 + the on-duty stretch (one extra evaluate).
    const lead = sc.plan.filter((r) => r.note === 'Break 1' || r.note === 'On duty');
    const room = Math.max(0, Math.min(SPLIT_BLOCK_MAX.drive, evaluate([...sc.base, ...lead], { asOf: sc.endDwell, config: safeRulesConfig(s.config) }).driveNow));
    if (room < drive) out.push({ id: 'shortenDrive', block: 'drive', label: `Shorten the drive to ${dur(room)}`, patch: { drive: room } });
  }
  return out;
}
/**
 * D14 (audit): the example split sized to this driver's day. The canonical 7/3 example
 * (DEFAULT_SPLIT) keeps its breaks; when its 5h drive would run over from where this log ends,
 * the drive is cut to the Lab's own "Shorten the drive" answer, so the planner never opens on
 * a red plan built from numbers the driver never chose. Falls back to the plain example when
 * the shortened plan still fails or leaves no drive at all. Pure: reads, writes nothing.
 */
export function fittedExample(s: State, now: number, ev: FullEvaluation): SplitDraft {
  const base: SplitDraft = { ...DEFAULT_SPLIT };
  const st = { ...s, split: base };
  const sc = splitScenario(st, now, ev);
  if (!sc.planViol.length) return base;
  const fix = splitFixes(st, sc).find((f) => f.id === 'shortenDrive');
  if (!fix || !fix.patch.drive) return base;
  const next: SplitDraft = { ...base, ...fix.patch };
  return splitScenario({ ...s, split: next }, now, ev).planViol.length ? base : next;
}
const sameDraft = (a: SplitDraft, b: SplitDraft) => (Object.keys(DEFAULT_SPLIT) as (keyof SplitDraft)[]).every((k) => a[k] === b[k]);
/** Apply a fix: the draft only, behind the Lab's one-level draft undo. Never the log. */
export function applySplitFix(fix: SplitFix) {
  replaceSplitDraft({ ...getState().split, ...fix.patch }, 'Draft changed.');
}

/** "3h", "3h 15m", "30m" — block labels are short; the cards keep dur()'s full form. */
const shortDur = (m: number): string => { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`; };

/** Plan mode's data (audit §2.5): the four blocks, the 14-hour band's two markers, the pair bracket, the overruns. */
export interface PlanBlock { key: SplitBlockKey; status: DutyStatus; minutes: number; label: string; name: string; len: string; aria: string }
export interface PlanAxis {
  blocks: PlanBlock[];
  /** The 14-hour band: where the 14 ends now (ghost) and with this plan (solid). */
  windowNow: number; windowAfter: number; afterWord: string;
  paired: boolean; bracket: string;
  /** Overrun intervals, hatched in place on the bar. */
  hatch: { start: number; end: number; label: string }[];
  onBlock: (k: SplitBlockKey) => void;
}
export function splitPlanAxis(sc: SplitScenario, onBlock: (k: SplitBlockKey) => void): PlanAxis {
  const { b1, b1s, dwell, drive, b2, b2s } = sc.sd;
  const rest = (st: 'OFF' | 'SB') => (st === 'SB' ? 'sleeper' : 'off duty');
  return {
    blocks: [
      { key: 'b1', status: b1s, minutes: b1, label: `B1 ${b1s} ${shortDur(b1)}`, name: `B1 ${b1s}`, len: shortDur(b1), aria: `Break 1, ${rest(b1s)}, ${dur(b1)}. Change` },
      { key: 'dwell', status: 'ON', minutes: dwell, label: `On ${shortDur(dwell)}`, name: 'On', len: shortDur(dwell), aria: `On duty, ${dur(dwell)}. Change` },
      { key: 'drive', status: 'D', minutes: drive, label: `Drive ${shortDur(drive)}`, name: 'Drive', len: shortDur(drive), aria: `Drive, ${dur(drive)}. Change` },
      { key: 'b2', status: b2s, minutes: b2, label: `B2 ${b2s} ${shortDur(b2)}`, name: `B2 ${b2s}`, len: shortDur(b2), aria: `Break 2, ${rest(b2s)}, ${dur(b2)}. Change` },
    ],
    windowNow: sc.windowEndNow, windowAfter: sc.windowEndAfter, afterWord: sc.paired ? 'with pair' : 'with plan',
    paired: sc.paired,
    bracket: `${sc.paired ? 'pair ✓' : 'no pair ✕'} ${shortDur(b1)} + ${shortDur(b2)} = ${shortDur(b1 + b2)}`,
    hatch: sc.planViol.map((v) => ({ start: v.start, end: Math.max(v.end, v.start + v.minutes), label: `${limitName(v.kind, sc.after)} by ${dur(v.minutes)}` })),
    onBlock,
  };
}

/**
 * TimeAxis in plan mode (audit §2.5): one 56px bar of four tappable blocks on the same
 * left-to-right clock scale, the 14-hour band's two markers above it, the pair bracket
 * under it, and every overrun hatched IN PLACE over the stretch of the bar that breaks
 * the limit. A block narrower than a label moves its label under the bar on a leader
 * line; every block keeps a 48px hit area however short it is. Status is carried by an
 * icon and the label's own words, the stripe colour is a second cue only.
 */
function PlanBar({ from, plan, twin }: { from: number; plan: PlanAxis; twin: string }) {
  const total = plan.blocks.reduce((a, b) => a + b.minutes, 0);
  const span = Math.max(total, 1);
  const pct = (m: number) => Math.max(0, Math.min(100, ((m - from) / span) * 100));
  let at = 0;
  const cells = plan.blocks.map((b, i) => {
    // An empty plan has no lengths to scale by: four equal placeholders keep every block tappable.
    const left = total === 0 ? i * 25 : (at / span) * 100;
    const width = total === 0 ? 25 : (b.minutes / span) * 100;
    at += b.minutes;
    // Under ~40px at phone width the label goes under the bar; up to ~30% it stacks without the icon.
    return { b, left, width, short: width < 14, compact: width >= 14 && width < 30 };
  });
  const mark = (m: number) => ({ left: `${pct(m)}%` });
  const off = (m: number) => (m > from + span ? ' →' : m < from ? ' ←' : '');
  return (
    <div class="taxis-plan">
      <p class="vh">{twin}</p>
      <div class="plan-band" aria-hidden="true">
        <span class="plan-key ghost">14 ends {laneValue(plan.windowNow, from)} now{off(plan.windowNow)}</span>
        <span class="plan-key">{laneValue(plan.windowAfter, from)} {plan.afterWord}{off(plan.windowAfter)}</span>
      </div>
      <div class={`plan-bar ${total === 0 ? 'empty' : ''}`}>
        {cells.map(({ b, left, width, short, compact }) => (
          <button key={b.key} class={`pblock pblock-${b.key} ${short ? 'short' : ''} ${compact ? 'compact' : ''} ${b.minutes === 0 ? 'zero' : ''}`} data-block={b.key}
            style={`left: ${left}%; width: ${width}%; --led: ${STATUS_COLOR[b.status]}`} aria-label={b.aria} onClick={() => plan.onBlock(b.key)}>
            {!short && (compact
              ? <span class="pblock-in"><span class="pblock-t">{b.name}</span><span class="pblock-t">{b.len}</span></span>
              : <span class="pblock-in"><Icon d={STATUS_ICON[b.status]} size={16} /><span class="pblock-t">{b.label}</span></span>)}
          </button>
        ))}
        {plan.hatch.map((h, i) => <span key={`h${i}`} class="plan-hatch" title={`over the ${h.label}`} style={`left: ${pct(h.start)}%; width: ${Math.max(0, pct(h.end) - pct(h.start))}%; --row: ${i}`} />)}
        <span class="plan-mark ghost" style={mark(plan.windowNow)} />
        <span class="plan-mark" style={mark(plan.windowAfter)} />
      </div>
      {cells.some((c) => c.short) && (
        <div class="plan-leads" aria-hidden="true">
          {cells.filter((c) => c.short).map(({ b, left, width }) => {
            const mid = Math.max(0, Math.min(100, left + width / 2));
            return <span key={b.key} class="plan-lead" style={`left: ${mid}%; transform: translateX(-${mid}%)`}>{b.label}</span>;
          })}
        </div>
      )}
      <div class={`plan-bracket ${plan.paired ? 'ok' : 'no'}`} aria-hidden="true"><span>{plan.bracket}</span></div>
    </div>
  );
}

/**
 * The strip sentence (audit §2.5, sanction S4, decision C5-A). A clean plan keeps the
 * patch-14 now-vs-after line and gains what is left to drive after Break 2; a plan that
 * runs over a limit REPLACES it with the ✕ form naming every overrun — the words "with
 * this pair" never stand over a plan that breaks a limit.
 */
function SplitLine({ sc }: { sc: SplitScenario }) {
  if (sc.planViol.length > 0) {
    return <><b class="sna-x">✕</b> <b>{sc.paired ? 'Pairs, but this plan runs over:' : 'No split credit, and this plan runs over:'}</b> {overrunList(sc.planViol, sc.after)}</>;
  }
  return <>Your 14 ends <b>{clock(sc.windowEndNow)}</b> now → <b>{clock(sc.windowEndAfter)}</b> {sc.paired ? 'with this pair' : 'with this plan (no split credit)'} · {dur(sc.after.driveNow)} drive after</>;
}

/** The exact-number box of a block sheet: validated, never silently substituted (the Slider's own rule). */
function ExactMinutes({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  // A4 (audit): hours + minutes, not a raw-minutes box ("300" for 5h).
  const { boxes, note } = useDurationBoxes(label, value, 0, max, onChange);
  return (
    <div class="pb-exact">
      <div class="qs-row"><span class="qs-label">Exact length</span>{boxes}</div>
      {note && <div class="warnbox small">{note}</div>}
    </div>
  );
}

const BLOCK_TITLE: Record<SplitBlockKey, string> = { b1: 'Break 1', dwell: 'On duty (dock, fuel)', drive: 'Drive', b2: 'Break 2' };

/**
 * Tap a block → this sheet (audit §2.5, decision C4-A): the block's status toggle where
 * it has one, 56px −60 / −15 / +15 / +60 steppers and the exact number box — no drag in
 * this build. The fix buttons for the ✗ lines this block can mend sit here too (M4).
 * Everything here edits the DRAFT; nothing reaches the log.
 */
function SplitBlockSheet({ s, now, ev, block, closing = false }: { s: State; now: number; ev: FullEvaluation; block: SplitBlockKey; closing?: boolean }) {
  const sc = splitScenario(s, now, ev);
  const value = s.split[block], max = SPLIT_BLOCK_MAX[block];
  // A stepper, the box or the toggle is an ordinary draft edit: it retires a pending
  // draft undo (the N2 rule — an undo must never throw away later work).
  const edit = (p: Partial<SplitDraft>) => { clearSplitDraftUndo(); setState({ split: { ...getState().split, ...p } }); };
  const set = (v: number) => edit({ [block]: Math.max(0, Math.min(max, Math.round(v))) });
  const statusKey = block === 'b1' ? 'b1s' : block === 'b2' ? 'b2s' : null;
  const fixes = splitFixes(s, sc).filter((f) => f.block === block);
  return (
    <Sheet title={`${BLOCK_TITLE[block]} · ${dur(value)}`} closing={closing}>
      {statusKey && <Toggle options={[['OFF', STATUS_LABEL.OFF], ['SB', STATUS_LABEL.SB]]} value={s.split[statusKey]} onChange={(v) => edit({ [statusKey]: v })} />}
      <div class="pb-steps" role="group" aria-label={`${BLOCK_TITLE[block]} length`}>
        {[-60, -15, 15, 60].map((d) => (
          <button key={d} class="pb-step" disabled={d < 0 ? value <= 0 : value >= max} aria-label={`${d < 0 ? 'Shorten' : 'Lengthen'} ${BLOCK_TITLE[block]} by ${Math.abs(d)} min`} onClick={() => set(value + d)}>{d < 0 ? '−' : '+'}{Math.abs(d)}</button>
        ))}
      </div>
      <ExactMinutes label={BLOCK_TITLE[block]} value={value} max={max} onChange={set} />
      <p class="trust pb-result" data-tone={sc.planViol.length ? 'bad' : undefined}><SplitLine sc={sc} /></p>
      {fixes.map((f) => <button key={f.id} class="wide fix" data-fix={f.id} onClick={() => applySplitFix(f)}>{f.label}</button>)}
      {splitDraftUndoPending() && (
        <div class="row undo">
          <span>{splitDraftUndoLabel}</span>
          <button class="mini" onClick={() => undoSplitDraft()}>Undo</button>
        </div>
      )}
      <button class="primary wide" data-first onClick={() => openSheet(null)}>Done</button>
    </Sheet>
  );
}

function SplitTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  // The what-if lives in the store: a detour to the Log tab used to reset the plan being compared.
  const sd = s.split;
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const effState = useMemo(() => {
    if (!customClocks) return s;
    const seed = synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0);
    return { ...s, segments: seed.segments, tentative: [], current: null };
  }, [s, customClocks, now]);
  const effEv = useMemo(
    () => (customClocks ? evaluate(effState.segments, { asOf: now, config: safeRulesConfig(s.config) }) : ev),
    [customClocks, effState, now, s.config, ev],
  );
  // A partial carrying every draft key is a whole-draft load ("Try an example split"):
  // it keeps the draft it replaces behind the one-level undo (audit §2.4). Any partial
  // edit — a slider, a toggle — retires the offer instead (the Log undo's N2 rule).
  const setSplit = (p: Partial<SplitDraft>) => {
    if (Object.keys(DEFAULT_SPLIT).every((k) => k in p)) snapshotSplitDraft(); else clearSplitDraftUndo();
    setState({ split: { ...sd, ...p } });
  };
  // D14 (audit): a draft nobody has touched yet (still the stock example) opens fitted to the
  // day, once, on arrival — never over a draft the driver has shaped.
  useEffect(() => {
    if (!sameDraft(getState().split, DEFAULT_SPLIT)) return;
    const f = fittedExample(getState(), now, ev);
    if (!sameDraft(f, DEFAULT_SPLIT)) setState({ split: f });
  }, []);
  const { b1, b1s, dwell, drive, b2, b2s } = sd;
  const sc = useMemo(() => splitScenario(effState, now, effEv), [effState, now, effEv]);
  const { timeline, t0, plan, endDrive, endB2, after, paired, longOk, totalOk, planViol, strictViol } = sc;
  const sh = safeHaven(after, s.mph);
  // The pair the clocks use now, and the rest that could start the next one — shown as two different
  // things. Side by side as "Period A … counts against your 14" and "Active split", a tester read them
  // as a contradiction (2026-11-04): the clocks were excluding the very rest that line said counted.
  const activeNow = activePair(effEv);
  const pl = effEv.shift.pendingSplitLeg;
  const nextLeg = activeNow && pl && pl.start === activeNow[1].start && pl.end === activeNow[1].end ? pl : null;
  const nextMin = nextLeg ? Math.max(nextLeg.qualifiesLongSB ? LIMITS.SPLIT_MIN_SHORT : LIMITS.SPLIT_MIN_SB, LIMITS.SPLIT_TOTAL - nextLeg.duration) : 0;
  const nextNeed = !nextLeg ? '' : nextLeg.qualifiesLongSB ? `a later rest of at least ${dur(nextMin)}`
    : nextMin <= LIMITS.SPLIT_MIN_SB ? 'a later rest with 7h+ in a row in the sleeper' : `a later rest of at least ${dur(nextMin)}, with 7h+ in a row in the sleeper`;

  // D13 (audit): putting the plan on the log answers back — an undo chip, and the button says
  // the plan is there (or offers to update it when the draft has changed since).
  // N1 (receptionfix2): never write an override-derived plan onto the live log while custom clocks are active.
  const PLAN_ON_LOG = 'Plan added to your log as what-if';
  const commit = () => {
    if (customClocks) return;
    undoable(PLAN_ON_LOG, () => setState({ tentative: plan }));
  };
  const clear = () => setState({ tentative: [] });
  const undo = useUndo();
  const planOnLog = s.tentative.length === plan.length && plan.length > 0
    && plan.every((r, i) => s.tentative[i].status === r.status && s.tentative[i].start === r.start && s.tentative[i].end === r.end);
  // M4: each ✗ below carries its fix; the same fixes sit in the block sheets.
  const fixes = splitFixes(s, sc);
  const fixBtn = (id: SplitFix['id']) => {
    const f = fixes.find((x) => x.id === id);
    return f ? <button class="mini fix" data-fix={f.id} onClick={() => applySplitFix(f)}>{f.label}</button> : null;
  };
  const twin = `Plan from ${clock(t0)}: Break 1 ${b1s === 'SB' ? 'sleeper' : 'off duty'} ${dur(b1)}, on duty ${dur(dwell)}, drive ${dur(drive)}, Break 2 ${b2s === 'SB' ? 'sleeper' : 'off duty'} ${dur(b2)}. ${paired ? 'The two breaks pair.' : 'No split credit.'}${planViol.length ? ` The plan runs over: ${overrunList(planViol, after)}.` : ''}`;

  return (
    <>
      <BackToPlan s={s} />
      <h1 class="screen-title">Plan a sleeper split</h1>
      <p class="muted small tool-sub">Try two rest breaks before you commit — see how they move your 14-hour window.</p>
      {/* P7 (audit §2.5): the strip is the time axis in plan mode — the sentence, then the
          one bar. The strip's own sticky slot is unchanged (P3). */}
      <div class="split-now-after" data-tone={planViol.length ? 'bad' : undefined}>
        <div class="sna-line" aria-live="polite"><SplitLine sc={sc} /></div>
        <TimeAxis from={t0} lanes={[]} twin={twin} plan={splitPlanAxis(sc, (k) => openSheet({ kind: 'splitblock', block: k }))} />
      </div>
      {splitDraftUndoPending() && (
        <div class="row undo">
          <span>{splitDraftUndoLabel}</span>
          <button class="mini" onClick={() => undoSplitDraft()}>Undo</button>
        </div>
      )}
      <Card title="Current pair status" tone={ev.shift.pendingSplitLeg && !activeNow ? 'warn' : undefined} statusBadge={ev.shift.pendingSplitLeg && !activeNow ? { tone: 'warn', label: '⚠ Pending' } : activeNow ? { tone: 'good', label: '✓ Active' } : undefined}>
        {/* Informational lines are neutral (.trust), not green: green means Driving (audit §2.5). */}
        {activeNow && <p class="trust"><b>Split in use:</b> {pairWords(activeNow)}. Your clocks count from {clock(ev.shift.anchor)}, the end of the first rest.</p>}
        {activeNow
          ? (nextLeg
            ? <p class="muted"><b>Next pair (optional):</b> your {clock(nextLeg.start)}–{clock(nextLeg.end)} rest ({dur(nextLeg.duration)} {nextLeg.longestSB >= nextLeg.duration ? 'sleeper' : nextLeg.longestSB > 0 ? 'sleeper and off duty' : 'off duty'}) can also be the first half of your next split. It needs {nextNeed}. This does not change the pair above.</p>
            : null)
          : ev.shift.pendingSplitLeg && ev.shift.pendingSplitLeg.isReset
          ? <p><b>Your {dur(ev.shift.pendingSplitLeg.duration)} rest included 7+ hours in the sleeper.</b> A later break of 2h+ can pair with it so that break won't count against your 14-hour window (FMCSA FAQ 22) — it won't add driving time, but it pauses your 14. Clocks below assume a plain 10-hour reset until you take that break.</p>
          : ev.shift.pendingSplitLeg
          ? <p><b>First half of a split logged:</b> {dur(ev.shift.pendingSplitLeg.duration)} ending {clock(ev.shift.pendingSplitLeg.end)} ({ev.shift.pendingSplitLeg.longestSB >= 420 ? '7h+ in the sleeper — pair with a 2h+ break later' : `pair with at least 7h straight in the sleeper, and ${dur(Math.max(120, 600 - ev.shift.pendingSplitLeg.duration))} or more to total 10h`}). Until you finish the second break, this time still <b>counts against your 14-hour window</b>.</p>
          : <p class="muted">No break of 2 hours or more logged yet since your clocks started at {clock(ev.shift.anchor)}.</p>}
        {!activeNow && ev.shift.chain.length >= 2 && <p class="trust">Active split: your clocks count from {clock(ev.shift.anchor)} (end of first paired rest).</p>}
      </Card>

      <Card title="What if… (starts at the end of your log)">
        <p class="muted small">Plan begins {clock(t0)}. Tap a block on the bar above to change it.</p>
        <button class="wide-btn" onClick={() => setSplit(fittedExample(s, now, ev))}>Start over with an example</button>
        {/* The four sliders stay, collapsed (audit §2.5): the bar's block sheets are the first way in. */}
        <details class="fine">
          <summary>Fine-tune</summary>
          <Toggle options={[['OFF', 'Break 1: Off duty'], ['SB', 'Break 1: Sleeper']]} value={b1s} onChange={(v) => setSplit({ b1s: v })} />
          <Slider label="Break 1 length" value={b1} min={0} max={600} step={15} onChange={(v) => setSplit({ b1: v })} fmt={dur} unit="min" />
          <Slider label="Then on-duty (dock, fuel)" value={dwell} min={0} max={240} step={15} onChange={(v) => setSplit({ dwell: v })} fmt={dur} unit="min" />
          <Slider label="Then drive" value={drive} min={0} max={660} step={15} onChange={(v) => setSplit({ drive: v })} fmt={dur} unit="min" />
          <Toggle options={[['SB', 'Break 2: Sleeper'], ['OFF', 'Break 2: Off duty']]} value={b2s} onChange={(v) => setSplit({ b2s: v })} />
          <Slider label="Break 2 length" value={b2} min={0} max={600} step={15} onChange={(v) => setSplit({ b2: v })} fmt={dur} unit="min" />
        </details>
      </Card>

      {/* Sanction S11 (decision C5-A): a green card promises a plan that pairs AND breaks no limit. */}
      <Card title="Does it pair?" tone={paired && planViol.length === 0 ? 'good' : 'bad'}>
        <ul class="checks">
          <li class={b1 >= 120 && b2 >= 120 ? 'ok' : 'no'}><Icon d={b1 >= 120 && b2 >= 120 ? I.check : I.x} size={16} />Both breaks ≥ 2h{fixBtn('short2h')}</li>
          <li class={longOk ? 'ok' : 'no'}><Icon d={longOk ? I.check : I.x} size={16} />One break ≥ 7h in the sleeper berth{fixBtn('sleeper7')}</li>
          <li class={totalOk ? 'ok' : 'no'}><Icon d={totalOk ? I.check : I.x} size={16} />Total ≥ 10h ({dur(b1 + b2)}){fixBtn('total10')}</li>
          <li class={paired ? 'ok' : 'no'}><Icon d={paired ? I.check : I.x} size={16} />The rules pair these two breaks</li>
          <li class={planViol.length === 0 ? 'ok' : 'no'}><Icon d={planViol.length === 0 ? I.check : I.x} size={16} />{planViol.length === 0 ? 'No plan violations' : `Plan runs over: ${overrunList(planViol, after)}`}{fixBtn('shortenDrive')}</li>
        </ul>
        {(b1 >= 600 || b2 >= 600) && <p class="trust">A break of 10h+ gives you a full reset on its own. If it has at least 7 hours straight in the sleeper, it can <i>also</i> pair with a later 2h+ break — whichever gives you more time (FMCSA FAQ 22).</p>}
        {!paired && b1 >= 120 && b2 >= 120 && longOk && totalOk && timeline.length > 0 && (timeline[timeline.length - 1].status === 'OFF' || timeline[timeline.length - 1].status === 'SB') && (() => {
          const lastWork = [...timeline].reverse().find((x) => x.status !== 'OFF' && x.status !== 'SB');
          const merged = b1 + (t0 - (lastWork ? lastWork.end : timeline[0].start));
          return <p class="warnbox small">Break 1 runs straight into the rest you're already in, making one {dur(merged)} rest — a full <b>reset</b>. A 10-hour rest can only count as the first half of a split if it has at least 7 hours straight in the <b>sleeper</b> (FMCSA FAQ 22); this one doesn't, so Break 2 will need its own 2–3h partner later. The clocks below show that honestly. To test a split, go on duty or drive first — or log the rest in the sleeper.</p>;
        })()}
      </Card>

      <Card title={`After Break 2 ends (${clock(endB2)})`}>
        <div class="clocks">
          {/* P3 (audit): "Drive now" only when the break or the window makes it differ from "Drive left". */}
          <Stat label="Drive left" value={dur(after.shift.driveRemaining)} tone={after.shift.driveRemaining < 60 ? 'bad' : ''} sub={after.driveNow === after.shift.driveRemaining ? bindingLabel(after) : undefined} />
          <Stat label="14-hr left" value={dur(after.shift.windowRemaining)} tone={after.shift.windowRemaining < 60 ? 'bad' : ''} />
          {after.driveNow !== after.shift.driveRemaining && <Stat label="Drive now" value={dur(after.driveNow)} sub={bindingLabel(after)} />}
          <Stat label={`Range @${s.mph}`} value={`${sh.miles} mi`} sub={`stop by ${clockFull(after.mustStopBy)}`} />
        </div>
        <p class="trust">Clocks count from: {clock(after.shift.anchor)}{paired ? ' — the end of Break 1. Nothing is erased from your log.' : " — these two breaks don't pair."}</p>
        <h3>Plan violations (if you take both breaks)</h3><ViolationList items={planViol} />
        {strictViol.length > 0 && <div class="warnbox"><b>If you skip Break 2:</b> the {dur(drive)} drive ends {clock(endDrive)} with {strictViol.map((v) => `${violationLabel[v.kind]} ${dur(v.minutes)}`).join(', ')} — Break 1 doesn't pause your 14-hour clock until you finish Break 2.</div>}
      </Card>

      {undo?.label === PLAN_ON_LOG && (
        <div class="row undo" role="status">
          <span>{PLAN_ON_LOG}.</span>
          <button class="mini" onClick={undoLast}>Undo</button>
        </div>
      )}
      <div class="row"><button class="primary" data-split-commit="1" disabled={planOnLog || Boolean(customClocks)} onClick={commit}>{planOnLog ? 'Plan is on your log ✓' : s.tentative.length ? 'Update the what-if on your log' : 'Put plan on log as what-if'}</button><button onClick={clear} disabled={!s.tentative.length}>Clear what-if</button></div>
      {customClocks && (
        <p class="muted small" data-split-override-note="1" style="margin:6px 0 0">
          Custom clocks are on — turn them off to put this plan on your log.
        </p>
      )}
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="split" />
    </>
  );
}

/* ============================================================ Recap tab */

/** Per-day quick entry: drive + on-duty hours starting at a chosen hour. Replaces that day's segments. */
function DayEditor({ day, hasData, onApply }: { day: { start: number; end: number; label: string }; hasData: boolean; onApply: (drive: number, on: number, startHour: number) => void }) {
  const [drive, setDrive] = useState(8);
  const [on, setOn] = useState(2);
  const [startH, setStartH] = useState(6);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button class="mini" onClick={() => { setErr(null); setOpen(true); }}>{hasData ? 'Edit' : 'Set'}</button>;
  const apply = () => {
    const over = dayPatchOverflow(day.start, day.end, drive, on, startH);
    if (over > 0) { setErr(`That runs ${dur(over)} past the end of ${day.label}. Start earlier or enter fewer hours — put the rest on the next day.`); return; }
    if (!hasData || confirm(`Replace everything logged on ${day.label}?`)) { onApply(drive, on, startH); setOpen(false); }
  };
  return (
    <div class="dayedit">
      <label>Drive h<input type="number" class="hrs" inputMode="decimal" min={0} max={13} step={0.25} value={drive} onInput={(e) => setDrive(Number((e.target as HTMLInputElement).value))} /></label>
      <label>On h<input type="number" class="hrs" inputMode="decimal" min={0} max={14} step={0.25} value={on} onInput={(e) => setOn(Number((e.target as HTMLInputElement).value))} /></label>
      <label>Start (h after day start)<input type="number" class="hrs" inputMode="numeric" min={0} max={23} step={1} value={startH} onInput={(e) => setStartH(Number((e.target as HTMLInputElement).value))} /></label>
      <span class="muted small">{Number.isFinite(startH) ? clock(day.start + startH * 60) : '—'}</span>
      <button class="mini primary" onClick={apply}>OK</button>
      <button class="mini" onClick={() => setOpen(false)}>✕</button>
      {err && <div class="warnbox small">{err}</div>}
    </div>
  );
}

const STRATEGY_LABEL: Record<TripStrategy, string> = {
  reset10: '10-hour resets',
  split: 'Sleeper splits',
  restart34: '34-hour restart',
};

/**
 * The plan that arrives first; ties go to the simplest (10-hour resets, then split, then 34h restart).
 * planTripAll's `faster` is 'same' whenever ANY two plans tie, so "'same' → reset10" picked the slower
 * 10-hour plan when split and 34h restart tied ahead of it (review of the QA patch, M3).
 */
export function earliestStrategy(both: Record<TripStrategy, TripPlan>): TripStrategy {
  return TRIP_STRATEGIES.reduce<TripStrategy>((a, k) => (both[k].arrival < both[a].arrival ? k : a), TRIP_STRATEGIES[0]);
}

/**
 * Gemini round, item G: the compare card's "N long rests". It counted single plan steps of 10h+,
 * but the planner builds a 10-hour reset out of two touching steps when a split it opened cannot
 * pair — "Sleeper 7h — opens a split" then "Extend to a full 10-hour reset" (3h) — so the Sleeper
 * splits card said "0 long rests" over a schedule that rests 10 hours straight. A long rest is now
 * a RUN of touching off-duty / sleeper steps, 10 hours or more: what the schedule actually does
 * (§395.3(a)(1) counts sleeper and off-duty together). Display only — the plan is the engine's.
 */
export function longRestCount(p: TripPlan): number {
  let n = 0, run = 0, end: number | null = null;
  for (const st of p.steps) {
    const x = st.segment;
    if (x.status === 'OFF' || x.status === 'SB') {
      run = end !== null && x.start === end ? run + (x.end - x.start) : x.end - x.start;
      end = x.end;
      if (run >= 600 && run - (x.end - x.start) < 600) n++;
    } else { run = 0; end = null; }
  }
  return n;
}
/** The completed sleeper-split pairings in a plan: the planner's own pairing step (its reason names the rest it "pairs with"). */
export function splitPairCount(p: TripPlan): number {
  return p.steps.filter((st) => (st.segment.status === 'OFF' || st.segment.status === 'SB') && /\bpairs with\b/.test(st.reason)).length;
}

/**
 * C7 (taste): plain-language display for engine trip-step reasons (engine/src/trip.ts stays untouched).
 * Keeps every number and CFR/FAQ cite intact while retiring terms like "excluded from the 14",
 * "11/14 exhausted", "long leg", and "clocks recalc".
 */
export function plainStepReason(reason: string): string {
  return reason
    .replace(/sleeper reset \(FMCSA FAQ 22\) — excluded from the 14/g, "sleeper rest so it doesn't count against your 14-hour window (FMCSA FAQ 22)")
    .replace(/\(split; clocks recalc from that rest's end\)/g, '(completes your split — clocks count from when that rest ended)')
    .replace(/10-hour reset \(11\/14 exhausted\)/g, '10-hour break (out of daily hours)')
    .replace(/opens a split \(long leg, §395\.1\(g\)\(1\)\(ii\)\(B\)\)/g, 'starts a sleeper split (7h+ in the sleeper, §395.1(g))')
    .replace(/34-hour restart — resets the 60\/70 cycle \(§395\.3\(c\)\)/g, '34-hour restart — resets your 60/70-hour week (§395.3(c))');
}

function PlanCompare({ both, from, view, onView }: { both: ReturnType<typeof planTripAll>; from: number; view?: TripStrategy | null; onView?: (v: TripStrategy) => void }) {
  const fallback: TripStrategy = earliestStrategy(both);
  const [local, setLocal] = useState<TripStrategy>(fallback);
  // `view` provided = the caller owns the selection (Trip tab keeps it in the store, so it survives
  // navigation). Omitted = this component owns it (Recap tab).
  const chosen = (view === undefined ? local : view) ?? fallback;
  const pick = (k: TripStrategy) => { if (view === undefined) setLocal(k); else onView?.(k); };
  const plan: TripPlan = both[chosen];
  // Past a week the weekday repeats, so "Wed 08:00" stops being unambiguous. Show the date.
  const showDates = Math.max(...TRIP_STRATEGIES.map((k) => both[k].arrival)) - from > 7 * 1440;
  const at = showDates ? clockFull : clock;
  const sameArrival = both.reset10.arrival === both.split.arrival && both.split.arrival === both.restart34.arrival;
  // `faster` is 'same' on any tie, which left no card labelled when two plans tied and the third was
  // slower; label every plan that shares the earliest arrival instead.
  const earliest = Math.min(...TRIP_STRATEGIES.map((k) => both[k].arrival));
  const [expandSame, setExpandSame] = useState(false);
  const resets = (p: TripPlan) => longRestCount(p);
  return (
    <>
      {sameArrival && !expandSame ? (
        <div class="row undo">
          <span class="muted small">All three ways to rest arrive at <b>{at(both.reset10.arrival)}</b> — the rest strategy makes no difference to this run.</span>
          <button class="mini" onClick={() => setExpandSame(true)}>Compare anyway</button>
        </div>
      ) : (
      <div class="compare">
        {TRIP_STRATEGIES.map((k) => {
          const p = both[k];
          return <button key={k} class={`plancard ${chosen === k ? 'on' : ''} ${p.feasible ? '' : 'bad'}`} onClick={() => pick(k)}>
            <div class="stat-label">{STRATEGY_LABEL[k]}{!sameArrival && p.arrival === earliest ? ' · fastest' : ''}</div>
            <div class="stat-value">{at(p.arrival)}</div>
            <div class="stat-sub">{dur(p.elapsedMinutes)} · {resets(p)} long rest{resets(p) === 1 ? '' : 's'}{splitPairCount(p) ? ` · ${splitPairCount(p)} split${splitPairCount(p) === 1 ? '' : 's'}` : ''} · {p.feasible ? 'legal' : 'PROBLEM'}</div>
          </button>;
        })}
      </div>
      )}
      <ol class="itin">{plan.steps.map((st, i) => <li key={i}><span class="dot" style={{ background: STATUS_COLOR[st.segment.status] }} /><span><b>{at(st.segment.start)}</b> {plainStepReason(st.reason)}</span><span class="muted">{dur(st.segment.end - st.segment.start)}{st.segment.status === 'D' ? ` · mi ${Math.round(st.fromMile)}→${Math.round(st.toMile)}` : ''}</span></li>)}</ol>
      {plan.warnings.map((w, i) => <p key={i} class="warnbox">{w}</p>)}
      <ViolationList items={plan.evaluation.violations} from={from} />
      {chosen === 'split' && <p class="trust">The split plan only works if you log the rests as shown — at least 2 hours off duty or in the sleeper for the shorter break, and at least 7 hours straight in the sleeper for the longer one. Any shorter and you'll need a full 10-hour break instead.</p>}
      {chosen === 'restart34' && <p class="trust">A 34-hour restart resets your 60/70-hour week (§395.3(c)) and also gives you a fresh 11- and 14-hour day (§395.3(a)(1)). Use it when your weekly hours are what's holding you up — compare its arrival time against waiting for hours to roll back each night.</p>}
    </>
  );
}

/* ---------- Hours coming back (capstone C3, audit §3 D10-A + M8) ---------- */

/**
 * The screen's one sentence: "{cycle}: {left} left · +{drops} back at {roll} ({day start} {zone})".
 * Every number is the evaluation's own (cycle.remaining, forecast[0]) — the same source the
 * week strip's hatching reads.
 */
export function hoursBackSentence(ev: FullEvaluation, now: number, cfg: State['config']): string {
  const head = `${ev.cycle.limit / 60} hours: ${dur(ev.cycle.remaining)} left`;
  const f = ev.cycle.forecast[0];
  if (!f) return head;
  return `${head} · +${dur(f.dropsOff)} back at ${laneValue(f.dayStart, now)} (${dayStartWord(cfg)} ${zoneShort(cfg.timeZone)})`;
}
/**
 * A week-strip bar's label (A5, audit): the weekday and date for EVERY bar ("Fri 13") — one
 * naming style, the one the table under it uses — never "D-3" and no more "N days ago".
 */
export function weekLabel(isoDay: string, _back?: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  return m ? `${DOW_SHORT[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${+m[3]}` : isoDay;
}
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A5 (audit): a carrier day's ISO label ("2026-11-13") in the app's own words ("Fri Nov 13"). */
export function isoDayWords(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  return m ? `${DOW_SHORT[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]} ${MON_SHORT[+m[2] - 1]} ${+m[3]}` : isoDay;
}
/**
 * A5 (audit): the days that actually give hours back. The engine's evaluate() is asked for a
 * forecast that runs the whole cycle window (its own forecastDays option — nothing computed
 * here), and the days that return nothing are skipped: "+0m" four times and a list that stops
 * before anything comes back answered nothing.
 */
export function hoursBackDays(s: State, now: number, ev: FullEvaluation): FullEvaluation['cycle']['forecast'] {
  let long: FullEvaluation;
  try { long = evaluate(allSegments(s, now), { asOf: now, config: safeRulesConfig(s.config), forecastDays: ev.cycle.windowDays }); } catch { return ev.cycle.forecast.filter((f) => f.dropsOff > 0); }
  return long.cycle.forecast.filter((f) => f.dropsOff > 0);
}
export function nextBackSentence(ev: FullEvaluation, back: FullEvaluation['cycle']['forecast'], now: number, cfg: State['config']): string {
  const head = `${ev.cycle.limit / 60} hours: ${dur(ev.cycle.remaining)} left`;
  const f = back[0];
  if (!f) return `${head} · nothing comes back in the next ${ev.cycle.windowDays} days`;
  return `${head} · next back: +${dur(f.dropsOff)} at ${isoDayWords(f.label)} ${clock(f.dayStart, false)} (${dayStartWord(cfg)} ${zoneShort(cfg.timeZone)})`;
}
/** The strip's bars: one per carrier day, oldest first; the oldest carries the hatch that rolls off next. */
export function weekBars(ev: FullEvaluation): { start: number; label: string; onDuty: number; hatch: number; today: boolean }[] {
  const days = ev.cycle.days;
  const drop = ev.cycle.forecast[0]?.dropsOff ?? 0;
  return days.map((d, i) => ({
    start: d.start, label: weekLabel(d.label, days.length - 1 - i), onDuty: d.onDuty,
    // The day that rolls off at the next day-roll is the oldest in the window; its hatched
    // minutes ARE the forecast's dropsOff (one source, audit §3 M8 pin).
    hatch: i === 0 ? drop : 0, today: i === days.length - 1,
  }));
}
/** The History day a week-strip tap opened: scrolled to once, then forgotten. Module state, never stored. */
let historyFocus: number | null = null;
export function openHistoryDay(start: number) { historyFocus = start; setState({ tab: 'history', planReturn: 'recap' }); }

/**
 * M8: the week strip — a picture of the driver's own on-duty hours, one bar per carrier day.
 * Fence (§7): never printed, exported or shared as a record; the only action is opening the day
 * in History, which is for his own review.
 */
function WeekStrip({ ev, now }: { ev: FullEvaluation; now: number }) {
  const bars = weekBars(ev);
  const scale = Math.max(840, ...bars.map((b) => b.onDuty));
  const f = ev.cycle.forecast[0];
  return (
    <div class="weekstrip" role="group" aria-label="On-duty time, one bar per day">
      {bars.map((b) => {
        const hatch = Math.min(b.hatch, b.onDuty);
        const aria = `${b.label}: ${dur(b.onDuty)} on duty${b.hatch > 0 && f ? `; ${dur(b.hatch)} of it comes back at ${laneValue(f.dayStart, now)}` : ''}. Open this day in History.`;
        return (
          <button key={b.start} class={`wk-day${b.today ? ' today' : ''}`} aria-label={aria} onClick={() => openHistoryDay(b.start)}>
            <span class="wk-col" aria-hidden="true">
              <span class="wk-bar" style={`height: ${(b.onDuty / scale) * 100}%`}>
                {b.hatch > 0 && <span class="wk-hatch" data-drops={b.hatch} style={`height: ${b.onDuty ? (hatch / b.onDuty) * 100 : 0}%`} />}
              </span>
            </span>
            <span class="wk-label" aria-hidden="true">{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RecapTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const hist = cycleBasis(s, now, ev.cycle.windowDays);
  const firstLogged = s.segments.length ? Math.min(...s.segments.map((x) => x.start)) : null;
  const days = ev.cycle.days;
  const back = useMemo(() => hoursBackDays(s, now, ev), [s, now, ev]);
  // The patch is a pure store function so the clipping rule is unit-testable (stress-test 2.4).
  const applyDay = (dayStart: number, dayEnd: number) => (drive: number, on: number, startHour: number) => {
    // The live status's stamp rides along so the patch's filler can never outrank the live
    // span it pads around (break-test #1).
    setState((cur) => ({ segments: applyDayPatch(cur.segments, dayStart, dayEnd, drive, on, startHour, stamp(), cur.current?.createdAt) }));
  };

  return (
    <>
      <BackToPlan s={s} />
      <h1 class="screen-title">Hours coming back</h1>
      <p class="hours-back"><b>{nextBackSentence(ev, back, now, s.config)}</b></p>
      <Card title="On duty, day by day">
        <WeekStrip ev={ev} now={now} />
        {ev.cycle.forecast[0] && ev.cycle.forecast[0].dropsOff > 0 && <p class="muted small"><span class="wk-key" aria-hidden="true" /> Striped: what comes back at {laneValue(ev.cycle.forecast[0].dayStart, now)}. Tap a day to see it in History.</p>}
      </Card>
      <Card title="Hours coming back">
        {back.length
          ? <ul class="forecast">{back.slice(0, 4).map((f) => <li key={f.label}><span>{isoDayWords(f.label)}</span><span>+{dur(f.dropsOff)} back</span><b>{dur(f.availableAtStart)} available</b></li>)}</ul>
          : <p class="muted">Nothing comes back in the next {ev.cycle.windowDays} days — the days in your window have no on-duty time to drop off.</p>}
        {back.length > 0 && <p class="muted small">“Available” is at the start of that day{s.tentative.length ? ', counting today in full — your what-if plan included. That is why it can be less than the hours left at the top.' : ', counting today in full.'}</p>}
      </Card>
      <Card title="Fix a day">
        <p class="muted small">{ev.cycle.limit / 60}-hour / {ev.cycle.windowDays}-day recap.</p>
        <table class="recap"><thead><tr><th>Day</th><th>On duty</th><th></th></tr></thead><tbody>
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            // The live status is data on the days it runs through too: "set" on such a day is
            // a replace, and the driver must confirm it as one (break-test #1).
            const hasData = s.segments.some((x) => x.start < d.end && x.end > d.start)
              || (s.current !== null && s.current.since < d.end && now > d.start);
            return <tr key={d.label} class={isToday ? 'today' : ''}><td>{isToday ? 'Today' : isoDayWords(d.label)}{isToday && <><br /><small class="muted">{isoDayWords(d.label)}</small></>}</td><td><b>{dur(d.onDuty)}</b></td>
              <td>{!isToday && firstLogged !== null && d.end <= firstLogged && <><small class="trust" title="Nothing in your record covers this day, so it counts as zero on-duty hours.">not logged — counted as 0h</small><br /></>}
                {/* The badge says the day counts as zero; the editor is how you fix that (stress-test round 2, §2.3). */}
                {!isToday && <DayEditor day={d} hasData={hasData} onApply={applyDay(d.start, d.end)} />}</td></tr>;
          })}
        </tbody></table>
        <div class="clocks">
          <Stat label="Used" value={dur(ev.cycle.used)} />
          <Stat label="Available" value={dur(ev.cycle.remaining)} tone={ev.cycle.remaining < 120 ? 'bad' : ''} />
          {ev.cycle.restartEnd !== null && <Stat label="Last 34h restart" value={clock(ev.cycle.restartEnd)} />}
        </div>
        {hist !== 'known' && <p class="warnbox small">This recap rests on an incomplete basis: your record does not cover the whole {ev.cycle.windowDays}-day period, so the days before it count as zero. Use <b>Set</b> on those days, or confirm that your record really starts here.</p>}
        <p class="muted small">“Set” a past day with drive + on-duty hours and a start time; it's written as real segments (with a 30-min break after 8h driving) so every clock counts it. Days roll at {formatDayStartHM(s.config)} {s.config.timeZone}.{deviceTz !== s.config.timeZone && <> On your device clock ({deviceTz}) that is <b>{clock(carrierDayStart(now, safeRulesConfig(s.config)), false)}</b> — the times in this table use your device zone.</>}</p>
      </Card>
      <button class="plan-item" onClick={() => setState({ tab: 'load', planReturn: 'recap' })}>
        <span class="plan-icon"><Icon d={I.truck} size={26} /></span>
        <span class="plan-text"><b>Can I take this load?</b><span class="muted small">Four quick questions, get a yes or no.</span></span>
        <Icon d={I.next} />
      </button>
      <button class="plan-item" onClick={() => setState({ tab: 'history', planReturn: 'recap' })}>
        <span class="plan-icon"><Icon d={I.recap} size={26} /></span>
        <span class="plan-text"><b>Your last 8 days</b><span class="muted small">What you logged, day by day — for your own review.</span></span>
        <Icon d={I.next} />
      </button>
    </>
  );
}

/* ============================================================ Weekly recap vs. 34-hour reset & home-time planner */

/** Parse "HH:MM" from a time input into minutes from midnight (0..1439), or null when invalid. */
function parseWallHM(raw: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Weekly Recap vs. 34-Hour Reset & Home-Time Planner.
 * Derives past-window on-duty totals strictly from the store's logged segments (`loggedSegments`),
 * projects the next 7 shifts across 7–8 carrier days side-by-side (Recaps vs. 34-Hour Reset),
 * splits overnight shifts across the carrier-day boundary (`config.dayStartHour` in `config.timeZone`),
 * and evaluates optional Home-Time targets with the exact daily hour cap needed to cruise on recaps.
 */
function WeekRecapTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const [defaultShiftMin, setDefaultShiftMin] = useState(600); // 10h 00m default
  const [shiftStartMin, setShiftStartMin] = useState(21 * 60); // 21:00 overnight default
  const [customShifts, setCustomShifts] = useState<(number | null)[]>(() => Array(PROJECTION_SHIFTS).fill(null));
  const [resetDayOffset, setResetDayOffset] = useState(1); // Tomorrow by default
  const [resetWallMin, setResetWallMin] = useState(8 * 60); // 08:00 parking sweet spot
  const [homeTarget, setHomeTarget] = useState<number | null>(null);
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);

  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s, now, customClocks],
  );
  const resetStart = useMemo(
    () => defaultResetStart(now, s.config, resetDayOffset, resetWallMin),
    [now, s.config, resetDayOffset, resetWallMin],
  );

  const plan = useMemo(
    () => projectRecapVs34({
      segments: logged,
      now,
      config: s.config,
      defaultShiftMinutes: defaultShiftMin,
      customShiftMinutes: customShifts,
      shiftStartMinutes: shiftStartMin,
      resetStart,
      homeTargetShifts: homeTarget,
    }),
    [logged, now, s.config, defaultShiftMin, customShifts, shiftStartMin, resetStart, homeTarget],
  );

  // Upcoming carrier-day choices for the 34-hour reset start day picker (0..6 days from today)
  const resetDayOptions = useMemo(() => {
    const out: { offset: number; label: string; dayStart: number; dayEnd: number }[] = [];
    let ds = carrierDayStart(now, s.config);
    for (let i = 0; i < PROJECTION_SHIFTS; i++) {
      const de = nextCarrierDayStart(ds, s.config);
      const p = parseIsoDay(plan.pastDays[plan.pastDays.length - 1]?.label ?? '');
      const lbl = i === 0 ? `Today (${p.dayShort})` : parseIsoDay(dayLabel(ds, s.config)).shortLabel;
      out.push({ offset: i, label: lbl, dayStart: ds, dayEnd: de });
      ds = de;
    }
    return out;
  }, [now, s.config, plan.pastDays]);

  const setCustomFor = (idx: number, val: number | null) => {
    setCustomShifts((prev) => prev.map((x, i) => (i === idx ? val : x)));
  };

  const applyBestReset = () => {
    if (!plan.bestReset) return;
    const targetDayStart = carrierDayStart(plan.bestReset.resetStart, s.config);
    const hit = resetDayOptions.find((o) => o.dayStart === targetDayStart);
    if (hit) setResetDayOffset(hit.offset);
  };

  const applyCruiseCap = () => {
    if (!plan.homeTime) return;
    setDefaultShiftMin(plan.homeTime.cruiseCapMinutes);
    setCustomShifts(Array(PROJECTION_SHIFTS).fill(null));
  };

  const hist = cycleBasis(s, now, plan.windowDays);
  const signKind: SignKind = plan.verdict.tone === 'bad' ? 'stop' : plan.verdict.tone === 'warn' ? 'warn' : 'go';
  const signWord = plan.verdict.tone === 'bad' ? 'Recap wall' : plan.verdict.tone === 'warn' ? 'Tight cycle' : 'Clear on recaps';
  const tzWord = zoneShort(s.config.timeZone);
  const rollWord = dayStartWord(s.config);
  const hasCustom = customShifts.some((x) => x !== null);
  const sampleShift = plan.recaps.shifts[0];
  const delta = plan.netDeltaMinutes;

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Weekly recap vs. 34</h1>

      {/* 1. Plain-English VERDICT BANNER first */}
      <Card tone={plan.verdict.tone}>
        <div class="wrecap-verdict" data-wrecap-verdict="1">
          <Sign kind={signKind}>{signWord}</Sign>
          <p class="wrecap-headline">{plan.verdict.headline}</p>
          {plan.verdict.homeLine && <p class="wrecap-subline"><b>{plan.verdict.homeLine}</b></p>}
          {plan.verdict.tipLine && (
            <div class="wrecap-tip">
              <span class="small muted">{plan.verdict.tipLine}</span>
              <button class="mini" onClick={applyBestReset}>Use {plan.bestReset?.startLabel}</button>
            </div>
          )}
          <p class="muted small" style="margin:0">
            {plan.limit / 60}-hour / {plan.windowDays}-day cycle · rolls at {rollWord} {tzWord}
            {deviceTz !== s.config.timeZone && <> ({clock(carrierDayStart(now, safeRulesConfig(s.config)), false)} device time)</>}.
          </p>
        </div>
      </Card>

      {/* 2. Side-by-side 7-day usable hours comparison */}
      <div class="wrecap-compare" role="region" aria-label="7-day strategy comparison">
        <div class={`wrecap-colcard${delta <= 0 && !plan.recaps.wall ? ' win' : plan.recaps.wall ? (plan.recaps.wall.usableMinutes < 180 ? ' bad' : ' warn') : ''}`}>
          <div class="stat-label">A · Keep recaps</div>
          <div class="stat-value mono">{dur(plan.recaps.totalUsableMinutes)}</div>
          <div class="stat-sub">
            {plan.recaps.wall
              ? <>Recap wall: <b>{plan.recaps.wall.shortLabel}</b> ({dur(plan.recaps.wall.usableMinutes)})</>
              : <>No recap wall in 7 shifts</>}
          </div>
        </div>
        <div class={`wrecap-colcard${delta > 0 ? ' win' : ''}`}>
          <div class="stat-label">B · 34-hour reset</div>
          <div class="stat-value mono">{dur(plan.reset34.totalUsableMinutes)}</div>
          <div class="stat-sub">
            {delta > 0 ? <><b>+{dur(delta)}</b> vs. recaps</> : delta < 0 ? <><b>−{dur(-delta)}</b> vs. recaps</> : <>Even with recaps</>}
            {' · '}starts {plan.resetStartLabel}
          </div>
        </div>
      </div>

      {/* 3. Home-time target summary when enabled */}
      {plan.homeTime && (
        <Card title={`Home time · ${plan.homeTime.homeDayShortDate}`} tone={plan.homeTime.reachesLegally ? 'good' : 'warn'}>
          <div class="clocks">
            <Stat
              label="Current pace"
              value={plan.homeTime.reachesLegally ? 'Legal' : `Short ${dur(plan.homeTime.shortfallMinutes)}`}
              sub={`${plan.homeTime.targetShifts} ${plan.homeTime.targetShifts === 1 ? 'shift' : 'shifts'} before home`}
              tone={plan.homeTime.reachesLegally ? 'good' : 'warn'}
            />
            <Stat
              label="Recap cruise cap"
              value={`${dur(plan.homeTime.cruiseCapMinutes)}/night`}
              sub="Max uniform shift on recaps"
            />
          </div>
          <p class="small" style="margin-top:8px">
            Before {plan.homeTime.homeDayShort}: <b>{dur(plan.homeTime.usableBeforeHomeRecaps)}</b> on recaps vs. <b>{dur(plan.homeTime.usableBeforeHomeReset34)}</b> with a 34-hour reset.
          </p>
          {!plan.homeTime.reachesLegally && plan.homeTime.cruiseCapMinutes > 0 && (
            <div class="row">
              <button class="mini" onClick={applyCruiseCap}>Set nightly budget to {dur(plan.homeTime.cruiseCapMinutes)}</button>
            </div>
          )}
        </Card>
      )}

      {/* 4. Data basis disclosure (derived strictly from store's existing log data) */}
      {(plan.unloggedPastDays > 0 || hist !== 'known') && (
        <div class="warnbox small">
          {plan.unloggedPastDays > 0
            ? <><b>{plan.unloggedPastDays} of your last {plan.windowDays} carrier days</b> have no logged entries and are counted as 0h. </>
            : <>Your log does not cover all {plan.windowDays} days yet, so earlier days count as 0h. </>}
          Update past days in <b>Log</b> or{' '}
          <button class="link" style="display:inline;padding:0;min-height:0" onClick={() => { openWeekPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}>Hours coming back → Fix a day</button>.
        </div>
      )}

      {/* 5. Planner controls */}
      <Card title="Your week plan">
        <div>
          <span class="stat-label">Planned nightly shift budget</span>
          <div class="wrecap-chips" role="group" aria-label="Planned nightly shift budget presets">
            {SHIFT_BUDGET_PRESETS.map((p) => (
              <button
                key={p.minutes}
                class={!hasCustom && defaultShiftMin === p.minutes ? 'on' : ''}
                onClick={() => { setDefaultShiftMin(p.minutes); setCustomShifts(Array(PROJECTION_SHIFTS).fill(null)); }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style="margin-top:12px">
          <span class="stat-label">Shift start ({tzWord})</span>
          <div class="wrecap-chips" role="group" aria-label="Shift start time presets">
            {SHIFT_START_PRESETS.map((p) => (
              <button key={p.minutes} class={shiftStartMin === p.minutes ? 'on' : ''} onClick={() => setShiftStartMin(p.minutes)}>
                {p.label} <span class="muted small">{p.tag}</span>
              </button>
            ))}
          </div>
          <div class="wrecap-fieldrow">
            <label>Custom shift start ({tzWord})
              <input
                type="time"
                aria-label="Custom shift start time"
                value={fmtWallHM(shiftStartMin)}
                onInput={(e) => {
                  const v = parseWallHM((e.target as HTMLInputElement).value);
                  if (v !== null) setShiftStartMin(v);
                }}
              />
            </label>
          </div>
          {sampleShift && sampleShift.plannedMinutes > 0 && (
            <p class="muted small" style="margin:6px 0 0">
              {sampleShift.crossesBoundary
                ? <>Overnight split: <b>{dur(sampleShift.plannedLeg1)}</b> before {rollWord} + <b>{dur(sampleShift.plannedLeg2)}</b> after {rollWord} ({tzWord}).</>
                : <>Runs within one carrier day ({fmtWallHM(shiftStartMin)} for {dur(sampleShift.plannedMinutes)}).</>}
            </p>
          )}
        </div>

        <div style="margin-top:12px">
          <span class="stat-label">34-hour reset start ({tzWord})</span>
          <div class="wrecap-chips" role="group" aria-label="34-hour reset start day">
            {resetDayOptions.map((d) => (
              <button key={d.offset} class={resetDayOffset === d.offset ? 'on' : ''} onClick={() => setResetDayOffset(d.offset)}>
                {d.label}
              </button>
            ))}
          </div>
          <div class="wrecap-chips" role="group" aria-label="34-hour reset start time presets">
            {RESET_TIME_PRESETS.map((p) => (
              <button key={p.minutes} class={resetWallMin === p.minutes ? 'on' : ''} onClick={() => setResetWallMin(p.minutes)}>
                {p.label}
              </button>
            ))}
          </div>
          <div class="wrecap-fieldrow">
            <label>Custom 34h reset start time ({tzWord})
              <input
                type="time"
                aria-label="Custom 34-hour reset start time"
                value={fmtWallHM(resetWallMin)}
                onInput={(e) => {
                  const v = parseWallHM((e.target as HTMLInputElement).value);
                  if (v !== null) setResetWallMin(v);
                }}
              />
            </label>
          </div>
          <p class="muted small" style="margin:6px 0 0">
            34h reset window: <b>{plan.resetStartLabel}</b> → <b>{plan.resetEndLabel}</b> ({tzWord}).
          </p>
        </div>

        <div class="wrecap-fieldrow" style="margin-top:12px">
          <label>Target home time / day off (optional)
            <select
              aria-label="Target home time or day off"
              value={homeTarget === null ? '' : String(homeTarget)}
              onChange={(e) => {
                const raw = (e.target as HTMLSelectElement).value;
                setHomeTarget(raw === '' ? null : Number(raw));
              }}
            >
              <option value="">None — show full 7-day comparison</option>
              {plan.recaps.days.slice(1).map((d, idx) => {
                const count = idx + 1;
                return (
                  <option key={d.label} value={String(count)}>
                    Home {parseIsoDay(d.label).longShort} ({count} {count === 1 ? 'shift' : 'shifts'} to get there)
                  </option>
                );
              })}
            </select>
          </label>
        </div>

        <Help label={`Custom per-night hours${hasCustom ? ' (edited)' : ''}`}>
          <p class="muted small">Override any individual night in hours and minutes, or tap <b>Off</b> for a planned day off.</p>
          <ul class="wrecap-custom-list">
            {plan.recaps.shifts.map((sh, idx) => {
              const cur = customShifts[idx] ?? defaultShiftMin;
              const ch = Math.floor(cur / 60);
              const cm = cur % 60;
              return (
                <li key={sh.label} class="wrecap-custom-row">
                  <span class="wrecap-custom-day">{sh.shortLabel}</span>
                  <span class="wrecap-custom-inputs">
                    <input
                      type="number"
                      class="num"
                      inputMode="numeric"
                      min={0}
                      max={14}
                      aria-label={`${sh.shortLabel} shift hours`}
                      value={ch}
                      onInput={(e) => {
                        const nh = Math.max(0, Math.min(14, Number((e.target as HTMLInputElement).value) || 0));
                        setCustomFor(idx, Math.min(840, nh * 60 + cm));
                      }}
                    />
                    <span class="small muted">h</span>
                    <input
                      type="number"
                      class="num"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      aria-label={`${sh.shortLabel} shift minutes`}
                      value={cm}
                      onInput={(e) => {
                        const nm = Math.max(0, Math.min(59, Number((e.target as HTMLInputElement).value) || 0));
                        setCustomFor(idx, Math.min(840, ch * 60 + nm));
                      }}
                    />
                    <span class="small muted">m</span>
                    <button class="mini" onClick={() => setCustomFor(idx, 0)}>Off</button>
                    {customShifts[idx] !== null && <button class="mini" onClick={() => setCustomFor(idx, null)}>Reset</button>}
                  </span>
                </li>
              );
            })}
          </ul>
          {hasCustom && (
            <div class="row">
              <button class="mini" onClick={() => setCustomShifts(Array(PROJECTION_SHIFTS).fill(null))}>Reset all nights to {dur(defaultShiftMin)}</button>
            </div>
          )}
        </Help>

        <Help label={`Past ${plan.windowDays} days from your log (${dur(plan.usedNow)} used · ${dur(plan.remainingNow)} left)`}>
          <p class="muted small">Derived directly from your logged entries (excluding what-if rows). Days with no entries are dashed and counted as 0h.</p>
          <div class="wrecap-past-pills">
            {plan.pastDays.map((d) => (
              <span key={d.label} class={`wrecap-past-pill${!d.hasEntries && !d.clearedByRestart ? ' empty' : ''}${d.isToday ? ' today' : ''}`}>
                <span>{d.isToday ? 'Today' : d.shortLabel}</span>
                <b class="mono">{dur(d.onDuty)}</b>
              </span>
            ))}
          </div>
        </Help>
      </Card>

      {/* 6. Day-by-day side-by-side forecast */}
      <Card title="Day-by-day forecast">
        <p class="muted small" style="margin-top:0">
          Each night compares <b>Recaps (A)</b> vs. <b>34-Hour Reset (B)</b>, showing exact {rollWord} drop-offs and cycle hours available.
        </p>
        <ul class="wrecap-days">
          {plan.recaps.shifts.map((a, idx) => {
            const b = plan.reset34.shifts[idx];
            const isWall = plan.recaps.wall?.shiftIndex === idx;
            const isHomeNext = plan.homeTime && idx === plan.homeTime.targetShifts - 1;
            const wallClass = isWall ? (a.usableMinutes < 180 ? ' wall-bad' : ' wall') : '';
            const nextDay = plan.recaps.days[idx + 1];
            return (
              <li key={a.label} class={`wrecap-day${wallClass}`}>
                <div class="wrecap-day-head">
                  <span class="wrecap-day-title">
                    <span>{a.shortLabel}</span>
                    {isWall && <span class={`wrecap-badge ${a.usableMinutes < 180 ? 'wall-bad' : 'wall'}`}>Recap wall</span>}
                    {b.blockedByReset && <span class="wrecap-badge reset">34h reset</span>}
                    {b.resetCompletesHere && !b.blockedByReset && <span class="wrecap-badge reset">34h done</span>}
                    {isHomeNext && <span class="wrecap-badge home">Last shift before home</span>}
                  </span>
                  <span class={`wrecap-drop mono${a.dropsOffAtDayStart > 0 ? '' : ' zero'}`}>
                    {a.dropsOffAtDayStart > 0 ? `+${dur(a.dropsOffAtDayStart)} back` : '+0m back'}
                  </span>
                </div>

                <div class="wrecap-ab">
                  <div class="wrecap-side">
                    <span class="wrecap-side-head">A · Recaps</span>
                    <span class={`wrecap-side-val mono${a.pinched ? (a.usableMinutes < 180 ? ' bad' : ' warn') : ' good'}`}>
                      {a.plannedMinutes === 0 ? 'Off' : dur(a.usableMinutes)}
                    </span>
                    <span class="wrecap-side-meta">
                      {a.pinched
                        ? <>of {dur(a.plannedMinutes)} (−{dur(a.shortfallMinutes)})</>
                        : a.plannedMinutes > 0 ? <>Full shift</> : <>Planned off</>}
                    </span>
                    <span class="wrecap-side-meta">
                      Start {rollWord}: <b class="mono">{dur(a.availAtDayStart)}</b>
                      {a.availBeforeShift !== a.availAtDayStart && <> · pre-shift <b class="mono">{dur(a.availBeforeShift)}</b></>}
                    </span>
                  </div>

                  <div class="wrecap-side">
                    <span class="wrecap-side-head">B · 34h reset</span>
                    <span class={`wrecap-side-val mono${b.blockedByReset && b.usableMinutes === 0 ? '' : b.pinched ? ' warn' : ' good'}`}>
                      {b.plannedMinutes === 0 ? 'Off' : b.blockedByReset && b.usableMinutes === 0 ? '0m (34h)' : dur(b.usableMinutes)}
                    </span>
                    <span class="wrecap-side-meta">
                      {b.blockedByReset
                        ? (b.usableMinutes === 0 ? <>Resting in 34h reset</> : <>Trimmed by 34h (−{dur(b.resetOverlapMinutes)})</>)
                        : b.pinched ? <>of {dur(b.plannedMinutes)} (−{dur(b.shortfallMinutes)})</> : b.plannedMinutes > 0 ? <>Full shift</> : <>Planned off</>}
                    </span>
                    <span class="wrecap-side-meta">
                      {b.resetCompletesHere
                        ? <>Fresh <b class="mono">{dur(plan.limit)}</b> after {plan.resetEndLabel}</>
                        : <>Pre-shift: <b class="mono">{dur(b.availBeforeShift)}</b></>}
                    </span>
                  </div>
                </div>

                {a.crossesBoundary && a.plannedMinutes > 0 && nextDay && (
                  <div class="wrecap-split-note">
                    Split across {rollWord}: {a.dayShort} <b class="mono">{dur(a.usableLeg1)}</b> + {nextDay.dayShort} <b class="mono">{dur(a.usableLeg2)}</b>
                    {a.dropsOffAtNextRoll > 0 && <> (after <b class="mono">+{dur(a.dropsOffAtNextRoll)}</b> {nextDay.dayShort} {rollWord} drop-off)</>}
                  </div>
                )}
              </li>
            );
          })}
          {/* Final 8th carrier day showing the next carrier-day roll drop-off & post-week availability */}
          {plan.recaps.days.length > PROJECTION_SHIFTS && (() => {
            const tailA = plan.recaps.days[PROJECTION_SHIFTS];
            const tailB = plan.reset34.days[PROJECTION_SHIFTS];
            const isHomeDay = plan.homeTime && plan.homeTime.homeDayLabel === tailA.label;
            return (
              <li key={tailA.label} class="wrecap-day">
                <div class="wrecap-day-head">
                  <span class="wrecap-day-title">
                    <span>{tailA.shortLabel} (day {PROJECTION_SHIFTS + 1})</span>
                    {isHomeDay && <span class="wrecap-badge home">Home day</span>}
                  </span>
                  <span class={`wrecap-drop mono${tailA.dropsOff > 0 ? '' : ' zero'}`}>
                    {tailA.dropsOff > 0 ? `+${dur(tailA.dropsOff)} back` : '+0m back'}
                  </span>
                </div>
                <div class="wrecap-ab">
                  <div class="wrecap-side">
                    <span class="wrecap-side-head">A · Recaps</span>
                    <span class="wrecap-side-meta">Avail at {rollWord}: <b class="mono">{dur(tailA.availAtStart)}</b></span>
                    <span class="wrecap-side-meta">After overnight tail: <b class="mono">{dur(tailA.availAtEnd)}</b></span>
                  </div>
                  <div class="wrecap-side">
                    <span class="wrecap-side-head">B · 34h reset</span>
                    <span class="wrecap-side-meta">Avail at {rollWord}: <b class="mono">{dur(tailB.availAtStart)}</b></span>
                    <span class="wrecap-side-meta">After overnight tail: <b class="mono">{dur(tailB.availAtEnd)}</b></span>
                  </div>
                </div>
              </li>
            );
          })()}
        </ul>
      </Card>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="week" />
    </>
  );
}

/* ============================================================ Work-backwards appointment & departure planner ("When to roll & PTA") */

/**
 * Work-backwards rollout planner ("When to roll & PTA"): appointment picker on the shared ClockPick.
 * Edits wall-clock strings in the entry zone by converting through `deviceTz` (the local clock zone
 * ClockPick renders and parses in — equal to `s.config.timeZone` in the home zone, and still exact
 * when `deviceTz !== s.config.timeZone` or under `TZ=UTC`).
 */
function RolloutTimeSheet({ k, now, closing = false }: { k: Extract<SheetKind, { kind: 'rollouttime' }>; now: number; closing?: boolean }) {
  const nowWall = formatWallDateTime(now, k.entryTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  const [at, setAt] = useState<number>(() => {
    const parsed = resolveWallDateTime(k.apptDate, k.apptTime, deviceTz);
    if (parsed !== null) return parsed;
    if (k.fallbackMinute !== null) {
      const fbWall = formatWallDateTime(k.fallbackMinute, k.entryTimeZone);
      const fb = resolveWallDateTime(fbWall.date, fbWall.time, deviceTz);
      if (fb !== null) return fb;
    }
    return nextHour(pickerNow);
  });
  const apply = () => {
    const wall = formatWallDateTime(at, deviceTz);
    k.onApply(wall.date, wall.time);
    openSheet(null);
  };
  return (
    <Sheet title={`Appointment (${k.entryZoneName})`} closing={closing}>
      <p class="muted small" style="margin:0">Wall-clock time in <b>{k.entryZoneName}</b> time.</p>
      <ClockPick at={at} set={setAt} now={pickerNow} future={true} say="Appointment" name="Appointment time" keys={KEYS_HOURS} />
      <button class="primary wide ed-go" onClick={apply}>Apply · {clockFull(at)} ({k.entryZoneName})</button>
    </Sheet>
  );
}

/**
 * Work-Backwards Appointment & Departure Planner ("When to roll & PTA").
 * For a load already accepted: starts from a hard pickup/delivery appointment and works
 * backwards through FMCSA 11/14/30-min/10-hr/cycle rules via `engine/src/index.ts` to
 * produce a concrete execution checklist and copyable dispatch PTA.
 */
function RolloutTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const prefill = useMemo(() => {
    const p = pendingRolloutPrefill;
    pendingRolloutPrefill = null;
    return p;
  }, []);
  const initAppt = useMemo(() => defaultAppointmentFor(now, s.config), []);
  const [apptDate, setApptDate] = useState(prefill?.apptDate || initAppt.apptDate);
  const [apptTime, setApptTime] = useState(prefill?.apptTime || initAppt.apptTime);
  const [apptTz, setApptTz] = useState(prefill?.apptTimeZone && isValidTimeZone(prefill.apptTimeZone) ? prefill.apptTimeZone : s.config.timeZone);
  const [entryZoneMode, setEntryZoneMode] = useState<ZoneEntryMode>('local');
  const [distanceMode, setDistanceMode] = useState<DistanceMode>(prefill?.distanceMode ?? 'miles');
  const [miles, setMiles] = useState(prefill?.miles ?? DEFAULT_MILES);
  const [mph, setMph] = useState(() => Math.max(MIN_MPH, Math.min(MAX_MPH, Math.round(prefill?.mph ?? (s.mph || DEFAULT_MPH)))));
  const [driveHours, setDriveHours] = useState(prefill?.driveMinutes !== undefined ? Math.floor(prefill.driveMinutes / 60) : 9);
  const [driveMins, setDriveMins] = useState(prefill?.driveMinutes !== undefined ? prefill.driveMinutes % 60 : 0);
  const [bufferMin, setBufferMin] = useState(prefill?.bufferMinutes ?? DEFAULT_BUFFER_MIN);
  const [dockMin, setDockMin] = useState(prefill?.dockMinutes ?? DEFAULT_DOCK_MIN);
  const [preTripMin, setPreTripMin] = useState(prefill?.preTripMinutes ?? DEFAULT_PRETRIP_MIN);
  const [copyNote, setCopyNote] = useState('');
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(prefill?.chainedCustomClocks ?? null);

  const hasChainedPrior = Boolean(prefill?.chainedPriorSegments?.length);
  const evalNow = prefill?.chainedCursor ?? now;
  const logged = useMemo(() => {
    const base = hasChainedPrior
      ? (prefill?.chainedBaseSegments ?? loggedSegments(s, now))
      : customClocks
        ? (customClocks === prefill?.chainedCustomClocks && prefill?.chainedBaseSegments
          ? prefill.chainedBaseSegments
          : synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments)
        : loggedSegments(s, now);
    if (!hasChainedPrior) return base;
    const prior = prefill!.chainedPriorSegments!.map(({ tentative: _t, ...rest }) => rest);
    return [...base, ...prior];
  }, [s, now, prefill, hasChainedPrior, customClocks]);
  const zoneChoices = useMemo(() => {
    const set = new Set<string>([s.config.timeZone, deviceTz, ...COMMON_APPT_ZONES]);
    return [...set].filter((z) => isValidTimeZone(z));
  }, [s.config.timeZone]);

  const plan = useMemo(
    () => planRollout({
      segments: logged,
      now: evalNow,
      config: s.config,
      apptDate,
      apptTime,
      entryZoneMode,
      apptTimeZone: apptTz,
      distanceMode,
      miles,
      mph,
      driveMinutesDirect: driveHours * 60 + driveMins,
      bufferMinutes: bufferMin,
      dockMinutes: dockMin,
      preTripMinutes: preTripMin,
    }),
    [logged, evalNow, s.config, apptDate, apptTime, entryZoneMode, apptTz, distanceMode, miles, mph, driveHours, driveMins, bufferMin, dockMin, preTripMin],
  );

  const copyPta = async () => {
    if (!plan.ptaText) return;
    try {
      await navigator.clipboard.writeText(plan.ptaText);
      setCopyNote('Copied ✓');
    } catch {
      setCopyNote('Select & copy above');
    }
    window.setTimeout(() => setCopyNote(''), 2500);
  };

  const applyEarliestAppt = () => {
    if (!plan.recovery) return;
    setApptDate(plan.recovery.apptDateInEntryZone);
    setApptTime(plan.recovery.apptTimeInEntryZone);
  };

  const hist = cycleBasis(s, now, plan.cycleWindowDays);
  const entryZoneName = entryZoneMode === 'local' ? plan.apptZoneName : plan.homeZoneName;
  const entryTz = entryZoneMode === 'local' ? apptTz : s.config.timeZone;

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">When to roll &amp; PTA</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Execution timetable for a booked load — work backwards from your hard appointment to get shutdown, roll-out, break window, and dispatch PTA.
      </p>

      {/* 1. VERDICT / FEASIBILITY LINE UP TOP */}
      <Card tone={plan.tone}>
        <div class="rollout-verdict" data-rollout-verdict="1">
          <Sign kind={plan.verdictSign}>{plan.verdictLabel}</Sign>
          <p class="rollout-headline">{plan.headline}</p>
          <p class="rollout-subline">{plan.reason}</p>
          <p class="muted small" style="margin:0">
            {hasChainedPrior
              ? (prefill?.chainedCustomClocks
                ? `Seeded from My Week custom clocks + chain (${prefill.chainedFromLabel})`
                : `Seeded from My Week chain (${prefill?.chainedFromLabel})`)
              : customClocks
                ? (prefill?.chainedCustomClocks && customClocks === prefill.chainedCustomClocks
                  ? 'Seeded from My Week custom clocks'
                  : 'Seeded from custom ELD clocks')
                : 'Seeded from your log'} · {plan.cycleLimit / 60}h/{plan.cycleWindowDays}d cycle ({dur(plan.cycleRemainingNow)} left) · Home terminal: <b>{plan.homeZoneName}</b>
            {!plan.sameZone && <> · Appointment: <b>{plan.apptZoneName}</b></>}.
          </p>
        </div>
      </Card>

      {/* 2a. INFEASIBLE RECOVERY — never print an impossible timetable as if it were fine */}
      {plan.validInput && !plan.feasible && (
        <Card title="What has to move" tone="bad">
          <div class="rollout-recovery" data-rollout-infeasible="1">
            {plan.recovery ? (
              <>
                <p class="small" style="margin:0">
                  No legal timetable meets <b>{plan.appointment.apptText}</b> ({distanceMode === 'miles' ? `${miles} mi @ ${plan.effectiveMph} mph, ` : ''}{dur(plan.driveMinutes)} drive) with a <b>{dur(plan.bufferMinutes)}</b> arrival buffer from your current clocks.
                  {plan.recovery.needsRestart34 && <> Clearing your {plan.cycleLimit / 60}-hour cycle requires a 34-hour reset first.</>}
                </p>
                <div class="rollout-recovery-grid">
                  <div class="rollout-recovery-item">
                    <span class="rollout-dual-lbl">Earliest legal roll-out</span>
                    <b class="mono">{plan.recovery.earliestLegalRollOut.homeShort}</b>
                    {!plan.sameZone && <span class="muted small mono">{plan.recovery.earliestLegalRollOut.apptShort}</span>}
                  </div>
                  <div class="rollout-recovery-item">
                    <span class="rollout-dual-lbl">Earliest workable appt</span>
                    <b class="mono">{plan.recovery.earliestWorkableAppt.apptShort}</b>
                    {!plan.sameZone && <span class="muted small mono">{plan.recovery.earliestWorkableAppt.homeShort}</span>}
                    <span class="muted small">+{dur(plan.recovery.apptShiftMinutes)} later (keeps {dur(plan.bufferMinutes)} buffer)</span>
                  </div>
                </div>
                {plan.recovery.maxBufferThatFits !== null && (
                  <p class="small" style="margin:0">
                    Or keep the appointment and trim your arrival buffer to <b>{dur(plan.recovery.maxBufferThatFits)}</b> (wheels stop at <b class="mono">{plan.recovery.earliestLegalArrival.apptShort}</b>).
                  </p>
                )}
                <button class="primary wide" onClick={applyEarliestAppt}>
                  Use earliest workable appointment ({plan.recovery.earliestWorkableAppt.apptShort})
                </button>
              </>
            ) : (
              <p class="small" style="margin:0">
                Adjust pre-trip allowance or run length so each shift fits inside FMCSA’s 11-hour driving and 14-hour duty window limits.
              </p>
            )}
          </div>
        </Card>
      )}

      {/* 2b. FEASIBLE ACTION CHECKLIST IN ORDER */}
      {plan.validInput && plan.feasible && (
        <Card title="Action checklist">
          <ol class="rollout-steps" data-rollout-checklist="1">
            {/* Step 1: Latest shutdown for 10h break (or 34h reset / current shift) */}
            <li class="rollout-step" data-rollout-shutdown="1">
              <div class="rollout-step-head">
                <span class="rollout-step-num">1</span>
                <span class="rollout-step-title">
                  {plan.restMode === 'current_shift'
                    ? 'Pre-run rest (none required)'
                    : plan.restMode === 'restart34'
                      ? 'Latest shutdown for 34-hour reset'
                      : 'Latest shutdown for 10-hour break'}
                </span>
                {plan.inParkingSweetSpot && (
                  <span class="rollout-badge good" data-rollout-sweetspot="1">08:00–10:00 parking sweet spot</span>
                )}
              </div>
              {plan.restMode === 'current_shift' ? (
                <p class="small" style="margin:0">
                  Fits on your current shift clocks without a 10-hour break before roll-out.
                </p>
              ) : (
                <>
                  <div class="rollout-time-main mono">{plan.latestShutdown.homeText}</div>
                  {!plan.sameZone && (
                    <div class="muted small mono">{plan.latestShutdown.apptText} (appointment local)</div>
                  )}
                  {plan.currentRestCoversBreak && plan.currentRestStart && plan.currentRestDoneAt && (
                    <p class="small" style="margin:0">
                      Your current rest (since <b class="mono">{plan.currentRestStart.homeShort}</b>) already covers this — {plan.requiredRestMinutes / 60}h completes at <b class="mono">{plan.currentRestDoneAt.homeShort}</b>.
                    </p>
                  )}
                  {plan.inParkingSweetSpot && (
                    <p class="muted small" style="margin:0">
                      Lands in the 08:00–10:00 parking sweet spot — overnight drivers park easiest right after daytime trucks roll out.
                    </p>
                  )}
                </>
              )}
            </li>

            {/* Step 2: Exact roll-out / pre-trip time in BOTH zones */}
            <li class="rollout-step highlight" data-rollout-rollout="1">
              <div class="rollout-step-head">
                <span class="rollout-step-num">2</span>
                <span class="rollout-step-title">Roll out &amp; start pre-trip</span>
                <span class="rollout-badge accent">Both zones</span>
              </div>
              <div class="rollout-dual">
                <div class="rollout-dual-box">
                  <span class="rollout-dual-lbl">Home terminal ({plan.homeZoneName})</span>
                  <span class="rollout-dual-val mono">{plan.rollOut.homeText}</span>
                </div>
                <div class="rollout-dual-box">
                  <span class="rollout-dual-lbl">Appointment local ({plan.apptZoneName})</span>
                  <span class="rollout-dual-val mono">{plan.rollOut.apptText}</span>
                </div>
              </div>
              <p class="muted small" style="margin:0">
                {plan.preTripMinutes > 0
                  ? <>Pre-trip {dur(plan.preTripMinutes)} on duty → wheels roll at <b class="mono">{plan.wheelsRoll.homeShort}</b>{!plan.sameZone && <> (<b class="mono">{plan.wheelsRoll.apptShort}</b>)</>}.</>
                  : <>Wheels roll immediately at <b class="mono">{plan.wheelsRoll.homeShort}</b> (0m pre-trip).</>}
                {' '}Total drive: <b>{dur(plan.driveMinutes)}</b>{distanceMode === 'miles' && <> ({miles} mi @ {plan.effectiveMph} mph)</>}.
              </p>
            </li>

            {/* Step 3: Mandatory 30-minute break window */}
            <li class="rollout-step" data-rollout-break="1">
              <div class="rollout-step-head">
                <span class="rollout-step-num">3</span>
                <span class="rollout-step-title">Mandatory 30-minute break</span>
              </div>
              {plan.breakWindow.required && plan.breakWindow.earliestStart && plan.breakWindow.latestStart ? (
                <>
                  <div class="rollout-dual">
                    <div class="rollout-dual-box">
                      <span class="rollout-dual-lbl">Earliest break start</span>
                      <span class="rollout-dual-val mono">{plan.breakWindow.earliestStart.homeShort}</span>
                      {!plan.sameZone && <span class="muted small mono">{plan.breakWindow.earliestStart.apptShort}</span>}
                      <span class="muted small">After {dur(plan.breakWindow.minDriveBeforeBreak)} driving (leaves 8h 00m max)</span>
                    </div>
                    <div class="rollout-dual-box">
                      <span class="rollout-dual-lbl">Latest break start</span>
                      <span class="rollout-dual-val mono">{plan.breakWindow.latestStart.homeShort}</span>
                      {!plan.sameZone && <span class="muted small mono">{plan.breakWindow.latestStart.apptShort}</span>}
                      <span class="muted small">At {dur(plan.breakWindow.maxDriveBeforeBreak)} driving (8h limit)</span>
                    </div>
                  </div>
                </>
              ) : (
                <p class="small" style="margin:0">{plan.breakWindow.reason}.</p>
              )}
              {plan.legs.length > 1 && (
                <div class="muted small">
                  Multi-shift run ({plan.legs.length} shifts): includes {plan.legs.length - 1} en-route 10-hour rest{plan.legs.length - 1 > 1 ? 's' : ''}.
                  {plan.legs.map((lg) => lg.enRouteRestAfter && (
                    <div key={lg.legIndex} style="margin-top:4px">
                      Shift {lg.legIndex + 1} ends <b class="mono">{lg.legEnd.homeShort}</b> → 10h en-route break until <b class="mono">{lg.enRouteRestAfter.end.homeShort}</b>.
                    </div>
                  ))}
                </div>
              )}
            </li>

            {/* Step 4: Buffered arrival & planned arrival */}
            <li class="rollout-step" data-rollout-arrival="1">
              <div class="rollout-step-head">
                <span class="rollout-step-num">4</span>
                <span class="rollout-step-title">Buffered &amp; planned arrival</span>
              </div>
              <div class="rollout-dual">
                <div class="rollout-dual-box">
                  <span class="rollout-dual-lbl">Buffered target (−{dur(plan.bufferMinutes)})</span>
                  <span class="rollout-dual-val mono">{plan.bufferedArrival.apptText}</span>
                  {!plan.sameZone && <span class="muted small mono">{plan.bufferedArrival.homeShort} (home)</span>}
                </div>
                <div class="rollout-dual-box">
                  <span class="rollout-dual-lbl">Planned arrival</span>
                  <span class="rollout-dual-val mono">{plan.plannedArrival.apptText}</span>
                  {!plan.sameZone && <span class="muted small mono">{plan.plannedArrival.homeShort} (home)</span>}
                </div>
              </div>
              <p class="muted small" style="margin:0">
                Hard appointment: <b class="mono">{plan.appointment.apptText}</b>
                {!plan.sameZone && <> (<b class="mono">{plan.appointment.homeShort}</b> home)</>}.
              </p>
            </li>

            {/* Step 5: Ready-to-send dispatch PTA */}
            <li class="rollout-step" data-rollout-pta-step="1">
              <div class="rollout-step-head">
                <span class="rollout-step-num">5</span>
                <span class="rollout-step-title">Dispatch PTA (empty &amp; available)</span>
              </div>
              <div class="rollout-time-main mono">{plan.pta.apptText}</div>
              {!plan.sameZone && (
                <div class="muted small mono">{plan.pta.homeText} (home terminal)</div>
              )}
              <p class="muted small" style="margin:0">
                Appointment + {dur(plan.dockMinutes)} dock/unload time.
                {plan.windowPastAtPta && <> Note: 14-hour shift window ends before unload completes — plan a 10h break or split before your next dispatch.</>}
              </p>
              <div class="rollout-pta-box">
                <pre class="rollout-pta-text" data-rollout-pta="1">{plan.ptaText}</pre>
                <div class="rollout-pta-actions">
                  <button class="primary" onClick={copyPta}>{copyNote || 'Copy PTA for dispatch'}</button>
                </div>
              </div>
            </li>
          </ol>
        </Card>
      )}

      {/* 3. Log basis disclosure when log is fresh/incomplete */}
      {hist !== 'known' && (
        <div class="warnbox small">
          Your log does not cover a full {plan.cycleWindowDays}-day cycle yet, so unlogged past days count as 0h. Update past days in <b>Log</b> or{' '}
          <button class="link" style="display:inline;padding:0;min-height:0" onClick={() => { openRolloutPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}>Hours coming back</button>.
        </div>
      )}

      {/* 4. INPUTS CARD */}
      <Card title="Appointment & run details">
        {/* Appointment date, time, and explicit timezone toggle */}
        <div class="rollout-section">
          <span class="stat-label">Appointment time entered in</span>
          <div class="rollout-seg" role="group" aria-label="Appointment timezone entry mode">
            <button
              class={entryZoneMode === 'local' ? 'on' : ''}
              onClick={() => setEntryZoneMode('local')}
            >
              Appointment local ({plan.apptZoneName})
            </button>
            <button
              class={entryZoneMode === 'terminal' ? 'on' : ''}
              onClick={() => setEntryZoneMode('terminal')}
            >
              Home terminal ({plan.homeZoneName})
            </button>
          </div>

          <div class="rollout-fieldrow">
            <label>Appointment facility time zone
              <select
                aria-label="Appointment time zone"
                value={apptTz}
                onChange={(e) => setApptTz((e.target as HTMLSelectElement).value)}
              >
                {zoneChoices.map((z) => (
                  <option key={z} value={z}>
                    {zoneLabel(z) ?? z}{z === s.config.timeZone ? ' (Home terminal)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div class="rollout-fieldrow">
            <span class="stat-label">Appointment date &amp; time ({entryZoneName})</span>
            <button
              class="rowbtn"
              data-rollout-appt-btn="1"
              data-rollout-appt-date={apptDate}
              data-rollout-appt-time={apptTime}
              aria-label={`Appointment date and time (${entryZoneName}): ${plan.validInput ? plan.appointment.apptText : `${apptDate} ${apptTime}`}. Change`}
              onClick={() => openSheet({
                kind: 'rollouttime',
                apptDate,
                apptTime,
                entryZoneName,
                entryTimeZone: entryTz,
                fallbackMinute: plan.validInput ? plan.appointment.minute : null,
                onApply: (d, t) => { setApptDate(d); setApptTime(t); },
              })}
            >
              <span>
                <b class="mono">{plan.validInput ? plan.appointment.apptText : `${apptDate} ${apptTime}`}</b>
                {plan.validInput && !plan.sameZone && (
                  <><br /><span class="muted small mono">{plan.appointment.homeText} (home)</span></>
                )}
              </span>
              <span class="muted small">Change</span>
            </button>
          </div>
        </div>

        {/* Distance (miles + speed) OR direct drive hours */}
        <div class="rollout-section">
          <span class="stat-label">Run length</span>
          <div class="rollout-seg" role="group" aria-label="Run length entry mode">
            <button class={distanceMode === 'miles' ? 'on' : ''} onClick={() => setDistanceMode('miles')}>Miles + speed</button>
            <button class={distanceMode === 'hours' ? 'on' : ''} onClick={() => setDistanceMode('hours')}>Direct drive hours</button>
          </div>

          {distanceMode === 'miles' ? (
            <>
              <div class="rollout-chips" role="group" aria-label="Distance presets">
                {MILES_PRESETS.map((m) => (
                  <button key={m} class={miles === m ? 'on' : ''} onClick={() => setMiles(m)}>{m} mi</button>
                ))}
              </div>
              <div class="rollout-fieldgrid">
                <label>Distance (miles)
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={1}
                    max={5000}
                    aria-label="Distance in miles"
                    value={miles}
                    onInput={(e) => setMiles(Math.max(0, Math.min(5000, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
                <label>Avg speed (45–65 mph)
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={MIN_MPH}
                    max={MAX_MPH}
                    aria-label="Average speed mph"
                    value={mph}
                    onInput={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(v)) setMph(Math.max(MIN_MPH, Math.min(MAX_MPH, Math.round(v))));
                    }}
                  />
                </label>
              </div>
              <div class="rollout-chips" role="group" aria-label="Average speed presets">
                {MPH_PRESETS.map((v) => (
                  <button key={v} class={mph === v ? 'on' : ''} onClick={() => setMph(v)}>{v} mph</button>
                ))}
              </div>
              <p class="muted small" style="margin:6px 0 0">
                Drive time: <b class="mono">{dur(plan.driveMinutes)}</b> at {plan.effectiveMph} mph.
              </p>
            </>
          ) : (
            <>
              <div class="rollout-chips" role="group" aria-label="Drive hours presets">
                {HOURS_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    class={driveHours * 60 + driveMins === p.minutes ? 'on' : ''}
                    onClick={() => { setDriveHours(Math.floor(p.minutes / 60)); setDriveMins(p.minutes % 60); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div class="rollout-fieldgrid">
                <label>Drive hours
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={0}
                    max={60}
                    aria-label="Drive hours"
                    value={driveHours}
                    onInput={(e) => setDriveHours(Math.max(0, Math.min(60, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
                <label>Drive minutes
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    aria-label="Drive minutes"
                    value={driveMins}
                    onInput={(e) => setDriveMins(Math.max(0, Math.min(59, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* Buffer, dock time, pre-trip */}
        <div class="rollout-section">
          <span class="stat-label">Arrival buffer (arrive early)</span>
          <div class="rollout-chips" role="group" aria-label="Arrival buffer presets">
            {BUFFER_PRESETS.map((m) => (
              <button key={m} class={bufferMin === m ? 'on' : ''} onClick={() => setBufferMin(m)}>{m === 0 ? '0m' : dur(m)}</button>
            ))}
          </div>
          <div class="rollout-fieldrow">
            <label>Custom arrival buffer (minutes)
              <input
                type="number"
                class="num"
                inputMode="numeric"
                min={0}
                max={240}
                aria-label="Arrival buffer minutes"
                value={bufferMin}
                onInput={(e) => setBufferMin(Math.max(0, Math.min(240, Number((e.target as HTMLInputElement).value) || 0)))}
              />
            </label>
          </div>
        </div>

        <div class="rollout-section">
          <span class="stat-label">Expected dock / unload time (for PTA)</span>
          <div class="rollout-chips" role="group" aria-label="Dock unload presets">
            {DOCK_PRESETS.map((p) => (
              <button key={p.minutes} class={dockMin === p.minutes ? 'on' : ''} onClick={() => setDockMin(p.minutes)}>{p.label}</button>
            ))}
          </div>
          <div class="rollout-fieldrow">
            <label>Custom dock / unload time (minutes)
              <input
                type="number"
                class="num"
                inputMode="numeric"
                min={0}
                max={720}
                aria-label="Dock or unload minutes"
                value={dockMin}
                onInput={(e) => setDockMin(Math.max(0, Math.min(720, Number((e.target as HTMLInputElement).value) || 0)))}
              />
            </label>
          </div>
        </div>

        <div class="rollout-section">
          <span class="stat-label">Pre-trip / roll-out allowance (on duty)</span>
          <div class="rollout-chips" role="group" aria-label="Pre-trip presets">
            {PRETRIP_PRESETS.map((m) => (
              <button key={m} class={preTripMin === m ? 'on' : ''} onClick={() => setPreTripMin(m)}>{m === 0 ? '0m' : dur(m)}</button>
            ))}
          </div>
          <div class="rollout-fieldrow">
            <label>Custom pre-trip allowance (minutes)
              <input
                type="number"
                class="num"
                inputMode="numeric"
                min={0}
                max={240}
                aria-label="Pre-trip minutes"
                value={preTripMin}
                onInput={(e) => setPreTripMin(Math.max(0, Math.min(240, Number((e.target as HTMLInputElement).value) || 0)))}
              />
            </label>
          </div>
        </div>
      </Card>
      {!hasChainedPrior ? (
        <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="rollout" />
      ) : prefill?.chainedCustomClocks ? (
        <div class="clock-override-bar is-custom" data-clock-override="rollout" data-clock-override-active="1" data-chained-custom-clocks="1">
          <div class="clock-override-head">
            <span class="small">
              <b>Custom ELD clocks (from My Week)</b> · <span class="mono">{dur(prefill.chainedCustomClocks.driveLeft)}</span> drive · <span class="mono">{dur(prefill.chainedCustomClocks.windowLeft)}</span> win · <span class="mono">{dur(prefill.chainedCustomClocks.cycleLeft)}</span> cycle
            </span>
          </div>
          <p class="muted small" style="margin:4px 0 0">Carried from My Week for this chained load — go back to My Week to change these clocks.</p>
        </div>
      ) : null}
    </>
  );
}

/* ============================================================ Split-sleeper rescue simulator ("Split-sleeper rescue") */

/**
 * Split-Sleeper Rescue Simulator: optional target delivery deadline on the shared ClockPick.
 * Converts home-terminal wall-clock strings through `deviceTz` in the exact pattern of `RolloutTimeSheet`.
 */
function RescueTimeSheet({ k, now, closing = false }: { k: Extract<SheetKind, { kind: 'rescuetime' }>; now: number; closing?: boolean }) {
  const nowWall = formatWallDateTime(now, k.homeTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  const [at, setAt] = useState<number>(() => {
    const wall = formatWallDateTime(k.deadlineMinute, k.homeTimeZone);
    const parsed = resolveWallDateTime(wall.date, wall.time, deviceTz);
    return parsed ?? nextHour(pickerNow);
  });
  const apply = () => {
    const wall = formatWallDateTime(at, deviceTz);
    const resolved = resolveRescueDeadline(wall.date, wall.time, k.homeTimeZone);
    if (resolved !== null) k.onApply(resolved);
    openSheet(null);
  };
  return (
    <Sheet title={`Target deadline (${k.homeZoneName})`} closing={closing}>
      <p class="muted small" style="margin:0">Wall-clock deadline in <b>{k.homeZoneName}</b> (home terminal) time.</p>
      <ClockPick at={at} set={setAt} now={pickerNow} future={true} say="Deadline" name="Target deadline" keys={KEYS_HOURS} />
      <button class="primary wide ed-go" onClick={apply}>Apply · {clockFull(at)} ({k.homeZoneName})</button>
    </Sheet>
  );
}

function RescueStrategyCard({ st, deadlineShort }: { st: RescueStrategyResult; deadlineShort: string | null }) {
  const badgeTone = st.recommended ? 'good' : st.tone;
  return (
    <section
      class={`card rescue-card ${st.recommended ? 'is-rec' : ''} ${st.tone === 'bad' ? 'bad' : st.tone === 'warn' ? 'warn' : ''}`}
      data-rescue-card={st.id}
      data-rescue-recommended={st.recommended ? '1' : '0'}
      data-rescue-legal={st.hosLegal ? '1' : '0'}
      data-rescue-makes-it={st.makesIt ? '1' : '0'}
    >
      <div class="rescue-card-head">
        <div class="rescue-card-title-wrap">
          <h3 class="rescue-card-title">{st.title}</h3>
          <span class="rescue-card-order">{st.orderLabel}</span>
        </div>
        <div class="rescue-badges">
          {st.recommended && <span class="rescue-badge good" data-rescue-rec-badge="1">Recommended</span>}
          <span class={`rescue-badge ${badgeTone}`}>{st.badge}</span>
        </div>
      </div>

      <p class="rescue-verdict-line">{st.verdictLine}</p>

      <div class="rescue-times">
        <div class="rescue-time-box" data-rescue-release={st.id}>
          <span class="rescue-time-lbl">Release (drive again)</span>
          <span class="rescue-time-val mono">{st.releaseShort}</span>
          <span class="rescue-time-sub">{st.insertedBreakMinutes > 0 ? `Includes ${dur(st.insertedBreakMinutes)} 30m break` : 'Earliest legal roll'}</span>
        </div>
        <div class="rescue-time-box" data-rescue-finish={st.id}>
          <span class="rescue-time-lbl">Projected finish</span>
          <span class="rescue-time-val mono">{st.finishShort}</span>
          <span class="rescue-time-sub">
            {st.deadlineSlack !== null && deadlineShort
              ? st.deadlineSlack >= 0
                ? `${st.deadlineSlack === 0 ? 'On' : `${dur(st.deadlineSlack)} before`} ${deadlineShort}`
                : `${dur(-st.deadlineSlack)} past ${deadlineShort}`
              : st.savedVsStraight10 > 0
                ? `${dur(st.savedVsStraight10)} faster than Straight 10`
                : st.id === 'straight10'
                  ? 'Baseline full rest'
                  : 'Same or slower than Straight 10'}
          </span>
        </div>
      </div>

      {st.steps.length > 0 && (
        <ol class="rescue-steps">
          {st.steps.map((step, idx) => (
            <li key={idx} class={`rescue-step ${step.isLongSB ? 'is-sb' : ''}`}>
              <span class="rescue-step-lbl">{idx + 1}. {step.label}</span>
              <span class="rescue-step-win mono">{step.startShort} → {step.endShort} ({dur(step.minutes)})</span>
            </li>
          ))}
        </ol>
      )}

      {st.isSplit && st.longSbBlock && (
        <div class="rescue-sb-box" data-rescue-sb-callout={st.id}>
          <span class="rescue-sb-title">
            {st.longSbBlock.alreadyLogged ? 'Prior Sleeper Berth long leg' : 'Required Sleeper Berth block'}
          </span>
          <span class="rescue-sb-block mono">
            {st.longSbBlock.startShort} → {st.longSbBlock.endShort} ({dur(st.longSbBlock.minutes)} consecutive SB)
          </span>
          <span class="rescue-sb-callout">{st.longSbBlock.callout || SPLIT_SB_CALLOUT}</span>
        </div>
      )}

      {st.isSplit && st.nextShift && (
        <div class={`rescue-trap ${st.nextShift.trapTone}`} data-rescue-next-shift={st.id}>
          <span class="rescue-trap-head">
            Next-shift trap ({st.nextShift.atLabel} at {st.nextShift.atShort})
          </span>
          <div class="rescue-trap-grid">
            <div class="rescue-trap-metric" data-rescue-next-drive={st.id}>
              <span>11h drive left</span>
              <b class="mono">{dur(st.nextShift.driveRemaining)}</b>
            </div>
            <div class="rescue-trap-metric" data-rescue-next-window={st.id}>
              <span>14h window left</span>
              <b class="mono">{dur(st.nextShift.windowRemaining)}</b>
            </div>
          </div>
          <p class="rescue-trap-note">{st.nextShift.trapSummary}</p>
        </div>
      )}

      {!st.isSplit && st.id === 'straight10' && st.nextShift && (
        <div class="rescue-trap" data-rescue-next-shift="straight10">
          <span class="rescue-trap-head">Follow-on shift after 10-hour rest</span>
          <p class="rescue-trap-note">{st.nextShift.trapSummary}</p>
        </div>
      )}
    </section>
  );
}

/**
 * Split-Sleeper Rescue Simulator ("Split-sleeper rescue").
 * Seeded from the driver's logged clocks (`loggedSegments(s, now)`). Compares Straight 10,
 * 8/2 split, 7/3 split, and Roll now side-by-side through `engine/src/index.ts`.
 */
function RescueTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const prefill = useMemo(() => {
    const p = pendingRescuePrefill;
    pendingRescuePrefill = null;
    return p;
  }, []);
  const initWait = prefill?.dockWaitMinutes ?? RESCUE_DEFAULT_WAIT_MIN;
  const initDrive = prefill?.driveMinutes ?? RESCUE_DEFAULT_DRIVE_DIRECT;
  const [waitHours, setWaitHours] = useState(Math.floor(initWait / 60));
  const [waitMins, setWaitMins] = useState(initWait % 60);
  const [distanceMode, setDistanceMode] = useState<RescueDistanceMode>(prefill?.distanceMode ?? 'hours');
  const [miles, setMiles] = useState(prefill?.miles ?? RESCUE_DEFAULT_MILES);
  const [mph, setMph] = useState(() => Math.max(RESCUE_MIN_MPH, Math.min(RESCUE_MAX_MPH, Math.round(prefill?.mph ?? (s.mph || RESCUE_DEFAULT_MPH)))));
  const [driveHours, setDriveHours] = useState(Math.floor(initDrive / 60));
  const [driveMins, setDriveMins] = useState(initDrive % 60);
  const [useDeadline, setUseDeadline] = useState(Boolean(prefill?.deadlineMinute != null));
  const [deadlineMin, setDeadlineMin] = useState<number>(() => prefill?.deadlineMinute ?? (now + 10 * 60));
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(prefill?.chainedCustomClocks ?? null);

  const hasChainedPrior = Boolean(prefill?.chainedPriorSegments?.length);
  const evalNow = prefill?.chainedCursor ?? now;
  const logged = useMemo(() => {
    const base = hasChainedPrior
      ? (prefill?.chainedBaseSegments ?? loggedSegments(s, now))
      : customClocks
        ? (customClocks === prefill?.chainedCustomClocks && prefill?.chainedBaseSegments
          ? prefill.chainedBaseSegments
          : synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments)
        : loggedSegments(s, now);
    if (!hasChainedPrior) return base;
    const prior = prefill!.chainedPriorSegments!.map(({ tentative: _t, ...rest }) => rest);
    return [...base, ...prior];
  }, [s, now, prefill, hasChainedPrior, customClocks]);
  const dockWaitMinutes = waitHours * 60 + waitMins;
  const driveMinutesDirect = driveHours * 60 + driveMins;

  const sim = useMemo(
    () => simulateRescue({
      segments: logged,
      now: evalNow,
      config: s.config,
      dockWaitMinutes,
      distanceMode,
      miles,
      mph,
      driveMinutesDirect,
      deadlineMinute: useDeadline ? deadlineMin : null,
    }),
    [logged, evalNow, s.config, dockWaitMinutes, distanceMode, miles, mph, driveMinutesDirect, useDeadline, deadlineMin],
  );

  const hist = cycleBasis(s, now, sim.cycleWindowDays);

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Split-sleeper rescue</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Stuck at the dock or running tight? Compare Straight 10, 8/2 split, 7/3 split, and rolling now before you commit.
      </p>

      {/* 1. VERDICT FIRST */}
      <Card tone={sim.tone}>
        <div
          class="rescue-verdict"
          data-rescue-verdict="1"
          data-rescue-no-rescue={sim.noRescue ? '1' : '0'}
        >
          <Sign kind={sim.verdictSign}>{sim.verdictLabel}</Sign>
          <p class="rescue-headline">{sim.headline}</p>
          <p class="rescue-subline">{sim.subline}</p>
          <div class="rescue-clocks">
            <div class="rescue-clock-pill">
              <span>11h drive left</span>
              <b class="mono">{dur(sim.driveRemainingNow)}</b>
            </div>
            <div class="rescue-clock-pill">
              <span>14h window left</span>
              <b class="mono">{dur(sim.windowRemainingNow)}</b>
            </div>
            <div class="rescue-clock-pill">
              <span>{sim.cycleLimit / 60}h cycle left</span>
              <b class="mono">{dur(sim.cycleRemainingNow)}</b>
            </div>
          </div>
          <p class="muted small" style="margin:0">
            {hasChainedPrior
              ? (prefill?.chainedCustomClocks
                ? `Seeded from My Week custom clocks + chain (${prefill.chainedFromLabel})`
                : `Seeded from My Week chain (${prefill?.chainedFromLabel})`)
              : customClocks
                ? (prefill?.chainedCustomClocks && customClocks === prefill.chainedCustomClocks
                  ? 'Seeded from My Week custom clocks'
                  : 'Seeded from custom ELD clocks')
                : 'Seeded from your log'} at <b class="mono">{sim.nowShort}</b> ({sim.homeZoneName})
            {sim.pendingSplitLeg && (
              <> · Pending split leg on log: <b>{dur(sim.pendingSplitLeg.duration)}</b> ({sim.pendingSplitLeg.qualifiesLongSB ? 'Sleeper Berth' : 'OFF/SB'})</>
            )}
            .
          </p>
        </div>
      </Card>

      {/* 2. STACKED STRATEGY COMPARISON CARDS (BEST-FIRST) */}
      {sim.validInput && sim.strategies.length > 0 && (
        <div class="rescue-stack" data-rescue-strategies="1">
          {sim.strategies.map((st) => (
            <RescueStrategyCard key={st.id} st={st} deadlineShort={sim.deadlineShort} />
          ))}
        </div>
      )}

      {/* 3. LOG BASIS DISCLOSURE */}
      {hist !== 'known' && (
        <div class="warnbox small" style="margin-top:10px">
          Your log does not cover a full {sim.cycleWindowDays}-day cycle yet, so unlogged past days count as 0h. Update past days in <b>Log</b> or{' '}
          <button class="link" style="display:inline;padding:0;min-height:0" onClick={() => { openRescuePlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}>Hours coming back</button>.
        </div>
      )}

      {/* 4. INPUTS CARD */}
      <Card title="Dock delay &amp; remaining drive">
        {/* A. Dock wait / delay as a DURATION (never a time input) */}
        <div class="rollout-section">
          <span class="stat-label">Planned dock wait / delay (duration)</span>
          <div class="rollout-chips" role="group" aria-label="Dock wait presets">
            {RESCUE_WAIT_PRESETS.map((p) => (
              <button
                key={p.minutes}
                class={dockWaitMinutes === p.minutes ? 'on' : ''}
                onClick={() => { setWaitHours(Math.floor(p.minutes / 60)); setWaitMins(p.minutes % 60); }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div class="rollout-fieldgrid">
            <label>Wait hours
              <input
                type="number"
                class="num"
                inputMode="numeric"
                min={0}
                max={24}
                data-rescue-wait-h="1"
                aria-label="Dock wait hours"
                value={waitHours}
                onInput={(e) => setWaitHours(Math.max(0, Math.min(24, Number((e.target as HTMLInputElement).value) || 0)))}
              />
            </label>
            <label>Wait minutes
              <input
                type="number"
                class="num"
                inputMode="numeric"
                min={0}
                max={59}
                data-rescue-wait-m="1"
                aria-label="Dock wait minutes"
                value={waitMins}
                onInput={(e) => setWaitMins(Math.max(0, Math.min(59, Number((e.target as HTMLInputElement).value) || 0)))}
              />
            </label>
          </div>
        </div>

        {/* B. Remaining drive still needed (miles + mph OR drive hours) */}
        <div class="rollout-section">
          <span class="stat-label">Remaining drive still needed</span>
          <div class="rollout-seg" role="group" aria-label="Remaining drive entry mode">
            <button class={distanceMode === 'hours' ? 'on' : ''} onClick={() => setDistanceMode('hours')}>Direct drive hours</button>
            <button class={distanceMode === 'miles' ? 'on' : ''} onClick={() => setDistanceMode('miles')}>Miles + speed</button>
          </div>

          {distanceMode === 'miles' ? (
            <>
              <div class="rollout-chips" role="group" aria-label="Remaining miles presets">
                {RESCUE_MILES_PRESETS.map((m) => (
                  <button key={m} class={miles === m ? 'on' : ''} onClick={() => setMiles(m)}>{m} mi</button>
                ))}
              </div>
              <div class="rollout-fieldgrid">
                <label>Remaining miles
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={1}
                    max={2000}
                    aria-label="Remaining miles"
                    value={miles}
                    onInput={(e) => setMiles(Math.max(0, Math.min(2000, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
                <label>Avg speed (45–65 mph)
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={RESCUE_MIN_MPH}
                    max={RESCUE_MAX_MPH}
                    aria-label="Average speed mph"
                    value={mph}
                    onInput={(e) => {
                      const v = Number((e.target as HTMLInputElement).value);
                      if (Number.isFinite(v)) setMph(Math.max(RESCUE_MIN_MPH, Math.min(RESCUE_MAX_MPH, Math.round(v))));
                    }}
                  />
                </label>
              </div>
              <div class="rollout-chips" role="group" aria-label="Average speed presets">
                {RESCUE_MPH_PRESETS.map((v) => (
                  <button key={v} class={mph === v ? 'on' : ''} onClick={() => setMph(v)}>{v} mph</button>
                ))}
              </div>
              <p class="muted small" style="margin:6px 0 0">
                Remaining drive: <b class="mono">{dur(sim.driveMinutes)}</b> at {sim.effectiveMph} mph.
              </p>
            </>
          ) : (
            <>
              <div class="rollout-chips" role="group" aria-label="Remaining drive presets">
                {RESCUE_HOURS_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    class={driveMinutesDirect === p.minutes ? 'on' : ''}
                    onClick={() => { setDriveHours(Math.floor(p.minutes / 60)); setDriveMins(p.minutes % 60); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div class="rollout-fieldgrid">
                <label>Drive hours
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    data-rescue-drive-h="1"
                    aria-label="Remaining drive hours"
                    value={driveHours}
                    onInput={(e) => setDriveHours(Math.max(0, Math.min(24, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
                <label>Drive minutes
                  <input
                    type="number"
                    class="num"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    data-rescue-drive-m="1"
                    aria-label="Remaining drive minutes"
                    value={driveMins}
                    onInput={(e) => setDriveMins(Math.max(0, Math.min(59, Number((e.target as HTMLInputElement).value) || 0)))}
                  />
                </label>
              </div>
            </>
          )}
        </div>

        {/* C. Optional delivery deadline using THE shared ClockPick component */}
        <div class="rollout-section">
          <span class="stat-label">Target delivery deadline (optional)</span>
          <div class="rollout-seg" role="group" aria-label="Target deadline mode">
            <button class={!useDeadline ? 'on' : ''} onClick={() => setUseDeadline(false)}>No deadline</button>
            <button class={useDeadline ? 'on' : ''} onClick={() => setUseDeadline(true)}>Set deadline</button>
          </div>
          {useDeadline && (
            <div class="rollout-fieldrow">
              <button
                class="rowbtn"
                data-rescue-deadline-btn="1"
                data-rescue-deadline-min={String(deadlineMin)}
                aria-label={`Target deadline (${sim.homeZoneName}): ${fmtRescueFull(deadlineMin, sim.homeTimeZone)}. Change`}
                onClick={() => openSheet({
                  kind: 'rescuetime',
                  deadlineMinute: deadlineMin,
                  homeZoneName: sim.homeZoneName,
                  homeTimeZone: sim.homeTimeZone,
                  onApply: (m) => setDeadlineMin(m),
                })}
              >
                <span>
                  <b class="mono">{fmtRescueFull(deadlineMin, sim.homeTimeZone)}</b>
                  <br />
                  <span class="muted small">Compare which strategies finish on or before {fmtRescueShort(deadlineMin, sim.homeTimeZone)}</span>
                </span>
                <span class="muted small">Change</span>
              </button>
            </div>
          )}
        </div>
      </Card>
      {!hasChainedPrior ? (
        <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="rescue" />
      ) : prefill?.chainedCustomClocks ? (
        <div class="clock-override-bar is-custom" data-clock-override="rescue" data-clock-override-active="1" data-chained-custom-clocks="1">
          <div class="clock-override-head">
            <span class="small">
              <b>Custom ELD clocks (from My Week)</b> · <span class="mono">{dur(prefill.chainedCustomClocks.driveLeft)}</span> drive · <span class="mono">{dur(prefill.chainedCustomClocks.windowLeft)}</span> win · <span class="mono">{dur(prefill.chainedCustomClocks.cycleLeft)}</span> cycle
            </span>
          </div>
          <p class="muted small" style="margin:4px 0 0">Carried from My Week for this chained load — go back to My Week to change these clocks.</p>
        </div>
      ) : null}
    </>
  );
}

/* ============================================================ Stack My Stops & Loads (Plan tool #8) */

/**
 * Shared ClockPick sheet for Stack My Stops & Loads (per-stop hard appointment or start time).
 * Converts wall-clock strings in `entryTimeZone` through `deviceTz` (exact pattern of RolloutTimeSheet).
 */
function StackTimeSheet({ k, now, closing = false }: { k: Extract<SheetKind, { kind: 'stacktime' }>; now: number; closing?: boolean }) {
  const nowWall = formatWallDateTime(now, k.entryTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  const [at, setAt] = useState<number>(() => {
    const wall = formatWallDateTime(k.initialMinute, k.entryTimeZone);
    const parsed = resolveWallDateTime(wall.date, wall.time, deviceTz);
    return parsed ?? nextHour(pickerNow);
  });
  const previewWall = formatWallDateTime(at, deviceTz);
  const previewResolved = resolveStackWallMinute(previewWall.date, previewWall.time, k.entryTimeZone);
  const maxDep = k.mode === 'departure' ? now + STACK_MAX_DEPARTURE_FUTURE_MIN : null;
  const overMaxDep = maxDep !== null && previewResolved !== null && previewResolved > maxDep;
  const apply = () => {
    if (previewResolved !== null) k.onApply(previewResolved);
    openSheet(null);
  };
  return (
    <Sheet title={`${k.title} (${k.entryZoneName})`} closing={closing}>
      <p class="muted small" style="margin:0">
        Wall-clock time in <b>{k.entryZoneName}</b> time.{k.mode === 'departure' ? ' Up to 72 hours ahead.' : ''}
      </p>
      <ClockPick
        at={at}
        set={setAt}
        now={pickerNow}
        future={true}
        say={k.mode === 'departure' ? 'Start at' : 'Appointment'}
        name={k.title}
        keys={KEYS_HOURS}
      />
      {overMaxDep && maxDep !== null && (
        <p class="muted small" style="margin:0" data-stack-dep-cap-hint="1">
          Capped at 72h ahead ({fmtStackFull(maxDep, k.entryTimeZone)}).
        </p>
      )}
      <button class="primary wide ed-go" onClick={apply}>
        {overMaxDep && maxDep !== null
          ? `Apply · ${fmtStackFull(maxDep, k.entryTimeZone)} (72h max)`
          : `Apply · ${clockFull(at)} (${k.entryZoneName})`}
      </button>
    </Sheet>
  );
}

function StackStopEditor({
  stop,
  index,
  total,
  homeTz,
  homeZoneName,
  zoneChoices,
  suggestedApptMinute,
  onChange,
  onRemove,
}: {
  stop: StackStopInput;
  index: number;
  total: number;
  homeTz: string;
  homeZoneName: string;
  zoneChoices: string[];
  suggestedApptMinute: number;
  onChange: (patch: Partial<StackStopInput>) => void;
  onRemove: () => void;
}) {
  const dbox = useDurationBoxes(
    `${stop.label} dwell`,
    stop.dwellMinutes,
    0,
    STACK_MAX_DWELL_MIN,
    (m) => onChange({ dwellMinutes: m }),
  );
  const driveMin = stackLegDriveMinutes(stop.miles, stop.mph);
  const localTz = isValidTimeZone(stop.apptTimeZone) ? stop.apptTimeZone : homeTz;
  const sameZone = localTz === homeTz;
  const localZoneName = zoneShort(localTz);
  // N3 ("the time you see is the time that stays"): remember the active entry/display mode on the stop.
  const effectiveEntryMode: 'local' | 'terminal' = !sameZone && stop.apptEntryMode === 'terminal' ? 'terminal' : 'local';
  const entryTz = effectiveEntryMode === 'terminal' ? homeTz : localTz;
  const entryZoneName = effectiveEntryMode === 'terminal' ? homeZoneName : localZoneName;

  const openApptPicker = () => {
    openSheet({
      kind: 'stacktime',
      mode: 'appt',
      title: `${stop.label} appointment`,
      initialMinute: stop.apptMinute ?? ceilHour(suggestedApptMinute),
      entryZoneName,
      entryTimeZone: entryTz,
      onApply: (m) => onChange({ apptMinute: m, apptEntryMode: sameZone ? 'local' : effectiveEntryMode }),
    });
  };

  return (
    <div class="stack-stop-card" data-stack-stop-editor={String(index)}>
      <div class="stack-stop-head">
        <span class="rollout-step-num">{index + 1}</span>
        <input
          type="text"
          class="stack-label-input"
          aria-label={`Stop ${index + 1} name`}
          maxLength={40}
          value={stop.label}
          onInput={(e) => onChange({ label: (e.target as HTMLInputElement).value })}
        />
        {total > STACK_MIN_STOPS && (
          <button
            type="button"
            class="mini stack-remove-btn"
            aria-label={`Remove ${stop.label}`}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>

      {/* Miles + speed */}
      <div class="stack-sub">
        <div class="stack-sub-head">
          <span class="stat-label">Leg distance &amp; speed</span>
          <span class="muted small mono">{dur(driveMin)} @ {stop.mph} mph</span>
        </div>
        <div class="rollout-chips" role="group" aria-label={`Stop ${index + 1} miles presets`}>
          {STACK_MILES_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              class={stop.miles === m ? 'on' : ''}
              onClick={() => onChange({ miles: m })}
            >
              {m} mi
            </button>
          ))}
        </div>
        <div class="rollout-fieldgrid">
          <label>Miles
            <input
              type="number"
              class="num"
              inputMode="numeric"
              min={0}
              max={STACK_MAX_MILES}
              data-stack-miles={String(index)}
              aria-label={`Stop ${index + 1} miles`}
              value={stop.miles}
              onInput={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                if (Number.isFinite(v)) onChange({ miles: Math.max(0, Math.min(STACK_MAX_MILES, Math.round(v))) });
              }}
            />
          </label>
          <label>Realistic mph
            <select
              aria-label={`Stop ${index + 1} average speed mph`}
              data-stack-mph={String(index)}
              value={stop.mph}
              onChange={(e) => onChange({ mph: clampStackMph(Number((e.target as HTMLSelectElement).value)) })}
            >
              {STACK_MPH_PRESETS.map((v) => (
                <option key={v} value={v}>{v} mph</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Dwell duration (presets + shared duration boxes + duty status) */}
      <div class="stack-sub">
        <div class="stack-sub-head">
          <span class="stat-label">Expected dwell</span>
          <span class="muted small mono">{stop.dwellMinutes > 0 ? `${dur(stop.dwellMinutes)} ${STATUS_LABEL[stop.dwellStatus].toLowerCase()}` : 'None'}</span>
        </div>
        <div class="rollout-chips" role="group" aria-label={`Stop ${index + 1} dwell presets`}>
          {STACK_DWELL_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              class={stop.dwellMinutes === p.minutes ? 'on' : ''}
              onClick={() => onChange({ dwellMinutes: p.minutes })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div class="qs-row stack-dur-row">
          <span class="qs-label">Exact dwell</span>
          {dbox.boxes}
        </div>
        {dbox.note && <div class="warnbox small">{dbox.note}</div>}
        {stop.dwellMinutes > 0 && (
          <div class="stack-status-seg" role="group" aria-label={`Stop ${index + 1} dwell duty status`}>
            {(['ON', 'OFF', 'SB'] as const).map((st) => (
              <button
                key={st}
                type="button"
                class={stop.dwellStatus === st ? 'on' : ''}
                onClick={() => onChange({ dwellStatus: st })}
              >
                {st === 'ON' ? 'On duty' : st === 'OFF' ? 'Off duty' : 'Sleeper'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Optional Hard Appointment (ClockPick + dual home/local timezone) */}
      <div class="stack-sub">
        <span class="stat-label">Hard appointment (optional)</span>
        <div class="stack-appt-row">
          <button
            type="button"
            class="rowbtn"
            data-stack-appt-btn={String(index)}
            data-stack-appt-min={stop.apptMinute !== null ? String(stop.apptMinute) : ''}
            aria-label={stop.apptMinute !== null
              ? `${stop.label} appointment: ${fmtStackFull(stop.apptMinute, effectiveEntryMode === 'terminal' ? homeTz : localTz)}. Change`
              : `Set ${stop.label} appointment`}
            onClick={openApptPicker}
          >
            <span>
              {stop.apptMinute !== null ? (
                effectiveEntryMode === 'terminal' ? (
                  <>
                    <b class="mono">{fmtStackFull(stop.apptMinute, homeTz)} (home)</b>
                    <br /><span class="muted small mono">{fmtStackFull(stop.apptMinute, localTz)}</span>
                  </>
                ) : (
                  <>
                    <b class="mono">{fmtStackFull(stop.apptMinute, localTz)}</b>
                    {!sameZone && (
                      <><br /><span class="muted small mono">{fmtStackFull(stop.apptMinute, homeTz)} (home)</span></>
                    )}
                  </>
                )
              ) : (
                <span class="muted">No hard appointment</span>
              )}
            </span>
            <span class="muted small">{stop.apptMinute !== null ? 'Change' : 'Set time'}</span>
          </button>
          {stop.apptMinute !== null && (
            <button
              type="button"
              class="mini stack-clear-btn"
              aria-label={`Clear ${stop.label} appointment`}
              onClick={() => onChange({ apptMinute: null })}
            >
              Clear
            </button>
          )}
        </div>
        <div class="stack-tz-wrap">
          <label>Stop time zone
            <select
              aria-label={`Stop ${index + 1} time zone`}
              data-stack-tz={String(index)}
              value={localTz}
              onChange={(e) => {
                const newTz = (e.target as HTMLSelectElement).value;
                if (stop.apptMinute !== null && newTz !== localTz) {
                  // F2 + N3: Preserve the wall-clock reading displayed in the active entry mode
                  // (Home reading if in Home mode, stop-local reading otherwise) and re-resolve in `newTz`.
                  const sourceTz = effectiveEntryMode === 'terminal' ? homeTz : localTz;
                  const prevWall = formatWallDateTime(stop.apptMinute, sourceTz);
                  const reResolved = resolveStackWallMinute(prevWall.date, prevWall.time, newTz);
                  onChange({
                    apptTimeZone: newTz,
                    apptEntryMode: 'local',
                    ...(reResolved !== null ? { apptMinute: reResolved } : {}),
                  });
                } else {
                  onChange({
                    apptTimeZone: newTz,
                    ...(newTz === homeTz ? { apptEntryMode: 'local' } : {}),
                  });
                }
              }}
            >
              {zoneChoices.map((z) => (
                <option key={z} value={z}>
                  {zoneLabel(z) ?? z}{z === homeTz ? ' (Home terminal)' : ''}
                </option>
              ))}
            </select>
          </label>
          {!sameZone && (
            <div class="rollout-seg" role="group" aria-label={`Stop ${index + 1} time entry zone`}>
              <button type="button" class={effectiveEntryMode === 'local' ? 'on' : ''} onClick={() => onChange({ apptEntryMode: 'local' })}>
                Stop local ({localZoneName})
              </button>
              <button type="button" class={effectiveEntryMode === 'terminal' ? 'on' : ''} onClick={() => onChange({ apptEntryMode: 'terminal' })}>
                Home ({homeZoneName})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function StackTimelineList({
  stops,
  showingSplit,
  firstBreakIndex,
  limitingClock,
  cycleLimit,
  viewSwapping = false,
}: {
  stops: StackStopOutcome[];
  showingSplit: boolean;
  firstBreakIndex: number | null;
  limitingClock: StackLimitKind;
  cycleLimit: number;
  viewSwapping?: boolean;
}) {
  return (
    <ol
      key={showingSplit ? 'tl-split' : 'tl-base'}
      class={`rollout-steps${viewSwapping ? ' flow-body step-dissolve' : ''}`}
      data-stack-timeline="1"
    >
      {stops.map((o) => {
        const isBreakStop = !showingSplit && firstBreakIndex === o.index;
        const badgeClass = !o.meetsAppt
          ? 'bad'
          : isBreakStop
            ? 'warn'
            : o.insertedRests.some((r) => r.kind !== 'break30')
              ? 'accent'
              : 'good';
        const badgeText = !o.meetsAppt && o.apptSlack !== null
          ? `Late ${dur(-o.apptSlack)}`
          : isBreakStop
            ? (limitingClock === 'CYCLE'
              ? `Hits ${cycleLimit / 60}h cycle`
              : limitingClock === 'DRIVE_11'
                ? 'Hits 11h drive'
                : limitingClock === 'WINDOW_14'
                  ? 'Hits 14h window'
                  : limitingClock === 'BREAK_30'
                    ? '30-min break'
                    : limitingClock === 'TIME_ONLY'
                      ? 'Drive + dock time'
                      : 'Breaks here')
            : o.appt
              ? (o.apptSlack === 0 ? 'On time' : `${dur(o.apptSlack ?? 0)} early`)
              : o.insertedRests.some((r) => r.kind === 'reset10')
                ? 'After 10h reset'
                : o.insertedRests.some((r) => r.kind === 'restart34')
                  ? 'After 34h restart'
                  : o.insertedRests.some((r) => r.kind === 'recap')
                    ? 'After recap'
                    : 'Legal';
        return (
          <li
            key={o.id}
            class={`rollout-step${isBreakStop ? ' stack-step-break' : ''}`}
            data-stack-stop-out={String(o.index)}
          >
            <div class="rollout-step-head">
              <span class="rollout-step-num">{o.index + 1}</span>
              <span class="rollout-step-title">{o.label}</span>
              <span class={`rescue-badge ${badgeClass}`}>{badgeText}</span>
            </div>
            <p class="muted small" style="margin:0">
              Drive {o.miles} mi @ {o.effectiveMph} mph (<b class="mono">{dur(o.driveMinutes)}</b>)
              {o.dwellMinutes > 0 && <> · Dwell <b class="mono">{dur(o.dwellMinutes)}</b> ({STATUS_LABEL[o.dwellStatus].toLowerCase()})</>}
            </p>
            {o.insertedRests.length > 0 && (
              <div class="stack-rests">
                {o.insertedRests.map((r, ri) => (
                  <div key={ri} class={`stack-rest-pill${r.kind === 'split' ? ' is-sb' : ''}`}>
                    <b>{r.reason}</b>
                    <span class="mono">{r.startDual.homeShort} → {r.endDual.homeShort} ({dur(r.minutes)})</span>
                  </div>
                ))}
              </div>
            )}
            <div class="rollout-dual">
              <div class="rollout-dual-box">
                <span class="rollout-dual-lbl">ETA (wheels stop)</span>
                <span class="rollout-dual-val mono">{o.arrival.localShort}{!o.sameZone ? ` ${o.apptZoneName}` : ''}</span>
                {!o.sameZone && <span class="muted small mono">{o.arrival.homeShort} (home)</span>}
                {o.appt && (
                  <span class="muted small">
                    Appt {o.appt.localShort}{!o.sameZone ? ` ${o.apptZoneName}` : ''}
                  </span>
                )}
              </div>
              <div class="rollout-dual-box">
                <span class="rollout-dual-lbl">PTA (ready to roll)</span>
                <span class="rollout-dual-val mono">{o.depart.localShort}{!o.sameZone ? ` ${o.apptZoneName}` : ''}</span>
                {!o.sameZone && <span class="muted small mono">{o.depart.homeShort} (home)</span>}
                <span class="muted small">
                  14h left {dur(o.windowRemainingAfter)} · {cycleLimit / 60}h left {dur(o.cycleRemainingAfter)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Stack My Stops & Loads — Multi-Stop & Back-to-Back Pre-Plan Chain Checker (Plan tool #8).
 * Evaluates 2–5 sequential stops or pre-plans through `engine/src/index.ts` (`planTrip` + `evaluate`),
 * pinpoints the first breaking stop and limiting clock, searches for 7/3 and 8/2 split rescues
 * between stops, and builds a one-tap CFR-cited Dispatch Pushback macro.
 */
function StackTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const defaultMph = clampStackMph(s.mph || STACK_DEFAULT_MPH);
  const homeTz = isValidTimeZone(s.config.timeZone) ? s.config.timeZone : 'America/Chicago';
  const initDraft = useMemo(() => loadStackDraft(defaultMph, homeTz, now), []);
  const [stops, setStops] = useState<StackStopInput[]>(initDraft.stops);
  const [departureMinute, setDepartureMinute] = useState<number | null>(initDraft.departureMinute);
  const [depClamped, setDepClamped] = useState(false);
  const [untilStatus, setUntilStatus] = useState<DutyStatus>(initDraft.untilDepartureStatus);
  const [timelineView, setTimelineView] = useState<'baseline' | 'split'>('baseline');
  const [copyNote, setCopyNote] = useState('');

  // Persist draft cleanly outside store.ts (store.ts is frozen).
  useEffect(() => {
    saveStackDraft({ stops, departureMinute, untilDepartureStatus: untilStatus });
  }, [stops, departureMinute, untilStatus]);

  // Inner timeline-view swap dissolve (state-dissolve, never on initial mount).
  const prevViewRef = useRef(timelineView);
  const viewEpochRef = useRef(0);
  const activeViewSwapRef = useRef(0);
  const [, setViewSwapTick] = useState(0);
  if (prevViewRef.current !== timelineView) {
    prevViewRef.current = timelineView;
    activeViewSwapRef.current = prefersReducedMotion() ? 0 : ++viewEpochRef.current;
  }
  const viewSwapping = !prefersReducedMotion() && activeViewSwapRef.current > 0;
  useEffect(() => {
    const epoch = activeViewSwapRef.current;
    if (epoch === 0) return;
    const t = setTimeout(() => {
      if (activeViewSwapRef.current === epoch) {
        activeViewSwapRef.current = 0;
        setViewSwapTick((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [timelineView]);

  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s, now, customClocks],
  );
  const hasPinnedDeparture = departureMinute !== null && departureMinute > now;
  const departure = departureMinute !== null ? Math.max(now, departureMinute) : now;
  const sim: StackResult = useMemo(
    () => evaluateStackChain({
      segments: logged,
      now,
      config: s.config,
      departure,
      untilDepartureStatus: untilStatus,
      stops,
      allowSplitBetweenStops: true,
    }),
    [logged, now, s.config, departure, untilStatus, stops],
  );

  // If split rescue disappears on edit, return timeline view to baseline.
  const showingSplit = timelineView === 'split' && sim.splitRescue !== null;
  const activeStops = showingSplit && sim.splitRescue ? sim.splitRescue.stops : sim.displayChain.stops;

  const zoneChoices = useMemo(() => {
    const list = [...STACK_COMMON_ZONES];
    if (isValidTimeZone(homeTz) && !list.includes(homeTz)) list.unshift(homeTz);
    return list;
  }, [homeTz]);

  const updateStop = (idx: number, patch: Partial<StackStopInput>) => {
    setStops((prev) => prev.map((st, i) => (i === idx ? { ...st, ...patch } : st)));
  };

  const removeStop = (idx: number) => {
    setStops((prev) => (prev.length <= STACK_MIN_STOPS ? prev : prev.filter((_, i) => i !== idx)));
  };

  const addStop = (preset: 'blank' | 'drop_hook' | 'live' | 'deadhead') => {
    setStops((prev) => {
      if (prev.length >= STACK_MAX_STOPS) return prev;
      const n = prev.length + 1;
      const mph = clampStackMph(prev[prev.length - 1]?.mph ?? defaultMph);
      const next: StackStopInput = preset === 'drop_hook'
        ? { id: `stop-${Date.now()}-${n}`, label: `Stop ${n}`, miles: 120, mph, dwellMinutes: 15, dwellStatus: 'ON', apptMinute: null, apptTimeZone: homeTz }
        : preset === 'live'
          ? { id: `stop-${Date.now()}-${n}`, label: `Stop ${n}`, miles: 120, mph, dwellMinutes: 120, dwellStatus: 'ON', apptMinute: null, apptTimeZone: homeTz }
          : preset === 'deadhead'
            ? { id: `stop-${Date.now()}-${n}`, label: `Pre-plan ${n}`, miles: deadheadMilesFor(mph), mph, dwellMinutes: 15, dwellStatus: 'ON', apptMinute: null, apptTimeZone: homeTz }
            : { id: `stop-${Date.now()}-${n}`, label: `Stop ${n}`, miles: 120, mph, dwellMinutes: 60, dwellStatus: 'ON', apptMinute: null, apptTimeZone: homeTz };
      return [...prev, next];
    });
  };

  const resetStops = () => {
    clearStackDraft();
    setStops(createDefaultStops(defaultMph, homeTz));
    setDepartureMinute(null);
    setDepClamped(false);
    setUntilStatus('ON');
    setTimelineView('baseline');
  };

  const copyDispatch = async () => {
    if (!sim.dispatchText) return;
    const r = await shareVerdictText(sim.dispatchText);
    if (r === 'shared') return;
    setCopyNote(r === 'copied' ? 'Copied ✓' : 'Select & copy below');
    window.setTimeout(() => setCopyNote(''), 2500);
  };

  const hist = cycleBasis(s, now, sim.cycleWindowDays);
  const finishEval = sim.displayChain.endEval;

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Stack my stops &amp; loads</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Chain 2 to 5 stops or back-to-back pre-plans against your real 11, 14, 30-min, 10-hr, and {sim.cycleLimit / 60}-hr clocks.
      </p>

      {/* 1. VERDICT FIRST (5-second 03:00 clarity) */}
      <Card tone={sim.tone}>
        <div
          class="stack-verdict"
          data-stack-verdict="1"
          data-stack-status={sim.status}
          data-stack-limit={sim.limitingClock}
          data-stack-break-idx={sim.firstBreakIndex !== null ? String(sim.firstBreakIndex) : ''}
        >
          <Sign kind={sim.verdictSign}>{sim.verdictLabel}</Sign>
          <p class="stack-headline">{sim.headline}</p>
          <p class="stack-subline">{sim.subline}</p>

          <div class="rescue-clocks">
            <div class="rescue-clock-pill">
              <span>{sim.status === 'legal' ? '11h drive at end' : '11h drive now'}</span>
              <b class="mono">{dur(sim.status === 'legal' ? finishEval.shift.driveRemaining : sim.driveRemainingNow)}</b>
            </div>
            <div class="rescue-clock-pill">
              <span>{sim.status === 'legal' ? '14h window at end' : '14h window now'}</span>
              <b class="mono">{dur(sim.status === 'legal' ? finishEval.shift.windowRemaining : sim.windowRemainingNow)}</b>
            </div>
            <div class="rescue-clock-pill">
              <span>{sim.status === 'legal' ? `${sim.cycleLimit / 60}h cycle at end` : `${sim.cycleLimit / 60}h cycle now`}</span>
              <b class="mono">{dur(sim.status === 'legal' ? finishEval.cycle.remaining : sim.cycleRemainingNow)}</b>
            </div>
          </div>

          <p class="muted small" style="margin:0">
            Seeded from your log at <b class="mono">{sim.nowShort}</b> ({sim.homeZoneName})
            {hasPinnedDeparture && <> · Starting <b class="mono">{sim.departureDual.homeShort}</b> ({STATUS_LABEL[untilStatus].toLowerCase()} until then)</>}
            {sim.pendingSplitLeg && <> · Pending split leg: <b>{dur(sim.pendingSplitLeg.duration)}</b></>}.
          </p>

          {sim.validInput && sim.dispatchText && (
            <div class="stack-dispatch-box">
              <div class="rollout-pta-actions">
                <button
                  type="button"
                  class="primary"
                  data-stack-copy-btn="1"
                  onClick={copyDispatch}
                >
                  {copyNote || (sim.status === 'legal' ? 'Copy dispatch summary' : 'Copy dispatch pushback')}
                </button>
              </div>
              <pre class="rollout-pta-text" data-stack-dispatch="1">{sim.dispatchText}</pre>
            </div>
          )}
        </div>
      </Card>

      {/* 2. RESCUES (when chain breaks: split at earlier stop OR push past 10h / recap / 34h) */}
      {sim.validInput && sim.status !== 'legal' && (sim.splitRescue || sim.pushRescue) && (
        <div class="stack-rescues" data-stack-rescues="1">
          {sim.splitRescue && (
            <section class="card rescue-card is-rec" data-stack-split-rescue="1">
              <div class="rescue-card-head">
                <div class="rescue-card-title-wrap">
                  <h3 class="rescue-card-title">{sim.splitRescue.splitKind} split at {sim.splitRescue.atStopLabel}</h3>
                  <span class="rescue-card-order">49 CFR 395.1(g) sleeper-berth split</span>
                </div>
                <div class="rescue-badges">
                  <span class="rescue-badge good">Rescues chain</span>
                </div>
              </div>
              <p class="rescue-verdict-line">{sim.splitRescue.summary}</p>
              <div class="rescue-times">
                <div class="rescue-time-box">
                  <span class="rescue-time-lbl">Split leg at {sim.splitRescue.atStopLabel}</span>
                  <span class="rescue-time-val mono">{sim.splitRescue.firstLegStart.homeShort} → {sim.splitRescue.firstLegEnd.homeShort}</span>
                  <span class="rescue-time-sub">
                    {dur(sim.splitRescue.firstLegMinutes)} {sim.splitRescue.firstLegStatus === 'SB' ? 'Sleeper Berth' : 'OFF/SB'}
                    {sim.splitRescue.addedWaitMinutes > 0 ? ` (+${dur(sim.splitRescue.addedWaitMinutes)} wait)` : ' (uses dock dwell)'}
                  </span>
                </div>
                <div class="rescue-time-box">
                  <span class="rescue-time-lbl">All stops finish</span>
                  <span class="rescue-time-val mono">{sim.splitRescue.chainFinish.homeShort}</span>
                  <span class="rescue-time-sub">Split completes {sim.splitRescue.splitComplete.homeShort}</span>
                </div>
              </div>
              <div class="rescue-sb-box" data-stack-sb-callout="1">
                <span class="rescue-sb-title">
                  {sim.splitRescue.longSbAlreadyLogged ? 'Prior Sleeper Berth long leg' : 'Required Sleeper Berth block'}
                </span>
                <span class="rescue-sb-block mono">
                  {sim.splitRescue.longSbStart.homeShort} → {sim.splitRescue.longSbEnd.homeShort} ({dur(sim.splitRescue.longSbMinutes)} consecutive SB)
                </span>
                <span class="rescue-sb-callout">{sim.splitRescue.sbCallout || STACK_SPLIT_SB_CALLOUT}</span>
              </div>
              <div class="rescue-trap">
                <span class="rescue-trap-head">Clocks after split completes ({sim.splitRescue.splitComplete.homeShort})</span>
                <div class="rescue-trap-grid">
                  <div class="rescue-trap-metric">
                    <span>11h drive left</span>
                    <b class="mono">{dur(sim.splitRescue.nextDriveRemaining)}</b>
                  </div>
                  <div class="rescue-trap-metric">
                    <span>14h window left</span>
                    <b class="mono">{dur(sim.splitRescue.nextWindowRemaining)}</b>
                  </div>
                </div>
              </div>
            </section>
          )}

          {sim.pushRescue && (
            <section class="card rescue-card" data-stack-push-rescue="1">
              <div class="rescue-card-head">
                <div class="rescue-card-title-wrap">
                  <h3 class="rescue-card-title">{sim.pushRescue.title}</h3>
                  <span class="rescue-card-order">{sim.pushRescue.restSummary}</span>
                </div>
                <div class="rescue-badges">
                  <span class="rescue-badge accent">
                    {sim.pushRescue.kind === 'restart34'
                      ? '34h restart'
                      : sim.pushRescue.kind === 'recap'
                        ? 'Recap wait'
                        : sim.pushRescue.kind === 'reschedule'
                          ? 'Schedule'
                          : '10h reset'}
                  </span>
                </div>
              </div>
              <div class="rescue-times">
                <div class="rescue-time-box">
                  <span class="rescue-time-lbl">{sim.firstBreakLabel} legal ETA</span>
                  <span class="rescue-time-val mono">{sim.pushRescue.breakingStopArrival.localShort}</span>
                  {!sim.pushRescue.breakingStopArrival.sameZone && (
                    <span class="rescue-time-sub mono">{sim.pushRescue.breakingStopArrival.homeShort} (home)</span>
                  )}
                  <span class="rescue-time-sub">PTA {sim.pushRescue.breakingStopDepart.localShort}</span>
                </div>
                <div class="rescue-time-box">
                  <span class="rescue-time-lbl">Chain finishes</span>
                  <span class="rescue-time-val mono">{sim.pushRescue.chainFinish.homeShort}</span>
                  <span class="rescue-time-sub">100% HOS legal</span>
                </div>
              </div>
              {sim.altCycleRescue && (
                <p class="small muted" style="margin:8px 0 0">
                  <b>Alternate cycle option:</b> {sim.altCycleRescue.title} — {sim.firstBreakLabel} ETA{' '}
                  <b class="mono">{sim.altCycleRescue.breakingStopArrival.homeShort}</b>, finishes{' '}
                  <b class="mono">{sim.altCycleRescue.chainFinish.homeShort}</b>.
                </p>
              )}
            </section>
          )}
        </div>
      )}

      {/* 3. STOP-BY-STOP TIMELINE */}
      {sim.validInput && (
        <Card title="Stop-by-stop timeline">
          {sim.splitRescue && (
            <div class="rollout-seg" role="group" aria-label="Timeline view" style="margin-bottom:10px">
              <button
                type="button"
                class={!showingSplit ? 'on' : ''}
                onClick={() => setTimelineView('baseline')}
              >
                {sim.pushRescue?.kind === 'restart34'
                  ? '34h / recap path'
                  : sim.pushRescue?.kind === 'reschedule'
                    ? 'Standard path'
                    : '10h-break path'}
              </button>
              <button
                type="button"
                class={showingSplit ? 'on' : ''}
                onClick={() => setTimelineView('split')}
              >
                {sim.splitRescue.splitKind} split rescue
              </button>
            </div>
          )}
          <StackTimelineList
            stops={activeStops}
            showingSplit={showingSplit}
            firstBreakIndex={sim.firstBreakIndex}
            limitingClock={sim.limitingClock}
            cycleLimit={sim.cycleLimit}
            viewSwapping={viewSwapping}
          />
        </Card>
      )}

      {/* 4. LOG BASIS DISCLOSURE */}
      {hist !== 'known' && (
        <div class="warnbox small" style="margin-top:10px">
          Your log does not cover a full {sim.cycleWindowDays}-day cycle yet, so unlogged past days count as 0h. Update past days in <b>Log</b> or{' '}
          <button class="link" style="display:inline;padding:0;min-height:0" onClick={() => { openStackPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}>Hours coming back</button>.
        </div>
      )}

      {/* 5. STOPS & PRE-PLANS EDITOR */}
      <Card title={`Your stops (${stops.length} of ${STACK_MAX_STOPS})`}>
        <div class="stack-editor" data-stack-editor="1">
          {/* Optional departure start time (uses ClockPick; stored as absolute minute, F5) */}
          <div class="stack-dep-row">
            <button
              type="button"
              class="rowbtn"
              data-stack-dep-btn="1"
              data-stack-dep-min={String(departure)}
              onClick={() => openSheet({
                kind: 'stacktime',
                mode: 'departure',
                title: 'Start chain at',
                initialMinute: hasPinnedDeparture ? departure : nextHour(now),
                entryZoneName: sim.homeZoneName,
                entryTimeZone: sim.homeTimeZone,
                onApply: (m) => {
                  const maxDep = now + STACK_MAX_DEPARTURE_FUTURE_MIN;
                  if (m > maxDep) {
                    setDepartureMinute(maxDep);
                    setDepClamped(true);
                  } else {
                    setDepartureMinute(m > now ? m : null);
                    setDepClamped(false);
                  }
                },
              })}
            >
              <span>
                <span class="stat-label">Chain starts</span>
                <br />
                <b class="mono">{hasPinnedDeparture ? fmtStackFull(departure, sim.homeTimeZone) : `Now (${sim.nowShort})`}</b>
                {hasPinnedDeparture && depClamped && (
                  <>
                    <br />
                    <span class="muted small" data-stack-dep-clamped="1">Capped at 72h ahead</span>
                  </>
                )}
              </span>
              <span class="muted small">Change</span>
            </button>
            {hasPinnedDeparture && (
              <div class="stack-dep-extra">
                <div class="stack-status-seg" role="group" aria-label="Status until start">
                  {(['ON', 'OFF', 'SB'] as const).map((st) => (
                    <button key={st} type="button" class={untilStatus === st ? 'on' : ''} onClick={() => setUntilStatus(st)}>
                      {st === 'ON' ? 'On duty' : st === 'OFF' ? 'Off duty' : 'Sleeper'}
                    </button>
                  ))}
                </div>
                <button type="button" class="mini" onClick={() => { setDepartureMinute(null); setDepClamped(false); }}>Start now</button>
              </div>
            )}
          </div>

          {/* Stop cards */}
          {stops.map((st, idx) => (
            <StackStopEditor
              key={st.id}
              stop={st}
              index={idx}
              total={stops.length}
              homeTz={sim.homeTimeZone}
              homeZoneName={sim.homeZoneName}
              zoneChoices={zoneChoices}
              suggestedApptMinute={sim.displayChain.stops[idx]?.arrival.minute ?? (now + (idx + 1) * 240)}
              onChange={(patch) => updateStop(idx, patch)}
              onRemove={() => removeStop(idx)}
            />
          ))}

          {/* One-tap quick-add bar */}
          {stops.length < STACK_MAX_STOPS && (
            <div class="stack-add-bar" data-stack-add-bar="1">
              <button type="button" class="primary wide" data-stack-add-btn="1" onClick={() => addStop('blank')}>
                + Add stop ({stops.length + 1} of {STACK_MAX_STOPS})
              </button>
              <div class="rollout-chips" role="group" aria-label="Quick-add stop presets">
                <button type="button" onClick={() => addStop('drop_hook')}>+15m drop/hook</button>
                <button type="button" onClick={() => addStop('live')}>+2h live</button>
                <button type="button" onClick={() => addStop('deadhead')}>+45m deadhead</button>
              </div>
            </div>
          )}

          <button type="button" class="ghost wide" style="margin-top:8px" onClick={resetStops}>
            Reset to 2 stops
          </button>
        </div>
      </Card>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="stack" />
    </>
  );
}

/**
 * Do I Make It Back or Motel? — Meet-and-Turn & Relay Wait Cutoff Timer (Plan tool #9).
 * Computes the exact wall-clock minute a waiting driver must stop waiting and roll to return
 * to their home terminal legally from their real evaluate() clocks, with 11-hr drive and
 * 60/70-hr cycle feasibility checks, 30-min break credit from the current non-driving stretch,
 * optional 16-hour Big Day (§395.1(o)) toggle, remember-my-lane defaults, and one-tap Night-Dispatch Alert.
 */
function MotelTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const appMph = clampMotelMph(s.mph || MOTEL_DEFAULT_MPH);
  const initDraft = useMemo(() => loadMotelDraft(), []);
  const [distanceMode, setDistanceMode] = useState<MotelDistanceMode>(initDraft.distanceMode);
  const [miles, setMiles] = useState<number>(initDraft.miles);
  const [mph, setMph] = useState<number>(initDraft.mph ?? appMph);
  const [mphCustom, setMphCustom] = useState<boolean>(initDraft.mph !== null);
  const [mphText, setMphText] = useState<string>(String(initDraft.mph ?? appMph));
  const [mphNote, setMphNote] = useState<string | null>(null);
  const [driveMinutesDirect, setDriveMinutesDirect] = useState<number>(initDraft.driveMinutesDirect);
  const [hookMinutes, setHookMinutes] = useState<number>(initDraft.hookMinutes);
  // Big Day (§395.1(o)) is per-turn only — always starts OFF on fresh entry into the tool.
  const [bigDay, setBigDay] = useState<boolean>(false);
  const [copyNote, setCopyNote] = useState('');

  // Keep return-leg & hook defaults while the app stays open (module memory; store.ts stays frozen).
  useEffect(() => {
    saveMotelDraft({
      distanceMode,
      miles,
      mph: mphCustom ? mph : null,
      driveMinutesDirect,
      hookMinutes,
      bigDay: false,
    });
  }, [distanceMode, miles, mph, mphCustom, driveMinutesDirect, hookMinutes]);

  const onMphInput = (raw: string) => {
    setMphText(raw);
    const keep = `Still using ${mph} mph.`;
    if (raw.trim() === '') {
      setMphNote(`Enter ${MOTEL_MIN_MPH}–${MOTEL_MAX_MPH} mph. ${keep}`);
      return;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < MOTEL_MIN_MPH || v > MOTEL_MAX_MPH) {
      setMphNote(`Enter ${MOTEL_MIN_MPH}–${MOTEL_MAX_MPH} mph — your entry was not applied. ${keep}`);
      return;
    }
    const rounded = Math.round(v);
    setMph(rounded);
    setMphCustom(true);
    setMphNote(null);
  };
  const onMphBlur = () => {
    setMphText(String(mph));
    setMphNote(null);
  };

  const driveBox = useDurationBoxes('Return drive time', driveMinutesDirect, 0, MOTEL_MAX_DRIVE_MIN, setDriveMinutesDirect);
  const hookBox = useDurationBoxes('Swap / hook time', hookMinutes, 0, MOTEL_MAX_HOOK_MIN, setHookMinutes);
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);

  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s, now, customClocks],
  );
  const res: MotelResult = useMemo(
    () => evaluateMotel({
      segments: logged,
      now,
      config: s.config,
      distanceMode,
      miles,
      mph,
      driveMinutesDirect,
      hookMinutes,
      bigDay,
      currentStatus: customClocks ? 'OFF' : (s.current?.status ?? null),
    }),
    [logged, now, s.config, distanceMode, miles, mph, driveMinutesDirect, hookMinutes, bigDay, s.current?.status, customClocks],
  );

  const copyAlert = async () => {
    if (!res.dispatchText) return;
    const r = await shareVerdictText(res.dispatchText);
    if (r === 'shared') return;
    setCopyNote(r === 'copied' ? 'Copied ✓' : 'Select & copy below');
    window.setTimeout(() => setCopyNote(''), 2500);
  };

  const resetLane = () => {
    clearMotelDraft();
    const d = defaultMotelDraft();
    setDistanceMode(d.distanceMode);
    setMiles(d.miles);
    setMph(appMph);
    setMphText(String(appMph));
    setMphCustom(false);
    setMphNote(null);
    setDriveMinutesDirect(d.driveMinutesDirect);
    setHookMinutes(d.hookMinutes);
    setBigDay(false);
  };

  const hist = cycleBasis(s, now, res.cycleWindowDays);

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Do I Make It Back or Motel?</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Exact minute you must stop waiting at the meet point and roll to reach home terminal legally.
      </p>

      {/* 1. VERDICT FIRST — ONE GIANT CUTOFF TIME */}
      <Card tone={res.tone}>
        <div
          class="motel-verdict"
          data-motel-verdict="1"
          data-motel-status={res.status}
          data-motel-binding={res.binding}
          data-motel-cutoff={res.cutoffMinute !== null ? String(res.cutoffMinute) : ''}
        >
          <Sign kind={res.sign}>{res.verdictLabel}</Sign>

          {res.cutoffMinute !== null && res.cutoffHM && (
            <div
              class={`motel-cutoff-block${res.status === 'passed' ? ' is-bad' : res.tone === 'warn' ? ' is-warn' : ''}`}
              data-motel-cutoff-block="1"
            >
              <span class="motel-cutoff-lbl">
                {res.status === 'passed' ? 'Walk-away cutoff passed' : 'Must roll by'}
              </span>
              <span class="motel-cutoff-time mono" data-motel-cutoff-hm="1">{res.cutoffHM}</span>
              <span class="motel-cutoff-meta">
                {res.status === 'ready' && res.waitLeftMinutes !== null
                  ? (res.waitLeftMinutes > 0
                      ? `${dur(res.waitLeftMinutes)} of wait left · ${res.homeZoneName}`
                      : `Roll now — 0m of wait left · ${res.homeZoneName}`)
                  : res.waitLeftMinutes !== null
                    ? `${dur(-res.waitLeftMinutes)} past cutoff · ${res.homeZoneName}`
                    : res.homeZoneName}
              </span>
            </div>
          )}

          <p class="motel-headline" data-motel-headline="1">{res.headline}</p>
          {res.subline && <p class="motel-subline" data-motel-subline="1">{res.subline}</p>}

          {res.earliestRollWarning && (
            <p
              class="warnbox"
              data-motel-earliest-roll="1"
              data-motel-earliest-roll-hm={res.earliestRollHM ?? ''}
              data-motel-earliest-roll-minute={res.earliestRollMinute !== null ? String(res.earliestRollMinute) : ''}
            >
              {res.earliestRollWarning}
            </p>
          )}

          {res.status === 'ready' && res.backIfRollNowHM && res.backAtCutoffHM && (
            <p
              class="motel-subline"
              data-motel-back-eta="1"
              data-motel-roll-now-over-window={res.rollNowOverWindow ? '1' : '0'}
            >
              Est. back at terminal:{' '}
              <b class="mono" style={res.rollNowOverWindow ? 'color:var(--bad)' : undefined}>{res.backIfRollNowHM}</b> if rolling now
              {res.enRouteBreakIfRollNowMinutes > 0 && (
                res.rollNowOverWindow
                  ? <> (incl. 30m break — <b style="color:var(--bad)">past {res.windowLimitMinutes / 60}h window</b>)</>
                  : ' (incl. 30m break)'
              )}
              {res.rollNowOverWindow && res.enRouteBreakIfRollNowMinutes === 0 && (
                <> (<b style="color:var(--bad)">past {res.windowLimitMinutes / 60}h window</b>)</>
              )}
              {res.backAtCutoffMinute !== res.backIfRollNowMinute && (
                <> (<b class="mono">{res.backAtCutoffHM}</b> at cutoff{res.enRouteBreakAtCutoffMinutes > 0 ? ', incl. 30m break' : ''})</>
              )}
              .
            </p>
          )}

          {res.bindingText && (
            <div class="motel-rule-pill" data-motel-rule="1">
              <span>{res.bindingText}</span>
            </div>
          )}

          {/* Feasibility & real-clock strip */}
          <div class="rescue-clocks">
            <div class={`rescue-clock-pill${!res.driveFeasible ? ' motel-pill-bad' : ''}`}>
              <span>{res.driveLimitMinutes / 60}h drive left</span>
              <b class="mono">{dur(res.driveRemainingMinutes)}</b>
            </div>
            <div class={`rescue-clock-pill${res.status === 'passed' ? ' motel-pill-bad' : ''}`}>
              <span>{res.windowLimitMinutes / 60}h window ends</span>
              <b class="mono">{res.windowEndHM}</b>
            </div>
            <div class={`rescue-clock-pill${!res.cycleFeasible ? ' motel-pill-bad' : ''}`}>
              <span>{res.cycleLimitMinutes / 60}h cycle left</span>
              <b class="mono">{dur(res.cycleRemainingMinutes)}</b>
            </div>
          </div>

          {res.waitingOnDutyNote && (
            <p class="muted small" style="margin:0" data-motel-onduty-note="1">{res.waitingOnDutyNote}</p>
          )}

          {/* 30-minute break status derived from current non-driving stretch */}
          <div
            class={`motel-break-box${res.breakCovered ? ' is-covered' : ' is-short'}`}
            data-motel-break="1"
            data-motel-break-covered={res.breakCovered ? '1' : '0'}
            data-motel-break-short={String(res.breakMinutesShort)}
          >
            <div>{res.breakLine}</div>
            {res.returnOverEightNote && (
              <div class="muted small" style="margin-top:4px">{res.returnOverEightNote}</div>
            )}
          </div>

          <p class="muted small" style="margin:0">
            Live from your log at <b class="mono">{res.nowHM}</b> ({res.homeZoneName}) · Return drive{' '}
            <b class="mono">{dur(res.returnDriveMinutes)}</b> + swap/hook <b class="mono">{dur(res.hookMinutes)}</b>.
          </p>

          {/* One-tap Copy Night-Dispatch Alert */}
          {res.validInput && res.dispatchText && (
            <div class="stack-dispatch-box">
              <div class="rollout-pta-actions">
                <button
                  type="button"
                  class="primary"
                  data-motel-copy-btn="1"
                  onClick={copyAlert}
                >
                  {copyNote || 'Copy Night-Dispatch Alert'}
                </button>
              </div>
              <pre class="rollout-pta-text" data-motel-dispatch="1">{res.dispatchText}</pre>
            </div>
          )}
        </div>
      </Card>

      {/* 2. INPUTS — BIG TAP TARGETS FOR 1:45 AM */}
      <Card title="Your return leg &amp; swap">
        <div class="motel-inputs" data-motel-inputs="1">
          {/* Return miles OR Return drive time */}
          <div class="motel-section">
            <div class="motel-section-head">
              <span class="stat-label">Return leg to home terminal</span>
              <b class="mono">{dur(res.returnDriveMinutes)}</b>
            </div>
            <div class="rollout-seg" role="group" aria-label="Return leg entry mode">
              <button
                type="button"
                class={distanceMode === 'miles' ? 'on' : ''}
                data-motel-mode="miles"
                onClick={() => setDistanceMode('miles')}
              >
                Return miles
              </button>
              <button
                type="button"
                class={distanceMode === 'time' ? 'on' : ''}
                data-motel-mode="time"
                onClick={() => setDistanceMode('time')}
              >
                Drive time
              </button>
            </div>

            {distanceMode === 'miles' ? (
              <>
                <div class="rollout-chips" role="group" aria-label="Return miles presets">
                  {MOTEL_MILES_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      class={miles === m ? 'on' : ''}
                      onClick={() => setMiles(m)}
                    >
                      {m} mi
                    </button>
                  ))}
                </div>
                <div class="rollout-fieldgrid">
                  <label>Return miles
                    <input
                      type="number"
                      class="num"
                      inputMode="numeric"
                      min={1}
                      max={MOTEL_MAX_MILES}
                      data-motel-miles="1"
                      aria-label="Return miles"
                      value={miles}
                      onInput={(e) => {
                        const v = Number((e.target as HTMLInputElement).value);
                        setMiles(Number.isFinite(v) ? Math.max(0, Math.min(MOTEL_MAX_MILES, Math.round(v))) : 0);
                      }}
                    />
                  </label>
                  <label>Avg speed (mph)
                    <input
                      type="number"
                      class="num"
                      inputMode="numeric"
                      min={MOTEL_MIN_MPH}
                      max={MOTEL_MAX_MPH}
                      data-motel-mph="1"
                      aria-label="Average speed mph"
                      value={mphText}
                      onInput={(e) => onMphInput((e.target as HTMLInputElement).value)}
                      onBlur={onMphBlur}
                    />
                  </label>
                </div>
                {mphNote && <p class="small warn" style="margin:2px 0 0" data-motel-mph-note="1">{mphNote}</p>}
                <div class="rollout-chips" role="group" aria-label="Speed presets">
                  {MOTEL_MPH_PRESETS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      class={mph === v ? 'on' : ''}
                      onClick={() => { setMph(v); setMphText(String(v)); setMphCustom(true); setMphNote(null); }}
                    >
                      {v} mph
                    </button>
                  ))}
                </div>
                <p class="muted small" style="margin:2px 0 0">
                  Return drive: <b class="mono">{dur(res.returnDriveMinutes)}</b> at {res.effectiveMph} mph.
                </p>
              </>
            ) : (
              <>
                <div class="rollout-chips" role="group" aria-label="Return drive time presets">
                  {MOTEL_DRIVE_PRESETS.map((p) => (
                    <button
                      key={p.minutes}
                      type="button"
                      class={driveMinutesDirect === p.minutes ? 'on' : ''}
                      onClick={() => setDriveMinutesDirect(p.minutes)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div class="qs-row motel-dur-row" data-motel-drive-box="1">
                  <span class="small muted">Custom drive time</span>
                  {driveBox.boxes}
                </div>
                {driveBox.note && <p class="small warn" style="margin:2px 0 0">{driveBox.note}</p>}
              </>
            )}
          </div>

          {/* Swap / break-and-hook time */}
          <div class="motel-section">
            <div class="motel-section-head">
              <span class="stat-label">Swap / break-and-hook time</span>
              <b class="mono">{dur(hookMinutes)}</b>
            </div>
            <div class="rollout-chips" role="group" aria-label="Swap and hook presets">
              {MOTEL_HOOK_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  class={hookMinutes === m ? 'on' : ''}
                  data-motel-hook-chip={String(m)}
                  onClick={() => setHookMinutes(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
            <div class="qs-row motel-dur-row" data-motel-hook-box="1">
              <span class="small muted">Custom hook time</span>
              {hookBox.boxes}
            </div>
            {hookBox.note && <p class="small warn" style="margin:2px 0 0">{hookBox.note}</p>}
          </div>

          {/* 16-hour Big Day (§395.1(o)) toggle */}
          <div class="motel-section">
            <label class="check">
              <input
                type="checkbox"
                checked={bigDay}
                data-motel-bigday="1"
                onChange={(e) => setBigDay((e.target as HTMLInputElement).checked)}
              />
              <span>
                <b>16-hour Big Day (§395.1(o))</b>
                <br />
                <span class="muted small">Extends window from 14h to 16h — driving limit stays 11h.</span>
              </span>
            </label>
            {bigDay && (
              <div class="motel-bigday-warn" data-motel-bigday-warn="1">
                <b>Eligibility check:</b> {res.bigDayEligibilityWarning}
                {res.bigDayBlockedByLog && res.bigDayLogNote && (
                  <p style="margin:6px 0 0"><b>From your log:</b> {res.bigDayLogNote}</p>
                )}
              </div>
            )}
          </div>

          <div class="motel-section">
            <p class="muted small" style="margin:0" data-motel-lane-note="1">
              Return leg and hook time are kept while the app stays open (Big Day resets to off each time you open this tool).
            </p>
            <button type="button" class="ghost wide" onClick={resetLane}>
              Reset lane defaults
            </button>
          </div>
        </div>
      </Card>

      {/* 3. LOG BASIS DISCLOSURE + PLANNING FRAMING */}
      {hist !== 'known' && (
        <div class="warnbox small" style="margin-top:10px">
          Your log does not cover a full {res.cycleWindowDays}-day cycle yet, so unlogged past days count as 0h. Update past days in <b>Log</b> or{' '}
          <button class="link" style="display:inline;padding:0;min-height:0" onClick={() => { openMotelPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}>Hours coming back</button>.
        </div>
      )}
      <p class="motel-foot">
        Planning estimate only — not legal advice and not an ELD. Your official log and your carrier's ELD govern.
      </p>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="motel" />
    </>
  );
}

/* ============================================================ Can I Legally Use It? */

/**
 * Can I Legally Use It? — 3 AM HOS Exception & Edge-Case Sanity Check (Plan tool #10).
 *
 * Pure offline 3-to-4-tap decision check for Adverse Driving (§395.1(b)(1)), Personal Conveyance
 * (FMCSA 2018 PC Guidance), Yard Move (§395.28), 16-Hour Short-Haul Big Day (§395.1(o)), plus the
 * Safe Haven myth-buster card (§397.5). Advisory FMCSA rule check only — never legal advice, never
 * an ELD override. Session-only state; zero new localStorage keys; zero time inputs.
 */
function LegalTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const [selected, setSelected] = useState<LegalItemId | null>(null);
  const [answers, setAnswers] = useState<LegalAnswer[]>([]);
  const [copyNote, setCopyNote] = useState('');

  const logged = useMemo(() => loggedSegments(s, now), [s, now]);
  const clockCtx = useMemo(() => ({ segments: logged, now, config: s.config }), [logged, now, s.config]);

  const pickItem = (id: LegalItemId) => {
    setSelected(id);
    setAnswers([]);
    setCopyNote('');
  };
  const goHome = () => {
    setSelected(null);
    setAnswers([]);
    setCopyNote('');
  };
  const answer = (ans: LegalAnswer) => {
    setAnswers((prev) => [...prev, ans]);
    setCopyNote('');
  };
  const stepBack = () => {
    setAnswers((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
    setCopyNote('');
  };

  const copyAnnotation = async (text: string) => {
    const r = await shareVerdictText(text);
    if (r === 'shared') return;
    setCopyNote(r === 'copied' ? 'Copied ✓' : 'Select & copy below');
    window.setTimeout(() => setCopyNote(''), 2500);
  };

  const renderVerdict = (v: LegalVerdict, title: string, trail?: { question: string; answer: LegalAnswer }[]) => (
    <>
      <Card tone={v.tone}>
        <div
          class="legal-verdict"
          data-legal-verdict="1"
          data-legal-tree={v.treeId}
          data-legal-result={v.verdict}
          data-legal-verify-carrier={v.verifyCarrierPolicy ? '1' : '0'}
        >
          <Sign kind={v.sign}>{v.verdictLabel}</Sign>
          <p class="legal-headline" data-legal-headline="1">{v.headline}</p>
          <div class="motel-rule-pill" data-legal-cite="1">
            <span>{v.citation}</span>
          </div>
          <p class="legal-explain" data-legal-explain="1">{v.explanation}</p>

          {v.carrierPolicyWarning && (
            <div class="legal-carrier-warn" data-legal-carrier-warn="1">
              {v.carrierPolicyWarning}
            </div>
          )}

          {v.standingReminder && (
            <div class="legal-reminder" data-legal-reminder="1">
              {v.standingReminder}
            </div>
          )}

          {v.clockGuidance && (
            <div class="legal-guidance" data-legal-clock-guidance="1">
              {v.clockGuidance}
            </div>
          )}

          {v.preview && (
            <div
              class="legal-preview"
              data-legal-preview="1"
              data-legal-preview-kind={v.preview.kind}
              data-legal-other-exception={v.preview.otherExceptionActive ?? ''}
              data-legal-before-must-stop={String(v.preview.before.mustStopBy)}
              data-legal-after-must-stop={String(v.preview.after.mustStopBy)}
              data-legal-before-window-end={String(v.preview.before.windowEnd)}
              data-legal-after-window-end={String(v.preview.after.windowEnd)}
              data-legal-before-drive-deadline={String(v.preview.before.driveDeadline)}
              data-legal-after-drive-deadline={String(v.preview.after.driveDeadline)}
            >
              <div class="legal-preview-head">
                <span class="stat-label" data-legal-preview-head="1">Live clock preview from your logged record</span>
                <span class="muted small mono">As of {v.preview.nowHM} {v.preview.homeZoneName}</span>
              </div>
              {v.preview.alreadyActiveOnLog && (
                <p class="muted small" style="margin:0">
                  This exception is already toggled on for your current shift — showing off vs. on below.
                </p>
              )}
              {v.preview.stackWarning && (
                <p class="warnbox small" style="margin:0" data-legal-stack-warn="1">
                  {v.preview.stackWarning}
                </p>
              )}
              <div class="legal-preview-grid">
                <div class="legal-preview-col">
                  <span class="legal-preview-lbl" data-legal-before-lbl="1">{v.preview.beforeLabel}</span>
                  <span class="legal-preview-time mono" data-legal-before-must-stop-hm="1">{v.preview.before.mustStopHM}</span>
                  <span class="legal-preview-sub">Must stop by ({v.preview.before.bindingLabel})</span>
                </div>
                <div class={`legal-preview-col${!v.preview.blockedByLog ? ' is-after' : ''}`}>
                  <span class="legal-preview-lbl">
                    {v.preview.kind === 'adverse' ? 'With Adverse' : 'With 16-Hr Big Day'}
                  </span>
                  <span class="legal-preview-time mono" data-legal-after-must-stop-hm="1">{v.preview.after.mustStopHM}</span>
                  <span class="legal-preview-sub">Must stop by ({v.preview.after.bindingLabel})</span>
                </div>
              </div>
              <div class="legal-preview-rows">
                <div class="legal-preview-row">
                  <span class="muted" data-legal-drive-label="1">
                    11-hr clock runs out (if nothing else stops you) ({v.preview.before.driveLimit / 60}h → {v.preview.after.driveLimit / 60}h)
                  </span>
                  <span class="mono" data-legal-drive-row="1">
                    {v.preview.before.driveDeadlineHM} → <b>{v.preview.after.driveDeadlineHM}</b>
                    {v.preview.kind === 'sixteen' ? ' (unchanged)' : ''}
                  </span>
                </div>
                <div class="legal-preview-row">
                  <span class="muted">Shift window ends ({v.preview.before.windowLimit / 60}h → {v.preview.after.windowLimit / 60}h)</span>
                  <span class="mono" data-legal-window-row="1">
                    {v.preview.before.windowEndHM} → <b>{v.preview.after.windowEndHM}</b>
                  </span>
                </div>
                <div class="legal-preview-row">
                  <span class="muted">Drive remaining</span>
                  <span class="mono">{dur(v.preview.before.driveRemaining)} → <b>{dur(v.preview.after.driveRemaining)}</b></span>
                </div>
                <div class="legal-preview-row">
                  <span class="muted">Window remaining</span>
                  <span class="mono">{dur(v.preview.before.windowRemaining)} → <b>{dur(v.preview.after.windowRemaining)}</b></span>
                </div>
              </div>
              {v.preview.bindingNote && (
                <p class="warnbox small" style="margin:0" data-legal-binding-note="1">{v.preview.bindingNote}</p>
              )}
            </div>
          )}

          {v.effectNote && <p class="muted small" style="margin:0">{v.effectNote}</p>}

          {v.annotation && (
            <div class="stack-dispatch-box">
              <div class="rollout-pta-actions">
                <button
                  type="button"
                  class="primary"
                  data-legal-copy-btn="1"
                  onClick={() => copyAnnotation(v.annotation!)}
                >
                  {copyNote || 'Copy template (edit before saving)'}
                </button>
              </div>
              <pre class="rollout-pta-text" data-legal-annotation="1">{v.annotation}</pre>
            </div>
          )}

          <p class="legal-advisory" style="margin:4px 0 0" data-legal-advisory="1">{v.advisoryLine}</p>
        </div>
      </Card>

      {trail && trail.length > 0 && (
        <div class="legal-trail" aria-label={`Answers for ${title}`}>
          {trail.map((item, idx) => (
            <div key={idx} class="legal-trail-row">
              <span>{idx + 1}. {item.question}</span>
              <b>{item.answer === 'yes' ? 'YES' : 'NO'}</b>
            </div>
          ))}
        </div>
      )}

      <div class="legal-actions">
        {trail && trail.length > 0 && (
          <button type="button" class="ghost" data-legal-restart="1" onClick={() => { setAnswers([]); setCopyNote(''); }}>
            Start this check over
          </button>
        )}
        <button type="button" class="ghost" data-legal-all="1" onClick={goHome}>
          All exception checks
        </button>
      </div>
    </>
  );

  // 1. HOME LIST
  if (selected === null) {
    return (
      <>
        <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
        <h1 class="screen-title">Can I Legally Use It?</h1>
        <p class="muted small" style="margin:-6px 0 10px">
          3 AM HOS exception sanity check — answer 2–3 quick questions before touching your ELD.
        </p>

        <p class="legal-advisory" data-legal-advisory="1">{LEGAL_ADVISORY_LINE}</p>

        {/* Navy1 UI overhaul (B5): 1-tap "What happened?" quick-jump strip above the 5 full cards. */}
        <div class="legal-quick" role="group" aria-label="Quick jump by situation" data-legal-quick="1">
          {([
            ['adverse', 'Weather / crash'],
            ['pc', 'Personal use'],
            ['ym', 'Yard move'],
            ['bigday', '16-hr day'],
            ['safehaven', 'Safe haven'],
          ] as [LegalItemId, string][]).map(([id, label]) => (
            <button key={id} type="button" class="mini" data-legal-quick-pick={id} onClick={() => pickItem(id)}>{label}</button>
          ))}
        </div>

        <div class="legal-list" data-legal-home="1">
          {LEGAL_HOME_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              class={`legal-home-btn${item.isMythCard ? ' is-myth' : ''}`}
              data-legal-pick={item.id}
              onClick={() => pickItem(item.id)}
            >
              <span class="legal-home-body">
                <span class="legal-home-title">{item.title}</span>
                <span class="legal-home-cite">{item.shortCite}</span>
                <span class="legal-home-prompt">{item.prompt}</span>
              </span>
              <Icon d={I.next} />
            </button>
          ))}
        </div>
      </>
    );
  }

  // 2. SAFE HAVEN STATIC MYTH-BUSTER CARD
  if (selected === 'safehaven') {
    const sh = getSafeHavenCard();
    return (
      <>
        <button class="back" onClick={goHome}><Icon d={I.back} /> All checks</button>
        <h1 class="screen-title">&ldquo;Safe Haven&rdquo; — Myth Check</h1>
        {renderVerdict(sh, 'Safe Haven')}
      </>
    );
  }

  // 3. ACTIVE DECISION TREE (QUESTION OR TERMINAL VERDICT)
  const step = evaluateLegalTree(selected, answers, clockCtx);
  return (
    <>
      <button class="back" onClick={goHome}><Icon d={I.back} /> All checks</button>
      <h1 class="screen-title">{step.title}</h1>
      <p class="muted small" style="margin:-6px 0 10px">{step.shortCite}</p>

      {step.verdict ? (
        renderVerdict(step.verdict, step.title, step.trail)
      ) : step.currentQuestion ? (
        <>
          <Card>
            <div class="legal-q-card" data-legal-question="1" data-legal-qid={step.currentQuestion.id}>
              <span class="legal-q-step">
                Question {step.answeredCount + 1} of {step.totalQuestions}
              </span>
              <p class="legal-q-text">{step.currentQuestion.question}</p>
              <p class="legal-q-detail">{step.currentQuestion.detail}</p>
              <div class="legal-yn-row">
                <button
                  type="button"
                  class="primary legal-yn-btn"
                  data-legal-ans="yes"
                  onClick={() => answer('yes')}
                >
                  Yes
                </button>
                <button
                  type="button"
                  class="danger legal-yn-btn"
                  data-legal-ans="no"
                  onClick={() => answer('no')}
                >
                  No
                </button>
              </div>
              {step.answeredCount > 0 && (
                <button type="button" class="ghost" data-legal-prev="1" onClick={stepBack}>
                  Previous question
                </button>
              )}
            </div>
          </Card>
          <p class="legal-advisory" style="margin-top:10px" data-legal-advisory="1">{LEGAL_ADVISORY_LINE}</p>
        </>
      ) : null}
    </>
  );
}

/* ============================================================ Flip My Clock (Plan tool #11) */

/**
 * Shared ClockPick sheet for Flip My Clock:
 * - `mode === 'shutdown'`: full date + time picker (converted through `deviceTz`, same pattern as StackTimeSheet).
 * - `mode === 'target'`: time-of-day picker (`timeOnly`, same pattern as Settings DayStartSheet).
 */
function FlipTimeSheet({ k, now, closing = false }: { k: Extract<SheetKind, { kind: 'fliptime' }>; now: number; closing?: boolean }) {
  if (k.mode === 'target') {
    const [at, setAt] = useState<number>(() => dayStartAnchor(k.targetHour ?? 21, k.targetMinute ?? 0));
    const setPick = (v: number) => {
      const d = new Date(v * 60000);
      setAt(dayStartAnchor(d.getHours(), d.getMinutes()));
    };
    const d = new Date(at * 60000);
    const h = d.getHours();
    const m = d.getMinutes();
    const hm = formatHM(h, m);
    const apply = () => {
      k.onApplyTarget?.(h, m);
      openSheet(null);
    };
    return (
      <Sheet title={`Target roll-out (${k.homeZoneName})`} closing={closing}>
        <p class="muted small" style="margin:0">Desired roll-out time in <b>{k.homeZoneName}</b> ({k.homeTimeZone}).</p>
        <ClockPick
          timeOnly
          at={at}
          set={setPick}
          now={at}
          future={false}
          say="Target roll-out"
          name="Target roll-out time"
          keys={KEYS_DAYSTART}
          sub={`Home terminal time (${k.homeZoneName}) · tap the time to pick it`}
        />
        <button class="primary wide ed-go" data-flip-time-apply="1" onClick={apply}>
          Apply · {hm} ({k.homeZoneName})
        </button>
      </Sheet>
    );
  }

  const nowWall = formatFlipWallDateTime(now, k.homeTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  const [at, setAt] = useState<number>(() => {
    const wall = formatFlipWallDateTime(k.initialMinute, k.homeTimeZone);
    const parsed = resolveWallDateTime(wall.date, wall.time, deviceTz);
    return parsed ?? pickerNow;
  });
  const apply = () => {
    const wall = formatFlipWallDateTime(at, deviceTz);
    const resolved = resolveFlipWallMinute(wall.date, wall.time, k.homeTimeZone);
    if (resolved !== null) k.onApplyShutdown?.(resolved);
    openSheet(null);
  };
  return (
    <Sheet title={`Shutting down (${k.homeZoneName})`} closing={closing}>
      <p class="muted small" style="margin:0">Wall-clock time in <b>{k.homeZoneName}</b> time.</p>
      <ClockPick
        at={at}
        set={setAt}
        now={pickerNow}
        future={true}
        say="Shutting down"
        name="Shutdown time"
        keys={KEYS_HOURS}
      />
      <button class="primary wide ed-go" data-flip-time-apply="1" onClick={apply}>
        Apply · {clockFull(at)} ({k.homeZoneName})
      </button>
    </Sheet>
  );
}

/**
 * Flip My Clock — Shift-Start & Schedule-Flip Bridge Planner (Plan tool #11 / Spec #4).
 * Compares 2–3 cleanest legal HOS bridges from shutdown to a target roll-out time using `evaluate()`.
 * Session-only state (zero new localStorage keys); shared ClockPick for shutdown & custom target.
 */
function FlipTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s, now, customClocks],
  );
  const defShutdown = useMemo(() => defaultShutdownMinute(logged, now), [logged, now]);
  const [customShutdown, setCustomShutdown] = useState<number | null>(null);
  const [targetHour, setTargetHour] = useState<number>(21);
  const [targetMinute, setTargetMinute] = useState<number>(0);

  const shutdownMinute = customShutdown ?? defShutdown.minute;

  const plan = useMemo(
    () => planFlipBridges({
      segments: logged,
      now,
      config: s.config,
      shutdownMinute,
      targetHour,
      targetMinute,
    }),
    [logged, now, s.config, shutdownMinute, targetHour, targetMinute],
  );

  const openShutdownPicker = () => {
    openSheet({
      kind: 'fliptime',
      mode: 'shutdown',
      initialMinute: plan.effectiveShutdownMinute,
      homeZoneName: plan.homeZoneName,
      homeTimeZone: plan.homeTimeZone,
      onApplyShutdown: (m) => setCustomShutdown(m),
    });
  };

  const openTargetPicker = () => {
    openSheet({
      kind: 'fliptime',
      mode: 'target',
      initialMinute: now,
      targetHour: plan.targetHour,
      targetMinute: plan.targetMinute,
      homeZoneName: plan.homeZoneName,
      homeTimeZone: plan.homeTimeZone,
      onApplyTarget: (h, m) => {
        setTargetHour(h);
        setTargetMinute(m);
      },
    });
  };

  const renderOptionA = (a: FlipOptionA) => (
    <Card tone="good">
      <div
        class="flip-card"
        data-flip-card="A"
        data-flip-rollout={String(a.rollOutMinute)}
        data-flip-total-rest={String(a.totalRestMinutes)}
        data-flip-extra-rest={String(a.extraRestMinutes)}
        data-flip-dst-gap={a.dstGapShifted ? '1' : '0'}
        data-flip-drive={String(a.clocks.driveRemaining)}
        data-flip-window={String(a.clocks.windowRemaining)}
        data-flip-cycle={String(a.clocks.cycleRemaining)}
      >
        <div class="flip-card-head">
          <h2 class="flip-card-title">{a.title}</h2>
          <span class="flip-tag is-good">{a.tag}</span>
        </div>
        <div class="flip-hero">
          <span class="flip-hero-lbl">
            {a.dstGapShifted
              ? `First roll-out after target (${plan.homeZoneName})`
              : `Roll out on target (${plan.homeZoneName})`}
          </span>
          <span class="flip-hero-time mono" data-flip-a-rollout-text="1">{a.rollOutShort}</span>
          {a.dstGapShifted && (
            <span class="flip-note" data-flip-a-dst-note="1">
              {plan.targetHM} does not occur that day (DST spring-forward) — this is the first roll-out after it.
            </span>
          )}
          <span class="flip-hero-sub" data-flip-a-cost="1">
            Total rest: <b class="mono">{dur(a.totalRestMinutes)}</b> ({a.restStartShort} → {a.rollOutShort}) ·{' '}
            {a.extraRestMinutes === 0
              ? 'Bare 10h — zero extra rest'
              : `+${dur(a.extraRestMinutes)} extra beyond bare 10h`}
            {a.includes34Restart ? ' · includes 34-hr cycle restart' : ''}
          </span>
        </div>
        <div class="flip-metrics" data-flip-a-clocks="1">
          <div class="flip-metric">
            <span class="flip-metric-lbl">{a.clocks.driveLimit / 60}-hr drive</span>
            <span class="flip-metric-val mono">{dur(a.clocks.driveRemaining)}</span>
          </div>
          <div class="flip-metric">
            <span class="flip-metric-lbl">{a.clocks.windowLimit / 60}-hr window</span>
            <span class="flip-metric-val mono">{dur(a.clocks.windowRemaining)}</span>
          </div>
          <div class="flip-metric">
            <span class="flip-metric-lbl">{a.clocks.cycleLimit / 60}-hr cycle</span>
            <span class="flip-metric-val mono">{dur(a.clocks.cycleRemaining)}</span>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderOptionB = (b: FlipOptionB) => (
    <Card>
      <div
        class="flip-card"
        data-flip-card="B"
        data-flip-split={b.splitPair}
        data-flip-rollout={String(b.rollOutMinute)}
        data-flip-drive-leg={String(b.driveLegMinutes)}
        data-flip-assumes-no-driving={b.assumesNoDrivingBeforeShutdown ? '1' : '0'}
        data-flip-drive={String(b.clocks.driveRemaining)}
        data-flip-window={String(b.clocks.windowRemaining)}
        data-flip-cycle={String(b.clocks.cycleRemaining)}
      >
        <div class="flip-card-head">
          <h2 class="flip-card-title">{b.title}</h2>
          <span class="flip-tag">{b.tag}</span>
        </div>
        <div class="flip-hero">
          <span class="flip-hero-lbl">
            {b.dstGapShifted
              ? `First roll-out after target via slide (${plan.homeZoneName})`
              : `Roll out on target after slide (${plan.homeZoneName})`}
          </span>
          <span class="flip-hero-time mono" data-flip-b-rollout-text="1">{b.rollOutShort}</span>
          {b.dstGapShifted && (
            <span class="flip-note" data-flip-b-dst-note="1">
              {plan.targetHM} does not occur that day (DST spring-forward) — this is the first roll-out after it.
            </span>
          )}
          <span class="flip-hero-sub">
            {b.splitPair} split-sleeper pair · drives <b class="mono">{dur(b.driveLegMinutes)}</b> between rest legs
            {b.assumesNoDrivingBeforeShutdown ? '.' : ' (violation-free).'}
          </span>
        </div>
        {b.assumesNoDrivingBeforeShutdown && b.assumptionLine && (
          <p class="flip-assumption" data-flip-b-assumption="1">{b.assumptionLine}</p>
        )}
        <div class="flip-segs" data-flip-b-segments="1">
          {b.segments.map((seg, i) => (
            <div
              key={i}
              class={`flip-seg${seg.status === 'SB' ? ' is-sb' : seg.status === 'D' ? ' is-d' : ' is-off'}`}
              data-flip-b-seg-status={seg.status}
            >
              <span><b>{seg.label}</b> · <span class="mono">{dur(seg.duration)}</span></span>
              <span class="mono">{seg.startShort} → {seg.endShort}</span>
            </div>
          ))}
        </div>
        <div class="flip-metrics" data-flip-b-clocks="1">
          <div class="flip-metric">
            <span class="flip-metric-lbl">{b.clocks.driveLimit / 60}-hr drive</span>
            <span class="flip-metric-val mono">{dur(b.clocks.driveRemaining)}</span>
          </div>
          <div class="flip-metric">
            <span class="flip-metric-lbl">{b.clocks.windowLimit / 60}-hr window</span>
            <span class="flip-metric-val mono">{dur(b.clocks.windowRemaining)}</span>
          </div>
          <div class="flip-metric">
            <span class="flip-metric-lbl">{b.clocks.cycleLimit / 60}-hr cycle</span>
            <span class="flip-metric-val mono">{dur(b.clocks.cycleRemaining)}</span>
          </div>
        </div>
      </div>
    </Card>
  );

  const renderOptionC = (c: FlipOptionC) => (
    <Card tone="warn">
      <div
        class="flip-card"
        data-flip-card="C"
        data-flip-early-start={String(c.earlyStart)}
        data-flip-after-start={String(c.afterStart)}
        data-flip-early-cycle={String(c.earlyClocks.cycleRemaining)}
        data-flip-after-cycle={String(c.afterClocks.cycleRemaining)}
        data-flip-cycle-gain={String(c.cycleGainMinutes)}
      >
        <div class="flip-card-head">
          <h2 class="flip-card-title">{c.title}</h2>
          <span class="flip-tag is-warn">{c.tag}</span>
        </div>
        <p class="muted small" style="margin:0">
          Carrier-day boundary at <b class="mono">{c.boundaryShort} {plan.homeZoneName}</b> returns{' '}
          <b class="mono">+{dur(c.cycleGainMinutes)}</b> to your {c.afterClocks.cycleLimit / 60}-hr cycle.
        </p>
        <div class="flip-compare">
          <div class="flip-compare-col" data-flip-c-early="1">
            <span class="flip-compare-lbl">Earliest post-10h start</span>
            <span class="flip-compare-time mono">{c.earlyShort}</span>
            <span class="flip-compare-cycle mono">{dur(c.earlyClocks.cycleRemaining)} cycle</span>
            <span class="flip-compare-sub">
              {c.earlyCanRoll
                ? `Can drive ${dur(c.earlyClocks.driveNow)} immediately before ${c.boundaryWord} roll-off`
                : `0m cycle left — cannot roll until ${c.boundaryWord}`}
            </span>
          </div>
          <div class="flip-compare-col is-after" data-flip-c-after="1">
            <span class="flip-compare-lbl">Hold past {c.boundaryWord}</span>
            <span class="flip-compare-time mono">{c.afterShort}</span>
            <span class="flip-compare-cycle mono">{dur(c.afterClocks.cycleRemaining)} cycle</span>
            <span class="flip-compare-sub">
              Hold +{dur(c.holdExtraMinutes)} · +{dur(c.cycleGainMinutes)} cycle back · Drive {dur(c.afterClocks.driveRemaining)} / Window {dur(c.afterClocks.windowRemaining)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Flip My Clock</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Compare legal HOS rest and split-sleeper bridges from your shutdown to a target roll-out time.
      </p>

      <p class="flip-standing" data-flip-standing="1">{plan.standingLine}</p>

      <Card>
        <div class="flip-controls" data-flip-controls="1" data-flip-target-hm={plan.targetHM}>
          <div class="flip-field">
            <div class="flip-field-head">
              <span class="stat-label">1. Shutting down / finished</span>
              <span class="muted small">
                {customShutdown !== null
                  ? 'Custom'
                  : defShutdown.source === 'shift_end'
                    ? 'From end of shift'
                    : 'Default: now'}
              </span>
            </div>
            <div class="flip-shutdown-row">
              <button
                type="button"
                class="rowbtn"
                data-flip-shutdown-btn="1"
                onClick={openShutdownPicker}
              >
                <span>
                  <b class="mono">{plan.shutdownShort}</b>{' '}
                  <span class="muted small">({plan.homeZoneName})</span>
                </span>
                <span class="muted small">Change ›</span>
              </button>
              {customShutdown !== null && (
                <button
                  type="button"
                  class="ghost stack-clear-btn"
                  data-flip-shutdown-reset="1"
                  onClick={() => setCustomShutdown(null)}
                >
                  Reset
                </button>
              )}
            </div>
            {plan.shutdownClampedToWorkEnd && (
              <p class="muted small" style="margin:0">
                Aligned to the end of your last logged work ({plan.shutdownShort}) so logged history is not overwritten.
              </p>
            )}
          </div>

          <div class="flip-field">
            <div class="flip-field-head">
              <span class="stat-label">2. Target roll-out time</span>
              <span class="muted small mono" data-flip-target-display="1">
                {plan.targetHM} {plan.homeZoneName}
              </span>
            </div>
            <div class="flip-presets" role="group" aria-label="Target roll-out presets">
              {FLIP_PRESETS.map((p) => {
                const on = plan.activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    class={on ? 'on' : undefined}
                    aria-pressed={on}
                    data-flip-preset={p.id}
                    onClick={() => { setTargetHour(p.hour); setTargetMinute(p.minute); }}
                  >
                    {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                class={plan.activePreset === null ? 'on' : undefined}
                aria-pressed={plan.activePreset === null}
                data-flip-preset="custom"
                onClick={openTargetPicker}
              >
                {plan.activePreset === null ? `Custom (${plan.targetHM})` : 'Custom'}
              </button>
            </div>
          </div>
        </div>
      </Card>

      <div class="flip-cards" data-flip-cards="1">
        {plan.optionA && renderOptionA(plan.optionA)}
        {plan.optionB && renderOptionB(plan.optionB)}
        {plan.optionC && renderOptionC(plan.optionC)}
        {plan.bridgeCount === 0 && (
          <Card tone="warn">
            <p class="small" style="margin:0">
              No legal roll-out bridge fits within the next 2 shifts on your current cycle — check <b>Weekly recap vs. 34</b>.
            </p>
          </Card>
        )}
      </div>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="flip" />
    </>
  );
}

/* ============================================================ Miles Left in My 70 */

/**
 * Shared ClockPick sheet for Miles Left in My 70 pay-week cutoff time-of-day (`timeOnly`,
 * exact same pattern as Settings DayStartSheet and FlipTimeSheet target mode).
 */
function MilesTimeSheet({ k, closing = false }: { k: Extract<SheetKind, { kind: 'milestime' }>; closing?: boolean }) {
  const [at, setAt] = useState<number>(() => dayStartAnchor(k.cutoffHour, k.cutoffMinute));
  const setPick = (v: number) => {
    const d = new Date(v * 60000);
    setAt(dayStartAnchor(d.getHours(), d.getMinutes()));
  };
  const d = new Date(at * 60000);
  const h = d.getHours();
  const m = d.getMinutes();
  const hm = formatCutoffHM(h, m);
  const apply = () => {
    k.onApply(h, m);
    openSheet(null);
  };
  return (
    <Sheet title={`Pay-week cutoff (${k.cutoffDowName})`} closing={closing}>
      <p class="muted small" style="margin:0">
        Cutoff time on <b>{k.cutoffDowName}</b> in <b>{k.homeZoneName}</b> ({k.homeTimeZone}).
      </p>
      <ClockPick
        timeOnly
        at={at}
        set={setPick}
        now={at}
        future={false}
        say="Pay-week cutoff"
        name="Pay-week cutoff time"
        keys={KEYS_DAYSTART}
        sub={`Home terminal time (${k.homeZoneName}) · tap the time to pick it`}
      />
      <button class="primary wide ed-go" data-miles-time-apply="1" onClick={apply}>
        Apply · {hm} ({k.homeZoneName})
      </button>
    </Sheet>
  );
}

/**
 * Miles Left in My 70 — Weekly Miles & Governed-Truck Cycle Pace Check (Plan tool #12 / Spec #5).
 * Converts remaining cycle + upcoming carrier-day recap drop-offs through pay-week cutoff into
 * maximum legal miles at a realistic governed-truck average speed, after daily non-driving on-duty
 * overhead. Session-only state (zero new localStorage keys); shared ClockPick for cutoff time.
 */
function MilesTab({ s, now, onBack }: { s: State; now: number; onBack: () => void }) {
  const [milesAlreadyRun, setMilesAlreadyRun] = useState<number>(MILES_DEFAULT_RUN);
  const [runText, setRunText] = useState<string>(String(MILES_DEFAULT_RUN));
  const [runNote, setRunNote] = useState<string | null>(null);

  const [goalMiles, setGoalMiles] = useState<number>(MILES_DEFAULT_GOAL);
  const [goalText, setGoalText] = useState<string>(String(MILES_DEFAULT_GOAL));
  const [goalNote, setGoalNote] = useState<string | null>(null);

  const [mph, setMph] = useState<number>(MILES_DEFAULT_MPH);
  const [mphText, setMphText] = useState<string>(String(MILES_DEFAULT_MPH));
  const [mphNote, setMphNote] = useState<string | null>(null);

  const [overheadMinutes, setOverheadMinutes] = useState<number>(MILES_DEFAULT_OVERHEAD_MIN);
  const [cutoffDow, setCutoffDow] = useState<number>(MILES_DEFAULT_CUTOFF_DOW);
  const [cutoffHour, setCutoffHour] = useState<number>(MILES_DEFAULT_CUTOFF_HOUR);
  const [cutoffMinuteOfHour, setCutoffMinuteOfHour] = useState<number>(MILES_DEFAULT_CUTOFF_MIN);

  const onRunInput = (raw: string) => {
    setRunText(raw);
    const t = raw.trim();
    if (t === '') {
      setMilesAlreadyRun(0);
      setRunNote(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > MILES_MAX_RUN) {
      setRunNote(`Enter 0–${fmtMilesNum(MILES_MAX_RUN)} mi. Still using ${fmtMilesNum(milesAlreadyRun)} mi.`);
      return;
    }
    setMilesAlreadyRun(Math.round(n));
    setRunNote(null);
  };
  const onRunBlur = () => {
    setRunText(String(milesAlreadyRun));
    setRunNote(null);
  };

  const onGoalInput = (raw: string) => {
    setGoalText(raw);
    const t = raw.trim();
    if (t === '') {
      setGoalNote(`Enter 1–${fmtMilesNum(MILES_MAX_GOAL)} mi. Still using ${fmtMilesNum(goalMiles)} mi.`);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1 || n > MILES_MAX_GOAL) {
      setGoalNote(`Enter 1–${fmtMilesNum(MILES_MAX_GOAL)} mi. Still using ${fmtMilesNum(goalMiles)} mi.`);
      return;
    }
    setGoalMiles(Math.round(n));
    setGoalNote(null);
  };
  const onGoalBlur = () => {
    setGoalText(String(goalMiles));
    setGoalNote(null);
  };

  const onMphInput = (raw: string) => {
    setMphText(raw);
    const t = raw.trim();
    if (t === '') {
      setMphNote(`Enter ${MILES_MIN_MPH}–${MILES_MAX_MPH} mph. Still using ${mph} mph.`);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < MILES_MIN_MPH || n > MILES_MAX_MPH) {
      setMphNote(`Enter ${MILES_MIN_MPH}–${MILES_MAX_MPH} mph. Still using ${mph} mph.`);
      return;
    }
    setMph(Math.round(n));
    setMphNote(null);
  };
  const onMphBlur = () => {
    setMphText(String(mph));
    setMphNote(null);
  };

  const overheadBox = useDurationBoxes(
    'Daily on-duty overhead',
    overheadMinutes,
    0,
    MILES_MAX_OVERHEAD_MIN,
    setOverheadMinutes,
  );

  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s, now, customClocks],
  );
  const res = useMemo(
    () => evaluateMilesLeft({
      segments: logged,
      now,
      config: s.config,
      milesAlreadyRun,
      goalMiles,
      mph,
      overheadMinutes,
      cutoffDow,
      cutoffHour,
      cutoffMinuteOfHour,
    }),
    [logged, now, s.config, milesAlreadyRun, goalMiles, mph, overheadMinutes, cutoffDow, cutoffHour, cutoffMinuteOfHour],
  );
  const hist = cycleBasis(s, now, cycleParamsOf(s.config).windowDays);

  const cutoffDowInfo = MILES_DOW_LABELS.find((d) => d.dow === res.cutoffDow) ?? MILES_DOW_LABELS[6];

  const openCutoffTimePicker = () => {
    openSheet({
      kind: 'milestime',
      cutoffHour: res.cutoffHour,
      cutoffMinute: res.cutoffMinuteOfHour,
      cutoffDowName: cutoffDowInfo.name,
      homeZoneName: res.homeZoneName,
      homeTimeZone: res.homeTimeZone,
      onApply: (h, m) => {
        setCutoffHour(h);
        setCutoffMinuteOfHour(m);
      },
    });
  };

  const signKind: SignKind = res.status === 'short' ? (res.tone === 'bad' ? 'stop' : 'warn') : 'go';
  const signLabel = res.status === 'met' ? 'Already there' : res.status === 'doable' ? 'Doable' : 'Short of goal';

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">Miles Left in My 70</h1>
      <p class="muted small" style="margin:-6px 0 10px">
        Check whether your remaining cycle + recaps can legally reach your weekly mileage goal before pay-week cutoff.
      </p>

      <p class="miles-standing" data-miles-standing="1">{res.standingLine}</p>

      {/* 1. VERDICT & TANK FIRST */}
      <Card tone={res.tone}>
        <div
          class="miles-verdict"
          data-miles-card="1"
          data-miles-status={res.status}
          data-miles-cycle-rule={String(res.cycleLimitHours)}
          data-miles-hours-min={String(res.cycleThroughCutoffMinutes)}
          data-miles-recaps-min={String(res.netRecapsBeforeCutoffMinutes)}
          data-miles-drive-min={String(res.totalDriveMinutes)}
          data-miles-max={String(res.maxLegalMiles)}
          data-miles-ceiling={String(res.ceilingMiles)}
          data-miles-cushion={String(res.cushionMiles)}
          data-miles-shortfall={String(res.shortfallMiles)}
          data-miles-trim-adds={String(res.trimAddsMiles)}
          data-miles-cutoff={String(res.cutoffMinute)}
          data-miles-day-count={String(res.dayCount)}
        >
          <Sign kind={signKind}>{signLabel}</Sign>

          <p class="miles-headline" data-miles-verdict="1">{res.verdictHeadline}</p>

          <div class="miles-tank" data-miles-tank="1">
            <span class="miles-tank-lbl" data-miles-hours-label="1">
              {res.cycleLimitHours}-hr cycle + recaps through {res.cutoffShort} ({res.homeZoneName})
            </span>
            <div class="miles-tank-row">
              <span class="miles-hero-hours mono" data-miles-hours-left="1">{res.cycleThroughCutoffHMM}</span>
              <span class="miles-hero-miles mono" data-miles-max-miles="1">
                ~{fmtMilesNum(res.maxLegalMiles)} max legal miles (no 34)
              </span>
            </div>
            <span class="miles-tank-sub" data-miles-assumptions="1">
              At <b class="mono">{res.mph} mph</b> real average · after <b class="mono">{dur(res.overheadMinutes)}/day</b> on-duty overhead ·{' '}
              <span class="mono">{fmtHMM(res.remainingNowMinutes)}</span> now +{' '}
              <span class="mono">{fmtHMM(res.netRecapsBeforeCutoffMinutes)}</span> {res.overCycleNowMinutes > 0 ? 'net recaps' : 'recaps'}
              {res.overCycleNowMinutes > 0 ? ` (after ${fmtHMM(res.overCycleNowMinutes)} over cycle)` : ''}
            </span>
            {res.boundaryDropNote && (
              <span class="miles-tank-sub" data-miles-boundary-note="1">{res.boundaryDropNote}</span>
            )}
          </div>

          <div class="miles-metrics">
            <div class="miles-metric">
              <span class="miles-metric-lbl">Run so far</span>
              <span class="miles-metric-val mono">{fmtMilesNum(res.milesAlreadyRun)} mi</span>
            </div>
            <div class="miles-metric">
              <span class="miles-metric-lbl">Max left (no 34)</span>
              <span class="miles-metric-val mono">~{fmtMilesNum(res.maxLegalMiles)} mi</span>
            </div>
            <div class="miles-metric">
              <span class="miles-metric-lbl">Ceiling without a 34</span>
              <span class="miles-metric-val mono" data-miles-ceiling-text="1">~{fmtMilesNum(res.ceilingMiles)} mi</span>
            </div>
          </div>

          {res.dailyCapNote && (
            <p class="miles-cap-note" data-miles-cap-note="1">{res.dailyCapNote}</p>
          )}

          {res.trimLeverLine && (
            <p class="miles-trim" data-miles-trim="1">{res.trimLeverLine}</p>
          )}
        </div>
      </Card>

      {/* 2. INPUTS (SESSION-ONLY) */}
      <Card title="Your week &amp; pace">
        <div class="miles-inputs" data-miles-inputs="1">
          {/* 1. Miles already run */}
          <div class="miles-section">
            <div class="miles-section-head">
              <label class="stat-label" for="miles-run-input">1. Miles already run this pay week</label>
              <b class="mono">{fmtMilesNum(milesAlreadyRun)} mi</b>
            </div>
            <input
              id="miles-run-input"
              type="number"
              class="num"
              inputMode="numeric"
              min={0}
              max={MILES_MAX_RUN}
              step={1}
              data-miles-run-input="1"
              aria-label="Miles already run this pay week"
              value={runText}
              onInput={(e) => onRunInput((e.target as HTMLInputElement).value)}
              onBlur={onRunBlur}
            />
            {runNote && <p class="small warn" style="margin:2px 0 0">{runNote}</p>}
          </div>

          {/* 2. Weekly mileage goal */}
          <div class="miles-section">
            <div class="miles-section-head">
              <label class="stat-label" for="miles-goal-input">2. Weekly mileage goal</label>
              <b class="mono">{fmtMilesNum(goalMiles)} mi</b>
            </div>
            <div class="rollout-chips" role="group" aria-label="Weekly mileage goal presets">
              {MILES_GOAL_PRESETS.map((g) => (
                <button
                  key={g}
                  type="button"
                  class={goalMiles === g ? 'on' : undefined}
                  aria-pressed={goalMiles === g}
                  data-miles-goal-chip={String(g)}
                  onClick={() => { setGoalMiles(g); setGoalText(String(g)); setGoalNote(null); }}
                >
                  {fmtMilesNum(g)}
                </button>
              ))}
            </div>
            <input
              id="miles-goal-input"
              type="number"
              class="num"
              inputMode="numeric"
              min={1}
              max={MILES_MAX_GOAL}
              step={1}
              data-miles-goal-input="1"
              aria-label="Weekly mileage goal"
              value={goalText}
              onInput={(e) => onGoalInput((e.target as HTMLInputElement).value)}
              onBlur={onGoalBlur}
            />
            {goalNote && <p class="small warn" style="margin:2px 0 0">{goalNote}</p>}
          </div>

          {/* 3. Real average speed */}
          <div class="miles-section">
            <div class="miles-section-head">
              <label class="stat-label" for="miles-mph-input">3. Real average speed (mph)</label>
              <b class="mono">{mph} mph</b>
            </div>
            <p class="muted small" style="margin:0">
              Your real average speed — not your truck's governor setting.
            </p>
            <input
              id="miles-mph-input"
              type="number"
              class="num"
              inputMode="numeric"
              min={MILES_MIN_MPH}
              max={MILES_MAX_MPH}
              step={1}
              data-miles-mph-input="1"
              aria-label="Real average speed (mph)"
              value={mphText}
              onInput={(e) => onMphInput((e.target as HTMLInputElement).value)}
              onBlur={onMphBlur}
            />
            {mphNote && <p class="small warn" style="margin:2px 0 0">{mphNote}</p>}
          </div>

          {/* 4. Daily on-duty overhead */}
          <div class="miles-section">
            <div class="miles-section-head">
              <span class="stat-label">4. Daily on-duty overhead</span>
              <b class="mono">{dur(overheadMinutes)}/day</b>
            </div>
            <p class="muted small" style="margin:0">
              Pre-trip, fuel, drop/hook, and dock time logged on duty each running day.
            </p>
            <div class="rollout-chips" role="group" aria-label="Daily overhead presets">
              {MILES_OVERHEAD_PRESETS.map((p) => (
                <button
                  key={p.minutes}
                  type="button"
                  class={overheadMinutes === p.minutes ? 'on' : undefined}
                  aria-pressed={overheadMinutes === p.minutes}
                  data-miles-overhead-chip={String(p.minutes)}
                  onClick={() => setOverheadMinutes(p.minutes)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div class="qs-row motel-dur-row" data-miles-overhead-box="1">
              <span class="small muted">Exact overhead</span>
              {overheadBox.boxes}
            </div>
            {overheadBox.note && <p class="small warn" style="margin:2px 0 0">{overheadBox.note}</p>}
          </div>

          {/* 5. Pay-week cutoff */}
          <div class="miles-section">
            <div class="miles-section-head">
              <span class="stat-label">5. Pay-week cutoff</span>
              <b class="mono" data-miles-cutoff-display="1">{res.cutoffShort} {res.homeZoneName}</b>
            </div>
            <div class="miles-dow-row" role="group" aria-label="Pay-week cutoff day">
              {MILES_DOW_LABELS.map((d) => {
                const on = cutoffDow === d.dow;
                return (
                  <button
                    key={d.dow}
                    type="button"
                    class={on ? 'on' : undefined}
                    aria-pressed={on}
                    data-miles-dow={String(d.dow)}
                    onClick={() => setCutoffDow(d.dow)}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              class="rowbtn"
              data-miles-cutoff-time-btn="1"
              onClick={openCutoffTimePicker}
            >
              <span>
                Cutoff time: <b class="mono">{res.cutoffHM}</b>{' '}
                <span class="muted small">({res.homeZoneName})</span>
              </span>
              <span class="muted small">Change ›</span>
            </button>
          </div>
        </div>
      </Card>

      {/* 3. DAY-BY-DAY CARRIER-DAY BREAKDOWN */}
      <Card title="Day-by-day capacity">
        <p class="muted small" style="margin:0 0 8px">
          Carrier days roll at <b class="mono">{res.dayStartLabel}</b> ({res.dayStartHM} {res.homeZoneName}) · {res.cycleLimitHours}-hr / {res.windowDays}-day rule.
        </p>
        <div class="miles-days" data-miles-days="1">
          {res.days.map((d) => (
            <div
              key={d.dayStart}
              class="miles-day-row"
              data-miles-day={String(d.dayIndex)}
              data-miles-day-drops={String(d.dropsOffMinutes)}
              data-miles-day-drive={String(d.driveMinutes)}
              data-miles-day-miles={String(d.displayMiles)}
            >
              <div class="miles-day-left">
                <b>{d.dayIndex === 0 ? `Today (${d.shortLabel})` : d.shortLabel}</b>
                <span class="miles-day-sub">
                  {d.dropsOffMinutes > 0
                    ? `+${fmtHMM(d.dropsOffMinutes)} drops off at ${res.dayStartLabel} · `
                    : ''}
                  Cycle avail {fmtHMM(d.availCycleMinutes)}
                </span>
              </div>
              <div class="miles-day-right">
                <b class="mono">~{fmtMilesNum(d.displayMiles)} mi</b>
                <span class="miles-day-sub mono">
                  {dur(d.driveMinutes)} drive
                  {d.capKind === 'window14' ? ' (14h window cap)' : d.capKind === 'drive11' ? ' (11h cap)' : ''}
                  {d.wallMinutes === 0 && d.dropsOffMinutes > 0 && d.dayStart === res.cutoffMinute ? ' (at cutoff)' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
      {!customClocks && hist !== 'known' && (
        <div class="warnbox small" style="margin-top:10px">
          Your log does not cover a full {cycleParamsOf(s.config).windowDays}-day cycle yet, so unlogged past days count as 0h. Use custom clocks below, or update past days in <b>Log</b>.
        </div>
      )}
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="miles" />
    </>
  );
}

/* ============================================================ My Week (Master Week Synthesizer — Plan capstone) */

/**
 * Shared ClockPick sheet for My Week:
 *  - 'home': home-time target date & time (home-terminal zone)
 *  - 'appt': per-load hard appointment date & time (facility zone)
 *  - 'usualstart': usual nightly shift start time-of-day (`timeOnly`, home-terminal zone)
 * Converts wall-clock strings through `deviceTz` so TZ=UTC and TZ=America/Chicago stay exact.
 */
function MyWeekTimeSheet({ k, now, closing = false }: { k: Extract<SheetKind, { kind: 'myweektime' }>; now: number; closing?: boolean }) {
  const nowWall = formatWallDateTime(now, k.entryTimeZone);
  const pickerNow = resolveWallDateTime(nowWall.date, nowWall.time, deviceTz) ?? now;
  const [at, setAt] = useState<number>(() => {
    const parsed = resolveWallDateTime(k.dateStr || nowWall.date, k.timeStr || '08:00', deviceTz);
    return parsed ?? nextHour(pickerNow);
  });
  const apply = () => {
    const wall = formatWallDateTime(at, deviceTz);
    k.onApply(wall.date, wall.time);
    openSheet(null);
  };
  const isTimeOnly = k.mode === 'usualstart';
  return (
    <Sheet title={`${k.title} (${k.entryZoneName})`} closing={closing}>
      <p class="muted small" style="margin:0">
        {isTimeOnly
          ? <>Usual nightly roll-out time in <b>{k.entryZoneName}</b> time.</>
          : <>Wall-clock time in <b>{k.entryZoneName}</b> time.</>}
      </p>
      <ClockPick
        at={at}
        set={setAt}
        now={pickerNow}
        future={!isTimeOnly}
        timeOnly={isTimeOnly}
        say={k.mode === 'home' ? 'Home by' : k.mode === 'usualstart' ? 'Usual start' : 'Appointment'}
        name={k.title}
        keys={KEYS_HOURS}
      />
      <button class="primary wide ed-go" onClick={apply}>
        {isTimeOnly
          ? `Apply · ${formatWallDateTime(at, deviceTz).time} (${k.entryZoneName})`
          : `Apply · ${clockFull(at)} (${k.entryZoneName})`}
      </button>
    </Sheet>
  );
}

/** Inline duration editor row using the shared duration-box pattern. */
function MyWeekDurRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const box = useDurationBoxes(label, value, min, max, onChange);
  return (
    <div class="mw-field-row">
      <div class="qs-row motel-dur-row">
        <span class="small muted">{label}</span>
        {box.boxes}
      </div>
      {box.note && <p class="small warn" style="margin:0">{box.note}</p>}
    </div>
  );
}

/**
 * My Week — Master Week Synthesizer (Plan capstone tool).
 * Persists draft in `s.weekPlan` (`store.ts`). Chains 1–5 upcoming loads + home-time target +
 * open-night shift fill through the real engine as ONE timeline, handing back one 5-second
 * verdict, priced conflict cards with 1-tap trade previews, Recaps vs. 34 comparison, and an
 * expandable week strip with 1-tap drill-downs to When to Roll & PTA and Split-Sleeper Rescue.
 */
function MyWeekTab({ s, now, onBack, active = true }: { s: State; now: number; onBack: () => void; active?: boolean }) {
  const draft = s.weekPlan;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  const [previewTradeId, setPreviewTradeId] = useState<string | null>(null);
  const [manualStrat, setManualStrat] = useState<WeekStrategyId | null>(null);
  const [prefsMore, setPrefsMore] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [copyNote, setCopyNote] = useState('');
  const lastBaseResRef = useRef<WeekSynthesisResult | null>(null);
  const lastResRef = useRef<WeekSynthesisResult | null>(null);

  const updatePlan = (fn: (cur: WeekPlanDraft) => WeekPlanDraft, keepManualStrat = false) => {
    setPreviewTradeId(null);
    if (!keepManualStrat) setManualStrat(null);
    setState((cur) => ({ weekPlan: fn(cur.weekPlan) }));
  };

  const updateLoad = (id: string, patch: Partial<WeekLoadDraft>) => {
    updatePlan((p) => ({
      ...p,
      loads: p.loads.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const addLoad = () => {
    if (draft.loads.length >= WEEK_MAX_LOADS) return;
    const next = createNextWeekLoad(draft.loads, now, s.config);
    updatePlan((p) => ({ ...p, loads: [...p.loads, next] }));
    setExpandedId(next.id);
  };

  const importFromLoadCheck = () => {
    if (draft.loads.length >= WEEK_MAX_LOADS) return;
    const lc = s.loadCheck;
    const base = createNextWeekLoad(draft.loads, now, s.config);
    const hasAppt = lc.appt != null && Number.isFinite(lc.appt);
    const apptWall = hasAppt ? formatWallDateTime(lc.appt as number, s.config.timeZone) : null;
    const imported: WeekLoadDraft = {
      ...base,
      label: 'From Load Check',
      distanceMode: 'miles',
      miles: Math.max(1, Math.min(3000, Math.round(lc.miles))),
      dockMinutes: Math.max(0, Math.min(720, Math.round(lc.dwell))),
      dockOff: Boolean(lc.dwellOff),
      hasAppt: Boolean(apptWall),
      apptDate: apptWall?.date ?? base.apptDate,
      apptTime: apptWall?.time ?? base.apptTime,
    };
    updatePlan((p) => ({ ...p, loads: [...p.loads, imported] }));
    setExpandedId(imported.id);
  };

  const removeLoad = (id: string) => {
    updatePlan((p) => ({ ...p, loads: p.loads.filter((l) => l.id !== id) }));
    if (expandedId === id) setExpandedId(null);
  };

  const moveLoad = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= draft.loads.length) return;
    updatePlan((p) => {
      const next = [...p.loads];
      const [item] = next.splice(idx, 1);
      next.splice(j, 0, item);
      return { ...p, loads: next };
    });
  };

  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const logged = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : loggedSegments(s, now)),
    [s.segments, s.current, s.config, now, customClocks],
  );
  const { windowDays } = cycleParamsOf(s.config);
  const basis = useMemo(() => (customClocks ? 'known' : cycleBasis(s, now, windowDays)), [s, now, windowDays, customClocks]);

  const baseRes: WeekSynthesisResult = useMemo(() => {
    // H1: Never re-synthesize while the room is closing/dissolving off-screen.
    if (!active && lastBaseResRef.current) return lastBaseResRef.current;
    const out = synthesizeWeek({
      segments: logged,
      now,
      config: s.config,
      mph: s.mph,
      draft,
      historyBasis: basis,
      previewTradeId: null,
    });
    lastBaseResRef.current = out;
    if (!customClocks) {
      primeWeekHubCache({
        segments: s.segments,
        current: s.current,
        now,
        config: s.config,
        mph: s.mph,
        draft,
        historyBasis: basis,
      }, out);
    }
    return out;
  }, [active, logged, now, s.segments, s.current, s.config, s.mph, draft, basis, customClocks]);

  const activePreviewConflict = previewTradeId
    ? baseRes.conflicts.find((c) => c.previewTrade?.id === previewTradeId) ?? null
    : null;

  const res: WeekSynthesisResult = useMemo(() => {
    if (!active && lastResRef.current) return lastResRef.current;
    const trade = activePreviewConflict?.previewTrade;
    if (!trade) {
      lastResRef.current = baseRes;
      return baseRes;
    }
    const mutated = trade.apply({
      ...draft,
      loads: draft.loads.map((l) => ({ ...l })),
      homeTarget: draft.homeTarget ? { ...draft.homeTarget } : null,
    });
    const out = synthesizeWeek({
      segments: logged,
      now,
      config: s.config,
      mph: s.mph,
      draft: mutated,
      historyBasis: basis,
      previewTradeId: null,
    });
    const withId = { ...out, activePreviewTradeId: previewTradeId };
    lastResRef.current = withId;
    return withId;
  }, [active, activePreviewConflict, previewTradeId, baseRes, logged, now, s.config, s.mph, draft, basis]);

  const applyPreviewTrade = () => {
    const trade = activePreviewConflict?.previewTrade;
    if (!trade) return;
    updatePlan((p) => trade.apply(p));
    setPreviewTradeId(null);
  };

  const zoneChoices = useMemo(() => {
    const set = new Set<string>([s.config.timeZone, deviceTz, ...COMMON_APPT_ZONES]);
    return [...set].filter((z) => isValidTimeZone(z));
  }, [s.config.timeZone]);

  // M4: Default the Week Strip to the recommended lane; manual toggle overrides locally.
  const effectiveStratId: WeekStrategyId = previewTradeId?.startsWith('push-for-34')
    ? 'reset34'
    : (manualStrat ?? res.recommendedStrategy);
  const shownStrat = effectiveStratId === 'reset34' ? res.reset34 : res.recaps;
  const topConflicts = baseRes.conflicts.slice(0, 3);

  const openHomeTargetPicker = () => {
    const fallbackWall = formatWallDateTime(now + 48 * 60, res.homeTimeZone);
    openSheet({
      kind: 'myweektime',
      mode: 'home',
      title: 'Home-time target',
      dateStr: draft.homeTarget?.date ?? fallbackWall.date,
      timeStr: draft.homeTarget?.time ?? '09:00',
      entryZoneName: res.homeZoneName,
      entryTimeZone: res.homeTimeZone,
      onApply: (date, time) => updatePlan((p) => ({ ...p, homeTarget: { date, time } })),
    });
  };

  const openLoadApptPicker = (l: WeekLoadDraft) => {
    const tz = l.apptTimeZone && isValidTimeZone(l.apptTimeZone) ? l.apptTimeZone : res.homeTimeZone;
    const fallbackWall = formatWallDateTime(now + 24 * 60, tz);
    openSheet({
      kind: 'myweektime',
      mode: 'appt',
      title: `${l.label.trim() || 'Load'} appointment`,
      dateStr: l.apptDate || fallbackWall.date,
      timeStr: l.apptTime || '08:00',
      entryZoneName: zoneShort(tz),
      entryTimeZone: tz,
      onApply: (date, time) => updateLoad(l.id, { hasAppt: true, apptDate: date, apptTime: time }),
    });
  };

  const openUsualStartPicker = () => {
    const nowWall = formatWallDateTime(now, res.homeTimeZone);
    const hh = String(Math.floor(draft.usualShiftStartMinutes / 60)).padStart(2, '0');
    const mm = String(draft.usualShiftStartMinutes % 60).padStart(2, '0');
    openSheet({
      kind: 'myweektime',
      mode: 'usualstart',
      title: 'Usual shift start',
      dateStr: nowWall.date,
      timeStr: `${hh}:${mm}`,
      entryZoneName: res.homeZoneName,
      entryTimeZone: res.homeTimeZone,
      onApply: (_date, time) => {
        const m = /^(\d{2}):(\d{2})$/.exec(time);
        if (m) updatePlan((p) => ({ ...p, usualShiftStartMinutes: Number(m[1]) * 60 + Number(m[2]) }));
      },
    });
  };

  // M5: Always copy the APPLIED plan (`baseRes.dispatchText`), never an active unapplied preview.
  const copyDispatch = async () => {
    try {
      await navigator.clipboard.writeText(baseRes.dispatchText);
      setCopyNote('Copied ✓');
    } catch {
      setCopyNote('Select & copy below');
      setShowDispatch(true);
    }
  };

  // H4 & B3 (receptionfix2): Seed Rollout & Rescue drill-downs from the CHAINED state at Load `o`
  // (prior planned loads' simulated segments + chained evaluation cursor + any active My Week
  // custom clocks & synthesized base, including for Load 1), so drill-downs never contradict My Week.
  const chainContextFor = (o: WeekLoadOutcome) => {
    const customCtx = customClocks
      ? { chainedCustomClocks: customClocks, chainedBaseSegments: logged }
      : { chainedCustomClocks: undefined, chainedBaseSegments: undefined };
    if (o.index <= 0) {
      return {
        chainedPriorSegments: undefined,
        chainedCursor: res.now,
        chainedFromLabel: undefined,
        ...customCtx,
      };
    }
    const priorLoads = shownStrat.loads.slice(0, o.index);
    const prev = priorLoads[priorLoads.length - 1];
    return {
      chainedPriorSegments: priorLoads.flatMap((pl) => pl.simSegments),
      chainedCursor: prev ? prev.pta.minute : res.now,
      chainedFromLabel: prev ? `after ${prev.displayName}` : undefined,
      ...customCtx,
    };
  };

  const drillRollout = (o: WeekLoadOutcome) => {
    const apptMin = o.appointment?.minute ?? o.arrival.minute + o.bufferMinutes;
    const wd = formatWallDateTime(apptMin, o.apptTimeZone);
    const chainCtx = chainContextFor(o);
    openRolloutPlanner(true, {
      apptDate: wd.date,
      apptTime: wd.time,
      apptTimeZone: o.apptTimeZone,
      distanceMode: o.load.distanceMode,
      miles: o.load.miles + o.load.deadheadMiles,
      mph: o.effectiveMph,
      driveMinutes: o.totalDriveMinutes,
      bufferMinutes: o.bufferMinutes,
      dockMinutes: o.dockMinutes,
      preTripMinutes: o.preTripMinutes,
      returnToMyWeek: true,
      ...chainCtx,
    });
  };

  const drillRescue = (o: WeekLoadOutcome) => {
    const chainCtx = chainContextFor(o);
    openRescuePlanner(true, {
      dockWaitMinutes: o.dockMinutes || 120,
      distanceMode: o.load.distanceMode,
      miles: o.load.miles + o.load.deadheadMiles,
      mph: o.effectiveMph,
      driveMinutes: o.totalDriveMinutes,
      deadlineMinute: o.appointment?.minute ?? null,
      returnToMyWeek: true,
      ...chainCtx,
    });
  };

  return (
    <>
      <button class="back" onClick={onBack}><Icon d={I.back} /> Plan</button>
      <h1 class="screen-title">My Week</h1>

      {/* Starting clocks bar (shared floor — automatic, 0 taps) */}
      <div class="mw-clocks-bar" data-myweek-clocks="1">
        <span>
          Now: <b class="mono">{dur(res.cycleRemainingNow)}</b> cycle · <b class="mono">{dur(res.driveRemainingNow)}</b> drive · <b class="mono">{dur(res.windowRemainingNow)}</b> window
        </span>
        {res.provisional && (
          <button
            type="button"
            class="link"
            style="display:inline;padding:0;min-height:0"
            onClick={() => { openMyWeekPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}
          >
            Fix a day
          </button>
        )}
      </div>

      {/* 1. TOP CARD — ONE 5-SECOND VERDICT BANNER */}
      <Card tone={res.verdict.tone}>
        <div
          class="mw-verdict"
          data-myweek-verdict="1"
          data-myweek-status={res.verdict.status}
          data-myweek-rec-strat={res.recommendedStrategy}
        >
          <Sign kind={res.verdict.sign}>{res.verdict.label}</Sign>
          <p class="mw-headline">{res.verdict.headline}</p>
          <p class="mw-subline">{res.verdict.subline}</p>
          {res.verdict.fragilityNote && (
            <p class="mw-note">{res.verdict.fragilityNote}</p>
          )}
          {res.verdict.splitCallout && (
            <p class="mw-note" data-myweek-split-callout="1"><b>{res.verdict.splitCallout}</b></p>
          )}
          {res.provisional && (
            <div class="row" style="gap:10px;flex-wrap:wrap">
              <button
                type="button"
                class="mini"
                onClick={() => { openMyWeekPlanner(false); setState({ tab: 'recap', planReturn: 'plan' }); }}
              >
                Hours coming back → Fix a day
              </button>
              <button
                type="button"
                class="mini"
                onClick={() => openSheet({ kind: 'drift' })}
              >
                Drift check
              </button>
            </div>
          )}
          <p class="muted small" style="margin:2px 0 0">
            Planning estimate at {res.effectiveMph} mph ({res.homeZoneName} terminal, {res.dayStartWord} day roll) — your ELD governs.
          </p>
        </div>
      </Card>

      {/* Active Trade Preview Bar */}
      {activePreviewConflict?.previewTrade && (
        <div class="mw-preview-bar" data-myweek-preview-bar="1">
          <span><b>Previewing trade:</b> {activePreviewConflict.previewTrade.label}</span>
          <div class="row" style="gap:6px">
            <button type="button" class="mini primary" onClick={applyPreviewTrade}>Apply to week</button>
            <button type="button" class="mini" onClick={() => setPreviewTradeId(null)}>Exit preview</button>
          </div>
        </div>
      )}

      {/* 2. CONFLICTS & TRADES (ONLY SHOWN WHEN TOOLS DISAGREE) */}
      {topConflicts.length > 0 && (
        <div class="mw-conflicts" data-myweek-conflicts="1">
          <h2 style="margin:0">Conflicts &amp; trades</h2>
          {topConflicts.map((c: WeekConflict) => {
            const isPreviewing = Boolean(c.previewTrade && previewTradeId === c.previewTrade.id);
            return (
              <div
                key={c.id}
                class={`mw-conflict sev-${c.severity}`}
                data-myweek-conflict={c.kind}
              >
                <div class="mw-conflict-head">
                  <span class="mw-conflict-title"><span class={`mw-conflict-glyph sev-${c.severity}`} aria-hidden="true" data-status-label="1">{c.severity === 'bad' ? '✕' : c.severity === 'warn' ? '⚠' : 'ⓘ'}</span> {c.title}</span>
                  <span class="mw-conflict-price mono">{c.priceLabel}</span>
                </div>
                <p class="mw-conflict-body">{c.body}</p>
                <p class="mw-conflict-trade"><b>Trade:</b> {c.tradeText}</p>
                {c.previewTrade && (
                  <div>
                    <button
                      type="button"
                      class={isPreviewing ? 'mini primary' : 'mini'}
                      data-myweek-preview-btn={c.previewTrade.id}
                      onClick={() => setPreviewTradeId(isPreviewing ? null : c.previewTrade!.id)}
                    >
                      {isPreviewing ? 'Hide preview' : `Preview: ${c.previewTrade.label}`}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3. STRATEGY SWITCHER (A · Run Recaps vs. B · Fit a 34) */}
      <div class="mw-strat-row" role="group" aria-label="Weekly strategy comparison" data-myweek-strategies="1">
        {(['recaps', 'reset34'] as const).map((sid) => {
          const st = sid === 'recaps' ? res.recaps : res.reset34;
          const active = effectiveStratId === sid;
          const isRec = res.recommendedStrategy === sid;
          const summary = res.activeLoadCount === 0
            ? (sid === 'recaps'
                ? `${dur(res.macroRecap.recaps.totalUsableMinutes)} usable over 7 shifts`
                : `${dur(res.macroRecap.reset34.totalUsableMinutes)} usable with 34`)
            : st.missedApptCount > 0
              ? `Misses ${st.missedApptCount} appt${st.missedApptCount === 1 ? '' : 's'} (late ${dur(st.maxApptLateMinutes)})`
              : st.homeCheck && !st.homeCheck.meetsTarget
                ? `Home ${dur(Math.abs(st.homeCheck.slackMinutes))} past · ${dur(st.cycleRemainingAtEnd)} left`
                : `${dur(st.cycleRemainingAtEnd)} cycle left${st.usesSplit ? ' · uses split' : ''}`;
          return (
            <button
              key={sid}
              type="button"
              class={`mw-strat-btn${active ? ' on' : ''}`}
              aria-pressed={active}
              data-myweek-strat={sid}
              onClick={() => { setManualStrat(sid); updatePlan((p) => ({ ...p, strategyView: sid }), true); }}
            >
              <b>{st.label}{isRec ? ' ★' : ''}</b>
              <span>{summary}</span>
              {sid === 'reset34' && st.resetPlacement && (
                <span>34: {st.resetPlacement.start.homeShort} → {st.resetPlacement.end.homeShort}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 4. THE CHAINED WEEK STRIP */}
      <div class="mw-strip" data-myweek-strip="1">
        <div class="row" style="justify-content:space-between;align-items:center">
          <h2 style="margin:0">Week strip ({res.activeLoadCount}/{WEEK_MAX_LOADS} loads)</h2>
          <div class="row" style="gap:6px">
            {draft.loads.length < WEEK_MAX_LOADS && (
              <button type="button" class="mini" data-myweek-import-lc="1" onClick={importFromLoadCheck}>
                + From Load Check
              </button>
            )}
            {draft.loads.length < WEEK_MAX_LOADS && (
              <button type="button" class="mini primary" data-myweek-add-load="1" onClick={addLoad}>
                + Add load
              </button>
            )}
          </div>
        </div>

        {/* Stale / past-due load guardrail (Section F.1) */}
        {res.staleLoads.map((st) => (
          <div key={st.load.id} class="mw-stale-card" data-myweek-stale={st.load.id}>
            <span><b>{st.displayName} passed</b> ({st.apptText}) — excluded until confirmed.</span>
            <div class="row" style="gap:6px">
              <button type="button" class="mini" onClick={() => updateLoad(st.load.id, { done: true })}>Mark done</button>
              <button type="button" class="mini" onClick={() => openLoadApptPicker(st.load)}>Move appt</button>
            </div>
          </div>
        ))}

        {/* Active chained load cards */}
        {shownStrat.loads.map((o) => {
          const isOpen = expandedId === o.id;
          const isMore = moreOpenId === o.id;
          const rawIdx = draft.loads.findIndex((x) => x.id === o.id);
          return (
            <div
              key={o.id}
              class={`mw-load-card tone-${o.statusTone}`}
              data-myweek-load-card={o.id}
              data-myweek-gate={String(o.midnightGateMinutes)}
              data-myweek-cycle-after={String(o.cycleRemainingAfter)}
              data-myweek-split={o.usedSplit ? (o.splitKind ?? 'split') : 'none'}
            >
              <button
                type="button"
                class="mw-load-head"
                aria-expanded={isOpen}
                onClick={() => setExpandedId(isOpen ? null : o.id)}
              >
                <span>
                  <b>{o.displayName}</b>{' '}
                  <span class="muted small mono">
                    {o.load.distanceMode === 'miles' ? `${o.load.miles} mi` : dur(o.loadedDriveMinutes)}
                    {o.load.deadheadMiles > 0 ? ` (+${o.load.deadheadMiles} DH)` : ''}
                  </span>
                </span>
                <span class={`mw-load-badge tone-${o.statusTone}`}>{o.statusBadge}</span>
              </button>

              {/* At-a-glance chained timetable */}
              <div class="mw-load-grid">
                <div class="mw-load-cell">
                  <span>Roll out</span>
                  <b class="mono">{o.rollOut.homeShort}</b>
                  {o.midnightGateMinutes > 0 && (
                    <small>
                      {o.midnightGateKind === 'restart34'
                        ? `34h restart wait +${dur(o.midnightGateMinutes)}`
                        : `Gated +${dur(o.midnightGateMinutes)} for ${res.dayStartWord}`}
                    </small>
                  )}
                </div>
                <div class="mw-load-cell">
                  <span>{o.appointment ? 'Arrival vs Appt' : 'Arrival'}</span>
                  <b class="mono">{o.arrival.apptShort}</b>
                  {!o.sameZone && <small class="mono">{o.arrival.homeShort} home</small>}
                  {o.appointment && (
                    <small>
                      Appt {o.appointment.apptShort}
                      {o.apptSlackMinutes !== null
                        ? (o.apptSlackMinutes >= 0 ? ` (${dur(o.apptSlackMinutes)} early)` : ` (${dur(Math.abs(o.apptSlackMinutes))} late)`)
                        : ''}
                    </small>
                  )}
                </div>
                <div class="mw-load-cell">
                  <span>PTA &amp; rest</span>
                  <b class="mono">{o.pta.apptShort}</b>
                  <small>
                    {o.dockMinutes > 0 ? `${dur(o.dockMinutes)} ${o.dockOff ? 'OFF' : 'ON'} dock` : '0m dock'}
                    {o.ptaInSweetSpot ? ' · sweet spot' : ''}
                  </small>
                </div>
                <div class="mw-load-cell">
                  <span>Cycle left after</span>
                  <b class="mono">{dur(o.cycleRemainingAfter)}</b>
                  {o.index < shownStrat.loads.length - 1 && !o.usedSplit && (
                    <small>10h break ends {o.restAfterEnd.homeHM}</small>
                  )}
                </div>
              </div>

              {o.splitCallout && (
                <p class="mw-note" style="margin:0"><b>{o.splitCallout}</b></p>
              )}

              {/* Expanded inline editor + 1-tap drill-downs */}
              {isOpen && (
                <div class="mw-load-edit" data-myweek-load-edit={o.id}>
                  <div class="mw-field-row">
                    <label class="small muted">
                      Load tag (optional)
                      <input
                        type="text"
                        maxLength={40}
                        placeholder={`Load ${o.index + 1} (e.g. Chi → Nash)`}
                        value={o.load.label}
                        onInput={(e) => updateLoad(o.id, { label: (e.target as HTMLInputElement).value })}
                      />
                    </label>
                  </div>

                  {/* Run length: Miles vs Direct hours */}
                  <div class="mw-field-row">
                    <div class="mw-field-head">
                      <span class="small muted">Run length</span>
                      <div class="toggle">
                        <button
                          type="button"
                          class={o.load.distanceMode === 'miles' ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { distanceMode: 'miles' })}
                        >Miles</button>
                        <button
                          type="button"
                          class={o.load.distanceMode === 'hours' ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { distanceMode: 'hours' })}
                        >Hours</button>
                      </div>
                    </div>
                    {o.load.distanceMode === 'miles' ? (
                      <>
                        <div class="rollout-chips">
                          {WEEK_MILES_PRESETS.map((m) => (
                            <button
                              key={m}
                              type="button"
                              class={o.load.miles === m ? 'on' : undefined}
                              onClick={() => updateLoad(o.id, { miles: m })}
                            >{m} mi</button>
                          ))}
                        </div>
                        <div class="qs-row">
                          <span class="small muted">Exact miles</span>
                          <input
                            type="number"
                            class="num"
                            inputMode="numeric"
                            min={1}
                            max={3000}
                            value={o.load.miles}
                            aria-label="Load miles"
                            onInput={(e) => {
                              const v = Number((e.target as HTMLInputElement).value);
                              if (Number.isFinite(v) && v >= 1) updateLoad(o.id, { miles: Math.min(3000, Math.round(v)) });
                            }}
                          />
                        </div>
                      </>
                    ) : (
                      <MyWeekDurRow
                        label="Drive time"
                        value={o.load.driveMinutes}
                        min={15}
                        max={1800}
                        onChange={(v) => updateLoad(o.id, { driveMinutes: v })}
                      />
                    )}
                  </div>

                  {/* Hard appointment (ClockPick + facility timezone) */}
                  <div class="mw-field-row">
                    <div class="mw-field-head">
                      <span class="small muted">Hard appointment</span>
                      <div class="toggle">
                        <button
                          type="button"
                          class={!o.load.hasAppt ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { hasAppt: false })}
                        >None</button>
                        <button
                          type="button"
                          class={o.load.hasAppt ? 'on' : undefined}
                          onClick={() => {
                            if (!o.load.apptDate) openLoadApptPicker(o.load);
                            else updateLoad(o.id, { hasAppt: true });
                          }}
                        >Set appt</button>
                      </div>
                    </div>
                    {o.load.hasAppt && (
                      <>
                        <button
                          type="button"
                          class="rowbtn"
                          data-myweek-appt-btn={o.id}
                          onClick={() => openLoadApptPicker(o.load)}
                        >
                          <span>
                            Appt: <b class="mono">{o.appointment ? o.appointment.apptShort : `${o.load.apptDate} ${o.load.apptTime}`}</b>
                          </span>
                          <span class="muted small">Change ›</span>
                        </button>
                        <label class="small muted">
                          Facility time zone
                          <select
                            value={o.apptTimeZone}
                            onChange={(e) => updateLoad(o.id, { apptTimeZone: (e.target as HTMLSelectElement).value })}
                          >
                            {zoneChoices.map((z) => (
                              <option key={z} value={z}>{zoneLabel(z) ?? z}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>

                  {/* Dock / unload dwell */}
                  <div class="mw-field-row">
                    <div class="mw-field-head">
                      <span class="small muted">Dock / unload</span>
                      <div class="toggle">
                        <button
                          type="button"
                          class={!o.load.dockOff ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { dockOff: false })}
                        >ON duty</button>
                        <button
                          type="button"
                          class={o.load.dockOff ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { dockOff: true })}
                        >OFF / relieved</button>
                      </div>
                    </div>
                    <div class="rollout-chips">
                      {WEEK_DOCK_PRESETS.map((p) => (
                        <button
                          key={p.minutes}
                          type="button"
                          class={o.load.dockMinutes === p.minutes ? 'on' : undefined}
                          onClick={() => updateLoad(o.id, { dockMinutes: p.minutes })}
                        >{p.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Collapsed G6 fields: deadhead, pickup dwell, per-load pre-trip/buffer/mph */}
                  <div>
                    <button
                      type="button"
                      class="link"
                      style="padding:0;min-height:36px"
                      onClick={() => setMoreOpenId(isMore ? null : o.id)}
                    >
                      {isMore ? 'Hide deadhead & overrides' : 'Deadhead, pickup dwell & overrides'} <Icon d={isMore ? I.up : I.down} size={16} />
                    </button>
                    {isMore && (
                      <div class="mw-load-edit" style="margin-top:6px">
                        <div class="qs-row">
                          <span class="small muted">Deadhead miles</span>
                          <input
                            type="number"
                            class="num"
                            inputMode="numeric"
                            min={0}
                            max={1000}
                            value={o.load.deadheadMiles}
                            aria-label="Deadhead miles"
                            onInput={(e) => {
                              const v = Number((e.target as HTMLInputElement).value);
                              if (Number.isFinite(v) && v >= 0) updateLoad(o.id, { deadheadMiles: Math.min(1000, Math.round(v)) });
                            }}
                          />
                        </div>
                        <MyWeekDurRow
                          label="Pickup dwell"
                          value={o.load.pickupDwellMinutes}
                          min={0}
                          max={480}
                          onChange={(v) => updateLoad(o.id, { pickupDwellMinutes: v })}
                        />
                        <div class="mw-field-row">
                          <span class="small muted">Pre-trip ({dur(o.preTripMinutes)})</span>
                          <div class="rollout-chips">
                            {PRETRIP_PRESETS.map((m) => (
                              <button
                                key={m}
                                type="button"
                                class={o.preTripMinutes === m ? 'on' : undefined}
                                onClick={() => updateLoad(o.id, { preTripMinutes: m })}
                              >{m}m</button>
                            ))}
                          </div>
                        </div>
                        <div class="mw-field-row">
                          <span class="small muted">Arrival buffer ({dur(o.bufferMinutes)})</span>
                          <div class="rollout-chips">
                            {BUFFER_PRESETS.map((m) => (
                              <button
                                key={m}
                                type="button"
                                class={o.bufferMinutes === m ? 'on' : undefined}
                                onClick={() => updateLoad(o.id, { bufferMinutes: m })}
                              >{m}m</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Two 1-tap drill-down buttons (G7 parameter handoff; M3 hides Rescue when allowSplits=false) */}
                  <div class="mw-drill-row">
                    <button
                      type="button"
                      data-myweek-drill-rollout={o.id}
                      onClick={() => drillRollout(o)}
                    >
                      Open When to Roll &amp; PTA
                    </button>
                    {draft.allowSplits && (
                      <button
                        type="button"
                        data-myweek-drill-rescue={o.id}
                        onClick={() => drillRescue(o)}
                      >
                        Dock delayed? Open Rescue
                      </button>
                    )}
                  </div>

                  {/* Reorder / remove */}
                  <div class="row" style="justify-content:space-between">
                    <div class="row" style="gap:6px">
                      <button type="button" class="mini" disabled={rawIdx <= 0} onClick={() => moveLoad(rawIdx, -1)}>↑ Up</button>
                      <button type="button" class="mini" disabled={rawIdx < 0 || rawIdx >= draft.loads.length - 1} onClick={() => moveLoad(rawIdx, 1)}>↓ Down</button>
                    </div>
                    <button type="button" class="mini danger" onClick={() => removeLoad(o.id)}>Remove load</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Open nights filled by usual nightly shift */}
        {shownStrat.openNights.map((n) => (
          <div key={`open-${n.label}-${n.index}`} class="mw-open-night" data-myweek-open-night={n.label}>
            <span>
              <b>Open night · {n.shortLabel}</b>{' '}
              <span class="muted small">({n.shiftStart.homeHM} · {dur(n.usableMinutes)}/{dur(n.plannedMinutes)})</span>
            </span>
            <span class="mono small">
              {n.dropsOffMinutes > 0 ? `+${dur(n.dropsOffMinutes)} back · ` : ''}
              {n.pinched ? `Short ${dur(n.shortfallMinutes)}` : `${dur(n.availAfterMinutes)} left`}
            </span>
          </div>
        ))}
      </div>

      {/* 5. HOME TIME & WEEK PREFERENCES (PERSISTED IN store.ts) */}
      <Card title="Home time &amp; week rules">
        <div class="miles-inputs">
          {/* Home-time target */}
          <div class="miles-section">
            <div class="miles-section-head">
              <span class="stat-label">Home-time target</span>
              <div class="toggle">
                <button
                  type="button"
                  class={!draft.homeTarget ? 'on' : undefined}
                  onClick={() => updatePlan((p) => ({ ...p, homeTarget: null }))}
                >None</button>
                <button
                  type="button"
                  class={draft.homeTarget ? 'on' : undefined}
                  data-myweek-home-enable="1"
                  onClick={openHomeTargetPicker}
                >{draft.homeTarget ? 'Set' : 'Set target'}</button>
              </div>
            </div>
            {draft.homeTarget && (
              <button
                type="button"
                class="rowbtn"
                data-myweek-home-btn="1"
                onClick={openHomeTargetPicker}
              >
                <span>
                  Home by: <b class="mono">{shownStrat.homeCheck ? shownStrat.homeCheck.target.homeShort : `${draft.homeTarget.date} ${draft.homeTarget.time}`}</b>
                </span>
                <span class="muted small">Change ›</span>
              </button>
            )}
          </div>

          {/* Sleeper splits allowed toggle (G4) */}
          <div class="miles-section">
            <div class="miles-section-head">
              <span class="stat-label">Sleeper splits</span>
              <div class="toggle" data-myweek-splits-toggle="1">
                <button
                  type="button"
                  class={draft.allowSplits ? 'on' : undefined}
                  aria-pressed={draft.allowSplits}
                  data-myweek-splits-yes="1"
                  onClick={() => updatePlan((p) => ({ ...p, allowSplits: true }))}
                >Allowed (7/3 &amp; 8/2)</button>
                <button
                  type="button"
                  class={!draft.allowSplits ? 'on' : undefined}
                  aria-pressed={!draft.allowSplits}
                  data-myweek-splits-no="1"
                  onClick={() => updatePlan((p) => ({ ...p, allowSplits: false }))}
                >Straight 10s only</button>
              </div>
            </div>
            <p class="muted small" style="margin:0">
              {draft.allowSplits
                ? 'Tests 7/3 and 8/2 splits on tight handoffs — and flags Next-Shift Traps on the following load.'
                : 'Splits suppressed — only full 10-hour resets and 34-hour restarts are recommended.'}
            </p>
          </div>

          {/* Fill open nights toggle */}
          <div class="miles-section">
            <div class="miles-section-head">
              <span class="stat-label">Fill open nights with usual shift</span>
              <div class="toggle">
                <button
                  type="button"
                  class={draft.fillOpenNights ? 'on' : undefined}
                  onClick={() => updatePlan((p) => ({ ...p, fillOpenNights: true }))}
                >On</button>
                <button
                  type="button"
                  class={!draft.fillOpenNights ? 'on' : undefined}
                  onClick={() => updatePlan((p) => ({ ...p, fillOpenNights: false }))}
                >Off</button>
              </div>
            </div>
            {draft.fillOpenNights && (
              <>
                <button
                  type="button"
                  class="rowbtn"
                  data-myweek-usual-start-btn="1"
                  onClick={openUsualStartPicker}
                >
                  <span>
                    Usual shift start: <b class="mono">{fmtWallHM(draft.usualShiftStartMinutes)}</b>{' '}
                    <span class="muted small">({res.homeZoneName})</span>
                  </span>
                  <span class="muted small">Change ›</span>
                </button>
                <div class="rollout-chips">
                  {WEEK_USUAL_BUDGET_PRESETS.map((p) => (
                    <button
                      key={p.minutes}
                      type="button"
                      class={draft.usualShiftBudgetMinutes === p.minutes ? 'on' : undefined}
                      onClick={() => updatePlan((d) => ({ ...d, usualShiftBudgetMinutes: p.minutes }))}
                    >{p.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Collapsed defaults */}
          <div class="miles-section">
            <div class="row" style="justify-content:space-between">
              <button type="button" class="link" style="padding:0;min-height:36px" onClick={() => setPrefsMore(!prefsMore)}>
                {prefsMore ? 'Hide default pre-trip & buffer' : `Defaults: ${draft.defaultPreTripMinutes}m pre-trip · ${draft.defaultBufferMinutes}m buffer`} <Icon d={prefsMore ? I.up : I.down} size={16} />
              </button>
              {draft.loads.length > 0 && (
                <button
                  type="button"
                  class="mini"
                  onClick={() => updatePlan((p) => ({ ...p, loads: [], homeTarget: null }))}
                >Clear week</button>
              )}
            </div>
            {prefsMore && (
              <div class="mw-load-edit" style="border-top:0;padding-top:4px">
                <div class="mw-field-row">
                  <span class="small muted">Default pre-trip</span>
                  <div class="rollout-chips">
                    {PRETRIP_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        class={draft.defaultPreTripMinutes === m ? 'on' : undefined}
                        onClick={() => updatePlan((p) => ({ ...p, defaultPreTripMinutes: m }))}
                      >{m}m</button>
                    ))}
                  </div>
                </div>
                <div class="mw-field-row">
                  <span class="small muted">Default arrival buffer</span>
                  <div class="rollout-chips">
                    {BUFFER_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        class={draft.defaultBufferMinutes === m ? 'on' : undefined}
                        onClick={() => updatePlan((p) => ({ ...p, defaultBufferMinutes: m }))}
                      >{m}m</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 6. BOTTOM ACTION — COPYABLE DISPATCH SUMMARY (M5: always applied plan, never unapplied preview) */}
      {baseRes.activeLoadCount > 0 && (
        <Card title="Dispatch summary">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="primary" data-myweek-copy-btn="1" onClick={copyDispatch}>
              Copy week summary for dispatch
            </button>
            <button type="button" class="mini" onClick={() => setShowDispatch(!showDispatch)}>
              {showDispatch ? 'Hide text' : 'Preview text'}
            </button>
            {copyNote && <span class="small ok">{copyNote}</span>}
          </div>
          {showDispatch && (
            <pre class="mw-dispatch-pre mono" style="margin-top:8px">{baseRes.dispatchText}</pre>
          )}
        </Card>
      )}
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="myweek" />
    </>
  );
}

/* ============================================================ Your last 8 days */

/**
 * The last 8 carrier days as logged — a mirror, not a record (patch 7.2). Read-only by design:
 * no edit, delete or add controls anywhere on this screen, and nothing here writes state. It is
 * for the driver's own review; roadside proof of duty status is the ELD's job, and this view
 * never presents itself as that — planned (what-if) time is excluded entirely, and time no entry
 * covers reads "Not logged" rather than being quietly filled in as rest. The day math lives in
 * the store (historyDays); this component only lays it out, newest day first.
 */
function HistoryTab({ s, now }: { s: State; now: number }) {
  const foot = <p class="muted small">For your own review — your ELD holds the official record. Planned (what-if) time isn't shown here; only what you logged.</p>;
  if (historyBasis(s, now) === 'fresh') {
    return (
      <>
        <BackToPlan s={s} />
        <h1 class="screen-title">Your last 8 days</h1>
        <Card>
          <p>Nothing logged yet — this fills in as you enter your real day.</p>
          {foot}
        </Card>
      </>
    );
  }
  const days = historyDays(s, now).slice().reverse();
  // Each day's honoured day-close bookmark (patch 13), through the store's one validity rule —
  // the same rule the Now screen's closed state uses, so the two can never disagree. The
  // bookmark is a label on the day only: totals, gaps and the "Not logged" reading above are
  // computed exactly as before and never see it.
  const closes = new Map(days.map((d) => [d.start, dayCloseFor(s, d.start)]));
  // A week-strip tap (capstone C3, M8) opens this screen at its day: read once, then forgotten.
  const [focus] = useState(() => { const f = historyFocus; historyFocus = null; return f; });
  useEffect(() => { if (focus !== null) document.querySelector('.hist-focus')?.scrollIntoView?.({ block: 'start' }); }, []);
  return (
    <>
      <BackToPlan s={s} />
      <h1 class="screen-title">Your last 8 days</h1>
      <p class="muted small">What you logged, day by day, on your carrier's clock — days roll at {formatDayStartHM(s.config)} {s.config.timeZone}, and the times below read in your device zone ({deviceTz}), like everywhere else in the app.</p>
      {days.map((d) => {
        const card = (
        <Card key={d.start} title={d.isToday ? `Today — ${d.label}` : d.label}>
          <p class="small">Driving <b>{dur(d.totals.D)}</b> · On duty <b>{dur(d.totals.ON)}</b> · Off duty <b>{dur(d.totals.OFF)}</b> · Sleeper <b>{dur(d.totals.SB)}</b>{d.notLogged > 0 && <> · Not logged <b>{dur(d.notLogged)}</b></>}</p>
          {closes.get(d.start) && <p class="small">Day closed {clock(closes.get(d.start)!.at, false)}</p>}
          <ul class="seglist">{d.items.map((it, i) => it.status === null ? (
            <li key={i}><span /><span class="muted">Not logged</span><span class="muted">{clock(it.start)} → {clock(it.end)} · {dur(it.end - it.start)}</span></li>
          ) : (
            <li key={i}><span class="dot" style={{ background: STATUS_COLOR[it.status] }} /><span>{segLabel(it.status, it.note)}</span><span class="muted">{clock(it.start)} → {clock(it.end)} · {dur(it.end - it.start)}</span></li>
          ))}</ul>
        </Card>
        );
        return d.start === focus ? <div key={d.start} class="hist-focus">{card}</div> : card;
      })}
      {foot}
    </>
  );
}

/* ============================================================ Can I take this load? */

/**
 * Redesign 4/5: the load check as three questions, one per screen, then a plain answer. It lived as a
 * card at the bottom of Recap, with two sliders; at the dock, with a dispatcher waiting, the driver
 * wants the question asked and the answer given. Every answer is kept (the store), so leaving and
 * coming back changes nothing — the one deliberate clear is the answer screen's "Check another
 * load" (patch 7.1), which resets the draft to the defaults and starts the questions over.
 */
/* ---------- dispatch mode (capstone C3, audit §3 M7 + the load side of M4) ---------- */

/** The furthest a typed departure may sit from now: the draft's own bound (sanitizeLoadCheck). */
export const LOAD_LEAVE_MAX_MIN = 1440;
/** The furthest ahead an appointment may be typed. */
export const LOAD_APPT_MAX_MIN = 14 * 1440;
/** Why a picked time can't be used, or null. */
export function loadTimeProblem(field: 'leave' | 'appt', at: number, now: number): string | null {
  if (at <= now) return 'Pick a time after now.';
  if (field === 'leave' && at - now > LOAD_LEAVE_MAX_MIN) return 'Up to 24 hours from now. For a later start, use Plan a run.';
  if (field === 'appt' && at - now > LOAD_APPT_MAX_MIN) return 'Up to two weeks ahead.';
  return null;
}
/**
 * The appointment line (C6-A: wheels stop at the receiver vs the appointment). Display
 * subtraction of an engine time (the winning plan's `driveEnd`) and a typed time — no rule
 * math. On time includes the boundary: wheels stop at the appointment minute is "0m to spare".
 */
export function apptLine(appt: number, driveEnd: number): { onTime: boolean; text: string } {
  return driveEnd <= appt
    ? { onTime: true, text: `On time — ${dur(appt - driveEnd)} to spare` }
    : { onTime: false, text: `Late by ${dur(driveEnd - appt)} — earliest arrival ${clockFull(driveEnd)}` };
}
/**
 * [Text dispatch] (M7): built only from what the answer card shows — plan times, never a
 * logged row, never a place or mile marker — and always ending on the planning disclaimer.
 * The "Leave by" clause appears only when the leave-by search returned a time.
 */
export function dispatchText(o: { latest: number | null; driveEnd: number; appt: number | null; mph: number }): string {
  const parts = ['Can take it.'];
  if (o.latest !== null) parts.push(`Leave by ${clockFull(o.latest)} at the latest.`);
  parts.push(`Wheels stop ${clockFull(o.driveEnd)}.`);
  if (o.appt !== null) {
    const a = apptLine(o.appt, o.driveEnd);
    parts.push(a.onTime ? `On time for the ${clockFull(o.appt)} appointment — ${dur(o.appt - o.driveEnd)} to spare.` : `Late for the ${clockFull(o.appt)} appointment by ${dur(o.driveEnd - o.appt)}.`);
  }
  parts.push(`Planning estimate at ${o.mph} mph — my ELD governs.`);
  return parts.join(' ');
}
/**
 * The No verdict's fix (M4, load side): the "+{fix} off duty before you leave" line gains
 * [Plan it: leave at …], which sets the draft departure there and the wait to off duty — the
 * exact input the fix line was judged on. Offered only where the draft can say that: leaving
 * now, or a wait already planned off duty. A wait planned ON duty followed by the extra rest
 * is two statuses, which the draft's one wait flag cannot hold — there the line stays, without
 * the button, rather than claim rest the driver did not plan.
 */
export function loadFixFor(lc: LoadCheckDraft, now: number, fix: { minutes: number } | null): { leaveIn: number; label: string } | null {
  if (!fix || fix.minutes <= 0) return null;
  if (lc.leaveIn > 0 && !lc.waitOff) return null;
  const leaveIn = lc.leaveIn + fix.minutes;
  if (leaveIn > LOAD_LEAVE_MAX_MIN) return null;
  return { leaveIn, label: `Plan it: leave at ${clock(now + leaveIn)}` };
}
/** The next whole hour after `min`, on the phone's clock. */
const nextHour = (min: number): number => { const d = new Date(min * 60000); d.setMinutes(60, 0, 0); return Math.floor(d.getTime() / 60000); };
/** A6 (taste): round `min` up to the whole hour on the phone's clock (exact hour stays on that hour). */
export function ceilHour(min: number): number {
  const d = new Date(min * 60000);
  if (d.getMinutes() > 0 || d.getSeconds() > 0 || d.getMilliseconds() > 0) d.setHours(d.getHours() + 1, 0, 0, 0);
  else d.setMinutes(0, 0, 0);
  return Math.floor(d.getTime() / 60000);
}
/** A6 (taste): middle of the [250, 400, 550, 700, 900] presets (replaces untouched store default 1200 mi on fresh records; store.ts stays frozen). */
export const LOAD_DEFAULT_MILES = 550;
export const FRESH_LOADCHECK: LoadCheckDraft = { ...DEFAULT_LOADCHECK, miles: LOAD_DEFAULT_MILES };
function isStockLoadCheck(lc: LoadCheckDraft): boolean {
  return !lc.answered && lc.miles === DEFAULT_LOADCHECK.miles && lc.dwell === DEFAULT_LOADCHECK.dwell
    && lc.dwellOff === DEFAULT_LOADCHECK.dwellOff && lc.leaveIn === DEFAULT_LOADCHECK.leaveIn
    && lc.waitOff === DEFAULT_LOADCHECK.waitOff && lc.appt === undefined;
}
/**
 * A6 (taste): default appointment time for the load-check picker — the computed arrival time
 * (winning strategy's wheels-stop `driveEnd`) rounded up to the next whole hour, clamped to
 * the picker's valid future range so it never opens on an impossible past time.
 */
export function defaultApptTime(s: State, now: number): number {
  const lc = isStockLoadCheck(s.loadCheck) ? FRESH_LOADCHECK : s.loadCheck;
  const departure = now + lc.leaveIn;
  const loadSegs = allSegments(s, now).filter((x) => !x.tentative);
  const input: TripInput = {
    departure, distanceMiles: lc.miles, mph: s.mph, stops: [], config: safeRulesConfig(s.config),
    ...(lc.leaveIn > 0 ? { untilDeparture: { from: now, status: lc.waitOff ? 'OFF' as DutyStatus : 'ON' as DutyStatus, label: `${lc.waitOff ? 'Off duty' : 'On duty'} until departure` } } : {}),
  };
  const both = planTripAll(loadSegs, input);
  const arrive = both[earliestStrategy(both)].driveEnd;
  const rounded = ceilHour(Math.max(arrive, now + 1));
  return Math.min(now + LOAD_APPT_MAX_MIN, Math.max(nextHour(now), rounded));
}

/** The load check's big clock: the Log editor's when-keys, for a departure or an appointment. */
function LoadTimeSheet({ s, now, field, closing = false }: { s: State; now: number; field: 'leave' | 'appt'; closing?: boolean }) {
  const lc = s.loadCheck;
  const start = field === 'leave'
    ? (lc.leaveIn > 0 ? now + lc.leaveIn : nextHour(now))
    : (lc.appt != null && lc.appt > now ? lc.appt : defaultApptTime(s, now));
  const [at, setAt] = useState<number>(start);
  const problem = loadTimeProblem(field, at, now);
  const apply = () => {
    if (problem) return;
    editLoadDraft(field === 'leave' ? { leaveIn: at - now } : { appt: at });
    openSheet(null);
  };
  return (
    <Sheet title={field === 'leave' ? 'When will you leave?' : 'Appointment at the receiver'} closing={closing}>
      {/* Patch L1 item 3: the one shared clock picker (the day buttons stop at three days out, as before: no another-day). */}
      <ClockPick at={at} set={setAt} now={now} future={true} say={field === 'leave' ? 'Leave at' : 'Appointment at'} name={field === 'leave' ? 'Leave time' : 'Appointment time'} keys={KEYS_HOURS} anyDay={false} />
      {problem && <div class="warnbox small">{problem}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={apply}>{field === 'leave' ? `Leave at ${clock(at)}` : `Appointment ${clockFull(at)}`}</button>
    </Sheet>
  );
}

/** Gemini round, item I: why a typed load distance can't be used, or null when it can (1–3000 whole-ish miles). */
export function loadMilesProblem(text: string): string | null {
  const t = text.trim();
  if (t === '') return 'Type how many miles — at least 1.';
  const n = Number(t);
  if (!Number.isFinite(n)) return 'That isn’t a number of miles.';
  if (Math.round(n) < 1) return 'Miles must be at least 1.';
  if (Math.round(n) > 3000) return 'This check goes up to 3000 miles.';
  return null;
}

function LoadTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  // A6 (taste): on an untouched fresh stock draft (store.ts DEFAULT_LOADCHECK = 1200 mi), start
  // on the middle preset (550 mi) instead — same on-mount normalization pattern as D14's SplitTab,
  // keeping store.ts untouched. Once the driver edits anything, their typed value (even 1200) stands.
  const initStock = useRef(isStockLoadCheck(s.loadCheck));
  useEffect(() => {
    if (isStockLoadCheck(getState().loadCheck)) {
      initStock.current = false;
      setState({ loadCheck: { ...FRESH_LOADCHECK } });
    }
  }, []);
  const lc = initStock.current && isStockLoadCheck(s.loadCheck) ? FRESH_LOADCHECK : s.loadCheck;
  // A draft saved before C3 has no `appt` field in memory until the next parse: read it as none.
  const appt = lc.appt ?? null;
  const setLoad = (p: Partial<LoadCheckDraft>) => { initStock.current = false; editLoadDraft(p); };
  const draftUndo = loadDraftUndoPending();
  // A6 (taste): steps 1 Distance, 2 Leave, 3 Appointment (optional), 4 Receiver dwell, 5 Answer.
  const [step, setStep] = useState(lc.answered ? 5 : 1);
  // Inner wizard step dissolve: fires only on step changes after mount (never on initial room open).
  const prevStepRef = useRef(step);
  const stepEpochRef = useRef(0);
  const activeStepRef = useRef(0);
  const [, setStepDone] = useState(0);
  if (prevStepRef.current !== step) {
    prevStepRef.current = step;
    activeStepRef.current = prefersReducedMotion() ? 0 : ++stepEpochRef.current;
  }
  const stepSwap = !prefersReducedMotion() && activeStepRef.current > 0;
  useEffect(() => {
    const epoch = activeStepRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeStepRef.current = 0;
      setStepDone((n) => n + 1);
      return;
    }
    const t = setTimeout(() => {
      if (activeStepRef.current === epoch) {
        activeStepRef.current = 0;
        setStepDone((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [step]);
  // Gemini round, item I: the typed miles as typed. A value the check cannot use (empty, 0,
  // negative, not a number, past 3000) used to be dropped silently — the box kept showing
  // "-100" while the check ran on the old distance after Next. Now the box keeps what
  // was typed, says why it can't be used, and Next waits for a usable distance.
  const [milesText, setMilesText] = useState<string | null>(null);
  const milesProblem = milesText === null ? null : loadMilesProblem(milesText);
  // each question is its own screen: start it at the top, not wherever the last Next button was
  useEffect(() => { window.scrollTo(0, 0); document.querySelector('.app')?.scrollTo?.(0, 0); document.querySelector('.page.plan-room.is-active, .pages .page.is-active')?.scrollTo?.(0, 0); }, [step]);
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const hist = customClocks ? 'known' : cycleBasis(s, now, ev.cycle.windowDays);
  const departure = now + lc.leaveIn;
  const loadSegs = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : allSegments(s, now).filter((x) => !x.tentative)),
    [s, now, customClocks],
  );
  const loadInput: TripInput = {
    departure, distanceMiles: lc.miles, mph: s.mph,
    stops: lc.dwell ? [{ atMile: lc.miles, minutes: lc.dwell, status: lc.dwellOff ? 'OFF' : 'ON', label: 'Receiver' }] : [],
    config: s.config,
    // Waiting to leave is not rest unless he says so: shown as an assumed row, never an unlogged gap.
    ...(lc.leaveIn > 0 ? { untilDeparture: { from: now, status: lc.waitOff ? 'OFF' as DutyStatus : 'ON' as DutyStatus, label: `${lc.waitOff ? 'Off duty' : 'On duty'} until departure` } } : {}),
  };
  const both = useMemo(() => planTripAll(loadSegs, loadInput), [loadSegs, s.mph, s.config, now, lc.miles, lc.dwell, lc.dwellOff, lc.leaveIn, lc.waitOff]);
  const strategyKey = earliestStrategy(both);
  const best = both[strategyKey];
  // Patch 10: the verdict's two follow-up answers, computed with the same simulation on shifted
  // inputs (later departures / added pre-departure rest) — display only, nothing is written.
  // Only the answer screen pays for the searches; the question screens return null at once.
  const advice = useMemo(() => {
    if (step !== 5) return null;
    // When the planner itself gave up (its iteration limit), its plan is not a basis for advice:
    // neither search runs, and the no-fix line stays off — the plan's own warning already shows.
    if (best.warnings.some((w) => w.includes('iteration limit'))) return { latest: null, fix: null, fixSearched: false };
    if (best.feasible) {
      // The wait before a later departure is the wait the driver described; for a leave-now
      // check it is the status he is in (on duty if he is driving — the careful side).
      const waitStatus: DutyStatus = lc.leaveIn > 0 ? (lc.waitOff ? 'OFF' : 'ON') : (s.current && s.current.status !== 'D' ? s.current.status : 'ON');
      return { latest: latestLegalDeparture(loadSegs, loadInput, earliestStrategy(both), waitStatus), fix: null, fixSearched: false };
    }
    return { latest: null, fix: smallestRestFix(loadSegs, loadInput), fixSearched: true };
  }, [step, both]);
  // The verdict treats unlogged gaps as off duty. When a hole is big enough to change the answer,
  // say so rather than printing a confident LEGAL on an assumption nobody made (stress-test 2.5).
  const openGaps = meaningfulGaps(ev.gaps);
  const provisional = openGaps.length > 0;
  const leaveWord = lc.leaveIn ? `in ${dur(lc.leaveIn)}` : 'now';
  const loadFix = step === 5 && !best.feasible ? loadFixFor(lc, now, advice?.fix ?? null) : null;
  // [Text dispatch] (M7): the patch-4 share mechanics — the share sheet, else the clipboard; a
  // cancelled share sheet is the driver's choice and never falls back to a copy.
  const dispatch = useShareButton(dispatchText({ latest: advice?.latest ?? null, driveEnd: best.driveEnd, appt, mph: s.mph }), 'Text dispatch');
  // Back out of the flow returns to wherever the driver entered it from (patch 7.1): Now, the
  // Plan hub, or Recap — not always Plan, which is where it landed before. The label names it.
  const returnLabel = s.planReturn === 'now' ? 'Now' : s.planReturn === 'recap' ? 'Recap' : 'Plan';
  // A6 (taste): consistent sibling presentation with Log add's StepCount ("Step N of 4" under the bar).
  // Step 3 (Appointment) is optional and its bar segment carries the hollow-dashed .opt styling.
  const FLOW_SCREENS = 4;
  const head = (n: number) => (
    <>
      <div class="flow-head">
        <button class="back flow-back" aria-label={n === 1 ? `Back to ${returnLabel}` : 'Previous question'} onClick={() => (n === 1 ? setState({ tab: s.planReturn }) : setStep(n - 1))}><Icon d={I.back} /><b>Can I take this load?</b></button>
      </div>
      <StepCount at={n} of={FLOW_SCREENS} label={n === 3 ? 'Optional' : undefined} optAt={3} barClass="flow-dots" />
    </>
  );
  const next = (n: number, label: string, blocked = false) => <button class="primary wide flow-next" disabled={blocked} onClick={() => { if (blocked) return; if (n === 4) setLoad({ answered: true }); setStep(n + 1); }}>{label} <Icon d={I.next} /></button>;
  const chips = <T,>(opts: [T, string][], value: T, set: (v: T) => void) => (
    <div class="chips">{opts.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => set(v)}>{l}</button>)}</div>
  );

  if (step === 1) {
    return (
      <>
        {head(1)}
        <div key="s1" class={stepSwap ? 'flow-body step-dissolve' : 'flow-body'}>
        <h1 class="flow-q">How far is the load?</h1>
        <p class="muted">Miles from here to the receiver.</p>
        <div class="bignum"><b>{lc.miles}</b> mi</div>
        <div class="steps4">{[-50, -10, 10, 50].map((d) => <button key={d} aria-label={`${d > 0 ? 'Add' : 'Take off'} ${Math.abs(d)} miles`} onClick={() => { setMilesText(null); setLoad({ miles: Math.min(3000, Math.max(1, lc.miles + d)) }); }}>{d > 0 ? `+${d}` : `−${-d}`}</button>)}</div>
        <label>Or type the miles<input type="number" inputMode="numeric" min={1} max={3000} step={1} required aria-invalid={milesProblem ? 'true' : undefined} aria-describedby={milesProblem ? 'miles-problem' : undefined} value={milesText ?? String(lc.miles)} onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (loadMilesProblem(v)) setMilesText(v); else { setMilesText(null); setLoad({ miles: Math.round(Number(v)) }); } }} /></label>
        {milesProblem && <p class="warnbox small" id="miles-problem" role="alert">{milesProblem}</p>}
        {chips([[250, '250'], [400, '400'], [550, '550'], [700, '700'], [900, '900']] as [number, string][], milesProblem ? NaN : lc.miles, (v) => { setMilesText(null); setLoad({ miles: v }); })}
        {next(1, 'Next: when you leave', !!milesProblem)}
        </div>
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        {head(2)}
        <div key="s2" class={stepSwap ? 'flow-body step-dissolve' : 'flow-body'}>
        <h1 class="flow-q">When will you leave?</h1>
        {chips([[0, 'Now'], [30, 'In 30 min'], [60, 'In 1 hour'], [120, 'In 2 hours']] as [number, string][], lc.leaveIn, (v) => setLoad({ leaveIn: v }))}
        {/* Capstone C3 (M7): a typed departure, past the chips' two hours, on the Log editor's big clock. */}
        <button class={`wide pick-time${[0, 30, 60, 120].includes(lc.leaveIn) ? '' : ' on'}`} onClick={() => openSheet({ kind: 'loadtime', field: 'leave' })}>Pick a time</button>
        {![0, 30, 60, 120].includes(lc.leaveIn) && <p class="small"><b>Leaving at {clock(now + lc.leaveIn)}</b> — in {dur(lc.leaveIn)}.</p>}
        {lc.leaveIn > 0 && (
          <>
            <h3>Until then, you will be</h3>
            {chips([[false, STATUS_LABEL.ON], [true, STATUS_LABEL.OFF]] as [boolean, string][], lc.waitOff, (v) => setLoad({ waitOff: v }))}
            <p class="muted small">{lc.waitOff ? 'Only choose off duty if you really will be: it can count as rest.' : 'On duty earns no rest credit, so the answer can only come out on the careful side.'}</p>
          </>
        )}
        {next(2, 'Next: appointment time')}
        </div>
      </>
    );
  }
  if (step === 3) {
    return (
      <>
        {head(3)}
        <div key="s3" class={stepSwap ? 'flow-body step-dissolve' : 'flow-body'}>
        <h1 class="flow-q">Appointment at the receiver?</h1>
        <p class="muted">With a time, the answer says whether you make it.</p>
        <div class="chips">
          <button class={appt === null ? 'on' : ''} aria-pressed={appt === null} onClick={() => { setLoad({ appt: null }); setStep(4); }}>No appointment</button>
          <button class={appt !== null ? 'on' : ''} aria-pressed={appt !== null} onClick={() => openSheet({ kind: 'loadtime', field: 'appt' })}>Pick a time</button>
        </div>
        {appt !== null && <p class="small"><b>Appointment {clockFull(appt)}</b></p>}
        {next(3, 'Next: time at the receiver')}
        </div>
      </>
    );
  }
  if (step === 4) {
    return (
      <>
        {head(4)}
        <div key="s4" class={stepSwap ? 'flow-body step-dissolve' : 'flow-body'}>
        <h1 class="flow-q">How long at the receiver?</h1>
        {chips([[0, 'None'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']] as [number, string][], lc.dwell, (v) => setLoad({ dwell: v }))}
        <h3>While you are there, you are</h3>
        {chips([[false, 'On duty (unloading)'], [true, 'Off duty (relieved)']] as [boolean, string][], lc.dwellOff, (v) => setLoad({ dwellOff: v }))}
        {next(4, 'Show me the answer')}
        </div>
      </>
    );
  }
  return (
    <>
      <div class="flow-head">
        <button class="back flow-back" aria-label={`Back to ${returnLabel}`} onClick={() => setState({ tab: s.planReturn })}><Icon d={I.back} /><b>Can I take this load?</b></button>
      </div>
      <div key="s5" class={stepSwap ? 'flow-body step-dissolve' : 'flow-body'}>
      <section class={`verdict ${best.feasible ? 'yes' : 'no'}`}>
        <div class="verdict-label">{provisional ? 'Verdict (provisional)' : 'Verdict'}</div>
        {/* A sign, not a slab (patch 16, P1c): the word rides on the card surface with an icon and
            an edge in the verdict colour, so the answer reads in grayscale and colour-blindness
            and stops flooding the cab with light at night — the solid fills measured 157×/87×
            the night background. The words themselves are unchanged. */}
        <div class="verdict-big"><Icon d={best.feasible ? I.check : I.x} size={32} /> {best.feasible ? 'Yes, it’s legal' : 'No — not legal as planned'}</div>
        {/* The Yes names the rest plan it stands on (patch 16, P12): display only — the strategy
            and its plan are the ones already computed above, nothing new is worked out. */}
        {best.feasible && <div class="verdict-plan">{strategyKey === 'split' ? 'using a sleeper split — log the rests exactly as shown' : strategyKey === 'restart34' ? 'using a 34-hour restart' : 'using 10-hour breaks'}</div>}
        {/* D17 (label patch, 2026-11-20): presentation-only relabel; appointment-wait modelling stays held. */}
        <div class="verdict-sub">{best.arrival > best.driveEnd ? `Could be unloaded by (if they take you on arrival) ${clockFull(best.arrival)}` : `There by ${clockFull(best.driveEnd)}`}</div>
        {best.feasible && advice?.latest != null && <div class="verdict-sub">Leave by {clockFull(advice.latest)} at the latest.</div>}
        {!best.feasible && advice?.fix && <div class="verdict-sub">+{dur(advice.fix.minutes)} off duty before you leave → legal, {advice.fix.plan.arrival > advice.fix.plan.driveEnd ? `unloaded by ${clockFull(advice.fix.plan.arrival)}` : `there by ${clockFull(advice.fix.plan.driveEnd)}`}.</div>}
        {/* M4 (load side): the fix line's one tap. It edits the load DRAFT only — the departure
            and the wait — behind the shared draft undo; the verdict above re-computes. */}
        {!best.feasible && loadFix && <button class="primary wide fixit" onClick={() => replaceLoadDraft({ leaveIn: loadFix.leaveIn, waitOff: true })}>{loadFix.label}</button>}
        {!best.feasible && advice?.fixSearched && !advice.fix && <div class="verdict-sub">No amount of extra rest before leaving makes this one legal — the load itself has to change.</div>}
      </section>
      {draftUndo && (
        <div class="row undo">
          <span>Load plan changed.</span>
          <button class="mini" onClick={undoLoadDraft}>Undo</button>
        </div>
      )}
      {/* Dispatch mode (M7): the appointment against the winning plan's wheels-stop time. Shown
          on a legal plan only — an on-time line over an illegal plan would be a promise the
          rules do not keep. */}
      {best.feasible && appt !== null && (() => {
        const a = apptLine(appt, best.driveEnd);
        return (
          <section class={`verdict appt ${a.onTime ? 'yes' : 'no'}`}>
            <div class="verdict-label">Appointment {clockFull(appt)}</div>
            <div class="appt-big"><Icon d={a.onTime ? I.check : I.x} size={26} /> {a.text}</div>
            <button class="link" onClick={() => openSheet({ kind: 'loadtime', field: 'appt' })}>Pick another time</button>
          </section>
        );
      })()}
      {best.feasible && <div class="row dispatch">{dispatch}</div>}
      {provisional && <p class="warnbox small"><b>Provisional.</b> {openGaps.map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} {openGaps.length === 1 ? 'is' : 'are'} unlogged and counted as off duty. Fill {openGaps.length === 1 ? 'it' : 'them'} in and this verdict can change.</p>}
      {hist !== 'known' && <p class="warnbox small">This verdict rests on an incomplete basis: nothing behind your current status is logged, so it assumes you started from zero. It is not a statement about your real day — add your duty on the <b>Log</b> tab, or confirm that the record starts here.</p>}
      <div class="clocks">
        <Stat label="Arrive — wheels stop" value={clockFull(best.driveEnd)} />
        {best.arrival > best.driveEnd && <Stat label="Could be unloaded by (if they take you on arrival)" value={clockFull(best.arrival)} />}
        <Stat label={`Cycle left after ${best.arrival > best.driveEnd ? 'unloading' : 'arrival'}`} value={dur(best.cycleRemainingAtArrival)} />
      </div>
      <ul class="answers">
        <li><span>Load distance</span><b>{lc.miles} mi</b><button class="link" onClick={() => setStep(1)}>Change</button></li>
        <li><span>Leaving</span><b>{leaveWord}{lc.leaveIn ? (lc.waitOff ? ', off duty till then' : ', on duty till then') : ''}</b><button class="link" onClick={() => setStep(2)}>Change</button></li>
        <li><span>Appointment</span><b>{appt !== null ? clockFull(appt) : 'none'}</b><button class="link" onClick={() => setStep(3)}>Change</button></li>
        <li><span>At the receiver</span><b>{lc.dwell ? `${dur(lc.dwell)} ${lc.dwellOff ? 'off duty' : 'on duty'}` : 'none'}</b><button class="link" onClick={() => setStep(4)}>Change</button></li>
      </ul>
      <Card title="How it goes"><PlanCompare both={both} from={now} /></Card>
      <p class="trust">Assumes {s.mph} mph average, fuel and traffic included — change it under More.</p>
      <button class="primary wide" onClick={() => setState({ tab: 'now' })}>Done</button>
      <button class="wide" onClick={() => { clearLoadDraftUndo(); initStock.current = false; setState({ loadCheck: { ...FRESH_LOADCHECK } }); setStep(1); }}>Check another load</button>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="load" />
      </div>
    </>
  );
}

/* ============================================================ Trip tab */

/** The trip planner's departure on the shared clock picker (item 3). A past time stays allowed (a reconstruction), as it always was. */
function TripTimeSheet({ s, now, closing = false }: { s: State; now: number; closing?: boolean }) {
  const [at, setAt] = useState<number>(fromInput(s.trip.dep ?? '') ?? now);
  return (
    <Sheet title="When do you leave?" closing={closing}>
      <ClockPick at={at} set={setAt} now={now} future={true} say="Depart" name="Departure time" keys={KEYS_HOURS} />
      <button class="primary wide ed-go" onClick={() => { setState({ trip: { ...getState().trip, dep: toInput(at) } }); openSheet(null); }}>Depart {clockFull(at)}</button>
      <button class="wide" onClick={() => { setState({ trip: { ...getState().trip, dep: null } }); openSheet(null); }}>Leave now</button>
    </Sheet>
  );
}

function TripTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const d = s.trip;
  const setTrip = (p: Partial<TripDraft>) => setState({ trip: { ...d, ...p } });
  const [milesText, setMilesText] = useState<string | null>(null);
  const [stopMileText, setStopMileText] = useState<string | null>(null);
  const milesProblem = milesText === null ? null : loadMilesProblem(milesText);
  const stopMileProblem = stopMileText === null ? null : (() => {
    const t = stopMileText.trim();
    if (t === '') return 'Type the mile marker — 0 to 3000.';
    const n = Number(t);
    if (!Number.isFinite(n)) return 'That isn’t a mile number.';
    if (Math.round(n) < 0 || Math.round(n) > 3000) return 'Enter 0 to 3000 miles.';
    return null;
  })();
  const cur = s.current?.status ?? null;
  // With no status logged there is nothing to "continue", and guessing OFF would hand out rest
  // credit for time nobody said was off duty. Default to On duty: it credits nothing, so the plan
  // can only come out pessimistic, never optimistic (consumer-review-2, concern 1).
  const untilPick: DutyStatus | 'CURRENT' = d.until === 'CURRENT' && !cur ? 'ON' : d.until;
  const untilStatus: DutyStatus = untilPick === 'CURRENT' ? (cur ?? 'ON') : untilPick;
  const untilOptions: [DutyStatus | 'CURRENT', string][] = [
    ...(cur ? [[('CURRENT') as const, `Continue ${STATUS_LABEL[cur]}`] as [DutyStatus | 'CURRENT', string]] : []),
    ['OFF', STATUS_LABEL.OFF],
    ['SB', STATUS_LABEL.SB],
    ['ON', STATUS_LABEL.ON],
  ];
  const dep = d.dep ?? toInput(now);
  const departure = fromInput(dep) ?? now;
  const depOffset = d.dep === null ? 0 : departure - now;
  const depPresetMatch = d.dep === null ? 0 : ([30, 60, 120].includes(depOffset) ? depOffset : null);
  const waiting = departure > now;
  const pastDeparture = departure < now;
  /** A stop past the destination is passed through so the planner reports it rather than dropping it. */
  const stopPastDest = d.stopMin > 0 && d.stopMile > d.miles;
  const [customClocks, setCustomClocks] = useState<EldClocks | null>(null);
  const tripSegs = useMemo(
    () => (customClocks ? synthesizeEldSeed(customClocks, safeRulesConfig(s.config), now, 0).segments : allSegments(s, now).filter((x) => !x.tentative)),
    [s, now, customClocks],
  );
  const effEv = useMemo(
    () => (customClocks ? evaluate(tripSegs, { asOf: now, config: safeRulesConfig(s.config) }) : ev),
    [customClocks, tripSegs, now, s.config, ev],
  );
  const both = useMemo(() => planTripAll(tripSegs, {
    departure, distanceMiles: d.miles, mph: s.mph, preTripMinutes: d.pre,
    stops: d.stopMin > 0 && d.stopMile > 0 ? [{ atMile: d.stopMile, minutes: d.stopMin, status: d.stopOff ? 'OFF' : 'ON', label: d.stopOff ? 'Stop (off duty)' : 'Stop (on duty)' }] : [],
    config: s.config,
    // Never let the wait before departure read as an unlogged gap: say what it is, and show it.
    ...(waiting ? { untilDeparture: { from: now, status: untilStatus, label: `${STATUS_LABEL[untilStatus]} until departure` } } : {}),
  }), [tripSegs, s.mph, s.config, now, departure, d.miles, d.pre, d.stopMile, d.stopMin, d.stopOff, untilStatus, waiting]);
  const sh = safeHaven(effEv, s.mph);
  const halfMile = Math.max(1, Math.round(d.miles / 2));

  return (
    <>
      <BackToPlan s={s} />
      <h1 class="screen-title">Plan a run</h1>
      <p class="muted small tool-sub">Clock-to-parking range right now, plus three legal ways to run your trip.</p>
      <Card title="Clock-to-parking (right now)" tone={effEv.driveNow < 60 ? 'bad' : effEv.driveNow < 120 ? 'warn' : 'good'} statusBadge={effEv.driveNow < 60 ? { tone: 'bad', label: '✕ Under 1h' } : effEv.driveNow < 120 ? { tone: 'warn', label: '⚠ Under 2h' } : { tone: 'good', label: '✓ Plenty of time' }}>
        <div class="clocks">
          <Stat label="Range" value={`${sh.miles} mi`} sub={`${dur(effEv.driveNow)} @ ${s.mph} mph`} />
          <Stat label="Hard stop" value={clockFull(effEv.mustStopBy)} sub={bindingLabel(effEv)} />
        </div>
        <table class="cutoffs"><tbody>{sh.cutoffs.map((c) => <tr key={c.bufferMinutes}><td>{c.bufferMinutes} min buffer</td><td>park by <b>{clock(c.by, false)}</b></td><td>≤ {c.miles} mi</td></tr>)}</tbody></table>
        <p class="muted small">Net speed (fuel, traffic, scales) is what matters — set it under More. Parking after 17:00 fills fast; plan the 60-min line, not the 0.</p>
      </Card>
      <Card title="Plan a run">
        {/* A7 (taste): reuse the load-check input style (big preset chips + steppers + clock picker)
            instead of sliders + raw-number boxes. Same computed itinerary and outputs. */}
        <div class="trip-field">
          <div class="trip-field-head"><span>Depart</span><b>{d.dep === null ? `Now (${clock(now, false)})` : clockFull(departure)}</b></div>
          <div class="chips" role="group" aria-label="Depart">
            {([[0, 'Now'], [30, 'In 30 min'], [60, 'In 1 hour'], [120, 'In 2 hours']] as [number, string][]).map(([m, l]) => (
              <button key={m} class={depPresetMatch === m ? 'on' : ''} aria-pressed={depPresetMatch === m}
                onClick={() => setTrip({ dep: m === 0 ? null : toInput(now + m) })}>{l}</button>
            ))}
          </div>
          <button class={`wide pick-time trip-dep${depPresetMatch === null ? ' on' : ''}`} aria-label={`Depart ${clockFull(departure)}. Change`} onClick={() => openSheet({ kind: 'triptime' })}>{depPresetMatch === null ? `Depart ${clockFull(departure)} · Change` : 'Pick a time'}</button>
        </div>
        {pastDeparture && (
          <p class="warnbox small">That departure is <b>{dur(now - departure)}</b> in the past. This is a what-if from that time: the plan starts there and does not include anything you've logged since, so treat it as a reconstruction rather than a current plan.</p>
        )}
        {stopPastDest && (
          <div class="warnbox small">
            <b>Your stop is past the destination.</b> It's at mile {d.stopMile} but the route is {d.miles} miles, so it is <b>not</b> in the plan — the {dur(d.stopMin)} of stop time is missing from the arrival times below.
            <div class="row">
              <button class="mini" onClick={() => { setStopMileText(null); setTrip({ stopMile: d.miles }); }}>Move stop to mile {d.miles}</button>
              <button class="mini" onClick={() => { setStopMileText(null); setTrip({ stopMile: 0, stopMin: 0 }); }}>Clear stop</button>
            </div>
          </div>
        )}
        {waiting && (
          <>
            <p class="trust">That's <b>{dur(departure - now)}</b> from now. Unlogged time is not a rest — say what you'll be doing, and the itinerary will show it as an assumed row rather than quietly counting it as off duty:</p>
            <Toggle options={untilOptions} value={untilPick} onChange={(v) => setTrip({ until: v })} />
            <p class="trust">Planning the wait as <b>{STATUS_LABEL[untilStatus]}</b>.{untilStatus === 'OFF' || untilStatus === 'SB' ? ' Only claim this if you really will be off duty — it can count as half of a sleeper split.' : " It earns no rest credit, so it won't count toward a sleeper split."}</p>
            {!cur && <p class="warnbox small">You haven't set a current status yet, so this defaults to <b>On duty</b> until you choose — that credits no rest. Pick <b>Off duty</b> if you really will be off.</p>}
          </>
        )}

        <div class="trip-field">
          <div class="trip-field-head"><span>Distance</span><b>{d.miles} mi</b></div>
          <div class="chips" role="group" aria-label="Distance presets">
            {[250, 400, 550, 700, 900].map((v) => (
              <button key={v} class={!milesProblem && d.miles === v ? 'on' : ''} aria-pressed={!milesProblem && d.miles === v}
                onClick={() => { setMilesText(null); setTrip({ miles: v }); }}>{v}</button>
            ))}
          </div>
          <div class="steps4">
            {[-50, -10, 10, 50].map((step) => (
              <button key={step} aria-label={`${step > 0 ? 'Add' : 'Take off'} ${Math.abs(step)} miles`}
                onClick={() => { setMilesText(null); setTrip({ miles: Math.min(3000, Math.max(1, d.miles + step)) }); }}>{step > 0 ? `+${step}` : `−${-step}`}</button>
            ))}
          </div>
          <label>Or type the miles
            <input type="number" inputMode="numeric" min={1} max={3000} step={1} aria-label="Distance, miles" aria-invalid={milesProblem ? 'true' : undefined}
              value={milesText ?? String(d.miles)}
              onInput={(e) => { const v = (e.target as HTMLInputElement).value; if (loadMilesProblem(v)) setMilesText(v); else { setMilesText(null); setTrip({ miles: Math.round(Number(v)) }); } }}
              onBlur={() => { if (!milesProblem) setMilesText(null); }} />
          </label>
          {milesProblem && <p class="warnbox small" role="alert">{milesProblem}</p>}
        </div>

        <div class="trip-field">
          <div class="trip-field-head"><span>Pre-trip / loading (on duty)</span><b>{d.pre ? dur(d.pre) : 'None'}</b></div>
          <div class="chips" role="group" aria-label="Pre-trip or loading length">
            {([[0, 'None'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours']] as [number, string][]).map(([v, l]) => (
              <button key={v} class={d.pre === v ? 'on' : ''} aria-pressed={d.pre === v} onClick={() => setTrip({ pre: v })}>{l}</button>
            ))}
          </div>
          <div class="pb-steps" role="group" aria-label="Adjust pre-trip length">
            {[-60, -15, 15, 60].map((delta) => (
              <button key={delta} class="pb-step" disabled={delta < 0 ? d.pre <= 0 : d.pre >= 240}
                aria-label={`${delta < 0 ? 'Shorten' : 'Lengthen'} pre-trip by ${Math.abs(delta)} min`}
                onClick={() => setTrip({ pre: Math.max(0, Math.min(240, d.pre + delta)) })}>{delta < 0 ? '−' : '+'}{Math.abs(delta)}</button>
            ))}
          </div>
        </div>

        <div class="trip-field">
          <div class="trip-field-head"><span>Planned stop</span><b>{d.stopMin ? `${dur(d.stopMin)}${d.stopMile ? ` at mi ${d.stopMile}` : ''}` : 'None'}</b></div>
          <div class="chips" role="group" aria-label="Stop length">
            {([[0, 'None'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']] as [number, string][]).map(([v, l]) => (
              <button key={v} class={d.stopMin === v ? 'on' : ''} aria-pressed={d.stopMin === v}
                onClick={() => {
                  setStopMileText(null);
                  if (v === 0) setTrip({ stopMin: 0, stopMile: 0 });
                  else setTrip({ stopMin: v, stopMile: d.stopMile > 0 ? d.stopMile : d.miles });
                }}>{l}</button>
            ))}
          </div>
          {(d.stopMin > 0 || d.stopMile > 0) && (
            <>
              <div class="pb-steps" role="group" aria-label="Adjust stop length">
                {[-60, -15, 15, 60].map((delta) => (
                  <button key={delta} class="pb-step" disabled={delta < 0 ? d.stopMin <= 0 : d.stopMin >= 480}
                    aria-label={`${delta < 0 ? 'Shorten' : 'Lengthen'} stop by ${Math.abs(delta)} min`}
                    onClick={() => setTrip({ stopMin: Math.max(0, Math.min(480, d.stopMin + delta)) })}>{delta < 0 ? '−' : '+'}{Math.abs(delta)}</button>
                ))}
              </div>
              <div class="trip-sub-head"><span>Stop at mile</span><b>{d.stopMile ? `${d.stopMile} mi` : 'none'}</b></div>
              <div class="chips" role="group" aria-label="Stop mile presets">
                <button class={d.stopMile === halfMile ? 'on' : ''} aria-pressed={d.stopMile === halfMile} onClick={() => { setStopMileText(null); setTrip({ stopMile: halfMile }); }}>Halfway ({halfMile} mi)</button>
                <button class={d.stopMile === d.miles ? 'on' : ''} aria-pressed={d.stopMile === d.miles} onClick={() => { setStopMileText(null); setTrip({ stopMile: d.miles }); }}>End ({d.miles} mi)</button>
              </div>
              <div class="steps4">
                {[-50, -10, 10, 50].map((step) => (
                  <button key={step} aria-label={`${step > 0 ? 'Move stop forward' : 'Move stop back'} ${Math.abs(step)} miles`}
                    onClick={() => { setStopMileText(null); setTrip({ stopMile: Math.min(3000, Math.max(0, d.stopMile + step)) }); }}>{step > 0 ? `+${step}` : `−${-step}`}</button>
                ))}
              </div>
              <label>Or type the stop mile
                <input type="number" inputMode="numeric" min={0} max={3000} step={1} aria-label="Stop at mile" aria-invalid={stopMileProblem ? 'true' : undefined}
                  value={stopMileText ?? String(d.stopMile)}
                  onInput={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    const t = v.trim();
                    const n = Number(t);
                    if (t === '' || !Number.isFinite(n) || Math.round(n) < 0 || Math.round(n) > 3000) setStopMileText(v);
                    else { setStopMileText(null); setTrip({ stopMile: Math.round(n) }); }
                  }}
                  onBlur={() => { if (!stopMileProblem) setStopMileText(null); }} />
              </label>
              {stopMileProblem && <p class="warnbox small" role="alert">{stopMileProblem}</p>}
              {d.stopMin > 0 && <Toggle options={[[false, 'Stop is on duty'], [true, 'Stop is off duty (can count toward a split)']]} value={d.stopOff} onChange={(v) => setTrip({ stopOff: v })} />}
            </>
          )}
        </div>

        <div class="row"><button onClick={() => { setMilesText(null); setStopMileText(null); setState({ trip: { ...DEFAULT_TRIP } }); }}>Reset plan</button></div>
        <p class="muted small">This scenario is kept while you move between tabs.</p>
      </Card>
      {meaningfulGaps(ev.gaps).length > 0 && (
        <p class="warnbox small"><b>Provisional.</b> {meaningfulGaps(ev.gaps).map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} {meaningfulGaps(ev.gaps).length === 1 ? 'is' : 'are'} unlogged and counted as off duty, so a "legal" below may rest on a break you never took. Fill {meaningfulGaps(ev.gaps).length === 1 ? 'it' : 'them'} in on the <b>Log</b> tab.</p>
      )}
      <Card title="Itinerary — three ways to rest">
        <PlanCompare both={both} from={departure} view={d.view} onView={(v) => setTrip({ view: v })} />
      </Card>
      <InlineClockOverride s={s} now={now} override={customClocks} onChange={setCustomClocks} toolId="trip" />
    </>
  );
}

/* ============================================================ Settings */

/** Ask the browser to download the export; returns the file name (carrying the active driver's name when signed in). */
export function downloadExport(s: State, driverName?: string): string {
  const activeName = driverName !== undefined ? driverName : getActiveDriverName();
  const blob = new Blob([exportState(s, activeName)], { type: 'application/json' });
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slug = activeName ? driverFileSlug(activeName) : '';
  const name = slug ? `clock14-${slug}-${ymd}.json` : `clock14-${ymd}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  try { setState({ lastExportAt: s.nowOverride ?? nowMin() }); } catch { /* ignore during fallback recovery */ }
  return name;
}

/* ============================================================ Planning worksheet (PDF / print) */

/** Planning worksheet PDF: day-count bounds and mandatory non-RODS / non-ELD header disclaimer. */
export const PDF_DAYS_DEFAULT = 14;
export const PDF_DAYS_MIN = 1;
export const PDF_DAYS_MAX = 92;
export const PDF_DISCLAIMER = 'PERSONAL HOS PLANNING WORKSHEET — NOT A LEGAL RODS / NOT AN ELD';

/** Filename for the exported planning worksheet PDF: clock14-worksheet-<driver>-<YYYYMMDD>.pdf */
export function worksheetFilename(driverName: string, generatedAtMs: number): string {
  const d = new Date(generatedAtMs);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const slug = driverName ? driverFileSlug(driverName) : '';
  return `clock14-worksheet-${slug || 'driver'}-${ymd}.pdf`;
}

/**
 * Validate the driver's requested day count for the printable log summary.
 * Whole numbers 1..92 only; anything else returns a plain error and produces no report.
 */
export function parseSummaryDays(raw: string, badInput = false): { ok: true; days: number } | { ok: false; problem: string } {
  const t = raw.trim();
  if (badInput || t === '') return { ok: false, problem: `Enter a whole number of days from ${PDF_DAYS_MIN} to ${PDF_DAYS_MAX}.` };
  if (!/^-?\d+$/.test(t)) return { ok: false, problem: `Whole numbers only (${PDF_DAYS_MIN} to ${PDF_DAYS_MAX} days).` };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n < PDF_DAYS_MIN || n > PDF_DAYS_MAX) {
    return { ok: false, problem: `Enter between ${PDF_DAYS_MIN} and ${PDF_DAYS_MAX} days.` };
  }
  return { ok: true, days: n };
}

export interface PrintReportRequest {
  days: number;
  generatedAt: number;
  generatedAtMs: number;
  seq: number;
}
let printReportNow: PrintReportRequest | null = null;
let printReportSeq = 0;
const printReportSubs = new Set<() => void>();
export function setPrintReport(req: Omit<PrintReportRequest, 'seq'> | null) {
  printReportNow = req ? { ...req, seq: ++printReportSeq } : null;
  printReportSubs.forEach((f) => f());
}
export function currentPrintReport(): PrintReportRequest | null { return printReportNow; }
function usePrintReport(): PrintReportRequest | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); printReportSubs.add(f); return () => { printReportSubs.delete(f); }; }, []);
  return printReportNow;
}

export interface LogSummaryDay {
  /** 0 = today, 1 = yesterday, ..., N-1 = oldest carrier day in the chosen range. */
  back: number;
  start: number;
  end: number;
  dateLabel: string;
  shortDate: string;
  gridSegments: Segment[];
  totals: Record<DutyStatus, number>;
  rows: Segment[];
  live: { status: DutyStatus; note?: string; since: number; start: number; end: number; isToday: boolean } | null;
  noDuty: boolean;
}

/**
 * Build the N carrier days ending today (ordered newest-first: Today down to Today − (N − 1))
 * using the exact carrier-day boundaries (s.config.dayStartHour + s.config.timeZone) and
 * engine-normalized logged segments that LogTab uses. Never invents entries for empty days.
 */
export function buildLogSummaryDays(s: State, now: number, days: number): LogSummaryDay[] {
  const count = Math.max(PDF_DAYS_MIN, Math.min(PDF_DAYS_MAX, Math.trunc(days)));
  const resolved = joinDisplayRows(normalize(allSegments(s, now), { merge: false }));
  const loggedResolved = resolved.filter((x) => !x.tentative);
  const loggedRows = s.segments.filter((x) => !x.tentative && x.end > x.start);
  const fullFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: s.config.timeZone });
  const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: s.config.timeZone });

  const cfg = safeRulesConfig(s.config);
  const out: LogSummaryDay[] = [];
  let curStart = carrierDayStart(now, cfg);
  for (let back = 0; back < count; back++) {
    const start = curStart;
    const end = nextCarrierDayStart(start, cfg);
    const totals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
    for (const x of loggedResolved) {
      totals[x.status] += Math.max(0, Math.min(x.end, end, now) - Math.max(x.start, start));
    }
    const gridSegments = loggedResolved.filter((x) => x.end > start && x.start < end);
    const rows = loggedRows.filter((x) => x.end > start && x.start < end).sort((a, b) => a.start - b.start || a.end - b.end);
    const liveActive = !!(s.current && s.current.since < end && (back === 0 || now > start));
    const live = liveActive && s.current
      ? {
          status: s.current.status,
          note: s.current.note,
          since: s.current.since,
          start: Math.max(s.current.since, start),
          end: Math.min(Math.max(now, s.current.since), end),
          isToday: back === 0,
        }
      : null;
    out.push({
      back,
      start,
      end,
      dateLabel: fullFmt.format(new Date(start * 60000)),
      shortDate: shortFmt.format(new Date(start * 60000)),
      gridSegments,
      totals,
      rows,
      live,
      noDuty: rows.length === 0 && !live,
    });
    if (back + 1 < count) curStart = carrierDayStart(curStart - 1, cfg);
  }
  return out;
}

/**
 * Print-only multi-day log summary. Hidden on screen (display: none) so the normal UI is
 * untouched; shown only under @media print when window.print() is triggered from More → Data.
 */
function LogSummaryReport({ s, req }: { s: State; req: PrintReportRequest }) {
  const days = useMemo(() => buildLogSummaryDays(s, req.generatedAt, req.days), [s, req.generatedAt, req.days]);
  const newest = days[0];
  const oldest = days[days.length - 1];
  const rangeLabel = days.length === 1 ? newest.shortDate : `${oldest.shortDate} – ${newest.shortDate}`;
  const rangeTotals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
  for (const d of days) {
    rangeTotals.D += d.totals.D;
    rangeTotals.ON += d.totals.ON;
    rangeTotals.OFF += d.totals.OFF;
    rangeTotals.SB += d.totals.SB;
  }
  const genStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(req.generatedAtMs));
  const twoZones = s.config.timeZone !== deviceTz;
  const dayStartLabel = formatDayStartHM(s.config);
  const driverName = getActiveDriverName();
  const fileName = worksheetFilename(driverName, req.generatedAtMs);

  return (
    <article class="print-report" data-print-report data-days={days.length} data-worksheet-filename={fileName} aria-label="Planning worksheet">
      <header class="pr-head">
        <div class="pr-brand-row">
          <div>
            <div class="pr-app">Clock 14 <span class="pr-app-sub">— HOS What-If Planner</span></div>
            <h1 class="pr-title">Planning Worksheet</h1>
          </div>
          <div class="pr-count-badge">{days.length} {days.length === 1 ? 'day' : 'days'}</div>
        </div>
        <div class="pr-disclaimer" role="note">{PDF_DISCLAIMER}</div>
        <dl class="pr-meta">
          {driverName && <div><dt>Driver</dt><dd>{driverName}</dd></div>}
          <div><dt>Worksheet file</dt><dd class="mono">{fileName}</dd></div>
          <div><dt>Date range</dt><dd>{rangeLabel} ({days.length} {days.length === 1 ? 'carrier day' : 'carrier days'}, newest first)</dd></div>
          <div><dt>Generated</dt><dd class="mono">{genStr}</dd></div>
          <div><dt>Carrier day boundary</dt><dd>{dayStartLabel} {s.config.timeZone}{twoZones ? ` · clock times in ${deviceTz}` : ''}</dd></div>
          <div><dt>Cycle rule</dt><dd>{s.config.cycle === '60/7' ? '60 hr / 7 days' : '70 hr / 8 days'}{s.config.shortHaul ? ' · Short-haul' : ''}</dd></div>
        </dl>
        <div class="pr-range-totals" aria-label="Period totals">
          <div class="pr-range-label">Period totals ({days.length} {days.length === 1 ? 'day' : 'days'})</div>
          <div class="pr-range-grid">
            {(['D', 'ON', 'OFF', 'SB'] as DutyStatus[]).map((k) => (
              <div key={k} class={`pr-tot pr-tot-${k}`}>
                <span>{STATUS_LABEL[k]}</span>
                <b class="mono">{dur(rangeTotals[k])}</b>
              </div>
            ))}
          </div>
        </div>
      </header>

      <div class="pr-days">
        {days.map((d) => (
          <section key={d.start} class={`pr-day${d.noDuty ? ' pr-day-noduty' : ''}`} data-day-index={d.back} data-day-start={d.start}>
            <div class="pr-day-head">
              <div class="pr-day-title">
                <h2>{d.back === 0 ? `Today — ${d.dateLabel}` : d.dateLabel}</h2>
                {d.noDuty && <span class="pr-noduty-tag">No-duty day</span>}
              </div>
              <div class="pr-day-sub">
                Carrier day from {dayStartLabel} {s.config.timeZone}{twoZones ? ` · ${clock(d.start)} on device` : ''}
              </div>
            </div>
            <div class="pr-day-graph">
              <Grid segments={d.gridSegments} from={d.start} to={d.end} tz={s.config.timeZone} />
            </div>
            <div class="daytotals pr-day-totals">
              {(['D', 'ON', 'OFF', 'SB'] as DutyStatus[]).map((k) => (
                <div key={k} class={`pr-tot-${k}`}>
                  <span class="muted small">{STATUS_LABEL[k]}</span>
                  <b>{dur(d.totals[k])}</b>
                </div>
              ))}
            </div>
            <div class="pr-entries">
              {d.noDuty ? (
                <p class="pr-noduty-msg">No duty entries logged — no-duty day.</p>
              ) : (
                <ul class="pr-entry-list">
                  {d.rows.map((seg, i) => (
                    <li key={`${seg.start}-${seg.end}-${i}`} class="pr-entry">
                      <span class={seg.note === ELD_SEED_NOTE ? 'dot eld-dot' : 'dot'} style={{ background: STATUS_COLOR[seg.status], color: STATUS_COLOR[seg.status] }} />
                      <span class="pr-entry-label">
                        <b>{segLabel(seg.status, seg.note)}</b>
                        {seg.note === ELD_SEED_NOTE && <span class="eld-tag">Estimate from your ELD clocks</span>}
                      </span>
                      <span class="pr-entry-time mono">{clock(seg.start)} → {clock(seg.end)}</span>
                      <span class="pr-entry-len mono">{dur(seg.end - seg.start)}</span>
                    </li>
                  ))}
                  {d.live && (
                    <li class="pr-entry pr-entry-live">
                      <span class="dot" style={{ background: STATUS_COLOR[d.live.status] }} />
                      <span class="pr-entry-label">
                        <b>{segLabel(d.live.status, d.live.note)}</b>
                        <span class="pr-live-tag">{d.live.isToday ? 'Current' : 'Ongoing'}</span>
                      </span>
                      <span class="pr-entry-time mono">since {clock(d.live.since)}{d.live.isToday ? ' · now' : ''}</span>
                      <span class="pr-entry-len mono">{dur(Math.max(0, d.live.isToday ? req.generatedAt - d.live.since : d.live.end - d.live.start))}</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </section>
        ))}
      </div>

      <footer class="pr-foot">
        <p class="pr-foot-disclaimer">{PDF_DISCLAIMER}</p>
        <p class="pr-foot-meta">Clock 14 — HOS What-If Planner{driverName ? ` · Driver: ${driverName}` : ''} · Generated {genStr}</p>
      </footer>
    </article>
  );
}

function DrivingAlertsCard({ s }: { s: State }) {
  // Browser features are only known at run time; the pre-rendered page assumes none.
  const [notif, setNotif] = useState<NotifyState>('unsupported');
  const [awakeOk, setAwakeOk] = useState(true);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => { setNotif(notifyState()); setAwakeOk(canKeepAwake()); setSpeechOk(speechSynthesisAvailable()); }, []);
  // "Test alert" plays the 60-minute pattern (capstone C3, M13): the first mark a driver will feel.
  const test = () => { unlockAudio(); chime(true); buzz(true, 60); };
  return (
    <Card title="Driving alerts">
      <label class="check"><input type="checkbox" checked={s.alertsOn} onChange={(e) => setState({ alertsOn: (e.target as HTMLInputElement).checked })} /> Sound and vibration at 60, 30 and 15 minutes of driving left, and every 15 minutes once you are out of time</label>
      <label class="check"><input type="checkbox" checked={s.keepAwake} onChange={(e) => setState({ keepAwake: (e.target as HTMLInputElement).checked })} /> Keep the screen on while your status is Driving</label>
      <label class="check"><input type="checkbox" checked={s.drivingView} onChange={(e) => setState({ drivingView: (e.target as HTMLInputElement).checked })} /> Big driving screen while your status is Driving</label>
      <label class="check"><input type="checkbox" checked={s.darkDriveAtNight} onChange={(e) => setState({ darkDriveAtNight: (e.target as HTMLInputElement).checked })} /> Dark driving screen at night</label>
      {speechOk && <label class="check"><input type="checkbox" checked={s.speakAlerts} onChange={(e) => setState({ speakAlerts: (e.target as HTMLInputElement).checked, speechAsked: true })} /> Read driving alerts out loud</label>}
      {speechOk && <Help label="About reading alerts out loud"><p class="muted small">At 60, 30 and 15 minutes of driving left — and when time runs out — the app says the numbers out loud after the alert sound, and confirms out loud when you tap a status, so you never have to read while you roll. Changing this switch is your answer to the one-time question the app asks the first time you tap a status while parked. It uses this browser's voice; nothing is recorded or sent anywhere.</p></Help>}
      <Help label="About the dark driving screen"><p class="muted small">Between 7 PM and 7 AM on this phone's clock, the driving screen wears the dark theme even when the app is set to Day — a lit screen in a dark cab is glare. The rest of the app keeps your theme.</p></Help>
      {!awakeOk && <p class="small">This browser cannot keep the screen on. Set your phone's auto-lock to "Never" while you drive, or the alerts will stop when it locks.</p>}
      <div class="row">
        <button onClick={test}>Test alert</button>
        {notif === 'default' && <button onClick={() => { void askNotify().then(setNotif); }}>Also notify when in background</button>}
      </div>
      <p class="muted small">
        {notif === 'granted' ? 'Notifications are on: if the app is open behind another app, alerts also show as notifications. ' : ''}
        {notif === 'denied' ? 'Notifications are blocked for this site in your browser settings. ' : ''}
        Alerts only work while Clock 14 is open — when the phone locks or the app is closed, the phone stops it. <b>Your ELD is your official warning.</b>
      </p>
      <Help label="Keeping alerts running"><p class="muted small">Keeping the screen on is what keeps it running in a mounted phone; it uses more battery, so keep the phone charging. iPhones do not let web apps vibrate, and the silent switch can mute the sound: use "Test alert" to check. Nothing needs a tap while you drive.</p></Help>
    </Card>
  );
}

/**
 * The driver's break buttons. A break is not a duty status, so each button is just a name, a length and
 * the status it is logged as; the rules about pay belong to the carrier, not to this app.
 */
function BreakButtonsCard({ s }: { s: State }) {
  const list = s.breakPresets;
  const save = (next: BreakPreset[]) => setState({ breakPresets: sanitizeBreaks(next) });
  const set = (i: number, p: Partial<BreakPreset>) => {
    if (p.name !== undefined && !p.name.trim()) return; // an emptied name keeps the old one rather than deleting the button
    save(list.map((b, j) => (j === i ? { ...b, ...p } : b)));
  };
  return (
    <Card title="Break buttons">
      <p class="muted small">Shown when you add an entry on the Log.</p>
      <Help label="What a break button does"><p class="muted small">A break is not a duty status of its own: each button logs the length and status you set here. For example, a 20-minute paid break and a 40-minute lunch, each logged the way your carrier has you log it.</p></Help>
      {list.map((b, i) => (
        <div class="brk-row" key={`${i}-${b.name}`}>
          <label>Name<input type="text" maxLength={24} value={b.name} onChange={(e) => set(i, { name: (e.target as HTMLInputElement).value })} /></label>
          <div class="brk-len">
            <button aria-label={`${b.name}: 5 minutes shorter`} disabled={b.minutes <= 5} onClick={() => set(i, { minutes: b.minutes - 5 })}>−5</button>
            <output class="tstep-value">{dur(b.minutes)}</output>
            <button aria-label={`${b.name}: 5 minutes longer`} disabled={b.minutes >= 240} onClick={() => set(i, { minutes: b.minutes + 5 })}>+5</button>
          </div>
          <Toggle options={[['OFF', 'Logged off duty'], ['ON', 'Logged on duty']]} value={b.status} onChange={(v) => set(i, { status: v })} />
          <button class="danger" onClick={() => save(list.filter((_, j) => j !== i))}>Remove “{b.name}”</button>
        </div>
      ))}
      {list.length < MAX_BREAKS && <button class="wide-btn" onClick={() => save([...list, { name: `Break ${list.length + 1}`, minutes: 30, status: 'OFF' }])}>Add a break button</button>}
      {list.length === 0 && <p class="muted small">No break buttons: the Log's add panel shows the four statuses only.</p>}
    </Card>
  );
}

/** C5 (taste): long-press duration on the build line to reveal the Testing card on More. */
export const TESTING_LONG_PRESS_MS = 600;
let testingUnlocked = false;
export function setTestingUnlocked(v: boolean) { testingUnlocked = v; }

function SettingsTab({
  s, now, ev, driverId, driverName, stayUnlocked, driverCount,
}: {
  s: State; now: number; ev: FullEvaluation; driverId: string | null; driverName: string; stayUnlocked: boolean; driverCount: number;
}) {
  const c = s.config;
  const [ioNote, setIoNote] = useState<string | null>(null);
  const [pdfDaysText, setPdfDaysText] = useState(String(PDF_DAYS_DEFAULT));
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const pdfDaysRef = useRef<HTMLInputElement>(null);
  const [showTesting, setShowTesting] = useState(testingUnlocked);
  const onPdfDaysInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const raw = el.value;
    setPdfDaysText(raw);
    const parsed = parseSummaryDays(raw, Boolean(el.validity?.badInput));
    if (!parsed.ok) {
      setPdfErr(parsed.problem);
      setPrintReport(null);
    } else {
      setPdfErr(null);
    }
  };
  const openPdfSummary = () => {
    const parsed = parseSummaryDays(pdfDaysText, Boolean(pdfDaysRef.current?.validity?.badInput));
    if (!parsed.ok) {
      setPdfErr(parsed.problem);
      setPrintReport(null);
      return;
    }
    setPdfErr(null);
    setPrintReport({
      days: parsed.days,
      generatedAt: now,
      generatedAtMs: s.nowOverride !== null ? now * 60000 : Date.now(),
    });
  };
  const pressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    if (pressRef.current !== null) return;
    pressRef.current = setTimeout(() => {
      pressRef.current = null;
      testingUnlocked = true;
      setShowTesting(true);
    }, TESTING_LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressRef.current !== null) { clearTimeout(pressRef.current); pressRef.current = null; }
  };
  useEffect(() => cancelPress, []);
  const setC = (p: Partial<typeof c>) => setState({ config: safeRulesConfig({ ...c, ...p }) });
  const exportJson = () => {
    const name = downloadExport(s);
    // Say only what is knowable: the app asked the browser for a download. Whether the file landed is
    // not ours to claim — a silent failure and a success look identical from in here (consumer-review-5).
    setIoNote(`Download requested: ${name} (${s.segments.length} logged segment(s), ${s.tentative.length} what-if row(s)). Check your browser's downloads — the app cannot confirm the file reached your device.`);
  };
  const importJson = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ''; // so choosing the same file again fires another change event
    if (!f) return;
    f.text().then((t) => {
      const d = JSON.parse(t);
      // Validate first: a JSON file that isn't an export used to replace the log with nothing (C1).
      const problem = importProblem(d);
      if (problem) { setIoNote(`Could not import ${f.name}: ${problem}`); return; }
      const cur = getState();
      const have = cur.segments.length + cur.tentative.length + (cur.current ? 1 : 0);
      if (have > 0 && !confirm(`Replace your ${cur.segments.length} logged segment(s) and ${cur.tentative.length} what-if row(s) with ${d.segments.length} segment(s) from ${f.name}? This cannot be undone.`)) {
        setIoNote('Import cancelled. Nothing was changed.');
        return;
      }
      const badZone = typeof d.config?.timeZone === 'string' && !isValidTimeZone(d.config.timeZone) ? d.config.timeZone : null;
      // Say what was replaced, exactly as the bad-zone case does: an imported draft that the app could
      // not use must not be silently swapped for a default.
      const resets = draftResets(d, cur);
      setState((cur) => {
        const out = applyImportedState(cur, d);
        if (out.config) {
          // A legacy backup exported before dayStartMinute existed has a config object without that key;
          // store.ts sanitizeConfig spreads cur.config first, which would silently inherit the current minute.
          const legacyCfg = d.config && typeof d.config === 'object' && !Array.isArray(d.config) && !('dayStartMinute' in d.config);
          out.config = safeRulesConfig(legacyCfg ? { ...out.config, dayStartMinute: 0 } : out.config);
        }
        return out;
      });
      setIoNote(`Imported ${(d.segments ?? []).length} segment(s) and ${(d.tentative ?? []).length} what-if row(s) from ${f.name}. Settings and the trip scenario came back with them; a simulated clock does not.${badZone ? ` The file's time zone "${badZone}" is not valid, so your home terminal zone stayed ${getState().config.timeZone}.` : ''}${resets.length ? ` Values the app could not use were replaced in ${resets.join(' and ')}.` : ''}`);
    }).catch((err) => setIoNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`));
  };
  return (
    <>
      <DriverSettingsCard driverId={driverId} driverName={driverName} stayUnlocked={stayUnlocked} driverCount={driverCount} />
      {/* D18 (audit): the one-release "Hours coming back has moved to Plan ›" row is retired. */}
      <Card title="Rules">
        <label>Cycle<Toggle options={[['70/8', '70 hr / 8 days'], ['60/7', '60 hr / 7 days']]} value={c.cycle} onChange={(v) => setC({ cycle: v })} /></label>
        <button
          type="button"
          class="rowbtn"
          data-carrier-day-btn="1"
          aria-label={`Carrier day starts at ${formatDayStartHM(c)} (${zoneShort(c.timeZone)}). Change`}
          onClick={() => openSheet({ kind: 'daystart' })}
        >
          <span>
            <b>Carrier day starts at <span class="mono">{formatDayStartHM(c)}</span></b><br />
            <span class="muted small">{c.dayStartHour === 0 && clampDayStartMinute(c.dayStartMinute) === 0 ? `Midnight · ${zoneShort(c.timeZone)}` : `Home terminal time · ${zoneShort(c.timeZone)}`}</span>
          </span>
          <Icon d={I.next} />
        </button>
        <TimeZoneField value={c.timeZone} onChange={(v) => setC({ timeZone: v })} />
        <label class="check"><input type="checkbox" checked={c.shortHaul} onChange={(e) => setC({ shortHaul: (e.target as HTMLInputElement).checked })} /> Short-haul (§395.1(e)) — no 30-min break rule</label>
        {/* Gemini round, item H: the control is a row, not a section — the last row of the Now
            screen, just above the status buttons — so the copy says where to scroll. */}
        {/* A8 (audit): a button to the sheet, not directions to it. */}
        <button class="rowbtn" onClick={(e) => openMorphSheet({ kind: 'exceptions' }, e.currentTarget)}>
          <span><span class="muted">Adverse conditions and the 16-hour day are per shift</span><br /><b>Exceptions this shift</b></span>
          <Icon d={I.next} />
        </button>
      </Card>
      <Card title="Planning">
        <Slider label="Net average speed" value={s.mph} min={40} max={70} step={1} onChange={(v) => setState({ mph: v })} fmt={(v) => `${v} mph`} unit="mph" />
        <label>Main card on Now<Toggle options={NOW_CARD_OPTIONS} value={s.nowCard} onChange={(v) => setNowCard(v)} /></label>
        <Help label="Timeline or Dial?"><p class="muted small">Timeline shows your limits as lanes ending at their clock times, so you can see which one ends first. Dial is the gauge the app has always had. The driving view keeps the dial either way.</p></Help>
        <label>Screen<Toggle options={[['day', 'Day'], ['night', 'Night'], ['winddown', 'Wind-down']]} value={effectiveTheme(s, devicePrefersDark())} onChange={(v) => chooseTheme(v as Theme)} /></label>
        <Help label="How Day, Night and Wind-down work"><p class="muted small">Until you pick one here, the screen follows your phone's light/dark setting — a dark phone gets the deep-navy Night palette, so there is no blast of white in a dark cab. Day is the default the app ships with, built for bright sunlight outdoors. Wind-down is a manual-only warm, dimmer night screen for the end of your shift (it never switches on by itself). Once you pick, your pick stays. All three palettes are contrast-checked against WCAG AA, and the header key cycles Day → Night → Wind-down.</p></Help>
      </Card>
      <DrivingAlertsCard s={s} />
      <BreakButtonsCard s={s} />
      <Card title="Bug reports">
        <a
          class="btn primary wide bug-email-btn"
          data-bug-email="1"
          href={bugReportMailtoHref(s, ev, now)}
          onClick={(e) => {
            const cur = getState();
            const tapNow = cur.nowOverride ?? nowMin();
            const tapEv = evaluate(allSegments(cur, tapNow), { asOf: tapNow, config: safeRulesConfig(cur.config) });
            (e.currentTarget as HTMLAnchorElement).href = bugReportMailtoHref(cur, tapEv, tapNow);
          }}
        >Email a bug report</a>
        <p class="muted small" data-bug-email-disclosure="1">Sends your clock log and app state so we can diagnose the problem. No PIN, no account info.</p>
        <BugButton s={s} ev={ev} />
        <p class="muted small">Opens a GitHub issue form with your clocks, build number and log pre-filled (a free GitHub account is needed to submit). Your log is also copied to the clipboard. Beta rules: <a href={`https://github.com/${REPO}#free-beta`} target="_blank" rel="noopener">github.com/{REPO}</a></p>
      </Card>
      <Card title="Data">
        {shouldShowBackupNudge(s, now) && (
          <div class="backup-nudge" data-backup-nudge="1" role="status">
            <span class="small">Back up your clocks — save a copy somewhere safe.</span>
            <span class="backup-nudge-acts">
              <button type="button" class="mini primary" onClick={exportJson}>Export JSON</button>
              <button type="button" class="mini" data-backup-nudge-dismiss="1" onClick={() => setState({ exportNudgeDismissedAt: now })}>Dismiss</button>
            </span>
          </div>
        )}
        <div class="row"><button onClick={exportJson}>Export JSON</button><label class="filebtn">Import JSON<input type="file" accept="application/json" onChange={importJson} /></label></div>
        <div class="pdf-export-row">
          <label class="pdf-days">Days<input ref={pdfDaysRef} type="number" class="num" inputMode="numeric" min={PDF_DAYS_MIN} max={PDF_DAYS_MAX} step={1} value={pdfDaysText} aria-invalid={pdfErr ? 'true' : undefined} onInput={onPdfDaysInput} /></label>
          <button type="button" class="pdf-btn" onClick={openPdfSummary}>Planning worksheet (PDF)</button>
        </div>
        {pdfErr && <div class="warnbox small" role="alert">{pdfErr}</div>}
        {ioNote && <p class="muted small">{ioNote}</p>}
        <button class="danger" onClick={() => openSheet({ kind: 'confirm', what: 'startover' })}>Start over: fresh 10-hour rest ending now</button>
        <p class="muted small">Undo is on the Log until your next change.</p>
        <button class="danger" onClick={() => openSheet({ kind: 'confirm', what: 'erase' })}>Erase all data</button>
        <p class="muted small">Everything stays on this phone. Nothing is uploaded.</p>
      </Card>
      <Card title="About">
        <p class="small">{CLOCK14_DISCLAIMER_TEXT}</p>
        <p class="small" data-scope-line="1">Clock 14 covers US interstate property-carrying rules (49 CFR 395). No Canada, oilfield, or passenger-carrying rules.</p>
        <p class="muted small build-line" data-build-line onContextMenu={(e) => e.preventDefault()} onPointerDown={startPress} onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress} onTouchStart={startPress} onTouchEnd={cancelPress} onTouchCancel={cancelPress}>Build {__BUILD__} · now {clock(now)}</p>
      </Card>
      {/* C5 (taste, 2026-11-20): hidden from casual poking on More behind a long-press on the build
          line above (and shown automatically whenever a simulated clock is already active so it can
          always be cleared). While set, a banner rides every screen — see App. */}
      {(showTesting || s.nowOverride !== null) && (
        <Card title="Testing">
          <label>Simulated "now" (testing)<input type="datetime-local" value={s.nowOverride ? toInput(s.nowOverride) : ''} onChange={(e) => { const v = fromInput((e.target as HTMLInputElement).value); if (v === null) useRealClock(); else setState({ nowOverride: v }); }} /></label>
          <button onClick={() => useRealClock()} disabled={!s.nowOverride}>Use real clock</button>
          <p class="muted small">For trying the app against a made-up time. Anything you change while it is set is thrown away when you go back to the real clock, and alerts never sound while it is set.</p>
        </Card>
      )}
    </>
  );
}

const KEYS_DAYSTART: ClockKeys = [
  [[-60, '− 1 hour', '1 hour earlier'], [60, '+ 1 hour', '1 hour later']],
  [[-15, '−15', '15 minutes earlier'], [-5, '−5', '5 minutes earlier'], [5, '+5', '5 minutes later'], [15, '+15', '15 minutes later']],
  [[-1, '−1', '1 minute earlier'], [1, '+1', '1 minute later']],
];
/** Anchor time-of-day edits on a fixed non-DST local calendar date so every HH:MM (00:00..23:59) exists cleanly. */
const dayStartAnchor = (h: number, m: number) => Math.floor(new Date(2026, 5, 15, h, m, 0, 0).getTime() / 60000);

function DayStartSheet({ s, closing = false }: { s: State; closing?: boolean }) {
  const c = safeRulesConfig(s.config);
  const [at, setAt] = useState<number>(() => dayStartAnchor(c.dayStartHour, c.dayStartMinute));
  const setPick = (v: number) => {
    const d = new Date(v * 60000);
    setAt(dayStartAnchor(d.getHours(), d.getMinutes()));
  };
  const d = new Date(at * 60000);
  const h = d.getHours();
  const m = d.getMinutes();
  const hm = formatDayStartHM({ dayStartHour: h, dayStartMinute: m });
  const tzName = zoneShort(c.timeZone);
  const apply = () => {
    setState((cur) => ({ config: { ...safeRulesConfig(cur.config), dayStartHour: h, dayStartMinute: m } }));
    openSheet(null);
  };
  return (
    <Sheet title="Carrier day starts at" closing={closing}>
      <p class="muted small" style="margin:0">Exact daily 24-hour boundary in <b>{tzName}</b> ({c.timeZone}).</p>
      <ClockPick
        timeOnly
        at={at}
        set={setPick}
        now={at}
        future={false}
        say="Carrier day starts at"
        name="Carrier day start time"
        keys={KEYS_DAYSTART}
        sub={`Home terminal time (${tzName}) · tap the time to pick it`}
        extra={(h !== 0 || m !== 0) ? (
          <div class="chips" style="margin-bottom:8px">
            <button type="button" onClick={() => setAt(dayStartAnchor(0, 0))}>Reset to 00:00 (midnight)</button>
          </div>
        ) : undefined}
      />
      <button class="primary wide ed-go" data-carrier-day-apply="1" onClick={apply}>Apply · {hm} ({tzName})</button>
    </Sheet>
  );
}

/** A9 (audit): "Erase all data" — everything the app holds on this phone, the way it always did. */
export function eraseAll() {
  try { localStorage.removeItem(SIM_KEY); } catch { /* ignore */ }
  setState((cur) => ({ segments: [], tentative: [], current: null, nowOverride: null, historyAcknowledged: false, seededAt: null, lastEldCheckAt: null, dayCloses: [], config: { ...cur.config, adverseShifts: [], sixteenHourShifts: [] } }));
}
/**
 * A9 (audit): Start over and Erase confirm in the app's own sheet, in plain words — what goes,
 * whether it can come back, and (for Erase) a way to keep a copy first.
 */
function ConfirmSheet({ s, now, what, closing = false }: { s: State; now: number; what: 'startover' | 'erase'; closing?: boolean }) {
  const [note, setNote] = useState<string | null>(null);
  if (what === 'startover') {
    return (
      <Sheet title="Start over?" closing={closing}>
        <p>Your log is replaced with a fresh 10-hour rest ending now ({clock(now)}), and you go on duty from there.</p>
        <p class="muted small">Undo is on the Log until your next change.</p>
        <button class="primary wide" data-first onClick={() => openSheet(null)}>Keep my log</button>
        <button class="danger wide" onClick={() => { startOver(now); openSheet(null); setState({ tab: 'log' }); }}>Start over</button>
      </Sheet>
    );
  }
  return (
    <Sheet title="Erase everything on this phone?" closing={closing}>
      <p><b>This can't be undone.</b> Your log ({s.segments.length} {s.segments.length === 1 ? 'entry' : 'entries'}), your what-if rows and your day closes are deleted. Your settings stay.</p>
      <button class="wide" onClick={() => setNote(`Download requested: ${downloadExport(s)}. Check your browser's downloads — the app cannot confirm the file reached your device.`)}>Export a copy first</button>
      {note && <p class="muted small">{note}</p>}
      <button class="primary wide" data-first onClick={() => openSheet(null)}>Keep my data</button>
      <button class="danger wide" onClick={() => { eraseAll(); openSheet(null); }}>Erase everything</button>
    </Sheet>
  );
}

/* ============================================================ App */

/**
 * Records disclaimer acknowledgement (capstone C1, decision C1-A) and, on a first acknowledgement
 * from a fresh empty record, sets Now to the Timeline card.
 */
export function acknowledgeDisclaimer() {
  setState((cur) => (cur.disclaimerAcked
    ? { disclaimerAcked: true }
    : {
        disclaimerAcked: true,
        ...(cur.segments.length === 0 && cur.tentative.length === 0 && !cur.current ? { nowCard: 'timeline' as const } : {}),
      }));
}

/**
 * One-time startup disclaimer pop-up: shown on launch whenever disclaimerAcked is false.
 * Body matches More → About verbatim; the single button calls acknowledgeDisclaimer() and dismisses.
 */
function DisclaimerDialog({ closing = false }: { closing?: boolean }) {
  return <DisclosureModal closing={closing} onAccept={() => acknowledgeDisclaimer()} />;
}

/**
 * The spoken-alerts question (patch 17, decision D7-A; timing moved by C1, 2026-11-20):
 * asked once on Now after the first non-Driving status tap (never on a Driving tap, when the
 * truck is about to roll), and never again — either answer is remembered, and More → Driving
 * alerts can change it later. A "Yes" speaks the confirmation for the status that raised it.
 */
function SpeakAskDialog({ closing = false }: { closing?: boolean }) {
  const yes = () => {
    setState({ speakAlerts: true, speechAsked: true, speakAskOpen: false });
    const rawCur = getState();
    const cur = { ...rawCur, config: safeRulesConfig(rawCur.config) };
    if (cur.current && cur.nowOverride === null) {
      if (cur.current.status === 'D') {
        try {
          const at = nowMin();
          const ev2 = evaluate(allSegments(cur, at), { asOf: at, config: cur.config });
          speakAloud(statusSpeech('D', cur.current.since, ev2.driveNow, ev2.mustStopBy));
        } catch { /* the setting is on either way; the next alert will speak */ }
      } else {
        speakAloud(statusSpeech(cur.current.status, cur.current.since));
      }
    }
  };
  const no = () => setState({ speakAlerts: false, speechAsked: true, speakAskOpen: false });
  return (
    <div class={`backdrop${closing ? ' is-closing' : ''}`} role={closing ? undefined : 'dialog'} aria-modal={closing ? undefined : 'true'} aria-labelledby={closing ? undefined : 'speakask-title'} inert={closing || undefined} aria-hidden={closing || undefined}>
      <div class="modal">
        <h2 id="speakask-title">Want the alerts read out loud?</h2>
        <p class="small">While you drive, Clock 14 can say the numbers out loud — how much driving is left at 60, 30 and 15 minutes, when time runs out, and a spoken confirmation when you tap a status — so you never have to read the screen. It uses this browser's voice. Nothing is recorded, and nothing leaves your phone.</p>
        <div class="row">
          <button class="primary" onClick={yes}>Yes, say them</button>
          <button onClick={no}>No thanks</button>
        </div>
        <p class="muted small">You can change this later under More → Driving alerts.</p>
      </div>
    </div>
  );
}

declare const __BUILD__: string;

/**
 * Startup disclaimer is driven by persisted `s.disclaimerAcked` (shown once until acknowledged).
 * `launchNotice` / `setLaunchNotice` stay exported as no-op compatibility state so test harnesses
 * that import `setLaunchNotice` continue to load cleanly.
 */
let launchNotice = false;
let backNav: BackNav | null = null;

/* ---------- home-screen shortcuts (capstone C3, audit §3 M14) ---------- */
export type GoTarget = 'load' | 'stopped' | 'recap' | 'unknown';
/** The shortcut's `go` value, or null when the address has none. An unrecognised value is 'unknown'. */
export function readGo(search: string): GoTarget | null {
  let v: string | null = null;
  try { v = new URLSearchParams(search).get('go'); } catch { return null; }
  if (v === null) return null;
  return v === 'load' || v === 'stopped' || v === 'recap' ? v : 'unknown';
}
/**
 * Land where the shortcut points: the load question, Hours coming back (both returning to
 * Now), or the status panel ("I've stopped"). An unknown value lands on Now. The panel waits
 * behind the launch disclaimer like every panel (the shell renders none while it is up).
 */
export function applyGo(go: GoTarget) {
  if (go === 'load' || go === 'recap') setState({ tab: go, planReturn: 'now' });
  else if (go === 'stopped') openSheet({ kind: 'status' });
  else setState({ tab: 'now' });
}
export function setLaunchNotice(open: boolean) { launchNotice = open; }

/* ============================================================ panel strip */

/** Strip panels in swipe order (Plan — Now — Log).
 * Lorico (2026-11-21 transitions): Settings is no longer a strip panel or swipe destination;
 * it dissolves in as its own full-screen room outside the 3-panel horizontal snap strip. */
export const PANEL_ORDER: State['tab'][] = ['plan', 'now', 'log'];

/** Bottom-bar tabs in display order (Lorico, 2026-11-21: Plan — Now — Log; Settings moved to header gear). */
export const BAR_ORDER: State['tab'][] = ['plan', 'now', 'log'];

/** The panel the bottom bar lights for a tab: the planning screens sit under Plan (declutter
 * patch, 2026-11-05; Capstone C3 D10-A moved recap/history there too). */
export function navPanelOf(t: State['tab']): State['tab'] {
  return t === 'split' || t === 'trip' || t === 'load' || t === 'recap' || t === 'history' ? 'plan' : t;
}

type PlanToolId = 'load' | 'split' | 'trip' | 'recap' | 'history' | 'week' | 'rollout' | 'rescue' | 'stack' | 'motel' | 'legal' | 'flip' | 'miles' | 'myweek';

const PLAN_TOOL_LABEL: Record<PlanToolId, string> = {
  load: 'Can I take this load?',
  split: 'Plan a sleeper split',
  trip: 'Plan a run',
  recap: 'Hours coming back',
  history: 'Your last 8 days',
  week: 'Weekly recap vs. 34',
  rollout: 'When to roll & PTA',
  rescue: 'Split-sleeper rescue',
  stack: 'Stack my stops & loads',
  motel: 'Do I Make It Back or Motel?',
  legal: 'Can I Legally Use It?',
  flip: 'Flip My Clock',
  miles: 'Miles Left in My 70',
  myweek: 'My Week',
};

function activePlanToolOf(tab: State['tab'], weekOpen: boolean, rolloutOpen: boolean, rescueOpen: boolean, stackOpen: boolean, motelOpen: boolean, legalOpen: boolean, flipOpen: boolean, milesOpen: boolean, myWeekOpen: boolean): PlanToolId | null {
  if (tab === 'load' || tab === 'split' || tab === 'trip' || tab === 'recap' || tab === 'history') return tab;
  if (tab === 'plan') {
    if (myWeekOpen) return 'myweek';
    if (weekOpen) return 'week';
    if (rolloutOpen) return 'rollout';
    if (rescueOpen) return 'rescue';
    if (stackOpen) return 'stack';
    if (motelOpen) return 'motel';
    if (legalOpen) return 'legal';
    if (flipOpen) return 'flip';
    if (milesOpen) return 'miles';
  }
  return null;
}

function sheetSessionKey(k: SheetKind): string {
  switch (k.kind) {
    case 'lever': return `lever-${k.lever.id}`;
    case 'splitblock': return `splitblock-${k.block}`;
    case 'loadtime': return `loadtime-${k.field}`;
    case 'rollouttime': return `rollouttime-${k.apptDate}-${k.apptTime}-${k.entryTimeZone}`;
    case 'rescuetime': return `rescuetime-${k.deadlineMinute}`;
    case 'stacktime': return `stacktime-${k.mode}-${k.title}-${k.initialMinute}-${k.entryTimeZone}`;
    case 'fliptime': return `fliptime-${k.mode}-${k.initialMinute}-${k.targetHour ?? ''}-${k.targetMinute ?? ''}-${k.homeTimeZone}`;
    case 'milestime': return `milestime-${k.cutoffDowName}-${k.cutoffHour}-${k.cutoffMinute}-${k.homeTimeZone}`;
    case 'myweektime': return `myweektime-${k.mode}-${k.title}-${k.dateStr}-${k.timeStr}-${k.entryTimeZone}`;
    case 'confirm': return `confirm-${k.what}`;
    case 'edit': return `e${k.live ? 'live' : ''}${k.seg.start}-${k.live ? '' : k.seg.end}`;
    case 'add': return `a${k.inside?.start ?? ''}`;
    default: return k.kind;
  }
}

function isSheetVisibleForContext(k: SheetKind, s: State, driveUp: boolean, rolloutOpen: boolean, rescueOpen: boolean, stackOpen: boolean, flipOpen: boolean, milesOpen: boolean, myWeekOpen: boolean): boolean {
  if (driveUp) return k.kind === 'status' || k.kind === 'since';
  if (k.kind === 'splitblock') return s.tab === 'split';
  if (k.kind === 'loadtime') return s.tab === 'load';
  if (k.kind === 'triptime') return s.tab === 'trip';
  if (k.kind === 'rollouttime') return s.tab === 'plan' && rolloutOpen;
  if (k.kind === 'rescuetime') return s.tab === 'plan' && rescueOpen;
  if (k.kind === 'stacktime') return s.tab === 'plan' && stackOpen;
  if (k.kind === 'fliptime') return s.tab === 'plan' && flipOpen;
  if (k.kind === 'milestime') return s.tab === 'plan' && milesOpen;
  if (k.kind === 'myweektime') return s.tab === 'plan' && myWeekOpen;
  if (k.kind === 'daystart') return s.tab === 'settings';
  return true;
}

/* The panels live side by side in a horizontal scroll-snap strip — The Daily Number's
 * mechanism, copied at Lorico's word (2026-11-18): the browser's own scrolling decides
 * what a drag means, each page is its own vertical scroller, and the bottom bar follows
 * the strip's scroll position. The touch-classifying pager this replaces (a swipe only
 * counted from bare non-control space) is gone: on the Plan panel — four full-width
 * buttons — nearly every real touch started inside a control and was swallowed, so the
 * swipe worked exactly once, Now → Plan, and never again (see HANDOFF-SWIPE.md). */

/** rAF when the runtime has it, a timer otherwise (the test shim has no rAF). */
const rafOf = (cb: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => cb()) : (setTimeout(cb, 0) as unknown as number));
const cancelRafOf = (id: number): void => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id as unknown as ReturnType<typeof setTimeout>); };
const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Wire per-driver session isolation hooks into store.ts (called once at module load, after all helpers exist). */
registerSessionHooks({
  readUndoRaw: () => {
    try { return localStorage.getItem(UNDO_KEY); } catch { return null; }
  },
  writeUndoRaw: (raw) => {
    try {
      if (raw) localStorage.setItem(UNDO_KEY, raw);
      else localStorage.removeItem(UNDO_KEY);
    } catch { /* ignore */ }
    restoreUndo(raw);
    undoSubs.forEach((f) => f());
  },
  onSessionReset: () => {
    openSheet(null);
    openMyWeekPlanner(false);
    openWeekPlanner(false);
    openRolloutPlanner(false);
    openRescuePlanner(false);
    openStackPlanner(false);
    openMotelPlanner(false);
    openLegalPlanner(false);
    openFlipPlanner(false);
    openMilesPlanner(false);
    setDrivingPeek(null);
    setPrintReport(null);
    clearWeekHubCache();
    setTestingUnlocked(false);
    welcomeCheck(INITIAL_STATE, 0, null);
  },
});

export function App() {
  const drv = useDrivers();
  const pendingGoRef = useRef<GoTarget | null>(null);
  // Request persistent storage silently once at boot (receptionfix Scope 4 item 16).
  useEffect(() => { requestPersistentStorage(); }, []);
  // Brief splash artwork beat when stayUnlocked applies to a single driver, then land unlocked.
  useEffect(() => {
    if (!drv.gateOpen || !drv.pendingAutoUnlockId) return;
    const delay = prefersReducedMotion() ? 20 : STAY_UNLOCKED_SPLASH_MS;
    const id = setTimeout(() => { completeAutoUnlock(); }, delay);
    return () => clearTimeout(id);
  }, [drv.gateOpen, drv.pendingAutoUnlockId]);
  // Capture home-screen shortcut (?go=…) once on mount and clean the address. If the startup
  // splash gate is up, hold the shortcut until the driver unlocks (auto-unlock or PIN).
  useEffect(() => {
    const go = readGo(typeof location !== 'undefined' ? location.search : '');
    if (go === null) return;
    try { window.history.replaceState(window.history.state, '', './'); } catch { /* ignore */ }
    if (!drv.gateOpen) applyGo(go);
    else pendingGoRef.current = go;
  }, []);
  useEffect(() => {
    if (!drv.gateOpen && pendingGoRef.current !== null) {
      const go = pendingGoRef.current;
      pendingGoRef.current = null;
      applyGo(go);
    }
  }, [drv.gateOpen]);
  // While locked on the startup splash, keep the page theme synced to the device/stored preference.
  useEffect(() => {
    if (!drv.gateOpen) return;
    applyTheme(effectiveTheme(getState(), devicePrefersDark()));
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onFlip = () => applyTheme(effectiveTheme(getState(), devicePrefersDark()));
    mq.addEventListener?.('change', onFlip);
    return () => mq.removeEventListener?.('change', onFlip);
  }, [drv.gateOpen]);

  if (drv.gateOpen) {
    return <StartupSplash drivers={drv.drivers} stayUnlocked={drv.stayUnlocked} autoUnlockId={drv.pendingAutoUnlockId} />;
  }
  return (
    <AppShell
      key={drv.unlockedId ?? 'harness'}
      driverId={drv.unlockedId}
      driverName={drv.activeName}
      stayUnlocked={drv.stayUnlocked}
      driverCount={drv.drivers.length}
    />
  );
}

function AppShell({
  driverId, driverName, stayUnlocked, driverCount,
}: {
  driverId: string | null; driverName: string; stayUnlocked: boolean; driverCount: number;
}) {
  const rawState = useStore();
  const safeCfg = useMemo(() => safeRulesConfig(rawState.config), [rawState.config]);
  const s = useMemo(() => (safeCfg === rawState.config ? rawState : { ...rawState, config: safeCfg }), [rawState, safeCfg]);
  const now = useNow();
  // Startup disclaimer — dismissed for this launch only; a fresh launch shows it again.
  const [, redraw] = useState(0);
  const weekOpen = useWeekPlanner();
  const rolloutOpen = useRolloutPlanner();
  const rescueOpen = useRescuePlanner();
  const stackOpen = useStackPlanner();
  const motelOpen = useMotelPlanner();
  const legalOpen = useLegalPlanner();
  const flipOpen = useFlipPlanner();
  const milesOpen = useMilesPlanner();
  const myWeekOpen = useMyWeekPlanner();
  // Panel strip: the <main class="pages"> element, and the panel the bottom bar currently
  // lights — the strip's nearest snapped panel while a gesture runs, the store's panel at
  // rest (The Daily Number's scroll-follows-the-strip bar, adapted to a store-driven app).
  // Settings and every Plan tool sub-screen open as full-screen rooms outside the 3-panel
  // strip (Lorico, 2026-11-21 transitions + plan-dissolve): the strip stays mounted and
  // untouched behind the room so entering/leaving never scrolls the strip and preserves state.
  const inSettings = s.tab === 'settings';
  const activePlanTool = activePlanToolOf(s.tab, weekOpen, rolloutOpen, rescueOpen, stackOpen, motelOpen, legalOpen, flipOpen, milesOpen, myWeekOpen);
  const inPlanTool = activePlanTool !== null;
  const inRoom = inSettings || inPlanTool;
  const settingsReturnTab = useRef<State['tab']>(s.tab === 'settings' ? 'now' : s.tab);
  if (s.tab !== 'settings') settingsReturnTab.current = s.tab;
  const lastStripPanel = useRef<State['tab']>(
    inSettings ? 'now' : inPlanTool ? (s.planReturn === 'now' ? 'now' : 'plan') : s.tab,
  );
  if (!inRoom) lastStripPanel.current = s.tab;
  const stripPanel = lastStripPanel.current;
  const wasInRoom = useRef(inRoom);
  const wasInSettings = useRef(inSettings);
  const prevPlanTool = useRef<PlanToolId | null>(activePlanTool);
  const settingsRef = useRef<HTMLElement>(null);
  const planRoomRef = useRef<HTMLElement>(null);
  // Keep the closing Plan tool mounted (inert + aria-hidden) across the 220ms dissolve-out
  // so exit cross-fades cleanly like Settings, then unmount to preserve each tool's lifecycle.
  const [retainedTool, setRetainedTool] = useState<{ tool: PlanToolId; epoch: number } | null>(
    () => (activePlanTool ? { tool: activePlanTool, epoch: 1 } : null),
  );
  const toolEpochRef = useRef(activePlanTool ? 1 : 0);
  const wasToolOpenRef = useRef(inPlanTool);
  const prevSwapToolRef = useRef<PlanToolId | null>(activePlanTool);
  const roomSwapEpochRef = useRef(0);
  const activeRoomSwapRef = useRef(0);
  const [, setRoomSwapDone] = useState(0);
  if (activePlanTool !== prevSwapToolRef.current) {
    const switchingInsideRoom = prevSwapToolRef.current !== null && activePlanTool !== null;
    prevSwapToolRef.current = activePlanTool;
    activeRoomSwapRef.current = switchingInsideRoom && !prefersReducedMotion() ? ++roomSwapEpochRef.current : 0;
  }
  const roomSwap = inPlanTool && !prefersReducedMotion() && activeRoomSwapRef.current > 0;
  useEffect(() => {
    const epoch = activeRoomSwapRef.current;
    if (epoch === 0) return;
    if (prefersReducedMotion()) {
      activeRoomSwapRef.current = 0;
      setRoomSwapDone((n) => n + 1);
      return;
    }
    const id = setTimeout(() => {
      if (activeRoomSwapRef.current === epoch) {
        activeRoomSwapRef.current = 0;
        setRoomSwapDone((n) => n + 1);
      }
    }, 220);
    return () => clearTimeout(id);
  }, [activePlanTool]);
  const activeEntry = activePlanTool
    ? (retainedTool && retainedTool.tool === activePlanTool && (wasToolOpenRef.current || wasInSettings.current)
        ? retainedTool
        : { tool: activePlanTool, epoch: ++toolEpochRef.current })
    : null;
  wasToolOpenRef.current = inPlanTool;
  const preserveBehindSettings = inSettings && retainedTool !== null
    && activePlanToolOf(settingsReturnTab.current, weekOpen, rolloutOpen, rescueOpen, stackOpen, motelOpen, legalOpen, flipOpen, milesOpen, myWeekOpen) === retainedTool.tool;
  const showRetained = !inPlanTool && retainedTool !== null && (preserveBehindSettings || (!inSettings && !prefersReducedMotion()));
  const displayedTool = activeEntry ?? (showRetained ? retainedTool : null);
  useEffect(() => {
    if (activeEntry) {
      if (retainedTool !== activeEntry) setRetainedTool(activeEntry);
      return;
    }
    if (!retainedTool || preserveBehindSettings) return;
    if (inSettings || prefersReducedMotion()) {
      setRetainedTool(null);
      return;
    }
    const id = setTimeout(() => setRetainedTool(null), 220);
    return () => clearTimeout(id);
  }, [activePlanTool, inSettings, preserveBehindSettings]);
  const pagesRef = useRef<HTMLElement>(null);
  const [barPanel, setBarPanel] = useState<State['tab']>(() => stripPanel);
  const barPanelRef = useRef(barPanel);
  const stripRaf = useRef(0);
  const stripSettle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stripPlacedEl = useRef<HTMLElement | null>(null);
  // The panel index a programmatic scroll (tab tap, restore, back) is travelling to, or
  // null when the strip is the driver's own. A settle may never commit a different
  // panel than the goal while one is set: a smooth scroll can pause its events for
  // longer than the settle window mid-flight, and committing the panel it happens to
  // be passing would fight the very tap that sent it there.
  const stripGoal = useRef<number | null>(null);
  // Haptic timing (Lorico, 2026-11-20: "The haptic feedback should happen only when the
  // screen locks into place. Both the swiping and the tapping."). lockedPanel is the panel
  // the strip last locked onto; tapGoal is the panel index a tab-bar tap sent it gliding
  // to (null when no tap glide is pending). The settle commit ticks once when it locks
  // onto a panel other than lockedPanel — for a swipe, or for a tab tap's glide.
  const lockedPanel = useRef<State['tab']>(stripPanel);
  const tapGoal = useRef<number | null>(null);
  // Pass-through ticks (owner amendment A, 2026-11-20): while a tab tap's SMOOTH glide crosses
  // panels on its way to the goal, one tick as the strip passes each intermediate panel
  // (Plan→More: Now, Log, then the lock tick at More = 3; Now→More: Log, then the lock tick
  // at More = 2). `next` is the next intermediate panel index still to pass, `dir` the travel
  // direction. null = no tap glide in flight. Swipes never set it (they keep the one-tick-at-settle rule).
  const tapPass = useRef<{ next: number; dir: number; goal: number } | null>(null);
  const printReport = usePrintReport();
  const lastPrintedSeq = useRef(0);
  useEffect(() => {
    if (!printReport || printReport.seq === lastPrintedSeq.current) return;
    lastPrintedSeq.current = printReport.seq;
    let r1 = 0, r2 = 0;
    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const prevTitle = typeof document !== 'undefined' ? document.title : '';
    const pdfBase = worksheetFilename(driverName, printReport.generatedAtMs).replace(/\.pdf$/i, '');
    const restore = () => {
      if (restoreTimer !== null) { clearTimeout(restoreTimer); restoreTimer = null; }
      if (typeof document !== 'undefined' && document.title === pdfBase) document.title = prevTitle;
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('afterprint', restore);
      }
    };
    const go = () => {
      if (typeof document !== 'undefined') document.title = pdfBase;
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('afterprint', restore, { once: true });
      }
      if (typeof window !== 'undefined' && typeof window.print === 'function') window.print();
      restoreTimer = setTimeout(restore, 1500);
    };
    r1 = rafOf(() => { r2 = rafOf(go); });
    return () => { cancelRafOf(r1); if (r2) cancelRafOf(r2); restore(); };
  }, [printReport, driverName]);
  // The screen wears the theme the SCREEN rule gives (patch 7's effective theme, with patch
  // 16's dark-driving rule on top — decision D1-A): an un-chosen default follows the phone, so
  // a phone that flips to dark at sunset takes an un-chosen app with it; a chosen theme never
  // moves; and while the driving view is up inside the night window (19:00–07:00 on the
  // phone's own clock, setting on) the screen wears night whatever the rest of the app is
  // wearing. `now` is a dependency so the rule re-decides as the clock crosses the window's
  // edges, and the phone-flip listener stays attached for the same reason.
  const driveUp = showsDrivingView(s);
  useEffect(() => {
    applyTheme(screenTheme(s, devicePrefersDark(), driveUp, now));
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onFlip = () => { const st = getState(); applyTheme(screenTheme(st, devicePrefersDark(), showsDrivingView(st), st.nowOverride ?? nowMin())); };
    mq.addEventListener?.('change', onFlip);
    return () => mq.removeEventListener?.('change', onFlip);
  }, [s.theme, s.themeChosen, s.darkDriveAtNight, driveUp, now]);
  // The pinned strips and anchored scrolling sit below the header by its MEASURED height
  // (patch 16, P3): the header grows — a two-line status pill, the out-of-hours banner — and
  // a guessed constant quietly covered the top of whatever was pinned under it. The
  // stylesheet keeps the old constant as the fallback for first paint and for runtimes
  // without the observer.
  // evaluate() runs outside every tab's error boundary, so a throw here used to blank the whole app on
  // every launch (bug report C2). Catch it and offer a way out instead.
  const result = useMemo(() => {
    try { return { ev: evaluate(allSegments(s, now), { asOf: now, config: s.config }), err: null }; }
    catch (e) { return { ev: null, err: e instanceof Error ? e.message : String(e) }; }
  }, [s, now]);
  const ev = result.ev;
  useDrivingAlerts(s, now, ev);
  useWakeLock(wantsWakeLock(s.keepAwake, s.current?.status));
  // Any touch is permission to make sound: unlock it on every tap (cheap, and it also wakes audio that
  // a phone call or the system suspended), so a driver who reopens the app mid-drive hears the next
  // alert, and any alert that came due before the tap plays then (re-check N3).
  useEffect(() => {
    const f = () => { const was = audioReady(); unlockAudio(); if (!was) setTimeout(() => redraw((x) => x + 1), 50); };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, []);
  // A completed tap on any button gets one short buzz under the finger on Android (patch #6), so
  // the tap confirms itself without the driver looking at the screen. A click — not a press — so
  // drags and scrolls stay silent, and a disabled button never ticks. iPhones no-op in tapTick.
  useEffect(() => {
    const f = (e: Event) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button');
      // A key with its own haptic (the dock's status keys, capstone C3 M13) is never ticked twice.
      if (b && !(b as HTMLButtonElement).disabled && b.getAttribute?.('data-haptic') == null) tapTick();
    };
    document.addEventListener('click', f, true);
    return () => document.removeEventListener('click', f, true);
  }, []);
  const again = useDriveAgain(s, now, ev);
  const sheet = useSheet();
  const prevDriveUpRef = useRef(driveUp);
  const driveEnterRef = useRef(false);
  if (driveUp !== prevDriveUpRef.current) {
    driveEnterRef.current = driveUp && !prefersReducedMotion();
    prevDriveUpRef.current = driveUp;
  }
  const driveEnter = driveUp && driveEnterRef.current && !prefersReducedMotion();
  // Unified bottom-sheet & Log-entry morph lifecycle across ALL 14 sheet kinds.
  // Closing a sheet immediately clears currentSheet() / blocked / backNav while retaining the
  // exiting sheet (inert + aria-hidden) across the 200ms slide-down / morph-return exit, then
  // unmounts cleanly. Direct sheet-to-sheet switches, disclaimer, driving-view flips, and
  // prefers-reduced-motion: reduce bypass exit retention and unmount immediately.
  const visibleSheet = s.disclaimerAcked && sheet && isSheetVisibleForContext(sheet, s, driveUp, rolloutOpen, rescueOpen, stackOpen, flipOpen, milesOpen, myWeekOpen) ? sheet : null;
  const sheetEpochRef = useRef(visibleSheet ? 1 : 0);
  const prevVisibleKeyRef = useRef<string | null>(visibleSheet ? sheetSessionKey(visibleSheet) : null);
  const visibleKey = visibleSheet ? sheetSessionKey(visibleSheet) : null;
  if (visibleKey !== null && visibleKey !== prevVisibleKeyRef.current) {
    sheetEpochRef.current++;
  }
  prevVisibleKeyRef.current = visibleKey;
  const morphForSheet = (sh: SheetKind): SheetMorphOrigin | null => {
    if (sh.kind === 'edit') return activeMorphOrigin?.mode === 'log' ? activeMorphOrigin : null;
    if (isConvertedMorphKind(sh.kind)) {
      return activeMorphOrigin?.mode === 'opener' ? activeMorphOrigin : { mode: 'opener', el: null, rect: null };
    }
    return null;
  };
  type RetainedSheetEntry = { sheet: SheetKind; key: string; epoch: number; driveUp: boolean; morph: SheetMorphOrigin | null };
  const [retainedSheet, setRetainedSheet] = useState<RetainedSheetEntry | null>(() => (
    visibleSheet ? { sheet: visibleSheet, key: sheetSessionKey(visibleSheet), epoch: sheetEpochRef.current, driveUp, morph: morphForSheet(visibleSheet) } : null
  ));
  const activeSheetEntry: RetainedSheetEntry | null = visibleSheet
    ? {
        sheet: visibleSheet,
        key: visibleKey!,
        epoch: sheetEpochRef.current,
        driveUp,
        morph: retainedSheet && retainedSheet.key === visibleKey && retainedSheet.epoch === sheetEpochRef.current
          ? retainedSheet.morph
          : morphForSheet(visibleSheet),
      }
    : null;
  const sheetClosing = !visibleSheet && retainedSheet !== null && s.disclaimerAcked && sheet === null && retainedSheet.driveUp === driveUp && !prefersReducedMotion();
  const displayedSheet = activeSheetEntry ?? (sheetClosing ? retainedSheet : null);
  useEffect(() => {
    if (activeSheetEntry) {
      if (!retainedSheet || retainedSheet.sheet !== activeSheetEntry.sheet || retainedSheet.epoch !== activeSheetEntry.epoch || retainedSheet.morph !== activeSheetEntry.morph) {
        setRetainedSheet(activeSheetEntry);
      }
      return;
    }
    if (!retainedSheet) return;
    if (!s.disclaimerAcked || sheet !== null || retainedSheet.driveUp !== driveUp || prefersReducedMotion()) {
      setRetainedSheet(null);
      if (sheet === null) activeMorphOrigin = null;
      return;
    }
    const id = setTimeout(() => {
      setRetainedSheet(null);
      if (currentSheet() === null) activeMorphOrigin = null;
    }, 220);
    return () => clearTimeout(id);
  }, [visibleSheet, sheet, s.disclaimerAcked, driveUp]);
  // Unified centered modal exit retention (DisclaimerDialog + SpeakAskDialog): 200ms exit fade/scale.
  const discOpenNow = !s.disclaimerAcked;
  const [retainedDisc, setRetainedDisc] = useState<boolean>(() => discOpenNow);
  const discClosing = !discOpenNow && retainedDisc && !prefersReducedMotion();
  const showDiscModal = discOpenNow || discClosing;
  useEffect(() => {
    if (discOpenNow) { if (!retainedDisc) setRetainedDisc(true); return; }
    if (!retainedDisc) return;
    if (prefersReducedMotion()) { setRetainedDisc(false); return; }
    const id = setTimeout(() => setRetainedDisc(false), 220);
    return () => clearTimeout(id);
  }, [discOpenNow]);
  const speakOpenNow = s.disclaimerAcked && !driveUp && s.speakAskOpen;
  const [retainedSpeak, setRetainedSpeak] = useState<boolean>(() => speakOpenNow);
  const speakClosing = !speakOpenNow && retainedSpeak && s.disclaimerAcked && !driveUp && !prefersReducedMotion();
  const showSpeakModal = speakOpenNow || speakClosing;
  useEffect(() => {
    if (speakOpenNow) { if (!retainedSpeak) setRetainedSpeak(true); return; }
    if (!retainedSpeak) return;
    if (!s.disclaimerAcked || driveUp || prefersReducedMotion()) { setRetainedSpeak(false); return; }
    const id = setTimeout(() => setRetainedSpeak(false), 220);
    return () => clearTimeout(id);
  }, [speakOpenNow, s.disclaimerAcked, driveUp]);
  useEffect(() => {
    if (s.tab !== 'plan' && s.tab !== 'settings' && weekPlannerOpen) openWeekPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && rolloutPlannerOpen) openRolloutPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && rescuePlannerOpen) openRescuePlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && stackPlannerOpen) openStackPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && motelPlannerOpen) openMotelPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && legalPlannerOpen) openLegalPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && flipPlannerOpen) openFlipPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && milesPlannerOpen) openMilesPlanner(false);
    if (s.tab !== 'plan' && s.tab !== 'settings' && myWeekPlannerOpen) openMyWeekPlanner(false);
  }, [s.tab]);
  // Home-screen shortcut (?go=…) is captured and applied by outer App() so it respects the startup splash gate.
  // Capstone C3 (M5): the welcome-back check, on open and on each return to the foreground,
  // against the real clock only.
  useEffect(() => {
    const check = () => {
      const st = getState();
      if (st.nowOverride !== null) { welcomeCheck(st, 0, null); return; }
      const t = nowMin();
      let e: FullEvaluation | null = null;
      try { e = evaluate(allSegments(st, t), { asOf: t, config: safeRulesConfig(st.config) }); } catch { e = null; }
      welcomeCheck(st, t, e);
    };
    check();
    const f = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);
  // The phone's Back button closes a panel, steps back to Plan or Now, then leaves (backnav.ts, re-check M11).
  useEffect(() => {
    const nav = createBackNav(window.history, () => ({ tab: getState().tab === 'plan' ? (isMyWeekPlannerOpen() ? 'myweek' : isWeekPlannerOpen() ? 'week' : isRolloutPlannerOpen() ? 'rollout' : isRescuePlannerOpen() ? 'rescue' : isStackPlannerOpen() ? 'stack' : isMotelPlannerOpen() ? 'motel' : isLegalPlannerOpen() ? 'legal' : isFlipPlannerOpen() ? 'flip' : isMilesPlannerOpen() ? 'miles' : 'plan') : getState().tab, sheet: currentSheet() !== null }),
      { closeSheet: sheetBack, goTo: (tab) => { if (getState().tab === 'settings' && tab === 'now') { setState({ tab: settingsReturnTab.current }); return; } openMyWeekPlanner(false); openWeekPlanner(false); openRolloutPlanner(false); openRescuePlanner(false); openStackPlanner(false); openMotelPlanner(false); openLegalPlanner(false); openFlipPlanner(false); openMilesPlanner(false); setState({ tab }); } });
    backNav = nav;
    const f = () => nav.onPop();
    window.addEventListener('popstate', f);
    nav.sync();
    return () => { window.removeEventListener('popstate', f); backNav = null; };
  }, []);
  useEffect(() => { backNav?.sync(); }, [s.tab, sheet, weekOpen, rolloutOpen, rescueOpen, stackOpen, motelOpen, legalOpen, flipOpen, milesOpen, myWeekOpen]);
  if (!ev) {
    return (
      <div class="app"><main>
        <div class="card warn">
          <h3>Clock 14 could not calculate your clocks</h3>
          <p class="small">Your log is still saved. The error was:</p>
          <pre class="small" style="white-space:pre-wrap">{result.err}</pre>
          <p class="small">Resetting the rules settings (cycle, carrier day, time zone, exceptions) usually fixes this and keeps your log.</p>
          <div class="row">
            <button class="primary" onClick={() => setState({ config: { ...INITIAL_STATE.config } })}>Reset settings</button>
            {/* If a reset does not fix it, the driver must still be able to get the log out: it is not
                the bug's to keep (review of the QA patch). */}
            <button onClick={() => downloadExport(s)}>Export my log</button>
          </div>
        </div>
      </main></div>
    );
  }
  const TAB_META: Record<string, [string, string]> = { log: ['Log', I.log], now: ['Now', I.now], plan: ['Plan', I.plan] };
  const settingsOriginPanel = navPanelOf(settingsReturnTab.current);
  const returnLabel = settingsOriginPanel === 'plan' ? 'Plan' : settingsOriginPanel === 'log' ? 'Log' : 'Now';
  // The two global notices, defined once and ridden at the top of every strip page.
  const warnbox = s.nowOverride !== null ? (
    <p class="warnbox"><b>Simulated clock.</b> Every time on screen is worked out for {clock(now)} — a made-up time set under More → Testing, not the real time. Anything you change while it is up is thrown away when you go back to the real clock. <button class="mini" onClick={() => useRealClock()}>Use real clock</button></p>
  ) : null;
  const themeNoticeCard = s.themeNotice ? (
    <div class="card warn">
      <div class="row">
        <span class="small">Switched to the <b>Day</b> theme — it is the new default. The header switch or More will put it back to Night.</span>
        <button class="mini" onClick={() => setState({ themeNotice: false })}>Got it</button>
      </div>
    </div>
  ) : null;
  // A fresh clock is a demo, and the shell says so: the hero carries the stamp (see styles.css).
  const fresh = historyBasis(s, now) === 'fresh';
  // One-time startup disclaimer pop-up: shown whenever disclaimerAcked is false.
  const showDisclaimer = !s.disclaimerAcked;
  // Behind an open sheet or the startup disclaimer, nothing else can take focus or be read as current.
  const blocked = sheet !== null || showDisclaimer;
  // Panel strip: the bar lights the strip's nearest snapped panel while it scrolls
  // (rAF-throttled, like The Daily Number's pill); when the scroll settles, the store's
  // tab catches up — unless the current tab already lives on that panel (a planning
  // sub-screen sits on Plan and is never walked back to the Plan menu by a settle), or a
  // sheet/disclaimer owns the screen. The store is the strip's master the other way:
  // whenever the tab's panel changes any other way — a bar tap, the back button, a
  // shortcut, a restored state — the strip scrolls to meet it.
  const activeStripPanel = inRoom ? null : stripPanel;
  const isInRoomNow = () => {
    const t = getState().tab;
    return t === 'settings' || activePlanToolOf(t, isWeekPlannerOpen(), isRolloutPlannerOpen(), isRescuePlannerOpen(), isStackPlannerOpen(), isMotelPlannerOpen(), isLegalPlannerOpen(), isFlipPlannerOpen(), isMilesPlannerOpen(), isMyWeekPlannerOpen()) !== null;
  };
  const onPagesScroll = () => {
    if (isInRoomNow()) return;
    const el = pagesRef.current; if (!el) return;
    // Finish a programmatic smooth glide's sub-pixel tail once within 1px of its target snap
    // offset so an adjacent panel's flush edge (e.g. Now's dock) never lingers 1px inside view.
    if (stripGoal.current !== null && el.clientWidth > 0) {
      const gx = stripGoal.current * el.clientWidth;
      if (el.scrollLeft !== gx && Math.abs(el.scrollLeft - gx) <= 1) el.scrollLeft = gx;
    }
    cancelRafOf(stripRaf.current);
    stripRaf.current = rafOf(() => {
      if (isInRoomNow()) return;
      const w = el.clientWidth || 0; if (!w) return;
      const idx = Math.max(0, Math.min(PANEL_ORDER.length - 1, Math.round(el.scrollLeft / w)));
      const panel = PANEL_ORDER[idx];
      if (panel !== barPanelRef.current) { barPanelRef.current = panel; setBarPanel(panel); }
      // Amendment A: a tap glide ticks as it reaches each panel between its start and goal
      // (the goal itself ticks at the lock, below). Reaching = the strip's left edge arrives at
      // that panel's offset (1px slack), so a glide ticks where the panel is fully on screen.
      const pass = tapPass.current;
      if (pass && tapGoal.current === pass.goal && getState().disclaimerAcked && currentSheet() === null) {
        while (pass.next !== pass.goal && (pass.dir > 0 ? el.scrollLeft >= pass.next * w - 1 : el.scrollLeft <= pass.next * w + 1)) {
          tapTick();
          pass.next += pass.dir;
        }
      }
      if (stripSettle.current) clearTimeout(stripSettle.current);
      stripSettle.current = setTimeout(() => {
        stripSettle.current = null;
        if (!getState().disclaimerAcked || currentSheet() !== null || isInRoomNow()) return;
        const w2 = el.clientWidth || 0; if (!w2) return;
        const i2 = Math.max(0, Math.min(PANEL_ORDER.length - 1, Math.round(el.scrollLeft / w2)));
        if (Math.abs(el.scrollLeft - i2 * w2) > 2) return; // not resting on a page yet
        if (stripGoal.current !== null && stripGoal.current !== i2) return; // still travelling to the goal
        stripGoal.current = null;
        const target = PANEL_ORDER[i2];
        // The haptic click lives HERE, at the lock (feel round 2, 2026-11-19; haptic timing,
        // 2026-11-20): one short tick when the strip locks onto a panel other than the one it
        // was locked on before — never during a drag (this timer only fires after scrolling
        // stops). Two ways in: a swipe (the store still names the old panel, so this commit
        // moves it), or a tab-bar tap's glide arriving at the panel the tap sent it to (the
        // tab buttons carry data-haptic, so the tap itself is silent). A swipe that springs
        // back, a tap on the active tab, and a back-button / shortcut / restore glide (no
        // tapGoal) stay silent. Guarded: tapTick no-ops where navigator.vibrate is absent.
        const swiped = navPanelOf(getState().tab) !== target;
        const tapped = tapGoal.current === i2;
        tapGoal.current = null;
        tapPass.current = null;
        if (swiped) setState({ tab: target });
        if ((swiped || tapped) && target !== lockedPanel.current) tapTick();
        lockedPanel.current = target;
      }, 120);
    });
  };
  // A hand on the strip is the driver's own scroll: any programmatic goal is off.
  // A grab also ends a tap glide's pass-through ticks (the swipe's own settle rule takes over).
  const onStripGrab = () => { stripGoal.current = null; tapPass.current = null; };
  // R1 & R2 (DESIGN-NAV §4): seat the strip before paint (useLayoutEffect) whenever
  // stripPanel changes OR <main class="pages"> mounts (including returning from the driving
  // view, which unmounts the shell while stripPanel stays 'now'). A freshly mounted strip
  // jumps silently (behavior: 'auto') so first paint never flashes Plan and driving-view return
  // lands on Now. Entering any full-screen room (Settings or a Plan tool) leaves the strip
  // untouched (zero scroll) and resets the entering room's scrollTop to 0; returning to the
  // same panel also needs zero scroll, while leaving a room for a different panel seats
  // instantly (behavior: 'auto') so no sideways slide competes with the dissolve.
  useLayoutEffect(() => {
    if (inSettings && !wasInSettings.current && settingsRef.current) settingsRef.current.scrollTop = 0;
    wasInSettings.current = inSettings;
    if (inPlanTool && activePlanTool !== prevPlanTool.current && planRoomRef.current) planRoomRef.current.scrollTop = 0;
    prevPlanTool.current = activePlanTool;
    if (inRoom) {
      wasInRoom.current = true;
      stripGoal.current = null;
      tapGoal.current = null;
      tapPass.current = null;
      if (driveUp || !pagesRef.current) stripPlacedEl.current = null;
      return;
    }
    const returningFromRoom = wasInRoom.current;
    wasInRoom.current = false;
    if (barPanelRef.current !== stripPanel) { barPanelRef.current = stripPanel; setBarPanel(stripPanel); }
    const el = pagesRef.current;
    if (!el || driveUp) { stripPlacedEl.current = null; return; }
    if (typeof el.scrollTo !== 'function') return;
    const w = el.clientWidth || 0; if (!w) return;
    const idx = PANEL_ORDER.indexOf(stripPanel);
    if (idx < 0) return;
    const mountedNew = stripPlacedEl.current !== el;
    const moving = Math.abs(el.scrollLeft - idx * w) > 2;
    // Only a tab tap's glide ticks at its lock (tapGoal names this very panel); any other
    // store-driven move (back button, shortcut, restore, an in-panel button, a swipe's own
    // commit, or a fresh mount) takes its panel as the lock reference right away, silently — so a settle swallowed under a sheet can never
    // leave a stale reference behind. A tap that needs no glide (already resting there,
    // no settle on its way) locks now, silently: nothing moved.
    if (mountedNew || returningFromRoom || tapGoal.current !== idx || (!moving && stripSettle.current === null)) { lockedPanel.current = stripPanel; tapGoal.current = null; }
    tapPass.current = null;
    if (moving) {
      const smooth = !mountedNew && !returningFromRoom && !prefersReducedMotion();
      stripGoal.current = smooth ? idx : null;
      // Amendment A: only a tab tap's SMOOTH glide passes panels on screen; an instant jump
      // (reduced motion, first placement / remount, or exiting a room) shows nothing passing,
      // so it keeps the lock tick only (or silent for non-tap jumps).
      if (smooth && tapGoal.current === idx) {
        const dir = idx * w > el.scrollLeft ? 1 : -1;
        const next = dir > 0 ? Math.floor((el.scrollLeft + 1) / w) + 1 : Math.ceil((el.scrollLeft - 1) / w) - 1;
        tapPass.current = { next, dir, goal: idx };
      }
      el.scrollTo({ left: idx * w, behavior: smooth ? 'smooth' : 'auto' });
    }
    stripPlacedEl.current = el;
  }, [stripPanel, driveUp, inRoom, inSettings, inPlanTool, activePlanTool]);
  // A rotated or resized phone changes the page width under the strip: re-seat it on the
  // current panel, instantly, so the snap points line up again.
  useEffect(() => {
    const f = () => {
      const el = pagesRef.current; if (!el || typeof el.scrollTo !== 'function') return;
      const w = el.clientWidth || 0; if (!w) return;
      const panel = isInRoomNow() ? lastStripPanel.current : navPanelOf(getState().tab);
      const idx = PANEL_ORDER.indexOf(panel);
      if (idx >= 0) el.scrollTo({ left: idx * w, behavior: 'auto' });
    };
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const renderDisplayedSheet = () => {
    if (!displayedSheet || showDisclaimer) return null;
    const sh = displayedSheet.sheet;
    const mk = `${displayedSheet.key}-${displayedSheet.epoch}`;
    let inner: ComponentChildren = null;
    switch (sh.kind) {
      case 'status': inner = <StatusSheet key={mk} s={s} now={now} closing={sheetClosing} />; break;
      case 'since': inner = <SinceSheet key={mk} s={s} now={now} done={sh.done ?? null} closing={sheetClosing} />; break;
      case 'quickstart': inner = <QuickStartSheet key={mk} s={s} now={now} mode={sh.mode} closing={sheetClosing} />; break;
      case 'drift': inner = <DriftSheet key={mk} s={s} now={now} mode={sh.mode} closing={sheetClosing} />; break;
      case 'why': inner = <WhySheet key={mk} s={s} now={now} ev={ev} closing={sheetClosing} />; break;
      case 'exceptions': inner = <ExceptionsSheet key={mk} ev={ev} closing={sheetClosing} />; break;
      case 'lever': inner = <LeverSheet key={mk} s={s} now={now} ev={ev} lever={sh.lever} closing={sheetClosing} />; break;
      case 'splitblock': inner = <SplitBlockSheet key={mk} s={s} now={now} ev={ev} block={sh.block} closing={sheetClosing} />; break;
      case 'loadtime': inner = <LoadTimeSheet key={mk} s={s} now={now} field={sh.field} closing={sheetClosing} />; break;
      case 'triptime': inner = <TripTimeSheet key={mk} s={s} now={now} closing={sheetClosing} />; break;
      case 'rollouttime': inner = <RolloutTimeSheet key={mk} k={sh} now={now} closing={sheetClosing} />; break;
      case 'rescuetime': inner = <RescueTimeSheet key={mk} k={sh} now={now} closing={sheetClosing} />; break;
      case 'stacktime': inner = <StackTimeSheet key={mk} k={sh} now={now} closing={sheetClosing} />; break;
      case 'fliptime': inner = <FlipTimeSheet key={mk} k={sh} now={now} closing={sheetClosing} />; break;
      case 'milestime': inner = <MilesTimeSheet key={mk} k={sh} closing={sheetClosing} />; break;
      case 'myweektime': inner = <MyWeekTimeSheet key={mk} k={sh} now={now} closing={sheetClosing} />; break;
      case 'edit':
      case 'add': inner = <EditorSheet key={mk} k={sh} s={s} now={now} closing={sheetClosing} morphOrigin={displayedSheet.morph} />; break;
      case 'confirm': inner = <ConfirmSheet key={mk} s={s} now={now} what={sh.what} closing={sheetClosing} />; break;
      case 'daystart': inner = <DayStartSheet key={mk} s={s} closing={sheetClosing} />; break;
    }
    return <SheetMotionCtx.Provider value={{ closing: sheetClosing, morphOrigin: displayedSheet.morph }}>{inner}</SheetMotionCtx.Provider>;
  };
  if (showsDrivingView(s)) {
    return (
      <div class="app">
        <div inert={blocked}>
          <DrivingView s={s} now={now} ev={ev} again={again} enter={driveEnter} onDetails={() => { setDrivingPeek(s.current?.since ?? null); redraw((x) => x + 1); }} />
        </div>
        {renderDisplayedSheet()}
        {showDiscModal && <DisclaimerDialog closing={discClosing} />}
      </div>
    );
  }
  return (
    <div class={`${fresh ? 'app is-demo' : 'app'}${printReport ? ' has-print-report' : ''}${inRoom ? ' in-room' : ''}${inSettings ? ' in-settings' : ''}${inPlanTool ? ' in-plan-tool' : ''}`}>
      <TopBar ev={ev} now={now} s={s} inert={blocked || inRoom} ariaHidden={inRoom} onNow={s.tab === 'now'} onSettings={() => { if (getState().tab !== 'settings') setState({ tab: 'settings' }); }} settingsActive={inSettings} />
      {/* The three main panels side by side in the snap strip (Plan — Now — Log). Every page
          stays mounted and keeps its own scroll position; pages off the settled panel (and all
          three while Settings or a Plan tool room is open) are inert and aria-hidden. Settings
          and every Plan tool live outside the strip as full-screen rooms with a 220ms dissolve. */}
      <main ref={pagesRef} class="pages" inert={blocked || inRoom} aria-hidden={inRoom || undefined} onScroll={onPagesScroll} onPointerDown={onStripGrab} onTouchStart={onStripGrab} onWheel={onStripGrab}>
        <section class={`page page-plan${activeStripPanel === 'plan' ? ' is-active' : ''}`} inert={activeStripPanel !== 'plan'} aria-hidden={activeStripPanel !== 'plan'}>
          {warnbox}
          {themeNoticeCard}
          <Notices ev={ev} now={now} s={s} />
          <TabBoundary key="plan" tab="plan">
            <PlanTab s={s} now={now} ev={ev} isActive={s.tab === 'plan' && !inRoom} />
          </TabBoundary>
        </section>
        <section class={`page page-now has-dock${activeStripPanel === 'now' ? ' is-active' : ''}`} inert={activeStripPanel !== 'now'} aria-hidden={activeStripPanel !== 'now'}>
          {warnbox}
          {themeNoticeCard}
          <TabBoundary key="now" tab="now">
            <NowTab s={s} now={now} ev={ev} again={again} driverName={driverName} onExitPeek={() => { setDrivingPeek(null); redraw((x) => x + 1); }} />
          </TabBoundary>
        </section>
        <section class={`page page-log${activeStripPanel === 'log' ? ' is-active' : ''}`} inert={activeStripPanel !== 'log'} aria-hidden={activeStripPanel !== 'log'}>
          <TabBoundary key="log" tab="log">
            <LogTab s={s} now={now} ev={ev} notices={<>{warnbox}{themeNoticeCard}<Notices ev={ev} now={now} s={s} /></>} />
          </TabBoundary>
        </section>
      </main>
      <nav class="tabs" inert={blocked || inRoom} aria-hidden={inRoom || undefined}>{BAR_ORDER.map((k) => {
        const [l, icon] = TAB_META[k];
        const on = !inRoom && barPanel === k;
        const cls = on ? 'on' : '';
        // data-haptic: no tick on the tap — the strip's settle ticks when it locks onto the
        // panel (haptic timing, 2026-11-20). A tap on the panel already showing never ticks.
        return <button key={k} data-haptic="lock" class={cls} aria-current={on ? 'page' : undefined} onClick={() => { if (k === 'plan') { if (isMyWeekPlannerOpen()) openMyWeekPlanner(false); if (isWeekPlannerOpen()) openWeekPlanner(false); if (isRolloutPlannerOpen()) openRolloutPlanner(false); if (isRescuePlannerOpen()) openRescuePlanner(false); if (isStackPlannerOpen()) openStackPlanner(false); if (isMotelPlannerOpen()) openMotelPlanner(false); if (isLegalPlannerOpen()) openLegalPlanner(false); if (isFlipPlannerOpen()) openFlipPlanner(false); if (isMilesPlannerOpen()) openMilesPlanner(false); } if (navPanelOf(getState().tab) !== k) tapGoal.current = PANEL_ORDER.indexOf(k); setState({ tab: k }); }}><Icon d={icon} /> {l}</button>;
      })}</nav>
      <section ref={settingsRef} class={`page page-settings room settings-room${inSettings ? ' is-active' : ''}`} aria-label="Settings" inert={blocked || !inSettings} aria-hidden={!inSettings}>
        <div class="settings-head">
          <button type="button" class="back settings-back" data-settings-back aria-label={`Back to ${returnLabel}`} onClick={() => setState({ tab: settingsReturnTab.current })}><Icon d={I.back} /> {returnLabel}</button>
          <h1 class="settings-title">Settings</h1>
          {driverName && (
            <span class="settings-driver-pill" data-settings-driver-name={driverName}>
              <span class="driver-avatar driver-avatar-xs" aria-hidden="true">{driverInitials(driverName)}</span>
              <span class="settings-driver-text">{driverName}</span>
            </span>
          )}
        </div>
        {warnbox}
        {themeNoticeCard}
        <Notices ev={ev} now={now} s={s} />
        <TabBoundary key="settings" tab="settings">
          <SettingsTab s={s} now={now} ev={ev} driverId={driverId} driverName={driverName} stayUnlocked={stayUnlocked} driverCount={driverCount} />
        </TabBoundary>
      </section>
      <section
        ref={planRoomRef}
        class={`page page-tool room plan-room${inPlanTool ? ' is-active' : ''}${roomSwap ? ' room-swap' : ''}`}
        data-plan-tool={displayedTool?.tool ?? undefined}
        aria-label={displayedTool ? PLAN_TOOL_LABEL[displayedTool.tool] : undefined}
        inert={blocked || !inPlanTool}
        aria-hidden={!inPlanTool}
      >
        {displayedTool && (
          <>
            {warnbox}
            {themeNoticeCard}
            <Notices ev={ev} now={now} s={s} />
            <TabBoundary key={`${displayedTool.tool}-${displayedTool.epoch}`} tab={displayedTool.tool}>
              {displayedTool.tool === 'myweek' && <MyWeekTab s={s} now={now} active={inPlanTool && myWeekOpen} onBack={() => openMyWeekPlanner(false)} />}
              {displayedTool.tool === 'week' && <WeekRecapTab s={s} now={now} onBack={() => openWeekPlanner(false)} />}
              {displayedTool.tool === 'rollout' && <RolloutTab s={s} now={now} onBack={() => { const ret = rolloutReturnToMyWeek; openRolloutPlanner(false); if (ret) openMyWeekPlanner(true); }} />}
              {displayedTool.tool === 'rescue' && <RescueTab s={s} now={now} onBack={() => { const ret = rescueReturnToMyWeek; openRescuePlanner(false); if (ret) openMyWeekPlanner(true); }} />}
              {displayedTool.tool === 'stack' && <StackTab s={s} now={now} onBack={() => openStackPlanner(false)} />}
              {displayedTool.tool === 'motel' && <MotelTab s={s} now={now} onBack={() => openMotelPlanner(false)} />}
              {displayedTool.tool === 'legal' && <LegalTab s={s} now={now} onBack={() => openLegalPlanner(false)} />}
              {displayedTool.tool === 'flip' && <FlipTab s={s} now={now} onBack={() => openFlipPlanner(false)} />}
              {displayedTool.tool === 'miles' && <MilesTab s={s} now={now} onBack={() => openMilesPlanner(false)} />}
              {displayedTool.tool === 'split' && <SplitTab s={s} now={now} ev={ev} />}
              {displayedTool.tool === 'recap' && <RecapTab s={s} now={now} ev={ev} />}
              {displayedTool.tool === 'history' && <HistoryTab s={s} now={now} />}
              {displayedTool.tool === 'trip' && <TripTab s={s} now={now} ev={ev} />}
              {displayedTool.tool === 'load' && <LoadTab s={s} now={now} ev={ev} />}
            </TabBoundary>
          </>
        )}
      </section>
      {renderDisplayedSheet()}
      {showSpeakModal && <SpeakAskDialog closing={speakClosing} />}
      {showDiscModal && <DisclaimerDialog closing={discClosing} />}
      {printReport && <LogSummaryReport s={s} req={printReport} />}
    </div>
  );
}
