import { useEffect, useMemo, useState } from 'preact/hooks';
import { Component, type ComponentChildren } from 'preact';

/** A crashing tab shows an error card (with a one-tap bug report) instead of blanking the whole app. */
class TabBoundary extends Component<{ tab: string; children: ComponentChildren }, { err: string | null }> {
  state = { err: null as string | null };
  componentDidCatch(e: unknown) { this.setState({ err: e instanceof Error ? `${e.message}\n${(e.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(e) }); }
  render() {
    if (!this.state.err) return this.props.children;
    const issue = `https://github.com/hossandbox/hossandbox.github.io/issues/new?template=bug-report.yml&title=${encodeURIComponent(`[bug] ${this.props.tab} tab crashed`)}&expected=${encodeURIComponent('Tab should render')}&actual=${encodeURIComponent(this.state.err)}&build=${encodeURIComponent(__BUILD__)}`;
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
  evaluate, planTripAll, TRIP_STRATEGIES, safeHaven, normalize, LIMITS, type TripStrategy, type Segment, type DutyStatus, type FullEvaluation, type Violation, type TripPlan,
} from '../../engine/src/index.ts';
import {
  useStore, setState, useNow, allSegments, toInput, fromInput, clock, clockFull, dur, hrs, STATUS_LABEL, STATUS_COLOR, segLabel, exportState, isFreshLog, applySegmentEdit, isValidTimeZone, terminalMidnightOnDevice, TIME_ZONES, deviceTz, applyImportedState, applyTheme, DEFAULT_TRIP, type State, type TripDraft, type Theme,
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
  const typed = (raw: string) => {
    setText(raw);
    if (raw === '') { setNote(null); return; }
    const n = Number(raw);
    if (!Number.isFinite(n)) { setNote('Enter a number.'); return; }
    if (n < min || n > max) { setNote(`Supported range is ${min}–${max}${unit ? ` ${unit}` : ''}. Your entry was not applied.`); return; }
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
          onInput={(e) => typed((e.target as HTMLInputElement).value)}
          onBlur={() => setText(String(value))}
        />
        <button class="mini" title={`Increase by ${step}${unit ? ` ${unit}` : ''}`} aria-label={`Increase ${label} by ${step}${unit ? ` ${unit}` : ''}`} onClick={() => set(value + step)}>+{step}</button>
      </div>
      {note && <div class="warnbox small">{note}</div>}
    </div>
  );
}
function Toggle<T extends string | boolean>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <div class="toggle">{options.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
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
  return <ul class="viol">{list.map((v, i) => <li key={i} class={v.severity}><b>{violationLabel[v.kind]}</b> · {dur(v.minutes)} · {clock(v.start)} → {clock(v.end)}<br /><small>{v.detail}</small></li>)}</ul>;
}
const bindingLabel: Record<FullEvaluation['binding'], string> = {
  DRIVE_11: 'driving limit', WINDOW_14: 'duty window', CYCLE: 'cycle (60/70)', BREAK_30: '30-min break due', NONE: '—',
};
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
  const clocks = `drive now ${dur(ev.driveNow)} (${ev.binding}) · ${ev.shift.limits.drive / 60}-hr left ${dur(ev.shift.driveRemaining)} · ${ev.shift.limits.window / 60}-hr left ${dur(ev.shift.windowRemaining)} · cycle left ${dur(ev.cycle.remaining)}`;
  navigator.clipboard?.writeText(json).catch(() => {});
  if (s.bugEmail) {
    const body = ['What I did:', '', 'What the app showed:', '', 'What I expected (ELD / reg):', '', `Build: ${__BUILD__}`, `Clocks: ${clocks}`, '', json.length < 1500 ? json : '(log copied to clipboard — paste here)'].join('\n');
    location.href = `mailto:${s.bugEmail}?subject=${encodeURIComponent('HOS Sandbox bug')}&body=${encodeURIComponent(body)}`;
    return;
  }
  const q = new URLSearchParams({ template: 'bug-report.yml', title: '[bug] ', build: __BUILD__, clocks, log: json.length < 6000 ? json : '(log too long — it is on your clipboard; paste it here)' });
  window.open(`https://github.com/${REPO}/issues/new?${q}`, '_blank', 'noopener');
}
function BugButton({ s, ev }: { s: State; ev: FullEvaluation }) {
  return <button class="ghost" onClick={() => reportBug(s, ev)}>🐞 Report a bug{s.bugEmail ? ' (email)' : ' (GitHub)'}</button>;
}

/* ============================================================ status bar */

function StatusBar({ ev, now, s }: { ev: FullEvaluation; now: number; s: State }) {
  const status = s.current?.status ?? 'OFF';
  const tone = ev.driveNow <= 0 ? 'bad' : ev.driveNow < 60 ? 'warn' : 'good';
  return (
    <header class="top">
      <div class="top-row">
        <span class="pill" style={{ background: STATUS_COLOR[status] }}>{segLabel(status, s.current?.note)}{s.current ? ` · ${dur(now - s.current.since)}` : ''}</span>
        <span class="top-right">
          <span class="muted">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
          <button class="mini theme-btn" aria-label={`Switch to ${s.theme === 'day' ? 'night' : 'day'} theme`} title={`Switch to ${s.theme === 'day' ? 'night' : 'day'} theme`} onClick={() => setState({ theme: s.theme === 'day' ? 'night' : 'day' })}>{s.theme === 'day' ? '☾' : '☀'}</button>
        </span>
      </div>
      <div class="clocks">
        <Stat label="Drive now" value={dur(ev.driveNow)} sub={`limited by ${bindingLabel[ev.binding]}`} tone={tone} />
        <Stat label={`${ev.shift.limits.drive / 60}-hr left`} value={dur(ev.shift.driveRemaining)} />
        <Stat label={`${ev.shift.limits.window / 60}-hr left`} value={dur(ev.shift.windowRemaining)} />
        <Stat label={`${ev.cycle.limit / 60}-hr left`} value={dur(ev.cycle.remaining)} />
      </div>
      {ev.driveNow > 0 && <div class="muted small">Must stop driving by <b>{clock(ev.mustStopBy)}</b>{ev.shift.pendingSplitLeg ? ' · split leg pending' : ''}{ev.shift.notes.length ? ' · exception active' : ''}</div>}
      {isFreshLog(s) && (
        <div class="warnbox small">
          <b>Assumed fresh clock.</b> Nothing is logged, so these numbers assume a full {ev.shift.limits.drive / 60}-hour driving / {ev.shift.limits.window / 60}-hour window and an empty {ev.cycle.limit / 60}-hour cycle — not your actual day.
          Tap your current status or add today's duty on the <b>Log</b> tab before you trust them.
        </div>
      )}
      {s.config.timeZone !== deviceTz && (
        <div class="muted small">
          <b>Two time zones in play.</b> Every clock time on this screen is in <b>your device zone ({deviceTz})</b>, but your carrier day — and the recap hours that come back with it — rolls at {String(s.config.dayStartHour).padStart(2, '0')}:00 <b>{s.config.timeZone}</b>. A midnight recap is not midnight on the clock above.
        </div>
      )}
    </header>
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

function LogTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const [status, setStatus] = useState<DutyStatus>('OFF');
  const [start, setStart] = useState(toInput(now - 60));
  const [end, setEnd] = useState(toInput(now));
  const segs = allSegments(s, now);

  /**
   * Overlapping raw entries. The engine resolves them (a later entry wins over the range it
   * covers, and the earlier one is split), so the clocks above can disagree with the rows below.
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
   */
  const resolved = normalize(allSegments(s, now));
  const totals: Record<DutyStatus, number> = { OFF: 0, SB: 0, D: 0, ON: 0 };
  for (const x of resolved) totals[x.status] += x.end - x.start;

  const [editing, setEditing] = useState<{ orig: Segment; status: DutyStatus; start: string; end: string } | null>(null);
  const [undo, setUndo] = useState<{ label: string; segments: Segment[]; tentative: Segment[] } | null>(null);
  // Validation is shown inline, not through alert(): the driver sees why, and a test can assert it.
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const switchTo = (st: DutyStatus, note?: string) => setState((cur) => {
    const segments = [...cur.segments];
    if (cur.current && now > cur.current.since) segments.push({ status: cur.current.status, start: cur.current.since, end: now, note: cur.current.note });
    return { segments, current: { status: st, since: now, note } };
  });
  const toggleException = (key: 'adverseShifts' | 'sixteenHourShifts') => setState((cur) => {
    const list = new Set(cur.config[key] ?? []);
    const k = ev.shift.shiftStart;
    list.has(k) ? list.delete(k) : list.add(k);
    return { config: { ...cur.config, [key]: [...list] } };
  });
  const adverseOn = (s.config.adverseShifts ?? []).includes(ev.shift.shiftStart);
  const sixteenOn = (s.config.sixteenHourShifts ?? []).includes(ev.shift.shiftStart);
  const add = () => {
    const a = fromInput(start), b = fromInput(end);
    if (a === null || b === null) { setFormError('Enter a valid start and end.'); return; }
    if (b <= a) { setFormError('End must be after start.'); return; }
    setFormError(null);
    setState((cur) => ({ segments: [...cur.segments, { status, start: a, end: b }] }));
  };
  const desc = (seg: Segment) => `${segLabel(seg.status, seg.note)} ${clock(seg.start)} → ${clock(seg.end)}`;
  /** One level of undo: the state before the last edit or delete. Replaced by the next action. */
  const snapshot = (label: string) => setUndo({ label, segments: s.segments, tentative: s.tentative });
  const del = (seg: Segment) => {
    snapshot(`Deleted ${desc(seg)}`);
    setState((cur) => ({ segments: cur.segments.filter((x) => x !== seg), tentative: cur.tentative.filter((x) => x !== seg) }));
  };
  const beginEdit = (seg: Segment) => { setEditError(null); setEditing({ orig: seg, status: seg.status, start: toInput(seg.start), end: toInput(seg.end) }); };
  const saveEdit = () => {
    if (!editing) return;
    const a = fromInput(editing.start), b = fromInput(editing.end);
    if (a === null || b === null) { setEditError('Enter a valid start and end.'); return; }
    if (b <= a) { setEditError('End must be after start.'); return; }
    setEditError(null);
    snapshot(`Edited ${desc(editing.orig)}`);
    const next = { status: editing.status, start: a, end: b };
    setState((cur) => applySegmentEdit(cur, editing.orig, next));
    setEditing(null);
  };
  const fresh = () => { if (confirm('Replace the log with a fresh start (10h off ending now)?')) setState({ segments: [{ status: 'OFF', start: now - 600, end: now }], tentative: [], current: { status: 'ON', since: now } }); };

  return (
    <>
      <Card title="Last 24 hours"><Grid segments={segs} from={now - 1440} to={now} /></Card>
      <Card title="I am now…">
        <div class="status-buttons">{(['OFF', 'SB', 'D', 'ON'] as DutyStatus[]).map((st) => <button key={st} style={{ background: STATUS_COLOR[st] }} class={s.current?.status === st && !s.current?.note ? 'on' : ''} onClick={() => switchTo(st)}>{STATUS_LABEL[st]}</button>)}</div>
        <div class="row">
          <button class={s.current?.note === 'PC' ? 'on-outline' : ''} onClick={() => switchTo('OFF', 'PC')}>Personal conveyance</button>
          <button class={s.current?.note === 'YM' ? 'on-outline' : ''} onClick={() => switchTo('ON', 'YM')}>Yard move</button>
        </div>
        <p class="muted small">Tapping a status closes the current one at {clock(now, false)} and starts the new one. PC counts as off duty and yard moves as on duty for the clocks. This is your scratchpad, not your ELD.</p>
      </Card>
      <Card title="Exceptions this shift" tone={ev.shift.notes.some((n) => n.startsWith('⚠')) ? 'bad' : ev.shift.notes.length ? 'warn' : undefined}>
        <label class="check"><input type="checkbox" checked={adverseOn} onChange={() => toggleException('adverseShifts')} /> Adverse driving conditions — +2h driving and window (§395.1(b)(1))</label>
        <label class="check"><input type="checkbox" checked={sixteenOn} onChange={() => toggleException('sixteenHourShifts')} /> 16-hour short-haul day — window to 16h, driving stays 11 (§395.1(o))</label>
        {ev.shift.notes.map((n, i) => <p key={i} class={`small ${n.startsWith('⚠') ? 'warnbox' : 'muted'}`}>{n}</p>)}
        <p class="muted small">Adverse conditions must have been unknown when you were dispatched — snow that was forecast doesn't count. The 16-hour day requires returning to and being released at your normal work reporting location.</p>
      </Card>
      <Card title="Add a past segment">
        <Toggle options={[['OFF', 'Off'], ['SB', 'SB'], ['D', 'Drive'], ['ON', 'On']]} value={status} onChange={setStatus} />
        <div class="row"><label>Start<input type="datetime-local" value={start} onInput={(e) => setStart((e.target as HTMLInputElement).value)} /></label><label>End<input type="datetime-local" value={end} onInput={(e) => setEnd((e.target as HTMLInputElement).value)} /></label></div>
        {formError && <div class="warnbox small">{formError}</div>}
        <div class="row"><button class="primary" onClick={add}>Add segment</button><button onClick={fresh}>Fresh start</button></div>
      </Card>
      <Card title="Violations in record"><ViolationList items={ev.violations} /></Card>
      <Card title={showResolved ? `Resolved timeline (${resolved.length})` : `Segments (${s.segments.length + s.tentative.length})`}>
        {overlaps.length > 0 && (
          <div class="warnbox">
            <b>These entries overlap.</b> The later entry wins over the time it covers and the earlier one is split — so the clocks above count the resolved timeline, which can be less than the rows below appear to add up to.
            <ul class="seglist">{overlaps.map((seg, i) => (
              <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
            ))}</ul>
          </div>
        )}
        <div class="row">
          <button class={showResolved ? 'on-outline' : ''} onClick={() => setShowResolved(!showResolved)}>{showResolved ? '← Edit entries as entered' : 'Show resolved timeline'}</button>
        </div>
        {showResolved ? (
          <>
            <p class="muted small">Oldest first — this is the timeline the clocks use: overlaps already resolved, and your current status included. Read-only; switch back to edit what you typed.</p>
            <ul class="seglist">{resolved.map((seg, i) => (
              <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span></li>
            ))}</ul>
            <p class="small">Driving <b>{dur(totals.D)}</b> · On duty <b>{dur(totals.ON)}</b> · Off duty <b>{dur(totals.OFF)}</b> · Sleeper <b>{dur(totals.SB)}</b></p>
            <p class="muted small">Set your current status with the buttons above to keep this timeline moving.</p>
          </>
        ) : (
          <ul class="seglist">{[...s.segments, ...s.tentative].sort((a, b) => b.start - a.start).map((seg, i) => (
            editing && editing.orig === seg ? (
              <li key={i} class="editing">
                <div class="segedit">
                  <Toggle options={[['OFF', 'Off'], ['SB', 'SB'], ['D', 'Drive'], ['ON', 'On']]} value={editing.status} onChange={(v) => setEditing({ ...editing, status: v as DutyStatus })} />
                  <div class="row">
                    <label>Start<input type="datetime-local" value={editing.start} onInput={(e) => setEditing({ ...editing, start: (e.target as HTMLInputElement).value })} /></label>
                    <label>End<input type="datetime-local" value={editing.end} onInput={(e) => setEditing({ ...editing, end: (e.target as HTMLInputElement).value })} /></label>
                  </div>
                  {editError && <div class="warnbox small">{editError}</div>}
                  <div class="row"><button class="mini primary" onClick={saveEdit}>Save</button><button class="mini" onClick={() => setEditing(null)}>Cancel</button></div>
                </div>
              </li>
            ) : (
              <li key={i}>
                <span class="dot" style={{ background: STATUS_COLOR[seg.status] }} />
                <span>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</span>
                <span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span>
                <button class="mini" aria-label={`Edit ${desc(seg)}`} onClick={() => beginEdit(seg)}>Edit</button>
                <button class="x" aria-label={`Delete ${desc(seg)}`} onClick={() => del(seg)}>×</button>
              </li>
            )
          ))}</ul>
        )}
        {undo && (
          <div class="row undo">
            <span class="muted small">{undo.label}.</span>
            <button class="mini" onClick={() => { setState({ segments: undo.segments, tentative: undo.tentative }); setUndo(null); }}>Undo</button>
          </div>
        )}
      </Card>
      <BugButton s={s} ev={ev} />
    </>
  );
}

/* ============================================================ Split Lab */

function SplitTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const [b1, setB1] = useState(180);
  const [b1s, setB1s] = useState<'OFF' | 'SB'>('OFF');
  const [dwell, setDwell] = useState(30);
  const [drive, setDrive] = useState(300);
  const [b2, setB2] = useState(420);
  const [b2s, setB2s] = useState<'OFF' | 'SB'>('SB');

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
      <Card title="Current pair status" tone={ev.shift.pendingSplitLeg ? 'warn' : undefined}>
        {ev.shift.pendingSplitLeg && ev.shift.pendingSplitLeg.isReset
          ? <p><b>Your {dur(ev.shift.pendingSplitLeg.duration)} reset included 7+ hours in the sleeper.</b> Under FMCSA FAQ 22 (July 2026) a later break of 2h+ can pair with it and be <b>excluded from your 14</b> — it won't give back driving time, but it buys window. Clocks below assume the plain reset until you take that break.</p>
          : ev.shift.pendingSplitLeg
          ? <p><b>Period A logged:</b> {dur(ev.shift.pendingSplitLeg.duration)} ending {clock(ev.shift.pendingSplitLeg.end)} ({ev.shift.pendingSplitLeg.longestSB >= 420 ? '≥7h sleeper — needs a ≥2h partner' : `needs ≥7h sleeper, and ≥${dur(Math.max(120, 600 - ev.shift.pendingSplitLeg.duration))} to total 10h`}). Until the partner completes, this time <b>counts against your 14</b>.</p>
          : <p class="muted">No qualifying break (≥2h) pending since your anchor at {clock(ev.shift.anchor)}.</p>}
        {ev.shift.chain.length >= 2 && <p class="ok">Active split: clocks anchored at {clock(ev.shift.anchor)} (end of first paired rest). {ev.candidates} interpretation(s) considered.</p>}
      </Card>

      <Card title="What if… (starts at the end of your log)">
        <p class="muted small">Plan begins {clock(t0)}.</p>
        <Toggle options={[['OFF', 'Break 1: Off duty'], ['SB', 'Break 1: Sleeper']]} value={b1s} onChange={setB1s} />
        <Slider label="Break 1 length" value={b1} min={0} max={600} step={15} onChange={setB1} fmt={dur} unit="min" />
        <Slider label="Then on-duty (dock, fuel)" value={dwell} min={0} max={240} step={15} onChange={setDwell} fmt={dur} unit="min" />
        <Slider label="Then drive" value={drive} min={0} max={660} step={15} onChange={setDrive} fmt={dur} unit="min" />
        <Toggle options={[['SB', 'Break 2: Sleeper'], ['OFF', 'Break 2: Off duty']]} value={b2s} onChange={setB2s} />
        <Slider label="Break 2 length" value={b2} min={0} max={600} step={15} onChange={setB2} fmt={dur} unit="min" />
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
          <Stat label="Drive now" value={dur(after.driveNow)} sub={bindingLabel[after.binding]} />
          <Stat label={`Range @${s.mph}`} value={`${sh.miles} mi`} sub={`stop by ${clock(after.mustStopBy)}`} />
        </div>
        <p class="muted small">Anchor: {clock(after.shift.anchor)}{paired ? ' — end of Break 1; everything before it is cleared.' : ' — no split credit.'}</p>
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
  if (!open) return <button class="mini" onClick={() => setOpen(true)}>{hasData ? 'edit' : 'set'}</button>;
  return (
    <div class="dayedit">
      <label>Drive h<input type="number" class="hrs" min={0} max={13} step={0.25} value={drive} onInput={(e) => setDrive(Number((e.target as HTMLInputElement).value))} /></label>
      <label>On h<input type="number" class="hrs" min={0} max={14} step={0.25} value={on} onInput={(e) => setOn(Number((e.target as HTMLInputElement).value))} /></label>
      <label>Start<input type="number" class="hrs" min={0} max={23} step={1} value={startH} onInput={(e) => setStartH(Number((e.target as HTMLInputElement).value))} /></label>
      <button class="mini primary" onClick={() => { if (!hasData || confirm(`Replace everything logged on ${day.label}?`)) { onApply(drive, on, startH); setOpen(false); } }}>OK</button>
      <button class="mini" onClick={() => setOpen(false)}>✕</button>
    </div>
  );
}

const STRATEGY_LABEL: Record<TripStrategy, string> = {
  reset10: '10-hour resets',
  split: 'Sleeper splits',
  restart34: '34-hour restart',
};

function PlanCompare({ both, from, view, onView }: { both: ReturnType<typeof planTripAll>; from: number; view?: TripStrategy | null; onView?: (v: TripStrategy) => void }) {
  const fallback: TripStrategy = both.faster === 'same' ? 'reset10' : both.faster;
  const [local, setLocal] = useState<TripStrategy>(fallback);
  // `view` provided = the caller owns the selection (Trip tab keeps it in the store, so it survives
  // navigation). Omitted = this component owns it (Recap tab).
  const chosen = (view === undefined ? local : view) ?? fallback;
  const pick = (k: TripStrategy) => { if (view === undefined) setLocal(k); else onView?.(k); };
  const plan: TripPlan = both[chosen];
  // Past a week the weekday repeats, so "Wed 08:00" stops being unambiguous. Show the date.
  const showDates = Math.max(...TRIP_STRATEGIES.map((k) => both[k].arrival)) - from > 7 * 1440;
  const at = showDates ? clockFull : clock;
  const resets = (p: TripPlan) => p.steps.filter((x) => x.segment.status !== 'D' && x.segment.status !== 'ON' && x.segment.end - x.segment.start >= 600).length;
  return (
    <>
      <div class="compare">
        {TRIP_STRATEGIES.map((k) => {
          const p = both[k];
          return <button key={k} class={`plancard ${chosen === k ? 'on' : ''} ${p.feasible ? '' : 'bad'}`} onClick={() => pick(k)}>
            <div class="stat-label">{STRATEGY_LABEL[k]}{both.faster === k ? ' · fastest' : ''}</div>
            <div class="stat-value">{at(p.arrival)}</div>
            <div class="stat-sub">{dur(p.elapsedMinutes)} · {resets(p)} long rest{resets(p) === 1 ? '' : 's'} · {p.feasible ? 'legal' : 'PROBLEM'}</div>
          </button>;
        })}
      </div>
      <ol class="itin">{plan.steps.map((st, i) => <li key={i}><span class="dot" style={{ background: STATUS_COLOR[st.segment.status] }} /><span><b>{at(st.segment.start)}</b> {st.reason}</span><span class="muted">{dur(st.segment.end - st.segment.start)}{st.segment.status === 'D' ? ` · mi ${Math.round(st.fromMile)}→${Math.round(st.toMile)}` : ''}</span></li>)}</ol>
      {plan.warnings.map((w, i) => <p key={i} class="warnbox">{w}</p>)}
      <ViolationList items={plan.evaluation.violations} from={from} />
      {chosen === 'split' && <p class="muted small">The split plan only works if you actually log the rests exactly as shown — the shorter one must be ≥2h off duty or sleeper, and the sleeper must be ≥7h *consecutive*. Anything less and the plan collapses to the 10-hour version.</p>}
      {chosen === 'restart34' && <p class="muted small">A 34-hour restart resets the 60/70-hour cycle (§395.3(c)) and, being far more than 10 consecutive hours off duty, <b>also satisfies the daily reset</b> (§395.3(a)(1)). This option takes it where the <b>cycle</b> is what limits your trip; compare its arrival time against waiting for recap hours, which can take days.</p>}
    </>
  );
}

function RecapTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const [miles, setMiles] = useState(1200);
  const [dwell, setDwell] = useState(120);
  const [dwellOff, setDwellOff] = useState(false);
  const days = ev.cycle.days;
  const applyDay = (dayStart: number, dayEnd: number) => (drive: number, on: number, startHour: number) => {
    setState((cur) => {
      const keep = cur.segments.filter((x) => x.end <= dayStart || x.start >= dayEnd);
      let t = dayStart + startHour * 60;
      const segs: Segment[] = [];
      // pre-trip on-duty, then driving split around a 30-min break if needed, then post-trip on-duty
      const onPre = Math.min(on, 0.5), onPost = on - onPre;
      if (onPre > 0) { segs.push({ status: 'ON', start: t, end: t + Math.round(onPre * 60), note: 'recap entry' }); t += Math.round(onPre * 60); }
      if (drive > 8) {
        segs.push({ status: 'D', start: t, end: t + 480, note: 'recap entry' }); t += 480;
        segs.push({ status: 'OFF', start: t, end: t + 30, note: 'recap entry' }); t += 30;
        segs.push({ status: 'D', start: t, end: t + Math.round((drive - 8) * 60), note: 'recap entry' }); t += Math.round((drive - 8) * 60);
      } else if (drive > 0) { segs.push({ status: 'D', start: t, end: t + Math.round(drive * 60), note: 'recap entry' }); t += Math.round(drive * 60); }
      if (onPost > 0) { segs.push({ status: 'ON', start: t, end: t + Math.round(onPost * 60), note: 'recap entry' }); t += Math.round(onPost * 60); }
      return { segments: [...keep, ...segs].sort((a, b) => a.start - b.start) };
    });
  };
  const both = useMemo(() => planTripAll(allSegments(s, now), { departure: now, distanceMiles: miles, mph: s.mph, stops: dwell ? [{ atMile: miles, minutes: dwell, status: dwellOff ? 'OFF' : 'ON', label: 'Receiver' }] : [], config: s.config }), [s, now, miles, dwell, dwellOff]);
  const best = both[both.faster === 'split' ? 'split' : 'reset10'];

  return (
    <>
      <Card title={`${ev.cycle.limit / 60}-hour / ${ev.cycle.windowDays}-day recap`}>
        <table class="recap"><thead><tr><th>Day</th><th>On duty</th><th></th></tr></thead><tbody>
          {days.map((d, i) => {
            const isToday = i === days.length - 1;
            const hasData = s.segments.some((x) => x.start < d.end && x.end > d.start);
            return <tr key={d.label} class={isToday ? 'today' : ''}><td>{isToday ? 'Today' : `D-${days.length - 1 - i}`}<br /><small class="muted">{d.label}</small></td><td><b>{hrs(d.onDuty)}</b> h</td>
              <td>{!isToday && <DayEditor day={d} hasData={hasData} onApply={applyDay(d.start, d.end)} />}</td></tr>;
          })}
        </tbody></table>
        <div class="clocks">
          <Stat label="Used" value={`${hrs(ev.cycle.used)} h`} />
          <Stat label="Available" value={`${hrs(ev.cycle.remaining)} h`} tone={ev.cycle.remaining < 120 ? 'bad' : ''} />
          {ev.cycle.restartEnd !== null && <Stat label="Last 34h restart" value={clock(ev.cycle.restartEnd)} />}
        </div>
        <p class="muted small">"set" a past day with drive + on-duty hours and a start time; it's written as real segments (with a 30-min break after 8h driving) so the whole engine sees it. Days roll at {String(s.config.dayStartHour).padStart(2, '0')}:00 {s.config.timeZone}.{deviceTz !== s.config.timeZone && <> On your device clock ({deviceTz}) that is <b>{terminalMidnightOnDevice(s.config.timeZone, deviceTz, now)}</b> — the times in this table use your device zone.</>}</p>
      </Card>
      <Card title="Hours coming back">
        <ul class="forecast">{ev.cycle.forecast.map((f) => <li key={f.label}><span>{clock(f.dayStart)}</span><span>+{hrs(f.dropsOff)} h drops</span><b>{hrs(f.availableAtStart)} h available</b></li>)}</ul>
      </Card>
      <Card title="Can I take this load?" tone={best.feasible ? 'good' : 'bad'}>
        <Slider label="Load distance" value={miles} min={1} max={3000} step={50} onChange={setMiles} fmt={(v) => `${v} mi`} unit="mi" />
        <Slider label="Receiver dwell" value={dwell} min={0} max={480} step={30} onChange={setDwell} fmt={dur} unit="min" />
        <Toggle options={[[false, 'Dwell on duty'], [true, 'Dwell off duty (relieved)']]} value={dwellOff} onChange={setDwellOff} />
        <div class="clocks">
          <Stat label="Verdict" value={best.feasible ? 'LEGAL' : 'NO'} tone={best.feasible ? 'good' : 'bad'} />
          <Stat label="Cycle at arrival" value={`${hrs(best.cycleRemainingAtArrival)} h`} />
        </div>
        {isFreshLog(s) && <p class="warnbox small">This verdict assumes a fresh clock. Nothing is logged, so it doesn't know what you've already driven today or how much cycle you've used — it is not a statement about your real day. Add your duty on the <b>Log</b> tab first.</p>}
        <PlanCompare both={both} from={now} />
      </Card>
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
      <Card title="Clock-to-parking (right now)" tone={ev.driveNow < 60 ? 'bad' : ev.driveNow < 120 ? 'warn' : 'good'}>
        <div class="clocks">
          <Stat label="Range" value={`${sh.miles} mi`} sub={`${dur(ev.driveNow)} @ ${s.mph} mph`} />
          <Stat label="Hard stop" value={clock(ev.mustStopBy)} sub={bindingLabel[ev.binding]} />
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
      <Card title="Itinerary — three ways to rest">
        <PlanCompare both={both} from={departure} view={d.view} onView={(v) => setTrip({ view: v })} />
      </Card>
    </>
  );
}

/* ============================================================ Settings */

function SettingsTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const c = s.config;
  const [ioNote, setIoNote] = useState<string | null>(null);
  const setC = (p: Partial<typeof c>) => setState({ config: { ...c, ...p } });
  const exportJson = () => {
    const blob = new Blob([exportState(s)], { type: 'application/json' });
    const name = `hos-sandbox-${new Date().toISOString().slice(0, 10)}.json`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    // Say only what is knowable: the app asked the browser for a download. Whether the file landed is
    // not ours to claim — a silent failure and a success look identical from in here (consumer-review-5).
    setIoNote(`Download requested: ${name} (${s.segments.length} logged segment(s), ${s.tentative.length} what-if row(s)). Check your browser's downloads — the app cannot confirm the file reached your device.`);
  };
  const importJson = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    f.text().then((t) => {
      const d = JSON.parse(t);
      setState((cur) => applyImportedState(cur, d));
      setIoNote(`Imported ${(d.segments ?? []).length} segment(s) and ${(d.tentative ?? []).length} what-if row(s) from ${f.name}. Settings and the trip scenario came back with them; a simulated clock does not.`);
    }).catch((err) => setIoNote(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`));
  };
  return (
    <>
      <Card title="Rules">
        <label>Cycle<Toggle options={[['70/8', '70 hr / 8 days'], ['60/7', '60 hr / 7 days']]} value={c.cycle} onChange={(v) => setC({ cycle: v })} /></label>
        <label>Carrier day starts at<select value={c.dayStartHour} onChange={(e) => setC({ dayStartHour: Number((e.target as HTMLSelectElement).value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <label>Home terminal time zone<TimeZoneField value={c.timeZone} onChange={(v) => setC({ timeZone: v })} /></label>
        <label class="check"><input type="checkbox" checked={c.shortHaul} onChange={(e) => setC({ shortHaul: (e.target as HTMLInputElement).checked })} /> Short-haul (§395.1(e)) — no 30-min break rule</label>
        <p class="muted small">Adverse-conditions and 16-hour-day exceptions are per shift — toggle them on the Log tab.</p>
      </Card>
      <Card title="Planning">
        <Slider label="Net average speed" value={s.mph} min={40} max={70} step={1} onChange={(v) => setState({ mph: v })} fmt={(v) => `${v} mph`} unit="mph" />
        <label>Screen<Toggle options={[['night', 'Night (default)'], ['day', 'Day — for sunlight']]} value={s.theme} onChange={(v) => setState({ theme: v as Theme })} /></label>
        <p class="muted small">Night is the default. Day flips to a light screen for reading in sunlight — a dark screen is the worst case outdoors. Both palettes are contrast-checked against WCAG AA, and there is a one-tap switch in the header for when you step out of the cab.</p>
        <label>Simulated "now" (testing)<input type="datetime-local" value={s.nowOverride ? toInput(s.nowOverride) : ''} onChange={(e) => setState({ nowOverride: fromInput((e.target as HTMLInputElement).value) })} /></label>
        <button onClick={() => setState({ nowOverride: null })} disabled={!s.nowOverride}>Use real clock</button>
      </Card>
      <Card title="Bug reports">
        <BugButton s={s} ev={ev} />
        <p class="muted small">Opens a GitHub issue form with your clocks, build number and log pre-filled (a free GitHub account is needed to submit). Your log is also copied to the clipboard. Beta rules: <a href={`https://github.com/${REPO}#free-beta`} target="_blank" rel="noopener">github.com/{REPO}</a></p>
        <label>Prefer email instead? Send reports to<input type="email" placeholder="leave blank to use GitHub" value={s.bugEmail} onChange={(e) => setState({ bugEmail: (e.target as HTMLInputElement).value.trim() })} /></label>
      </Card>
      <Card title="Data">
        <div class="row"><button onClick={exportJson}>Export JSON</button><label class="filebtn">Import JSON<input type="file" accept="application/json" onChange={importJson} /></label></div>
        {ioNote && <p class="muted small">{ioNote}</p>}
        <button class="danger" onClick={() => { if (confirm('Erase everything?')) setState({ segments: [], tentative: [], current: null, nowOverride: null, config: { ...c, adverseShifts: [], sixteenHourShifts: [] } }); }}>Erase all data</button>
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

declare const __BUILD__: string;

export function App() {
  const s = useStore();
  const now = useNow();
  useEffect(() => { applyTheme(s.theme); }, [s.theme]);
  const ev = useMemo(() => evaluate(allSegments(s, now), { asOf: now, config: s.config }), [s, now]);
  const tabs: [State['tab'], string][] = [['log', 'Log'], ['split', 'Split Lab'], ['recap', 'Recap'], ['trip', 'Trip'], ['settings', 'Settings']];
  return (
    <div class="app">
      <StatusBar ev={ev} now={now} s={s} />
      <main>
        <TabBoundary key={s.tab} tab={s.tab}>
          {s.tab === 'log' && <LogTab s={s} now={now} ev={ev} />}
          {s.tab === 'split' && <SplitTab s={s} now={now} ev={ev} />}
          {s.tab === 'recap' && <RecapTab s={s} now={now} ev={ev} />}
          {s.tab === 'trip' && <TripTab s={s} now={now} ev={ev} />}
          {s.tab === 'settings' && <SettingsTab s={s} now={now} ev={ev} />}
        </TabBoundary>
      </main>
      <nav class="tabs">{tabs.map(([k, l]) => <button key={k} class={s.tab === k ? 'on' : ''} onClick={() => setState({ tab: k })}>{l}</button>)}</nav>
    </div>
  );
}
