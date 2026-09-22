import { useEffect, useState } from 'preact/hooks';
import type { Segment, RulesConfig, DutyStatus } from '../../engine/src/index.ts';
import { DEFAULT_CONFIG } from '../../engine/src/index.ts';

export interface OpenSegment { status: DutyStatus; since: number; note?: string }

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
  /** which comparison is selected; null = whichever plan is faster */
  view: 'reset10' | 'split' | null;
}

export interface State {
  segments: Segment[];
  tentative: Segment[];
  current: OpenSegment | null;
  config: RulesConfig;
  mph: number;
  trip: TripDraft;
  /** simulated "now" for testing; null = wall clock */
  nowOverride: number | null;
  tab: 'log' | 'split' | 'recap' | 'trip' | 'settings';
  /** where "Report a bug" sends mail */
  bugEmail: string;
}

const KEY = 'hos-sandbox-v1';
const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';

export const DEFAULT_TRIP: TripDraft = {
  miles: 550, pre: 30, stopMile: 0, stopMin: 0, stopOff: false, dep: null, until: 'CURRENT', view: null,
};

const initial: State = {
  segments: [], tentative: [], current: null,
  config: { ...DEFAULT_CONFIG, timeZone: deviceTz },
  mph: 55, trip: { ...DEFAULT_TRIP }, nowOverride: null, tab: 'log', bugEmail: '',
};

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial;
    const s = JSON.parse(raw);
    return { ...initial, ...s, config: { ...initial.config, ...(s.config ?? {}) }, trip: { ...DEFAULT_TRIP, ...(s.trip ?? {}) } };
  } catch { return initial; }
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
  useEffect(() => { const id = setInterval(() => setN(nowMin()), 30000); return () => clearInterval(id); }, []);
  return s.nowOverride ?? n;
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
export function clock(min: number, withDay = true): string {
  if (!isFinite(min)) return '—';
  const d = new Date(min * 60000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return withDay ? `${DOW[d.getDay()]} ${hm}` : hm;
}
export function dur(min: number): string {
  if (!isFinite(min)) return '∞';
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
export function hrs(min: number): string { return (min / 60).toFixed(1); }

/** Materialize the open segment up to `now` so the engine sees it. */
export function allSegments(s: State, now: number): Segment[] {
  const out = [...s.segments];
  if (s.current && now > s.current.since) out.push({ status: s.current.status, start: s.current.since, end: now, note: s.current.note ?? 'current' });
  return [...out, ...s.tentative];
}

export const STATUS_LABEL: Record<DutyStatus, string> = { OFF: 'Off Duty', SB: 'Sleeper', D: 'Driving', ON: 'On Duty' };
export const STATUS_COLOR: Record<DutyStatus, string> = { OFF: '#8a94a6', SB: '#7c5cff', D: '#2ecc71', ON: '#f5a623' };
/** Sub-statuses drivers think in. For HOS math PC is plain OFF and YM is plain ON (§395.2 / FMCSA guidance). */
export const SUB_STATUS: Record<string, string> = { PC: 'Personal conveyance', YM: 'Yard move' };
export function segLabel(status: DutyStatus, note?: string): string {
  return note && SUB_STATUS[note] ? `${SUB_STATUS[note]} (${status})` : STATUS_LABEL[status];
}

/** Everything a bug report needs. Kept small enough to paste into an email. */
export function exportState(s: State): string {
  return JSON.stringify({ v: 1, exported: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent, segments: s.segments, tentative: s.tentative, current: s.current, config: s.config, mph: s.mph, nowOverride: s.nowOverride, trip: s.trip });
}
