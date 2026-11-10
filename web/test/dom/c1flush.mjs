// Capstone C1 fix round, D5 (Verify-C1 §6): the behavioural half of the lever-deferral
// pin. The real App is mounted in the minimal DOM with effects running. The Timeline
// card must render WITHOUT lever chips on the first pass — the levers are computed in
// an idle-scheduled effect, off the render path — and the chips must appear once that
// scheduled computation has flushed. (The structural half — exactly one computeLevers
// call site, inside the effect, never in a useMemo — is pinned in test/smoke.mjs's
// C1 block.) Fixtures are the C1 block's own seed / V2 / V3, on the New York clock.
import './domshim.mjs';
const rawSetTimeout = globalThis.setTimeout;
// compress the app's long timers (minute ticker etc.) as the yesback lane does
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.confirm = () => true;
globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'c1flush';

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const LEV = await import('../../src/levers.ts');
const { evaluate } = await import('../../../engine/src/index.ts');
const { App } = A;
const { setState, INITIAL_STATE: INIT, allSegments } = S;
A.setLaunchNotice?.(false);
const sleep = (ms) => new Promise((r) => rawSetTimeout(r, ms));
const res = [];
const ok = (n, c, i = '') => { res.push([c ? 'PASS' : 'FAIL', n, i]); };

const CD = (day, hh, m = 0) => Math.floor(new Date(2026, 10, day, hh, m).getTime() / 60000);
const NY = { ...INIT.config, timeZone: 'America/New_York' };
const mk = (over) => ({ ...INIT, config: NY, disclaimerAcked: true, historyAcknowledged: true, ...over });
const evOf = (s, now) => evaluate(allSegments(s, now), { asOf: now, config: s.config });

// The audit's standard seed (Appendix A), as in the smoke C1 block.
const seedSegs = [
  { status: 'OFF', start: CD(8, 5, 40), end: CD(8, 7, 40) }, { status: 'SB', start: CD(8, 7, 40), end: CD(8, 15, 40) },
  { status: 'ON', start: CD(8, 15, 40), end: CD(8, 16, 25) }, { status: 'D', start: CD(8, 16, 25), end: CD(8, 19, 10) },
  { status: 'OFF', start: CD(8, 19, 10), end: CD(8, 19, 40) }, { status: 'ON', start: CD(8, 19, 40), end: CD(8, 21, 55) }];
const seedNow = CD(9, 3, 4);
const seedState = mk({ segments: seedSegs, current: { status: 'D', since: CD(8, 21, 55) }, nowOverride: seedNow, tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true });
const seedL2 = LEV.computeLevers(seedState, seedNow, evOf(seedState, seedNow), 'log').find((l) => l.id === 'L2');

// V2: resting off duty with no time — the L3 state.
const v2State = mk({ segments: [
  { status: 'OFF', start: CD(8, 20), end: CD(9, 6) }, { status: 'D', start: CD(9, 6), end: CD(9, 10) },
  { status: 'OFF', start: CD(9, 10), end: CD(9, 13) }, { status: 'D', start: CD(9, 13), end: CD(9, 17) },
  { status: 'ON', start: CD(9, 17), end: CD(9, 20) }], current: { status: 'OFF', since: CD(9, 20) }, nowOverride: CD(9, 21, 0), tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true });
const v2Now = CD(9, 21, 0);
const v2L3 = LEV.computeLevers(v2State, v2Now, evOf(v2State, v2Now), 'log').find((l) => l.id === 'L3');

// V3: the cycle binds — the L4 state.
const v3Segs = [];
for (let d = 2; d <= 8; d++) v3Segs.push(
  { status: 'ON', start: CD(d, 5), end: CD(d, 6) }, { status: 'D', start: CD(d, 6), end: CD(d, 14) }, { status: 'ON', start: CD(d, 14), end: CD(d, 15) },
  { status: 'OFF', start: CD(d, 15), end: CD(d + 1, 5) });
const v3State = mk({ segments: v3Segs, current: { status: 'ON', since: CD(9, 5) }, nowOverride: CD(9, 6, 0), tab: 'now', drivingView: false, nowCard: 'timeline', nowCardAsked: true });
const v3Now = CD(9, 6, 0);
const v3L4 = LEV.computeLevers(v3State, v3Now, evOf(v3State, v3Now), 'log').find((l) => l.id === 'L4');

if (!seedL2 || !v2L3 || !v3L4) { console.log('FAIL fixture setup: seed/V2/V3 must each offer their lever'); process.exit(1); }

const root = document.createElement('div'); document.body.appendChild(root);
const text = () => root.textContent;
// The pin is that the chips LAND once the idle-scheduled computation flushes — so
// poll for the landing with a generous deadline instead of asserting after a fixed
// sleep: on this shared VM the shim's after-paint effect flush can take well over
// a fixed 250 ms to reach the effect body, and a fixed sleep would grade the VM's
// timer latency, not the app's behaviour. Never landing inside the deadline fails.
const waitFor = async (fn) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > 4000) return false; await sleep(50); } return true; };

// Stage 1 — the seed on the Timeline: card first, chips after the flush.
setState(seedState);
render(h(App, {}), root);
ok('D5. first render shows the Timeline card', text().includes('STOP'));
ok('D5. first render carries no lever chip', !text().includes(LEV.leverTitle(seedL2)));
ok('D5. the L2 chip lands after the idle flush', await waitFor(() => text().includes(LEV.leverTitle(seedL2))));

// Stage 2 — V2 resting: the L3 chip and the sleeper comeback lane (which hangs off
// the lever's sbAt) both arrive with the flush.
setState(v2State);
ok('D5. the L3 chip lands after the idle flush', await waitFor(() => text().includes(LEV.leverTitle(v2L3))));
ok('D5. the sleeper comeback lane lands with the lever', text().includes(A.laneValue(v2L3.sbAt, v2Now)));

// Stage 2b (D6) — still resting on V2, advance the clock with no new entry: at
// 23:00 a 7h sleeper from 23:00 ends 06:00, no sooner than off duty, so the L3
// chip and its sleeper lane must go (the fix round's resting key dropped the
// minute, freezing both at the 21:00 computation).
setState({ nowOverride: CD(9, 23, 0) });
ok('D6. resting: the L3 chip goes when the clock has made it untrue', await waitFor(() => !text().includes(LEV.leverTitle(v2L3))));
ok('D6. resting: the sleeper comeback lane goes with it', !text().includes(A.laneValue(v2L3.sbAt, CD(9, 23, 0))));

// Stage 3 — V3 cycle: the L4 chip arrives the same way.
setState(v3State);
ok('D5. the L4 chip lands after the idle flush', await waitFor(() => text().includes(LEV.leverTitle(v3L4))));

render(null, root);
for (const [r, n, i] of res) console.log(`${r} ${n}${i ? ' — ' + i : ''}`);
console.log(res.some((r) => r[0] === 'FAIL') ? 'C1FLUSH FAIL' : 'C1FLUSH OK');
process.exit(res.some((r) => r[0] === 'FAIL') ? 1 : 0);
