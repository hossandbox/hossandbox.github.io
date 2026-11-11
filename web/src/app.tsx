import { useEffect, useMemo, useState, useRef } from 'preact/hooks';
import { Component, type ComponentChildren } from 'preact';
import { createBackNav, type BackNav } from './backnav.ts';
import { alertTick, holdWakeLock, type WakeEnv, alertBanner, alertMessage, wantsWakeLock, unlockAudio, chime, buzz, tapTick, sound, audioReady, clearPendingSound, notify, notifyState, askNotify, canKeepAwake, NO_ALERTS, type AlertMemory, type NotifyState, speechReady, shouldAskSpeech, alertSpeech, statusSpeech } from './alerts.ts';

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
        <p class="small">Your log is safe. The other tabs still work. Please report this — $5 for the first person to report a confirmed bug, plus the paid App Store version free:</p>
        <pre class="small" style="white-space:pre-wrap">{this.state.err}</pre>
        <a class="btn" href={issue} target="_blank" rel="noopener">🐞 Report this crash</a>
        <button class="ghost" onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    );
  }
}
import {
  evaluate, driveAgainAt, pruneHistory, planTripAll, carrierDayStart, nextCarrierDayStart, TRIP_STRATEGIES, safeHaven, normalize, LIMITS, type TripStrategy, type Segment, type DutyStatus, type FullEvaluation, type Violation, type TripPlan, type TripInput, type RestPeriod,
} from '../../engine/src/index.ts';
import {
  useStore, setState, useNow, allSegments, toInput, fromInput, clock, clockFull, dur, hrs, STATUS_LABEL, STATUS_COLOR, segLabel, exportState, applySegmentEdit, adjustCurrentStart, statusBeingLeft, readMinutesAgo, type AdjustStartProblem, sanitizeBreaks, breakNote, noteFits, MAX_BREAKS, type BreakPreset, isValidTimeZone, listedZone, zoneLabel, zoneShort, zonePair, screenTheme, terminalMidnightOnDevice, TIME_ZONES, deviceTz, applyImportedState, draftResets, applyTheme, effectiveTheme, devicePrefersDark, chooseTheme, chooseTimeZone, historyBasis, historyDays, cycleBasis, applyDayPatch, dayPatchOverflow, stamp, meaningfulGaps, statusTap, dayClosePatch, reopenDayPatch, dayCloseFor, dayCloseToday, currentRunStart, joinDisplayRows, applyEldSeed, splitEstimateActive, cycleParamsOf, type EldClocks, readEldEntry, driftCheck, planDriftFill, DRIFT_NOTE, type DriftComparison, type DriftFillPlan, latestLegalDeparture, smallestRestFix, whyLever, DEFAULT_TRIP, DEFAULT_SPLIT, DEFAULT_LOADCHECK, type State, type TripDraft, type SplitDraft, type LoadCheckDraft, type Theme, nowMin, importProblem, INITIAL_STATE, getState, dateable, sanitizeDayCloses, sanitizeConfig, SIM_KEY,
} from './store.ts';
import {
  speechRecognitionCtor, speechSynthesisAvailable, speakAloud, parseClockUtterance, composeReadBack,
  beginVoice, voiceAccept, voiceFailure, voiceDiscard, type VoiceFlow, type SpeechRecognitionLike,
} from './voiceclocks.ts';
import { extractEldClocks, mergeExtractions } from './eldocr.ts';
import { computeLevers, pickChips, leverTitle, leverSub, leverRule, leverAfter, leverSplitPrefill, type Lever } from './levers.ts';

/* ============================================================ shared bits */

function Card({ title, children, tone }: { title?: string; children: ComponentChildren; tone?: 'warn' | 'bad' | 'good' }) {
  return <section class={`card ${tone ?? ''}`}>{title && <h2>{title}</h2>}{children}</section>;
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div class={`stat ${tone ?? ''}`}><div class="stat-label">{label}</div><div class="stat-value">{value}</div>{sub && <div class="stat-sub">{sub}</div>}</div>;
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
  return (
    <div class="slider">
      <div class="slider-head"><span>{label}{unit && <span class="muted"> · {unit}</span>}</span><b>{fmt(value)}</b></div>
      <div class="slider-row">
        {/* step=1 on both inputs so the range's exposed value always equals the real value. A coarse
            step makes the browser snap the control to min + k*step — 20 reads as 26, and with
            min=1/step=25 even the maximum (3000) was unreachable at 2976 (consumer-review-4). The
            −/+ buttons keep the coarse increment. */}
        <input type="range" aria-label={`${label}${unit ? ` (${unit})` : ''}`} min={min} max={max} step={1} value={value} onInput={(e) => set(Number((e.target as HTMLInputElement).value))} />
        <button class="mini" title={`Decrease by ${step}${unit ? ` ${unit}` : ''}`} aria-label={`Decrease ${label} by ${step}${unit ? ` ${unit}` : ''}`} onClick={() => set(value - step)}>−{step}</button>
        <input
          type="number" class="num" inputMode="numeric" aria-label={`${label}, type an exact value${unit ? ` in ${unit}` : ''}`}
          min={min} max={max} step={1} value={text}
          onInput={(e) => typed(e.target as HTMLInputElement)}
          onBlur={() => setText(String(value))}
        />
        <button class="mini" title={`Increase by ${step}${unit ? ` ${unit}` : ''}`} aria-label={`Increase ${label} by ${step}${unit ? ` ${unit}` : ''}`} onClick={() => set(value + step)}>+{step}</button>
      </div>
      {note && <div class="warnbox small">{note}</div>}
    </div>
  );
}
function Toggle<T extends string | boolean>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  // aria-pressed so the selected state exists for assistive tech, not only as a CSS class
  // (consumer-review-6, finding 6).
  return <div class="toggle" role="group">{options.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
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
  if (!list.length) return <p class="ok">No violations.</p>;
  return <ul class="viol">{list.map((v, i) => <li key={i} class={v.severity}><b>{violationLabel[v.kind]}</b> · {dur(v.minutes)} · {clock(v.start)} → {clock(v.end)}{' '}<span class="sev" title="Size only says how much time is involved — any of these can be cited.">{severityWord[v.severity]}</span><br /><small>{v.detail}</small></li>)}</ul>;
}
/** Severity in the driver's words. The internal enum says "nominal", which reads as "acceptable" —
 *  nothing short of zero hours is acceptable; it is simply less (stress-test 2.8). */
const severityWord: Record<Violation['severity'], string> = { nominal: 'minor', violation: 'over', egregious: 'well over' };
/**
 * The binding limit in the driver's words. BREAK_30 is state-aware, and this is the whole point of
 * the reported bug: the 8-hour rule can be the binding limit while NO break is outstanding. A
 * qualifying break resets the counter, but the 480 min of fresh break headroom can still be less than
 * the drive time left (a break taken before ~3 h of driving does exactly this), so "limited by" lands
 * on BREAK_30 with the driver staring at a break they have just taken. Saying "due" there tells them
 * they owe a break they already took — so only say it when the counter has actually run out.
 */
function bindingLabel(ev: FullEvaluation): string {
  if (ev.binding === 'BREAK_30') return ev.shift.breakRemaining <= 0 ? '30-min break due' : `8 hours of driving (30-min break in ${dur(ev.shift.breakRemaining)})`;
  // Name the limit in full, with its number: "driving limit" did not say which one (redesign).
  switch (ev.binding) {
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hour driving limit`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hour window`;
    case 'CYCLE': return `${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day cycle`;
    default: return 'no limit';
  }
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
  const by = `limited by ${bindingLabel(ev)}${cite ? ` (${cite})` : ''}`;
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
function useShareButton(text: string) {
  const [note, setNote] = useState('');
  const onClick = async () => {
    const r = await shareVerdictText(text);
    if (r === 'shared') return;
    setNote(r === 'copied' ? 'Copied ✓' : 'Couldn’t share');
    window.setTimeout(() => setNote(''), 2500);
  };
  return <button class="link" onClick={onClick}><Icon d={I.share} size={18} /> {note || 'Share'}</button>;
}
/** Driver-facing names for a violation. The enum id (WINDOW_14, BREAK_30…) is internal, never UI copy. */
const violationLabel: Record<Violation['kind'], string> = {
  DRIVE_11: '11-hour driving limit',
  WINDOW_14: '14-hour duty window',
  BREAK_30: '30-minute break',
  CYCLE: '60/70-hour cycle limit',
};

const REPO = 'hossandbox/hossandbox.github.io';

/** Copies the exported state to the clipboard and opens a prefilled GitHub issue (email fallback if set). */
function reportBug(s: State, ev: FullEvaluation) {
  const json = exportState(s);
  // GitHub rejects issue URLs past ~8 KB (414/500), and the log is URL-encoded at roughly 1.5×, so
  // only a short log rides in the URL; anything longer goes via the clipboard (bug report C4).
  const clocks = `drive now ${dur(ev.driveNow)} (${ev.binding}) · ${ev.shift.limits.drive / 60}-hr left ${dur(ev.shift.driveRemaining)} · ${ev.shift.limits.window / 60}-hr left ${dur(ev.shift.windowRemaining)} · cycle left ${dur(ev.cycle.remaining)}`;
  navigator.clipboard?.writeText(json).catch(() => {});
  if (s.bugEmail) {
    const body = ['What I did:', '', 'What the app showed:', '', 'What I expected (ELD / reg):', '', `Build: ${__BUILD__}`, `Clocks: ${clocks}`, '', json.length < 1500 ? json : '(log copied to clipboard — paste here)'].join('\n');
    location.href = `mailto:${s.bugEmail}?subject=${encodeURIComponent('Split Decision bug')}&body=${encodeURIComponent(body)}`;
    return;
  }
  const q = new URLSearchParams({ template: 'bug-report.yml', title: '[bug] ', build: __BUILD__, clocks, log: json.length < 2500 ? json : '(log too long — it is on your clipboard; paste it here)' });
  window.open(`https://github.com/${REPO}/issues/new?${q}`, '_blank', 'noopener');
}
function BugButton({ s, ev }: { s: State; ev: FullEvaluation }) {
  return <button class="ghost" onClick={() => reportBug(s, ev)}>🐞 Report a bug{s.bugEmail ? ' (email)' : ' (GitHub)'}</button>;
}

/* ============================================================ icons */

/** Stroke icons, drawn in the current text colour. Decorative: every one sits next to a word. */
const I = {
  now: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  plan: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  recap: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  share: 'M12 14V4M7 9l5-5 5 5M5 13v8h14v-8',
  x: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM17 19.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z',
  bunk: 'M3 18V8M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6M7 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8',
  cup: 'M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4zM6 2v3M10 2v3M14 2v3',
  case: 'M4 7h16v13H4zM9 7V5a3 3 0 0 1 6 0v2',
  wheel: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 14v7M10.2 11.2 3.5 9.5M13.8 11.2l6.7-1.7',
  check: 'M5 12l5 5 9-10',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const STATUS_ICON: Record<DutyStatus, string> = { OFF: I.cup, SB: I.bunk, D: I.wheel, ON: I.case };

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
  | { kind: 'since' }
  | { kind: 'quickstart' }
  | { kind: 'drift' }
  | { kind: 'why' }
  | { kind: 'exceptions' }
  // A lever chip's sheet (capstone C1): the chip's sentence, its ghost axis, the rule and
  // the caveat. The lever travels in the descriptor, computed when the chip was tapped.
  | { kind: 'lever'; lever: Lever }
  // The Log's editor: which step is showing and the entry so far (see "the log editor" below).
  | { kind: 'edit'; seg: Segment; step?: EdStep; draft?: Draft }
  // `inside`: add something inside this entry. `day`: a minute of the day being viewed on the Log.
  // `resume`: the step a "Change" came from, to return to once the new answer is in.
  | { kind: 'add'; step?: EdStep; draft?: Draft; inside?: Segment; day?: number; resume?: EdStep };
let sheetNow: SheetKind | null = null;
const sheetSubs = new Set<() => void>();
export function openSheet(k: SheetKind | null) { sheetNow = k; sheetSubs.forEach((f) => f()); }
export function currentSheet(): SheetKind | null { return sheetNow; }
function useSheet(): SheetKind | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); sheetSubs.add(f); return () => { sheetSubs.delete(f); }; }, []);
  return sheetNow;
}

function Sheet({ title, children, onBack, focusKey }: { title: string; children: ComponentChildren; onBack?: () => void; focusKey?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the panel's own first action (marked data-first), else its first control. Again on each new
    // step of a panel that has steps (the Log's editor), so the new question is what is read out.
    const el = box.current?.querySelector<HTMLElement>('[data-first]') ?? box.current?.querySelector<HTMLElement>('button, input, select');
    el?.focus();
  }, [focusKey]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') openSheet(null); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div class="sheet-wrap">
      <button class="sheet-backdrop" tabIndex={-1} aria-label="Close" onClick={() => openSheet(null)} />
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={box}>
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
  // Patch 17 (M3, decision D7-A): the tap answers back out loud, and the first real Driving
  // tap asks the once-only question. A simulated clock is planning (patch 15): it never
  // speaks and never asks — the speech settings are device settings outside the sim
  // snapshot, so an answer given under one would outlive the "thrown away" record it was
  // made over. Nothing speaks before the driver's yes: the tap that triggers the question
  // is confirmed on screen only, exactly as before this patch.
  const sim = cur.nowOverride !== null;
  if (st === 'D' && shouldAskSpeech(cur, sim)) {
    setState({ speakAskOpen: true });
  } else if (speechReady(cur, sim)) {
    if (st === 'D') {
      try {
        const post = getState();
        const ev2 = evaluate(allSegments(post, now), { asOf: now, config: post.config });
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

type SimSnap = Pick<State, 'segments' | 'tentative' | 'current' | 'dayCloses' | 'historyAcknowledged' | 'config' | 'seededAt' | 'tzChosen'>;
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
          if (typeof snap.record.tzChosen === 'boolean') restore.tzChosen = snap.record.tzChosen;
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
export function adjustStartNow(newSince: number): string | null {
  const cur = getState();
  const now = cur.nowOverride ?? nowMin();
  const r = adjustCurrentStart(cur, newSince, now);
  if (!r.ok) return adjustStartProblemText(r.problem, cur, now);
  undoable(`${segLabel(cur.current!.status, cur.current!.note)} since ${clock(newSince, false)}`, () => {
    setState((c) => { const x = adjustCurrentStart(c, newSince, now); return x.ok ? x.patch : {}; });
  });
  return null;
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
    const segs = pruneHistory(allSegments(s, t), t, s.config), opts = { asOf: t, config: s.config };
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
function RestHero({ s, now, ev, again, tail }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain; tail?: ComponentChildren }) {
  const status = s.current?.status ?? 'OFF';
  const resting = status === 'OFF' || status === 'SB';
  const { off, sb, before } = again;
  const cycleWord = `${ev.cycle.limit / 60}-hour`;
  const lead = status === 'D' ? <p class="hero-lead">No driving time left — stop driving.</p> : null;
  const why = <button class="link" onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button>;
  const share = useShareButton(shareText(ev, again.off));
  if (off === null) {
    return (
      <section class="hero bad">
        {lead}
        <div class="hero-label">Out of driving time</div>
        <p class="hero-text"><b>Driving does not come back within 36 hours of rest.</b> See <b>Recap</b> for when your {cycleWord} hours return.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
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
      <section class="hero warn">
        {lead}
        {time('30-min break needed — you can drive again at')}
        <p class="hero-text">Any 30 minutes in a row without driving counts — off duty, sleeper, or on-duty work like fueling.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
      </section>
    );
  }
  if (ev.binding === 'CYCLE') {
    return (
      <section class="hero warn">
        {lead}
        {time(`Out of ${cycleWord} hours — ${resting ? 'if you stay off duty, you' : 'go off duty now and you'} can drive again at`)}
        <p class="hero-text">On-duty work is allowed, but it counts toward your {cycleWord} hours and can push this later.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
      </section>
    );
  }
  if (resting) {
    return (
      <section class="hero">
        {time('You can drive again at')}
        <p class="hero-text">Going on duty before then is allowed (only driving is not), but it ends this rest: you will need 10 consecutive hours off, or a sleeper-berth split, before you drive.</p>
        <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
        {tail}
      </section>
    );
  }
  return (
    <section class="hero warn">
      {lead ?? <div class="hero-label">Out of driving hours</div>}
      <p class="hero-text"><b>On-duty work is allowed; driving is not.</b></p>
      {time('Go off duty now and you can drive again at')}
      {sb !== null && sb < off && <p class="hero-text">In the sleeper berth instead: <b>{clock(sb)}</b> ({dur(sb - now)} from now) — that completes a split.</p>}
      {before >= 30 && before < 600 && <p class="hero-text">Your {dur(before)} off before this does not count toward the 10 hours — they have to be consecutive{before >= 120 ? ', though it can still be the short half of a sleeper split' : ''}.</p>}
      <div class="hero-foot"><span class="hero-actions">{share}{why}</span></div>
      {tail}
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
    sound(r.fire <= 15); void notify(m.title, m.body);
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
 * The header: slim and opaque (redesign, 2026-10-10). It used to hold the four clocks and every
 * notice, which took 29% of the phone — 47% out of hours — and stayed pinned while scrolling; its
 * see-through bottom edge put the "drive again at" line on top of the status buttons. Now it carries
 * only what every screen needs: the status, the time, the theme switch, one line of driving time on the
 * screens that are not Now, and the driving alert.
 */
function TopBar({ ev, now, s, inert, again, onNow }: { ev: FullEvaluation; now: number; s: State; inert?: boolean; again: DriveAgain | null; onNow: boolean }) {
  const status = s.current?.status ?? 'OFF';
  // The switch flips what is on screen — the effective theme — and the tap records the choice, so
  // from then on the phone's setting no longer moves it (patch 7).
  const next = effectiveTheme(s, devicePrefersDark()) === 'day' ? 'night' : 'day';
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
    <header class="top" inert={inert} ref={headerRef}>
      <div class="top-row">
        <span class="pill" style={`--led: ${STATUS_COLOR[status]}`}>{segLabel(status, s.current?.note)}{s.current ? ` · ${dur(now - currentRunStart(s, now))}` : ''}</span>
        <span class="top-right">
          <span class="muted clock">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
          <button class="theme-btn" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={() => chooseTheme(next)}><Icon d={next === 'night' ? I.moon : I.sun} size={18} /> {next === 'night' ? 'Night' : 'Day'}</button>
        </span>
      </div>
      {!onNow && (ev.driveNow > 0
        ? <div class="compact"><b>{dur(ev.driveNow)}</b> of driving · Stop by <b>{clockFull(ev.mustStopBy)}</b></div>
        : again && again.off !== null && status !== 'D' && <div class="compact">{ev.binding === 'BREAK_30' ? '30-min break due' : ev.binding === 'CYCLE' ? `Out of ${ev.cycle.limit / 60}-hour hours` : 'Out of hours'} · <b>drive again at {clock(again.off)}</b></div>)}
      {/* On Now the out-of-hours card already says this; a second box saying the same thing was noise. */}
      {!(onNow && ev.driveNow <= 0) && <AlertBanner s={s} ev={ev} />}
      <div class="disclaimer-line">Planning only — not a log, not an ELD</div>
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
              <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {String(s.config.dayStartHour).padStart(2, '0')}:00 <b>{s.config.timeZone}</b>. A midnight recap is not midnight on the clock above.
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
          <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {String(s.config.dayStartHour).padStart(2, '0')}:00 <b>{s.config.timeZone}</b>. A midnight recap is not midnight on the clock above.
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
function HeroDrive({ ev, basis }: { ev: FullEvaluation; basis?: 'log' | 'estimate' | 'demo' }) {
  const share = useShareButton(shareText(ev, null));
  const tone = ev.driveNow < 60 ? 'warn' : 'good';
  const left = dur(ev.driveNow);
  // The full-date stop time from Declutter #1 is too wide for one line inside the dial at phone
  // widths — it wrapped mid-string and crossed the ring. Stack it deliberately instead: the date
  // as a quiet line over a larger time (patch #1.1). Split from clockFull so the dial can never
  // disagree with the wording every other surface shows.
  const [stopDate, stopTime] = clockFull(ev.mustStopBy).split(', ');
  return (
    <section class="hero">
      <Dial share={bindingShare(ev)} hours={bindingHours(ev)} tone={tone === 'warn' ? 'warn' : 'calm'} size={270} basis={basis}>
        <div class="hero-label">You can drive</div>
        <div class={`hero-value ${tone}`}>{left}</div>
        <div class="hero-stop"><span class="hero-stop-date">Stop by {stopDate}</span>{' '}<span class="hero-stop-time">{stopTime}</span></div>
        {basis === 'estimate' && <div class="hero-basis">estimate</div>}
      </Dial>
      <div class="hero-foot">
        <span class="limit-plate">limited by {bindingLabel(ev)}</span>
        <span class="hero-actions">{share}<button class="link" data-why onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button></span>
      </div>
      {(ev.shift.pendingSplitLeg || ev.shift.notes.length > 0) && (
        <div class="trust">{[ev.shift.pendingSplitLeg ? 'Split leg pending' : '', ev.shift.notes.length ? 'Exception active' : ''].filter(Boolean).join(' · ')}</div>
      )}
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
function TimeAxis({ from, lanes, wall, ghostWall, hazard, twin }: {
  from: number;
  lanes: AxisLane[];
  wall?: number | null;
  ghostWall?: number | null;
  hazard?: boolean;
  twin: string;
}) {
  const ends = lanes.flatMap((l) => [l.end, l.ghostEnd]).filter((x): x is number => x != null && Number.isFinite(x));
  const latest = Math.max(from, ...ends.filter((e) => e <= from + 960));
  const to = Math.max(from + 180, Math.min(from + 960, Math.ceil(latest / 30) * 30));
  const span = to - from;
  const step = span <= 360 ? 60 : span <= 720 ? 120 : 180;
  const grid: number[] = [];
  for (let m = Math.ceil(from / step) * step; m <= to; m += step) grid.push(m);
  const pct = (m: number) => Math.max(0, Math.min(100, ((m - from) / span) * 100));
  const hourLabel = (m: number) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', hourCycle: 'h23' }).format(new Date(m * 60000));
  const wallPct = wall != null && wall > from ? pct(wall) : null;
  const ghostWallPct = ghostWall != null && ghostWall > from ? pct(ghostWall) : null;
  const track = (l?: AxisLane) => (
    <span class={`taxis-track ${l?.ghostEnd != null ? 'has-ghost' : ''}`}>
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
          <span class="taxis-cap" style={{ left: `${pct(l.end)}%` }} />
          {l.end > to && <span class="taxis-arrow">→</span>}
        </>
      )}
      {ghostWallPct !== null && <span class="taxis-wall ghost" style={{ left: `${ghostWallPct}%` }} />}
      {wallPct !== null && <span class="taxis-wall" style={{ left: `${wallPct}%` }} />}
      {l?.bracket && <span class="taxis-bracket" title={l.bracket}>[</span>}
    </span>
  );
  return (
    <div class="taxis-wrap">
      <p class="vh">{twin}</p>
      <div class="taxis" aria-hidden="true">
        <div class="taxis-row taxis-head">
          <span class="taxis-label" />
          <span class="taxis-track taxis-track-head">
            {grid.map((g) => <span key={g} class="taxis-hour" style={{ left: `${pct(g)}%` }}>{hourLabel(g)}</span>)}
            {wallPct !== null && <span class="taxis-tag" style={{ left: `${wallPct}%` }}>STOP {clock(wall as number, false)}</span>}
            {ghostWallPct !== null && <span class="taxis-tag ghost" style={{ left: `${ghostWallPct}%` }}>STOP {clock(ghostWall as number, false)}</span>}
          </span>
          <span class="taxis-value" />
        </div>
        {lanes.map((l) => {
          const inner = (
            <>
              <span class="taxis-label"><span class="tl-full">{l.label}</span><span class="tl-short">{l.short}</span></span>
              {track(l)}
              <span class="taxis-value mono">{l.value}</span>
            </>
          );
          return l.onTap
            ? <button key={l.key} class="taxis-row taxis-tap" onClick={l.onTap}>{inner}</button>
            : <div key={l.key} class="taxis-row">{inner}</div>;
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
function TimelineDrive({ s, now, ev, basis }: { s: State; now: number; ev: FullEvaluation; basis: 'log' | 'estimate' | 'demo' }) {
  const share = useShareButton(shareText(ev, null));
  const tone = ev.driveNow < 60 ? 'warn' : 'good';
  const [stopDate, stopTime] = clockFull(ev.mustStopBy).split(', ');
  return (
    <section class="hero">
      <div class="tl-head">
        <div class="tl-main">
          <div class="hero-label">You can drive</div>
          <div class={`hero-value ${tone}`}>{dur(ev.driveNow)}</div>
          {basis === 'estimate' && <div class="hero-basis">estimate</div>}
        </div>
        <div class="hero-stop"><span class="hero-stop-date">Stop by {stopDate}</span>{' '}<span class="hero-stop-time">{stopTime}</span></div>
      </div>
      <TimeAxis from={now} lanes={limitsLanes(ev, basis)} wall={ev.mustStopBy} twin={limitsTwin(ev)} />
      <div class="hero-foot">
        <span class="limit-plate">limited by {bindingLabel(ev)}</span>
        <span class="hero-actions">{share}<button class="link" data-why onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button></span>
      </div>
      {(ev.shift.pendingSplitLeg || ev.shift.notes.length > 0) && (
        <div class="trust">{[ev.shift.pendingSplitLeg ? 'Split leg pending' : '', ev.shift.notes.length ? 'Exception active' : ''].filter(Boolean).join(' · ')}</div>
      )}
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
function LeverSheet({ s, now, ev, lever }: { s: State; now: number; ev: FullEvaluation; lever: Lever }) {
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
    <Sheet title={leverTitle(lever)}>
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
  return (
    <div class="dock">
      <div class="status-buttons">{(['OFF', 'SB', 'D', 'ON'] as DutyStatus[]).map((st) => {
        const on = s.current?.status === st && !s.current?.note;
        return <button key={st} style={`--led: ${STATUS_COLOR[st]}`} class={on ? 'on' : ''} aria-pressed={on} onClick={() => tapStatus(st)}>{on && <Icon d={I.check} size={16} />}{STATUS_LABEL[st]}</button>;
      })}</div>
      <button class="link dock-more" onClick={() => openSheet({ kind: 'status' })}>PC, yard move, or started earlier…</button>
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
function StatusUndoChip() {
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
    <div class="row undo">
      <span>{undo.label}.</span>
      <button class="mini" onClick={undoLast}>Undo</button>
    </div>
  );
}

function NowTab({ s, now, ev, again, onExitPeek }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain | null; onExitPeek: () => void }) {
  const warn = ev.shift.notes.filter((n) => n.startsWith('⚠'));
  const active = [ev.shift.exceptionKeys.adverse !== null ? 'Adverse conditions' : '', ev.shift.exceptionKeys.sixteen !== null ? '16-hour day' : ''].filter(Boolean);
  /** Today's day-close bookmark, when the day stands closed (patch 13; the store's one rule). */
  const closedToday = dayCloseToday(s, now);
  const undo = useUndo();
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
  const l3 = levers.find((l): l is Extract<Lever, { id: 'L3' }> => l.id === 'L3');
  return (
    <>
      {drivingPeeked(s) && <button class="wide" onClick={onExitPeek}>‹ Back to the driving view</button>}
      {timeline ? (
        ev.driveNow > 0 || !again
          ? <TimelineDrive s={s} now={now} ev={ev} basis={basis} />
          : <RestHero s={s} now={now} ev={ev} again={again} tail={<TimeAxis from={now} lanes={comebackLanes(s, ev, again, l3?.sbAt ?? null, l3 ? () => openSheet({ kind: 'lever', lever: l3 }) : undefined)} hazard={status === 'ON' || status === 'D'} twin={comebackTwin(ev, again, l3?.sbAt ?? null)} />} />
      ) : (
        ev.driveNow > 0 || !again ? <HeroDrive ev={ev} basis={basis} /> : <RestHero s={s} now={now} ev={ev} again={again} />
      )}
      {/* The one-time Timeline chip (decision C1-A): an existing install — a save holding
          a record — that is still on the dial sees it once, under the hero. Either tap
          answers it for good; the More → Planning switch is the standing way back. */}
      {!timeline && !s.nowCardAsked && (s.segments.length > 0 || s.current !== null) && (
        <div class="newcard">
          <span><b>New:</b> your limits on a timeline</span>
          <span class="newcard-btns">
            <button class="mini primary" onClick={() => setState({ nowCard: 'timeline', nowCardAsked: true })}>Show me</button>
            <button class="mini" onClick={() => setState({ nowCardAsked: true })}>Keep the dial</button>
          </span>
        </div>
      )}
      {timeline && <LeverChips chips={chips} />}
      {/* The record's notices ride under the answer as one-line chips (patch 16, P2): the hero
          leads the screen now — in the cab and in the 3 a.m. review alike, the wrap-up business
          (splitting, ending the day) waits below the number it wraps up. */}
      <Notices ev={ev} now={now} s={s} strip />
      {timeline ? <SplitPairChip ev={ev} /> : <SplitPairLine ev={ev} />}
      {/* The load question is the hook of the whole app, and it sat two taps away behind Plan
          (3 a.m. review, patch 7). It now rides Now itself, in the same dress the Plan hub and
          Recap give it, one tap from the screen the app opens on. */}
      <button class="plan-item" onClick={() => setState({ tab: 'load', planReturn: 'now' })}>
        <span class="plan-icon"><Icon d={I.truck} size={26} /></span>
        <span class="plan-text"><b>Can I take this load?</b><span class="muted small">Answer three questions, get a yes or no.</span></span>
        <Icon d={I.next} />
      </button>
      {!timeline && <Meters ev={ev} />}
      <Card title="Last 24 hours"><Grid segments={allSegments(s, now)} from={now - 1440} to={now} /></Card>
      {/* The drift check (patch 9): one number from the ELD, compared against the app's own.
          Only on a real record — on the DEMO clock there is no day to compare, and the DEMO
          notice already offers the quick start that creates one. */}
      {historyBasis(s, now) !== 'fresh' && (
        <button class="plan-item" onClick={() => openSheet({ kind: 'drift' })}>
          <span class="plan-icon"><Icon d={I.check} size={26} /></span>
          <span class="plan-text"><b>Check against my ELD</b><span class="muted small">One number lines this app up with your ELD.</span></span>
          <Icon d={I.next} />
        </button>
      )}
      {/* End my day (patch 13; moved below the grid as a plain wide key by patch 16, P9 —
          decision D6-A): the day's last act belongs at the end of the wrap-up, under the
          picture of the day it closes, not floating above the clocks in the pre-trip zone.
          Same gate as the drift check — the demo clock has no real day to close. While the
          close's own undo stands, the slot shows it above the closed line ("Closed the day
          at … · Undo", P9); the closed line and its Reopen — which clears the bookmark
          only — stay either way. New activity after the close reopens the day on its own
          (the dayCloseFor rule in the store) and the button comes back. */}
      {historyBasis(s, now) !== 'fresh' && (closedToday ? (
        <>
          {undo?.label === 'Closed the day' && (
            <div class="row undo">
              <span>Closed the day at {clock(closedToday.at, false)}</span>
              <button class="mini" onClick={undoLast}>Undo</button>
            </div>
          )}
          <div class="row undo">
            <span>Day closed · {clock(closedToday.at, false)}</span>
            <button class="mini" onClick={() => reopenDay(now)}>Reopen</button>
          </div>
        </>
      ) : (
        <button class="wide" onClick={() => endDay(now)}>End my day</button>
      ))}
      {/* Patch 19: the status the driver is in, with the way to fix when it started — the
          after-the-fact door for a tap made late (or early). The Log's live row says
          "change it on Now"; this is where. */}
      {s.current && (
        <button class="rowbtn" onClick={() => openSheet({ kind: 'since' })}>
          <span><span class="muted">{segLabel(s.current.status, s.current.note)} since {clock(s.current.since)}</span><br /><b>Fix the start time</b></span>
          <Icon d={I.next} />
        </button>
      )}
      <button class="rowbtn" onClick={() => openSheet({ kind: 'exceptions' })}>
        <span><span class="muted">Exceptions this shift</span><br /><b>{active.length ? active.join(' · ') : 'None'}</b></span>
        <Icon d={I.next} />
      </button>
      {/* The engine's shift notes carry their own ⚠; the warnbox shape now supplies it (patch 16, P5), so the baked-in one is dropped here to keep it single. */}
      {warn.map((n, i) => <p key={i} class="warnbox small">{n.replace(/^⚠\s*/, '')}</p>)}
      <StatusUndoChip />
      <StatusDock s={s} />
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

function DrivingView({ s, now, ev, again, onDetails }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain | null; onDetails: () => void }) {
  // 'calm', not 'ok': .ok is the app-wide green-text class and turned the whole screen green.
  const level = ev.driveNow <= 0 ? 'bad' : ev.driveNow <= 60 ? 'warn' : 'calm';
  const left = dur(ev.driveNow);
  return (
    <main class={`drive ${level}`} aria-live="polite">
      <div class="top-row">
        <span class="pill" style={`--led: ${STATUS_COLOR.D}`}>{segLabel('D', s.current?.note)} · {dur(now - currentRunStart(s, now))}</span>
        <span class="top-right">
          {/* time only: the weekday pushed the row onto two lines next to the capsule and Details */}
          <span class="drive-clock">{s.nowOverride ? `SIM ${clock(now, false)}` : clock(now, false)}</span>
          <button class="drive-details" onClick={onDetails}>Details</button>
        </span>
      </div>
      <div class="drive-body">
        <Dial share={bindingShare(ev)} hours={bindingHours(ev)} tone={level} size={320} basis={ringBasis(s, now, ev)}>
          <div class="drive-label">{level === 'bad' ? 'Out of driving time' : 'Driving left'}</div>
          <div class={`drive-num ${left.length > 4 ? '' : 'short'}`}>{left}</div>
        </Dial>
        <div class="drive-head">{level === 'bad' ? 'Park as soon as it is safe' : level === 'warn' ? 'Plan where you\u2019ll park' : `Stop by ${clockFull(ev.mustStopBy)}`}</div>
        <div class="drive-why">{level === 'bad' ? `Over the ${alertReason(ev)}` : level === 'warn' ? `Stop by ${clockFull(ev.mustStopBy)} · ${bindingLabel(ev)}` : `limited by ${bindingLabel(ev)}`}</div>
        {level === 'bad' && again?.off != null && <div class="drive-why">Off duty from now: drive again at <b>{clock(again.off)}</b></div>}
      </div>
      <div class="drive-foot">
        <div class="drive-note">{s.keepAwake ? 'Screen stays on' : 'Screen may lock'} · {soundNote(s.alertsOn, audioReady())}</div>
        <button class="drive-stop" onClick={() => openSheet({ kind: 'status' })}>I've stopped</button>
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
function QuickStartSheet({ s, now }: { s: State; now: number }) {
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
  const [done, setDone] = useState<{ notes: string[]; clocks: EldClocks } | null>(null);
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
  const shotRef = useRef<HTMLInputElement | null>(null);
  const importShot = async (file: File) => {
    setShotBusy(true);
    setShotErr(null);
    setShotNote(null);
    setErr(null);
    try {
      const { recognizeEldScreenshot } = await import('./eldocr-run.ts');
      const reads = await recognizeEldScreenshot(file);
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
    const { patch, notes } = applyEldSeed(getState(), clocks, now);
    setState(patch);
    setDone({ notes, clocks });
  };
  if (done) {
    return (
      <Sheet title="Start from my ELD clocks">
        <p>Your clocks are set from those four numbers.</p>
        <p class="small">The four clocks as read:</p>
        <ul class="small">{fields.map((f) => <li key={f.key}>{f.label}: <b>{dur(done.clocks[f.key])}</b></li>)}</ul>
        {done.notes.length > 0 ? (
          <>
            <p class="small">Read the strict way, because the numbers disagreed or ran past a limit:</p>
            <ul class="small">{done.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </>
        ) : <p class="small">Nothing had to be adjusted.</p>}
        <p class="trust">You're set to <b>Off Duty</b> for now — tap your real status when it changes. The rows this built are marked “ELD clocks” on the Log, and split answers carry an <b>Estimate</b> label until your own entries replace them.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>See my clocks</button></div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Start from my ELD clocks">
      <p class="small">Type the four clocks your ELD shows. The app builds a starting record from them — an estimate that firms up as you log your real day.</p>
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
        <div>
          <p><b>Here’s what I heard — check it before you set anything:</b></p>
          <ul class="small">{fields.map((f) => <li key={f.key}>{f.label}: <b>{dur(Number(txt[f.key][0]) * 60 + Number(txt[f.key][1]))}</b></li>)}</ul>
          <p class="small">A wrong number? Fix its box by hand — nothing is set until you tap “Set my clocks”.</p>
          <div class="row"><button class="ghost" onClick={cancelVoice}>Start over</button></div>
        </div>
      )}
      {!voice && (
        <div>
          <div class="row">
            <button class="ghost" disabled={shotBusy} onClick={() => shotRef.current?.click()}>{shotBusy ? 'Reading screenshot…' : 'Import from a screenshot'}</button>
          </div>
          <input type="file" accept="image/*" style="display:none" ref={shotRef}
            onChange={(e) => { const el = e.target as HTMLInputElement; const f = el.files?.[0]; el.value = ''; if (f) void importShot(f); }} />
          <p class="muted small">Pick a screenshot of your ELD's clocks screen. It is read on this phone and thrown away — never sent or saved anywhere.</p>
        </div>
      )}
      {shotNote && (
        <ul class="small">{shotNote.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      {shotErr && <p class="warnbox small">{shotErr}</p>}
      {err && <p class="warnbox small">{err}</p>}
      <div class="row"><button class="primary" data-first onClick={confirm}>Set my clocks</button></div>
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
function DriftSheet({ s, now }: { s: State; now: number }) {
  const [txt, setTxt] = useState<[string, string]>(['', '']);
  const [err, setErr] = useState<string | null>(null);
  const [found, setFound] = useState<{ check: DriftComparison; at: number; eld: number } | null>(null);
  const [filled, setFilled] = useState<{ plan: DriftFillPlan; after: DriftComparison } | null>(null);

  // On the DEMO clock there is no real day to compare against — send the driver to the quick
  // start that creates one instead of running a comparison against assumed numbers.
  if (historyBasis(s, now) === 'fresh') {
    return (
      <Sheet title="Check against my ELD">
        <p class="small">There's nothing to check yet — this app is still on its demo clock, so there's no real day to compare with your ELD. Start from your ELD clocks first; the check works once your real day is in.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet({ kind: 'quickstart' })}>Start from my ELD clocks</button></div>
      </Sheet>
    );
  }

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
    setFound({ check: driftCheck(getState(), eld, now), at: now, eld });
  };

  if (filled && found) {
    const { plan, after } = filled;
    return (
      <Sheet title="Check against my ELD">
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
        <Sheet title="Check against my ELD">
          <p><b>You're in sync</b> — this app and your ELD agree. Drive time left: {dur(check.appLeft)} either way you read it.</p>
          <p class="small">Your ELD says: <b>{dur(check.eldLeft)}</b> of drive time left.</p>
          <p class="small">Nothing was changed.</p>
          <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>Done</button></div>
        </Sheet>
      );
    }
    if (check.verdict === 'extra') {
      return (
        <Sheet title="Check against my ELD">
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
      <Sheet title="Check against my ELD">
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
    <Sheet title="Check against my ELD">
      <p class="small">Your ELD is the official record — this just lines the app up with it. Type the drive time left your ELD shows, and the app compares it with its own.</p>
      <p class="muted small">Whole hours in the hours box — part of an hour goes in the minutes box.</p>
      <div class="qs-row">
        <span class="qs-label">Drive time left on your ELD<span class="muted small"> — the {LIMITS.DRIVE / 60}-hour driving clock</span></span>
        <span class="qs-inputs">
          <input type="number" class="num" inputMode="numeric" min={0} aria-label="Drive time left on your ELD, hours" value={txt[0]}
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => [v, p[1]]); }} />
          <span aria-hidden="true">h</span>
          <input type="number" class="num" inputMode="numeric" min={0} aria-label="Drive time left on your ELD, minutes" value={txt[1]}
            onInput={(e) => { const v = (e.target as HTMLInputElement).value; setTxt((p) => [p[0], v]); }} />
          <span aria-hidden="true">m</span>
        </span>
      </div>
      {err && <p class="warnbox small">{err}</p>}
      <div class="row"><button class="primary" data-first onClick={compare}>Compare</button></div>
    </Sheet>
  );
}

function StatusSheet({ s, now }: { s: State; now: number }) {
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
    <Sheet title="What are you doing now?">
      <div class="big-status">{(['OFF', 'SB', 'ON', 'D'] as DutyStatus[]).map((st, i) => (
        <button key={st} data-first={i === 0 ? true : undefined} style={`--led: ${STATUS_COLOR[st]}`} class={isOn(st) ? 'on' : ''} aria-pressed={isOn(st)} onClick={() => pick(st)}>
          <Icon d={STATUS_ICON[st]} size={26} /><span>{STATUS_LABEL[st]}</span>
        </button>
      ))}</div>
      <div class="row">
        <button class={isOn('OFF', 'PC') ? 'on-outline' : ''} aria-pressed={isOn('OFF', 'PC')} onClick={() => pick('OFF', 'PC')}>Personal conveyance</button>
        <button class={isOn('ON', 'YM') ? 'on-outline' : ''} aria-pressed={isOn('ON', 'YM')} onClick={() => pick('ON', 'YM')}>Yard move</button>
      </div>
      <h3>When did it start?</h3>
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
      {cur && (
        <div class="row">
          <button onClick={() => openSheet({ kind: 'since' })}>Still {segLabel(cur.status, cur.note)}? Fix its start time</button>
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
function SinceSheet({ s, now }: { s: State; now: number }) {
  const cur = s.current;
  const [at, setAt] = useState<number>(cur ? cur.since : now);
  const [agoTxt, setAgoTxt] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  if (!cur) {
    return (
      <Sheet title="Fix the start time">
        <p class="small">{adjustStartProblemText('none', s, now)}</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>Close</button></div>
      </Sheet>
    );
  }
  const label = segLabel(cur.status, cur.note);
  if (done !== null) {
    return (
      <Sheet title="Fix the start time">
        <p><b>{label} since {clock(done)}</b></p>
        <p class="small">The entry before it ends at that time now, and every clock has been worked out again from it.</p>
        <p class="muted small">You can undo it from the Log.</p>
        <div class="row"><button class="primary" data-first onClick={() => openSheet(null)}>See my clocks</button></div>
      </Sheet>
    );
  }
  const set = (v: number) => { setAt(v); setAgoTxt(''); setErr(null); };
  const read = readMinutesAgo(agoTxt);
  const typedProblem = read.ok || read.problem === 'empty' ? null
    : read.problem === 'fraction' ? 'Whole minutes only — 7, not 7.5.'
    : 'That box needs a plain number of minutes.';
  const check = adjustCurrentStart(s, at, now);
  const unchanged = at === cur.since;
  const problem = typedProblem ?? (check.ok || unchanged ? null : adjustStartProblemText(check.problem, s, now));
  const key = (delta: number, text: string, aria: string) => <button key={delta} aria-label={aria} onClick={() => set(at + delta)}>{text}</button>;
  const pickDate = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return;
    const t = new Date(at * 60000);
    set(Math.floor(new Date(+m[1], +m[2] - 1, +m[3], t.getHours(), t.getMinutes()).getTime() / 60000));
  };
  const pickTime = (v: string) => {
    const m = /^(\d{2}):(\d{2})/.exec(v);
    if (!m) return;
    const t = new Date(at * 60000);
    t.setHours(+m[1], +m[2], 0, 0);
    set(Math.floor(t.getTime() / 60000));
  };
  const typeAgo = (v: string) => {
    setAgoTxt(v); setErr(null);
    const r = readMinutesAgo(v);
    if (r.ok) setAt(now - r.minutes);
  };
  const apply = () => {
    if (problem || unchanged) return;
    const e = adjustStartNow(at);
    if (e) setErr(e); else setDone(at);
  };
  const chips = dayChips(now, false);
  const onChip = chips.some((c) => sameDay(c.at, at));
  return (
    <Sheet title="Fix the start time">
      <div class="ed-ctx">
        <span class="dot" style={{ background: STATUS_COLOR[cur.status] }} />
        <span class="ed-ctx-t">{label} since {clock(cur.since)}</span>
        <span />
      </div>
      <Question>When did it really start?</Question>
      <div class="chips ed-days" role="group" aria-label="Day">
        {chips.map((c) => <button key={c.label} class={sameDay(c.at, at) ? 'on' : undefined} aria-pressed={sameDay(c.at, at)} onClick={() => set(onDay(at, c.at))}>{c.label}</button>)}
      </div>
      <div class="ed-clock">
        <output class="mono" aria-live="polite" aria-label={`Started ${clock(at)}`}>{clock(at, false)}</output>
        <span>{new Date(at * 60000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>
      <div class="ed-keys four">{key(-5, '−5', '5 minutes earlier')}{key(-1, '−1', '1 minute earlier')}{key(1, '+1', '1 minute later')}{key(5, '+5', '5 minutes later')}</div>
      <label class="ed-day">Exact time<input type="time" aria-label="Exact start time" value={toInput(at).slice(11, 16)} onInput={(e) => pickTime((e.target as HTMLInputElement).value)} /></label>
      <div class="qs-row">
        <span class="qs-label">Or minutes ago<span class="muted small"> — whole minutes</span></span>
        <span class="qs-inputs">
          <input type="number" class="num" inputMode="numeric" min={0} aria-label="Started this many minutes ago" value={agoTxt}
            onInput={(e) => typeAgo((e.target as HTMLInputElement).value)} />
          <span aria-hidden="true">min ago</span>
        </span>
      </div>
      <label class="ed-day">Another day<input type="date" value={dateInput(at)} class={onChip ? undefined : 'on'} onInput={(e) => pickDate((e.target as HTMLInputElement).value)} /></label>
      {(problem || err) && <div class="warnbox small">{problem ?? err}</div>}
      <button class="primary wide ed-go" disabled={!!problem || unchanged} onClick={apply}>{unchanged ? 'Pick the real start time' : `Set start to ${clock(at)}`}</button>
      <p class="muted small ed-foot">You can undo it from the Log.</p>
    </Sheet>
  );
}

/** Each rule's own stop time, if he drove from now without stopping; the earliest one is the answer. */
function WhySheet({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
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
    <Sheet title={ev.driveNow > 0 ? `Why stop by ${clockFull(ev.mustStopBy)}?` : 'Why can’t I drive?'}>
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

function ExceptionsSheet({ ev }: { ev: FullEvaluation }) {
  const adverseOn = ev.shift.exceptionKeys.adverse !== null;
  const sixteenOn = ev.shift.exceptionKeys.sixteen !== null;
  return (
    <Sheet title="Exceptions this shift">
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

function Grid({ segments, from, to, tz, mark }: { segments: Segment[]; from: number; to: number; tz?: string; mark?: { start: number; end: number } }) {
  const rows: DutyStatus[] = ['OFF', 'SB', 'D', 'ON'];
  const W = 360, H = 88, left = 34, rowH = 18;
  const x = (m: number) => left + ((Math.min(Math.max(m, from), to) - from) / (to - from)) * (W - left - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="grid">
      {rows.map((r, i) => <g key={r}><text x={2} y={12 + i * rowH + 8} class="grid-label">{r}</text><line x1={left} x2={W - 4} y1={12 + i * rowH + 9} y2={12 + i * rowH + 9} class="grid-line" /></g>)}
      {gridTicks(from, to, tz).map((t, i) => <line key={i} x1={x(t.m)} x2={x(t.m)} y1={10} y2={H - 6} class={t.major ? 'grid-tick major' : 'grid-tick'} />)}
      {segments.filter((s) => s.end > from && s.start < to).map((s, i) => {
        const y = 12 + rows.indexOf(s.status) * rowH + 9;
        return <line key={i} class={`s-${s.status}`} x1={x(s.start)} x2={x(s.end)} y1={y} y2={y} stroke-width={6} stroke-dasharray={s.tentative ? '4 3' : undefined} />;
      })}
      {mark && mark.end > from && mark.start < to && <rect class="grid-mark" x={x(mark.start) - 2} y={6} width={Math.max(4, x(mark.end) - x(mark.start) + 4)} height={H - 14} rx={3} />}
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
  try {
    if (u) localStorage.setItem(UNDO_KEY, JSON.stringify(u)); else localStorage.removeItem(UNDO_KEY);
  } catch { /* the undo still works for this session */ }
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
  if (undoRestored) { try { localStorage.removeItem(UNDO_KEY); } catch { /* ignore */ } }
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
  undoable(`Edited ${describe(seg)}`, () => setState((cur) => applySegmentEdit(cur, seg, fixed)));
  return null;
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
  undoable(`Added ${describe(row)}`, () => setState((cur) => ({ segments: [...cur.segments, row] })));
  return null;
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
  undoable(`Added ${describe(row)}`, () => setState((cur) => ({ segments: [...cur.segments, row] })));
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
export function endDay(now: number) {
  if (!dayClosePatch(getState(), now)) return;
  undoable('Closed the day', () => setState((cur) => dayClosePatch(cur, now) ?? {}));
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
  let start = carrierDayStart(now, s.config);
  for (let i = 0; i < back; i++) start = carrierDayStart(start - 1, s.config);
  return { start, end: nextCarrierDayStart(start, s.config) };
}

/**
 * The Log (redesign 3/5): one carrier day at a time, on the four-line grid drivers know from paper
 * logs and ELDs, with that day's totals and its entries as full-width rows. A row is one tap to an
 * edit panel — the small Edit and × buttons (25×28px) are gone, and delete lives inside the panel,
 * with undo. The resolved timeline and the overlap and violation reports are unchanged.
 */
function LogTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const [back, setBack] = useState(0);
  const undo = useUndo();
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

  return (
    <>
      <div class="daynav">
        <button class="icon-btn" aria-label="Previous day" disabled={!canBack} onClick={() => setBack(back + 1)}><Icon d={I.back} /></button>
        <div class="daynav-title"><b>{back === 0 ? `Today, ${dayName}` : dayName}</b><span class="muted small">Carrier day from {String(s.config.dayStartHour).padStart(2, '0')}:00{twoZones ? <> {s.config.timeZone} · {clock(day.start)} on this phone</> : null}</span></div>
        <button class="icon-btn" aria-label="Next day" disabled={back === 0} onClick={() => setBack(back - 1)}><Icon d={I.next} /></button>
      </div>
      <section class="card">
        {/* The resolved timeline, as the clocks read it: drawn raw, a break added inside a drive showed the
            drive running straight through it, on top of the break (log editor redesign, 2026-10-13). */}
        <Grid segments={resolved} from={day.start} to={day.end} tz={s.config.timeZone} />
        <div class="daytotals">
          {(['D', 'ON', 'OFF', 'SB'] as DutyStatus[]).map((k) => <div key={k}><span class="muted small">{STATUS_LABEL[k]}</span><b>{dur(dayTotals[k])}</b></div>)}
        </div>
      </section>
      {overlaps.length > 0 && (
        <div class="warnbox">
          <b>These entries overlap.</b> The later entry wins over the time it covers and the earlier one is split — so the clocks count the resolved timeline, which can be less than the rows below appear to add up to.
          <ul class="seglist">{overlaps.map((seg, i) => (
            <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
          ))}</ul>
        </div>
      )}
      {undo && (
        <div class="row undo">
          <span class="muted small">{undo.label}.</span>
          <button class="mini" onClick={() => { undoLast(); }}>Undo</button>
        </div>
      )}
      <Card title={showResolved ? `Resolved timeline (${resolved.length})` : `Entries on this day (${dayRows.length})`}>
        <div class="row">
          <button class={showResolved ? 'on-outline' : ''} onClick={() => setShowResolved(!showResolved)}>{showResolved ? '← Back to entries' : 'Show resolved timeline'}</button>
        </div>
        {showResolved ? (
          <>
            <p class="muted small">Oldest first — this is the timeline the clocks use, across your whole record: overlaps already resolved, and your current status included. Read-only; go back to entries to change anything.</p>
            <ul class="seglist">{resolved.map((seg, i) => (
              <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
            ))}
            {s.current && now <= s.current.since && (
              <li><span class="dot" style={{ background: STATUS_COLOR[s.current.status] }} /><span>{segLabel(s.current.status, s.current.note)}</span><span class="muted">since {clock(s.current.since)} · just started</span></li>
            )}</ul>
            <p class="small">Driving <b>{dur(totals.D)}</b> · On duty <b>{dur(totals.ON)}</b> · Off duty <b>{dur(totals.OFF)}</b> · Sleeper <b>{dur(totals.SB)}</b></p>
            <p class="muted small">Set your current status on the Now screen to keep this timeline moving.</p>
          </>
        ) : (
          <>
            {s.current && s.current.since < day.end && (back === 0) && (
              <div class="entry live"><span class="dot" style={{ background: STATUS_COLOR[s.current.status] }} /><span><b>{segLabel(s.current.status, s.current.note)}</b><span class="muted small">since {clock(s.current.since)} · now — change it on Now</span></span></div>
            )}
            {dayRows.map((seg, i) => (
              <button key={i} class="entry" aria-label={`Edit ${seg.tentative ? 'what-if ' : ''}${describe(seg)}`} onClick={() => openSheet({ kind: 'edit', seg })}>
                <span class="dot" style={{ background: STATUS_COLOR[seg.status] }} />
                <span><b>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</b><span class="muted small">{clock(seg.start)} → {clock(seg.end)}</span></span>
                <span class="entry-len">{dur(seg.end - seg.start)}</span>
                <Icon d={I.next} size={18} />
              </button>
            ))}
            {!dayRows.length && !(s.current && back === 0) && <p class="muted">Nothing logged on this day.</p>}
          </>
        )}
      </Card>
      <button class="addbtn" onClick={() => openSheet(back === 0 ? { kind: 'add' } : { kind: 'add', day: day.start + 720 })}><Icon d={I.plus} /> Add a break or something I forgot</button>
      <Card title="Violations in your log"><ViolationList items={ev.violations.filter((v) => !v.tentative)} /></Card>
      {ev.violations.some((v) => v.tentative) && (
        <Card title="This plan would violate" tone="warn">
          <p class="muted small">These come from the what-if rows you placed, not from duty you have logged. Nothing here has happened yet.</p>
          <ViolationList items={ev.violations.filter((v) => v.tentative)} />
        </Card>
      )}
      <BugButton s={s} ev={ev} />
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

/**
 * The draft after "what" is answered. A first answer sets sensible times: the hour before now (or before
 * this time of day on the day being viewed), a break ending now, or something inside the entry the driver
 * tapped, centred in it. A changed answer keeps the times already chosen.
 */
export function draftFor(pick: { status: DutyStatus; note?: string; minutes?: number }, prev: Draft | undefined, now: number, inside?: Segment, day?: number): Draft {
  const fixedLen = pick.minutes !== undefined;
  if (prev) return { status: pick.status, note: pick.note, start: prev.start, len: pick.minutes ?? prev.len, fixedLen };
  if (inside) {
    const room = inside.end - inside.start;
    const len = Math.min(pick.minutes ?? 30, room);
    const start = Math.min(Math.max(round5(inside.start + (room - len) / 2), inside.start), inside.end - len);
    return { status: pick.status, note: pick.note, start, len, fixedLen };
  }
  const end = day === undefined ? now : Math.min(now, onDay(now, day));
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
    return { ...k, step: d?.fixedLen ? 'when' : 'long' };
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
const WHAT: WhatOpt[] = [
  { status: 'D', title: 'Driving', sub: 'Behind the wheel' },
  { status: 'ON', title: 'On duty', sub: 'Working, not driving: fueling, loading, inspecting' },
  { status: 'OFF', title: 'Off duty', sub: 'Done with work, free to do as you like' },
  { status: 'SB', title: 'Sleeper berth', sub: 'Resting in the sleeper' },
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
function StepCount({ at, of }: { at: number; of: number }) {
  return (
    <div class="ed-steps">
      <div class="ed-bar" aria-hidden="true">{Array.from({ length: of }, (_, i) => <span key={i} class={i < at ? 'on' : undefined} />)}</div>
      <span class="ed-count">Step {at} of {of}</span>
    </div>
  );
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
/** The answer so far, above the next question, with a way back to change it. */
function Context({ d, onChange }: { d: Draft; onChange?: () => void }) {
  return (
    <div class="ed-ctx">
      <span class="dot" style={{ background: STATUS_COLOR[d.status] }} />
      <span class="ed-ctx-t">{segLabel(d.status, d.note)}</span>
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
      // A different status is one tap, kept as the times were; undo is on the Log.
      const e = saveEntry(edit, { status, start: edit.start, end: edit.end, note: relabel(edit, status, note) }, now);
      setErr(e);
      if (!e) openSheet(null);
      return;
    }
    const d = draftFor({ status, note, minutes }, k.draft, now, inside, k.kind === 'add' ? k.day : undefined);
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
      {!edit && <StepCount at={1} of={k.draft?.fixedLen ? 2 : 3} />}
      <Question>{edit ? 'What were you really doing?' : inside ? 'What happened in the middle?' : 'What were you doing?'}</Question>
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
      {edit && <p class="muted small ed-foot">Keeps the times. You can undo it from the Log.</p>}
    </>
  );
}

function WhenStep({ k, now }: { k: EdKind; now: number }) {
  const d = k.draft!;
  const tentative = k.kind === 'edit' && !!k.seg.tentative;
  const set = (start: number) => openSheet({ ...k, draft: { ...d, start } });
  const problem = whenProblem(d, now, tentative);
  const key = (delta: number, text: string, label: string) => <button key={delta} aria-label={label} onClick={() => set(d.start + delta)}>{text}</button>;
  const pickDate = (v: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return;
    const t = new Date(d.start * 60000);
    set(Math.floor(new Date(+m[1], +m[2] - 1, +m[3], t.getHours(), t.getMinutes()).getTime() / 60000));
  };
  const chips = dayChips(now, tentative);
  const onChip = chips.some((c) => sameDay(c.at, d.start));
  return (
    <>
      {k.kind === 'add' && <StepCount at={2} of={d.fixedLen ? 2 : 3} />}
      <Context d={d} onChange={k.kind === 'add' ? () => openSheet({ ...k, step: 'what', resume: 'when' }) : undefined} />
      <Question>{k.kind === 'edit' ? 'When did it really start?' : 'When did it start?'}</Question>
      <div class="chips ed-days" role="group" aria-label="Day">
        {chips.map((c) => <button key={c.label} class={sameDay(c.at, d.start) ? 'on' : undefined} aria-pressed={sameDay(c.at, d.start)} onClick={() => set(onDay(d.start, c.at))}>{c.label}</button>)}
      </div>
      <div class="ed-clock">
        <output class="mono" aria-live="polite" aria-label={`Started ${clock(d.start)}`}>{clock(d.start, false)}</output>
        <span>{new Date(d.start * 60000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
      </div>
      {d.fixedLen && !tentative && <button class="wide-btn" onClick={() => set(now - d.len)}>It just ended: started {clock(now - d.len, false)}</button>}
      <div class="ed-keys two">{key(-60, '− 1 hour', '1 hour earlier')}{key(60, '+ 1 hour', '1 hour later')}</div>
      <div class="ed-keys four">{key(-15, '−15', '15 minutes earlier')}{key(-5, '−5', '5 minutes earlier')}{key(5, '+5', '5 minutes later')}{key(15, '+15', '15 minutes later')}</div>
      <label class="ed-day">Another day<input type="date" value={dateInput(d.start)} class={onChip ? undefined : 'on'} onInput={(e) => pickDate((e.target as HTMLInputElement).value)} /></label>
      {problem && <div class="warnbox small">{problem}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={() => openSheet({ ...k, step: d.fixedLen ? 'check' : 'long' })}>{d.fixedLen ? 'Next: check it' : 'Next: how long'}</button>
    </>
  );
}

const LENGTHS: [number, string][] = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [120, '2 hours'], [600, '10 hours']];

function LongStep({ k, now }: { k: EdKind; now: number }) {
  const d = k.draft!;
  const tentative = k.kind === 'edit' && !!k.seg.tentative;
  const set = (len: number) => openSheet({ ...k, draft: { ...d, len: Math.max(5, len), fixedLen: false } });
  const sinceStart = now - d.start;
  const problem = draftProblem(d, now, tentative);
  return (
    <>
      {k.kind === 'add' && <StepCount at={3} of={3} />}
      <Context d={d} onChange={k.kind === 'add' ? () => openSheet({ ...k, step: 'what', resume: 'long' }) : undefined} />
      <p class="ed-from">From <b class="mono">{clock(d.start)}</b></p>
      <Question>{k.kind === 'edit' ? 'How long did it really last?' : 'How long did it last?'}</Question>
      <div class="ed-len" role="group" aria-label="Length">
        {LENGTHS.map(([m, l]) => <button key={m} class={d.len === m ? 'on' : undefined} aria-pressed={d.len === m} disabled={!tentative && d.start + m > now} onClick={() => set(m)}>{l}</button>)}
        {!tentative && sinceStart >= 5 && <button class={`all${d.len === sinceStart ? ' on' : ''}`} aria-pressed={d.len === sinceStart} onClick={() => set(sinceStart)}>Until now · {dur(sinceStart)}</button>}
      </div>
      <div class="ed-fine">
        <button aria-label="15 minutes shorter" onClick={() => set(d.len - 15)}>−15</button>
        <button aria-label="5 minutes shorter" onClick={() => set(d.len - 5)}>−5</button>
        <output class="mono" aria-live="polite">{dur(d.len)}</output>
        <button aria-label="5 minutes longer" onClick={() => set(d.len + 5)}>+5</button>
        <button aria-label="15 minutes longer" onClick={() => set(d.len + 15)}>+15</button>
      </div>
      <p class="ed-ends">Ends <b class="mono">{clock(d.start + d.len)}</b></p>
      {problem && <div class="warnbox small">{problem}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={() => openSheet({ ...k, step: 'check' })}>Check it</button>
    </>
  );
}

function CheckStep({ k, s, now }: { k: EdKind; s: State; now: number }) {
  const [err, setErr] = useState<string | null>(null);
  const d = k.draft!;
  const edit = k.kind === 'edit' ? k.seg : null;
  const tentative = !!edit?.tentative;
  const end = d.start + d.len;
  const cycleHours = s.config.cycle === '60/7' ? 60 : 70;
  // The timeline without this entry (for what it overlaps), and with it (for the picture).
  const without: State = edit ? { ...s, segments: s.segments.filter((x) => x !== edit), tentative: s.tentative.filter((x) => x !== edit) } : s;
  const row: Segment = { status: d.status, start: d.start, end, createdAt: Number.MAX_SAFE_INTEGER, ...(d.note ? { note: d.note } : {}), ...(tentative ? { tentative: true } : {}) };
  const withIt: State = tentative ? { ...without, tentative: [...without.tentative, row] } : { ...without, segments: [...without.segments, row] };
  // Resolved, then joined on the label as the Log shows it: a drive logged as two touching rows is one drive.
  const before = joinDisplayRows(normalize(allSegments(without, now), { merge: false }));
  const after = joinDisplayRows(normalize(allSegments(withIt, now), { merge: false }));
  const from = carrierDayStart(d.start, s.config), to = nextCarrierDayStart(from, s.config);
  const overlap = overlapNote(before, d, now);
  const notes = draftNotes(d, cycleHours);
  const problem = draftProblem(d, now, tentative);
  const go = (step: EdStep) => openSheet({ ...k, step });
  const save = () => { const e = commitDraft(k, d, now); setErr(e); if (!e) openSheet(null); };
  return (
    <>
      <Question>{edit ? 'Check the change' : 'Check and add'}</Question>
      <div class="ed-sum">
        <div><span>What</span><b>{segLabel(d.status, d.note)}</b>{edit ? <span /> : <button class="link" onClick={() => go('what')} aria-label="Change what you were doing">Change</button>}</div>
        <div><span>When</span><b class="mono">{clock(d.start)} → {clock(end, !sameDay(d.start, end))}</b><button class="link" onClick={() => go('when')} aria-label="Change when it started">Change</button></div>
        <div><span>Length</span><b class="mono">{dur(d.len)}</b><button class="link" onClick={() => go('long')} aria-label="Change how long it lasted">Change</button></div>
      </div>
      <div>
        <div class="ed-lab">Your day with it {edit ? 'changed' : 'added'}</div>
        <Grid segments={after} from={from} to={to} tz={s.config.timeZone} mark={{ start: d.start, end }} />
      </div>
      {overlap && <p class="warnbox">{overlap}</p>}
      {notes.length > 0 && <ul class="brk-hint">{notes.map((t, i) => <li key={i}>{t}</li>)}</ul>}
      {(problem || err) && <div class="warnbox small">{problem ?? err}</div>}
      <button class="primary wide ed-go" disabled={!!problem} onClick={save}>{edit ? 'Save the change' : 'Add to my log'}</button>
      <p class="muted small ed-foot">You can undo it from the Log.</p>
    </>
  );
}

/** Tapping an entry: what is wrong with it, in the driver's words, rather than every field at once. */
function MenuStep({ k }: { k: Extract<SheetKind, { kind: 'edit' }> }) {
  const seg = k.seg;
  const d = draftOf(seg);
  const label = segLabel(seg.status, seg.note);
  const middle = !seg.tentative && seg.end - seg.start >= 10;
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
      <p class="ed-when mono">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</p>
      <Question>What do you want to fix?</Question>
      {act(I.log, `It wasn’t ${label}`, 'Change what you were doing', () => openSheet({ ...k, step: 'what', draft: d }))}
      {act(I.now, 'The times are wrong', 'Change when it started or how long', () => openSheet({ ...k, step: 'when', draft: d }))}
      {middle && act(I.plus, worked ? 'I took a break in the middle' : 'I worked or drove in the middle', worked ? `Add a break inside this ${seg.status === 'D' ? 'drive' : 'entry'}` : 'Add something inside this entry', () => openSheet({ kind: 'add', inside: seg }))}
      {act(I.trash, seg.tentative ? 'Remove this what-if' : 'It never happened', seg.tentative ? 'Take it out of the plan' : 'Delete this entry', () => { deleteEntry(seg); openSheet(null); }, 'del')}
      <p class="muted small ed-foot">Every change can be undone from the Log.</p>
    </>
  );
}

function EditorSheet({ k, s, now }: { k: EdKind; s: State; now: number }) {
  const step: EdStep = k.step ?? (k.kind === 'edit' ? 'menu' : 'what');
  // A step that needs a draft without one (a stale descriptor) starts over at the first question.
  const ok = step === 'menu' || step === 'what' || !!k.draft;
  const at: EdStep = ok ? step : k.kind === 'edit' ? 'menu' : 'what';
  const title = k.kind === 'add' ? 'Add to your log' : `${segLabel(k.seg.status, k.seg.note)}${k.seg.tentative ? ' (what-if)' : ''}`;
  const first = at === (k.kind === 'edit' ? 'menu' : 'what') && !(k.kind === 'add' && k.draft);
  return (
    <Sheet title={title} onBack={first ? undefined : sheetBack} focusKey={at}>
      {at === 'menu' && k.kind === 'edit' && <MenuStep k={k} />}
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
  const label = s.planReturn === 'now' ? 'Now' : s.planReturn === 'recap' ? 'Recap' : 'Plan';
  return <button class="back" onClick={() => setState({ tab: s.planReturn })}><Icon d={I.back} /> {label}</button>;
}

/** The planning tools, one big button each: a question a driver asks, not a tool name. */
function PlanTab() {
  const item = (tab: State['tab'], icon: string, title: string, sub: string) => (
    <button class="plan-item" onClick={() => setState({ tab, planReturn: 'plan' })}>
      <span class="plan-icon"><Icon d={icon} size={26} /></span>
      <span class="plan-text"><b>{title}</b><span class="muted small">{sub}</span></span>
      <Icon d={I.next} />
    </button>
  );
  return (
    <>
      <h1 class="screen-title">Plan</h1>
      {item('load', I.truck, 'Can I take this load?', 'Miles and time at the receiver. Get a yes or no.')}
      {item('split', I.bunk, 'Plan a sleeper split', 'Try the two breaks before you take them.')}
      {item('trip', I.route, 'Plan a run', 'Where you will need to rest, three ways, and where to park now.')}
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
/** Keep the current Split draft behind one undo (shared by both replace paths). */
export function snapshotSplitDraft() { splitDraftBefore = { ...getState().split }; }
/** Replace the whole Split draft, keeping the replaced one behind one undo. */
export function replaceSplitDraft(next: SplitDraft) {
  snapshotSplitDraft();
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

function SplitTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  // The what-if lives in the store: a detour to the Log tab used to reset the plan being compared.
  const sd = s.split;
  // A partial carrying every draft key is a whole-draft load ("Try an example split"):
  // it keeps the draft it replaces behind the one-level undo (audit §2.4). Any partial
  // edit — a slider, a toggle — retires the offer instead (the Log undo's N2 rule).
  const setSplit = (p: Partial<SplitDraft>) => {
    if (Object.keys(DEFAULT_SPLIT).every((k) => k in p)) snapshotSplitDraft(); else clearSplitDraftUndo();
    setState({ split: { ...sd, ...p } });
  };
  const { b1, b1s, dwell, drive, b2, b2s } = sd;

  const base = useMemo(() => allSegments(s, now).filter((x) => !x.tentative), [s, now]);
  // The record in time order with overlaps resolved. `base` is in the order rows were ENTERED, so its last
  // row is not the latest one once a forgotten entry has been added (re-check M9).
  const timeline = useMemo(() => normalize(base), [base]);
  const t0 = Math.max(now, ...base.map((x) => x.end));
  const plan: Segment[] = [];
  let t = t0;
  const push = (status: DutyStatus, m: number, note: string) => { if (m > 0) { plan.push({ status, start: t, end: t + m, tentative: true, note }); t += m; } };
  push(b1s, b1, 'Break 1'); push('ON', dwell, 'On duty'); push('D', drive, 'Drive'); push(b2s, b2, 'Break 2');
  const endB1 = t0 + b1, endDrive = t0 + b1 + dwell + drive, endB2 = t;

  // Evaluate at the instant Break 2 ends — every result card on this screen describes that
  // moment. Using endB2 + 1 put "stop by" a minute past the stated evaluation time (consumer-review-1).
  const after = evaluate([...base, ...plan], { asOf: endB2, config: s.config });
  const atDriveEnd = evaluate([...base, ...plan.slice(0, 3)], { asOf: endDrive, config: s.config });
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
  const sh = safeHaven(after, s.mph);
  // The pair the clocks use now, and the rest that could start the next one — shown as two different
  // things. Side by side as "Period A … counts against your 14" and "Active split", a tester read them
  // as a contradiction (2026-11-04): the clocks were excluding the very rest that line said counted.
  const activeNow = activePair(ev);
  const pl = ev.shift.pendingSplitLeg;
  const nextLeg = activeNow && pl && pl.start === activeNow[1].start && pl.end === activeNow[1].end ? pl : null;
  const nextMin = nextLeg ? Math.max(nextLeg.qualifiesLongSB ? LIMITS.SPLIT_MIN_SHORT : LIMITS.SPLIT_MIN_SB, LIMITS.SPLIT_TOTAL - nextLeg.duration) : 0;
  const nextNeed = !nextLeg ? '' : nextLeg.qualifiesLongSB ? `a later rest of at least ${dur(nextMin)}`
    : nextMin <= LIMITS.SPLIT_MIN_SB ? 'a later rest with 7h+ in a row in the sleeper' : `a later rest of at least ${dur(nextMin)}, with 7h+ in a row in the sleeper`;

  const commit = () => setState({ tentative: plan });
  const clear = () => setState({ tentative: [] });

  return (
    <>
      <BackToPlan s={s} />
      <div class="split-now-after" aria-live="polite">Your 14 ends <b>{clock(windowEndNow)}</b> now → <b>{clock(windowEndAfter)}</b> {paired ? 'with this pair' : 'with this plan (no split credit)'}</div>
      {splitDraftUndoPending() && (
        <div class="row undo">
          <span>Draft replaced.</span>
          <button class="mini" onClick={() => undoSplitDraft()}>Undo</button>
        </div>
      )}
      <Card title="Current pair status" tone={ev.shift.pendingSplitLeg && !activeNow ? 'warn' : undefined}>
        {activeNow && <p class="ok"><b>Split in use:</b> {pairWords(activeNow)}. Your clocks count from {clock(ev.shift.anchor)}, the end of the first rest.</p>}
        {activeNow
          ? (nextLeg
            ? <p class="muted"><b>Next pair (optional):</b> your {clock(nextLeg.start)}–{clock(nextLeg.end)} rest ({dur(nextLeg.duration)} {nextLeg.longestSB >= nextLeg.duration ? 'sleeper' : nextLeg.longestSB > 0 ? 'sleeper and off duty' : 'off duty'}) can also be the first half of your next split. It needs {nextNeed}. This does not change the pair above.</p>
            : null)
          : ev.shift.pendingSplitLeg && ev.shift.pendingSplitLeg.isReset
          ? <p><b>Your {dur(ev.shift.pendingSplitLeg.duration)} reset included 7+ hours in the sleeper.</b> Under FMCSA FAQ 22 (July 2026) a later break of 2h+ can pair with it and be <b>excluded from your 14</b> — it won't give back driving time, but it buys window. Clocks below assume the plain reset until you take that break.</p>
          : ev.shift.pendingSplitLeg
          ? <p><b>First break logged:</b> {dur(ev.shift.pendingSplitLeg.duration)} ending {clock(ev.shift.pendingSplitLeg.end)} ({ev.shift.pendingSplitLeg.longestSB >= 420 ? '≥7h sleeper — needs a ≥2h partner' : `needs ≥7h sleeper, and ≥${dur(Math.max(120, 600 - ev.shift.pendingSplitLeg.duration))} to total 10h`}). Until the partner completes, this time <b>counts against your 14</b>.</p>
          : <p class="muted">No qualifying break (≥2h) pending since your clocks started at {clock(ev.shift.anchor)}.</p>}
        {!activeNow && ev.shift.chain.length >= 2 && <p class="ok">Active split: your clocks count from {clock(ev.shift.anchor)} (end of first paired rest).</p>}
      </Card>

      <Card title="What if… (starts at the end of your log)">
        <p class="muted small">Plan begins {clock(t0)}.</p>
        <button class="wide-btn" onClick={() => setSplit({ ...DEFAULT_SPLIT })}>Try an example split</button>
        <Toggle options={[['OFF', 'Break 1: Off duty'], ['SB', 'Break 1: Sleeper']]} value={b1s} onChange={(v) => setSplit({ b1s: v })} />
        <Slider label="Break 1 length" value={b1} min={0} max={600} step={15} onChange={(v) => setSplit({ b1: v })} fmt={dur} unit="min" />
        <Slider label="Then on-duty (dock, fuel)" value={dwell} min={0} max={240} step={15} onChange={(v) => setSplit({ dwell: v })} fmt={dur} unit="min" />
        <Slider label="Then drive" value={drive} min={0} max={660} step={15} onChange={(v) => setSplit({ drive: v })} fmt={dur} unit="min" />
        <Toggle options={[['SB', 'Break 2: Sleeper'], ['OFF', 'Break 2: Off duty']]} value={b2s} onChange={(v) => setSplit({ b2s: v })} />
        <Slider label="Break 2 length" value={b2} min={0} max={600} step={15} onChange={(v) => setSplit({ b2: v })} fmt={dur} unit="min" />
      </Card>

      <Card title="Does it pair?" tone={paired ? 'good' : 'bad'}>
        <ul class="checks">
          <li class={b1 >= 120 && b2 >= 120 ? 'ok' : 'no'}>Both breaks ≥ 2h</li>
          <li class={longOk ? 'ok' : 'no'}>One break ≥ 7h in the sleeper berth</li>
          <li class={totalOk ? 'ok' : 'no'}>Total ≥ 10h ({dur(b1 + b2)})</li>
          <li class={paired ? 'ok' : 'no'}>The rules pair these two breaks</li>
        </ul>
        {(b1 >= 600 || b2 >= 600) && <p class="trust">A break of 10h+ is a full reset on its own. If it includes 7+ consecutive hours in the sleeper it can <i>also</i> pair with a later 2h+ break — whichever helps you more (FMCSA FAQ 22, July 2026).</p>}
        {!paired && b1 >= 120 && b2 >= 120 && longOk && totalOk && timeline.length > 0 && (timeline[timeline.length - 1].status === 'OFF' || timeline[timeline.length - 1].status === 'SB') && (() => {
          const lastWork = [...timeline].reverse().find((x) => x.status !== 'OFF' && x.status !== 'SB');
          const merged = b1 + (t0 - (lastWork ? lastWork.end : timeline[0].start));
          return <p class="warnbox small">Break 1 runs straight into the rest you're already in, so they merge into one {dur(merged)} rest — a full <b>reset</b>. Under FMCSA FAQ 22 (July 2026) a reset can be a split leg <i>only</i> if it includes 7+ consecutive hours in the <b>sleeper</b>; this one doesn't, so Break 2 will need its own ≥2–3h partner later. The clocks below show that honestly. To model a true split, go on duty or drive first — or log the rest as sleeper.</p>;
        })()}
      </Card>

      <Card title={`After Break 2 ends (${clock(endB2)})`}>
        <div class="clocks">
          <Stat label="Drive left" value={dur(after.shift.driveRemaining)} tone={after.shift.driveRemaining < 60 ? 'bad' : ''} />
          <Stat label="14-hr left" value={dur(after.shift.windowRemaining)} tone={after.shift.windowRemaining < 60 ? 'bad' : ''} />
          <Stat label="Drive now" value={dur(after.driveNow)} sub={bindingLabel(after)} />
          <Stat label={`Range @${s.mph}`} value={`${sh.miles} mi`} sub={`stop by ${clockFull(after.mustStopBy)}`} />
        </div>
        <p class="trust">Clocks count from: {clock(after.shift.anchor)}{paired ? ' — end of Break 1; the clock is measured from here. Nothing is erased from your log.' : ' — no split credit.'}</p>
        <h3>Plan violations (if you complete both breaks)</h3><ViolationList items={planViol} />
        {strictViol.length > 0 && <div class="warnbox"><b>If you skip Break 2:</b> the {dur(drive)} drive ends {clock(endDrive)} with {strictViol.map((v) => `${violationLabel[v.kind]} ${dur(v.minutes)}`).join(', ')} — Break 1 only pays off once Break 2 is done.</div>}
      </Card>

      <div class="row"><button class="primary" onClick={commit}>Put plan on log as what-if</button><button onClick={clear} disabled={!s.tentative.length}>Clear what-if</button></div>
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
  if (!open) return <button class="mini" onClick={() => { setErr(null); setOpen(true); }}>{hasData ? 'edit' : 'set'}</button>;
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
  const resets = (p: TripPlan) => p.steps.filter((x) => x.segment.status !== 'D' && x.segment.status !== 'ON' && x.segment.end - x.segment.start >= 600).length;
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
            <div class="stat-sub">{dur(p.elapsedMinutes)} · {resets(p)} long rest{resets(p) === 1 ? '' : 's'} · {p.feasible ? 'legal' : 'PROBLEM'}</div>
          </button>;
        })}
      </div>
      )}
      <ol class="itin">{plan.steps.map((st, i) => <li key={i}><span class="dot" style={{ background: STATUS_COLOR[st.segment.status] }} /><span><b>{at(st.segment.start)}</b> {st.reason}</span><span class="muted">{dur(st.segment.end - st.segment.start)}{st.segment.status === 'D' ? ` · mi ${Math.round(st.fromMile)}→${Math.round(st.toMile)}` : ''}</span></li>)}</ol>
      {plan.warnings.map((w, i) => <p key={i} class="warnbox">{w}</p>)}
      <ViolationList items={plan.evaluation.violations} from={from} />
      {chosen === 'split' && <p class="trust">The split plan only works if you actually log the rests exactly as shown — the shorter one must be ≥2h off duty or sleeper, and the sleeper must be ≥7h *consecutive*. Anything less and the plan collapses to the 10-hour version.</p>}
      {chosen === 'restart34' && <p class="trust">A 34-hour restart resets the 60/70-hour cycle (§395.3(c)) and, being far more than 10 consecutive hours off duty, <b>also satisfies the daily reset</b> (§395.3(a)(1)). This option takes it where the <b>cycle</b> is what limits your trip; compare its arrival time against waiting for recap hours, which can take days.</p>}
    </>
  );
}

function RecapTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const hist = cycleBasis(s, now, ev.cycle.windowDays);
  const firstLogged = s.segments.length ? Math.min(...s.segments.map((x) => x.start)) : null;
  const days = ev.cycle.days;
  // The patch is a pure store function so the clipping rule is unit-testable (stress-test 2.4).
  const applyDay = (dayStart: number, dayEnd: number) => (drive: number, on: number, startHour: number) => {
    // The live status's stamp rides along so the patch's filler can never outrank the live
    // span it pads around (break-test #1).
    setState((cur) => ({ segments: applyDayPatch(cur.segments, dayStart, dayEnd, drive, on, startHour, stamp(), cur.current?.createdAt) }));
  };

  return (
    <>
      <Card title={`${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day recap`}>
        <table class="recap"><thead><tr><th>Day</th><th>On duty</th><th></th></tr></thead><tbody>
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            // The live status is data on the days it runs through too: "set" on such a day is
            // a replace, and the driver must confirm it as one (break-test #1).
            const hasData = s.segments.some((x) => x.start < d.end && x.end > d.start)
              || (s.current !== null && s.current.since < d.end && now > d.start);
            return <tr key={d.label} class={isToday ? 'today' : ''}><td>{isToday ? 'Today' : `D-${days.length - 1 - i}`}<br /><small class="muted">{d.label}</small></td><td><b>{dur(d.onDuty)}</b></td>
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
        {hist !== 'known' && <p class="warnbox small">This recap rests on an incomplete basis: your record does not cover the whole {ev.cycle.windowDays}-day period, so the days before it count as zero. Use <b>set</b> on those days, or confirm that your record really starts here.</p>}
        <p class="muted small">"set" a past day with drive + on-duty hours and a start time; it's written as real segments (with a 30-min break after 8h driving) so the whole engine sees it. Days roll at {String(s.config.dayStartHour).padStart(2, '0')}:00 {s.config.timeZone}.{deviceTz !== s.config.timeZone && <> On your device clock ({deviceTz}) that is <b>{terminalMidnightOnDevice(s.config.timeZone, deviceTz, now)}</b> — the times in this table use your device zone.</>}</p>
      </Card>
      <Card title="Hours coming back">
        <ul class="forecast">{ev.cycle.forecast.map((f) => <li key={f.label}><span>{clock(f.dayStart)}</span><span>+{dur(f.dropsOff)} drops</span><b>{dur(f.availableAtStart)} available</b></li>)}</ul>
      </Card>
      <button class="plan-item" onClick={() => setState({ tab: 'load', planReturn: 'recap' })}>
        <span class="plan-icon"><Icon d={I.truck} size={26} /></span>
        <span class="plan-text"><b>Can I take this load?</b><span class="muted small">Answer three questions, get a yes or no.</span></span>
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
  return (
    <>
      <BackToPlan s={s} />
      <h1 class="screen-title">Your last 8 days</h1>
      <p class="muted small">What you logged, day by day, on your carrier's clock — days roll at {String(s.config.dayStartHour).padStart(2, '0')}:00 {s.config.timeZone}, and the times below read in your device zone ({deviceTz}), like everywhere else in the app.</p>
      {days.map((d) => (
        <Card key={d.start} title={d.isToday ? `Today — ${d.label}` : d.label}>
          <p class="small">Driving <b>{dur(d.totals.D)}</b> · On duty <b>{dur(d.totals.ON)}</b> · Off duty <b>{dur(d.totals.OFF)}</b> · Sleeper <b>{dur(d.totals.SB)}</b>{d.notLogged > 0 && <> · Not logged <b>{dur(d.notLogged)}</b></>}</p>
          {closes.get(d.start) && <p class="small">Day closed {clock(closes.get(d.start)!.at, false)}</p>}
          <ul class="seglist">{d.items.map((it, i) => it.status === null ? (
            <li key={i}><span /><span class="muted">Not logged</span><span class="muted">{clock(it.start)} → {clock(it.end)} · {dur(it.end - it.start)}</span></li>
          ) : (
            <li key={i}><span class="dot" style={{ background: STATUS_COLOR[it.status] }} /><span>{segLabel(it.status, it.note)}</span><span class="muted">{clock(it.start)} → {clock(it.end)} · {dur(it.end - it.start)}</span></li>
          ))}</ul>
        </Card>
      ))}
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
function LoadTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const lc = s.loadCheck;
  const setLoad = (p: Partial<LoadCheckDraft>) => setState({ loadCheck: { ...lc, ...p } });
  const [step, setStep] = useState(lc.answered ? 4 : 1);
  // each question is its own screen: start it at the top, not wherever the last Next button was
  // (Patch 19: the shell is the scroller now — the page itself no longer scrolls — so the
  // shell is what goes back to the top; the window call stays for a runtime where it does.)
  useEffect(() => { window.scrollTo(0, 0); document.querySelector('.app')?.scrollTo?.(0, 0); }, [step]);
  const hist = cycleBasis(s, now, ev.cycle.windowDays);
  const departure = now + lc.leaveIn;
  const loadSegs = allSegments(s, now).filter((x) => !x.tentative);
  const loadInput: TripInput = {
    departure, distanceMiles: lc.miles, mph: s.mph,
    stops: lc.dwell ? [{ atMile: lc.miles, minutes: lc.dwell, status: lc.dwellOff ? 'OFF' : 'ON', label: 'Receiver' }] : [],
    config: s.config,
    // Waiting to leave is not rest unless he says so: shown as an assumed row, never an unlogged gap.
    ...(lc.leaveIn > 0 ? { untilDeparture: { from: now, status: lc.waitOff ? 'OFF' as DutyStatus : 'ON' as DutyStatus, label: `${lc.waitOff ? 'Off duty' : 'On duty'} until departure` } } : {}),
  };
  const both = useMemo(() => planTripAll(loadSegs, loadInput), [s, now, lc.miles, lc.dwell, lc.dwellOff, lc.leaveIn, lc.waitOff]);
  const strategyKey = earliestStrategy(both);
  const best = both[strategyKey];
  // Patch 10: the verdict's two follow-up answers, computed with the same simulation on shifted
  // inputs (later departures / added pre-departure rest) — display only, nothing is written.
  // Only the answer screen pays for the searches; the question screens return null at once.
  const advice = useMemo(() => {
    if (step !== 4) return null;
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
  // Back out of the flow returns to wherever the driver entered it from (patch 7.1): Now, the
  // Plan hub, or Recap — not always Plan, which is where it landed before. The label names it.
  const returnLabel = s.planReturn === 'now' ? 'Now' : s.planReturn === 'recap' ? 'Recap' : 'Plan';
  const head = (n: number) => (
    <>
      <div class="flow-head">
        <button class="icon-btn" aria-label={n === 1 ? `Back to ${returnLabel}` : 'Previous question'} onClick={() => (n === 1 ? setState({ tab: s.planReturn }) : setStep(n - 1))}><Icon d={I.back} /></button>
        <b>Can I take this load?</b>
        <span class="muted">{n} of 3</span>
      </div>
      <div class="flow-dots" aria-hidden="true">{[1, 2, 3].map((k) => <span key={k} class={k <= n ? 'on' : ''} />)}</div>
    </>
  );
  const next = (n: number, label: string) => <button class="primary wide flow-next" onClick={() => { if (n === 3) setLoad({ answered: true }); setStep(n + 1); }}>{label} <Icon d={I.next} /></button>;
  const chips = <T,>(opts: [T, string][], value: T, set: (v: T) => void) => (
    <div class="chips">{opts.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => set(v)}>{l}</button>)}</div>
  );

  if (step === 1) {
    return (
      <>
        {head(1)}
        <h1 class="flow-q">How far is the load?</h1>
        <p class="muted">Miles from here to the receiver.</p>
        <div class="bignum"><b>{lc.miles}</b> mi</div>
        <div class="steps4">{[-50, -10, 10, 50].map((d) => <button key={d} aria-label={`${d > 0 ? 'Add' : 'Take off'} ${Math.abs(d)} miles`} onClick={() => setLoad({ miles: Math.min(3000, Math.max(1, lc.miles + d)) })}>{d > 0 ? `+${d}` : `−${-d}`}</button>)}</div>
        <label>Or type the miles<input type="number" inputMode="numeric" min={1} max={3000} value={lc.miles} onInput={(e) => { const n = Math.round(Number((e.target as HTMLInputElement).value)); if (n >= 1 && n <= 3000) setLoad({ miles: n }); }} /></label>
        {chips([[250, '250'], [400, '400'], [550, '550'], [700, '700'], [900, '900']] as [number, string][], lc.miles, (v) => setLoad({ miles: v }))}
        {next(1, 'Next: when you leave')}
      </>
    );
  }
  if (step === 2) {
    return (
      <>
        {head(2)}
        <h1 class="flow-q">When will you leave?</h1>
        {chips([[0, 'Now'], [30, 'In 30 min'], [60, 'In 1 hour'], [120, 'In 2 hours']] as [number, string][], lc.leaveIn, (v) => setLoad({ leaveIn: v }))}
        {lc.leaveIn > 0 && (
          <>
            <h3>Until then, you will be</h3>
            {chips([[false, 'On duty'], [true, 'Off duty']] as [boolean, string][], lc.waitOff, (v) => setLoad({ waitOff: v }))}
            <p class="muted small">{lc.waitOff ? 'Only choose off duty if you really will be: it can count as rest.' : 'On duty earns no rest credit, so the answer can only come out on the careful side.'}</p>
          </>
        )}
        {next(2, 'Next: time at the receiver')}
      </>
    );
  }
  if (step === 3) {
    return (
      <>
        {head(3)}
        <h1 class="flow-q">How long at the receiver?</h1>
        {chips([[0, 'None'], [30, '30 min'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']] as [number, string][], lc.dwell, (v) => setLoad({ dwell: v }))}
        <h3>While you are there, you are</h3>
        {chips([[false, 'On duty (unloading)'], [true, 'Off duty (relieved)']] as [boolean, string][], lc.dwellOff, (v) => setLoad({ dwellOff: v }))}
        {next(3, 'Show me the answer')}
      </>
    );
  }
  return (
    <>
      <div class="flow-head">
        <button class="icon-btn" aria-label={`Back to ${returnLabel}`} onClick={() => setState({ tab: s.planReturn })}><Icon d={I.back} /></button>
        <b>Can I take this load?</b><span />
      </div>
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
        <div class="verdict-sub">{best.arrival > best.driveEnd ? `Unloaded by ${clockFull(best.arrival)}` : `There by ${clockFull(best.driveEnd)}`}</div>
        {best.feasible && advice?.latest != null && <div class="verdict-sub">Leave by {clockFull(advice.latest)} at the latest.</div>}
        {!best.feasible && advice?.fix && <div class="verdict-sub">+{dur(advice.fix.minutes)} off duty before you leave → legal, {advice.fix.plan.arrival > advice.fix.plan.driveEnd ? `unloaded by ${clockFull(advice.fix.plan.arrival)}` : `there by ${clockFull(advice.fix.plan.driveEnd)}`}.</div>}
        {!best.feasible && advice?.fixSearched && !advice.fix && <div class="verdict-sub">No amount of extra rest before leaving makes this one legal — the load itself has to change.</div>}
      </section>
      {provisional && <p class="warnbox small"><b>Provisional.</b> {openGaps.map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} {openGaps.length === 1 ? 'is' : 'are'} unlogged and counted as off duty. Fill {openGaps.length === 1 ? 'it' : 'them'} in and this verdict can change.</p>}
      {hist !== 'known' && <p class="warnbox small">This verdict rests on an incomplete basis: nothing behind your current status is logged, so it assumes you started from zero. It is not a statement about your real day — add your duty on the <b>Log</b> tab, or confirm that the record starts here.</p>}
      <div class="clocks">
        <Stat label="Arrive — wheels stop" value={clockFull(best.driveEnd)} />
        {best.arrival > best.driveEnd && <Stat label="Unloaded by" value={clockFull(best.arrival)} />}
        <Stat label={`Cycle left after ${best.arrival > best.driveEnd ? 'unloading' : 'arrival'}`} value={dur(best.cycleRemainingAtArrival)} />
      </div>
      <ul class="answers">
        <li><span>Load distance</span><b>{lc.miles} mi</b><button class="link" onClick={() => setStep(1)}>Change</button></li>
        <li><span>Leaving</span><b>{leaveWord}{lc.leaveIn ? (lc.waitOff ? ', off duty till then' : ', on duty till then') : ''}</b><button class="link" onClick={() => setStep(2)}>Change</button></li>
        <li><span>At the receiver</span><b>{lc.dwell ? `${dur(lc.dwell)} ${lc.dwellOff ? 'off duty' : 'on duty'}` : 'none'}</b><button class="link" onClick={() => setStep(3)}>Change</button></li>
      </ul>
      <Card title="How it goes"><PlanCompare both={both} from={now} /></Card>
      <p class="trust">Assumes {s.mph} mph average, fuel and traffic included — change it under More.</p>
      <button class="primary wide" onClick={() => setState({ tab: 'now' })}>Done</button>
      <button class="wide" onClick={() => { setState({ loadCheck: { ...DEFAULT_LOADCHECK } }); setStep(1); }}>Check another load</button>
    </>
  );
}

/* ============================================================ Trip tab */

function TripTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const d = s.trip;
  const setTrip = (p: Partial<TripDraft>) => setState({ trip: { ...d, ...p } });
  const cur = s.current?.status ?? null;
  // With no status logged there is nothing to "continue", and guessing OFF would hand out rest
  // credit for time nobody said was off duty. Default to On duty: it credits nothing, so the plan
  // can only come out pessimistic, never optimistic (consumer-review-2, concern 1).
  const untilPick: DutyStatus | 'CURRENT' = d.until === 'CURRENT' && !cur ? 'ON' : d.until;
  const untilStatus: DutyStatus = untilPick === 'CURRENT' ? (cur ?? 'ON') : untilPick;
  const untilOptions: [DutyStatus | 'CURRENT', string][] = [
    ...(cur ? [[('CURRENT') as const, `Continue ${STATUS_LABEL[cur]}`] as [DutyStatus | 'CURRENT', string]] : []),
    ['OFF', 'Off duty'],
    ['SB', 'Sleeper'],
    ['ON', 'On duty'],
  ];
  const dep = d.dep ?? toInput(now);
  const departure = fromInput(dep) ?? now;
  const waiting = departure > now;
  const pastDeparture = departure < now;
  /** A stop past the destination is passed through so the planner reports it rather than dropping it. */
  const stopPastDest = d.stopMin > 0 && d.stopMile > d.miles;
  const both = useMemo(() => planTripAll(allSegments(s, now).filter((x) => !x.tentative), {
    departure, distanceMiles: d.miles, mph: s.mph, preTripMinutes: d.pre,
    stops: d.stopMin > 0 && d.stopMile > 0 ? [{ atMile: d.stopMile, minutes: d.stopMin, status: d.stopOff ? 'OFF' : 'ON', label: d.stopOff ? 'Stop (off duty)' : 'Stop (on duty)' }] : [],
    config: s.config,
    // Never let the wait before departure read as an unlogged gap: say what it is, and show it.
    ...(waiting ? { untilDeparture: { from: now, status: untilStatus, label: `${STATUS_LABEL[untilStatus]} until departure` } } : {}),
  }), [s, now, departure, d.miles, d.pre, d.stopMile, d.stopMin, d.stopOff, untilStatus, waiting]);
  const sh = safeHaven(ev, s.mph);

  return (
    <>
      <BackToPlan s={s} />
      <Card title="Clock-to-parking (right now)" tone={ev.driveNow < 60 ? 'bad' : ev.driveNow < 120 ? 'warn' : 'good'}>
        <div class="clocks">
          <Stat label="Range" value={`${sh.miles} mi`} sub={`${dur(ev.driveNow)} @ ${s.mph} mph`} />
          <Stat label="Hard stop" value={clockFull(ev.mustStopBy)} sub={bindingLabel(ev)} />
        </div>
        <table class="cutoffs"><tbody>{sh.cutoffs.map((c) => <tr key={c.bufferMinutes}><td>{c.bufferMinutes} min buffer</td><td>park by <b>{clock(c.by, false)}</b></td><td>≤ {c.miles} mi</td></tr>)}</tbody></table>
        <p class="muted small">Net speed (fuel, traffic, scales) is what matters — set it in Settings. Parking after 17:00 fills fast; plan the 60-min line, not the 0.</p>
      </Card>
      <Card title="Plan a run">
        <label>Depart<input type="datetime-local" value={dep} onInput={(e) => setTrip({ dep: (e.target as HTMLInputElement).value })} /></label>
        {pastDeparture && (
          <p class="warnbox small">That departure is <b>{dur(now - departure)}</b> in the past. This is a what-if from that time: the plan starts there and does not include anything you've logged since, so treat it as a reconstruction rather than a current plan.</p>
        )}
        {stopPastDest && (
          <div class="warnbox small">
            <b>Your stop is past the destination.</b> It's at mile {d.stopMile} but the route is {d.miles} miles, so it is <b>not</b> in the plan — the {dur(d.stopMin)} of stop time is missing from the arrival times below.
            <div class="row">
              <button class="mini" onClick={() => setTrip({ stopMile: d.miles })}>Move stop to mile {d.miles}</button>
              <button class="mini" onClick={() => setTrip({ stopMile: 0, stopMin: 0 })}>Clear stop</button>
            </div>
          </div>
        )}
        {waiting && (
          <>
            <p class="trust">That's <b>{dur(departure - now)}</b> from now. Unlogged time is not a rest — say what you'll be doing, and the itinerary will show it as an assumed row rather than quietly counting it as off duty:</p>
            <Toggle options={untilOptions} value={untilPick} onChange={(v) => setTrip({ until: v })} />
            <p class="trust">Planning the wait as <b>{STATUS_LABEL[untilStatus]}</b>.{untilStatus === 'OFF' || untilStatus === 'SB' ? ' Only claim this if you really will be off duty — it can become a split leg.' : ' It earns no rest credit, so no split leg can be built out of it.'}</p>
            {!cur && <p class="warnbox small">You haven't set a current status yet, so this defaults to <b>On duty</b> until you choose — that credits no rest. Pick <b>Off duty</b> if you really will be off.</p>}
          </>
        )}
        <Slider label="Distance" value={d.miles} min={1} max={3000} step={25} onChange={(v) => setTrip({ miles: v })} fmt={(v) => `${v} mi`} unit="mi" />
        <Slider label="Pre-trip / loading (on duty)" value={d.pre} min={0} max={240} step={15} onChange={(v) => setTrip({ pre: v })} fmt={dur} unit="min" />
        <Slider label="Stop at mile" value={d.stopMile} min={0} max={3000} step={25} onChange={(v) => setTrip({ stopMile: v })} fmt={(v) => (v ? `${v} mi` : 'none')} unit="mi" />
        <Slider label="Stop length" value={d.stopMin} min={0} max={480} step={15} onChange={(v) => setTrip({ stopMin: v })} fmt={dur} unit="min" />
        {d.stopMin > 0 && <Toggle options={[[false, 'Stop is on duty'], [true, 'Stop is off duty (can be a split leg)']]} value={d.stopOff} onChange={(v) => setTrip({ stopOff: v })} />}
        <div class="row"><button onClick={() => setState({ trip: { ...DEFAULT_TRIP } })}>Reset plan</button></div>
        <p class="muted small">This scenario is kept while you move between tabs.</p>
      </Card>
      {meaningfulGaps(ev.gaps).length > 0 && (
        <p class="warnbox small"><b>Provisional.</b> {meaningfulGaps(ev.gaps).map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} {meaningfulGaps(ev.gaps).length === 1 ? 'is' : 'are'} unlogged and counted as off duty, so a "legal" below may rest on a break you never took. Fill {meaningfulGaps(ev.gaps).length === 1 ? 'it' : 'them'} in on the <b>Log</b> tab.</p>
      )}
      <Card title="Itinerary — three ways to rest">
        <PlanCompare both={both} from={departure} view={d.view} onView={(v) => setTrip({ view: v })} />
      </Card>
    </>
  );
}

/* ============================================================ Settings */

/** Ask the browser to download the export; returns the file name. */
function downloadExport(s: State): string {
  const blob = new Blob([exportState(s)], { type: 'application/json' });
  const name = `hos-sandbox-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  return name;
}

function DrivingAlertsCard({ s }: { s: State }) {
  // Browser features are only known at run time; the pre-rendered page assumes none.
  const [notif, setNotif] = useState<NotifyState>('unsupported');
  const [awakeOk, setAwakeOk] = useState(true);
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => { setNotif(notifyState()); setAwakeOk(canKeepAwake()); setSpeechOk(speechSynthesisAvailable()); }, []);
  const test = () => { unlockAudio(); chime(true); buzz(true); };
  return (
    <Card title="Driving alerts">
      <label class="check"><input type="checkbox" checked={s.alertsOn} onChange={(e) => setState({ alertsOn: (e.target as HTMLInputElement).checked })} /> Sound and vibration at 60, 30 and 15 minutes of driving left, and every 15 minutes once you are out of time</label>
      <label class="check"><input type="checkbox" checked={s.keepAwake} onChange={(e) => setState({ keepAwake: (e.target as HTMLInputElement).checked })} /> Keep the screen on while your status is Driving</label>
      <label class="check"><input type="checkbox" checked={s.drivingView} onChange={(e) => setState({ drivingView: (e.target as HTMLInputElement).checked })} /> Big driving screen while your status is Driving</label>
      <label class="check"><input type="checkbox" checked={s.darkDriveAtNight} onChange={(e) => setState({ darkDriveAtNight: (e.target as HTMLInputElement).checked })} /> Dark driving screen at night</label>
      {speechOk && <label class="check"><input type="checkbox" checked={s.speakAlerts} onChange={(e) => setState({ speakAlerts: (e.target as HTMLInputElement).checked, speechAsked: true })} /> Read driving alerts out loud</label>}
      {speechOk && <p class="muted small">At 60, 30 and 15 minutes of driving left — and when time runs out — the app says the numbers out loud after the alert sound, and confirms out loud when you tap a status, so you never have to read while you roll. Changing this switch is your answer to the one-time question the app asks on your first Driving tap. It uses this browser's voice; nothing is recorded or sent anywhere.</p>}
      <p class="muted small">Between 7 PM and 7 AM on this phone's clock, the driving screen wears the dark theme even when the app is set to Day — a lit screen in a dark cab is glare. The rest of the app keeps your theme.</p>
      {!awakeOk && <p class="small">This browser cannot keep the screen on. Set your phone's auto-lock to "Never" while you drive, or the alerts will stop when it locks.</p>}
      <div class="row">
        <button onClick={test}>Test alert</button>
        {notif === 'default' && <button onClick={() => { void askNotify().then(setNotif); }}>Also notify when in background</button>}
      </div>
      <p class="muted small">
        {notif === 'granted' ? 'Notifications are on: if the app is open behind another app, alerts also show as notifications. ' : ''}
        {notif === 'denied' ? 'Notifications are blocked for this site in your browser settings. ' : ''}
        Alerts only work while Split Decision is open — when the phone locks or the app is closed, the phone stops it. Keeping the screen on is what keeps it running in a mounted phone; it uses more battery, so keep the phone charging. iPhones do not let web apps vibrate, and the silent switch can mute the sound: use "Test alert" to check. Nothing needs a tap while you drive. <b>Your ELD is your official warning.</b>
      </p>
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
      <p class="muted small">Shown when you add an entry on the Log. A break is not a duty status of its own: each button logs the length and status you set here. For example, a 20-minute paid break and a 40-minute lunch, each logged the way your carrier has you log it.</p>
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

function SettingsTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const c = s.config;
  const [ioNote, setIoNote] = useState<string | null>(null);
  const setC = (p: Partial<typeof c>) => setState({ config: { ...c, ...p } });
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
      setState((cur) => applyImportedState(cur, d));
      setIoNote(`Imported ${(d.segments ?? []).length} segment(s) and ${(d.tentative ?? []).length} what-if row(s) from ${f.name}. Settings and the trip scenario came back with them; a simulated clock does not.${badZone ? ` The file's time zone "${badZone}" is not valid, so your home terminal zone stayed ${getState().config.timeZone}.` : ''}${resets.length ? ` Values the app could not use were replaced in ${resets.join(' and ')}.` : ''}`);
    }).catch((err) => setIoNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`));
  };
  return (
    <>
      <button class="rowbtn" onClick={() => setState({ tab: 'recap' })}>
        <span><span class="muted">Recap</span><br /><b>Hours coming back, day by day</b></span>
        <Icon d={I.next} />
      </button>
      <Card title="Rules">
        <label>Cycle<Toggle options={[['70/8', '70 hr / 8 days'], ['60/7', '60 hr / 7 days']]} value={c.cycle} onChange={(v) => setC({ cycle: v })} /></label>
        <label>Carrier day starts at<select value={c.dayStartHour} onChange={(e) => setC({ dayStartHour: Number((e.target as HTMLSelectElement).value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <TimeZoneField value={c.timeZone} onChange={(v) => setC({ timeZone: v })} />
        <label class="check"><input type="checkbox" checked={c.shortHaul} onChange={(e) => setC({ shortHaul: (e.target as HTMLInputElement).checked })} /> Short-haul (§395.1(e)) — no 30-min break rule</label>
        <p class="muted small">Adverse-conditions and 16-hour-day exceptions are per shift — set them on the Now screen, under "Exceptions this shift".</p>
      </Card>
      <Card title="Planning">
        <Slider label="Net average speed" value={s.mph} min={40} max={70} step={1} onChange={(v) => setState({ mph: v })} fmt={(v) => `${v} mph`} unit="mph" />
        <label>Main card on Now<Toggle options={[['timeline', 'Timeline'], ['dial', 'Dial']]} value={s.nowCard} onChange={(v) => setState({ nowCard: v as State['nowCard'], nowCardAsked: true })} /></label>
        <p class="muted small">Timeline shows your limits as lanes ending at their clock times, so you can see which one ends first. Dial is the gauge the app has always had. The driving view keeps the dial either way.</p>
        <label>Screen<Toggle options={[['day', 'Day'], ['night', 'Night']]} value={effectiveTheme(s, devicePrefersDark())} onChange={(v) => chooseTheme(v as Theme)} /></label>
        <p class="muted small">Until you pick one here, the screen follows your phone's light/dark setting — a dark phone gets the night palette, so there is no blast of white in a dark cab. Day is the default the app ships with, and the readable one outdoors, which is where most planning happens. Once you pick, your pick stays. Both palettes are contrast-checked against WCAG AA, and there is a one-tap switch in the header.</p>
      </Card>
      <DrivingAlertsCard s={s} />
      <BreakButtonsCard s={s} />
      <Card title="Bug reports">
        <BugButton s={s} ev={ev} />
        <p class="muted small">Opens a GitHub issue form with your clocks, build number and log pre-filled (a free GitHub account is needed to submit). Your log is also copied to the clipboard. Beta rules: <a href={`https://github.com/${REPO}#free-beta`} target="_blank" rel="noopener">github.com/{REPO}</a></p>
        <label>Prefer email instead? Send reports to<input type="email" placeholder="leave blank to use GitHub" value={s.bugEmail} onChange={(e) => setState({ bugEmail: (e.target as HTMLInputElement).value.trim() })} /></label>
      </Card>
      <Card title="Data">
        <div class="row"><button onClick={exportJson}>Export JSON</button><label class="filebtn">Import JSON<input type="file" accept="application/json" onChange={importJson} /></label></div>
        {ioNote && <p class="muted small">{ioNote}</p>}
        <button class="danger" onClick={() => { if (confirm('Start over? Your log is replaced with a fresh 10-hour rest ending now. You can undo this from the Log.')) { startOver(now); setState({ tab: 'log' }); } }}>Start over: fresh 10-hour rest ending now</button>
        <p class="muted small">Moved here from the Log's add panel, where it sat one tap from Add. It can be undone from the Log.</p>
        <button class="danger" onClick={() => { if (confirm('Erase everything?')) { try { localStorage.removeItem(SIM_KEY); } catch { /* ignore */ } setState({ segments: [], tentative: [], current: null, nowOverride: null, historyAcknowledged: false, dayCloses: [], config: { ...c, adverseShifts: [], sixteenHourShifts: [] } }); } }}>Erase all data</button>
        <p class="muted small">Everything stays on this phone. Nothing is uploaded.</p>
      </Card>
      <Card title="About">
        <p class="small">Split Decision — HOS What-If Planner. It is not an ELD, is not FMCSA-registered, and does not replace your record of duty status. Your official log and your carrier's ELD govern. Rules: 49 CFR 395.1(b)(1), (g), (o), 395.3; FMCSA HOS FAQ (Nov 2020). Property-carrying, US interstate drivers only — no passenger, Canada, Alaska or oilfield rules.</p>
        <p class="muted small">Your HOS what-if planner.</p>
        <p class="muted small">Build {__BUILD__} · now {clock(now)}</p>
      </Card>
      {/* Kept apart at the bottom of More on purpose (patch 7): a testing clock sat in the Planning
          card, one stray tap from the settings a driver actually uses, and every clock in the app
          then quietly lied. While it is set, a banner rides every screen — see App. */}
      <Card title="Testing">
        <label>Simulated "now" (testing)<input type="datetime-local" value={s.nowOverride ? toInput(s.nowOverride) : ''} onChange={(e) => { const v = fromInput((e.target as HTMLInputElement).value); if (v === null) useRealClock(); else setState({ nowOverride: v }); }} /></label>
        <button onClick={() => useRealClock()} disabled={!s.nowOverride}>Use real clock</button>
        <p class="muted small">For trying the app against a made-up time. Anything you change while it is set is thrown away when you go back to the real clock, and alerts never sound while it is set.</p>
      </Card>
    </>
  );
}

/* ============================================================ App */

/**
 * Startup disclaimer. Standing rule: this is never an ELD, never FMCSA-registered and never a legal
 * record of duty status — and a driver who believes otherwise will treat a scratchpad as evidence.
 * Shown on every launch: the driver who needs to read it is not the one who read it last week.
 * Since patch 7 it shows in two sizes: the full box until the driver's first "I understand"
 * (state.disclaimerAcked), and a compact version — the header's one line plus a short paragraph —
 * on every launch after that. It never disappears entirely, and the home-terminal question still
 * rides along in both sizes until the zone is confirmed.
 */
/**
 * The "I understand" tap (capstone C1, decision C1-A): always records the acknowledgement.
 * On the FIRST acknowledgement from a device holding no record at all — no segments, no
 * what-if rows, no live status, i.e. a fresh install — it also opens Now on the Timeline.
 * Existing installs acknowledged the full disclaimer long ago (patch 7), so they never pass
 * through here with the flag unset: they keep the dial, and meet the Timeline through the
 * one-time chip (NowTab) or the More → Planning switch instead.
 */
export function acknowledgeDisclaimer() {
  setState((cur) => (cur.disclaimerAcked
    ? { disclaimerAcked: true }
    : {
        disclaimerAcked: true,
        ...(cur.segments.length === 0 && cur.tentative.length === 0 && !cur.current ? { nowCard: 'timeline' as const } : {}),
      }));
}

function Disclaimer({ onClose, tz, needsTz, compact }: { onClose: (tz?: string) => void; tz: string; needsTz: boolean; compact?: boolean }) {
  // Move focus into the dialog: keyboard and screen-reader users start on its only control.
  const btn = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState(tz);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div class="modal">
        <h2 id="disclaimer-title">Before you use this</h2>
        {compact ? (
          <>
            <p><b>Planning only — not a log, not an ELD.</b></p>
            <p class="small">Split Decision is a planning scratchpad. Your ELD is your official record of duty status — when it and this app disagree, the ELD governs.</p>
          </>
        ) : (
          <>
            <p><b>Split Decision is a planning scratchpad.</b> It is not an ELD, it is not FMCSA-registered, and it is not a legal record of duty status. It sends nothing anywhere — your log stays on this device.</p>
            <p>Your official record is your ELD. When an ELD fails, 49 CFR 395.34 still requires your own paper records. Always follow your carrier's rules and 49 CFR part 395.</p>
            <p class="muted small">The point of this tool is to show you what you will have <b>after</b> the nap and the bunk time — not to prove what you had.</p>
          </>
        )}
        {needsTz && (
          <>
            <h3>Where is your home terminal?</h3>
            {/* Name the zone actually saved. Naming the phone's zone and pre-filling it replaced an existing
                driver's terminal zone with the phone's on one tap of "I understand" (re-check N1). */}
            <p class="small">Clock times on screen are shown in your <b>phone's</b> time zone; your carrier day — and the recap hours that come back with it — is worked out in your <b>terminal's</b> time zone. It is set to <b>{tz}</b>{tz === deviceTz ? <>, your phone's zone right now</> : <>. Your phone's zone right now is <b>{deviceTz}</b></>}. If your terminal is somewhere else, change it here — the zone moves every day boundary and the whole recap.</p>
            <TimeZoneField value={choice} onChange={setChoice} />
          </>
        )}
        <button ref={btn} onClick={() => onClose(needsTz ? choice : undefined)}>I understand</button>
      </div>
    </div>
  );
}

/**
 * The spoken-alerts question (patch 17, decision D7-A): asked once, on the first real
 * Driving tap, and never again — either answer is remembered, and Settings can change it
 * later. Modelled on the Disclaimer modal: it is answered by its two buttons, not dismissed
 * by a backdrop tap, because both answers are decisions the app must record. A "Yes" speaks
 * the confirmation for the tap that raised the question, if the driver is still driving —
 * the one confirmation the question itself had to hold back.
 */
function SpeakAskDialog() {
  const yes = () => {
    setState({ speakAlerts: true, speechAsked: true, speakAskOpen: false });
    const cur = getState();
    if (cur.current?.status === 'D' && cur.nowOverride === null) {
      try {
        const at = nowMin();
        const ev2 = evaluate(allSegments(cur, at), { asOf: at, config: cur.config });
        speakAloud(statusSpeech('D', cur.current.since, ev2.driveNow, ev2.mustStopBy));
      } catch { /* the setting is on either way; the next alert will speak */ }
    }
  };
  const no = () => setState({ speakAlerts: false, speechAsked: true, speakAskOpen: false });
  return (
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="speakask-title">
      <div class="modal">
        <h2 id="speakask-title">Want the alerts read out loud?</h2>
        <p class="small">While you drive, Split Decision can say the numbers out loud — how much driving is left at 60, 30 and 15 minutes, when time runs out, and a spoken confirmation when you tap a status — so you never have to read the screen. It uses this browser's voice. Nothing is recorded, and nothing leaves your phone.</p>
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
 * The launch notice is open until dismissed, once per launch (a page load): module state rather than
 * component state, so it survives a remount within the launch and comes back on the next one. Exported
 * so a test can look behind it.
 */
let launchNotice = true;
let backNav: BackNav | null = null;
export function setLaunchNotice(open: boolean) { launchNotice = open; }

export function App() {
  const s = useStore();
  const now = useNow();
  // Startup disclaimer — dismissed for this launch only; a fresh launch shows it again.
  const [, redraw] = useState(0);
  const disclaimer = launchNotice;
  const setDisclaimer = (open: boolean) => { setLaunchNotice(open); redraw((x) => x + 1); };
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
      if (b && !(b as HTMLButtonElement).disabled) tapTick();
    };
    document.addEventListener('click', f, true);
    return () => document.removeEventListener('click', f, true);
  }, []);
  const again = useDriveAgain(s, now, ev);
  const sheet = useSheet();
  // The phone's Back button closes a panel, steps back to Plan or Now, then leaves (backnav.ts, re-check M11).
  useEffect(() => {
    const nav = createBackNav(window.history, () => ({ tab: getState().tab, sheet: currentSheet() !== null }),
      { closeSheet: sheetBack, goTo: (tab) => setState({ tab }) });
    backNav = nav;
    const f = () => nav.onPop();
    window.addEventListener('popstate', f);
    nav.sync();
    return () => { window.removeEventListener('popstate', f); backNav = null; };
  }, []);
  useEffect(() => { backNav?.sync(); }, [s.tab, sheet]);
  if (!ev) {
    return (
      <div class="app"><main>
        <div class="card warn">
          <h3>Split Decision could not calculate your clocks</h3>
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
  const tabs: [State['tab'], string, string][] = [['now', 'Now', I.now], ['log', 'Log', I.log], ['plan', 'Plan', I.plan], ['settings', 'More', I.more]];
  // The planning screens sit under Plan and Recap sits under More: the tab bar shows where you are,
  // not a fifth or sixth tab (declutter patch, 2026-11-05).
  const navOf = (t: State['tab']): State['tab'] => (t === 'split' || t === 'trip' || t === 'load' ? 'plan' : t === 'recap' || t === 'history' ? 'settings' : t);
  // A fresh clock is a demo, and the shell says so: the hero carries the stamp (see styles.css).
  const fresh = historyBasis(s, now) === 'fresh';
  // Behind the launch notice or an open panel, nothing else can take focus or be read as current.
  const blocked = disclaimer || sheet !== null;
  if (showsDrivingView(s)) {
    return (
      <div class="app">
        {disclaimer && <Disclaimer tz={s.config.timeZone} needsTz={!s.tzChosen} compact={s.disclaimerAcked} onClose={(tz) => { unlockAudio(); if (tz) chooseTimeZone(tz); acknowledgeDisclaimer(); setDisclaimer(false); }} />}
        <div inert={blocked}>
          <DrivingView s={s} now={now} ev={ev} again={again} onDetails={() => { setDrivingPeek(s.current?.since ?? null); redraw((x) => x + 1); }} />
        </div>
        {!disclaimer && sheet?.kind === 'status' && <StatusSheet s={s} now={now} />}
        {!disclaimer && sheet?.kind === 'since' && <SinceSheet s={s} now={now} />}
        {!disclaimer && s.speakAskOpen && <SpeakAskDialog />}
      </div>
    );
  }
  return (
    <div class={fresh ? 'app is-demo' : 'app'}>
      {disclaimer && <Disclaimer tz={s.config.timeZone} needsTz={!s.tzChosen} compact={s.disclaimerAcked} onClose={(tz) => { unlockAudio(); if (tz) chooseTimeZone(tz); acknowledgeDisclaimer(); setDisclaimer(false); }} />}
      <TopBar ev={ev} now={now} s={s} inert={blocked} again={again} onNow={s.tab === 'now'} />
      <main inert={blocked} class={s.tab === 'now' ? 'has-dock' : undefined}>
        {s.nowOverride !== null && (
          <p class="warnbox"><b>Simulated clock.</b> Every time on screen is worked out for {clock(now)} — a made-up time set under More → Testing, not the real time. Anything you change while it is up is thrown away when you go back to the real clock. <button class="mini" onClick={() => useRealClock()}>Use real clock</button></p>
        )}
        {s.themeNotice && (
          <div class="card warn">
            <div class="row">
              <span class="small">Switched to the <b>Day</b> theme — it is the new default. The header switch or Settings will put it back to Night.</span>
              <button class="mini" onClick={() => setState({ themeNotice: false })}>Got it</button>
            </div>
          </div>
        )}
        {s.tab !== 'now' && <Notices ev={ev} now={now} s={s} />}
        <TabBoundary key={s.tab} tab={s.tab}>
          {s.tab === 'now' && <NowTab s={s} now={now} ev={ev} again={again} onExitPeek={() => { setDrivingPeek(null); redraw((x) => x + 1); }} />}
          {s.tab === 'log' && <LogTab s={s} now={now} ev={ev} />}
          {s.tab === 'plan' && <PlanTab />}
          {s.tab === 'split' && <SplitTab s={s} now={now} ev={ev} />}
          {s.tab === 'recap' && <RecapTab s={s} now={now} ev={ev} />}
          {s.tab === 'history' && <HistoryTab s={s} now={now} />}
          {s.tab === 'trip' && <TripTab s={s} now={now} ev={ev} />}
          {s.tab === 'load' && <LoadTab s={s} now={now} ev={ev} />}
          {s.tab === 'settings' && <SettingsTab s={s} now={now} ev={ev} />}
        </TabBoundary>
      </main>
      <nav class="tabs" inert={blocked}>{tabs.map(([k, l, icon]) => {
        const on = navOf(s.tab) === k;
        return <button key={k} class={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => setState({ tab: k })}><Icon d={icon} /> {l}</button>;
      })}</nav>
      {!disclaimer && sheet?.kind === 'status' && <StatusSheet s={s} now={now} />}
      {!disclaimer && sheet?.kind === 'since' && <SinceSheet s={s} now={now} />}
      {!disclaimer && sheet?.kind === 'quickstart' && <QuickStartSheet s={s} now={now} />}
      {!disclaimer && sheet?.kind === 'drift' && <DriftSheet s={s} now={now} />}
      {!disclaimer && sheet?.kind === 'why' && <WhySheet s={s} now={now} ev={ev} />}
      {!disclaimer && sheet?.kind === 'exceptions' && <ExceptionsSheet ev={ev} />}
      {!disclaimer && sheet?.kind === 'lever' && <LeverSheet s={s} now={now} ev={ev} lever={sheet.lever} />}
      {!disclaimer && (sheet?.kind === 'edit' || sheet?.kind === 'add') && <EditorSheet key={sheet.kind === 'edit' ? `e${sheet.seg.start}-${sheet.seg.end}` : `a${sheet.inside?.start ?? ''}`} k={sheet} s={s} now={now} />}
      {!disclaimer && s.speakAskOpen && <SpeakAskDialog />}
    </div>
  );
}
