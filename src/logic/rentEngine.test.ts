import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  buildWhatsAppLink,
  calculateUnit,
  daysBetween,
  generateDueDates,
  getLeaseAlerts,
  mergeUnitUpdate,
  nextDueDateOnOrAfter,
  parseBulkImport,
  rentForDueDate,
} from './rentEngine';
import { Payment, Unit } from '../types';

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'u1',
    building: 'Tower',
    name: 'Flat 1',
    type: 'Flat',
    tenant: 'Ali',
    phone: '96891234567',
    rent: 200,
    every: 1,
    firstDue: '2026-01-01',
    opening: 0,
    ...overrides,
  };
}

let paySeq = 0;
function pay(amount: number, date: string, unitId = 'u1'): Payment {
  paySeq += 1;
  return { id: `p${paySeq}`, unitId, amount, date, ts: paySeq };
}

describe('date helpers', () => {
  it('clamps month-end dates instead of overflowing', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29'); // leap year
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('counts days across month and year boundaries', () => {
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(1);
    expect(daysBetween('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-10')).toBe(-9);
  });
});

describe('generateDueDates', () => {
  it('generates monthly dues up to and including the first one after today', () => {
    const items = generateDueDates(makeUnit(), '2026-03-15');
    expect(items.map(i => i.dueDate)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('respects quarterly cycles', () => {
    const items = generateDueDates(makeUnit({ every: 3 }), '2026-05-01');
    expect(items.map(i => i.dueDate)).toEqual(['2026-01-01', '2026-04-01', '2026-07-01']);
  });

  it('adds the opening balance as the first item', () => {
    const items = generateDueDates(makeUnit({ opening: 75 }), '2026-01-01');
    expect(items[0]).toMatchObject({ label: 'Previous balance', amount: 75, isPreviousBalance: true });
  });
});

describe('calculateUnit', () => {
  it('marks a unit overdue and counts days from the oldest unpaid due', () => {
    const calc = calculateUnit(makeUnit(), [], '2026-01-11');
    expect(calc.status).toBe('overdue');
    expect(calc.daysOverdue).toBe(10);
    expect(calc.balance).toBe(200);
  });

  it('allocates payments oldest-first and reports part-payment', () => {
    const calc = calculateUnit(makeUnit(), [pay(250, '2026-02-05')], '2026-02-10');
    expect(calc.dueItems[0].remaining).toBe(0);
    expect(calc.dueItems[1]).toMatchObject({ paid: 50, remaining: 150 });
    expect(calc.balance).toBe(150);
    expect(calc.partPaidNote).toContain('2026-02-01');
  });

  it('turns overpayment into advance credit', () => {
    const calc = calculateUnit(makeUnit(), [pay(700, '2026-01-01')], '2026-01-15');
    // Dues generated: Jan + Feb (first after today) = 400
    expect(calc.advanceCredit).toBe(300);
    expect(calc.balance).toBe(0);
    expect(calc.status).toBe('ok');
  });

  it('keeps 3-decimal OMR amounts exact', () => {
    const unit = makeUnit({ rent: 123.456 });
    const calc = calculateUnit(unit, [pay(100.123, '2026-01-01'), pay(23.333, '2026-01-02')], '2026-01-15');
    expect(calc.dueItems[0].remaining).toBe(0);
    expect(calc.balance).toBe(0);
  });

  it('shows "due today" and "due soon" states', () => {
    expect(calculateUnit(makeUnit(), [], '2026-01-01').status).toBe('today');
    const soon = calculateUnit(makeUnit(), [pay(200, '2026-01-01')], '2026-01-27');
    expect(soon.status).toBe('soon');
    expect(soon.daysUntilDue).toBe(5);
  });
});

describe('rent history', () => {
  it('uses the base rent when there is no history (legacy data)', () => {
    expect(rentForDueDate(makeUnit({ rent: 200 }), '2026-05-01')).toBe(200);
  });

  it('picks the latest rent change effective on or before the due date', () => {
    const unit = makeUnit({
      rent: 250,
      rentHistory: [
        { from: '2026-01-01', rent: 200 },
        { from: '2026-04-01', rent: 250 },
      ],
    });
    expect(rentForDueDate(unit, '2026-03-01')).toBe(200);
    expect(rentForDueDate(unit, '2026-04-01')).toBe(250);
    expect(rentForDueDate(unit, '2026-09-01')).toBe(250);
  });

  it('does not rewrite past dues when rent is raised', () => {
    const unit = makeUnit({
      rent: 250,
      rentHistory: [
        { from: '2026-01-01', rent: 200 },
        { from: '2026-04-01', rent: 250 },
      ],
    });
    const payments = [pay(200, '2026-01-01'), pay(200, '2026-02-01'), pay(200, '2026-03-01')];
    const calc = calculateUnit(unit, payments, '2026-03-27');
    expect(calc.balance).toBe(0);
    expect(calc.status).toBe('soon');
    expect(calc.nextUpcomingItem?.amount).toBe(250);
  });

  it('handles history entries given out of order', () => {
    const unit = makeUnit({
      rent: 300,
      rentHistory: [
        { from: '2026-06-01', rent: 300 },
        { from: '2026-01-01', rent: 200 },
      ],
    });
    expect(rentForDueDate(unit, '2026-05-01')).toBe(200);
    expect(rentForDueDate(unit, '2026-06-01')).toBe(300);
  });
});

describe('WhatsApp reminder', () => {
  it('is disabled without a phone number', () => {
    const unit = makeUnit({ phone: '' });
    const link = buildWhatsAppLink(unit, calculateUnit(unit, [], '2026-01-05'), 'OMR');
    expect(link.disabled).toBe(true);
  });

  it('strips formatting and a leading 00 from the phone', () => {
    const unit = makeUnit({ phone: '00968 9123-4567' });
    const link = buildWhatsAppLink(unit, calculateUnit(unit, [], '2026-01-05'), 'OMR');
    expect(link.url.startsWith('https://wa.me/96891234567?text=')).toBe(true);
    expect(decodeURIComponent(link.url)).toContain('OMR 200');
  });
});

describe('lease alerts', () => {
  it('flags leases ending within 90 days, urgent within 30, soonest first', () => {
    const units = [
      makeUnit({ id: 'a', leaseEnd: '2026-03-01' }),
      makeUnit({ id: 'b', leaseEnd: '2026-01-20' }),
      makeUnit({ id: 'c', leaseEnd: '2026-12-01' }),
    ];
    const alerts = getLeaseAlerts(units, '2026-01-10');
    expect(alerts.map(a => a.unit.id)).toEqual(['b', 'a']);
    expect(alerts[0].isUrgent).toBe(true);
    expect(alerts[1].isUrgent).toBe(false);
  });
});

describe('parseBulkImport', () => {
  it('parses CSV with a header, quotes and defaults, and reports skipped rows', () => {
    const text = [
      'Building,Unit,Type,Tenant,Phone,Rent,Every,First due,Lease end',
      '"Tower, A",Flat 1,shop,Ali,968912,150,3,2026-02-01,2027-01-31',
      'Tower,Flat 2,,Sara,,abc,1,,',
      'Tower,,,,,100,7,bad,',
    ].join('\n');
    const result = parseBulkImport(text, '2026-01-01');
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({ building: 'Tower, A', type: 'Shop', every: 3, rent: 150 });
    expect(result.skippedRows.map(r => r.rowNumber)).toEqual([3, 4]);
  });
});

describe('mergeUnitUpdate', () => {
  const base = makeUnit({ rent: 200, rentHistory: [{ from: '2026-01-01', rent: 200 }] });

  it('applies a rent increase from a date and keeps earlier dues at the old rent', () => {
    const updated = mergeUnitUpdate(base, { rent: 250 }, '2026-04-01');
    expect(updated.rent).toBe(250);
    expect(updated.rentHistory).toEqual([
      { from: '2026-01-01', rent: 200 },
      { from: '2026-04-01', rent: 250 },
    ]);
    expect(rentForDueDate(updated, '2026-03-01')).toBe(200);
  });

  it('treats a rent change without a date as a correction for every due', () => {
    const updated = mergeUnitUpdate(base, { rent: 210 });
    expect(updated.rentHistory).toEqual([{ from: '2026-01-01', rent: 210 }]);
  });

  it('builds history from legacy units that have none', () => {
    const legacy = makeUnit({ rent: 200 });
    const updated = mergeUnitUpdate(legacy, { rent: 300 }, '2026-06-01');
    expect(updated.rentHistory).toEqual([
      { from: '2026-01-01', rent: 200 },
      { from: '2026-06-01', rent: 300 },
    ]);
  });

  it('leaves history alone for edits that do not touch rent', () => {
    const updated = mergeUnitUpdate(base, { tenant: 'Sara' }, '2026-04-01');
    expect(updated.rentHistory).toEqual(base.rentHistory);
    expect(updated.tenant).toBe('Sara');
  });

  it('moves a single history entry when the first due date moves', () => {
    const updated = mergeUnitUpdate(base, { firstDue: '2026-02-01' });
    expect(updated.rentHistory).toEqual([{ from: '2026-02-01', rent: 200 }]);
  });

  it('does not mutate the original unit', () => {
    mergeUnitUpdate(base, { rent: 999 }, '2026-04-01');
    expect(base.rent).toBe(200);
    expect(base.rentHistory).toHaveLength(1);
  });
});

describe('nextDueDateOnOrAfter', () => {
  it('finds the next cycle date on or after a given day', () => {
    expect(nextDueDateOnOrAfter(makeUnit(), '2026-03-15')).toBe('2026-04-01');
    expect(nextDueDateOnOrAfter(makeUnit(), '2026-04-01')).toBe('2026-04-01');
    expect(nextDueDateOnOrAfter(makeUnit({ every: 6 }), '2026-02-01')).toBe('2026-07-01');
  });
});
