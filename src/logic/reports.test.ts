import { describe, expect, it } from 'vitest';
import {
  arrearsAgeing,
  buildingSummary,
  monthEnd,
  monthlySummary,
  monthsInPeriod,
  occupancy,
  periodTotals,
  presetPeriod,
  ReportSource,
  tenancyEntries,
} from './reports';
import { calculateUnit } from './rentEngine';
import { Payment, Tenancy } from '../types';

const tenancy = (t: Partial<Tenancy> & Pick<Tenancy, 'id' | 'unitId' | 'tenant' | 'rent' | 'firstDue'>): Tenancy => ({
  phone: '',
  every: 1,
  rentHistory: [{ from: t.firstDue, rent: t.rent }],
  ...t,
});

let seq = 0;
const pay = (tenancyId: string, unitId: string, amount: number, date: string, extra: Partial<Payment> = {}): Payment => ({
  id: `p${++seq}`,
  unitId,
  tenancyId,
  amount,
  date,
  ts: seq,
  ...extra,
});

const src: ReportSource = {
  units: [
    { id: 'u1', building: 'Tower A', name: 'Flat 1', type: 'Flat' },
    { id: 'u2', building: 'Tower A', name: 'Flat 2', type: 'Flat' },
    { id: 'u3', building: 'Tower B', name: 'Shop 1', type: 'Shop' },
    { id: 'u4', building: 'Tower B', name: 'Old', type: 'Shop', archivedAt: 1 },
  ],
  tenancies: [
    tenancy({ id: 't1', unitId: 'u1', tenant: 'Ali', rent: 100, firstDue: '2026-01-01', deposit: { amount: 200 } }),
    tenancy({ id: 't2', unitId: 'u2', tenant: 'Sara', rent: 200, firstDue: '2026-01-01', endedAt: '2026-03-01' }),
    tenancy({ id: 't3', unitId: 'u3', tenant: 'Omar', rent: 300, firstDue: '2026-02-15' }),
  ],
  charges: [{ id: 'c1', unitId: 'u1', tenancyId: 't1', date: '2026-02-10', label: 'Water', kind: 'utility', amount: 20 }],
  payments: [
    pay('t1', 'u1', 100, '2026-01-01'),
    pay('t1', 'u1', 120, '2026-02-10'),
    pay('t1', 'u1', 100, '2026-03-01', { cheque: { number: '1', date: '2026-03-01', status: 'pending' } }),
    pay('t2', 'u2', 200, '2026-01-05'),
    pay('t3', 'u3', 300, '2026-02-15'),
    pay('t3', 'u3', 300, '2026-03-15', { cheque: { number: '2', date: '2026-03-15', status: 'bounced' } }),
    pay('t3', 'u3', 999, '2026-03-16', { voidedAt: 1 }),
  ],
  expenses: [
    { id: 'e1', date: '2026-02-01', amount: 50, category: 'maintenance', building: 'Tower A' },
    { id: 'e2', date: '2026-03-05', amount: 30, category: 'utilities', unitId: 'u3' },
    { id: 'e3', date: '2025-12-31', amount: 999, category: 'other' },
  ],
};

const Q1 = { from: '2026-01-01', to: '2026-03-31' };
const AS_OF = '2026-03-20';

describe('periods', () => {
  it('lists months across a year boundary and finds month ends', () => {
    expect(monthsInPeriod({ from: '2025-11-15', to: '2026-02-01' })).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthEnd('2028-02')).toBe('2028-02-29');
  });

  it('builds preset periods ending this month', () => {
    expect(presetPeriod('this_month', '2026-11-05')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(presetPeriod('last_3', '2026-11-05')).toEqual({ from: '2026-09-01', to: '2026-11-30' });
    expect(presetPeriod('last_12', '2026-11-05')).toEqual({ from: '2025-12-01', to: '2026-11-30' });
    expect(presetPeriod('this_year', '2026-11-05')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('monthlySummary', () => {
  const rows = monthlySummary(src, Q1);

  it('totals dues, cleared collections and expenses per month', () => {
    expect(rows).toEqual([
      { month: '2026-01', due: 300, collected: 300, expenses: 0, net: 300 },
      // Ali 100 + water 20 + Sara 200 + Omar 300; collected Ali 120 + Omar 300; Tower A repair 50
      { month: '2026-02', due: 620, collected: 420, expenses: 50, net: 370 },
      // Sara moved out on 1 March, so her March rent is not due; pending and bounced cheques do not count
      { month: '2026-03', due: 400, collected: 0, expenses: 30, net: -30 },
    ]);
  });

  it('gives period totals and a collection rate', () => {
    const t = periodTotals(rows);
    expect(t).toMatchObject({ due: 1320, collected: 720, expenses: 80, net: 640 });
    expect(t.collectionRate).toBeCloseTo(720 / 1320);
    expect(periodTotals([]).collectionRate).toBeNull();
  });
});

describe('arrearsAgeing', () => {
  const ageing = arrearsAgeing(src, AS_OF);

  it('splits what each tenant owes by age, oldest first, including former tenants', () => {
    expect(ageing.rows.map((r) => [r.tenant, r.isFormerTenant, r.buckets, r.total, r.oldestDays])).toEqual([
      ['Sara', true, [0, 200, 0, 0], 200, 47],
      ['Ali', false, [100, 0, 0, 0], 100, 19],
      ['Omar', false, [300, 0, 0, 0], 300, 5],
    ]);
    expect(ageing.totals).toEqual([400, 200, 0, 0]);
    expect(ageing.total).toBe(600);
  });

  it('agrees with the balances shown on the unit screens', () => {
    const fromEngine = tenancyEntries(src).reduce((s, e) => s + calculateUnit(e.view, src.payments, AS_OF).balance, 0);
    expect(ageing.total).toBe(fromEngine);
  });
});

describe('occupancy', () => {
  const occ = occupancy(src, Q1, AS_OF);

  it('counts vacant days only up to today and only after tracking started, ignoring archived units', () => {
    expect(occ.units.map((u) => [u.unitLabel, u.isVacantNow, u.vacantDays, u.periodDays])).toEqual([
      ['Tower A · Flat 1', false, 0, 79],
      ['Tower A · Flat 2', true, 20, 79], // empty from 1 to 20 March
      ['Tower B · Shop 1', false, 0, 34], // first tracked when Omar moved in on 15 February
    ]);
    expect(occ).toMatchObject({ occupiedNow: 2, vacantNow: 1 });
    expect(occ.rateNow).toBeCloseTo(2 / 3);
    expect(occ.ratePeriod).toBeCloseTo((192 - 20) / 192);
  });

  it('counts a unit as vacant from the day it was added when it never had a tenant', () => {
    const added = new Date(2026, 2, 11).getTime(); // 11 March 2026, local time
    const withEmpty = { ...src, units: [...src.units, { id: 'u5', building: 'Tower B', name: 'Shop 2', type: 'Shop' as const, createdAt: added }] };
    const shop2 = occupancy(withEmpty, Q1, AS_OF).units.find((u) => u.unitId === 'u5')!;
    expect([shop2.isVacantNow, shop2.vacantDays, shop2.periodDays]).toEqual([true, 10, 10]);
  });
});

describe('buildingSummary', () => {
  it('compares buildings on units, money in, arrears, deposits and expenses', () => {
    expect(buildingSummary(src, Q1, AS_OF)).toEqual([
      { building: 'Tower A', units: 2, occupied: 1, vacant: 1, due: 720, collected: 420, arrears: 300, depositsHeld: 200, expenses: 50, net: 370 },
      { building: 'Tower B', units: 1, occupied: 1, vacant: 0, due: 600, collected: 300, arrears: 300, depositsHeld: 0, expenses: 30, net: 270 },
    ]);
  });
});
