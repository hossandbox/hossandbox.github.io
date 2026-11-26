/**
 * Multi-driver identity, salted/hashed PIN & recovery verification, and vault types (drivers1).
 *
 * Design principles:
 *  - Pure-JS FIPS 180-4 SHA-256 with per-secret random 16-byte salt and 2048-round key stretching.
 *    Synchronous, zero external dependencies, works identically offline on HTTPS PWAs, plain HTTP
 *    LAN test servers (where crypto.subtle is unavailable), and Node DOM/SSR test harnesses.
 *  - PINs and recovery answers are NEVER stored in plaintext anywhere in storage or memory snapshots.
 *  - Storage lives inside the existing `hos-sandbox-v1` envelope under `__drivers` — zero new
 *    localStorage keys and zero renames of `hos-sandbox-v1`, `hos-sandbox-v1-backup`,
 *    `hos-sandbox-v1-sim`, or `hos-sandbox-undo-v1`.
 */

/* ============================================================ SHA-256 (FIPS 180-4, pure JS) */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if ((c & 0xfc00) === 0xd800 && i + 1 < str.length && (str.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      c = 0x10000 + ((c & 0x3ff) << 10) + (str.charCodeAt(++i) & 0x3ff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return new Uint8Array(out);
}

/** Standard FIPS 180-4 SHA-256 returning 64 lowercase hex characters. */
export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export const HASH_ALG = 'sha256-2048' as const;
const HASH_ROUNDS = 2048;

export interface HashedSecret {
  alg: typeof HASH_ALG;
  salt: string;
  hash: string;
}

export interface RecoveryItem extends HashedSecret {
  qId: string;
  question: string;
}

export interface RecoveryInput {
  qId: string;
  question: string;
  answer: string;
}

/** Generate a 16-byte random hex salt (crypto.getRandomValues with safe fallback). */
export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function stretchHash(secret: string, salt: string): string {
  let acc = sha256Hex(`${salt}:${secret}`);
  for (let i = 1; i < HASH_ROUNDS; i++) {
    acc = sha256Hex(`${acc}:${salt}:${i}`);
  }
  return acc;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Create a salted + stretched hash of a secret (PIN or normalized recovery answer). */
export function createHashedSecret(secret: string, salt: string = generateSalt()): HashedSecret {
  return { alg: HASH_ALG, salt, hash: stretchHash(secret, salt) };
}

/** Verify a candidate secret against a stored HashedSecret in constant time. */
export function verifyHashedSecret(candidate: string, stored: HashedSecret | null | undefined): boolean {
  if (!stored || stored.alg !== HASH_ALG || typeof stored.salt !== 'string' || typeof stored.hash !== 'string') return false;
  if (!stored.salt || stored.hash.length !== 64) return false;
  return timingSafeEqualHex(stretchHash(candidate, stored.salt), stored.hash);
}

/** Normalize a recovery answer: trim, lowercase, collapse internal whitespace so caps/spaces never lock a driver out. */
export function normalizeRecoveryAnswer(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isValidHashedSecret(v: unknown): v is HashedSecret {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return o.alg === HASH_ALG && typeof o.salt === 'string' && o.salt.length >= 8 && typeof o.hash === 'string' && /^[0-9a-f]{64}$/.test(o.hash);
}

export function isValidRecoveryItem(v: unknown): v is RecoveryItem {
  if (!isValidHashedSecret(v)) return false;
  const o = v as unknown as Record<string, unknown>;
  return typeof o.qId === 'string' && o.qId.trim().length > 0 && typeof o.question === 'string' && o.question.trim().length > 0;
}

export function createRecoveryItem(input: RecoveryInput): RecoveryItem {
  const secret = createHashedSecret(normalizeRecoveryAnswer(input.answer));
  return {
    qId: input.qId.trim().slice(0, 40),
    question: input.question.trim().slice(0, 120),
    ...secret,
  };
}

export function verifyRecoveryAnswers(answers: string[], stored: RecoveryItem[]): boolean {
  if (!Array.isArray(stored) || stored.length < MIN_RECOVERY_QUESTIONS) return false;
  if (!Array.isArray(answers) || answers.length !== stored.length) return false;
  let allMatch = true;
  for (let i = 0; i < stored.length; i++) {
    const norm = normalizeRecoveryAnswer(answers[i] ?? '');
    if (!norm || !verifyHashedSecret(norm, stored[i])) allMatch = false;
  }
  return allMatch;
}

/* ============================================================ Reminder Questions & Helpers */

export const MIN_RECOVERY_QUESTIONS = 2;
export const MAX_DRIVER_NAME_LEN = 32;

export interface ReminderQuestionOption {
  id: string;
  text: string;
}

export const REMINDER_QUESTIONS: readonly ReminderQuestionOption[] = [
  { id: 'first-truck', text: 'Make of your first truck?' },
  { id: 'home-city', text: 'City of your first home terminal?' },
  { id: 'best-hwy', text: 'Highway or interstate you know best?' },
  { id: 'truck-stop', text: 'Name of your favorite truck stop?' },
  { id: 'cb-handle', text: 'First CB handle or nickname?' },
  { id: 'first-pet', text: 'Name of your first pet?' },
  { id: 'street', text: 'Street you grew up on?' },
  { id: 'unit-num', text: 'Last 4 digits of a memorable truck or trailer?' },
] as const;

export function sanitizeDriverName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_DRIVER_NAME_LEN);
}

/** Two-character monogram for a driver's circular badge on the splash & settings chrome. */
export function driverInitials(name: string): string {
  const clean = sanitizeDriverName(name);
  if (!clean) return 'D';
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

/** Filename-safe slug of a driver name for JSON exports (e.g. "Marcus J." → "marcus-j"). */
export function driverFileSlug(name: string): string {
  return sanitizeDriverName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
}

export function makeDriverId(): string {
  const rnd = generateSalt().slice(0, 8);
  return `drv-${Date.now().toString(36)}-${rnd}`;
}
