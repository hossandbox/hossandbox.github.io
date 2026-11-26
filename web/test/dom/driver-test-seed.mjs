// Shared Playwright test helper for real-browser lanes (drivers1).
// Wraps any single-driver seed into a real multi-driver vault (with salted/hashed PIN '1234'
// using the exact production hashing algorithm) and unlocks through the real Startup Splash UI.
import { createHash } from 'node:crypto';

const HASH_ALG = 'sha256-2048';
const HASH_ROUNDS = 2048;

function sha256Hex(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function makeTestHashedSecret(secret, salt) {
  let acc = sha256Hex(`${salt}:${secret}`);
  for (let i = 1; i < HASH_ROUNDS; i++) acc = sha256Hex(`${acc}:${salt}:${i}`);
  return { alg: HASH_ALG, salt, hash: acc };
}

const TEST_PIN_HASH = makeTestHashedSecret('1234', '11223344556677889900aabbccddeeff');
const TEST_REC_1 = {
  qId: 'first-truck',
  question: 'Make of your first truck?',
  ...makeTestHashedSecret('peterbilt', 'aabbccddeeff00112233445566778899'),
};
const TEST_REC_2 = {
  qId: 'home-city',
  question: 'City of your first home terminal?',
  ...makeTestHashedSecret('chicago', 'ffeeddccbbaa99887766554433221100'),
};

/**
 * Wrap a plain State seed (object or JSON string) into a drivers1 vault save with one
 * registered driver ("Driver 1", PIN "1234"). Preserves every top-level field verbatim.
 */
export function wrapDriverSeed(seedInput, name = 'Driver 1') {
  if (!seedInput) return null;
  const obj = typeof seedInput === 'string' ? JSON.parse(seedInput) : { ...seedInput };
  if (obj && typeof obj === 'object' && '__drivers' in obj) {
    return typeof seedInput === 'string' ? seedInput : JSON.stringify(obj);
  }
  const { tab: _tab, speakAskOpen: _sp, ...data } = obj;
  const id = 'driver-1';
  const wrapped = {
    ...obj,
    __drivers: {
      v: 1,
      activeId: id,
      order: [id],
      profiles: {
        [id]: {
          id,
          name,
          createdAt: 1732620000000,
          disclaimerAckedAt: obj.disclaimerAcked === false ? null : 1732620000000,
          pin: TEST_PIN_HASH,
          recovery: [TEST_REC_1, TEST_REC_2],
          needsSetup: false,
          migrated: false,
          data,
          undoRaw: null,
          simRaw: null,
        },
      },
    },
  };
  return JSON.stringify(wrapped);
}

/**
 * Unlock the first driver on the Startup Splash by tapping their tile and entering the 4-digit PIN
 * through the real on-screen keypad (no bypasses, exercises real production flow).
 */
export async function unlockSplashInBrowser(page, pin = '1234') {
  const tile = page.locator('[data-splash-screen="1"] button.driver-tile').first();
  if (!(await tile.count())) return false;
  await tile.click({ force: true });
  await page.waitForSelector('[data-pin-pad="1"]', { timeout: 3000 });
  for (const ch of pin) {
    await page.locator(`[data-pin-pad="1"] button[data-pin-digit="${ch}"]`).click({ force: true });
  }
  await page.waitForFunction(() => !document.querySelector('[data-splash-screen="1"]'), null, { timeout: 4000 });
  await page.waitForTimeout(120);
  return true;
}
