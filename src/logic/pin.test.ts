import { describe, expect, it } from 'vitest';
import {
  cleanSecurity,
  createPinRecord,
  generateRecoveryCode,
  isValidPin,
  normalizeRecoveryCode,
  verifyPin,
  verifyRecoveryCode,
} from './pin';

// Fewer iterations keep the tests fast; the app uses PIN_ITERATIONS.
const FAST = 10_000;

describe('PIN rules', () => {
  it('accepts 4 to 8 digits only', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('12345678')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('123456789')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });
});

describe('PIN record', () => {
  it('never stores the PIN itself, and verifies only the right PIN', async () => {
    const { record, recoveryCode } = await createPinRecord('4821', FAST);
    expect(JSON.stringify(record)).not.toContain('4821');
    expect(JSON.stringify(record)).not.toContain(recoveryCode);
    expect(await verifyPin('4821', record)).toBe(true);
    expect(await verifyPin('4822', record)).toBe(false);
    expect(await verifyPin('', record)).toBe(false);
  });

  it('uses a fresh salt each time', async () => {
    const a = await createPinRecord('4821', FAST);
    const b = await createPinRecord('4821', FAST);
    expect(a.record.salt).not.toBe(b.record.salt);
    expect(a.record.hash).not.toBe(b.record.hash);
  });

  it('accepts the recovery code however it is typed back', async () => {
    const { record, recoveryCode } = await createPinRecord('4821', FAST);
    expect(await verifyRecoveryCode(recoveryCode, record)).toBe(true);
    expect(await verifyRecoveryCode(recoveryCode.toLowerCase().replace(/-/g, ' '), record)).toBe(true);
    expect(await verifyRecoveryCode('AAAA-BBBB-CCCC', record)).toBe(false);
  });

  it('rejects an invalid PIN when creating', async () => {
    await expect(createPinRecord('12')).rejects.toThrow(/4 to 8 digits/);
  });
});

describe('recovery codes and settings', () => {
  it('formats codes without look-alike characters', () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeRecoveryCode('k7qm 3xra pz9d')).toBe('K7QM-3XRA-PZ9D');
  });

  it('keeps only a well-formed security block', async () => {
    const { record } = await createPinRecord('4821', FAST);
    expect(cleanSecurity({ pin: record, lockAfterMinutes: 10 })).toEqual({ pin: record, lockAfterMinutes: 10 });
    expect(cleanSecurity({ pin: { hash: 'x' }, lockAfterMinutes: 7 })).toBeUndefined();
    expect(cleanSecurity({ pin: { ...record, iterations: 5 } })).toBeUndefined();
    expect(cleanSecurity(null)).toBeUndefined();
  });
});
