import { describe, expect, it } from 'vitest';
import { matchesUnitQuery, searchAll, SearchSource } from './search';

const src: SearchSource = {
  units: [
    { id: 'u1', building: 'Al Andalus Tower', name: 'Flat 101', type: 'Flat' },
    { id: 'u2', building: 'Ruwi Plaza', name: 'Shop 3', type: 'Shop' },
  ],
  tenancies: [
    { id: 't1', unitId: 'u1', tenant: 'Sara Al-Hinai', phone: '+968 9988 7766', rent: 1, every: 1, firstDue: '2026-01-01' },
    { id: 't0', unitId: 'u1', tenant: 'Salim Old', phone: '', rent: 1, every: 1, firstDue: '2025-01-01', endedAt: '2025-12-31' },
    { id: 't2', unitId: 'u2', tenant: 'Golden Spices LLC', phone: '96895551212', rent: 1, every: 1, firstDue: '2026-01-01' },
  ],
  payments: [
    { id: 'p1', unitId: 'u1', tenancyId: 't1', amount: 1, date: '2026-02-01', ts: 1, receiptNo: 42, receiptPrefix: 'R-' },
    { id: 'p2', unitId: 'u2', tenancyId: 't2', amount: 1, date: '2026-03-01', ts: 2, cheque: { number: '000501', date: '2026-03-01', status: 'pending' } },
  ],
  settings: { receiptPrefix: 'AT-' },
};

const labels = (q: string) => searchAll(q, src).map((r) => `${r.kind}:${r.label}`);

describe('searchAll', () => {
  it('needs at least two characters', () => {
    expect(searchAll('s', src)).toEqual([]);
  });

  it('finds tenants by any word, current tenants before former ones', () => {
    expect(labels('sa')).toEqual(['tenant:Sara Al-Hinai', 'tenant:Salim Old']);
  });

  it('finds units by building or unit name', () => {
    expect(labels('ruwi')).toEqual(['unit:Ruwi Plaza · Shop 3']);
    expect(labels('flat 101')).toEqual(['unit:Al Andalus Tower · Flat 101']);
  });

  it('finds tenants by phone digits, however the number is written', () => {
    expect(labels('99887766')).toEqual(['tenant:Sara Al-Hinai']);
    expect(labels('9988 7766')).toEqual(['tenant:Sara Al-Hinai']);
  });

  it('finds receipts by full number or its digits, using the prefix it was issued with', () => {
    expect(labels('R-000042')).toEqual(['receipt:Receipt R-000042']);
    expect(labels('42')).toEqual(['receipt:Receipt R-000042']);
  });

  it('finds cheques by number and points at the payment', () => {
    const [hit] = searchAll('000501', src);
    expect(hit).toMatchObject({ kind: 'cheque', label: 'Cheque #000501', unitId: 'u2', paymentId: 'p2' });
  });
});

describe('matchesUnitQuery', () => {
  const u = { building: 'Ruwi Plaza', name: 'Shop 3', tenant: 'Golden Spices LLC', phone: '+968 9555 1212' };
  it('matches building, unit, tenant and phone digits; empty matches all', () => {
    expect(matchesUnitQuery(u, '')).toBe(true);
    expect(matchesUnitQuery(u, 'spices')).toBe(true);
    expect(matchesUnitQuery(u, 'shop 3')).toBe(true);
    expect(matchesUnitQuery(u, '95551212')).toBe(true);
    expect(matchesUnitQuery(u, 'tower')).toBe(false);
  });
});
