// Capstone C2 — "Preview & one-bar Split": the behavioural pin lane (audit §2.3, §2.5, §3 M4,
// §2.8 item 3). The real App is mounted in the minimal DOM (domshim) with effects running and
// a controlled wall clock; every control is driven through its own listeners. Every pin reports
// on its own line (a soft collector), so one run on the untouched base shows each pin red.
// Exit 1 when any pin fails.
//
// Fixtures are the audit's standard seed (Appendix A) on the New York terminal clock, as in the
// smoke C1 block and the c1flush lane, with the driver parked: "the preview is offered once he
// has tapped a non-driving status, e.g. On duty at the truck stop" (§2.3) — so the record runs
// D 21:55–03:04 and the current status is On duty from 03:04.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
// The snap-back's 10 s idle timer is compressed 25× (10 000 ms → 400 ms) so the lane can watch it
// fire and NOT fire; the minute ticker and other long timers are compressed as the other lanes do.
const IDLE_SCALE = 25;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms >= 5000 ? ms / IDLE_SCALE : ms, ...a);
const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);
const T = CD(9, 3, 4);
Date.now = () => T * 60000 + 5000; // the real wall clock reads Mon 03:04 (no simulated clock)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true; globalThis.alert = (m) => { throw new Error('alert: ' + m); }; globalThis.__BUILD__ = 'c2scrub';
const spoken = [];
globalThis.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u.text); }, getVoices: () => [] };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const E = await import('../../../engine/src/index.ts');
const { App, setLaunchNotice, openSheet, currentSheet, tapStatus } = A;
const { setState, getState, INITIAL_STATE: INIT, allSegments, dur, clock, DEFAULT_SPLIT } = S;
setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const pin = async (name, f) => { try { const r = await f(); res.push([r === true ? 'PASS' : 'FAIL', name, r === true ? '' : String(r)]); } catch (e) { res.push(['FAIL', name, 'threw: ' + (e && e.message || e)]); } };
const root = document.createElement('div'); document.body.appendChild(root);
const text = () => root.textContent;

const NY = { ...INIT.config, timeZone: 'America/New_York' };
const mk = (over) => ({ ...INIT, config: NY, disclaimerAcked: true, historyAcknowledged: true, tzChosen: true, zoneAck: null, speechAsked: true, alertsOn: true, speakAlerts: true, ...over });
const seedSegs = [
  { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 7, 40) }, { status: 'SB', start: CD(8, 7, 40), end: CD(8, 15, 40) },
  { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
  { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }];
const parked = () => mk({ segments: [...seedSegs, { status: 'D', start: CD(8, 21, 55), end: T }], current: { status: 'ON', since: T }, nowOverride: null, tab: 'now', drivingView: true, nowCard: 'timeline', nowCardAsked: true });
const driving = (over = {}) => mk({ segments: seedSegs, current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: null, tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true, ...over });

// DOM helpers (the adjuststart lane's)
const all = (pred, from = root) => { const out = []; const w = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(w); }; w(from); return out; };
const cls = (n) => (n.attributes?.class || '').split(/\s+/);
const byClass = (c, from) => all((n) => n.nodeType === 1 && cls(n).includes(c), from);
const fire = (node, type, extra = {}) => { for (const t of [type, type[0].toUpperCase() + type.slice(1)]) { const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra }; for (const f of node.listeners[t] ?? []) f.call(node, ev); } };
const disabled = (n) => n.attributes.disabled !== undefined && n.attributes.disabled !== 'false';
const button = (re) => all((n) => n.localName === 'button' && re.test(n.textContent))[0];
const click = async (re, wait = 40) => { const b = typeof re === 'object' && re.nodeType ? re : button(re); if (!b) throw new Error('no button ' + re); if (!disabled(b)) fire(b, 'click'); await sleep(wait); return b; };
// A seed clears any preview left by the pin before through its own control (the store skips a
// write that changes nothing, so an identical seed is not itself a snap-back trigger).
const seed = async (st) => { openSheet(null); await sleep(20); const b = all((n) => n.localName === 'button' && n.textContent === 'Back to now')[0]; if (b) { fire(b, 'click'); await sleep(30); } setState(st); await sleep(80); };
const previewCard = () => all((n) => n.nodeType === 1 && n.attributes['data-preview'] !== undefined)[0] || null;
const previewAt = () => { const c = previewCard(); return c ? Number(c.attributes['data-preview']) : null; };
const enter = async () => { await click(/^Preview a later time$/); return previewAt(); };
// Step toward a target; stop at a refused (disabled) step rather than idling past the snap-back.
const stepTo = async (target) => {
  let guard = 200;
  const go = async (re) => { const b = button(re); if (!b || disabled(b)) return false; await click(b, 15); return true; };
  while (previewAt() !== null && previewAt() < target && guard-- && await go(/^\+15 min$/));
  while (previewAt() !== null && previewAt() > target && guard-- && await go(/^−15 min$/));
  await sleep(30); return previewAt();
};
const hhmm = (m) => clock(m, false);
const heroValues = (from = root) => byClass('hero-value', from).map((n) => n.textContent);
const stored = () => JSON.stringify([...mem.entries()].sort());
// the export minus its own wall-clock stamp (`exported` reads new Date(), not the record)
const exported = (st) => { const o = JSON.parse(S.exportState(st)); delete o.exported; return JSON.stringify(o); };

render(h(App, {}), root); await sleep(150);

/* ---------------- M16: entry, steppers, bounds ---------------- */
await pin('S1. parked on the Timeline: a tap on the axis track enters preview, snapped to the first quarter hour after now', async () => {
  await seed(parked());
  if (previewCard()) return 'a preview must not be up before any tap';
  const track = byClass('taxis-track')[0];
  if (!track) return 'no axis track on the Timeline card';
  fire(track, 'click', { clientX: 0 }); await sleep(40);
  const at = previewAt();
  return at === CD(9, 3, 15) || `entered at ${at === null ? 'nothing' : hhmm(at)}, want 03:15`;
});
await pin('S2. the preview band carries −15 / +15 / Back to now; each step moves T by exactly 15 minutes', async () => {
  await seed(parked()); await enter();
  const t0 = previewAt();
  await click(/^\+15 min$/); const t1 = previewAt();
  await click(/^\+15 min$/); const t2 = previewAt();
  await click(/^−15 min$/); const t3 = previewAt();
  if (!button(/^Back to now$/)) return 'no Back to now';
  return (t1 - t0 === 15 && t2 - t1 === 15 && t3 === t1) || `${t0}→${t1}→${t2}→${t3}`;
});
await pin('S3. rail 6, bounded: −15 is refused at the first quarter after now (T must stay > now); +15 stops at now + 24h', async () => {
  await seed(parked()); await enter();
  const minus = button(/^−15 min$/);
  if (!disabled(minus)) return '−15 must be disabled when T − 15 ≤ now';
  await click(minus); if (previewAt() !== CD(9, 3, 15)) return 'a refused step moved T';
  const last = Math.floor((T + 1440) / 15) * 15;
  await stepTo(last + 60);
  const plus = button(/^\+15 min$/);
  if (previewAt() !== last) return `stepped to ${previewAt() - T} min after now, want ${last - T}`;
  return (disabled(plus) && previewAt() - T <= 1440) || '+15 must be disabled at the 24h bound';
});

/* ---------------- M16: the audit's pinned engine values (standard seed) ---------------- */
const at = async (hh, mm, day = 9) => { await seed(parked()); await enter(); return stepTo(CD(day, hh, mm)); };
for (const [hh, mm, want] of [[4, 0, '1h 40m'], [5, 0, '40m'], [5, 30, '10m']]) {
  await pin(`S4. [Driving] at ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}: ${want} left, stop by 05:40`, async () => {
    const t = await at(hh, mm);
    if (t !== CD(9, hh, mm)) return 'could not reach T';
    const c = previewCard();
    const pressed = all((n) => n.localName === 'button' && n.attributes['aria-pressed'] === 'true', c).map((n) => n.textContent);
    if (!pressed.includes('Driving')) return `[Driving] must be the default in state A (pressed: ${pressed})`;
    const vals = heroValues(c);
    if (vals.length !== 1 || vals[0] !== want) return `hero ${JSON.stringify(vals)}`;
    if (!c.textContent.includes('05:40')) return 'stop by 05:40 missing';
    if (!c.textContent.includes(`At ${hhmm(t)}, if you drive until then:`)) return 'the frame sentence must lead the numbers';
    return true;
  });
}
await pin('S5. [Driving] at 05:40: 0m (05:40 is off the 15-minute grid the controls snap to, so the preview\'s own evaluation is pinned there; the card is pinned at 05:45, the first frame past the wall)', async () => {
  const r = A.previewEval(parked(), T, CD(9, 5, 40), 'drive');
  if (r.ev.driveNow !== 0 || r.violations.length !== 0) return `05:40: driveNow ${r.ev.driveNow}, violations ${r.violations.length}`;
  if (r.ev.mustStopBy !== CD(9, 5, 40)) return 'stop by must stay 05:40';
  const t = await at(5, 45); if (t !== CD(9, 5, 45)) return 'could not reach 05:45';
  const c = previewCard(); const vals = heroValues(c);
  return (vals.length === 1 && vals[0] === '0m' && c.textContent.includes('Over the 14-hour window')) || JSON.stringify(vals);
});
await pin('S6. [Driving] at 06:00: 0m with 2 violations — the hazard block and "Over the 14-hour window", never a positive number', async () => {
  await at(6, 0); const c = previewCard();
  const vals = heroValues(c);
  if (vals.length !== 1 || vals[0] !== '0m') return `hero ${JSON.stringify(vals)}`;
  if (!c.textContent.includes('Over the 14-hour window')) return 'missing "Over the 14-hour window"';
  if (!/(^|\D)2 limits broken by then/.test(c.textContent)) return 'must name 2 violations';
  if (!byClass('taxis-hazard', c).length) return 'no hazard block';
  // and the oracle: the record extended by the driving row, evaluated at T, has exactly two violations after now
  const ev = E.evaluate([...allSegments(parked(), T), { status: 'D', start: T, end: CD(9, 6), tentative: true }], { asOf: CD(9, 6), config: NY });
  return ev.violations.filter((v) => v.start >= T).length === 2 || 'engine disagrees';
});
await pin('S7. [Staying on duty] is offered beside [Driving]; staying parked on duty at 05:00 leaves the 14 ending 05:40', async () => {
  await at(5, 0); await click(/^Staying on duty$/);
  const c = previewCard();
  if (!c.textContent.includes('At 05:00, if you stay on duty:')) return 'frame: ' + c.textContent.slice(0, 120);
  const vals = heroValues(c);
  return (vals.length === 1 && vals[0] === '40m' && c.textContent.includes('05:40')) || JSON.stringify(vals);
});

/* ---------------- M16 rails ---------------- */
await pin('R1a. rail 1: status Driving (the Details peek) — no scrubber; a tap on the axis opens Why instead', async () => {
  await seed(driving());
  if (button(/^Preview a later time$/)) return 'the scrubber door must not be offered while Driving';
  const track = byClass('taxis-track')[0];
  if (!track) return 'no axis on the peek';
  fire(track, 'click', { clientX: 200 }); await sleep(40);
  if (previewCard()) return 'a preview entered while Driving';
  const sh = currentSheet(); openSheet(null); await sleep(30);
  return sh?.kind === 'why' || `sheet: ${JSON.stringify(sh)}`;
});
await pin('R1b. rail 1: the driving view (status D, big view on) contains no axis, no lever chip and no preview band', async () => {
  await seed(driving({ drivingView: true }));
  return (!byClass('taxis').length && !byClass('lever').length && !byClass('pv-band').length && !previewCard()) || 'driving view leaked: ' + text().slice(0, 100);
});
await pin('R2. rail 2: every preview frame carries the band "PREVIEW hh:mm — not now", the dashed preview card, and the rest of Now inert + dimmed', async () => {
  await seed(parked()); await enter(); await stepTo(CD(9, 5));
  const c = previewCard();
  const band = byClass('pv-band', c)[0];
  if (!band || band.textContent !== 'PREVIEW 05:00 — not now') return `band "${band?.textContent}"`;
  if (!cls(c).includes('hero') || !cls(c).includes('preview')) return 'card classes ' + c.attributes.class;
  const rest = byClass('now-rest')[0];
  if (!rest || !cls(rest).includes('pv-dim') || rest.attributes.inert === undefined) return 'the rest of Now must be inert + .pv-dim';
  if (!byClass('dock', rest).length && !all((n) => n.localName === 'button' && /^(Off duty|Sleeper|On duty|Driving)$/.test(n.textContent.trim()), rest).length) return 'the dock must sit inside the inert wrapper';
  if (byClass('lever').length) return 'no lever chips during a preview';
  // every number rendered while previewing sits under the band: the only hero-value on Now is the card's
  return heroValues().length === heroValues(c).length || 'a real-now number is on screen beside the preview';
});
await pin('R2b. rail 2: when the preview ends, the band, the dashed card and the inert wrapper all go', async () => {
  await seed(parked()); await enter(); await click(/^Back to now$/);
  const rest = byClass('now-rest')[0];
  return (!previewCard() && !byClass('pv-band').length && rest && rest.attributes.inert === undefined && !cls(rest).includes('pv-dim')) || 'preview residue';
});
await pin('R3a. rail 3: 10 s after the last interaction it snaps back — and not before (timer compressed 25×)', async () => {
  await seed(parked()); await enter();
  await sleep(250); await click(/^\+15 min$/, 10); // an interaction restarts the count
  await sleep(250);
  if (!previewCard()) return 'snapped back before 10 s had passed since the last interaction';
  await sleep(350);
  return !previewCard() || 'still previewing 10 s after the last interaction';
});
const snapCase = (name, act) => pin(name, async () => {
  await seed(parked()); await enter(); await stepTo(CD(9, 4));
  if (!previewCard()) return 'setup: no preview';
  await act(); await sleep(60);
  return !previewCard() || 'still previewing';
});
await snapCase('R3b. rail 3: [Back to now]', () => click(/^Back to now$/));
await snapCase('R3c. rail 3: a tab change', async () => { setState({ tab: 'log' }); await sleep(40); setState({ tab: 'now' }); });
await snapCase('R3d. rail 3: visibilitychange → hidden', async () => { document.visibilityState = 'hidden'; for (const f of document.listeners.visibilitychange ?? []) f({ type: 'visibilitychange' }); await sleep(20); document.visibilityState = 'visible'; });
await snapCase('R3e. rail 3: any sheet opening', async () => { openSheet({ kind: 'why' }); await sleep(30); openSheet(null); });
await snapCase('R3f. rail 3: a status tap', () => tapStatus('OFF'));
await snapCase('R3g. rail 3: any store write', () => setState({ theme: getState().theme === 'day' ? 'night' : 'day' }));
await pin('R4. rail 4: scrubbing writes nothing — the store object, every storage key and the export are byte-identical', async () => {
  await seed(parked()); await sleep(60);
  const s0 = getState(), m0 = stored(), x0 = exported(s0);
  await enter(); await click(/^\+15 min$/); await click(/^Staying on duty$/); await click(/^Driving$/); await stepTo(CD(9, 6)); await click(/^Back to now$/);
  await sleep(60);
  if (getState() !== s0) return 'the store was written';
  if (stored() !== m0) return 'storage changed';
  if (exported(getState()) !== x0) return 'the export changed';
  return !Object.keys(getState()).some((k) => /preview/i.test(k)) || 'a preview key is in State';
});
await pin('R5. rail 5: no speech and no alert fires during a preview, even one past the wall (alerts read App\'s own evaluation)', async () => {
  await seed(parked()); spoken.length = 0;
  await enter(); await stepTo(CD(9, 6)); await sleep(80);
  const alerts = byClass('alertbox').length;
  await click(/^Back to now$/);
  return (spoken.length === 0 && alerts === 0) || `spoken ${JSON.stringify(spoken)}, alert boxes ${alerts}`;
});
await pin('R7. rail 7: the simulated clock is allowed, and both banners show — SIM app-wide, PREVIEW on the card, T bounded from the simulated now', async () => {
  const sim = CD(9, 1, 0);
  await seed({ ...parked(), segments: [...seedSegs, { status: 'D', start: CD(8, 21, 55), end: sim }], current: { status: 'ON', since: sim }, nowOverride: sim });
  const t = await enter();
  const ok = text().includes('Simulated clock.') && byClass('pv-band').length === 1 && t === CD(9, 1, 15);
  await click(/^Back to now$/);
  A.useRealClock?.(); await sleep(40);
  return ok || `sim ${text().includes('Simulated clock.')}, band ${byClass('pv-band').length}, T ${t && hhmm(t)}`;
});

/* ---------------- P7: the one-bar Split Lab ---------------- */
const lab = (split = DEFAULT_SPLIT) => mk({ segments: seedSegs, current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: null, tab: 'split', planReturn: 'plan', drivingView: false, nowCard: 'timeline', nowCardAsked: true, split: { ...split } });
const strip = () => byClass('split-now-after')[0];
const pairCard = () => all((n) => n.localName === 'section' && cls(n).includes('card') && /^Does it pair\?/.test(n.textContent))[0];
const block = (k) => all((n) => n.localName === 'button' && n.attributes['data-block'] === k)[0];
const logOf = () => JSON.stringify({ segments: getState().segments, current: getState().current, tentative: getState().tentative });
await pin('P1. default draft on the standard seed: the strip REPLACES the pair sentence with the ✕ form (C5-A), verbatim', async () => {
  await seed(lab());
  const t = strip()?.textContent ?? '';
  const want = '✕ Pairs, but this plan runs over: 14-hour window by 2h 54m · 11-hour driving by 1h 54m';
  return t.startsWith(want) || `strip "${t.slice(0, 140)}"`;
});
await pin('P2. the strip is TimeAxis in plan mode: four tappable blocks, the 14-hour band (05:40 now → Tue 03:04), the pair bracket, the overruns hatched in place', async () => {
  await seed(lab());
  const s = strip();
  if (!byClass('taxis-plan', s).length) return 'no plan-mode axis in the strip';
  const keys = all((n) => n.localName === 'button' && n.attributes['data-block'] !== undefined, s).map((n) => n.attributes['data-block']);
  if (keys.join() !== 'b1,dwell,drive,b2') return 'blocks ' + keys;
  if (!s.textContent.includes('14 ends 05:40 now') || !s.textContent.includes('Tue 03:04 with pair')) return 'band: ' + byClass('plan-band', s)[0]?.textContent;
  if (!s.textContent.includes('pair ✓ 3h + 7h = 10h')) return 'bracket: ' + byClass('plan-bracket', s)[0]?.textContent;
  const hatch = byClass('plan-hatch', s);
  return hatch.length === 2 || `hatches ${hatch.length}`;
});
await pin('P3. S11: "Does it pair?" is bad-toned while the plan breaks a limit, good-toned once it pairs clean', async () => {
  await seed(lab());
  if (!cls(pairCard()).includes('bad')) return 'card ' + pairCard()?.attributes.class;
  await seed(lab({ ...DEFAULT_SPLIT, drive: 60 }));
  const t = strip().textContent;
  if (!/^Your 14 ends .* with this pair · \d+h \d\dm drive after/.test(t)) return 'clean strip: ' + t.slice(0, 120);
  return cls(pairCard()).includes('good') || 'card ' + pairCard()?.attributes.class;
});
await pin('P4. tap a block → its sheet: status toggle (breaks only), 56px −60/−15/+15/+60 steppers, the exact number box; draft only', async () => {
  await seed(lab()); const log0 = logOf();
  await click(block('b1'));
  if (currentSheet()?.kind !== 'splitblock') return 'no block sheet';
  for (const l of ['−60', '−15', '+15', '+60']) if (!all((n) => n.localName === 'button' && n.textContent === l).length) return 'missing stepper ' + l;
  if (!button(/^Sleeper$/) || !button(/^Off duty$/)) return 'Break 1 must carry its status toggle';
  await click(/^\+15$/); if (getState().split.b1 !== 195) return 'b1 after +15: ' + getState().split.b1;
  await click(/^−60$/); if (getState().split.b1 !== 135) return 'b1 after −60: ' + getState().split.b1;
  await click(/^Sleeper$/); if (getState().split.b1s !== 'SB') return 'toggle did not set b1s';
  const box = all((n) => n.localName === 'input' && /Break 1, type an exact value/.test(n.attributes['aria-label'] || ''))[0];
  if (!box) return 'no exact box';
  box.value = '200'; fire(box, 'input'); await sleep(40);
  if (getState().split.b1 !== 200) return 'exact 200 → ' + getState().split.b1;
  box.value = '9999'; fire(box, 'input'); await sleep(40);
  if (getState().split.b1 !== 200 || !text().includes('your entry was not applied')) return 'an out-of-range entry must be refused, visibly';
  openSheet(null); await sleep(30);
  await click(block('drive'));
  if (button(/^Sleeper$/)) { openSheet(null); return 'the drive block has no status toggle'; }
  openSheet(null); await sleep(30);
  return logOf() === log0 || 'the log moved';
});
await pin('M4a. every ✗ gets its fix in the block sheet: "Shorten the drive to …" sets drive to the engine\'s driveNow at the end of Break 1 + dwell', async () => {
  await seed(lab()); const log0 = logOf();
  const s0 = getState();
  const base = allSegments(s0, T).filter((x) => !x.tentative);
  const t0 = Math.max(T, ...base.map((x) => x.end));
  const lead = [{ status: 'OFF', start: t0, end: t0 + 180, tentative: true }, { status: 'ON', start: t0 + 180, end: t0 + 210, tentative: true }];
  const room = E.evaluate([...base, ...lead], { asOf: t0 + 210, config: NY }).driveNow;
  await click(block('drive'));
  const fix = button(/^Shorten the drive to /);
  if (!fix) { openSheet(null); return 'no fix in the drive sheet'; }
  if (fix.textContent !== `Shorten the drive to ${dur(room)}`) { openSheet(null); return fix.textContent; }
  await click(fix);
  const d = getState().split.drive;
  openSheet(null); await sleep(30);
  if (d !== room) return `drive ${d}, engine room ${room}`;
  if (!text().includes('Draft changed.')) return 'the fix must offer the draft undo';
  return logOf() === log0 || 'a fix wrote to the log';
});
await pin('M4b. the checklist fixes: short break, sleeper 7h, total 10h — each sets the audit\'s exact value', async () => {
  await seed(lab({ b1: 60, b1s: 'OFF', dwell: 30, drive: 60, b2: 300, b2s: 'OFF' }));
  const c = pairCard();
  const names = all((n) => n.localName === 'button' && cls(n).includes('fix'), c).map((n) => n.textContent);
  const want = ['Make the shorter break 2h', 'Make Break 2 sleeper, 7h', `Add ${dur(600 - 60 - 300)} to Break 1`];
  for (const w of want) if (!names.includes(w)) return `missing "${w}" in ${JSON.stringify(names)}`;
  await click(/^Make the shorter break 2h$/); if (getState().split.b1 !== 120) return 'short2h: b1 ' + getState().split.b1;
  await click(/^Make Break 2 sleeper, 7h$/); if (getState().split.b2s !== 'SB' || getState().split.b2 !== 420) return 'sleeper7: ' + JSON.stringify(getState().split);
  return true;
});
await pin('U1. one-level draft undo, shared: example split → Undo restores; a fix after the example owns the slot (one level); a stepper retires it', async () => {
  const mine = { b1: 60, b1s: 'OFF', dwell: 15, drive: 120, b2: 240, b2s: 'OFF' };
  await seed(lab(mine)); A.clearSplitDraftUndo();
  await click(/^Try an example split$/);
  if (JSON.stringify(getState().split) !== JSON.stringify(DEFAULT_SPLIT)) return 'example not loaded';
  await click(/^Undo$/);
  if (JSON.stringify(getState().split) !== JSON.stringify(mine)) return 'undo did not restore the draft';
  if (button(/^Undo$/)) return 'one level: the undo must be spent';
  await click(/^Try an example split$/);
  await click(block('drive')); await click(/^Shorten the drive to /); openSheet(null); await sleep(30);
  const afterFix = JSON.stringify(getState().split);
  await click(/^Undo$/);
  if (JSON.stringify(getState().split) !== JSON.stringify(DEFAULT_SPLIT)) return 'undo after a fix must restore the pre-fix draft (the example)';
  if (button(/^Undo$/)) return 'only one level';
  if (afterFix === JSON.stringify(DEFAULT_SPLIT)) return 'setup: the fix changed nothing';
  await click(/^Try an example split$/); await click(block('b2')); await click(/^\+15$/); openSheet(null); await sleep(30);
  return !button(/^Undo$/) || 'an ordinary edit must retire the undo (N2)';
});

render(null, root);
for (const [r, n, i] of res) console.log(`${r} ${n}${i ? ' — ' + i : ''}`);
const fails = res.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${res.length - fails} pass, ${fails} fail`);
console.log(fails ? 'C2SCRUB FAIL' : 'C2SCRUB OK');
process.exit(fails ? 1 : 0);
