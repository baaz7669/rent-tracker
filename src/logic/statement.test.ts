import { describe, expect, it } from 'vitest';
import { buildStatement, buildStatementMessage } from './statement';
import { calculateUnit } from './rentEngine';
import { Payment, Unit } from '../types';

const unit: Unit = {
  id: 'u1',
  tenancyId: 't1',
  building: 'Tower',
  name: 'Flat 1',
  type: 'Flat',
  tenant: 'Ali',
  phone: '',
  rent: 200,
  every: 1,
  firstDue: '2026-01-01',
  opening: 50,
  rentHistory: [{ from: '2026-01-01', rent: 200 }],
  charges: [{ id: 'c1', unitId: 'u1', tenancyId: 't1', date: '2026-02-10', label: 'Water bill', kind: 'utility', amount: 12 }],
};

let seq = 0;
const pay = (amount: number, date: string, extra: Partial<Payment> = {}): Payment => ({
  id: `p${++seq}`,
  unitId: 'u1',
  tenancyId: 't1',
  amount,
  date,
  ts: seq,
  ...extra,
});

describe('buildStatement', () => {
  const payments = [
    pay(250, '2026-01-01', { method: 'cash' }),
    pay(212, '2026-02-15', { method: 'transfer', reference: 'TX1' }),
    pay(200, '2026-03-01', { method: 'cheque', cheque: { number: '9', date: '2026-03-01', status: 'pending' } }),
    pay(999, '2026-02-20', { voidedAt: 1 }),
    pay(500, '2026-01-05', { tenancyId: 'previous-tenant' }),
  ];

  it('lists dues and payments in date order with a running balance', () => {
    const s = buildStatement(unit, payments, '2026-03-10');
    expect(s.lines.map((l) => [l.date, l.description, l.charge, l.payment, l.balance])).toEqual([
      ['2026-01-01', 'Previous balance brought forward', 50, 0, 50],
      ['2026-01-01', 'Rent due 2026-01-01', 200, 0, 250],
      ['2026-01-01', 'Payment received (Cash)', 0, 250, 0],
      ['2026-02-01', 'Rent due 2026-02-01', 200, 0, 200],
      ['2026-02-10', 'Water bill', 12, 0, 212],
      ['2026-02-15', 'Payment received (Bank transfer (TX1))', 0, 212, 0],
      ['2026-03-01', 'Rent due 2026-03-01', 200, 0, 200],
    ]);
    expect(s).toMatchObject({ totalCharged: 662, totalPaid: 462, closingBalance: 200 });
  });

  it('shows pending cheques separately without counting them', () => {
    const s = buildStatement(unit, payments, '2026-03-10');
    expect(s.pendingCheques).toEqual([{ date: '2026-03-01', description: 'Cheque #9', amount: 200 }]);
  });

  it('agrees with the balance shown everywhere else in the app', () => {
    const s = buildStatement(unit, payments, '2026-03-10');
    expect(s.closingBalance).toBe(calculateUnit(unit, payments, '2026-03-10').balance);
  });

  it('shows credit as a negative balance when the tenant paid ahead', () => {
    const s = buildStatement({ ...unit, opening: 0, charges: [] }, [pay(500, '2026-01-01', { tenancyId: 't1' })], '2026-01-15');
    expect(s.closingBalance).toBe(-300);
  });

  it('is empty for a vacant unit', () => {
    const s = buildStatement({ ...unit, isVacant: true, tenancyId: undefined, id: 'u9' }, [], '2026-03-10');
    expect(s.lines).toEqual([]);
    expect(s.closingBalance).toBe(0);
  });
});

describe('buildStatementMessage', () => {
  it('summarises totals, balance and pending cheques', () => {
    const s = buildStatement(unit, [pay(100, '2026-01-01'), pay(200, '2026-03-01', { cheque: { number: '1', date: '2026-03-01', status: 'pending' } })], '2026-01-15');
    const msg = buildStatementMessage(unit, s, 'OMR', 'Hamed');
    expect(msg).toContain('Total due: OMR 250');
    expect(msg).toContain('Total paid: OMR 100');
    expect(msg).toContain('Balance outstanding: OMR 150');
    expect(msg).toContain('Cheques awaiting clearance: 1 (OMR 200)');
    expect(msg).toContain('— Hamed');
  });
});
