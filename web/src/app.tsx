import { useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  evaluate, planTrip, planTripBoth, safeHaven, LIMITS, type Segment, type DutyStatus, type FullEvaluation, type Violation, type TripPlan,
} from '../../engine/src/index.ts';
import {
  useStore, setState, useNow, allSegments, toInput, fromInput, clock, dur, hrs, STATUS_LABEL, STATUS_COLOR, segLabel, exportState, type State,
} from './store.ts';

/* ============================================================ shared bits */

function Card({ title, children, tone }: { title?: string; children: ComponentChildren; tone?: 'warn' | 'bad' | 'good' }) {
  return <section class={`card ${tone ?? ''}`}>{title && <h2>{title}</h2>}{children}</section>;
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div class={`stat ${tone ?? ''}`}><div class="stat-label">{label}</div><div class="stat-value">{value}</div>{sub && <div class="stat-sub">{sub}</div>}</div>;
}
function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label class="slider">
      <div class="slider-head"><span>{label}</span><b>{fmt(value)}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onInput={(e) => onChange(Number((e.target as HTMLInputElement).value))} />
    </label>
  );
}
function Toggle<T extends string | boolean>({ options, value, onChange }: { options: [T, string][]; value: T; onChange: (v: T) => void }) {
  return <div class="toggle">{options.map(([v, l]) => <button key={String(v)} class={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
function ViolationList({ items, from }: { items: Violation[]; from?: number }) {
  const list = from === undefined ? items : items.filter((v) => v.start >= from);
  if (!list.length) return <p class="ok">No violations.</p>;
  return <ul class="viol">{list.map((v, i) => <li key={i} class={v.severity}><b>{v.kind.replace('_', ' ')}</b> · {dur(v.minutes)} · {clock(v.start)} → {clock(v.end)}<br /><small>{v.detail}</small></li>)}</ul>;
}
const bindingLabel: Record<FullEvaluation['binding'], string> = {
  DRIVE_11: 'driving limit', WINDOW_14: 'duty window', CYCLE: 'cycle (60/70)', BREAK_30: '30-min break due', NONE: '—',
};

const REPO = 'loricoestrellado-jpg/hos-sandbox';

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
        <span class="muted">{s.nowOverride ? `SIM ${clock(now)}` : clock(now)}</span>
      </div>
      <div class="clocks">
        <Stat label="Drive now" value={dur(ev.driveNow)} sub={`limited by ${bindingLabel[ev.binding]}`} tone={tone} />
        <Stat label={`${ev.shift.limits.drive / 60}-hr left`} value={dur(ev.shift.driveRemaining)} />
        <Stat label={`${ev.shift.limits.window / 60}-hr left`} value={dur(ev.shift.windowRemaining)} />
        <Stat label={`${ev.cycle.limit / 60}-hr left`} value={dur(ev.cycle.remaining)} />
      </div>
      {ev.driveNow > 0 && <div class="muted small">Must stop driving by <b>{clock(ev.mustStopBy)}</b>{ev.shift.pendingSplitLeg ? ' · split leg pending' : ''}{ev.shift.notes.length ? ' · exception active' : ''}</div>}
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
        return <line key={i} x1={x(s.start)} x2={x(s.end)} y1={y} y2={y} stroke={STATUS_COLOR[s.status]} stroke-width={6} stroke-dasharray={s.tentative ? '4 3' : undefined} />;
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
    if (a === null || b === null || b <= a) return alert('End must be after start.');
    setState((cur) => ({ segments: [...cur.segments, { status, start: a, end: b }] }));
  };
  const del = (seg: Segment) => setState((cur) => ({ segments: cur.segments.filter((x) => x !== seg), tentative: cur.tentative.filter((x) => x !== seg) }));
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
        <div class="row"><button class="primary" onClick={add}>Add segment</button><button onClick={fresh}>Fresh start</button></div>
      </Card>
      <Card title="Violations in record"><ViolationList items={ev.violations} /></Card>
      <Card title={`Segments (${segs.length})`}>
        <ul class="seglist">{[...s.segments, ...s.tentative].sort((a, b) => b.start - a.start).map((seg, i) => (
          <li key={i}><span class="dot" style={{ background: STATUS_COLOR[seg.status] }} /><span>{segLabel(seg.status, seg.note)}{seg.tentative ? ' (what-if)' : ''}</span><span class="muted">{clock(seg.start)} → {clock(seg.end)} · {dur(seg.end - seg.start)}</span><button class="x" onClick={() => del(seg)}>×</button></li>
        ))}</ul>
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

  const after = evaluate([...base, ...plan], { asOf: endB2 + 1, config: s.config });
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
        {ev.shift.pendingSplitLeg
          ? <p><b>Period A logged:</b> {dur(ev.shift.pendingSplitLeg.duration)} ending {clock(ev.shift.pendingSplitLeg.end)} ({ev.shift.pendingSplitLeg.longestSB >= 420 ? '≥7h sleeper — needs a ≥2h partner' : `needs ≥7h sleeper, and ≥${dur(Math.max(120, 600 - ev.shift.pendingSplitLeg.duration))} to total 10h`}). Until the partner completes, this time <b>counts against your 14</b>.</p>
          : <p class="muted">No qualifying break (≥2h) pending since your anchor at {clock(ev.shift.anchor)}.</p>}
        {ev.shift.chain.length >= 2 && <p class="ok">Active split: clocks anchored at {clock(ev.shift.anchor)} (end of first paired rest). {ev.candidates} interpretation(s) considered.</p>}
      </Card>

      <Card title="What if… (starts at the end of your log)">
        <p class="muted small">Plan begins {clock(t0)}.</p>
        <Toggle options={[['OFF', 'Break 1: Off duty'], ['SB', 'Break 1: Sleeper']]} value={b1s} onChange={setB1s} />
        <Slider label="Break 1 length" value={b1} min={0} max={600} step={15} onChange={setB1} fmt={dur} />
        <Slider label="Then on-duty (dock, fuel)" value={dwell} min={0} max={240} step={15} onChange={setDwell} fmt={dur} />
        <Slider label="Then drive" value={drive} min={0} max={660} step={15} onChange={setDrive} fmt={dur} />
        <Toggle options={[['SB', 'Break 2: Sleeper'], ['OFF', 'Break 2: Off duty']]} value={b2s} onChange={setB2s} />
        <Slider label="Break 2 length" value={b2} min={0} max={600} step={15} onChange={setB2} fmt={dur} />
      </Card>

      <Card title="Does it pair?" tone={paired ? 'good' : 'bad'}>
        <ul class="checks">
          <li class={b1 >= 120 && b2 >= 120 ? 'ok' : 'no'}>Both breaks ≥ 2h</li>
          <li class={longOk ? 'ok' : 'no'}>One break ≥ 7h in the sleeper berth</li>
          <li class={totalOk ? 'ok' : 'no'}>Total ≥ 10h ({dur(b1 + b2)})</li>
          <li class={paired ? 'ok' : 'no'}>Engine confirms pairing</li>
        </ul>
        {(b1 >= 600 || b2 >= 600) && <p class="muted small">A break of 10h+ is a full reset on its own — it also pairs, per FMCSA FAQ.</p>}
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
        {strictViol.length > 0 && <div class="warnbox"><b>If you skip Break 2:</b> the {dur(drive)} drive ends {clock(endDrive)} with {strictViol.map((v) => `${v.kind.replace('_', ' ')} ${dur(v.minutes)}`).join(', ')} — Break 1 only pays off once Break 2 is done.</div>}
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

function PlanCompare({ both, from }: { both: ReturnType<typeof planTripBoth>; from: number }) {
  const [view, setView] = useState<'reset10' | 'split'>(both.faster === 'split' ? 'split' : 'reset10');
  const plan: TripPlan = both[view];
  const resets = (p: TripPlan) => p.steps.filter((x) => x.segment.status !== 'D' && x.segment.status !== 'ON' && x.segment.end - x.segment.start >= 600).length;
  return (
    <>
      <div class="compare">
        {(['reset10', 'split'] as const).map((k) => {
          const p = both[k];
          return <button key={k} class={`plancard ${view === k ? 'on' : ''} ${p.feasible ? '' : 'bad'}`} onClick={() => setView(k)}>
            <div class="stat-label">{k === 'reset10' ? '10-hour resets' : 'Sleeper splits'}{both.faster === k ? ' · faster' : ''}</div>
            <div class="stat-value">{clock(p.arrival)}</div>
            <div class="stat-sub">{dur(p.elapsedMinutes)} · {resets(p)} long rest{resets(p) === 1 ? '' : 's'} · {p.feasible ? 'legal' : 'PROBLEM'}</div>
          </button>;
        })}
      </div>
      <ol class="itin">{plan.steps.map((st, i) => <li key={i}><span class="dot" style={{ background: STATUS_COLOR[st.segment.status] }} /><span><b>{clock(st.segment.start)}</b> {st.reason}</span><span class="muted">{dur(st.segment.end - st.segment.start)}{st.segment.status === 'D' ? ` · mi ${Math.round(st.fromMile)}→${Math.round(st.toMile)}` : ''}</span></li>)}</ol>
      {plan.warnings.map((w, i) => <p key={i} class="warnbox">{w}</p>)}
      <ViolationList items={plan.evaluation.violations} from={from} />
      {view === 'split' && <p class="muted small">The split plan only works if you actually log the rests exactly as shown — the shorter one must be ≥2h off duty or sleeper, and the sleeper must be ≥7h *consecutive*. Anything less and the plan collapses to the 10-hour version.</p>}
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
  const both = useMemo(() => planTripBoth(allSegments(s, now), { departure: now, distanceMiles: miles, mph: s.mph, stops: dwell ? [{ atMile: miles, minutes: dwell, status: dwellOff ? 'OFF' : 'ON', label: 'Receiver' }] : [], config: s.config }), [s, now, miles, dwell, dwellOff]);
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
        <p class="muted small">"set" a past day with drive + on-duty hours and a start time; it's written as real segments (with a 30-min break after 8h driving) so the whole engine sees it. Days roll at {String(s.config.dayStartHour).padStart(2, '0')}:00 {s.config.timeZone}.</p>
      </Card>
      <Card title="Hours coming back">
        <ul class="forecast">{ev.cycle.forecast.map((f) => <li key={f.label}><span>{clock(f.dayStart)}</span><span>+{hrs(f.dropsOff)} h drops</span><b>{hrs(f.availableAtStart)} h available</b></li>)}</ul>
      </Card>
      <Card title="Can I take this load?" tone={best.feasible ? 'good' : 'bad'}>
        <Slider label="Load distance" value={miles} min={100} max={3000} step={50} onChange={setMiles} fmt={(v) => `${v} mi`} />
        <Slider label="Receiver dwell" value={dwell} min={0} max={480} step={30} onChange={setDwell} fmt={dur} />
        <Toggle options={[[false, 'Dwell on duty'], [true, 'Dwell off duty (relieved)']]} value={dwellOff} onChange={setDwellOff} />
        <div class="clocks">
          <Stat label="Verdict" value={best.feasible ? 'LEGAL' : 'NO'} tone={best.feasible ? 'good' : 'bad'} />
          <Stat label="Cycle at arrival" value={`${hrs(best.cycleRemainingAtArrival)} h`} />
        </div>
        <PlanCompare both={both} from={now} />
      </Card>
    </>
  );
}

/* ============================================================ Trip tab */

function TripTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const [miles, setMiles] = useState(550);
  const [pre, setPre] = useState(30);
  const [stopMile, setStopMile] = useState(0);
  const [stopMin, setStopMin] = useState(0);
  const [stopOff, setStopOff] = useState(false);
  const [dep, setDep] = useState(toInput(now));
  const departure = fromInput(dep) ?? now;
  const both = useMemo(() => planTripBoth(allSegments(s, now).filter((x) => !x.tentative), {
    departure, distanceMiles: miles, mph: s.mph, preTripMinutes: pre,
    stops: stopMin > 0 && stopMile > 0 && stopMile < miles ? [{ atMile: stopMile, minutes: stopMin, status: stopOff ? 'OFF' : 'ON', label: stopOff ? 'Stop (off duty)' : 'Stop (on duty)' }] : [],
    config: s.config,
  }), [s, now, departure, miles, pre, stopMile, stopMin, stopOff]);
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
        <label>Depart<input type="datetime-local" value={dep} onInput={(e) => setDep((e.target as HTMLInputElement).value)} /></label>
        <Slider label="Distance" value={miles} min={50} max={3000} step={25} onChange={setMiles} fmt={(v) => `${v} mi`} />
        <Slider label="Pre-trip / loading (on duty)" value={pre} min={0} max={240} step={15} onChange={setPre} fmt={dur} />
        <Slider label="Mid-trip stop at mile" value={stopMile} min={0} max={miles} step={25} onChange={setStopMile} fmt={(v) => (v ? `${v} mi` : 'none')} />
        <Slider label="Stop length" value={stopMin} min={0} max={480} step={15} onChange={setStopMin} fmt={dur} />
        {stopMin > 0 && <Toggle options={[[false, 'Stop is on duty'], [true, 'Stop is off duty (can be a split leg)']]} value={stopOff} onChange={setStopOff} />}
      </Card>
      <Card title="Itinerary — two ways to rest">
        <PlanCompare both={both} from={departure} />
      </Card>
    </>
  );
}

/* ============================================================ Settings */

function SettingsTab({ s, now, ev }: { s: State; now: number; ev: FullEvaluation }) {
  const c = s.config;
  const setC = (p: Partial<typeof c>) => setState({ config: { ...c, ...p } });
  const exportJson = () => {
    const blob = new Blob([exportState(s)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `hos-sandbox-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const importJson = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    f.text().then((t) => { const d = JSON.parse(t); setState({ segments: d.segments ?? [], tentative: d.tentative ?? [], current: d.current ?? null, config: { ...c, ...(d.config ?? {}) }, mph: d.mph ?? s.mph }); });
  };
  return (
    <>
      <Card title="Rules">
        <label>Cycle<Toggle options={[['70/8', '70 hr / 8 days'], ['60/7', '60 hr / 7 days']]} value={c.cycle} onChange={(v) => setC({ cycle: v })} /></label>
        <label>Carrier day starts at<select value={c.dayStartHour} onChange={(e) => setC({ dayStartHour: Number((e.target as HTMLSelectElement).value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></label>
        <label>Home terminal time zone<input value={c.timeZone} onChange={(e) => setC({ timeZone: (e.target as HTMLInputElement).value })} /></label>
        <label class="check"><input type="checkbox" checked={c.shortHaul} onChange={(e) => setC({ shortHaul: (e.target as HTMLInputElement).checked })} /> Short-haul (§395.1(e)) — no 30-min break rule</label>
        <p class="muted small">Adverse-conditions and 16-hour-day exceptions are per shift — toggle them on the Log tab.</p>
      </Card>
      <Card title="Planning">
        <Slider label="Net average speed" value={s.mph} min={40} max={70} step={1} onChange={(v) => setState({ mph: v })} fmt={(v) => `${v} mph`} />
        <label>Simulated "now" (testing)<input type="datetime-local" value={s.nowOverride ? toInput(s.nowOverride) : ''} onChange={(e) => setState({ nowOverride: fromInput((e.target as HTMLInputElement).value) })} /></label>
        <button onClick={() => setState({ nowOverride: null })} disabled={!s.nowOverride}>Use real clock</button>
      </Card>
      <Card title="Bug reports">
        <BugButton s={s} ev={ev} />
        <p class="muted small">Opens a GitHub issue form with your clocks, build number and log pre-filled (a free GitHub account is needed to submit). Your log is also copied to the clipboard. Bounty rules: <a href={`https://github.com/${REPO}#bug-bounty`} target="_blank" rel="noopener">github.com/{REPO}</a></p>
        <label>Prefer email instead? Send reports to<input type="email" placeholder="leave blank to use GitHub" value={s.bugEmail} onChange={(e) => setState({ bugEmail: (e.target as HTMLInputElement).value.trim() })} /></label>
      </Card>
      <Card title="Data">
        <div class="row"><button onClick={exportJson}>Export JSON</button><label class="filebtn">Import JSON<input type="file" accept="application/json" onChange={importJson} /></label></div>
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
  const ev = useMemo(() => evaluate(allSegments(s, now), { asOf: now, config: s.config }), [s, now]);
  const tabs: [State['tab'], string][] = [['log', 'Log'], ['split', 'Split Lab'], ['recap', 'Recap'], ['trip', 'Trip'], ['settings', 'Settings']];
  return (
    <div class="app">
      <StatusBar ev={ev} now={now} s={s} />
      <main>
        {s.tab === 'log' && <LogTab s={s} now={now} ev={ev} />}
        {s.tab === 'split' && <SplitTab s={s} now={now} ev={ev} />}
        {s.tab === 'recap' && <RecapTab s={s} now={now} ev={ev} />}
        {s.tab === 'trip' && <TripTab s={s} now={now} ev={ev} />}
        {s.tab === 'settings' && <SettingsTab s={s} now={now} ev={ev} />}
      </main>
      <nav class="tabs">{tabs.map(([k, l]) => <button key={k} class={s.tab === k ? 'on' : ''} onClick={() => setState({ tab: k })}>{l}</button>)}</nav>
    </div>
  );
}
