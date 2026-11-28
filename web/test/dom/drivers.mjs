// Multi-driver startup, registration, PIN, recovery, separation, cooldown, and legacy migration pins (drivers1 + drivers1fix).
// Runs with driverGateBypassForTest = FALSE the entire time, exercising the real startup splash gate.
import './domshim.mjs';

const rawSetTimeout = globalThis.setTimeout;
let Tms = new Date(2026, 10, 26, 10, 0, 0).getTime();
Date.now = () => Tms;
globalThis.setTimeout = (f, ms = 0, ...a) => rawSetTimeout(f, ms > 30000 ? 10 : ms, ...a);

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};
globalThis.confirm = () => true;
globalThis.alert = (m) => { throw new Error('alert: ' + m); };
globalThis.__BUILD__ = 'drivers1fix';
globalThis.requestAnimationFrame = (cb) => { cb(0); return 1; };
globalThis.cancelAnimationFrame = () => {};
globalThis.scrollTo = () => {};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'drivers-dom-test', vibrate: () => false },
  configurable: true,
  writable: true,
});

const { render, h } = await import('preact');
const A = await import('../../src/app.tsx');
const S = await import('../../src/store.ts');
const D = await import('../../src/drivers.ts');

const { App, downloadExport, deleteEntry, currentUndo, setPrintReport, useRealClock } = A;
const {
  getState, setState, exportState, reloadVaultFromStorage, lockDriverSession,
  registerDriver, unlockDriverWithPin, checkDriverRecoveryAnswers, getActiveDriverName,
  getDriverSummaries, getPinCooldownRemainingMs, getRecoveryCooldownRemainingMs,
  setDriverGateBypassForTest, DEFAULT_WEEK_PLAN, DEFAULT_WEEK_LOAD, SIM_KEY,
} = S;

// Explicitly verify bypass is OFF for this entire lane.
setDriverGateBypassForTest(false);

const sleep = (ms = 40) => new Promise((r) => rawSetTimeout(r, ms));
const root = document.createElement('div');
document.body.appendChild(root);

const all = (pred, scope = root) => {
  const out = [];
  const walk = (n) => { if (pred(n)) out.push(n); n.childNodes.forEach(walk); };
  walk(scope);
  return out;
};
const fire = (node, type, extra = {}) => {
  for (const t of [type, type[0].toUpperCase() + type.slice(1)]) {
    const ev = { type: t, target: node, currentTarget: node, preventDefault() {}, stopPropagation() {}, ...extra };
    for (const f of node.listeners[t] ?? []) f.call(node, ev);
  }
};
const setInput = async (node, val) => {
  node.value = val;
  node.attributes.value = val;
  fire(node, 'input', { target: node });
  fire(node, 'change', { target: node });
  await sleep(15);
};
const clickNode = async (node, ms = 35) => {
  if (!node) throw new Error('clickNode: null node');
  fire(node, 'click');
  await sleep(ms);
};
const enterPin = async (digits) => {
  for (const ch of digits) {
    const btn = all((n) => n.localName === 'button' && n.attributes?.['data-pin-digit'] === ch)[0];
    if (!btn) throw new Error(`missing pin digit button ${ch}`);
    await clickNode(btn, 15);
  }
  await sleep(40);
};

const ALLOWED_KEYS = new Set(['hos-sandbox-v1', 'hos-sandbox-v1-backup', 'hos-sandbox-v1-sim', 'hos-sandbox-undo-v1']);
const checkOnlyAllowedKeys = () => {
  const extra = [...mem.keys()].filter((k) => !ALLOWED_KEYS.has(k));
  return extra.length === 0 ? true : `unexpected localStorage keys: ${extra.join(', ')}`;
};

/**
 * P4(c) storage security scan:
 *  - Case-insensitive, quote-free scan of primary and backup saves for every recovery answer.
 *  - Verifies stored recovery questions match curated REMINDER_QUESTIONS (no answer leak in `question`).
 *  - Verifies PINs do not appear in stored JSON outside random hex hashes, nor embedded in salts.
 *  - Verifies every salt is 32-char lowercase hex and all salts across all secrets/drivers are strictly distinct.
 */
function scanVaultSecrets(expectedDrivers) {
  const rawPrimary = mem.get('hos-sandbox-v1') || '';
  const rawBackup = mem.get('hos-sandbox-v1-backup') || '';
  const blobs = [
    ['hos-sandbox-v1', rawPrimary],
    ...(rawBackup ? [['hos-sandbox-v1-backup', rawBackup]] : []),
  ];
  const parsed = JSON.parse(rawPrimary);
  const profiles = Object.values(parsed.__drivers?.profiles || {});
  const allSalts = [];

  for (const exp of expectedDrivers) {
    const prof = profiles.find((p) => p.name === exp.name);
    if (!prof) return `missing profile ${exp.name} in vault`;
    if (!prof.pin || prof.pin.alg !== 'sha256-2048' || !/^[0-9a-f]{32}$/.test(prof.pin.salt) || !/^[0-9a-f]{64}$/.test(prof.pin.hash)) {
      return `malformed pin hash for ${exp.name}`;
    }
    if (prof.pin.salt === exp.pin || prof.pin.salt.startsWith(exp.pin) || prof.pin.salt.endsWith(exp.pin)) {
      return `PIN leaked into salt for ${exp.name}: ${prof.pin.salt}`;
    }
    allSalts.push(prof.pin.salt);

    if (!Array.isArray(prof.recovery) || prof.recovery.length < 2) return `missing recovery items for ${exp.name}`;
    for (const r of prof.recovery) {
      if (r.alg !== 'sha256-2048' || !/^[0-9a-f]{32}$/.test(r.salt) || !/^[0-9a-f]{64}$/.test(r.hash)) {
        return `malformed recovery hash for ${exp.name}`;
      }
      const curated = D.REMINDER_QUESTIONS.find((q) => q.id === r.qId);
      if (!curated || r.question !== curated.text) {
        return `stored question mutated or leaked for ${exp.name}: ${r.question}`;
      }
      allSalts.push(r.salt);
    }

    // Case-insensitive, quote-free scan across both primary & backup for all recovery answers.
    for (const ans of exp.answers) {
      const norm = D.normalizeRecoveryAnswer(ans);
      for (const [kName, blob] of blobs) {
        if (blob.toLowerCase().includes(norm)) {
          return `plaintext recovery answer "${norm}" found in ${kName}`;
        }
      }
    }
  }

  // Every secret must get a unique random salt (catches constant-salt mutant M2).
  if (new Set(allSalts).size !== allSalts.length) {
    return `duplicate salt detected across ${allSalts.length} secrets (unique=${new Set(allSalts).size})`;
  }

  // Catch PIN embedded anywhere in salt (M2c) or elsewhere in JSON outside hex hash fields.
  const pinInSaltHits = expectedDrivers.filter((exp) => {
    const prof = profiles.find((p) => p.name === exp.name);
    return prof?.pin?.salt?.includes(exp.pin);
  });
  if (expectedDrivers.length >= 2 && pinInSaltHits.length === expectedDrivers.length) {
    return `PIN found inside salt across all ${pinInSaltHits.length} drivers`;
  }
  const probePin = '5913';
  const probes = [D.createHashedSecret(probePin), D.createHashedSecret(probePin), D.createHashedSecret(probePin)];
  if (new Set(probes.map((p) => p.salt)).size !== 3 || new Set(probes.map((p) => p.hash)).size !== 3) {
    return 'createHashedSecret produced duplicate salt or hash';
  }
  if (probes.every((p) => p.salt.includes(probePin))) {
    return 'createHashedSecret embedded PIN inside salt';
  }
  const stripped = rawPrimary.replace(/"(?:hash|salt)":"[0-9a-f]+"/g, '"stripped":""');
  for (const exp of expectedDrivers) {
    if (stripped.includes(exp.pin)) {
      return `plaintext PIN ${exp.pin} found in hos-sandbox-v1 outside hash/salt`;
    }
  }
  return true;
}

const res = [];
const pin = async (name, fn) => {
  try {
    const out = await fn();
    res.push([out === true ? 'PASS' : 'FAIL', name, out === true ? '' : String(out)]);
  } catch (e) {
    res.push(['FAIL', name, 'threw: ' + (e && e.message ? e.message : String(e))]);
  }
};

// Mount fresh app with empty localStorage.
render(h(App, {}), root);
await sleep(80);

/* ---- DR1: Fresh launch renders artwork startup splash (no DOM logo/title duplication), empty prompt, Add a driver, and SW/CSS asset contract ---- */
await pin('DR1. fresh launch (0 drivers): artwork splash renders with no DOM logo/title duplication, empty prompt, Add a driver, hidden app chrome, and valid CSS/SW assets', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const splash = all((n) => n.attributes?.['data-splash-screen'] === '1')[0];
  const dupLogo = all((n) => n.localName === 'img' && (n.attributes?.src === './icon-512.png' || /\bsplash-logo\b/.test(n.attributes?.class ?? ''))).length;
  const dupTitle = all((n) => n.localName === 'h1' && (/\bsplash-title\b/.test(n.attributes?.class ?? '') || n.textContent.trim() === 'Clock 14')).length;
  const emptyCard = all((n) => n.attributes?.['data-driver-empty'] === '1')[0];
  const addBtn = all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1')[0];
  const hasAppChrome = all((n) => n.localName === 'nav' || n.localName === 'header').length > 0;
  const css = readFileSync('public/styles.css', 'utf8');
  const sw = readFileSync('public/sw.js', 'utf8');
  const cssOk = /\.splash-app\s*\{[\s\S]*?background-color:\s*#020614[\s\S]*?url\('\.\/splash-1080x1920\.webp'\)[\s\S]*?background-position:\s*top center[\s\S]*?background-repeat:\s*no-repeat[\s\S]*?background-size:\s*cover/.test(css)
    && css.includes("url('./splash-1179x2556.webp')")
    && /min-height:\s*100dvh/.test(css);
  const assetsOk = existsSync('public/splash-1080x1920.webp') && existsSync('public/splash-1179x2556.webp');
  const swOk = sw.includes("'./splash-1080x1920.webp'") && sw.includes("'./splash-1179x2556.webp'") && /r\.ok && sameOrigin/.test(sw);
  return (!!splash && splash.attributes?.['data-splash-view'] === 'picker' && splash.attributes?.['aria-label'] === 'Clock 14'
    && dupLogo === 0 && dupTitle === 0 && !!emptyCard && !!addBtn && !hasAppChrome && cssOk && assetsOk && swOk)
    || JSON.stringify({ splash: !!splash, view: splash?.attributes?.['data-splash-view'], dupLogo, dupTitle, emptyCard: !!emptyCard, addBtn: !!addBtn, hasAppChrome, cssOk, assetsOk, swOk });
});

/* ---- DR2: Registration requires disclosure acceptance + 4-digit PIN + 2 recovery questions; P4(c) secret/salt scan ---- */
await pin('DR2. registration: requires disclosure, confirmed 4-digit PIN, and 2 recovery questions; P4(c) plaintext & per-secret salt scan clean', async () => {
  const noDisc = registerDriver({
    name: 'NoDisc',
    pin: '1111',
    recovery: [
      { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Kenworth' },
      { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Dallas' },
    ],
    disclaimerAcked: false,
  });
  const badPin = registerDriver({
    name: 'BadPin',
    pin: '12',
    recovery: [
      { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Kenworth' },
      { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Dallas' },
    ],
    disclaimerAcked: true,
  });
  const oneRec = registerDriver({
    name: 'OneRec',
    pin: '1234',
    recovery: [{ qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Kenworth' }],
    disclaimerAcked: true,
  });
  if (noDisc.ok || badPin.ok || oneRec.ok) return `expected store guards to refuse invalid registrations: ${JSON.stringify({ noDisc, badPin, oneRec })}`;

  const addBtn = all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1')[0];
  await clickNode(addBtn);
  const nameInput = all((n) => n.localName === 'input' && n.attributes?.['data-reg-name'] === '1')[0];
  await setInput(nameInput, 'Marcus');
  const form = all((n) => n.localName === 'form')[0];
  fire(form, 'submit');
  await sleep(40);

  const dlg = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title')[0];
  if (!dlg) return 'registration did not show mandatory disclosure popup';
  const dlgText = dlg.textContent;
  const dlgBtns = all((n) => n.localName === 'button', dlg);
  if (!/Clock 14 — HOS What-If Planner\. It is not an ELD/.test(dlgText) || dlgBtns.length !== 1) {
    return `unexpected disclosure modal content/buttons: ${dlgBtns.length}`;
  }
  await clickNode(dlgBtns[0], 250);

  await enterPin('1357');
  await enterPin('9999');
  const mismatchErr = all((n) => n.attributes?.['data-pin-error'] === '1')[0];
  if (!mismatchErr || !/didn't match/i.test(mismatchErr.textContent)) return 'PIN confirmation mismatch did not show error';
  await enterPin('1357');

  const a0 = all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '0')[0];
  const a1 = all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '1')[0];
  await setInput(a0, 'Peterbilt');
  await setInput(a1, 'Memphis');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(60);

  const inApp = all((n) => n.localName === 'nav').length === 1 && all((n) => n.attributes?.['data-splash-screen'] === '1').length === 0;
  const noLingeringDisc = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length === 0;
  const secScan = scanVaultSecrets([{ name: 'Marcus', pin: '1357', answers: ['Peterbilt', 'Memphis'] }]);
  const keysOk = checkOnlyAllowedKeys();
  return (inApp && noLingeringDisc && getActiveDriverName() === 'Marcus' && secScan === true && keysOk === true)
    || JSON.stringify({ inApp, noLingeringDisc, name: getActiveDriverName(), secScan, keysOk });
});

/* ---- DR3: Splash on relaunch with 1 driver and 2+ drivers; P4(c) distinct salts & zero plaintext across 2 drivers ---- */
await pin('DR3. startup splash with 1 & 2+ drivers, second-driver disclosure, and P4(c) cross-driver distinct-salt & plaintext scan', async () => {
  reloadVaultFromStorage();
  await sleep(60);
  const splash1 = all((n) => n.attributes?.['data-splash-screen'] === '1').length === 1;
  const tiles1 = all((n) => n.localName === 'button' && n.attributes?.['data-driver-id']);
  const add1 = all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1').length === 1;
  if (!splash1 || tiles1.length !== 1 || tiles1[0].attributes['data-driver-name'] !== 'Marcus' || !add1) {
    return `1-driver splash failed: splash=${splash1}, tiles=${tiles1.length}, add=${add1}`;
  }

  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1')[0]);
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-reg-name'] === '1')[0], 'Elena');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);
  const dlg2 = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title')[0];
  if (!dlg2) return 'second driver registration did not show disclosure popup';
  await clickNode(all((n) => n.localName === 'button', dlg2)[0], 250);
  await enterPin('2468');
  await enterPin('2468');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '0')[0], 'Kenworth');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '1')[0], 'Dallas');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(60);
  if (getActiveDriverName() !== 'Elena') return `expected Elena unlocked, got ${getActiveDriverName()}`;

  // Cross-driver secret scan across primary & backup (6 distinct salts, no plaintext PINs or answers).
  const secScan = scanVaultSecrets([
    { name: 'Marcus', pin: '1357', answers: ['Peterbilt', 'Memphis'] },
    { name: 'Elena', pin: '2468', answers: ['Kenworth', 'Dallas'] },
  ]);
  if (secScan !== true) return `cross-driver secret scan failed: ${secScan}`;

  reloadVaultFromStorage();
  await sleep(60);
  const tiles2 = all((n) => n.localName === 'button' && n.attributes?.['data-driver-id']).map((b) => b.attributes['data-driver-name']);
  const add2 = all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1').length === 1;
  return (JSON.stringify(tiles2) === JSON.stringify(['Marcus', 'Elena']) && add2)
    || JSON.stringify({ tiles2, add2 });
});

/* ---- DR4: Wrong PIN does not enter; right PIN enters cleanly with no recurring disclosure popup ---- */
await pin('DR4. wrong PIN does not enter; right PIN enters cleanly and disclosure does not reappear on ordinary launch', async () => {
  const marcusTile = all((n) => n.localName === 'button' && n.attributes?.['data-driver-name'] === 'Marcus')[0];
  await clickNode(marcusTile);
  await enterPin('0000');
  const stillLocked = all((n) => n.attributes?.['data-pin-screen'] === '1').length === 1
    && all((n) => n.localName === 'nav').length === 0
    && getActiveDriverName() === '';
  const errEl = all((n) => n.attributes?.['data-pin-error'] === '1')[0];
  if (!stillLocked || !errEl || !/Wrong PIN/i.test(errEl.textContent)) {
    return `wrong PIN check failed: stillLocked=${stillLocked}, err=${errEl?.textContent}`;
  }
  await enterPin('1357');
  await sleep(50);
  const unlocked = getActiveDriverName() === 'Marcus' && all((n) => n.localName === 'nav').length === 1;
  const noDisc = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length === 0;
  const aboutText = all((n) => n.localName === 'section' && (n.attributes?.class || '').includes('page-settings'))[0]?.textContent || '';
  const aboutReadable = /Clock 14 — HOS What-If Planner\. It is not an ELD/.test(aboutText);
  return (unlocked && noDisc && aboutReadable) || JSON.stringify({ unlocked, noDisc, aboutReadable });
});

/* ---- DR5: Forgot-PIN recovery resets PIN after answering reminder questions ---- */
await pin('DR5. Forgot PIN: wrong answers rejected; right answers (case/whitespace insensitive) reset PIN and old PIN stops working', async () => {
  lockDriverSession();
  await sleep(40);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-driver-name'] === 'Marcus')[0]);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-forgot-pin'] === '1')[0]);

  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-recovery-answer'] === '0')[0], 'Volvo');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-recovery-answer'] === '1')[0], 'Atlanta');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);
  const wrongRecAlert = all((n) => n.attributes?.role === 'alert')[0];
  if (!wrongRecAlert || !/don't match/i.test(wrongRecAlert.textContent)) {
    return `wrong recovery answers not rejected: ${wrongRecAlert?.textContent}`;
  }

  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-recovery-answer'] === '0')[0], '  peterbilt  ');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-recovery-answer'] === '1')[0], 'MEMPHIS');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);

  await enterPin('4321');
  await enterPin('4321');
  await sleep(50);
  if (getActiveDriverName() !== 'Marcus') return `recovery did not unlock Marcus (got ${getActiveDriverName()})`;

  reloadVaultFromStorage();
  await sleep(40);
  const mId = getDriverSummaries().find((d) => d.name === 'Marcus')?.id;
  const oldRes = unlockDriverWithPin(mId, '1357');
  const newRes = unlockDriverWithPin(mId, '4321');
  return (!oldRes.ok && newRes.ok && getActiveDriverName() === 'Marcus')
    || JSON.stringify({ oldRes, newRes, active: getActiveDriverName() });
});

/* ---- DR6: Complete per-driver separation + P4(b) active-driver-only export isolation ---- */
await pin('DR6. per-driver separation + P4(b) export contains ONLY the active driver data (zero other-driver logs, vault, or hashes)', async () => {
  const T = Math.floor(Tms / 60000);
  const marcusSegs = [
    { status: 'OFF', start: T - 900, end: T - 300, createdAt: 10 },
    { status: 'D', start: T - 300, end: T - 60, note: 'Marcus Run', createdAt: 11 },
    { status: 'ON', start: T - 60, end: T - 10, note: 'Marcus Dock', createdAt: 12 },
  ];
  setState({
    segments: marcusSegs,
    current: { status: 'ON', since: T - 10, createdAt: 13 },
    config: { ...getState().config, cycle: '60/7', dayStartHour: 4, dayStartMinute: 30, timeZone: 'America/New_York' },
    theme: 'night',
    themeChosen: true,
    weekPlan: {
      ...DEFAULT_WEEK_PLAN,
      loads: [{ ...DEFAULT_WEEK_LOAD, id: 'm-1', label: 'Marcus Memphis Load', miles: 620 }],
    },
  });
  deleteEntry(getState().segments[2]);
  await sleep(40);
  if (!currentUndo()) return 'Marcus undo did not arm';

  let dlName = '';
  const origDoc = globalThis.document;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  try {
    globalThis.document = { ...origDoc, createElement: () => ({ href: '', download: '', click() {} }) };
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    dlName = downloadExport(getState());
  } finally {
    globalThis.document = origDoc;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  }
  setPrintReport({ days: 3, generatedAt: T, generatedAtMs: Tms });
  await sleep(40);
  const marcusPdfText = all((n) => n.attributes?.['data-print-report'] !== undefined)[0]?.textContent || '';
  setPrintReport(null);
  await sleep(30);
  if (!/^clock14-marcus-\d{4}-\d{2}-\d{2}\.json$/.test(dlName) || !/DriverMarcus/.test(marcusPdfText)) {
    return `Marcus export filename/PDF missing driver name: file=${dlName}, pdf=${marcusPdfText.slice(0, 140)}`;
  }

  // Switch to Elena mid-session via the active driver strip on Now.
  const stripBtn = all((n) => n.localName === 'button' && n.attributes?.['data-driver-strip'] === '1')[0];
  if (!stripBtn || !/Marcus/.test(stripBtn.textContent)) return 'missing active driver strip for Marcus on Now';
  await clickNode(stripBtn);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-driver-name'] === 'Elena')[0]);
  await enterPin('2468');
  await sleep(50);

  const elenaState = getState();
  const elenaUndo = currentUndo();
  const elenaDom = root.textContent;
  const elenaClean = elenaState.segments.length === 0
    && elenaState.current === null
    && elenaState.config.cycle === '70/8'
    && elenaState.config.dayStartHour === 0
    && elenaState.config.dayStartMinute === 0
    && elenaState.weekPlan.loads.length === 0
    && elenaUndo === null
    && !elenaDom.includes('Marcus Memphis Load')
    && !elenaDom.includes('Marcus Run');
  if (!elenaClean) {
    return `Marcus data bled into Elena: ${JSON.stringify({ segs: elenaState.segments.length, cfg: elenaState.config, loads: elenaState.weekPlan.loads, undo: !!elenaUndo })}`;
  }

  // Write Elena's own data and assert Elena's export contains ONLY Elena's data (P4b, catches M7).
  setState({
    segments: [{ status: 'OFF', start: T - 700, end: T - 100, note: 'Elena Rest', createdAt: 50 }],
    current: { status: 'OFF', since: T - 100, createdAt: 51 },
    config: { ...elenaState.config, cycle: '70/8', dayStartHour: 6, dayStartMinute: 15, timeZone: 'America/Los_Angeles' },
    weekPlan: {
      ...DEFAULT_WEEK_PLAN,
      loads: [{ ...DEFAULT_WEEK_LOAD, id: 'e-1', label: 'Elena Dallas Run', miles: 410 }],
    },
  });
  const elenaExportRaw = exportState(getState());
  const elenaExportLow = elenaExportRaw.toLowerCase();
  const elenaExportObj = JSON.parse(elenaExportRaw);
  const elenaForbidden = ['marcus', 'marcus run', 'marcus dock', 'marcus memphis load', '"m-1"', '__drivers', 'sha256-2048', '"salt"', '"hash"', '"recovery"'];
  const elenaLeak = elenaForbidden.find((s) => elenaExportLow.includes(s));
  if (elenaExportObj.driverName !== 'Elena' || !elenaExportRaw.includes('Elena Rest') || !elenaExportRaw.includes('Elena Dallas Run') || elenaLeak) {
    return `Elena export isolation failed: driverName=${elenaExportObj.driverName}, leak=${elenaLeak}`;
  }

  // Bug-report payload (exportState(s, '')) omits driverName and still leaks nothing of Marcus.
  const bugRaw = exportState(getState(), '');
  const bugObj = JSON.parse(bugRaw);
  if ('driverName' in bugObj || bugRaw.toLowerCase().includes('marcus') || bugRaw.includes('__drivers')) {
    return `anonymous bug-report export leaked driverName or other driver: ${bugRaw.slice(0, 160)}`;
  }

  // Switch back to Marcus (PIN 4321) and assert Marcus's export contains ONLY Marcus's data (P4b, catches M7).
  lockDriverSession();
  await sleep(40);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-driver-name'] === 'Marcus')[0]);
  await enterPin('4321');
  await sleep(50);

  const marcusExportRaw = exportState(getState());
  const marcusExportLow = marcusExportRaw.toLowerCase();
  const marcusExportObj = JSON.parse(marcusExportRaw);
  const marcusForbidden = ['elena', 'elena rest', 'elena dallas run', '"e-1"', '__drivers', 'sha256-2048', '"salt"', '"hash"', '"recovery"'];
  const marcusLeak = marcusForbidden.find((s) => marcusExportLow.includes(s));
  if (marcusExportObj.driverName !== 'Marcus' || !marcusExportRaw.includes('Marcus Run') || !marcusExportRaw.includes('Marcus Memphis Load') || marcusLeak) {
    return `Marcus export isolation failed: driverName=${marcusExportObj.driverName}, leak=${marcusLeak}`;
  }

  const back = getState();
  const marcusIntact = back.segments.length === 2
    && back.segments[1].note === 'Marcus Run'
    && back.config.cycle === '60/7'
    && back.config.dayStartHour === 4
    && back.config.dayStartMinute === 30
    && back.config.timeZone === 'America/New_York'
    && back.theme === 'night'
    && back.weekPlan.loads.length === 1
    && back.weekPlan.loads[0].label === 'Marcus Memphis Load'
    && currentUndo() !== null;
  const keysOk = checkOnlyAllowedKeys();
  return (marcusIntact && keysOk === true) || JSON.stringify({ marcusIntact, keysOk, segs: back.segments, cfg: back.config, loads: back.weekPlan.loads, hasUndo: !!currentUndo() });
});

/* ---- DR7 (P3): Registering a new driver from splash must NOT wipe previous driver's stashed undo or sim snapshot ---- */
await pin('DR7. P3: registering a new driver while locked preserves previous driver stashed undo AND sim quarantine intact', async () => {
  const T = Math.floor(Tms / 60000);
  // Part A: Marcus has a pending undo from DR6. Lock Marcus, register Zed, unlock Marcus -> undo must survive!
  if (!currentUndo()) return 'precondition failed: Marcus undo not armed';
  lockDriverSession();
  await sleep(40);
  if (mem.get('hos-sandbox-undo-v1')) return 'lockDriverSession did not clear live undo key';

  const zedRes = registerDriver({
    name: 'Zed',
    pin: '5566',
    recovery: [
      { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Volvo' },
      { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Omaha' },
    ],
    disclaimerAcked: true,
  });
  await sleep(50);
  if (!zedRes.ok || getActiveDriverName() !== 'Zed') return `Zed registration failed: ${JSON.stringify(zedRes)}`;
  if (currentUndo() !== null) return 'Marcus undo bled into newly registered Zed';

  lockDriverSession();
  await sleep(40);
  const mId = getDriverSummaries().find((d) => d.name === 'Marcus')?.id;
  if (!unlockDriverWithPin(mId, '4321').ok) return 'failed to unlock Marcus after Zed registration';
  await sleep(40);
  const undoPresent = currentUndo() !== null;
  if (!undoPresent) return 'registering Zed wiped Marcus stashed undo';

  // Part B: Arm simulated clock + sim write on Marcus, lock Marcus, register Quinn, unlock Marcus -> sim quarantine must survive!
  setState({ nowOverride: T + 180 });
  setState((cur) => ({
    segments: [...cur.segments, { status: 'D', start: T + 10, end: T + 120, note: 'MARCUS-SIM-WRITE', createdAt: 99 }],
  }));
  await sleep(30);
  if (!mem.get(SIM_KEY)) return 'precondition failed: Marcus sim quarantine not armed';

  lockDriverSession();
  await sleep(40);
  if (mem.get(SIM_KEY)) return 'lockDriverSession did not clear live sim key';

  const quinnRes = registerDriver({
    name: 'Quinn',
    pin: '6677',
    recovery: [
      { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Mack' },
      { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Tulsa' },
    ],
    disclaimerAcked: true,
  });
  await sleep(50);
  if (!quinnRes.ok || getActiveDriverName() !== 'Quinn') return `Quinn registration failed: ${JSON.stringify(quinnRes)}`;
  if (getState().nowOverride !== null || mem.get(SIM_KEY)) return 'Marcus sim state bled into newly registered Quinn';

  lockDriverSession();
  await sleep(40);
  if (!unlockDriverWithPin(mId, '4321').ok) return 'failed to unlock Marcus after Quinn registration';
  await sleep(40);
  const simPresent = !!mem.get(SIM_KEY);
  useRealClock();
  await sleep(30);
  const afterReal = getState();
  const simDiscarded = afterReal.nowOverride === null
    && !afterReal.segments.some((s) => s.note === 'MARCUS-SIM-WRITE')
    && afterReal.segments.length === 2
    && afterReal.segments[1].note === 'Marcus Run';
  return (undoPresent && simPresent && simDiscarded)
    || JSON.stringify({ undoPresent, simPresent, simDiscarded, segs: afterReal.segments });
});

/* ---- DR8 (Cooldown): 5 wrong PINs -> 30s cooldown, escalates on further misses, honest UI, right PIN enters after cooldown & resets ---- */
await pin('DR8. PIN cooldown: 5 wrong PINs enforce 30s wait (blocks even right PIN, per-driver), escalates to 60s on 6th miss, right PIN enters after cooldown and resets counter', async () => {
  lockDriverSession();
  await sleep(40);
  const marcusId = getDriverSummaries().find((d) => d.name === 'Marcus')?.id;
  const elenaId = getDriverSummaries().find((d) => d.name === 'Elena')?.id;
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-driver-name'] === 'Marcus')[0]);

  // First 4 misses: rejected as wrong PIN, NO cooldown yet, keypad stays enabled.
  for (const bad of ['0000', '0001', '0002', '0003']) {
    await enterPin(bad);
    if (getPinCooldownRemainingMs(marcusId) !== 0) return `cooldown triggered early on miss ${bad}`;
  }
  const padBtnsBefore5 = all((n) => n.localName === 'button' && n.attributes?.['data-pin-digit']);
  if (padBtnsBefore5.some((b) => b.attributes?.disabled !== undefined)) return 'keypad disabled before 5th miss';

  // 5th consecutive miss: triggers 30-second cooldown!
  await enterPin('0004');
  const wait5 = getPinCooldownRemainingMs(marcusId);
  const err5 = all((n) => n.attributes?.['data-pin-error'] === '1')[0]?.textContent || '';
  const padDisabled5 = all((n) => n.localName === 'button' && n.attributes?.['data-pin-digit']).every((b) => 'disabled' in b.attributes);
  if (wait5 !== 30_000 || !/30 seconds/i.test(err5) || !padDisabled5) {
    return `5th miss cooldown failed: wait5=${wait5}, err5=${err5}, padDisabled5=${padDisabled5}`;
  }

  // During cooldown: even the CORRECT PIN (4321) MUST be refused!
  const duringCooldown = unlockDriverWithPin(marcusId, '4321');
  if (duringCooldown.ok || !duringCooldown.cooldownMs || getActiveDriverName() !== '') {
    return `correct PIN bypassed active cooldown: ${JSON.stringify(duringCooldown)}`;
  }
  // Per-driver isolation: Elena has zero cooldown.
  if (getPinCooldownRemainingMs(elenaId) !== 0) return 'Marcus cooldown bled into Elena';

  // Advance 30s -> cooldown expires -> 6th miss escalates (doubles) to 60 seconds!
  Tms += 30_000;
  const miss6 = unlockDriverWithPin(marcusId, '0005');
  const wait6 = getPinCooldownRemainingMs(marcusId);
  if (miss6.ok || wait6 !== 60_000 || !/60 seconds/i.test(miss6.error)) {
    return `6th miss escalation failed: miss6=${JSON.stringify(miss6)}, wait6=${wait6}`;
  }
  // Halfway through 60s wait, correct PIN is STILL blocked.
  Tms += 30_000;
  const midWait = unlockDriverWithPin(marcusId, '4321');
  if (midWait.ok || getPinCooldownRemainingMs(marcusId) !== 30_000) {
    return `correct PIN bypassed escalated 60s cooldown at 30s: ${JSON.stringify(midWait)}`;
  }

  // After full 60s cooldown expires: correct PIN enters cleanly AND resets the counter!
  Tms += 30_000;
  const afterWait = unlockDriverWithPin(marcusId, '4321');
  await sleep(50);
  if (!afterWait.ok || getActiveDriverName() !== 'Marcus') {
    return `correct PIN after cooldown failed to enter: ${JSON.stringify(afterWait)}`;
  }

  // Verify counter was reset: 1 wrong PIN after locking should NOT immediately trigger a cooldown.
  lockDriverSession();
  await sleep(40);
  const oneMissAfterReset = unlockDriverWithPin(marcusId, '9999');
  if (oneMissAfterReset.ok || getPinCooldownRemainingMs(marcusId) !== 0 || /Wait/i.test(oneMissAfterReset.error)) {
    return `cooldown counter did not reset after successful entry: ${JSON.stringify(oneMissAfterReset)}`;
  }
  // Unlock cleanly so Marcus's counter returns to 0.
  unlockDriverWithPin(marcusId, '4321');
  await sleep(40);
  return true;
});

/* ---- DR9 (Recovery Cooldown): 5 wrong recovery answers trigger escalating cooldown & reset on success ---- */
await pin('DR9. recovery cooldown: 5 wrong answers enforce 30s wait, escalate to 60s on 6th miss, and reset after valid answers', async () => {
  lockDriverSession();
  await sleep(40);
  const marcusId = getDriverSummaries().find((d) => d.name === 'Marcus')?.id;
  for (let i = 0; i < 4; i++) {
    const r = checkDriverRecoveryAnswers(marcusId, ['Wrong1', 'Wrong2']);
    if (r.ok || getRecoveryCooldownRemainingMs(marcusId) !== 0) return `recovery cooldown triggered early at miss ${i + 1}`;
  }
  const r5 = checkDriverRecoveryAnswers(marcusId, ['Wrong1', 'Wrong2']);
  if (r5.ok || getRecoveryCooldownRemainingMs(marcusId) !== 30_000 || !/30 seconds/i.test(r5.error)) {
    return `5th recovery miss did not enforce 30s cooldown: ${JSON.stringify(r5)}`;
  }
  // Correct answers refused during active cooldown.
  const during = checkDriverRecoveryAnswers(marcusId, ['Peterbilt', 'Memphis']);
  if (during.ok || !during.cooldownMs) return `correct recovery bypassed cooldown: ${JSON.stringify(during)}`;
  // 6th miss after 30s escalates to 60s.
  Tms += 30_000;
  const r6 = checkDriverRecoveryAnswers(marcusId, ['Wrong1', 'Wrong2']);
  if (r6.ok || getRecoveryCooldownRemainingMs(marcusId) !== 60_000 || !/60 seconds/i.test(r6.error)) {
    return `6th recovery miss did not escalate to 60s: ${JSON.stringify(r6)}`;
  }
  // After 60s, right answers pass and reset the counter.
  Tms += 60_000;
  const okAfter = checkDriverRecoveryAnswers(marcusId, ['Peterbilt', 'Memphis']);
  if (!okAfter.ok || getRecoveryCooldownRemainingMs(marcusId) !== 0) {
    return `right recovery answers after cooldown failed: ${JSON.stringify(okAfter)}`;
  }
  const oneMiss = checkDriverRecoveryAnswers(marcusId, ['Wrong1', 'Wrong2']);
  return (!oneMiss.ok && getRecoveryCooldownRemainingMs(marcusId) === 0)
    || `recovery counter did not reset: ${JSON.stringify(oneMiss)}`;
});

/* ---- DR10: Legacy single-driver migration yields first driver with 100% data + legacy undo intact ---- */
await pin('DR10. legacy migration: pre-drivers1 save becomes first driver with zero data loss, legacy undo preserved, and guided PIN + recovery setup', async () => {
  const T = Math.floor(Tms / 60000);
  mem.clear();
  const legacySave = {
    segments: [
      { status: 'OFF', start: T - 1200, end: T - 600, createdAt: 1 },
      { status: 'D', start: T - 600, end: T - 120, note: 'Legacy Freight', createdAt: 2 },
    ],
    tentative: [],
    current: { status: 'ON', since: T - 120, createdAt: 3 },
    config: { cycle: '60/7', dayStartHour: 5, dayStartMinute: 30, timeZone: 'America/Denver', shortHaul: false, adverseShifts: [], sixteenHourShifts: [] },
    mph: 58,
    weekPlan: {
      ...DEFAULT_WEEK_PLAN,
      loads: [{ ...DEFAULT_WEEK_LOAD, id: 'leg-1', label: 'Legacy Denver Load', miles: 530 }],
    },
    disclaimerAcked: true,
    historyAcknowledged: true,
    tzChosen: true,
    theme: 'night',
    themeChosen: true,
    nowCard: 'timeline',
    nowCardAsked: true,
  };
  const legacyUndo = {
    label: 'Deleted Legacy Note',
    before: {
      segments: [...legacySave.segments, { status: 'ON', start: T - 140, end: T - 120, note: 'Legacy Deleted', createdAt: 4 }],
      tentative: [],
      current: legacySave.current,
      historyAcknowledged: true,
      dayCloses: [],
    },
    after: {
      segments: legacySave.segments,
      tentative: [],
      current: legacySave.current,
      historyAcknowledged: true,
      dayCloses: [],
    },
  };
  mem.set('hos-sandbox-v1', JSON.stringify(legacySave));
  mem.set('hos-sandbox-undo-v1', JSON.stringify(legacyUndo));
  reloadVaultFromStorage();
  await sleep(60);

  const tiles = all((n) => n.localName === 'button' && n.attributes?.['data-driver-id']);
  if (tiles.length !== 1 || !/Finish setup/.test(tiles[0].textContent)) {
    return `legacy splash did not show migrated first driver: ${tiles.map((t) => t.textContent).join(' | ')}`;
  }

  await clickNode(tiles[0]);
  const legacyScreen = all((n) => n.attributes?.['data-register-screen'] === 'legacy-setup')[0];
  if (!legacyScreen || !/Zero data lost/i.test(legacyScreen.textContent)) return 'missing legacy-setup guided screen';
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-reg-name'] === '1')[0], 'Lorico');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);
  if (all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title').length > 0) {
    return 'legacy driver with disclaimerAcked=true should not be re-shown disclosure';
  }
  await enterPin('7788');
  await enterPin('7788');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '0')[0], 'Freightliner');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '1')[0], 'Chicago');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(60);

  const migrated = getState();
  const intact = getActiveDriverName() === 'Lorico'
    && migrated.segments.length === 2
    && migrated.segments[1].note === 'Legacy Freight'
    && migrated.current?.status === 'ON'
    && migrated.config.cycle === '60/7'
    && migrated.config.dayStartHour === 5
    && migrated.config.dayStartMinute === 30
    && migrated.config.timeZone === 'America/Denver'
    && migrated.mph === 58
    && migrated.weekPlan.loads.length === 1
    && migrated.weekPlan.loads[0].label === 'Legacy Denver Load'
    && migrated.theme === 'night'
    && currentUndo()?.label === 'Deleted Legacy Note';
  const keysOk = checkOnlyAllowedKeys();
  return (intact && keysOk === true) || JSON.stringify({ intact, keysOk, active: getActiveDriverName(), segs: migrated.segments.length, undo: currentUndo()?.label });
});

/* ---- DR11: Legacy save with disclaimerAcked: false DOES show disclosure during guided setup ---- */
await pin('DR11. legacy migration with disclaimerAcked=false requires disclosure acceptance during guided setup', async () => {
  mem.clear();
  mem.set('hos-sandbox-v1', JSON.stringify({ segments: [], tentative: [], current: null, disclaimerAcked: false }));
  reloadVaultFromStorage();
  await sleep(60);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-driver-id'])[0]);
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);
  const dlg = all((n) => n.attributes?.role === 'dialog' && n.attributes?.['aria-labelledby'] === 'disclaimer-title')[0];
  return !!dlg || 'expected disclosure popup for legacy user with disclaimerAcked=false';
});

/* ---- DR12: Receptionfix Scope 1 — registration stayUnlocked toggle (default OFF), 2nd-driver notice, DriverSettingsCard PIN gate ---- */
await pin('DR12. receptionfix Scope 1: registration stayUnlocked toggle (default OFF), 2nd-driver notice, Settings PIN-to-enable & no-PIN-to-disable, PIN invariants intact', async () => {
  mem.clear();
  reloadVaultFromStorage();
  await sleep(60);

  // Register Driver 1 via UI wizard and verify step 4 has Stay unlocked checkbox (default OFF).
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1')[0]);
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-reg-name'] === '1')[0], 'Alex');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(40);
  await clickNode(all((n) => n.localName === 'button' && /Understood/.test(n.textContent))[0]);
  await sleep(240);
  await enterPin('1357');
  await enterPin('1357');
  const regStayBox = all((n) => n.localName === 'input' && n.attributes?.['data-reg-stay-unlocked'] === '1')[0];
  const defaultOff = !!regStayBox && !regStayBox.checked;
  if (!defaultOff) return `expected stayUnlocked checkbox default OFF on reg step 4: found=${!!regStayBox}, checked=${regStayBox?.checked}`;
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '0')[0], 'Peterbilt');
  await setInput(all((n) => n.localName === 'input' && n.attributes?.['data-rec-a'] === '1')[0], 'Memphis');
  fire(all((n) => n.localName === 'form')[0], 'submit');
  await sleep(60);
  if (A.getStayUnlocked()) return 'stayUnlocked should remain OFF when checkbox left unchecked';

  // Open Settings -> DriverSettingsCard: try turning Stay unlocked ON with wrong PIN -> fails; right PIN -> succeeds; turning OFF -> no PIN needed!
  setState({ tab: 'settings' });
  await sleep(40);
  const toggleBtn = () => all((n) => n.localName === 'button' && n.attributes?.['data-stay-unlocked-toggle'] === '1')[0];
  await clickNode(toggleBtn());
  const pinInput = all((n) => n.localName === 'input' && n.attributes?.['data-stay-unlocked-pin'] === '1')[0];
  if (!pinInput) return 'clicking Stay unlocked while OFF did not open PIN confirmation form';
  await setInput(pinInput, '9999');
  fire(all((n) => n.localName === 'form' && n.attributes?.['data-stay-unlocked-form'] === '1')[0], 'submit');
  await sleep(30);
  const wrongErr = all((n) => n.attributes?.['data-stay-unlocked-err'] === '1')[0];
  if (!wrongErr || A.getStayUnlocked()) return 'wrong PIN should fail to enable stayUnlocked';

  await setInput(pinInput, '1357');
  fire(all((n) => n.localName === 'form' && n.attributes?.['data-stay-unlocked-form'] === '1')[0], 'submit');
  await sleep(40);
  if (!A.getStayUnlocked()) return 'valid PIN failed to enable stayUnlocked';

  // Verify PIN invariants remain required regardless of stayUnlocked (change PIN, recovery, erase).
  const drvId = S.getUnlockedDriverId();
  const badChg = S.changeDriverPin(drvId, '0000', '2222');
  const badRec = S.updateDriverRecovery(drvId, '0000', [
    { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Mack' },
    { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Tulsa' },
  ]);
  const badRem = S.removeDriverProfile(drvId, '0000');
  if (badChg.ok || badRec.ok || badRem.ok) return 'PIN invariants must stay enforced even when stayUnlocked is ON';

  // Lock to splash, click Add a driver -> MUST show the 2nd-driver notice while stayUnlocked is ON!
  lockDriverSession();
  await sleep(40);
  await clickNode(all((n) => n.localName === 'button' && n.attributes?.['data-add-driver'] === '1')[0]);
  const notice1 = all((n) => n.attributes?.['data-stay-unlocked-multi-notice'] === '1')[0];
  if (!notice1 || !/Stay unlocked turns off while more than one driver is on this phone\./.test(notice1.textContent)) {
    return `missing 2nd-driver notice during registration: ${notice1?.textContent ?? 'none'}`;
  }
  // Cancel back, unlock Alex, and disable Stay unlocked WITHOUT entering any PIN.
  await clickNode(all((n) => n.localName === 'button' && /Cancel/.test(n.textContent))[0]);
  await sleep(30);
  unlockDriverWithPin(drvId, '1357');
  await sleep(40);
  setState({ tab: 'settings' });
  await sleep(40);
  await clickNode(toggleBtn());
  await sleep(30);
  if (A.getStayUnlocked()) return 'disabling stayUnlocked should succeed immediately without PIN';
  return true;
});

/* ---- DR13: Receptionfix Scope 2 (eldpatch Item 1 updated) — ELD screenshot refresh CTA (fresh & active), staleness chip ABSENT, and Plan inline clock overrides ---- */
await pin('DR13. receptionfix Scope 2 + eldpatch Item 1: Refresh from ELD screenshot on Now (fresh & active), staleness chip absent in all states while lastEldCheckAt & drift CTA work, and Plan inline overrides', async () => {
  const T = Math.floor(Tms / 60000);
  if (typeof A.eldStalenessInfo !== 'undefined') return 'dead helper eldStalenessInfo should be removed';
  setState({ tab: 'now', segments: [], tentative: [], current: null, seededAt: null, lastEldCheckAt: null, nowOverride: T });
  await sleep(40);
  const nowPg = () => all((n) => n.localName === 'section' && /\bpage-now\b/.test(n.attributes?.class ?? ''))[0];
  const staleChips = () => all((n) => n.attributes?.['data-eld-staleness'] != null, nowPg());
  const shotFresh = all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0];
  if (!shotFresh || !/Refresh from ELD screenshot/.test(shotFresh.textContent)) return 'missing Refresh from ELD screenshot in fresh state';
  if (staleChips().length !== 0) return `staleness chip must be absent in fresh state, found: ${staleChips().map((n) => n.textContent).join(', ')}`;

  // Clicking Refresh from ELD screenshot on fresh log opens the existing eldocr QuickStartSheet directly.
  await clickNode(shotFresh);
  const chooseShot = all((n) => n.attributes?.['data-eld-choose-shot'] === '1')[0];
  const fileIn = all((n) => n.localName === 'input' && n.attributes?.type === 'file' && n.attributes?.accept === 'image/*')[0];
  if (!chooseShot || !fileIn) return 'Refresh from ELD screenshot did not launch existing eldocr QuickStartSheet';
  A.openSheet(null);
  await sleep(30);

  // Active state: seed via applyEldSeed -> stamps lastEldCheckAt=T; chip stays absent across fresh, +6h, +1d, +13d; CTA reaches DriftSheet.
  const seed = S.applyEldSeed(getState(), { driveLeft: 480, windowLeft: 600, breakDueIn: 300, cycleLeft: 3000 }, T);
  setState(seed.patch);
  await sleep(40);
  if (getState().lastEldCheckAt !== T) return `applyEldSeed did not stamp lastEldCheckAt: ${getState().lastEldCheckAt}`;
  const shotActive = all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0];
  if (!shotActive) return 'missing Refresh from ELD screenshot CTA in active state';
  if (staleChips().length !== 0) return 'staleness chip rendered in freshly-seeded state';

  for (const offset of [360, 24 * 60, 312 * 60]) {
    setState({ nowOverride: T + offset });
    await sleep(25);
    if (staleChips().length !== 0) return `staleness chip rendered at +${offset}m`;
  }
  setState({ nowOverride: T + 360 });
  await sleep(30);

  // Populated-log CTA reaches DriftSheet in screenshot mode end-to-end (after staleness chip removal).
  const shotPop = all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0];
  await clickNode(shotPop);
  await sleep(30);
  const driftTitle = all((n) => n.localName === 'h2' && /Check against my ELD/.test(n.textContent))[0];
  const driftShotWrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-shot-mode'] === '1')[0];
  if (!driftTitle || !driftShotWrap) return 'tapping Refresh CTA on active log did not open DriftSheet in screenshot mode';
  A.openSheet(null);
  await sleep(30);

  // Verify inline clock override in MilesTab changes calculation without mutating the live log.
  const segsBefore = JSON.stringify(getState().segments);
  A.openMilesPlanner(true);
  setState({ tab: 'plan' });
  await sleep(40);
  const toggleMiles = all((n) => n.attributes?.['data-clock-override-toggle'] === 'miles')[0];
  if (!toggleMiles) return 'MilesTab missing inline clock override';
  await clickNode(toggleMiles);
  const cycH = all((n) => n.attributes?.['data-co-h'] === 'cycleLeft')[0];
  const cycM = all((n) => n.attributes?.['data-co-m'] === 'cycleLeft')[0];
  await setInput(cycH, '10');
  await setInput(cycM, '0');
  fire(all((n) => n.attributes?.['data-clock-override-form'] === 'miles')[0], 'submit');
  await sleep(40);
  const activeBar = all((n) => n.attributes?.['data-clock-override'] === 'miles' && n.attributes?.['data-clock-override-active'] === '1')[0];
  const segsAfter = JSON.stringify(getState().segments);
  A.openMilesPlanner(false);
  if (!activeBar || segsBefore !== segsAfter) return 'inline clock override failed or mutated live log';
  return true;
});

/* ---- DR14: Receptionfix Scope 3 & Scope 4 — worksheet PDF, Log scratchpad, Email bug report, Scope line, persist(), backup nudge, iOS warning ---- */
await pin('DR14. receptionfix Scopes 3 & 4: worksheet PDF rename/header/filename, Log scratchpad, Email bug report, About scope line, persist(), backup nudge, iOS Safari warning', async () => {
  const T = Math.floor(Tms / 60000);
  setState({ tab: 'log', nowOverride: T, lastExportAt: null, exportNudgeDismissedAt: null });
  await sleep(40);
  const logPg = all((n) => n.localName === 'section' && /\bpage-log\b/.test(n.attributes?.class ?? ''))[0];
  const scratch = all((n) => n.attributes?.['data-log-scratchpad'] === '1', logPg)[0];
  if (!scratch || scratch.textContent.trim() !== 'Planning scratchpad — your ELD is the record.') {
    return `missing or wrong Log scratchpad line: ${scratch?.textContent}`;
  }

  // Settings: Email a bug report (above GitHub), Scope line (leaving legal disclaimer verbatim), Planning worksheet (PDF), backup nudge.
  setState({ tab: 'settings' });
  await sleep(40);
  const setPg = all((n) => n.localName === 'section' && /\bpage-settings\b/.test(n.attributes?.class ?? ''))[0];
  const emailBtn = all((n) => n.localName === 'a' && n.attributes?.['data-bug-email'] === '1', setPg)[0];
  const href = emailBtn?.attributes?.href ?? '';
  const emailOk = !!emailBtn
    && emailBtn.textContent.trim() === 'Email a bug report'
    && href.startsWith('mailto:lorico.estrellado@gmail.com?')
    && href.includes('subject=Clock%2014%20bug%20report')
    && decodeURIComponent(href).includes('Build:')
    && decodeURIComponent(href).includes('Theme:')
    && decodeURIComponent(href).includes('Clocks:');
  if (!emailOk) return `email bug report link invalid: ${href}`;

  const scopeEl = all((n) => n.attributes?.['data-scope-line'] === '1', setPg)[0];
  const scopeOk = scopeEl?.textContent.trim() === 'Clock 14 covers US interstate property-carrying rules (49 CFR 395). No Canada, oilfield, or passenger-carrying rules.';
  if (!scopeOk) return `wrong About scope line: ${scopeEl?.textContent}`;

  const pdfBtn = all((n) => n.localName === 'button' && /\bpdf-btn\b/.test(n.attributes?.class ?? ''), setPg)[0];
  if (pdfBtn?.textContent.trim() !== 'Planning worksheet (PDF)') return `PDF button not renamed: ${pdfBtn?.textContent}`;
  const fn = A.worksheetFilename('Alex', new Date(2026, 10, 26, 10, 0).getTime());
  if (fn !== 'clock14-worksheet-alex-20261126.pdf') return `wrong worksheet filename: ${fn}`;
  if (A.PDF_DISCLAIMER !== 'PERSONAL HOS PLANNING WORKSHEET — NOT A LEGAL RODS / NOT AN ELD') return `wrong worksheet header: ${A.PDF_DISCLAIMER}`;

  // Backup nudge: visible because driver has data and never exported; dismiss hides for 30 days; reappears at +30d; clears on export.
  const nudge0 = all((n) => n.attributes?.['data-backup-nudge'] === '1', setPg)[0];
  if (!nudge0 || !/Back up your clocks — save a copy somewhere safe\./.test(nudge0.textContent)) return 'backup nudge missing with data + no export';
  await clickNode(all((n) => n.attributes?.['data-backup-nudge-dismiss'] === '1', setPg)[0]);
  await sleep(30);
  if (all((n) => n.attributes?.['data-backup-nudge'] === '1', setPg).length !== 0) return 'backup nudge did not dismiss';
  if (A.shouldShowBackupNudge(getState(), T + 29 * 1440)) return 'backup nudge reappeared before 30 days';
  if (!A.shouldShowBackupNudge(getState(), T + 30 * 1440)) return 'backup nudge did not reappear after 30 days';
  const origDoc = globalThis.document;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  try {
    globalThis.document = { ...origDoc, createElement: () => ({ href: '', download: '', click() {} }) };
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    A.downloadExport(getState());
  } finally {
    globalThis.document = origDoc;
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  }
  if (A.shouldShowBackupNudge(getState(), T + 29 * 1440)) return 'backup nudge did not clear after export';
  if (!A.shouldShowBackupNudge(getState(), T + 30 * 1440)) return 'backup nudge did not reappear 30 days after export';

  // Scope 4 item 16: navigator.storage.persist() called silently when available, no-op when unsupported.
  let persistCalls = 0;
  const origNav = globalThis.navigator;
  A.resetPersistentStorageGuardForTest();
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...origNav, storage: { persist: () => { persistCalls++; return Promise.resolve(true); } } },
    configurable: true, writable: true,
  });
  A.requestPersistentStorage();
  A.resetPersistentStorageGuardForTest();
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'no-storage' }, configurable: true, writable: true });
  A.requestPersistentStorage(); // must be silent no-op
  Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true, writable: true });
  if (persistCalls !== 1) return `expected persist() called once, got ${persistCalls}`;

  // Scope 4 item 18: iOS Safari non-standalone detection + one-time dismissible warning on Now.
  const iosUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const detBrowser = A.isIosSafariNonStandalone({ userAgent: iosUa, standalone: false }, { matchMedia: () => ({ matches: false }) });
  const detStandalone = A.isIosSafariNonStandalone({ userAgent: iosUa, standalone: true }, { matchMedia: () => ({ matches: true }) });
  const detChrome = A.isIosSafariNonStandalone({ userAgent: iosUa.replace('Version/18.0', 'CriOS/120.0'), standalone: false }, { matchMedia: () => ({ matches: false }) });
  if (!detBrowser || detStandalone || detChrome) return `iOS detection wrong: ${JSON.stringify({ detBrowser, detStandalone, detChrome })}`;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: iosUa, standalone: false, vibrate: () => false }, configurable: true, writable: true });
  setState({ tab: 'now', iosInstallNoteDismissed: false });
  await sleep(40);
  const iosNote = all((n) => n.attributes?.['data-ios-install-note'] === '1')[0];
  if (!iosNote || !/Add Clock 14 to your Home Screen — Safari can erase web-app data after about a week\./.test(iosNote.textContent)) {
    Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true, writable: true });
    return `iOS warning missing on Now: ${iosNote?.textContent}`;
  }
  await clickNode(all((n) => n.attributes?.['data-ios-install-dismiss'] === '1')[0]);
  await sleep(30);
  const iosGone = all((n) => n.attributes?.['data-ios-install-note'] === '1').length === 0 && A.getIosInstallNoteDismissed();
  Object.defineProperty(globalThis, 'navigator', { value: origNav, configurable: true, writable: true });
  if (!iosGone) return 'iOS warning did not persist dismissal';

  // N3 (receptionfix2) + eldpatch Item 1: applyImportedState clears lastEldCheckAt, and no staleness chip renders on Now.
  setState({ tab: 'now', nowOverride: T, lastEldCheckAt: T });
  await sleep(30);
  const impPatch = S.applyImportedState(getState(), { segments: [{ status: 'OFF', start: T - 600, end: T, createdAt: 1 }] });
  if (impPatch.lastEldCheckAt !== null) return `applyImportedState must clear lastEldCheckAt, got: ${impPatch.lastEldCheckAt}`;
  setState(impPatch);
  await sleep(40);
  const nowPg2 = all((n) => n.localName === 'section' && /\bpage-now\b/.test(n.attributes?.class ?? ''))[0];
  const staleAfterImp = all((n) => n.attributes?.['data-eld-staleness'] != null, nowPg2);
  if (staleAfterImp.length !== 0) return 'imported log unexpectedly rendered staleness chip';
  return true;
});

/* ---- DR15 (B1): Non-destructive ELD screenshot flow on populated log, override form clean, forced reseed confirm + Undo ---- */
await pin('DR15. B1: populated log Now screenshot CTA routes to DriftSheet (prefilled, log byte-unchanged), override has no reseed button, forced reseed confirms & Undo restores all rows', async () => {
  const T = Math.floor(Tms / 60000);
  // Build a populated 6-day / 18-row log + active Off Duty (matching Opus B1 reproduction).
  const segs18 = [];
  for (let d = 6; d >= 1; d--) {
    const day0 = T - d * 1440;
    segs18.push(
      { status: 'OFF', start: day0, end: day0 + 600, note: `Rest D${d}`, createdAt: d * 10 + 1 },
      { status: 'D', start: day0 + 600, end: day0 + 900, note: `Drive D${d}`, createdAt: d * 10 + 2 },
      { status: 'ON', start: day0 + 900, end: day0 + 960, note: `Dock D${d}`, createdAt: d * 10 + 3 },
    );
  }
  const origCurrent = { status: 'OFF', since: T - 120, createdAt: 999 };
  setState({ tab: 'now', segments: segs18, tentative: [], current: origCurrent, seededAt: null, lastEldCheckAt: null, nowOverride: T });
  await sleep(40);
  const logSnapBefore = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });

  // (i) Populated log -> Now CTA -> routes into DriftSheet screenshot mode, NOT QuickStartSheet.
  const nowPg = all((n) => n.localName === 'section' && /\bpage-now\b/.test(n.attributes?.class ?? ''))[0];
  const shotCta = all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg)[0];
  if (!shotCta) return 'missing Refresh from ELD screenshot CTA on populated Now';
  await clickNode(shotCta);
  await sleep(40);
  if (A.currentSheet()?.kind !== 'drift') return `populated Now CTA should open drift sheet, got: ${JSON.stringify(A.currentSheet())}`;
  const driftWrap = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-shot-mode'] === '1')[0];
  if (!driftWrap) return 'DriftSheet did not open in screenshot mode';

  // Simulate OCR reading "Drive 11:00" cleanly -> prefills drift boxes -> Compare stamps lastEldCheckAt with log byte-unchanged!
  const fakeWords = [
    { text: 'Drive', confidence: 96, bbox: { x0: 10, y0: 10, x1: 80, y1: 30 } },
    { text: '11:00', confidence: 96, bbox: { x0: 100, y0: 10, x1: 160, y1: 30 } },
  ];
  A.setEldOcrOverrideForTest(async () => ({ auto: fakeWords, sparse: fakeWords }));
  try {
    const fileIn = all((n) => n.localName === 'input' && n.attributes?.type === 'file', driftWrap)[0];
    if (!fileIn) return 'DriftSheet screenshot mode missing file input';
    fileIn.files = [{}];
    fire(fileIn, 'change');
    await sleep(60);
    const hIn = all((n) => n.attributes?.['data-drift-h'] === '1')[0];
    const mIn = all((n) => n.attributes?.['data-drift-m'] === '1')[0];
    const hVal = hIn?.attributes?.value ?? hIn?.value;
    const mVal = mIn?.attributes?.value ?? mIn?.value;
    if (String(hVal) !== '11' || String(mVal) !== '0') {
      return `OCR did not prefill DriftSheet drive-left boxes: h=${hVal}, m=${mVal}`;
    }
    const cmpBtn = all((n) => n.attributes?.['data-drift-compare'] === '1')[0];
    await clickNode(cmpBtn);
    await sleep(40);
    const logSnapAfterCompare = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });
    if (logSnapAfterCompare !== logSnapBefore) return 'DriftSheet screenshot compare mutated populated log!';
    if (getState().lastEldCheckAt !== T) return `DriftSheet compare did not stamp lastEldCheckAt: ${getState().lastEldCheckAt}`;

    // Also test OCR failure -> stays in DriftSheet for manual entry, log byte-unchanged.
    A.openSheet(null);
    await sleep(40);
    A.setEldOcrOverrideForTest(async () => { throw new Error('unreadable'); });
    await clickNode(shotCta);
    await sleep(40);
    const driftWrap2 = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-shot-mode'] === '1')[0];
    const fileIn2 = all((n) => n.localName === 'input' && n.attributes?.type === 'file', driftWrap2)[0];
    fileIn2.files = [{}];
    fire(fileIn2, 'change');
    await sleep(60);
    const shotErr = all((n) => n.attributes?.['data-drift-shot-err'] === '1')[0];
    const cmpBtn2 = all((n) => n.attributes?.['data-drift-compare'] === '1')[0];
    if (!shotErr || !cmpBtn2 || A.currentSheet()?.kind !== 'drift') {
      return `OCR failure did not land in DriftSheet for manual entry: err=${shotErr?.textContent}`;
    }
    if (JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current }) !== logSnapBefore) {
      return 'OCR failure mutated populated log';
    }
  } finally {
    A.setEldOcrOverrideForTest(null);
    A.openSheet(null);
    await sleep(40);
  }

  // (iii) InlineClockOverride form must NOT contain any Refresh / ELD screenshot / reseed button.
  A.openMilesPlanner(true);
  setState({ tab: 'plan' });
  await sleep(40);
  await clickNode(all((n) => n.attributes?.['data-clock-override-toggle'] === 'miles')[0]);
  await sleep(30);
  const coForm = all((n) => n.attributes?.['data-clock-override-form'] === 'miles')[0];
  const badCoBtns = all((n) => n.localName === 'button' && /Refresh|screenshot|reseed/i.test(n.textContent), coForm);
  A.openMilesPlanner(false);
  await sleep(30);
  if (badCoBtns.length > 0) return `InlineClockOverride still contains reseed/refresh button: ${badCoBtns.map((b) => b.textContent).join(', ')}`;

  // (ii) Forced reseed path (QuickStartSheet) over populated 18-row log requires explicit confirmation, and Undo restores all 18 rows!
  setState({ tab: 'now' });
  await sleep(30);
  A.openSheet({ kind: 'quickstart' });
  await sleep(40);
  const setClocksBtn = all((n) => n.localName === 'button' && /Set my clocks/.test(n.textContent))[0];
  if (!setClocksBtn) return 'missing Set my clocks button in QuickStartSheet';
  await clickNode(setClocksBtn);
  await sleep(40);
  // Log must still be untouched before confirming!
  if (getState().segments.length !== 18) return `QuickStartSheet replaced log without confirmation (rows=${getState().segments.length})`;
  const replaceBox = all((n) => n.attributes?.['data-qs-replace-confirm'] === '1')[0];
  if (!replaceBox || !/This replaces your 18 logged rows/.test(replaceBox.textContent)) {
    return `missing explicit row-count confirmation: ${replaceBox?.textContent ?? 'none'}`;
  }
  // Cancel -> keeps all 18 rows.
  await clickNode(all((n) => n.attributes?.['data-qs-replace-cancel'] === '1')[0]);
  await sleep(30);
  if (getState().segments.length !== 18) return 'Keep my log did not preserve rows';

  // Confirm replace -> seeds, then pick current status -> Undo STILL restores all 18 prior rows + prior current!
  await clickNode(all((n) => n.localName === 'button' && /Set my clocks/.test(n.textContent))[0]);
  await sleep(30);
  await clickNode(all((n) => n.attributes?.['data-qs-replace-proceed'] === '1')[0]);
  await sleep(40);
  if (!currentUndo() || !/Replaced log from ELD clocks/.test(currentUndo().label)) {
    return `reseed did not arm undoable(): ${JSON.stringify(currentUndo())}`;
  }
  // Tap Off Duty on the done screen ("What are you doing right now?")
  const offBtn = all((n) => n.localName === 'button' && /Off Duty/.test(n.textContent) && n.parentNode?.attributes?.class === 'big-status')[0];
  if (!offBtn) return 'missing status button on QuickStartSheet done screen';
  await clickNode(offBtn);
  await sleep(40);
  if (!currentUndo()) return 'picking status after reseed cleared the reseed Undo!';
  const undone = A.undoLast();
  await sleep(30);
  const logSnapAfterUndo = JSON.stringify({ segments: getState().segments, tentative: getState().tentative, current: getState().current });
  if (!undone || logSnapAfterUndo !== logSnapBefore) {
    return `Undo did not restore all 18 prior rows: undone=${undone}, rows=${getState().segments.length}`;
  }
  return true;
});

/* ---- DR16 (B2 store-level refusal + N2 Change PIN / Recovery / Remove shared PIN cooldown) ---- */
await pin('DR16. B2+N2: setStayUnlocked refused at store level with 2 drivers; Change PIN form, updateDriverRecovery, and removeDriverProfile enforce shared escalating PIN cooldown', async () => {
  // N2: Exercise the actual Change PIN form in Settings for active solo driver Alex (PIN '1357').
  const alexId = S.getUnlockedDriverId();
  if (!alexId) return 'expected unlocked driver Alex';
  setState({ tab: 'settings' });
  await sleep(40);
  await clickNode(all((n) => n.attributes?.['data-change-pin-btn'] === '1')[0]);
  await sleep(30);
  const submitChangePin = async (cur, nw) => {
    const curIn = all((n) => n.attributes?.['data-change-pin-cur'] === '1')[0];
    const newIn = all((n) => n.attributes?.['data-change-pin-new'] === '1')[0];
    const cfmIn = all((n) => n.attributes?.['data-change-pin-confirm'] === '1')[0];
    await setInput(curIn, cur);
    await setInput(newIn, nw);
    await setInput(cfmIn, nw);
    fire(all((n) => n.attributes?.['data-change-pin-form'] === '1')[0], 'submit');
    await sleep(30);
  };
  for (let i = 0; i < 4; i++) {
    await submitChangePin('0000', '2468');
    if (getPinCooldownRemainingMs(alexId) !== 0) return `Change PIN triggered cooldown early at miss ${i + 1}`;
  }
  await submitChangePin('0000', '2468');
  const cdErr = all((n) => n.attributes?.['data-change-pin-err'] === '1')[0];
  if (getPinCooldownRemainingMs(alexId) !== 30_000 || !cdErr || !/Wait 30 seconds/i.test(cdErr.textContent)) {
    return `5th wrong PIN in Change PIN form did not trigger 30s cooldown: rem=${getPinCooldownRemainingMs(alexId)}, err=${cdErr?.textContent}`;
  }
  // Correct PIN MUST be refused during the wait (in Change PIN form, updateDriverRecovery, and removeDriverProfile)!
  await submitChangePin('1357', '2468');
  const refusedErr = all((n) => n.attributes?.['data-change-pin-err'] === '1')[0];
  const recDuring = S.updateDriverRecovery(alexId, '1357', [
    { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Volvo' },
    { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Omaha' },
  ]);
  const remDuring = S.removeDriverProfile(alexId, '1357');
  if (!refusedErr || !/Wait/i.test(refusedErr.textContent) || recDuring.ok || !recDuring.cooldownMs || remDuring.ok || !remDuring.cooldownMs) {
    return `correct PIN was not refused during cooldown across sibling forms: ${JSON.stringify({ err: refusedErr?.textContent, recDuring, remDuring })}`;
  }
  // Advance past 30s cooldown -> 1 wrong PIN on updateDriverRecovery escalates to 60s; then advance 60s -> correct PIN succeeds and resets!
  Tms += 30_000;
  const recMiss6 = S.updateDriverRecovery(alexId, '9999', [
    { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Volvo' },
    { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Omaha' },
  ]);
  if (recMiss6.ok || getPinCooldownRemainingMs(alexId) !== 60_000) {
    return `updateDriverRecovery did not share escalated 60s cooldown: ${JSON.stringify(recMiss6)}`;
  }
  Tms += 60_000;
  await submitChangePin('1357', '1357');
  if (getPinCooldownRemainingMs(alexId) !== 0) return 'successful Change PIN after cooldown did not clear cooldown';
  // Verify removeDriverProfile also records misses on wrong PIN (5 misses -> 30s cooldown, then clear via unlock).
  for (let i = 0; i < 4; i++) {
    const r = S.removeDriverProfile(alexId, '8888');
    if (r.ok || getPinCooldownRemainingMs(alexId) !== 0) return `removeDriverProfile cooldown triggered early at miss ${i + 1}`;
  }
  const rem5 = S.removeDriverProfile(alexId, '8888');
  if (rem5.ok || getPinCooldownRemainingMs(alexId) !== 30_000) return `removeDriverProfile 5th miss did not trigger 30s cooldown: ${JSON.stringify(rem5)}`;
  Tms += 30_000;
  S.changeDriverPin(alexId, '1357', '1357'); // clears cooldown cleanly

  // B2 store-level refusal: register a 2nd driver -> enabling stayUnlocked directly via store MUST fail!
  const onFirst = S.setStayUnlocked(alexId, true, '1357');
  if (!onFirst.ok || !A.getStayUnlocked()) return `precondition: solo setStayUnlocked failed: ${JSON.stringify(onFirst)}`;
  const reg2 = registerDriver({
    name: 'SecondCoDriver',
    pin: '2468',
    recovery: [
      { qId: D.REMINDER_QUESTIONS[0].id, question: D.REMINDER_QUESTIONS[0].text, answer: 'Mack' },
      { qId: D.REMINDER_QUESTIONS[1].id, question: D.REMINDER_QUESTIONS[1].text, answer: 'Dallas' },
    ],
    disclaimerAcked: true,
  });
  await sleep(40);
  if (!reg2.ok) return `failed to register 2nd driver: ${JSON.stringify(reg2)}`;
  if (A.getStayUnlocked()) return 'registering 2nd driver did not clear vault.stayUnlocked';
  const directEnable = S.setStayUnlocked(alexId, true, '1357');
  const directEnable2 = S.setStayUnlocked(reg2.id, true, '2468');
  if (directEnable.ok || directEnable2.ok || A.getStayUnlocked()) {
    return `setStayUnlocked must refuse at store level when 2 drivers exist: ${JSON.stringify({ directEnable, directEnable2, flag: A.getStayUnlocked() })}`;
  }
  return true;
});

/* ---- DR17 (N1): Split tool disables "Put plan on log" while custom clocks are active ---- */
await pin('DR17. N1: SplitTab disables "Put plan on log as what-if" with plain note while custom clocks are active, and re-enables when cleared', async () => {
  const T = Math.floor(Tms / 60000);
  setState({
    tab: 'split',
    nowOverride: T,
    segments: [{ status: 'OFF', start: T - 600, end: T - 180, createdAt: 1 }, { status: 'D', start: T - 180, end: T, createdAt: 2 }],
    tentative: [],
    current: { status: 'ON', since: T, createdAt: 3 },
  });
  await sleep(50);
  const splitBtn = () => all((n) => n.attributes?.['data-split-commit'] === '1')[0];
  const isDisabled = (el) => Boolean(el && (el.disabled === true || el.hasAttribute?.('disabled')));
  const noteEl = () => all((n) => n.attributes?.['data-split-override-note'] === '1')[0];
  if (!splitBtn() || isDisabled(splitBtn())) return `Split commit button should be enabled without override (found=${!!splitBtn()}, disabled=${isDisabled(splitBtn())})`;
  if (noteEl()) return 'override note should not show when custom clocks are off';

  // Turn on custom clocks in SplitTab.
  await clickNode(all((n) => n.attributes?.['data-clock-override-toggle'] === 'split')[0]);
  await sleep(30);
  const dH = all((n) => n.attributes?.['data-co-h'] === 'driveLeft')[0];
  await setInput(dH, '5');
  fire(all((n) => n.attributes?.['data-clock-override-form'] === 'split')[0], 'submit');
  await sleep(40);
  if (!isDisabled(splitBtn())) return 'Split commit button MUST be disabled while custom clocks are active';
  if (!noteEl() || !/Custom clocks are on/.test(noteEl().textContent)) {
    return `missing plain override note in SplitTab: ${noteEl()?.textContent ?? 'none'}`;
  }
  // Clicking disabled commit must not write tentative rows.
  if (getState().tentative.length !== 0) return 'SplitTab wrote tentative rows while custom clocks active';

  // Turn off custom clocks -> button re-enables and note disappears!
  await clickNode(all((n) => n.attributes?.['data-clock-override-clear'] === 'split')[0]);
  await sleep(40);
  if (isDisabled(splitBtn()) || noteEl()) return `Split commit did not re-enable after clearing custom clocks (disabled=${isDisabled(splitBtn())}, note=${!!noteEl()})`;
  return true;
});

/* ---- DR18 (eldpatch Item 2): Pick-your-ELD offline help flow in both Refresh entry points ---- */
await pin('DR18. eldpatch Item 2: ELD help affordance in QuickStartSheet & DriftSheet screenshot flows, 31 documented + 4 undocumented + generic entry, split-screen clocks note, no-phone-graph honest note, generic 3-step, zero persistence/external links', async () => {
  const T = Math.floor(Tms / 60000);
  const rawStorageBefore = localStorage.getItem('hos-sandbox-v1');
  const keysBefore = Object.keys(localStorage).sort().join(',');

  // (1) Fresh log -> Refresh CTA -> QuickStartSheet screenshot mode has help affordance -> picker.
  setState({ tab: 'now', segments: [], tentative: [], current: null, seededAt: null, lastEldCheckAt: null, nowOverride: T });
  await sleep(40);
  const nowPg = () => all((n) => n.localName === 'section' && /\bpage-now\b/.test(n.attributes?.class ?? ''))[0];
  await clickNode(all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0]);
  await sleep(40);
  const qsHelpBtn = all((n) => n.attributes?.['data-eld-help-btn'] === '1')[0];
  if (!qsHelpBtn || !/Need help finding your log screen\?/.test(qsHelpBtn.textContent)) {
    return `QuickStartSheet missing ELD help affordance: ${qsHelpBtn?.textContent}`;
  }
  await clickNode(qsHelpBtn);
  await sleep(30);
  const picker1 = all((n) => n.attributes?.['data-eld-guide-picker'] === '1')[0];
  if (!picker1) return 'QuickStartSheet help affordance did not open ELD guide picker';

  const docItems = all((n) => n.attributes?.['data-eld-kind'] === 'documented', picker1);
  const undocItems = all((n) => n.attributes?.['data-eld-kind'] === 'undocumented', picker1);
  const genItems = all((n) => n.attributes?.['data-eld-kind'] === 'generic', picker1);
  if (docItems.length !== 31 || undocItems.length !== 4 || genItems.length !== 1) {
    return `unexpected ELD counts: documented=${docItems.length}, undocumented=${undocItems.length}, generic=${genItems.length}`;
  }
  // Verify the 4 undocumented ELDs are present and labeled as generic steps.
  const undocIds = undocItems.map((n) => n.attributes?.['data-eld-item']).sort().join(',');
  if (undocIds !== 'anytrek,eld-mandate,lytx,netradyne') return `wrong undocumented ELD IDs: ${undocIds}`;
  for (const u of undocItems) {
    if (!/Generic steps/i.test(u.textContent)) return `undocumented ELD not labeled as generic steps: ${u.textContent}`;
  }
  if (!/Don't see your ELD\?/.test(genItems[0].textContent)) return `generic fallback label wrong: ${genItems[0].textContent}`;
  // Zero runtime external links inside the picker.
  const extLinksPicker = all((n) => n.localName === 'a' && /^https?:\/\//i.test(n.attributes?.href ?? ''), picker1);
  if (extLinksPicker.length !== 0) return 'ELD picker must not contain external links';

  // (2) Split-screen device #1: Samsara — lands on HoS clocks screen and explains why; no stitching promise.
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'samsara')[0]);
  await sleep(30);
  const samsaraDetail = all((n) => n.attributes?.['data-eld-guide-detail'] === 'samsara')[0];
  const samsaraScreen = all((n) => n.attributes?.['data-eld-which-screen'] === '1' && n.attributes?.['data-eld-split'] === '1', samsaraDetail)[0];
  const samsaraSteps = all((n) => n.localName === 'li', samsaraDetail);
  const samsaraDay = all((n) => n.attributes?.['data-eld-switch-day'] === '1', samsaraDetail)[0];
  if (!samsaraDetail || !samsaraScreen || !/HoS/.test(samsaraScreen.textContent) || !/clocks/i.test(samsaraScreen.textContent) || samsaraSteps.length < 2) {
    return `Samsara detail missing split-screen clocks guidance: ${samsaraDetail?.textContent}`;
  }
  if (!samsaraDay || !/one day at a time/i.test(samsaraDay.textContent) || /stitch/i.test(samsaraDetail.textContent)) {
    return `Samsara day-switch note invalid: ${samsaraDay?.textContent}`;
  }
  if (all((n) => n.localName === 'a' && /^https?:\/\//i.test(n.attributes?.href ?? ''), samsaraDetail).length !== 0) {
    return 'Samsara detail contains external link';
  }

  // Back to list -> Split-screen device #2: Geotab Drive.
  await clickNode(all((n) => n.attributes?.['data-eld-guide-back-list'] === '1')[0]);
  await sleep(30);
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'geotab')[0]);
  await sleep(30);
  const geotabDetail = all((n) => n.attributes?.['data-eld-guide-detail'] === 'geotab')[0];
  const geotabScreen = all((n) => n.attributes?.['data-eld-which-screen'] === '1' && n.attributes?.['data-eld-split'] === '1', geotabDetail)[0];
  if (!geotabDetail || !geotabScreen || !/HOS/.test(geotabScreen.textContent) || !/Logs tab/i.test(geotabScreen.textContent)) {
    return `Geotab detail missing split-screen clocks guidance: ${geotabDetail?.textContent}`;
  }

  // Back to list -> No-phone-graph dash-mounted terminal: ISAAC InControl (and Omnitracs IVG).
  await clickNode(all((n) => n.attributes?.['data-eld-guide-back-list'] === '1')[0]);
  await sleep(30);
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'isaac')[0]);
  await sleep(30);
  const isaacDetail = all((n) => n.attributes?.['data-eld-guide-detail'] === 'isaac')[0];
  const isaacNotice = all((n) => n.attributes?.['data-eld-no-phone-graph'] === '1', isaacDetail)[0];
  if (!isaacDetail || !isaacNotice || !/no phone screenshot/i.test(isaacNotice.textContent)) {
    return `ISAAC no-phone-graph honest note missing: ${isaacNotice?.textContent}`;
  }

  // Back to list -> Undocumented ELD (Lytx) renders generic 3-step pattern honestly.
  await clickNode(all((n) => n.attributes?.['data-eld-guide-back-list'] === '1')[0]);
  await sleep(30);
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'lytx')[0]);
  await sleep(30);
  const lytxDetail = all((n) => n.attributes?.['data-eld-guide-detail'] === 'lytx')[0];
  const lytxSteps = all((n) => n.localName === 'li', lytxDetail);
  if (!lytxDetail || !/Generic steps/i.test(lytxDetail.textContent) || lytxSteps.length !== 3) {
    return `Lytx undocumented page invalid: steps=${lytxSteps.length}`;
  }

  // Back to list -> Final generic fallback ("Don't see your ELD?") renders the 3-step pattern.
  await clickNode(all((n) => n.attributes?.['data-eld-guide-back-list'] === '1')[0]);
  await sleep(30);
  await clickNode(all((n) => n.attributes?.['data-eld-item'] === 'generic')[0]);
  await sleep(30);
  const genDetail = all((n) => n.attributes?.['data-eld-guide-detail'] === 'generic')[0];
  const genSteps = all((n) => n.localName === 'li', genDetail);
  if (!genDetail || genSteps.length !== 3 || !/Park first/i.test(genSteps[0].textContent)) {
    return `Generic fallback missing 3-step pattern: steps=${genSteps.length}`;
  }

  // Back to list -> Search discontinued hardware shows quiet notice, then return to screenshot sheet.
  await clickNode(all((n) => n.attributes?.['data-eld-guide-back-list'] === '1')[0]);
  await sleep(30);
  const searchIn = all((n) => n.attributes?.['data-eld-guide-search'] === '1')[0];
  await setInput(searchIn, 'Stoneridge');
  await sleep(30);
  const discNote = all((n) => n.attributes?.['data-eld-discontinued'] === '1')[0];
  if (!discNote || !/discontinued/i.test(discNote.textContent)) return 'discontinued ELD search note missing';
  await clickNode(all((n) => n.attributes?.['data-eld-guide-return'] === '1')[0]);
  await sleep(30);
  if (!all((n) => n.attributes?.['data-eld-choose-shot'] === '1')[0]) return 'Back to screenshot did not return to QuickStartSheet';
  A.openSheet(null);
  await sleep(30);

  // Verify session-only: reopening opens fresh on picker (not persisted) and zero new localStorage keys were created.
  if (Object.keys(localStorage).sort().join(',') !== keysBefore) return 'ELD guide flow added unexpected localStorage keys';
  // (Storage may only have changed from our own setState above; check no eld-choice keys exist in storage.)
  if (/eldGuide|selectedEld|pickedEld/i.test(localStorage.getItem('hos-sandbox-v1') ?? '')) {
    return 'ELD choice was persisted into storage';
  }
  void rawStorageBefore;

  // (3) Populated log -> Refresh CTA -> DriftSheet screenshot mode ALSO has help affordance -> opens fresh picker.
  setState({
    tab: 'now',
    nowOverride: T,
    segments: [
      { status: 'OFF', start: T - 720, end: T - 120, createdAt: 1 },
      { status: 'D', start: T - 120, end: T, createdAt: 2 },
    ],
    tentative: [],
    current: { status: 'ON', since: T, createdAt: 3 },
  });
  await sleep(40);
  await clickNode(all((n) => n.attributes?.['data-eld-screenshot-btn'] === '1', nowPg())[0]);
  await sleep(40);
  const driftHelpBtn = all((n) => n.attributes?.['data-eld-help-btn'] === '1')[0];
  if (!driftHelpBtn || !/Need help finding your log screen\?/.test(driftHelpBtn.textContent)) {
    return `DriftSheet screenshot mode missing ELD help affordance: ${driftHelpBtn?.textContent}`;
  }
  await clickNode(driftHelpBtn);
  await sleep(30);
  const picker2 = all((n) => n.attributes?.['data-eld-guide-picker'] === '1')[0];
  if (!picker2) return 'DriftSheet help affordance did not open fresh ELD picker';
  // Return to DriftSheet screenshot mode cleanly.
  await clickNode(all((n) => n.attributes?.['data-eld-guide-return'] === '1')[0]);
  await sleep(30);
  const driftBack = all((n) => n.attributes?.['data-drift-sheet'] === '1' && n.attributes?.['data-drift-shot-mode'] === '1')[0];
  A.openSheet(null);
  await sleep(30);
  if (!driftBack) return 'Back to screenshot did not return to DriftSheet';
  return true;
});

/* ---- DR19 (eldpatch Item 3): Bug report mailto diagnostics snapshot, hard privacy fence, size-guard fallback, disclosure line ---- */
await pin('DR19. eldpatch Item 3: bug report mailto carries allowlisted diagnostics JSON on small log with hard privacy fence, falls back under ~1800 chars on large log with export-attach line, and shows disclosure', async () => {
  const T = Math.floor(Tms / 60000);
  // Extract live vault secrets (salts, hashes, driver names, IDs) from localStorage to assert strict absence!
  const vaultEnv = JSON.parse(localStorage.getItem('hos-sandbox-v1') || '{}');
  const vault = vaultEnv.__drivers;
  const profiles = vault && vault.profiles ? Object.values(vault.profiles) : [];
  if (profiles.length < 2) {
    return `precondition: expected multi-driver vault with >=2 profiles for privacy fence test, got ${profiles.length}`;
  }
  const forbiddenStrings = ['__drivers', 'profiles', 'pinHash', 'recovery', 'sha256-2048', 'stayUnlocked', '1357', '2468'];
  for (const drv of profiles) {
    if (drv.id) forbiddenStrings.push(drv.id);
    if (drv.name) forbiddenStrings.push(drv.name);
    if (drv.pin?.salt) forbiddenStrings.push(drv.pin.salt);
    if (drv.pin?.hash) forbiddenStrings.push(drv.pin.hash);
    for (const r of drv.recovery || []) {
      if (r.salt) forbiddenStrings.push(r.salt);
      if (r.hash) forbiddenStrings.push(r.hash);
    }
  }

  // (1) Small log on Settings: render disclosure line + inspect mailto href + verify tap-time refresh.
  setState({
    tab: 'settings',
    nowOverride: T,
    seededAt: T - 300,
    lastEldCheckAt: T - 60,
    historyAcknowledged: true,
    segments: [
      { status: 'OFF', start: T - 720, end: T - 120, createdAt: 10 },
      { status: 'D', start: T - 120, end: T, createdAt: 11 },
    ],
    tentative: [{ status: 'OFF', start: T, end: T + 30, note: 'Break: 30-min break', createdAt: 12 }],
    current: { status: 'ON', since: T, createdAt: 13 },
  });
  await sleep(40);
  const setPg = all((n) => n.localName === 'section' && /\bpage-settings\b/.test(n.attributes?.class ?? ''))[0];
  const disc = all((n) => n.attributes?.['data-bug-email-disclosure'] === '1', setPg)[0];
  if (!disc || disc.textContent.trim() !== 'Sends your clock log and app state so we can diagnose the problem. No PIN, no account info.') {
    return `wrong or missing disclosure line: ${disc?.textContent}`;
  }
  const emailBtn = all((n) => n.localName === 'a' && n.attributes?.['data-bug-email'] === '1', setPg)[0];
  if (!emailBtn) return 'missing Email a bug report link';
  // Trigger tap-time click refresh on the anchor.
  fire(emailBtn, 'click');
  await sleep(20);
  const hrefSmall = emailBtn.href || emailBtn.attributes?.href || '';
  if (!hrefSmall.startsWith('mailto:lorico.estrellado@gmail.com?')) return `bad mailto prefix: ${hrefSmall}`;
  if (hrefSmall.length > A.BUG_REPORT_MAILTO_MAX) return `small log mailto unexpectedly exceeded ${A.BUG_REPORT_MAILTO_MAX}: len=${hrefSmall.length}`;
  const decodedSmall = decodeURIComponent(hrefSmall);
  for (const req of ['Build:', 'Date:', 'Screen: settings', 'Theme:', 'Platform:', 'Clocks:', 'State: ']) {
    if (!decodedSmall.includes(req)) return `small log mailto missing "${req}"`;
  }
  const stateMatch = decodedSmall.match(/State: (\{[^\n]+\})/);
  if (!stateMatch) return `small log mailto missing compact State JSON: ${decodedSmall}`;
  const snap = JSON.parse(stateMatch[1]);
  if (
    snap.segments?.length !== 2
    || snap.tentative?.length !== 1
    || snap.current?.status !== 'ON'
    || snap.seededAt !== T - 300
    || snap.lastEldCheckAt !== T - 60
    || !snap.config?.cycle
    || !snap.historyBasis
  ) {
    return `parsed State JSON missing diagnostic fields: ${stateMatch[1]}`;
  }
  for (const secret of forbiddenStrings) {
    if (hrefSmall.includes(secret) || decodedSmall.includes(secret)) {
      return `PRIVACY FENCE VIOLATION in small mailto: leaked "${secret}"`;
    }
  }

  // (2) Large synthetic log triggers size-guard fallback <= 1800 chars with export-attach guidance & zero leaks.
  const bigSegs = [];
  for (let i = 0; i < 45; i++) {
    const st = i % 3 === 0 ? 'OFF' : i % 3 === 1 ? 'D' : 'ON';
    bigSegs.push({ status: st, start: T - (45 - i) * 180, end: T - (44 - i) * 180, note: `Leg ${i + 1}`, createdAt: 100 + i });
  }
  setState({ tab: 'settings', nowOverride: T, segments: bigSegs, tentative: [], current: { status: 'OFF', since: T, createdAt: 999 } });
  await sleep(40);
  const emailBtnBig = all((n) => n.localName === 'a' && n.attributes?.['data-bug-email'] === '1', all((n) => n.localName === 'section' && /\bpage-settings\b/.test(n.attributes?.class ?? ''))[0])[0];
  const hrefBig = emailBtnBig?.attributes?.href ?? '';
  const decodedBig = decodeURIComponent(hrefBig);
  if (hrefBig.length > A.BUG_REPORT_MAILTO_MAX) {
    return `large log fallback exceeded ${A.BUG_REPORT_MAILTO_MAX} chars: len=${hrefBig.length}`;
  }
  if (decodedBig.includes('State: {')) return 'large log failed to fall back from full State JSON';
  if (!decodedBig.includes('Summary: segments=45') || !decodedBig.includes(A.BUG_REPORT_EXPORT_LINE)) {
    return `large log fallback missing summary or export-attach line: ${decodedBig}`;
  }
  for (const secret of forbiddenStrings) {
    if (hrefBig.includes(secret) || decodedBig.includes(secret)) {
      return `PRIVACY FENCE VIOLATION in fallback mailto: leaked "${secret}"`;
    }
  }

  // (3) Platform class detection across iOS/Android/desktop x standalone/browser tab.
  const pIosStandalone = A.detectPlatformClass({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true }, { matchMedia: () => ({ matches: false }) });
  const pAndroidBrowser = A.detectPlatformClass({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }, { matchMedia: () => ({ matches: false }) });
  const pDeskStandalone = A.detectPlatformClass({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, { matchMedia: () => ({ matches: true }) });
  if (pIosStandalone !== 'iOS (standalone)' || pAndroidBrowser !== 'Android (browser tab)' || pDeskStandalone !== 'desktop (standalone)') {
    return `detectPlatformClass mismatch: ${JSON.stringify({ pIosStandalone, pAndroidBrowser, pDeskStandalone })}`;
  }
  return true;
});

let fails = 0;
for (const [status, name, info] of res) {
  if (status !== 'PASS') fails++;
  console.log(`${status} ${name}${info ? ' — ' + info : ''}`);
}
console.log(`\ndrivers: ${res.length - fails}/${res.length} pins pass`);
process.exit(fails ? 1 : 0);
