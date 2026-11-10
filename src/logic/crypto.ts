/**
 * End-to-end encryption for sync. Records are encrypted on the device with AES-GCM using a key
 * derived from the sync passphrase (PBKDF2-SHA256). The server only ever stores ciphertext.
 */

export interface EncryptedPayload {
  iv: string; // base64, 12 bytes
  ct: string; // base64 ciphertext + tag
}

export const KEY_ITERATIONS = 250_000;
/** Known text encrypted with the key, so another device can tell whether a passphrase is right. */
const VERIFIER_TEXT = 'rent-tracker-sync-v1';
export const MIN_PASSPHRASE_LENGTH = 10;

function toB64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toB64(bytes);
}

export async function deriveSyncKey(
  passphrase: string,
  saltB64: string,
  iterations = KEY_ITERATIONS,
  extractable = false
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

/** Keeps the derived key on this device so the passphrase is not asked for on every start. */
export async function exportKey(key: CryptoKey): Promise<string> {
  return toB64(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export function importKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromB64(rawB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

/** Throws if the key is wrong or the data was tampered with (AES-GCM authenticates). */
export async function decryptJson<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export function makeVerifier(key: CryptoKey): Promise<EncryptedPayload> {
  return encryptJson(key, VERIFIER_TEXT);
}

export async function checkVerifier(key: CryptoKey, verifier: EncryptedPayload): Promise<boolean> {
  try {
    return (await decryptJson<string>(key, verifier)) === VERIFIER_TEXT;
  } catch {
    return false;
  }
}

export function isAcceptablePassphrase(p: string): boolean {
  return p.trim().length >= MIN_PASSPHRASE_LENGTH;
}
