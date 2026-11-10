/**
 * Optional PIN lock. The PIN is never stored: only a salted PBKDF2-SHA256 hash.
 * A recovery code (shown once when the PIN is set) can remove a forgotten PIN.
 * This is a privacy screen for a shared PC. It does NOT encrypt the data file.
 */

export interface PinRecord {
  salt: string; // base64
  hash: string; // base64
  iterations: number;
  recoverySalt: string;
  recoveryHash: string;
}

export interface SecuritySettings {
  pin?: PinRecord;
  /** Lock again after this many idle minutes; 0 = only when the app starts. */
  lockAfterMinutes?: number;
}

export const PIN_ITERATIONS = 150_000;
export const LOCK_OPTIONS = [0, 5, 10, 30, 60];
export const DEFAULT_LOCK_MINUTES = 10;
/** Wrong attempts allowed before a pause. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 30;

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function hashSecret(secret: string, saltB64: string, iterations = PIN_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltB64), iterations },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

/** Constant-time comparison of two equal-format strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Recovery code like "K7QM-3XRA-PZ9D". */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(12);
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Normalises what a person types back ("k7qm 3xra pz9d" → "K7QM-3XRA-PZ9D"). */
export function normalizeRecoveryCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}` : c;
}

export async function createPinRecord(
  pin: string,
  iterations = PIN_ITERATIONS
): Promise<{ record: PinRecord; recoveryCode: string }> {
  if (!isValidPin(pin)) throw new Error('The PIN must be 4 to 8 digits.');
  const salt = toBase64(randomBytes(16));
  const recoverySalt = toBase64(randomBytes(16));
  const recoveryCode = generateRecoveryCode();
  return {
    record: {
      salt,
      hash: await hashSecret(pin, salt, iterations),
      iterations,
      recoverySalt,
      recoveryHash: await hashSecret(recoveryCode, recoverySalt, iterations)
    },
    recoveryCode
  };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return safeEqual(await hashSecret(pin, record.salt, record.iterations), record.hash);
}

export async function verifyRecoveryCode(code: string, record: PinRecord): Promise<boolean> {
  return safeEqual(await hashSecret(normalizeRecoveryCode(code), record.recoverySalt, record.iterations), record.recoveryHash);
}

/** Keeps only a well-formed security block (used when loading settings). */
export function cleanSecurity(raw: unknown): SecuritySettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const p = r.pin as Record<string, unknown> | undefined;
  const isStr = (v: unknown) => typeof v === 'string' && v.length > 0;
  const pin =
    p && isStr(p.salt) && isStr(p.hash) && isStr(p.recoverySalt) && isStr(p.recoveryHash) && typeof p.iterations === 'number' && p.iterations >= 10_000
      ? (p as unknown as PinRecord)
      : undefined;
  const lock = typeof r.lockAfterMinutes === 'number' && LOCK_OPTIONS.includes(r.lockAfterMinutes) ? r.lockAfterMinutes : undefined;
  if (!pin && lock === undefined) return undefined;
  return { pin, lockAfterMinutes: lock };
}
