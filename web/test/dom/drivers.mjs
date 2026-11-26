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

let fails = 0;
for (const [status, name, info] of res) {
  if (status !== 'PASS') fails++;
  console.log(`${status} ${name}${info ? ' — ' + info : ''}`);
}
console.log(`\ndrivers: ${res.length - fails}/${res.length} pins pass`);
if (fails) process.exit(1);
