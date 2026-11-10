import { describe, expect, it } from 'vitest';
import { attentionSummary, buildAttentionItems } from './attention';
import { Payment, Unit } from '../types';

const TODAY = '2026-11-05';

const unit = (overrides: Partial<Unit>): Unit => ({
  id: 'u',
  tenancyId: 't',
  building: 'Tower',
  name: 'Flat',
  type: 'Flat',
  tenant: 'Ali',
  phone: '',
  rent: 100,
  every: 1,
  firstDue: '2026-11-01',
  rentHistory: [{ from: '2026-11-01', rent: 100 }],
  ...overrides,
});

const cheque = (id: string, unitId: string, date: string, status: 'pending' | 'cleared' = 'pending'): Payment => ({
  id,
  unitId,
  tenancyId: `t-${unitId}`,
  amount: 100,
  date,
  ts: 1,
  method: 'cheque',
  cheque: { number: id, date, status },
});

describe('buildAttentionItems', () => {
  it('is empty when everything is in order', () => {
    const paid = unit({ id: 'u1', tenancyId: 't-u1' });
    const payments: Payment[] = [{ id: 'p', unitId: 'u1', tenancyId: 't-u1', amount: 100, date: '2026-11-01', ts: 1 }];
    expect(buildAttentionItems([paid], payments, 'OMR', TODAY)).toEqual([]);
  });

  it('lists what needs doing, most urgent first', () => {
    const units = [
      unit({ id: 'u1', tenancyId: 't-u1', tenant: 'Old Debt', firstDue: '2026-08-01', rentHistory: [{ from: '2026-08-01', rent: 100 }] }),
      unit({ id: 'u2', tenancyId: 't-u2', leaseEnd: '2026-11-20' }),
      unit({ id: 'u3', tenancyId: 't-u3', leaseEnd: '2026-10-31' }),
      unit({ id: 'u4', isVacant: true, tenancyId: undefined, tenant: '', building: 'Plaza', name: 'Shop 1' }),
      unit({ id: 'u5', archivedAt: 1, isVacant: true, tenancyId: undefined }),
    ];
    const payments = [cheque('c1', 'u2', '2026-11-05'), cheque('c2', 'u2', '2026-12-05'), cheque('c3', 'u3', '2026-11-01', 'cleared')];
    const items = buildAttentionItems(units, payments, 'OMR', TODAY);
    expect(items.map((i) => [i.kind, i.title])).toEqual([
      ['cheques_to_deposit', '1 cheque to deposit'],
      ['long_overdue', '1 tenant overdue more than 30 days'],
      ['leases_ending', '2 leases ending within 30 days'],
      ['vacant', '1 unit is vacant'],
    ]);
    expect(items[0].detail).toContain('OMR 100');
    expect(items[1].detail).toContain('Old Debt (96 days)');
    expect(items[2].detail).toContain('1 already ended');
    expect(items[3].detail).toBe('Plaza · Shop 1');
  });

  it('summarises for a notification', () => {
    const items = buildAttentionItems([unit({ id: 'u4', isVacant: true, tenancyId: undefined })], [], 'OMR', TODAY);
    expect(attentionSummary(items)).toBe('1 unit is vacant');
  });
});
