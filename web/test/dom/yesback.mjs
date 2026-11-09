// Verify-17 DOM harness: the real App mounted in a minimal DOM with effects running,
// a controllable wall clock, and a speechSynthesis stub that models the utterance QUEUE
// (cancel empties it, speak appends). Phases are selected by env PHASE so a "relaunch"
// is a genuinely fresh process seeded from a saved localStorage file.
import './domshim.mjs';
// ---- wall clock under our control ----
const realNow = Date.now.bind(Date);
let T = Date.UTC(2026, 10, 9, 12, 0); // replaced per scenario
Date.now = () => T;
const rawSetTimeout = globalThis.setTimeout;
// compress the app's minute ticker (and other long timers) so advancing T is noticed quickly
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); }; globalThis.__BUILD__ = 'p17';
// ---- speech stub: an honest queue ----
const log = []; let queue = [];
const installSpeech = () => {
  globalThis.speechSynthesis = { cancel() { log.push('«cancel»'); queue = []; }, speak(u) { log.push(u.text); queue.push(u.text); }, getVoices: () => [] };
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};
if (process.env.NOSPEECH !== '1') installSpeech();
const said = () => log.filter((x) => x !== '«cancel»');
{ const ns = document.createElementNS; document.createElementNS = (u, t, o) => { const n = ns(u, t, o); if (String(t).toLowerCase() === 'input') n.checked = false; return n; }; }
const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const AL = await import('../../src/alerts.ts');
const { App, tapStatus, setLaunchNotice } = A;
const { setState, getState, deviceTz } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = []; const ok = (n, c, i = '') => { res.push([c ? 'PASS' : 'FAIL', n, i]); };
const root = document.createElement('div'); document.body.appendChild(root);
const text = () => root.textContent;
const M = (d, hh, mm = 0) => Math.floor(new Date(2026, 10, d, hh, mm).getTime() / 60000); // LOCAL wall time → epoch min
const setClock = (min) => { T = min * 60000 + 5000; };
const tick = async (min) => { setClock(min); await sleep(160); };
const base = () => ({ tentative: [], drivingView: true, zoneAck: null, seededAt: null, dayCloses: [], historyAcknowledged: true, theme: 'day', themeChosen: true, darkDriveAtNight: true, disclaimerAcked: true, tzChosen: true, alertsOn: true, nowOverride: null, tab: 'now', config: { ...getState().config, timeZone: deviceTz } });

// ---- DOM helpers ----
const all = (pred) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(root); return out; };
const fire = (node, type, extra = {}) => {
  // preact registers 'onClick' as 'Click' when the node has no 'onclick' property (our shim): try both spellings
  for (const t of [type, type[0].toUpperCase() + type.slice(1)]) {
    const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const f of node.listeners[t] ?? []) f.call(node, ev);
  }
};
const button = (re) => all((n) => n.localName === 'button' && re.test(n.textContent))[0];
const click = async (re) => { const b = button(re); if (!b) throw new Error('no button ' + re); fire(b, 'click'); await sleep(40); };
const speechSwitch = () => all((n) => n.localName === 'label' && /Read driving alerts out loud/.test(n.textContent))[0]?.childNodes.find((c) => c.localName === 'input');
const dialogUp = () => /Want the alerts read out loud\?/.test(text());

// ---- INDEPENDENT word parser (not the app's composers) ----
const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const wnum = (w) => { w = w.toLowerCase(); if (w in UNITS) return UNITS[w]; if (w in TENS) return TENS[w]; const [a, b] = w.split('-'); if (a in TENS && b in UNITS && UNITS[b] > 0 && UNITS[b] < 10) return TENS[a] + UNITS[b]; return NaN; };
export const parseDur = (s) => { // "two hours thirty-six" | "one hour" | "forty-seven minutes" | "one minute" | "no time"
  s = s.trim().toLowerCase(); if (s === 'no time') return 0;
  let m = s.match(/^([a-z-]+) (?:hour|hours)(?: ([a-z-]+))?$/); if (m) return wnum(m[1]) * 60 + (m[2] ? wnum(m[2]) : 0);
  m = s.match(/^([a-z-]+) (?:minute|minutes)$/); if (m) return wnum(m[1]);
  return NaN;
};
export const parseClock = (s) => { // → minutes past (12h) midnight, 0..719
  s = s.trim().toLowerCase(); let m = s.match(/^([a-z-]+) o'clock$/); if (m) return (wnum(m[1]) % 12) * 60;
  m = s.match(/^([a-z-]+) oh ([a-z]+)$/); if (m) { const x = wnum(m[2]); return x >= 1 && x <= 9 ? (wnum(m[1]) % 12) * 60 + x : NaN; }
  m = s.match(/^([a-z-]+) ([a-z-]+)$/); if (m) { const x = wnum(m[2]); return x >= 10 ? (wnum(m[1]) % 12) * 60 + x : NaN; }
  return NaN;
};
const parseAlert = (u) => { const m = u.match(/^(.+) of driving left\. Stop by (.+)\. Limited by the (.+)\.$/); return m ? { left: parseDur(m[1]), stop: parseClock(m[2]), reason: m[3] } : null; };
const parseDrive = (u) => { const m = u.match(/^Driving\. You can drive (.+)\. Stop by (.+)\.$/); return m ? { left: parseDur(m[1]), stop: parseClock(m[2]) } : null; };
// the SCREEN, read as text from the mounted DOM
const screenDur = () => { const n = all((x) => /\bdrive-num\b/.test(x.attributes?.class ?? ''))[0]; if (!n) return NaN; const m = n.textContent.match(/^(?:(\d+)h )?(\d+)m$/); return m ? (+(m[1] ?? 0)) * 60 + +m[2] : NaN; };
const screenStop = () => { const m = text().match(/Stop by \w{3} \w{3} \d+, (\d\d):(\d\d)/); return m ? ((+m[1]) % 12) * 60 + +m[2] : NaN; };
const screenWhy = () => all((x) => /\bdrive-why\b/.test(x.attributes?.class ?? ''))[0]?.textContent ?? '';
const h12 = (min) => { const d = new Date(min * 60000); return (d.getHours() % 12) * 60 + d.getMinutes(); };
const results = () => { for (const [k, n, i] of res) console.log(`${k} ${n}${i ? '  — ' + i : ''}`); console.log(`\n${res.filter((r) => r[0] === 'PASS').length} pass, ${res.filter((r) => r[0] === 'FAIL').length} fail`); };
process.on('uncaughtException', (e) => { console.log('UNCAUGHT', e.stack); results(); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('UNHANDLED', e?.stack ?? e); results(); process.exit(1); });
  // Delta-17: the consent-Yes path after a BACK-DATED first Driving tap (status sheet "N min ago").
  render(h(App, {}), root); await sleep(150);
  const sheetD = () => all((n) => n.localName === 'button' && /Driving/.test(n.textContent) && n.parentNode?.attributes?.class === 'big-status')[0];
  const cases = [
    { name: '8h-break, 15 ago', ago: 15, mk: (tf) => ({ segments: [{ status: 'OFF', start: tf - 700, end: tf - 60, createdAt: 1 }], current: { status: 'ON', since: tf - 60, createdAt: 2 } }), want: 465 },
    ...[40, 25].map((left) => ({ name: `11h, ${left} left, 30 ago`, ago: 30, want: Math.max(0, left - 30), mk: (tf) => {
      const ss = tf - (660 - left) - 120;
      const segs = [{ status: 'OFF', start: ss - 600, end: ss, createdAt: 1 }, { status: 'D', start: ss, end: ss + 400, createdAt: 2 }, { status: 'OFF', start: ss + 400, end: ss + 440, createdAt: 3 }, { status: 'D', start: ss + 440, end: ss + 440 + (660 - left - 400), createdAt: 4 }];
      return { segments: segs, current: { status: 'ON', since: segs[3].end, createdAt: 5 } };
    } })),
  ];
  for (const c of cases) {
    const tf = M(9, 15, 0); setClock(tf);
    setState({ ...base(), speakAlerts: false, speechAsked: false, speakAskOpen: false, ...c.mk(tf) }); await sleep(80); log.length = 0; queue = [];
    A.openSheet({ kind: 'status' }); await sleep(60);
    const ab = button(new RegExp(`^${c.ago} min ago$`)); fire(ab, 'click'); await sleep(40);
    fire(sheetD(), 'click'); await sleep(100);
    ok(`Y. [${c.name}] back-dated first Driving tap: lands back-dated, asks, silent`, getState().current?.status === 'D' && getState().current?.since === tf - c.ago && dialogUp() && log.length === 0, JSON.stringify(log) + ' ' + JSON.stringify(getState().current));
    log.length = 0; queue = [];
    await click(/^Yes, say them$/); await sleep(250);
    const first = said()[0] ?? '';
    const p = parseDrive(first);
    const spokenLeft = p ? p.left : (first === 'Driving. No driving time left.' ? 0 : NaN);
    const positive = said().some((u) => { const q = parseDrive(u); return q && q.left > 0; });
    ok(`Y. [${c.name}] Yes speaks screen drive-left`, spokenLeft === screenDur() && screenDur() === c.want && (c.want > 0 || !positive) && (!p || p.stop === screenStop()), `log ${JSON.stringify(log)}; screen ${screenDur()}m stop ${screenStop()}; oracle ${c.want}`);
  }
  render(null, root);
results(); process.exit(res.some((r) => r[0] === 'FAIL') ? 1 : 0);
