import { describe, expect, it } from 'vitest';
import { appendActivity, Collections, eraseAllRecords, liveView, loadDeviceIdentity, MAX_ACTIVITY, nextReceiptNumber, stampChanges } from './syncModel';
import { Payment } from '../types';

const empty = (): Collections => ({ units: [], tenancies: [], payments: [], charges: [], expenses: [] });
let n = 0;
const id = () => `a${++n}`;

describe('stampChanges', () => {
  const unit = { id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' as const };

  it('stamps new records and logs them', () => {
    const { raw, activity } = stampChanges(empty(), { ...empty(), units: [unit] }, 1000, 'pc', id);
    expect(raw.units[0]).toMatchObject({ id: 'u1', updatedAt: 1000, updatedBy: 'pc' });
    expect(activity.map((a) => a.summary)).toEqual(['Added unit: Tower · Flat 1']);
  });

  it('leaves unchanged records untouched and stamps only real changes', () => {
    const first = stampChanges(empty(), { ...empty(), units: [unit] }, 1000, 'pc', id).raw;
    const same = stampChanges(first, liveView(first), 2000, 'pc', id);
    expect(same.raw.units[0].updatedAt).toBe(1000);
    expect(same.activity).toEqual([]);
    const renamed = stampChanges(first, { ...empty(), units: [{ ...first.units[0], name: 'Flat 2' }] }, 3000, 'phone', id);
    expect(renamed.raw.units[0]).toMatchObject({ name: 'Flat 2', updatedAt: 3000, updatedBy: 'phone' });
    expect(renamed.activity[0].summary).toBe('Changed unit: Tower · Flat 2');
  });

  it('turns removals into tombstones that the live view hides', () => {
    const first = stampChanges(empty(), { ...empty(), units: [unit] }, 1000, 'pc', id).raw;
    const { raw, activity } = stampChanges(first, empty(), 2000, 'pc', id);
    expect(raw.units).toEqual([{ ...first.units[0], deletedAt: 2000, updatedAt: 2000, updatedBy: 'pc' }]);
    expect(liveView(raw).units).toEqual([]);
    expect(activity[0].summary).toBe('Deleted unit: Tower · Flat 1');
    // the tombstone survives later saves
    const later = stampChanges(raw, liveView(raw), 3000, 'pc', id);
    expect(later.raw.units[0].deletedAt).toBe(2000);
  });

  it('logs voiding a payment', () => {
    const pay: Payment = { id: 'p1', unitId: 'u1', amount: 220, date: '2026-01-01', ts: 1, receiptNo: 1 };
    const first = stampChanges(empty(), { ...empty(), units: [unit], payments: [pay] }, 1000, 'pc', id).raw;
    const { activity } = stampChanges(first, { ...liveView(first), payments: [{ ...first.payments[0], voidedAt: 5 }] }, 2000, 'pc', id);
    expect(activity[0].summary).toBe('Voided payment: 220 (Tower · Flat 1)');
  });
});

describe('activity log', () => {
  it('keeps newest first and caps its size', () => {
    const entry = (i: number) => ({ id: `e${i}`, at: i, deviceId: 'pc', summary: `s${i}` });
    const log = appendActivity([entry(1)], [entry(2), entry(3)]);
    expect(log.map((e) => e.id)).toEqual(['e3', 'e2', 'e1']);
    const big = appendActivity(Array.from({ length: MAX_ACTIVITY }, (_, i) => entry(i)), [entry(9999)]);
    expect(big).toHaveLength(MAX_ACTIVITY);
    expect(big[0].id).toBe('e9999');
  });
});

describe('nextReceiptNumber', () => {
  const p = (no: number, prefix?: string, extra: Partial<Payment> = {}): Payment => ({
    id: `p${no}${prefix}`, unitId: 'u', amount: 1, date: '2026-01-01', ts: 1, receiptNo: no, receiptPrefix: prefix, ...extra,
  });

  it('continues each device series independently', () => {
    const payments = [p(4, 'R-'), p(7, 'R-'), p(2, 'P-')];
    expect(nextReceiptNumber(payments, 'R-')).toBe(8);
    expect(nextReceiptNumber(payments, 'P-')).toBe(3);
    expect(nextReceiptNumber(payments, 'X-')).toBe(1);
  });

  it('never reuses voided or deleted numbers and respects a higher starting number', () => {
    const payments = [p(9, 'R-', { voidedAt: 1 }), p(10, 'R-', { deletedAt: 2 })];
    expect(nextReceiptNumber(payments, 'R-')).toBe(11);
    expect(nextReceiptNumber(payments, 'R-', 100)).toBe(100);
  });

  it('treats old payments without a stored prefix as the R- series', () => {
    expect(nextReceiptNumber([p(5, undefined)], 'R-')).toBe(6);
  });
});

describe('device identity', () => {
  it('creates an id once and reuses it', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const a = loadDeviceIdentity(storage, () => 'dev-1');
    const b = loadDeviceIdentity(storage, () => 'dev-2');
    expect(a.id).toBe('dev-1');
    expect(b.id).toBe('dev-1');
  });
});

describe('eraseAllRecords', () => {
  const paid = (receiptNo: number, deletedAt?: number): Payment =>
    ({ id: `p${receiptNo}`, receiptNo, receiptPrefix: 'R-', deletedAt }) as unknown as Payment;
  const db = () => ({
    ...empty(),
    units: [{ id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' as const }],
    payments: [paid(7), paid(9, 500)],
    activity: [{ id: 'a', at: 1, deviceId: 'pc', summary: 'Added unit: Tower · Flat 1' }],
    settings: { currency: 'OMR', receiptPrefix: 'R-', nextReceiptNo: 3 },
    updatedAt: 1
  });

  it('removes every record, including hidden deletion markers, and clears recent activity', () => {
    const out = eraseAllRecords(db(), 2000);
    for (const name of ['units', 'tenancies', 'payments', 'charges', 'expenses'] as const) expect(out[name]).toEqual([]);
    expect(out.activity).toEqual([]);
    expect(out.updatedAt).toBe(2000);
  });

  it('keeps settings and continues receipt numbers after the highest one issued', () => {
    const out = eraseAllRecords(db(), 2000);
    expect(out.settings).toMatchObject({ currency: 'OMR', receiptPrefix: 'R-', nextReceiptNo: 10 });
  });

  it('does not change the database it was given', () => {
    const before = db();
    eraseAllRecords(before, 2000);
    expect(before.units).toHaveLength(1);
    expect(before.activity).toHaveLength(1);
  });
});
