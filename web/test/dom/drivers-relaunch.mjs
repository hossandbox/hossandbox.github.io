// True two-process cold-relaunch pins for drivers1fix (P1, P2, P3, P4a, M6).
// Every stage runs in a SEPARATE Node process with localStorage persisted to JSON on disk
// BEFORE importing store.ts / app.tsx — so module-load bootFromStorage() and restoreUndo()
// execute cold, exactly like a swipe-away relaunch on a real phone.
// (In-page reloadVaultFromStorage() is NEVER used here.)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
};

const STAGE = arg('--stage');
const FILE = arg('--file');
const SEARCH = arg('--search') ?? '';
const SELF = fileURLToPath(import.meta.url);

/* ============================================================ Child process stage runner */
if (STAGE) {
  if (!FILE) { console.error('missing --file'); process.exit(2); }
  await import('./domshim.mjs');
  if (SEARCH) {
    Object.defineProperty(globalThis, 'location', {
      value: { protocol: 'http:', search: SEARCH, href: `http://localhost/${SEARCH}`, pathname: '/' },
      configurable: true,
      writable: true,
    });
  }

  const rawSetTimeout = globalThis.setTimeout;
  const Tms = new Date(2026, 10, 26, 10, 0, 0).getTime();
  const T = Math.floor(Tms / 60000);
  Date.now = () => Tms;
  globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);

  // Hydrate localStorage from disk BEFORE importing store.ts or app.tsx!
  const initData = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  const mem = new Map(Object.entries(initData));
  const flush = () => writeFileSync(FILE, JSON.stringify(Object.fromEntries(mem.entries())), 'utf8');

  globalThis.localStorage = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    get length() { return mem.size; },
    key: (i) => [...mem.keys()][i] ?? null,
  };
  globalThis.confirm = () => true;
  globalThis.alert = (m) => { throw new Error('alert: ' + m); };
  globalThis.__BUILD__ = 'drivers1fix-relaunch';
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.scrollTo = () => {};
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'drivers-relaunch-test', vibrate: () => false },
    configurable: true,
    writable: true,
  });

  // Cold import of Preact, app.tsx, store.ts, drivers.ts.
  const { render, h } = await import('preact');
  const A = await import('../../src/app.tsx');
  const S = await import('../../src/store.ts');
  const D = await import('../../src/drivers.ts');

  const { App, deleteEntry, currentUndo, undoLast, useRealClock, currentSheet, STAY_UNLOCKED_SPLASH_MS } = A;
  const {
    getState, setState, registerDriver, completeLegacyDriverSetup, unlockDriverWithPin, removeDriverProfile,
    lockDriverSession, getActiveDriverName, getUnlockedDriverId, getDriverSummaries,
    setDriverGateBypassForTest, setStayUnlocked, getStayUnlocked, DEFAULT_WEEK_PLAN, DEFAULT_WEEK_LOAD, SIM_KEY,
  } = S;

  setDriverGateBypassForTest(false);
  const sleep = (ms = 40) => new Promise((r) => rawSetTimeout(r, ms));
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(h(App, {}), root);
  await sleep(60);

  const all = (pred, scope = root) => {
    const out = [];
    const walk = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(walk); };
    walk(scope);
    return out;
  };
  const fail = (msg) => { console.error(msg); process.exit(1); };
  const makeRec = (a, b) => [
    { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: a },
    { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: b },
  ];

  if (STAGE === 'solo-a') {
    const r = registerDriver({ name: 'Solo', pin: '5678', recovery: makeRec('Peterbilt', 'Denver'), disclaimerAcked: true });
    if (!r.ok) fail(`solo-a register failed: ${JSON.stringify(r)}`);
    // Exit WITHOUT locking (simulates swipe-away).
    flush();
  } else if (STAGE === 'solo-b') {
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length === 1;
    const navCount = all((n) => n.localName === 'nav').length;
    const unlocked = getUnlockedDriverId();
    const tiles = all((n) => n.localName === 'button' && n.attributes?.['data-driver-id']).map((b) => b.attributes['data-driver-name']);
    if (!splash || navCount !== 0 || unlocked !== null || JSON.stringify(tiles) !== '["Solo"]') {
      fail(`cold launch auto-unlocked or missing splash: ${JSON.stringify({ splash, navCount, unlocked, tiles })}`);
    }
  } else if (STAGE === 'undo-a') {
    const rA = registerDriver({ name: 'Alice', pin: '1357', recovery: makeRec('Peterbilt', 'Memphis'), disclaimerAcked: true });
    const rB = registerDriver({ name: 'Bob', pin: '2468', recovery: makeRec('Kenworth', 'Dallas'), disclaimerAcked: true });
    if (!rA.ok || !rB.ok) fail('undo-a register failed');
    lockDriverSession();
    const aliceId = getDriverSummaries().find((d) => d.name === 'Alice')?.id;
    const u = unlockDriverWithPin(aliceId, '1357');
    if (!u.ok) fail('undo-a unlock Alice failed');
    setState({
      segments: [
        { status: 'OFF', start: T - 900, end: T - 300, createdAt: 10 },
        { status: 'D', start: T - 300, end: T - 60, note: 'ALICE-KEEP-ROW', createdAt: 11 },
        { status: 'ON', start: T - 60, end: T - 10, note: 'ALICE-DEL-ROW', createdAt: 12 },
      ],
      current: { status: 'ON', since: T - 10, createdAt: 13 },
    });
    deleteEntry(getState().segments[2]);
    await sleep(30);
    if (!currentUndo() || !mem.get('hos-sandbox-undo-v1')) fail('undo-a did not arm undo');
    // Swipe-away cold kill: NO lockDriverSession()!
    flush();
  } else if (STAGE === 'undo-b') {
    if (getUnlockedDriverId() !== null) fail('undo-b should start locked on splash');
    const aliceId = getDriverSummaries().find((d) => d.name === 'Alice')?.id;
    const u = unlockDriverWithPin(aliceId, '1357');
    await sleep(40);
    if (!u.ok) fail('undo-b unlock Alice failed');
    if (!currentUndo() || !mem.get('hos-sandbox-undo-v1')) {
      fail(`undo-b lost pending undo on cold relaunch (undo=${!!currentUndo()}, key=${!!mem.get('hos-sandbox-undo-v1')})`);
    }
    const undone = undoLast();
    if (!undone || !getState().segments.some((s) => s.note === 'ALICE-DEL-ROW')) {
      fail(`undo-b undoLast failed to restore deleted row: undone=${undone}, segs=${JSON.stringify(getState().segments)}`);
    }
  } else if (STAGE === 'undo-cross') {
    // Cold-boot from Alice's swipe-away state, unlock Bob FIRST, then unlock Alice.
    const bobId = getDriverSummaries().find((d) => d.name === 'Bob')?.id;
    const aliceId = getDriverSummaries().find((d) => d.name === 'Alice')?.id;
    const uB = unlockDriverWithPin(bobId, '2468');
    await sleep(40);
    if (!uB.ok) fail('undo-cross unlock Bob failed');
    if (currentUndo() !== null || mem.get('hos-sandbox-undo-v1') || getState().segments.length !== 0) {
      fail(`undo-cross bled Alice undo/data into Bob: undo=${!!currentUndo()}, segs=${getState().segments.length}`);
    }
    lockDriverSession();
    const uA = unlockDriverWithPin(aliceId, '1357');
    await sleep(40);
    if (!uA.ok) fail('undo-cross unlock Alice failed');
    if (!currentUndo() || !undoLast() || !getState().segments.some((s) => s.note === 'ALICE-DEL-ROW')) {
      fail('undo-cross lost Alice undo after Bob unlocked first');
    }
  } else if (STAGE === 'sim-a') {
    const rA = registerDriver({ name: 'Alice', pin: '1357', recovery: makeRec('Peterbilt', 'Memphis'), disclaimerAcked: true });
    if (!rA.ok) fail('sim-a register failed');
    setState({
      segments: [
        { status: 'OFF', start: T - 900, end: T - 300, createdAt: 10 },
        { status: 'D', start: T - 300, end: T - 60, note: 'REAL-ROW', createdAt: 11 },
      ],
      current: { status: 'ON', since: T - 60, createdAt: 12 },
      weekPlan: { ...DEFAULT_WEEK_PLAN, loads: [{ ...DEFAULT_WEEK_LOAD, id: 'real-1', label: 'REAL-LOAD', miles: 500 }] },
    });
    // Start simulated clock and make quarantined writes.
    setState({ nowOverride: T + 240 });
    setState((cur) => ({
      segments: [...cur.segments, { status: 'D', start: T + 10, end: T + 180, note: 'SIMWRITE-ROW', createdAt: 90 }],
      weekPlan: { ...DEFAULT_WEEK_PLAN, loads: [{ ...DEFAULT_WEEK_LOAD, id: 'sim-1', label: 'SIM-LOAD', miles: 999 }] },
    }));
    await sleep(30);
    if (!mem.get(SIM_KEY) || getState().nowOverride === null) fail('sim-a did not arm sim quarantine');
    // Swipe-away cold kill: NO lockDriverSession()!
    flush();
  } else if (STAGE === 'sim-b') {
    if (getUnlockedDriverId() !== null) fail('sim-b should start locked');
    const aliceId = getDriverSummaries().find((d) => d.name === 'Alice')?.id;
    const u = unlockDriverWithPin(aliceId, '1357');
    await sleep(40);
    if (!u.ok) fail('sim-b unlock Alice failed');
    if (!mem.get(SIM_KEY) || getState().nowOverride === null) {
      fail(`sim-b destroyed SIM_KEY on cold relaunch (simKey=${!!mem.get(SIM_KEY)}, nowOverride=${getState().nowOverride})`);
    }
    useRealClock();
    await sleep(30);
    const st = getState();
    const hasSim = st.segments.some((s) => s.note === 'SIMWRITE-ROW') || st.weekPlan.loads.some((l) => l.label === 'SIM-LOAD');
    const hasReal = st.segments.some((s) => s.note === 'REAL-ROW') && st.weekPlan.loads.some((l) => l.label === 'REAL-LOAD');
    if (st.nowOverride !== null || hasSim || !hasReal) {
      fail(`sim-b committed sim write to real log: nowOverride=${st.nowOverride}, hasSim=${hasSim}, hasReal=${hasReal}`);
    }
  } else if (STAGE === 'sim-register') {
    // Cold-boot from Alice's sim-active swipe-away state, register Charlie on splash, then unlock Alice.
    const rC = registerDriver({ name: 'Charlie', pin: '9988', recovery: makeRec('Mack', 'Tulsa'), disclaimerAcked: true });
    await sleep(40);
    if (!rC.ok || getActiveDriverName() !== 'Charlie') fail('sim-register Charlie failed');
    if (getState().nowOverride !== null || mem.get(SIM_KEY)) fail('sim-register leaked sim state into Charlie');
    lockDriverSession();
    const aliceId = getDriverSummaries().find((d) => d.name === 'Alice')?.id;
    const uA = unlockDriverWithPin(aliceId, '1357');
    await sleep(40);
    if (!uA.ok) fail('sim-register unlock Alice failed');
    if (!mem.get(SIM_KEY) || getState().nowOverride === null) fail('sim-register wiped Alice sim quarantine');
    useRealClock();
    await sleep(30);
    const st = getState();
    if (st.segments.some((s) => s.note === 'SIMWRITE-ROW') || !st.segments.some((s) => s.note === 'REAL-ROW')) {
      fail('sim-register failed to discard SIMWRITE-ROW after Charlie registration');
    }
  } else if (STAGE === 'legacy-a') {
    // Seeded with a legacy pre-drivers1 save (no undo). Register Bob while Driver 1 stays needsSetup.
    const summaries = getDriverSummaries();
    if (summaries.length !== 1 || !summaries[0].needsSetup) fail(`legacy-a expected migrated Driver 1: ${JSON.stringify(summaries)}`);
    const rB = registerDriver({ name: 'Bob', pin: '2468', recovery: makeRec('Kenworth', 'Dallas'), disclaimerAcked: true });
    if (!rB.ok) fail('legacy-a register Bob failed');
    setState({
      segments: [
        { status: 'OFF', start: T - 600, end: T - 200, createdAt: 20 },
        { status: 'D', start: T - 200, end: T - 50, note: 'BOB-SECRET-ROW', createdAt: 21 },
      ],
      current: { status: 'ON', since: T - 50, createdAt: 22 },
    });
    deleteEntry(getState().segments[1]);
    await sleep(30);
    if (!currentUndo() || !mem.get('hos-sandbox-undo-v1')?.includes('BOB-SECRET-ROW')) fail('legacy-a Bob undo did not arm');
    // Swipe-away cold kill while Bob is active!
    flush();
  } else if (STAGE === 'legacy-b') {
    // Cold-boot with live UNDO_KEY holding Bob's undo. Complete legacy setup for Driver 1 as Lena.
    const legId = getDriverSummaries().find((d) => d.needsSetup)?.id;
    if (!legId) fail('legacy-b missing legacy profile');
    const c = completeLegacyDriverSetup(legId, { name: 'Lena', pin: '7788', recovery: makeRec('Freightliner', 'Chicago'), disclaimerAcked: true });
    await sleep(40);
    if (!c.ok || getActiveDriverName() !== 'Lena') fail(`legacy-b setup failed: ${JSON.stringify(c)}`);
    const rawVault = JSON.parse(mem.get('hos-sandbox-v1') || '{}');
    const lenaProf = rawVault.__drivers?.profiles?.[legId];
    if (currentUndo() !== null || mem.get('hos-sandbox-undo-v1') || lenaProf?.undoRaw !== null) {
      fail(`legacy-b copied another driver's undo into Lena: live=${!!mem.get('hos-sandbox-undo-v1')}, lenaUndo=${lenaProf?.undoRaw}`);
    }
    if (JSON.stringify(lenaProf).includes('BOB-SECRET-ROW')) {
      fail('legacy-b leaked BOB-SECRET-ROW into Lena persisted profile');
    }
    // Now unlock Bob and confirm Bob's undo is still intact!
    lockDriverSession();
    const bobId = getDriverSummaries().find((d) => d.name === 'Bob')?.id;
    const uB = unlockDriverWithPin(bobId, '2468');
    await sleep(40);
    if (!uB.ok || !currentUndo() || !undoLast() || !getState().segments.some((s) => s.note === 'BOB-SECRET-ROW')) {
      fail('legacy-b lost Bob undo after Lena completed legacy setup');
    }
  } else if (STAGE === 'stay-solo-a') {
    // Register 1 driver with stayUnlocked OFF initially, then enable via PIN.
    const r = registerDriver({ name: 'SoloStay', pin: '5678', recovery: makeRec('Peterbilt', 'Denver'), disclaimerAcked: true });
    if (!r.ok) fail(`stay-solo-a register failed: ${JSON.stringify(r)}`);
    // Verify enabling WITHOUT PIN or with WRONG PIN fails!
    const noPin = setStayUnlocked(r.id, true, '');
    const wrongPin = setStayUnlocked(r.id, true, '0000');
    if (noPin.ok || wrongPin.ok || getStayUnlocked()) {
      fail(`stay-solo-a allowed stayUnlocked without valid PIN: ${JSON.stringify({ noPin, wrongPin, flag: getStayUnlocked() })}`);
    }
    const okOn = setStayUnlocked(r.id, true, '5678');
    if (!okOn.ok || !getStayUnlocked()) fail(`stay-solo-a failed to enable with PIN: ${JSON.stringify(okOn)}`);
    setState({
      segments: [{ status: 'OFF', start: T - 600, end: T - 60, note: 'STAY-ROW', createdAt: 5 }],
      current: { status: 'ON', since: T - 60, createdAt: 6 },
    });
    flush();
  } else if (STAGE === 'stay-solo-b') {
    // Immediately on mount, brief splash artwork renders with auto-selected driver (no PIN pad).
    // After STAY_UNLOCKED_SPLASH_MS, lands UNLOCKED straight into the app with SoloStay's data.
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const navCount = all((n) => n.localName === 'nav').length;
    const unlocked = getUnlockedDriverId();
    const active = getActiveDriverName();
    const hasRow = getState().segments.some((s) => s.note === 'STAY-ROW');
    if (splash !== 0 || navCount !== 1 || !unlocked || active !== 'SoloStay' || !hasRow) {
      fail(`stay-solo-b failed to auto-unlock solo driver: ${JSON.stringify({ splash, navCount, unlocked, active, hasRow })}`);
    }
  } else if (STAGE === 'stay-nopin-a') {
    const r = registerDriver({ name: 'NoPinSolo', pin: '5678', recovery: makeRec('Peterbilt', 'Denver'), disclaimerAcked: true });
    if (!r.ok) fail('stay-nopin-a register failed');
    const noPin = setStayUnlocked(r.id, true);
    const badPin = setStayUnlocked(r.id, true, '1111');
    if (noPin.ok || badPin.ok || getStayUnlocked()) {
      fail(`stay-nopin-a should reject missing/wrong PIN: ${JSON.stringify({ noPin, badPin, flag: getStayUnlocked() })}`);
    }
    flush();
  } else if (STAGE === 'stay-nopin-b') {
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const unlocked = getUnlockedDriverId();
    if (splash !== 1 || unlocked !== null) {
      fail(`stay-nopin-b should remain gated at splash: ${JSON.stringify({ splash, unlocked })}`);
    }
  } else if (STAGE === 'stay-add2nd-a') {
    // Wait for solo stayUnlocked to finish auto-unlocking, lock to splash, then add 2nd driver.
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    if (getActiveDriverName() !== 'SoloStay') fail(`stay-add2nd-a expected SoloStay unlocked, got ${getActiveDriverName()}`);
    const soloId = getUnlockedDriverId();
    lockDriverSession();
    await sleep(40);
    const r2 = registerDriver({ name: 'SecondDriver', pin: '2468', recovery: makeRec('Kenworth', 'Dallas'), disclaimerAcked: true });
    if (!r2.ok) fail(`stay-add2nd-a register 2nd driver failed: ${JSON.stringify(r2)}`);
    // B2: registering 2nd driver must clear stayUnlocked on disk AND store must refuse re-enabling with 2 drivers.
    if (getStayUnlocked()) fail('stay-add2nd-a: vault.stayUnlocked was NOT cleared when 2nd driver registered');
    const refused = setStayUnlocked(soloId, true, '5678');
    if (refused.ok || getStayUnlocked()) fail(`stay-add2nd-a: store allowed setStayUnlocked with 2 drivers: ${JSON.stringify(refused)}`);
    flush();
  } else if (STAGE === 'stay-self-erase-a') {
    // B2 scenario 1: Alice enables stayUnlocked, Bob registers (clears stayUnlocked), Bob erases himself -> Alice is solo again.
    const r1 = registerDriver({ name: 'Alice', pin: '5678', recovery: makeRec('Peterbilt', 'Denver'), disclaimerAcked: true });
    if (!r1.ok) fail('stay-self-erase-a Alice register failed');
    const on = setStayUnlocked(r1.id, true, '5678');
    if (!on.ok || !getStayUnlocked()) fail('stay-self-erase-a enable stayUnlocked failed');
    lockDriverSession();
    await sleep(30);
    const r2 = registerDriver({ name: 'Bob', pin: '2468', recovery: makeRec('Kenworth', 'Dallas'), disclaimerAcked: true });
    if (!r2.ok) fail('stay-self-erase-a Bob register failed');
    if (getStayUnlocked()) fail('stay-self-erase-a stayUnlocked stayed true after Bob registered');
    const raw2 = JSON.parse(mem.get('hos-sandbox-v1') || '{}');
    if ('stayUnlocked' in (raw2.__drivers || {})) fail('stay-self-erase-a stayUnlocked still persisted on disk with 2 drivers');
    const rem = removeDriverProfile(r2.id, '2468');
    if (!rem.ok || getDriverSummaries().length !== 1 || getDriverSummaries()[0].name !== 'Alice') {
      fail(`stay-self-erase-a Bob self-erase failed: ${JSON.stringify(rem)}`);
    }
    flush();
  } else if (STAGE === 'stay-corrupt2-a') {
    // B2 scenario 2: 2-driver vault where Bob's profile is corrupted on disk (blank name) so sanitizeVault drops Bob -> Alice left solo.
    // Test BOTH the natural cleared vault AND a tampered disk payload with stayUnlocked: true + corrupt Bob.
    const r1 = registerDriver({ name: 'Alice', pin: '5678', recovery: makeRec('Peterbilt', 'Denver'), disclaimerAcked: true });
    if (!r1.ok) fail('stay-corrupt2-a Alice register failed');
    setStayUnlocked(r1.id, true, '5678');
    lockDriverSession();
    await sleep(30);
    const r2 = registerDriver({ name: 'Bob', pin: '2468', recovery: makeRec('Kenworth', 'Dallas'), disclaimerAcked: true });
    if (!r2.ok) fail('stay-corrupt2-a Bob register failed');
    const parsed = JSON.parse(mem.get('hos-sandbox-v1') || '{}');
    // Blank Bob's name on disk (Opus reproduction), and if --search tamper is passed also force stayUnlocked: true on disk to test sanitizeVault defense-in-depth!
    parsed.__drivers.profiles[r2.id].name = '';
    if (SEARCH === '?tamper=1') parsed.__drivers.stayUnlocked = true;
    mem.set('hos-sandbox-v1', JSON.stringify(parsed));
    mem.delete('hos-sandbox-v1-backup');
    flush();
  } else if (STAGE === 'stay-rearm-gated-b') {
    // Cold relaunch after self-erase or corrupt-profile drop MUST gate at picker/PIN and NEVER auto-unlock Alice!
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const navCount = all((n) => n.localName === 'nav').length;
    const unlocked = getUnlockedDriverId();
    const summaries = getDriverSummaries();
    if (splash !== 1 || navCount !== 0 || unlocked !== null || getStayUnlocked() || summaries.length !== 1 || summaries[0].name !== 'Alice') {
      fail(`stay-rearm-gated-b silently re-armed stayUnlocked! ${JSON.stringify({ splash, navCount, unlocked, flag: getStayUnlocked(), drivers: summaries.map((d) => d.name) })}`);
    }
  } else if (STAGE === 'stay-2drv-b') {
    // Cold relaunch with stayUnlocked=true + 2 drivers MUST still gate at picker/PIN!
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const navCount = all((n) => n.localName === 'nav').length;
    const unlocked = getUnlockedDriverId();
    const tiles = all((n) => n.localName === 'button' && n.attributes?.['data-driver-id']).map((b) => b.attributes['data-driver-name']);
    if (splash !== 1 || navCount !== 0 || unlocked !== null || tiles.length !== 2) {
      fail(`stay-2drv-b auto-unlocked with 2 drivers: ${JSON.stringify({ splash, navCount, unlocked, tiles })}`);
    }
  } else if (STAGE === 'stay-go-unlocked') {
    // ?go=load (or ?go=stopped) with stayUnlocked single-driver lands straight on target!
    await sleep(STAY_UNLOCKED_SPLASH_MS + 160);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const unlocked = getUnlockedDriverId();
    const tab = getState().tab;
    const sh = currentSheet();
    const okLoad = SEARCH === '?go=load' && tab === 'load';
    const okStopped = SEARCH === '?go=stopped' && sh?.kind === 'status';
    if (splash !== 0 || !unlocked || (!okLoad && !okStopped)) {
      fail(`stay-go-unlocked did not land on target: ${JSON.stringify({ SEARCH, splash, unlocked, tab, sh })}`);
    }
  } else if (STAGE === 'stay-go-gated') {
    // ?go=load when stayUnlocked does NOT apply (off or 2 drivers) MUST remain gated at splash!
    await sleep(STAY_UNLOCKED_SPLASH_MS + 160);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const unlocked = getUnlockedDriverId();
    if (splash !== 1 || unlocked !== null) {
      fail(`stay-go-gated bypassed splash gate: ${JSON.stringify({ SEARCH, splash, unlocked, tab: getState().tab })}`);
    }
  } else if (STAGE === 'legacy-nostay-b') {
    // Vault with NO stayUnlocked field on disk behaves identically to today (gates at splash).
    await sleep(STAY_UNLOCKED_SPLASH_MS + 140);
    const splash = all((n) => n.attributes?.['data-splash-screen'] === '1').length;
    const unlocked = getUnlockedDriverId();
    const raw = JSON.parse(mem.get('hos-sandbox-v1') || '{}');
    if (splash !== 1 || unlocked !== null || 'stayUnlocked' in (raw.__drivers || {})) {
      fail(`legacy-nostay-b failed: ${JSON.stringify({ splash, unlocked, hasField: 'stayUnlocked' in (raw.__drivers || {}) })}`);
    }
  } else {
    fail(`unknown stage ${STAGE}`);
  }
  process.exit(0);
}

/* ============================================================ Parent coordinator */
const dir = mkdtempSync(join(tmpdir(), 'c14-drv-relaunch-'));
const res = [];

function runStage(stage, file, extraArgs = []) {
  execFileSync(process.execPath, [SELF, '--stage', stage, '--file', file, ...extraArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

function pin(name, fn) {
  try {
    fn();
    res.push(['PASS', name, '']);
  } catch (e) {
    const errOut = (e?.stderr ? String(e.stderr).trim() : '') || (e?.message || String(e));
    res.push(['FAIL', name, errOut]);
  }
}

try {
  // DRR1: Cold launch with 1 driver never auto-unlocks (catches M6 in true 2-process Node boot).
  pin('DRR1. two-process cold relaunch (1 driver): splash renders locked, never auto-unlocks', () => {
    const f = join(dir, 'solo.json');
    runStage('solo-a', f);
    runStage('solo-b', f);
  });

  // DRR2: P1 — Pending Undo survives a real two-process swipe-away relaunch.
  pin('DRR2. P1 two-process cold relaunch: pending Undo survives swipe-away close and restores deleted row after unlock', () => {
    const f = join(dir, 'undo.json');
    runStage('undo-a', f);
    runStage('undo-b', f);
  });

  // DRR3: P1 cross-driver — Pending Undo survives cold relaunch even when another driver unlocks first.
  pin('DRR3. P1 two-process cold relaunch (cross-driver): Bob unlocking first sees zero undo bleed and Alice undo still restores after switching back', () => {
    const f = join(dir, 'undo.json');
    // Reuses undo.json written by undo-a (untouched by undo-b because undo-b does not flush).
    runStage('undo-cross', f);
  });

  // DRR4: P2 — Simulated-clock quarantine survives a real two-process swipe-away relaunch.
  pin('DRR4. P2 two-process cold relaunch: simulated-clock quarantine survives swipe-away close and Use real clock discards sim writes', () => {
    const f = join(dir, 'sim.json');
    runStage('sim-a', f);
    runStage('sim-b', f);
  });

  // DRR5: P2 + P3 — Registering a new driver after cold restart preserves prior driver's sim quarantine.
  pin('DRR5. P2+P3 two-process cold relaunch: registering Charlie on splash preserves Alice sim quarantine intact', () => {
    const f = join(dir, 'sim.json');
    runStage('sim-register', f);
  });

  // DRR6: P3 — completeLegacyDriverSetup after another driver's cold kill never copies their undo.
  pin('DRR6. P3 two-process cold relaunch: completeLegacyDriverSetup never copies another driver undo into migrated profile and preserves the other driver undo', () => {
    const f = join(dir, 'legacy.json');
    const T = Math.floor(new Date(2026, 10, 26, 10, 0, 0).getTime() / 60000);
    const legacySeed = {
      'hos-sandbox-v1': JSON.stringify({
        segments: [{ status: 'OFF', start: T - 800, end: T - 200, note: 'LEGACY-ROW', createdAt: 1 }],
        tentative: [],
        current: { status: 'ON', since: T - 200, createdAt: 2 },
        disclaimerAcked: true,
      }),
    };
    writeFileSync(f, JSON.stringify(legacySeed), 'utf8');
    runStage('legacy-a', f);
    runStage('legacy-b', f);
  });

  // DRR7: Receptionfix Scope 1 — stayUnlocked single-driver cold relaunch lands unlocked (no picker tap, no PIN).
  pin('DRR7. receptionfix two-process cold relaunch: stayUnlocked + 1 driver lands unlocked without picker tap or PIN', () => {
    const f = join(dir, 'stay-solo.json');
    runStage('stay-solo-a', f);
    runStage('stay-solo-b', f);
  });

  // DRR8: Receptionfix Scope 1 — enabling stayUnlocked without PIN (or wrong PIN) fails and relaunch stays gated.
  pin('DRR8. receptionfix two-process cold relaunch: enabling stayUnlocked without valid PIN fails and relaunch stays gated', () => {
    const f = join(dir, 'stay-nopin.json');
    runStage('stay-nopin-a', f);
    runStage('stay-nopin-b', f);
  });

  // DRR9: Receptionfix Scope 1 — adding a 2nd driver while stayUnlocked is ON restores gating on next cold relaunch.
  pin('DRR9. receptionfix two-process cold relaunch: adding a 2nd driver while stayUnlocked is ON restores picker+PIN gating on next relaunch', () => {
    const f = join(dir, 'stay-solo.json');
    runStage('stay-add2nd-a', f);
    runStage('stay-2drv-b', f);
  });

  // DRR10: Receptionfix Scope 1 — shortcut deep-links (?go=load, ?go=stopped) land straight in when stayUnlocked applies.
  pin('DRR10. receptionfix two-process cold relaunch: ?go=load and ?go=stopped land straight on target when stayUnlocked single-driver applies', () => {
    const f = join(dir, 'stay-go.json');
    runStage('stay-solo-a', f);
    runStage('stay-go-unlocked', f, ['--search', '?go=load']);
    runStage('stay-go-unlocked', f, ['--search', '?go=stopped']);
  });

  // DRR11: Receptionfix Scope 1 — shortcut deep-link (?go=load) still gates at splash when stayUnlocked is OFF or 2+ drivers exist.
  pin('DRR11. receptionfix two-process cold relaunch: ?go=load stays gated at splash when stayUnlocked is OFF or 2 drivers exist', () => {
    const fOff = join(dir, 'stay-nopin.json');
    const fTwo = join(dir, 'stay-solo.json'); // has 2 drivers + stayUnlocked=true from DRR9
    runStage('stay-go-gated', fOff, ['--search', '?go=load']);
    runStage('stay-go-gated', fTwo, ['--search', '?go=load']);
  });

  // DRR12: Receptionfix Scope 1 — legacy vault save with NO stayUnlocked field behaves identically to today (gates at splash).
  pin('DRR12. receptionfix two-process cold relaunch: legacy save with no stayUnlocked field gates identically to today', () => {
    const f = join(dir, 'solo.json'); // written by DRR1 solo-a with no stayUnlocked key
    runStage('legacy-nostay-b', f);
  });

  // DRR13: B2 — 2nd driver self-erase never silently re-arms stayUnlocked for Driver 1 on cold relaunch.
  pin('DRR13. B2 two-process cold relaunch: after 2nd driver erases themselves, cold relaunch gates at picker/PIN (no auto-unlock)', () => {
    const f = join(dir, 'b2-self-erase.json');
    runStage('stay-self-erase-a', f);
    runStage('stay-rearm-gated-b', f);
  });

  // DRR14: B2 — corrupt 2nd profile dropped by sanitizeVault never silently re-arms stayUnlocked on cold relaunch (natural & tampered disk).
  pin('DRR14. B2 two-process cold relaunch: after corrupt 2nd profile drops to 1 driver, cold relaunch gates at picker/PIN (no auto-unlock)', () => {
    const f1 = join(dir, 'b2-corrupt-natural.json');
    runStage('stay-corrupt2-a', f1);
    runStage('stay-rearm-gated-b', f1);
    const f2 = join(dir, 'b2-corrupt-tampered.json');
    runStage('stay-corrupt2-a', f2, ['--search', '?tamper=1']);
    runStage('stay-rearm-gated-b', f2);
  });
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

let fails = 0;
for (const [status, name, info] of res) {
  if (status !== 'PASS') fails++;
  console.log(`${status} ${name}${info ? ' — ' + info : ''}`);
}
console.log(`\ndrivers-relaunch: ${res.length - fails}/${res.length} pins pass`);
if (fails) process.exit(1);
