import { useEffect, useMemo, useState, useRef } from 'preact/hooks';
import { Component, type ComponentChildren } from 'preact';
import { nextAlert, alertBanner, alertMessage, wantsWakeLock, unlockAudio, chime, buzz, sound, audioReady, clearPendingSound, notify, notifyState, askNotify, canKeepAwake, NO_ALERTS, type AlertMemory, type NotifyState } from './alerts.ts';

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
  evaluate, driveAgainAt, pruneHistory, planTripAll, carrierDayStart, nextCarrierDayStart, TRIP_STRATEGIES, safeHaven, normalize, LIMITS, type TripStrategy, type Segment, type DutyStatus, type FullEvaluation, type Violation, type TripPlan,
} from '../../engine/src/index.ts';
import {
  useStore, setState, useNow, allSegments, toInput, fromInput, clock, clockFull, dur, hrs, STATUS_LABEL, STATUS_COLOR, segLabel, exportState, applySegmentEdit, isValidTimeZone, terminalMidnightOnDevice, TIME_ZONES, deviceTz, applyImportedState, applyTheme, chooseTheme, chooseTimeZone, historyBasis, cycleBasis, applyDayPatch, dayPatchOverflow, stamp, meaningfulGaps, statusTap, currentRunStart, joinDisplayRows, DEFAULT_TRIP, DEFAULT_SPLIT, DEFAULT_LOADCHECK, type State, type TripDraft, type SplitDraft, type LoadCheckDraft, type Theme, nowMin, importProblem, INITIAL_STATE, getState,
} from './store.ts';

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
  const typed = (raw: string) => {
    setText(raw);
    if (isValidTimeZone(raw.trim())) { setBad(false); onChange(raw.trim()); } else setBad(true);
  };
  return (
    <>
      <label>Home terminal time zone
        <input list="tz-list" aria-label="Home terminal time zone" value={text} onInput={(e) => typed((e.target as HTMLInputElement).value)} />
        <datalist id="tz-list">{TIME_ZONES.map((z) => <option key={z} value={z} />)}</datalist>
      </label>
      {bad && <div class="warnbox small">"{text}" isn't a time-zone name, so the setting is unchanged. Start typing a city and pick from the list — for example <b>America/Chicago</b>.</div>}
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
  if (ev.binding === 'BREAK_30') return ev.shift.breakRemaining <= 0 ? '30-min break due' : `8-hour rule (30-min break in ${dur(ev.shift.breakRemaining)})`;
  // Name the limit in full, with its number: "driving limit" did not say which one (redesign).
  switch (ev.binding) {
    case 'DRIVE_11': return `${ev.shift.limits.drive / 60}-hour driving limit`;
    case 'WINDOW_14': return `${ev.shift.limits.window / 60}-hour window`;
    case 'CYCLE': return `${ev.cycle.limit / 60}-hour week`;
    default: return 'no limit';
  }
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
    location.href = `mailto:${s.bugEmail}?subject=${encodeURIComponent('HOS Sandbox bug')}&body=${encodeURIComponent(body)}`;
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
  | { kind: 'why' }
  | { kind: 'exceptions' }
  | { kind: 'edit'; seg: Segment }
  | { kind: 'add' };
let sheetNow: SheetKind | null = null;
const sheetSubs = new Set<() => void>();
export function openSheet(k: SheetKind | null) { sheetNow = k; sheetSubs.forEach((f) => f()); }
export function currentSheet(): SheetKind | null { return sheetNow; }
function useSheet(): SheetKind | null {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); sheetSubs.add(f); return () => { sheetSubs.delete(f); }; }, []);
  return sheetNow;
}

function Sheet({ title, children }: { title: string; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the panel's own first action (marked data-first), else its first control.
    const el = box.current?.querySelector<HTMLElement>('[data-first]') ?? box.current?.querySelector<HTMLElement>('button, input, select');
    el?.focus();
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
export function tapStatus(st: DutyStatus, note?: string, minutesAgo = 0) {
  // A tap is the browser's permission to play sound later, so a driving alert can be heard (alerts.ts).
  unlockAudio();
  setState((cur) => {
    // Read the clock at the tap, not the last render's minute: a stale `now` backdated the change and
    // could drop the status being closed (bug report C5/L3).
    const now = cur.nowOverride ?? nowMin();
    const at = now - Math.max(0, minutesAgo);
    if (minutesAgo > 0 && cur.current && at <= cur.current.since) return {};
    // Tapping the status you are already in changes nothing (statusTap returns null): re-stamping the
    // row reset the header pill to 0m mid-rest, while every clock stayed identical (driver report).
    return statusTap(cur, st, note, at) ?? {};
  });
}
/** How far back "started earlier" may reach: only while the status being left is still running. */
export function startOffsets(cur: State, now: number): { minutes: number; ok: boolean }[] {
  return [0, 5, 15, 30].map((m) => ({ minutes: m, ok: m === 0 || !cur.current || now - m > cur.current.since }));
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
function RestHero({ s, now, ev, again }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain }) {
  const status = s.current?.status ?? 'OFF';
  const resting = status === 'OFF' || status === 'SB';
  const { off, sb, before } = again;
  const cycleWord = `${ev.cycle.limit / 60}-hour`;
  const lead = status === 'D' ? <p class="hero-lead">No driving time left — stop driving.</p> : null;
  const why = <button class="link" onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button>;
  if (off === null) {
    return (
      <section class="hero bad">
        {lead}
        <div class="hero-label">Out of driving time</div>
        <p class="hero-text"><b>Driving does not come back within 36 hours of rest.</b> See <b>Recap</b> for when your {cycleWord} hours return.</p>
        <div class="hero-foot">{why}</div>
      </section>
    );
  }
  const time = (label: string) => (
    <>
      <div class="hero-label">{label}</div>
      <div class="hero-value">{clock(off)}</div>
      <div class="hero-stop">{dur(off - now)} from now{resting && ev.binding !== 'BREAK_30' ? `, if you stay ${status === 'SB' ? 'in the sleeper' : 'off duty'}.` : ''}</div>
    </>
  );
  if (ev.binding === 'BREAK_30') {
    return (
      <section class="hero warn">
        {lead}
        {time('30-min break needed — you can drive again at')}
        <p class="hero-text">Any 30 minutes in a row without driving counts — off duty, sleeper, or on-duty work like fueling.</p>
        <div class="hero-foot">{why}</div>
      </section>
    );
  }
  if (ev.binding === 'CYCLE') {
    return (
      <section class="hero warn">
        {lead}
        {time(`Out of ${cycleWord} hours — ${resting ? 'if you stay off duty, you' : 'go off duty now and you'} can drive again at`)}
        <p class="hero-text">On-duty work is allowed, but it counts toward your {cycleWord} hours and can push this later.</p>
        <div class="hero-foot">{why}</div>
      </section>
    );
  }
  if (resting) {
    return (
      <section class="hero">
        {time('You can drive again at')}
        <p class="hero-text">Going on duty before then is allowed (only driving is not), but it ends this rest: you will need 10 consecutive hours off, or a sleeper-berth split, before you drive.</p>
        <div class="hero-foot">{why}</div>
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
      <div class="hero-foot">{why}</div>
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
    const r = nextAlert(mem.current, driving, driveNow, now);
    mem.current = r.mem;
    if (!driving) clearPendingSound();
    // A simulated clock is for planning: show the banner, but never sound off.
    if (r.fire === null || !ev || !s.alertsOn || s.nowOverride !== null) return;
    const m = alertMessage(r.fire, alertReason(ev));
    sound(r.fire <= 15); void notify(m.title, m.body);
  }, [now, driveNow, driving, s.alertsOn, s.nowOverride]);
}

/** Hold a screen wake lock while `active`. The browser drops it whenever the app is hidden, so re-take it on return. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !canKeepAwake()) return;
    let lock: { release: () => Promise<void> } | null = null, gone = false;
    const take = async () => {
      if (gone || document.visibilityState !== 'visible') return;
      try {
        const l = await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock.request('screen');
        if (gone) void l.release().catch(() => {}); else lock = l;
      } catch { /* refused (battery saver, not visible): nothing to do */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') void take(); };
    void take();
    document.addEventListener('visibilitychange', onVis);
    return () => { gone = true; document.removeEventListener('visibilitychange', onVis); void lock?.release().catch(() => {}); };
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
  const next = s.theme === 'day' ? 'night' : 'day';
  return (
    <header class="top" inert={inert}>
      <div class="top-row">
        <span class="pill" style={{ background: STATUS_COLOR[status] }}>{segLabel(status, s.current?.note)}{s.current ? ` · ${dur(now - currentRunStart(s, now))}` : ''}</span>
        <span class="top-right">
          <span class="muted">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
          <button class="theme-btn" aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} onClick={() => chooseTheme(next)}><Icon d={next === 'night' ? I.moon : I.sun} size={18} /> {next === 'night' ? 'Night' : 'Day'}</button>
        </span>
      </div>
      {!onNow && (ev.driveNow > 0
        ? <div class="compact"><b>{dur(ev.driveNow)}</b> of driving · Stop by <b>{clock(ev.mustStopBy)}</b></div>
        : again && again.off !== null && status !== 'D' && <div class="compact">{ev.binding === 'BREAK_30' ? '30-min break due' : ev.binding === 'CYCLE' ? `Out of ${ev.cycle.limit / 60}-hour hours` : 'Out of hours'} · <b>drive again at {clock(again.off)}</b></div>)}
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
function Notices({ ev, now, s }: { ev: FullEvaluation; now: number; s: State }) {
  const hist = historyBasis(s, now);
  return (
    <>
      {hist !== 'known' && (
        <div class="warnbox small">
          {hist === 'fresh' ? (
            <>
              <b>Assumed fresh clock.</b> Nothing is logged, so these numbers assume a full {ev.shift.limits.drive / 60}-hour driving / {ev.shift.limits.window / 60}-hour window and an empty {ev.cycle.limit / 60}-hour cycle — not your actual day.
              Tap your current status or add today's duty on the <b>Log</b> tab before you trust them.
            </>
          ) : (
            <>
              <b>History incomplete — estimates only.</b> You have a current status but nothing behind it, so these numbers still assume you started from zero. Duty you haven't entered cannot be counted.{' '}
              <button class="mini" onClick={() => setState({ historyAcknowledged: true })}>It really does start here</button>
            </>
          )}
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
        <div class="muted small">
          <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {String(s.config.dayStartHour).padStart(2, '0')}:00 <b>{s.config.timeZone}</b>. A midnight recap is not midnight on the clock above.
        </div>
      )}
    </>
  );
}

/* ============================================================ Now */

/** The one number a driver needs, in the size he needs it: driving left, the stop time, and why. */
function HeroDrive({ ev }: { ev: FullEvaluation }) {
  const tone = ev.driveNow < 60 ? 'warn' : 'good';
  return (
    <section class="hero">
      <div class="hero-label">You can drive</div>
      <div class={`hero-value ${tone}`}>{dur(ev.driveNow)}</div>
      <div class="hero-stop">Stop by {clock(ev.mustStopBy)}</div>
      <div class="hero-foot">
        <span class="muted">limited by {bindingLabel(ev)}</span>
        <button class="link" data-why onClick={() => openSheet({ kind: 'why' })}><Icon d={I.info} size={18} /> Why?</button>
      </div>
      {(ev.shift.pendingSplitLeg || ev.shift.notes.length > 0) && (
        <div class="muted small">{[ev.shift.pendingSplitLeg ? 'Split leg pending' : '', ev.shift.notes.length ? 'Exception active' : ''].filter(Boolean).join(' · ')}</div>
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
      ? [{ key: 'BREAK_30' as const, label: '30-min break', left: sh.breakRemaining, of: 480, value: sh.breakRemaining <= 0 ? 'due now' : `in ${dur(sh.breakRemaining)}` }]
      : []),
    { key: 'CYCLE', label: `${ev.cycle.limit / 60}-hr week`, left: ev.cycle.remaining, of: ev.cycle.limit },
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

/** The four statuses, always at the bottom of Now, within thumb reach. */
function StatusDock({ s }: { s: State }) {
  return (
    <div class="dock">
      <div class="status-buttons">{(['OFF', 'SB', 'D', 'ON'] as DutyStatus[]).map((st) => {
        const on = s.current?.status === st && !s.current?.note;
        return <button key={st} style={{ background: STATUS_COLOR[st] }} class={on ? 'on' : ''} aria-pressed={on} onClick={() => tapStatus(st)}>{on && <Icon d={I.check} size={16} />}{STATUS_LABEL[st]}</button>;
      })}</div>
      <button class="link dock-more" onClick={() => openSheet({ kind: 'status' })}>PC, yard move, or started earlier…</button>
    </div>
  );
}

function NowTab({ s, now, ev, again, onExitPeek }: { s: State; now: number; ev: FullEvaluation; again: DriveAgain | null; onExitPeek: () => void }) {
  const warn = ev.shift.notes.filter((n) => n.startsWith('⚠'));
  const active = [ev.shift.exceptionKeys.adverse !== null ? 'Adverse conditions' : '', ev.shift.exceptionKeys.sixteen !== null ? '16-hour day' : ''].filter(Boolean);
  return (
    <>
      {drivingPeeked(s) && <button class="wide" onClick={onExitPeek}>‹ Back to the driving view</button>}
      {ev.driveNow > 0 || !again ? <HeroDrive ev={ev} /> : <RestHero s={s} now={now} ev={ev} again={again} />}
      <Meters ev={ev} />
      <Card title="Last 24 hours"><Grid segments={allSegments(s, now)} from={now - 1440} to={now} /></Card>
      <button class="rowbtn" onClick={() => openSheet({ kind: 'exceptions' })}>
        <span><span class="muted">Exceptions this shift</span><br /><b>{active.length ? active.join(' · ') : 'None'}</b></span>
        <Icon d={I.next} />
      </button>
      {warn.map((n, i) => <p key={i} class="warnbox small">{n}</p>)}
      <div class="quick">
        <button onClick={() => setState({ tab: 'load' })}><Icon d={I.truck} /> Take a load?</button>
        <button onClick={() => setState({ tab: 'split' })}><Icon d={I.bunk} /> Plan a split</button>
      </div>
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

/** How much of the binding limit is left, 0–1, for the driving view's bar. */
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
        <span class="pill" style={{ background: STATUS_COLOR.D }}>{segLabel('D', s.current?.note)} · {dur(now - currentRunStart(s, now))}</span>
        <span class="top-right">
          <span class="drive-clock">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
          <button class="drive-details" onClick={onDetails}>Details</button>
        </span>
      </div>
      <div class="drive-body">
        <div class="drive-label">{level === 'bad' ? 'Out of driving time' : 'Driving left'}</div>
        <div class={`drive-num ${left.length > 4 ? '' : 'short'}`}>{left}</div>
        <div class="drive-head">{level === 'bad' ? 'Park as soon as it is safe' : level === 'warn' ? 'Plan where you\u2019ll park' : `Stop by ${clock(ev.mustStopBy)}`}</div>
        <div class="drive-why">{level === 'bad' ? `Over the ${alertReason(ev)}` : level === 'warn' ? `Stop by ${clock(ev.mustStopBy)} · ${bindingLabel(ev)}` : `limited by ${bindingLabel(ev)}`}</div>
        <div class="drive-bar" aria-hidden="true"><span style={{ width: `${(bindingShare(ev) * 100).toFixed(0)}%` }} /></div>
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

function StatusSheet({ s, now }: { s: State; now: number }) {
  const [ago, setAgo] = useState(0);
  const offsets = startOffsets(s, now);
  const pick = (st: DutyStatus, note?: string) => { tapStatus(st, note, ago); openSheet(null); };
  const cur = s.current;
  const isOn = (st: DutyStatus, note?: string) => cur?.status === st && (cur?.note ?? undefined) === note;
  return (
    <Sheet title="What are you doing now?">
      <div class="big-status">{(['OFF', 'SB', 'ON', 'D'] as DutyStatus[]).map((st, i) => (
        <button key={st} data-first={i === 0 ? true : undefined} style={{ background: STATUS_COLOR[st] }} class={isOn(st) ? 'on' : ''} aria-pressed={isOn(st)} onClick={() => pick(st)}>
          <Icon d={STATUS_ICON[st]} size={26} /><span>{STATUS_LABEL[st]}</span>
        </button>
      ))}</div>
      <div class="row">
        <button class={isOn('OFF', 'PC') ? 'on-outline' : ''} aria-pressed={isOn('OFF', 'PC')} onClick={() => pick('OFF', 'PC')}>Personal conveyance</button>
        <button class={isOn('ON', 'YM') ? 'on-outline' : ''} aria-pressed={isOn('ON', 'YM')} onClick={() => pick('ON', 'YM')}>Yard move</button>
      </div>
      <h3>When did it start?</h3>
      <div class="toggle" role="group" aria-label="When did it start?">
        {offsets.map((o) => <button key={o.minutes} class={ago === o.minutes ? 'on' : ''} aria-pressed={ago === o.minutes} disabled={!o.ok} onClick={() => setAgo(o.minutes)}>{o.minutes ? `${o.minutes} min ago` : 'Now'}</button>)}
      </div>
      <p class="muted small">{ago ? `Starts at ${clock(now - ago)}. Use this when you forgot to tap.` : `Starts at ${clock(now)} — right now.`} Earlier than that? Add it on the <b>Log</b> tab.</p>
    </Sheet>
  );
}

/** Each rule's own stop time, if he drove from now without stopping; the earliest one is the answer. */
function WhySheet({ now, ev }: { now: number; ev: FullEvaluation }) {
  const sh = ev.shift;
  const split = sh.chain.length >= 2;
  const rows = [
    { key: 'DRIVE_11', name: `${sh.limits.drive / 60}-hour driving`, left: sh.driveRemaining,
      text: `You have driven ${dur(sh.driveUsed)} since your last 10-hour rest${split ? ' (counting your sleeper split)' : ''}. ${dur(sh.driveRemaining)} more is allowed.` },
    ...(Number.isFinite(sh.breakRemaining) ? [{ key: 'BREAK_30', name: '30-minute break', left: sh.breakRemaining,
      text: `After 8 hours of driving you need 30 minutes in a row without driving. ${sh.driveSinceBreak > 0 ? `You have driven ${dur(sh.driveSinceBreak)} since your last one.` : 'Your last stop counted, so the 8 hours start when you next drive.'}` }] : []),
    { key: 'WINDOW_14', name: `${sh.limits.window / 60}-hour window`, left: sh.windowRemaining,
      text: `No driving once ${sh.limits.window / 60} hours have passed since your shift started — breaks don't stop it${split ? ', except a qualifying sleeper split' : ''}.` },
    { key: 'CYCLE', name: `${ev.cycle.limit / 60}-hour week`, left: ev.cycle.remaining,
      text: `${dur(ev.cycle.remaining)} left in this ${ev.cycle.windowDays}-day period.` },
  ];
  const when = (left: number) => (left <= 0 ? 'Now' : left > 1440 ? 'Not today' : clock(now + left));
  return (
    <Sheet title={ev.driveNow > 0 ? `Why stop by ${clock(ev.mustStopBy)}?` : 'Why can’t I drive?'}>
      <p class="sheet-lead">If you drove from now without stopping, each rule would end at its own time. The earliest one is the one that counts.</p>
      <ul class="why">{rows.map((r) => (
        <li key={r.key} class={ev.binding === r.key ? 'on' : ''}>
          <div class="why-head"><b>{r.name}</b><span class="why-time">{when(r.left)}</span></div>
          <div class="small">{r.text}</div>
          {ev.binding === r.key && <div class="why-tag">Earliest — this sets your stop time</div>}
        </li>
      ))}</ul>
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

function Grid({ segments, from, to }: { segments: Segment[]; from: number; to: number }) {
  const rows: DutyStatus[] = ['OFF', 'SB', 'D', 'ON'];
  const W = 360, H = 88, left = 34, rowH = 18;
  const x = (m: number) => left + ((Math.min(Math.max(m, from), to) - from) / (to - from)) * (W - left - 4);
  const hours = 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} class="grid">
      {rows.map((r, i) => <g key={r}><text x={2} y={12 + i * rowH + 8} class="grid-label">{r}</text><line x1={left} x2={W - 4} y1={12 + i * rowH + 9} y2={12 + i * rowH + 9} class="grid-line" /></g>)}
      {Array.from({ length: hours + 1 }, (_, i) => { const m = from + (i * (to - from)) / hours; return <line key={i} x1={x(m)} x2={x(m)} y1={10} y2={H - 6} class={i % 6 === 0 ? 'grid-tick major' : 'grid-tick'} />; })}
      {segments.filter((s) => s.end > from && s.start < to).map((s, i) => {
        const y = 12 + rows.indexOf(s.status) * rowH + 9;
        return <line key={i} class={`s-${s.status}`} x1={x(s.start)} x2={x(s.end)} y1={y} y2={y} stroke-width={6} stroke-dasharray={s.tentative ? '4 3' : undefined} />;
      })}
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
type Saved = Pick<State, 'segments' | 'tentative' | 'current' | 'historyAcknowledged'>;
type Undo = { label: string; before: Saved; after: Saved };
let undoNow: Undo | null = null;
const undoSubs = new Set<() => void>();
function setUndo(u: Undo | null) { undoNow = u; undoSubs.forEach((f) => f()); }
const pick = (s: State): Saved => ({ segments: s.segments, tentative: s.tentative, current: s.current, historyAcknowledged: s.historyAcknowledged });
/** The pending undo, or null once the record has changed since (compared by identity: every change makes new arrays). */
export function currentUndo(): Undo | null {
  if (!undoNow) return null;
  const s = getState(), a = undoNow.after;
  if (s.segments !== a.segments || s.tentative !== a.tentative || s.current !== a.current) undoNow = null;
  return undoNow;
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
export function saveEntry(seg: Segment, next: { status: DutyStatus; start: number; end: number }, now: number): string | null {
  if (next.end <= next.start) return 'End must be after start.';
  if (next.end > now) return `End is after now (${clock(now)}). Logged time can only run up to now.`;
  undoable(`Edited ${describe(seg)}`, () => setState((cur) => applySegmentEdit(cur, seg, next)));
  return null;
}
/** Delete an entry. Undo-able from the Log. */
export function deleteEntry(seg: Segment) {
  undoable(`Deleted ${describe(seg)}`, () => setState((cur) => ({ segments: cur.segments.filter((x) => x !== seg), tentative: cur.tentative.filter((x) => x !== seg) })));
}
/** Add a forgotten entry; returns a reason it was refused, or null. Undo-able from the Log. */
export function addEntry(status: DutyStatus, start: number, end: number, now: number): string | null {
  if (end <= start) return 'End must be after start.';
  if (end > now) return `End is after now (${clock(now)}). This log is for time that has happened — use Plan to look ahead, or tap your status on Now when it changes.`;
  const row: Segment = { status, start, end, createdAt: stamp() };
  undoable(`Added ${describe(row)}`, () => setState((cur) => ({ segments: [...cur.segments, row] })));
  return null;
}
/** Replace the whole record with a fresh 10-hour rest ending now. Undo-able from the Log. */
export function startOver(now: number) {
  undoable('Started over with a fresh 10-hour rest', () => setState({ segments: [{ status: 'OFF', start: now - 600, end: now }], tentative: [], current: { status: 'ON', since: now, createdAt: stamp() }, historyAcknowledged: true }));
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
  const dayName = new Date(day.start * 60000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

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
        <div class="daynav-title"><b>{back === 0 ? `Today, ${dayName}` : dayName}</b><span class="muted small">Carrier day from {String(s.config.dayStartHour).padStart(2, '0')}:00</span></div>
        <button class="icon-btn" aria-label="Next day" disabled={back === 0} onClick={() => setBack(back - 1)}><Icon d={I.next} /></button>
      </div>
      <section class="card">
        <Grid segments={allSegments(s, now)} from={day.start} to={day.end} />
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
              <button key={i} class="entry" aria-label={`Edit ${describe(seg)}`} onClick={() => openSheet({ kind: 'edit', seg })}>
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
      <button class="addbtn" onClick={() => openSheet({ kind: 'add' })}><Icon d={I.plus} /> Add something I forgot</button>
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

/** Minutes ↔ the datetime-local text, with ±5/±15 steppers: no typing needed for the usual fix. */
function TimeStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div class="tstep">
      <div class="tstep-label">{label}</div>
      <div class="tstep-row">
        {[-15, -5].map((d) => <button key={d} aria-label={`${label} ${-d} minutes earlier`} onClick={() => onChange(value + d)}>{`−${-d}`}</button>)}
        <output class="tstep-value" aria-live="polite">{clock(value)}</output>
        {[5, 15].map((d) => <button key={d} aria-label={`${label} ${d} minutes later`} onClick={() => onChange(value + d)}>{`+${d}`}</button>)}
      </div>
      <input type="datetime-local" class="tstep-pick" aria-label={`${label}: pick a date and time`} value={toInput(value)} onInput={(e) => { const v = fromInput((e.target as HTMLInputElement).value); if (v !== null) onChange(v); }} />
    </div>
  );
}

const STATUS_PICK: [DutyStatus, string][] = [['OFF', 'Off'], ['SB', 'Sleeper'], ['D', 'Driving'], ['ON', 'On duty']];

function EditSheet({ seg, now }: { seg: Segment; now: number }) {
  const [st, setSt] = useState<DutyStatus>(seg.status);
  const [a, setA] = useState(seg.start);
  const [b, setB] = useState(seg.end);
  const [err, setErr] = useState<string | null>(null);
  const save = () => { const e = saveEntry(seg, { status: st, start: a, end: b }, now); setErr(e); if (!e) openSheet(null); };
  const del = () => { deleteEntry(seg); openSheet(null); };
  return (
    <Sheet title={seg.tentative ? 'Edit this what-if' : 'Edit this entry'}>
      <div class="toggle big" role="group" aria-label="Status">{STATUS_PICK.map(([k, l], i) => <button key={k} data-first={i === 0 ? true : undefined} class={st === k ? 'on' : ''} style={st === k ? { background: STATUS_COLOR[k], color: 'var(--chip-ink)' } : undefined} aria-pressed={st === k} onClick={() => setSt(k)}>{l}</button>)}</div>
      <TimeStepper label="Started" value={a} onChange={setA} />
      <TimeStepper label="Ended" value={b} onChange={setB} />
      <div class="lenrow"><span class="muted">Length</span><b>{b > a ? dur(b - a) : '—'}</b></div>
      {err && <div class="warnbox small">{err}</div>}
      <button class="primary wide" onClick={save}>Save</button>
      <button class="danger wide" onClick={del}><Icon d={I.trash} size={18} /> Delete this entry</button>
      <p class="muted small">You can undo a save or a delete from the Log.</p>
    </Sheet>
  );
}

function AddSheet({ now }: { now: number }) {
  const [st, setSt] = useState<DutyStatus>('OFF');
  const [a, setA] = useState(now - 60);
  const [b, setB] = useState(now);
  const [err, setErr] = useState<string | null>(null);
  const add = () => { const e = addEntry(st, a, b, now); setErr(e); if (!e) openSheet(null); };
  const fresh = () => {
    if (confirm('Replace the log with a fresh start (10h off ending now)?')) {
      startOver(now);
      openSheet(null);
    }
  };
  return (
    <Sheet title="Add something I forgot">
      <div class="toggle big" role="group" aria-label="Status">{STATUS_PICK.map(([k, l], i) => <button key={k} data-first={i === 0 ? true : undefined} class={st === k ? 'on' : ''} style={st === k ? { background: STATUS_COLOR[k], color: 'var(--chip-ink)' } : undefined} aria-pressed={st === k} onClick={() => setSt(k)}>{l}</button>)}</div>
      <TimeStepper label="Started" value={a} onChange={setA} />
      <TimeStepper label="Ended" value={b} onChange={setB} />
      <div class="lenrow"><span class="muted">Length</span><b>{b > a ? dur(b - a) : '—'}</b></div>
      {err && <div class="warnbox small">{err}</div>}
      <button class="primary wide" onClick={add}>Add to my log</button>
      <button class="ghost" onClick={fresh}>Start over: fresh 10-hour rest ending now</button>
    </Sheet>
  );
}

/* ============================================================ Plan */

/** "Back to Plan" for the planning screens, which are reached from Plan rather than the tab bar. */
function BackToPlan() {
  return <button class="back" onClick={() => setState({ tab: 'plan' })}><Icon d={I.back} /> Plan</button>;
}

/** The planning tools, one big button each: a question a driver asks, not a tool name. */
function PlanTab() {
  const item = (tab: State['tab'], icon: string, title: string, sub: string) => (
    <button class="plan-item" onClick={() => setState({ tab })}>
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

function SplitTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  // The what-if lives in the store: a detour to the Log tab used to reset the plan being compared.
  const sd = s.split;
  const setSplit = (p: Partial<SplitDraft>) => setState({ split: { ...sd, ...p } });
  const { b1, b1s, dwell, drive, b2, b2s } = sd;

  const base = useMemo(() => allSegments(s, now).filter((x) => !x.tentative), [s, now]);
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
  const longOk = (b1s === 'SB' && b1 >= LIMITS.SPLIT_MIN_SB) || (b2s === 'SB' && b2 >= LIMITS.SPLIT_MIN_SB);
  const totalOk = b1 + b2 >= LIMITS.SPLIT_TOTAL;
  const planViol = after.violations.filter((v) => v.start >= t0);
  const strictViol = atDriveEnd.noSplit.violations.filter((v) => v.start >= t0);
  const sh = safeHaven(after, s.mph);

  const commit = () => setState({ tentative: plan });
  const clear = () => setState({ tentative: [] });

  return (
    <>
      <BackToPlan />
      <Card title="Current pair status" tone={ev.shift.pendingSplitLeg ? 'warn' : undefined}>
        {ev.shift.pendingSplitLeg && ev.shift.pendingSplitLeg.isReset
          ? <p><b>Your {dur(ev.shift.pendingSplitLeg.duration)} reset included 7+ hours in the sleeper.</b> Under FMCSA FAQ 22 (July 2026) a later break of 2h+ can pair with it and be <b>excluded from your 14</b> — it won't give back driving time, but it buys window. Clocks below assume the plain reset until you take that break.</p>
          : ev.shift.pendingSplitLeg
          ? <p><b>Period A logged:</b> {dur(ev.shift.pendingSplitLeg.duration)} ending {clock(ev.shift.pendingSplitLeg.end)} ({ev.shift.pendingSplitLeg.longestSB >= 420 ? '≥7h sleeper — needs a ≥2h partner' : `needs ≥7h sleeper, and ≥${dur(Math.max(120, 600 - ev.shift.pendingSplitLeg.duration))} to total 10h`}). Until the partner completes, this time <b>counts against your 14</b>.</p>
          : <p class="muted">No qualifying break (≥2h) pending since your anchor at {clock(ev.shift.anchor)}.</p>}
        {ev.shift.chain.length >= 2 && <p class="ok">Active split: clocks anchored at {clock(ev.shift.anchor)} (end of first paired rest). {ev.candidates >= 999_999 ? 'Over a million' : ev.candidates.toLocaleString('en-US')} interpretation{ev.candidates === 1 ? '' : 's'} considered.</p>}
      </Card>

      <Card title="What if… (starts at the end of your log)">
        <p class="muted small">Plan begins {clock(t0)}.</p>
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
          <li class={paired ? 'ok' : 'no'}>Engine confirms pairing</li>
        </ul>
        {(b1 >= 600 || b2 >= 600) && <p class="muted small">A break of 10h+ is a full reset on its own. If it includes 7+ consecutive hours in the sleeper it can <i>also</i> pair with a later 2h+ break — whichever helps you more (FMCSA FAQ 22, July 2026).</p>}
        {!paired && b1 >= 120 && b2 >= 120 && longOk && totalOk && base.length > 0 && (base[base.length - 1].status === 'OFF' || base[base.length - 1].status === 'SB') && (() => {
          const lastWork = [...base].reverse().find((x) => x.status !== 'OFF' && x.status !== 'SB');
          const merged = b1 + (t0 - (lastWork ? lastWork.end : base[0].start));
          return <p class="warnbox small">Break 1 runs straight into the rest you're already in, so they merge into one {dur(merged)} rest — a full <b>reset</b>. Under FMCSA FAQ 22 (July 2026) a reset can be a split leg <i>only</i> if it includes 7+ consecutive hours in the <b>sleeper</b>; this one doesn't, so Break 2 will need its own ≥2–3h partner later. The clocks below show that honestly. To model a true split, go on duty or drive first — or log the rest as sleeper.</p>;
        })()}
      </Card>

      <Card title={`After Break 2 ends (${clock(endB2)})`}>
        <div class="clocks">
          <Stat label="Drive left" value={dur(after.shift.driveRemaining)} tone={after.shift.driveRemaining < 60 ? 'bad' : ''} />
          <Stat label="14-hr left" value={dur(after.shift.windowRemaining)} tone={after.shift.windowRemaining < 60 ? 'bad' : ''} />
          <Stat label="Drive now" value={dur(after.driveNow)} sub={bindingLabel(after)} />
          <Stat label={`Range @${s.mph}`} value={`${sh.miles} mi`} sub={`stop by ${clock(after.mustStopBy)}`} />
        </div>
        <p class="muted small">Anchor: {clock(after.shift.anchor)}{paired ? ' — end of Break 1; the clock is measured from here. Nothing is erased from your log.' : ' — no split credit.'}</p>
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
      <label>Drive h<input type="number" class="hrs" min={0} max={13} step={0.25} value={drive} onInput={(e) => setDrive(Number((e.target as HTMLInputElement).value))} /></label>
      <label>On h<input type="number" class="hrs" min={0} max={14} step={0.25} value={on} onInput={(e) => setOn(Number((e.target as HTMLInputElement).value))} /></label>
      <label>Start (h after day start)<input type="number" class="hrs" min={0} max={23} step={1} value={startH} onInput={(e) => setStartH(Number((e.target as HTMLInputElement).value))} /></label>
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
      {chosen === 'split' && <p class="muted small">The split plan only works if you actually log the rests exactly as shown — the shorter one must be ≥2h off duty or sleeper, and the sleeper must be ≥7h *consecutive*. Anything less and the plan collapses to the 10-hour version.</p>}
      {chosen === 'restart34' && <p class="muted small">A 34-hour restart resets the 60/70-hour cycle (§395.3(c)) and, being far more than 10 consecutive hours off duty, <b>also satisfies the daily reset</b> (§395.3(a)(1)). This option takes it where the <b>cycle</b> is what limits your trip; compare its arrival time against waiting for recap hours, which can take days.</p>}
    </>
  );
}

function RecapTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const hist = cycleBasis(s, now, ev.cycle.windowDays);
  const firstLogged = s.segments.length ? Math.min(...s.segments.map((x) => x.start)) : null;
  const days = ev.cycle.days;
  // The patch is a pure store function so the clipping rule is unit-testable (stress-test 2.4).
  const applyDay = (dayStart: number, dayEnd: number) => (drive: number, on: number, startHour: number) => {
    setState((cur) => ({ segments: applyDayPatch(cur.segments, dayStart, dayEnd, drive, on, startHour, stamp()) }));
  };

  return (
    <>
      <Card title={`${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day recap`}>
        <table class="recap"><thead><tr><th>Day</th><th>On duty</th><th></th></tr></thead><tbody>
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const hasData = s.segments.some((x) => x.start < d.end && x.end > d.start);
            return <tr key={d.label} class={isToday ? 'today' : ''}><td>{isToday ? 'Today' : `D-${days.length - 1 - i}`}<br /><small class="muted">{d.label}</small></td><td><b>{hrs(d.onDuty)}</b> h</td>
              <td>{!isToday && firstLogged !== null && d.end <= firstLogged && <><small class="muted" title="Nothing in your record covers this day, so it counts as zero on-duty hours.">not logged — counted as 0h</small><br /></>}
                {/* The badge says the day counts as zero; the editor is how you fix that (stress-test round 2, §2.3). */}
                {!isToday && <DayEditor day={d} hasData={hasData} onApply={applyDay(d.start, d.end)} />}</td></tr>;
          })}
        </tbody></table>
        <div class="clocks">
          <Stat label="Used" value={`${hrs(ev.cycle.used)} h`} />
          <Stat label="Available" value={`${hrs(ev.cycle.remaining)} h`} tone={ev.cycle.remaining < 120 ? 'bad' : ''} />
          {ev.cycle.restartEnd !== null && <Stat label="Last 34h restart" value={clock(ev.cycle.restartEnd)} />}
        </div>
        {hist !== 'known' && <p class="warnbox small">This recap rests on an incomplete basis: your record does not cover the whole {ev.cycle.windowDays}-day period, so the days before it count as zero. Use <b>set</b> on those days, or confirm that your record really starts here.</p>}
        <p class="muted small">"set" a past day with drive + on-duty hours and a start time; it's written as real segments (with a 30-min break after 8h driving) so the whole engine sees it. Days roll at {String(s.config.dayStartHour).padStart(2, '0')}:00 {s.config.timeZone}.{deviceTz !== s.config.timeZone && <> On your device clock ({deviceTz}) that is <b>{terminalMidnightOnDevice(s.config.timeZone, deviceTz, now)}</b> — the times in this table use your device zone.</>}</p>
      </Card>
      <Card title="Hours coming back">
        <ul class="forecast">{ev.cycle.forecast.map((f) => <li key={f.label}><span>{clock(f.dayStart)}</span><span>+{hrs(f.dropsOff)} h drops</span><b>{hrs(f.availableAtStart)} h available</b></li>)}</ul>
      </Card>
      <button class="plan-item" onClick={() => setState({ tab: 'load' })}>
        <span class="plan-icon"><Icon d={I.truck} size={26} /></span>
        <span class="plan-text"><b>Can I take this load?</b><span class="muted small">Answer three questions, get a yes or no.</span></span>
        <Icon d={I.next} />
      </button>
    </>
  );
}

/* ============================================================ Can I take this load? */

/**
 * Redesign 4/5: the load check as three questions, one per screen, then a plain answer. It lived as a
 * card at the bottom of Recap, with two sliders; at the dock, with a dispatcher waiting, the driver
 * wants the question asked and the answer given. Every answer is kept (the store), so leaving and
 * coming back changes nothing.
 */
function LoadTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const lc = s.loadCheck;
  const setLoad = (p: Partial<LoadCheckDraft>) => setState({ loadCheck: { ...lc, ...p } });
  const [step, setStep] = useState(lc.answered ? 4 : 1);
  // each question is its own screen: start it at the top, not wherever the last Next button was
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  const hist = cycleBasis(s, now, ev.cycle.windowDays);
  const departure = now + lc.leaveIn;
  const both = useMemo(() => planTripAll(allSegments(s, now).filter((x) => !x.tentative), {
    departure, distanceMiles: lc.miles, mph: s.mph,
    stops: lc.dwell ? [{ atMile: lc.miles, minutes: lc.dwell, status: lc.dwellOff ? 'OFF' : 'ON', label: 'Receiver' }] : [],
    config: s.config,
    // Waiting to leave is not rest unless he says so: shown as an assumed row, never an unlogged gap.
    ...(lc.leaveIn > 0 ? { untilDeparture: { from: now, status: lc.waitOff ? 'OFF' as DutyStatus : 'ON' as DutyStatus, label: `${lc.waitOff ? 'Off duty' : 'On duty'} until departure` } } : {}),
  }), [s, now, lc.miles, lc.dwell, lc.dwellOff, lc.leaveIn, lc.waitOff]);
  const best = both[earliestStrategy(both)];
  // The verdict treats unlogged gaps as off duty. When a hole is big enough to change the answer,
  // say so rather than printing a confident LEGAL on an assumption nobody made (stress-test 2.5).
  const openGaps = meaningfulGaps(ev.gaps);
  const provisional = openGaps.length > 0;
  const leaveWord = lc.leaveIn ? `in ${dur(lc.leaveIn)}` : 'now';
  const head = (n: number) => (
    <>
      <div class="flow-head">
        <button class="icon-btn" aria-label={n === 1 ? 'Back to Plan' : 'Previous question'} onClick={() => (n === 1 ? setState({ tab: 'plan' }) : setStep(n - 1))}><Icon d={I.back} /></button>
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
        <button class="icon-btn" aria-label="Back to Plan" onClick={() => setState({ tab: 'plan' })}><Icon d={I.back} /></button>
        <b>Can I take this load?</b><span />
      </div>
      <section class={`verdict ${best.feasible ? 'yes' : 'no'}`}>
        <div class="verdict-label">{provisional ? 'Verdict (provisional)' : 'Verdict'}</div>
        <div class="verdict-big">{best.feasible ? 'Yes, it’s legal' : 'No — not legal as planned'}</div>
        <div class="verdict-sub">{best.arrival > best.driveEnd ? `Unloaded by ${clock(best.arrival)}` : `There by ${clock(best.driveEnd)}`}</div>
      </section>
      {provisional && <p class="warnbox small"><b>Provisional.</b> {openGaps.map((g) => `${clock(g.start)} → ${clock(g.end)}`).join(', ')} {openGaps.length === 1 ? 'is' : 'are'} unlogged and counted as off duty. Fill {openGaps.length === 1 ? 'it' : 'them'} in and this verdict can change.</p>}
      {hist !== 'known' && <p class="warnbox small">This verdict rests on an incomplete basis: nothing behind your current status is logged, so it assumes you started from zero. It is not a statement about your real day — add your duty on the <b>Log</b> tab, or confirm that the record starts here.</p>}
      <div class="clocks">
        <Stat label="Arrive — wheels stop" value={clock(best.driveEnd)} />
        {best.arrival > best.driveEnd && <Stat label="Unloaded by" value={clock(best.arrival)} />}
        <Stat label={`Cycle left after ${best.arrival > best.driveEnd ? 'unloading' : 'arrival'}`} value={`${hrs(best.cycleRemainingAtArrival)} h`} />
      </div>
      <ul class="answers">
        <li><span>Load distance</span><b>{lc.miles} mi</b><button class="link" onClick={() => setStep(1)}>Change</button></li>
        <li><span>Leaving</span><b>{leaveWord}{lc.leaveIn ? (lc.waitOff ? ', off duty till then' : ', on duty till then') : ''}</b><button class="link" onClick={() => setStep(2)}>Change</button></li>
        <li><span>At the receiver</span><b>{lc.dwell ? `${dur(lc.dwell)} ${lc.dwellOff ? 'off duty' : 'on duty'}` : 'none'}</b><button class="link" onClick={() => setStep(3)}>Change</button></li>
      </ul>
      <Card title="How it goes"><PlanCompare both={both} from={now} /></Card>
      <p class="muted small">Assumes {s.mph} mph average, fuel and traffic included — change it under More.</p>
      <button class="primary wide" onClick={() => setState({ tab: 'now' })}>Done</button>
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
      <BackToPlan />
      <Card title="Clock-to-parking (right now)" tone={ev.driveNow < 60 ? 'bad' : ev.driveNow < 120 ? 'warn' : 'good'}>
        <div class="clocks">
          <Stat label="Range" value={`${sh.miles} mi`} sub={`${dur(ev.driveNow)} @ ${s.mph} mph`} />
          <Stat label="Hard stop" value={clock(ev.mustStopBy)} sub={bindingLabel(ev)} />
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
            <p class="muted small">That's <b>{dur(departure - now)}</b> from now. Unlogged time is not a rest — say what you'll be doing, and the itinerary will show it as an assumed row rather than quietly counting it as off duty:</p>
            <Toggle options={untilOptions} value={untilPick} onChange={(v) => setTrip({ until: v })} />
            <p class="muted small">Planning the wait as <b>{STATUS_LABEL[untilStatus]}</b>.{untilStatus === 'OFF' || untilStatus === 'SB' ? ' Only claim this if you really will be off duty — it can become a split leg.' : ' It earns no rest credit, so no split leg can be built out of it.'}</p>
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
  useEffect(() => { setNotif(notifyState()); setAwakeOk(canKeepAwake()); }, []);
  const test = () => { unlockAudio(); chime(true); buzz(true); };
  return (
    <Card title="Driving alerts">
      <label class="check"><input type="checkbox" checked={s.alertsOn} onChange={(e) => setState({ alertsOn: (e.target as HTMLInputElement).checked })} /> Sound and vibration at 60, 30 and 15 minutes of driving left, and every 15 minutes once you are out of time</label>
      <label class="check"><input type="checkbox" checked={s.keepAwake} onChange={(e) => setState({ keepAwake: (e.target as HTMLInputElement).checked })} /> Keep the screen on while your status is Driving</label>
      <label class="check"><input type="checkbox" checked={s.drivingView} onChange={(e) => setState({ drivingView: (e.target as HTMLInputElement).checked })} /> Big driving screen while your status is Driving</label>
      {!awakeOk && <p class="small">This browser cannot keep the screen on. Set your phone's auto-lock to "Never" while you drive, or the alerts will stop when it locks.</p>}
      <div class="row">
        <button onClick={test}>Test alert</button>
        {notif === 'default' && <button onClick={() => { void askNotify().then(setNotif); }}>Also notify when in background</button>}
      </div>
      <p class="muted small">
        {notif === 'granted' ? 'Notifications are on: if the app is open behind another app, alerts also show as notifications. ' : ''}
        {notif === 'denied' ? 'Notifications are blocked for this site in your browser settings. ' : ''}
        Alerts only work while HOS Sandbox is open — when the phone locks or the app is closed, the phone stops it. Keeping the screen on is what keeps it running in a mounted phone; it uses more battery, so keep the phone charging. iPhones do not let web apps vibrate, and the silent switch can mute the sound: use "Test alert" to check. Nothing needs a tap while you drive. <b>Your ELD is your official warning.</b>
      </p>
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
      setState((cur) => applyImportedState(cur, d));
      setIoNote(`Imported ${(d.segments ?? []).length} segment(s) and ${(d.tentative ?? []).length} what-if row(s) from ${f.name}. Settings and the trip scenario came back with them; a simulated clock does not.${badZone ? ` The file's time zone "${badZone}" is not valid, so your home terminal zone stayed ${getState().config.timeZone}.` : ''}`);
    }).catch((err) => setIoNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`));
  };
  return (
    <>
      <Card title="Rules">
        <label>Cycle<Toggle options={[['70/8', '70 hr / 8 days'], ['60/7', '60 hr / 7 days']]} value={c.cycle} onChange={(v) => setC({ cycle: v })} /></label>
        <label>Carrier day starts at<select value={c.dayStartHour} onChange={(e) => setC({ dayStartHour: Number((e.target as HTMLSelectElement).value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <TimeZoneField value={c.timeZone} onChange={(v) => setC({ timeZone: v })} />
        <label class="check"><input type="checkbox" checked={c.shortHaul} onChange={(e) => setC({ shortHaul: (e.target as HTMLInputElement).checked })} /> Short-haul (§395.1(e)) — no 30-min break rule</label>
        <p class="muted small">Adverse-conditions and 16-hour-day exceptions are per shift — set them on the Now screen, under "Exceptions this shift".</p>
      </Card>
      <Card title="Planning">
        <Slider label="Net average speed" value={s.mph} min={40} max={70} step={1} onChange={(v) => setState({ mph: v })} fmt={(v) => `${v} mph`} unit="mph" />
        <label>Screen<Toggle options={[['day', 'Day'], ['night', 'Night']]} value={s.theme} onChange={(v) => chooseTheme(v as Theme)} /></label>
        <p class="muted small">Day is the default — it is the readable one outdoors, which is where most planning happens. Night flips to the dark palette for low light. Both palettes are contrast-checked against WCAG AA, and there is a one-tap switch in the header.</p>
        <label>Simulated "now" (testing)<input type="datetime-local" value={s.nowOverride ? toInput(s.nowOverride) : ''} onChange={(e) => setState({ nowOverride: fromInput((e.target as HTMLInputElement).value) })} /></label>
        <button onClick={() => setState({ nowOverride: null })} disabled={!s.nowOverride}>Use real clock</button>
      </Card>
      <DrivingAlertsCard s={s} />
      <Card title="Bug reports">
        <BugButton s={s} ev={ev} />
        <p class="muted small">Opens a GitHub issue form with your clocks, build number and log pre-filled (a free GitHub account is needed to submit). Your log is also copied to the clipboard. Beta rules: <a href={`https://github.com/${REPO}#free-beta`} target="_blank" rel="noopener">github.com/{REPO}</a></p>
        <label>Prefer email instead? Send reports to<input type="email" placeholder="leave blank to use GitHub" value={s.bugEmail} onChange={(e) => setState({ bugEmail: (e.target as HTMLInputElement).value.trim() })} /></label>
      </Card>
      <Card title="Data">
        <div class="row"><button onClick={exportJson}>Export JSON</button><label class="filebtn">Import JSON<input type="file" accept="application/json" onChange={importJson} /></label></div>
        {ioNote && <p class="muted small">{ioNote}</p>}
        <button class="danger" onClick={() => { if (confirm('Erase everything?')) setState({ segments: [], tentative: [], current: null, nowOverride: null, historyAcknowledged: false, config: { ...c, adverseShifts: [], sixteenHourShifts: [] } }); }}>Erase all data</button>
        <p class="muted small">Everything stays on this phone. Nothing is uploaded.</p>
      </Card>
      <Card title="About">
        <p class="small">HOS Sandbox is a planning scratchpad. It is not an ELD, is not FMCSA-registered, and does not replace your record of duty status. Your official log and your carrier's ELD govern. Rules: 49 CFR 395.1(b)(1), (g), (o), 395.3; FMCSA HOS FAQ (Nov 2020). Property-carrying, US interstate drivers only — no passenger, Canada, Alaska or oilfield rules.</p>
        <p class="muted small">Build {__BUILD__} · now {clock(now)}</p>
      </Card>
    </>
  );
}

/* ============================================================ App */

/**
 * Startup disclaimer. Standing rule: this is never an ELD, never FMCSA-registered and never a legal
 * record of duty status — and a driver who believes otherwise will treat a scratchpad as evidence.
 * Shown on every launch: the driver who needs to read it is not the one who read it last week.
 */
function Disclaimer({ onClose, tz, needsTz }: { onClose: (tz?: string) => void; tz: string; needsTz: boolean }) {
  // Move focus into the dialog: keyboard and screen-reader users start on its only control.
  const btn = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState(tz);
  useEffect(() => { btn.current?.focus(); }, []);
  return (
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="disclaimer-title">
      <div class="modal">
        <h2 id="disclaimer-title">Before you use this</h2>
        <p><b>HOS Sandbox is a planning scratchpad.</b> It is not an ELD, it is not FMCSA-registered, and it is not a legal record of duty status. It sends nothing anywhere — your log stays on this device.</p>
        <p>Your official record is your ELD. When an ELD fails, 49 CFR 395.34 still requires your own paper records. Always follow your carrier's rules and 49 CFR part 395.</p>
        <p class="muted small">The point of this tool is to show you what you will have <b>after</b> the nap and the bunk time — not to prove what you had.</p>
        {needsTz && (
          <>
            <h3>Where is your home terminal?</h3>
            {/* Name the zone actually saved. Naming the phone's zone and pre-filling it replaced an existing
                driver's terminal zone with the phone's on one tap of "I understand" (re-check N1). */}
            <p class="small">Every clock here is worked out in your <b>terminal's</b> time zone. It is set to <b>{tz}</b>{tz === deviceTz ? <>, your phone's zone right now</> : <>. Your phone's zone right now is <b>{deviceTz}</b></>}. If your terminal is somewhere else, change it here — the zone moves every day boundary and the whole recap.</p>
            <TimeZoneField value={choice} onChange={setChoice} />
          </>
        )}
        <button ref={btn} onClick={() => onClose(needsTz ? choice : undefined)}>I understand</button>
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
export function setLaunchNotice(open: boolean) { launchNotice = open; }

export function App() {
  const s = useStore();
  const now = useNow();
  // Startup disclaimer — dismissed for this launch only; a fresh launch shows it again.
  const [, redraw] = useState(0);
  const disclaimer = launchNotice;
  const setDisclaimer = (open: boolean) => { setLaunchNotice(open); redraw((x) => x + 1); };
  useEffect(() => { applyTheme(s.theme); }, [s.theme]);
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
  const again = useDriveAgain(s, now, ev);
  const sheet = useSheet();
  if (!ev) {
    return (
      <div class="app"><main>
        <div class="card warn">
          <h3>HOS Sandbox could not calculate your clocks</h3>
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
  const tabs: [State['tab'], string, string][] = [['now', 'Now', I.now], ['log', 'Log', I.log], ['plan', 'Plan', I.plan], ['recap', 'Recap', I.recap], ['settings', 'More', I.more]];
  // The planning screens sit under Plan: the tab bar shows where you are, not a sixth tab.
  const navOf = (t: State['tab']): State['tab'] => (t === 'split' || t === 'trip' || t === 'load' ? 'plan' : t);
  // Behind the launch notice or an open panel, nothing else can take focus or be read as current.
  const blocked = disclaimer || sheet !== null;
  if (showsDrivingView(s)) {
    return (
      <div class="app">
        {disclaimer && <Disclaimer tz={s.config.timeZone} needsTz={!s.tzChosen} onClose={(tz) => { unlockAudio(); if (tz) chooseTimeZone(tz); setDisclaimer(false); }} />}
        <div inert={blocked}>
          <DrivingView s={s} now={now} ev={ev} again={again} onDetails={() => { setDrivingPeek(s.current?.since ?? null); redraw((x) => x + 1); }} />
        </div>
        {!disclaimer && sheet?.kind === 'status' && <StatusSheet s={s} now={now} />}
      </div>
    );
  }
  return (
    <div class="app">
      {disclaimer && <Disclaimer tz={s.config.timeZone} needsTz={!s.tzChosen} onClose={(tz) => { unlockAudio(); if (tz) chooseTimeZone(tz); setDisclaimer(false); }} />}
      <TopBar ev={ev} now={now} s={s} inert={blocked} again={again} onNow={s.tab === 'now'} />
      <main inert={blocked}>
        {s.themeNotice && (
          <div class="card warn">
            <div class="row">
              <span class="small">Switched to the <b>Day</b> theme — it is the new default. The header switch or Settings will put it back to Night.</span>
              <button class="mini" onClick={() => setState({ themeNotice: false })}>Got it</button>
            </div>
          </div>
        )}
        <Notices ev={ev} now={now} s={s} />
        <TabBoundary key={s.tab} tab={s.tab}>
          {s.tab === 'now' && <NowTab s={s} now={now} ev={ev} again={again} onExitPeek={() => { setDrivingPeek(null); redraw((x) => x + 1); }} />}
          {s.tab === 'log' && <LogTab s={s} now={now} ev={ev} />}
          {s.tab === 'plan' && <PlanTab />}
          {s.tab === 'split' && <SplitTab s={s} now={now} ev={ev} />}
          {s.tab === 'recap' && <RecapTab s={s} now={now} ev={ev} />}
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
      {!disclaimer && sheet?.kind === 'why' && <WhySheet now={now} ev={ev} />}
      {!disclaimer && sheet?.kind === 'exceptions' && <ExceptionsSheet ev={ev} />}
      {!disclaimer && sheet?.kind === 'edit' && <EditSheet key={`${sheet.seg.start}-${sheet.seg.end}`} seg={sheet.seg} now={now} />}
      {!disclaimer && sheet?.kind === 'add' && <AddSheet now={now} />}
    </div>
  );
}
