import { describe, expect, it } from 'vitest';
import { calculateUnit } from './rentEngine';
import {
  buildUnitView,
  buildUnitViews,
  createUnitWithTenancy,
  currentTenancyOf,
  depositsHeld,
  planSettlement,
  splitUnitView,
} from './tenancy';
import { Charge, Payment, Tenancy, UnitRecord } from '../types';

const unit: UnitRecord = { id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' };

function tenancy(overrides: Partial<Tenancy> = {}): Tenancy {
  return {
    id: 't1',
    unitId: 'u1',
    tenant: 'Ali',
    phone: '968',
    rent: 200,
    every: 1,
    firstDue: '2026-01-01',
    rentHistory: [{ from: '2026-01-01', rent: 200 }],
    ...overrides,
  };
}

let seq = 0;
function pay(amount: number, date: string, extra: Partial<Payment> = {}): Payment {
  seq += 1;
  return { id: `p${seq}`, unitId: 'u1', tenancyId: 't1', amount, date, ts: seq, ...extra };
}

describe('current tenancy and views', () => {
  it('picks the tenancy that has not ended', () => {
    const old = tenancy({ id: 'old', firstDue: '2025-01-01', endedAt: '2025-12-31' });
    const cur = tenancy({ id: 'cur', firstDue: '2026-01-01' });
    expect(currentTenancyOf('u1', [old, cur])?.id).toBe('cur');
    expect(currentTenancyOf('u1', [old])).toBeUndefined();
  });

  it('shows a unit with no current tenancy as vacant', () => {
    const [view] = buildUnitViews([unit], [tenancy({ endedAt: '2026-03-01' })], []);
    expect(view.isVacant).toBe(true);
    const calc = calculateUnit(view, [], '2026-05-01');
    expect(calc.status).toBe('vacant');
    expect(calc.balance).toBe(0);
  });

  it('round-trips a view back into unit + tenancy records', () => {
    const t = tenancy();
    const view = buildUnitView(unit, t, []);
    const { unit: u2, tenancy: t2 } = splitUnitView({ ...view, building: 'New Tower', tenant: 'Sara' }, t);
    expect(u2).toEqual({ ...unit, building: 'New Tower' });
    expect(t2).toMatchObject({ id: 't1', unitId: 'u1', tenant: 'Sara', rent: 200 });
  });

  it('creates a unit with its first tenancy and rent history', () => {
    const { unit: u, tenancy: t } = createUnitWithTenancy({
      building: 'B', name: 'N', type: 'Shop', tenant: 'T', phone: '', rent: 90, every: 3, firstDue: '2026-02-01',
    });
    expect(t.unitId).toBe(u.id);
    expect(t.rentHistory).toEqual([{ from: '2026-02-01', rent: 90 }]);
    expect(u).not.toHaveProperty('rent');
  });
});

describe('balances per tenancy', () => {
  it('never mixes payments from a previous tenant into the new tenancy', () => {
    const old = tenancy({ id: 'old', tenant: 'Ali', firstDue: '2025-01-01', endedAt: '2026-01-01' });
    const cur = tenancy({ id: 'cur', tenant: 'Sara', firstDue: '2026-01-01' });
    const payments = [pay(5000, '2025-06-01', { tenancyId: 'old' }), pay(200, '2026-01-01', { tenancyId: 'cur' })];
    const [view] = buildUnitViews([unit], [old, cur], []);
    const calc = calculateUnit(view, payments, '2026-01-15');
    expect(view.tenant).toBe('Sara');
    expect(calc.totalPaid).toBe(200);
    expect(calc.advanceCredit).toBe(0);
  });

  it('stops generating rent at the move-out date', () => {
    const ended = buildUnitView(unit, tenancy({ endedAt: '2026-03-15' }), []);
    const calc = calculateUnit(ended, [], '2026-12-31');
    expect(calc.dueItems.map((d) => d.dueDate)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
    expect(calc.balance).toBe(600);
  });

  it('does not charge a due that falls on the move-out day itself', () => {
    const ended = buildUnitView(unit, tenancy({ endedAt: '2026-03-01' }), []);
    expect(calculateUnit(ended, [], '2026-12-31').balance).toBe(400);
  });

  it('adds one-off charges to what is owed, in date order', () => {
    const charges: Charge[] = [
      { id: 'c1', unitId: 'u1', tenancyId: 't1', date: '2026-01-10', label: 'Water bill', kind: 'utility', amount: 15 },
      { id: 'c2', unitId: 'u1', tenancyId: 'other', date: '2026-01-10', label: 'Not ours', kind: 'other', amount: 999 },
    ];
    const view = buildUnitView(unit, tenancy(), charges);
    const calc = calculateUnit(view, [pay(200, '2026-01-01')], '2026-01-20');
    expect(calc.dueItems.map((d) => d.label)).toEqual(['Rent', 'Water bill', 'Rent']);
    expect(calc.balance).toBe(15);
    expect(calc.status).toBe('overdue');
  });

  it('counts cheques only once cleared, and never counts voided payments', () => {
    const view = buildUnitView(unit, tenancy(), []);
    const payments = [
      pay(200, '2026-01-01', { method: 'cheque', cheque: { number: '1', date: '2026-01-01', status: 'cleared' } }),
      pay(200, '2026-02-01', { method: 'cheque', cheque: { number: '2', date: '2026-02-01', status: 'pending' } }),
      pay(200, '2026-02-01', { method: 'cheque', cheque: { number: '3', date: '2026-02-01', status: 'bounced' } }),
      pay(200, '2026-02-01', { voidedAt: 5 }),
    ];
    const calc = calculateUnit(view, payments, '2026-02-10');
    expect(calc.totalPaid).toBe(200);
    expect(calc.balance).toBe(200);
    expect(calc.pendingChequeTotal).toBe(200);
  });

  it('treats payments without a cheque status (older data) as paid', () => {
    const view = buildUnitView(unit, tenancy(), []);
    const calc = calculateUnit(view, [pay(200, '2026-01-01', { note: 'Cheque #44' })], '2026-01-05');
    expect(calc.balance).toBe(0);
  });
});

describe('deposit settlement', () => {
  const deposit = { amount: 300 };

  it('uses the deposit for unpaid rent first, then deductions, and refunds the rest', () => {
    const plan = planSettlement(deposit, 120, [{ amount: 50 }], true);
    expect(plan).toEqual({ depositHeld: 300, appliedToBalance: 120, deductionsTotal: 50, refunded: 130, balanceStillOwed: 0 });
  });

  it('leaves the balance owed when the deposit is not applied', () => {
    const plan = planSettlement(deposit, 120, [], false);
    expect(plan).toMatchObject({ appliedToBalance: 0, refunded: 300, balanceStillOwed: 120 });
  });

  it('reports what is still owed when the balance exceeds the deposit', () => {
    const plan = planSettlement(deposit, 450, [], true);
    expect(plan).toMatchObject({ appliedToBalance: 300, refunded: 0, balanceStillOwed: 150 });
  });

  it('rejects deductions larger than what is left of the deposit', () => {
    expect(() => planSettlement(deposit, 250, [{ amount: 100 }], true)).toThrow(/more than the deposit/);
  });

  it('works with no deposit at all', () => {
    expect(planSettlement(undefined, 80, [], true)).toMatchObject({ depositHeld: 0, refunded: 0, balanceStillOwed: 80 });
  });

  it('totals deposits held only for current, unsettled tenancies', () => {
    const list = [
      tenancy({ id: 'a', deposit: { amount: 100 } }),
      tenancy({ id: 'b', deposit: { amount: 50 }, endedAt: '2026-01-01' }),
      tenancy({ id: 'c', deposit: { amount: 70, settlement: { date: '2026-01-01', appliedToBalance: 0, deductions: [], refunded: 70 } } }),
      tenancy({ id: 'd' }),
    ];
    expect(depositsHeld(list)).toBe(100);
  });
});
