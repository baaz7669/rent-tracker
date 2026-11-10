import { describe, expect, it } from 'vitest';
import { cleanSettings, CURRENT_SCHEMA_VERSION, normalizeUnits, upgradeDb } from './storage';
import { calculateUnit } from './rentEngine';
import { buildUnitViews } from './tenancy';
import { Payment, Unit } from '../types';

const v1Unit: Unit = {
  id: 'u1',
  building: 'Tower',
  name: 'Flat 1',
  type: 'Flat',
  tenant: 'Ali',
  phone: '',
  rent: 200,
  every: 1,
  firstDue: '2026-01-01',
  opening: 50,
};

const payments: Payment[] = [
  { id: 'p1', unitId: 'u1', amount: 230, date: '2026-01-05', ts: 1 },
];

describe('upgradeDb', () => {
  it('upgrades a v1 database into units + tenancies', () => {
    const db = upgradeDb({ schemaVersion: 1, settings: { currency: 'OMR' }, units: [v1Unit], payments, updatedAt: 5 });
    expect(db?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(db?.units).toEqual([{ id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' }]);
    expect(db?.tenancies).toHaveLength(1);
    expect(db?.tenancies[0]).toMatchObject({
      id: 'ten_u1',
      unitId: 'u1',
      tenant: 'Ali',
      rent: 200,
      firstDue: '2026-01-01',
      opening: 50,
      rentHistory: [{ from: '2026-01-01', rent: 200 }],
    });
    expect(db?.payments[0].tenancyId).toBe('ten_u1');
    expect(db?.charges).toEqual([]);
    expect(db?.updatedAt).toBe(5);
  });

  it('does not change any balance when upgrading from v1 or v2', () => {
    const today = '2026-03-10';
    const before = calculateUnit(v1Unit, payments, today);
    for (const schemaVersion of [1, 2]) {
      const db = upgradeDb({ schemaVersion, settings: { currency: 'OMR' }, units: [v1Unit], payments, updatedAt: 1 })!;
      const [view] = buildUnitViews(db.units, db.tenancies, db.charges);
      const after = calculateUnit(view, db.payments, today);
      expect(after.balance).toBe(before.balance);
      expect(after.advanceCredit).toBe(before.advanceCredit);
      expect(after.status).toBe(before.status);
      expect(after.dueItems.map((d) => [d.dueDate, d.amount, d.remaining])).toEqual(
        before.dueItems.map((d) => [d.dueDate, d.amount, d.remaining])
      );
    }
  });

  it('keeps archived units archived and their payments linked', () => {
    const db = upgradeDb({ schemaVersion: 2, units: [{ ...v1Unit, archivedAt: 9 }], payments })!;
    expect(db.units[0].archivedAt).toBe(9);
    expect(db.payments[0].tenancyId).toBe(db.tenancies[0].id);
  });

  it('links v3 payments that are missing a tenancy to the current tenancy', () => {
    const db = upgradeDb({
      schemaVersion: 3,
      units: [{ id: 'u1', building: 'T', name: 'F', type: 'Flat' }],
      tenancies: [
        { id: 'old', unitId: 'u1', tenant: 'A', phone: '', rent: 1, every: 1, firstDue: '2025-01-01', endedAt: '2025-12-01' },
        { id: 'new', unitId: 'u1', tenant: 'B', phone: '', rent: 1, every: 1, firstDue: '2026-01-01' },
      ],
      payments: [{ id: 'p', unitId: 'u1', amount: 1, date: '2026-01-01', ts: 1 }],
      charges: [],
    })!;
    expect(db.payments[0].tenancyId).toBe('new');
  });

  it('rejects unknown or future versions instead of guessing', () => {
    expect(upgradeDb({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, units: [], payments: [] })).toBeNull();
    expect(upgradeDb({ units: [] })).toBeNull();
    expect(upgradeDb(null)).toBeNull();
    expect(upgradeDb('text')).toBeNull();
  });

  it('defaults missing settings and arrays', () => {
    const db = upgradeDb({ schemaVersion: 3 });
    expect(db).toMatchObject({ settings: { currency: 'OMR' }, units: [], tenancies: [], payments: [], charges: [] });
  });
});

describe('cleanSettings', () => {
  it('keeps landlord and receipt settings and drops junk', () => {
    const s = cleanSettings({
      currency: 'AED',
      landlord: { name: 'Owner', phone: 5, address: '' },
      receiptPrefix: 'RT-',
      nextReceiptNo: 12.7,
      hacked: true,
    });
    expect(s).toEqual({
      currency: 'AED',
      lastBackupAt: undefined,
      landlord: { name: 'Owner', phone: undefined, address: undefined },
      receiptPrefix: 'RT-',
      nextReceiptNo: 12,
    });
  });

  it('defaults currency and ignores invalid counters', () => {
    expect(cleanSettings({ nextReceiptNo: 0 })).toMatchObject({ currency: 'OMR', nextReceiptNo: undefined });
  });
});

describe('normalizeUnits', () => {
  it('keeps valid history sorted and drops malformed entries', () => {
    const [u] = normalizeUnits([
      {
        ...v1Unit,
        rentHistory: [
          { from: '2026-05-01', rent: 260 },
          { from: 'bad-date', rent: 1 } as never,
          { from: '2026-01-01', rent: 200 },
        ],
      },
    ]);
    expect(u.rentHistory).toEqual([
      { from: '2026-01-01', rent: 200 },
      { from: '2026-05-01', rent: 260 },
    ]);
  });
});

describe('schema v4 (expenses)', () => {
  it('adds an empty expense list when upgrading older data', () => {
    expect(upgradeDb({ schemaVersion: 1, units: [v1Unit], payments })?.expenses).toEqual([]);
    expect(upgradeDb({ schemaVersion: 3, units: [], tenancies: [], payments: [], charges: [] })?.expenses).toEqual([]);
  });

  it('keeps expenses from v4 data', () => {
    const expenses = [{ id: 'e1', date: '2026-02-01', amount: 50, category: 'maintenance', building: 'Tower' }];
    expect(upgradeDb({ schemaVersion: 4, units: [], tenancies: [], payments: [], charges: [], expenses })?.expenses).toEqual(expenses);
  });
});

describe('schema v5 (sync-ready)', () => {
  it('starts an empty activity log and keeps tombstones when loading', () => {
    const v4 = upgradeDb({ schemaVersion: 4, units: [], tenancies: [], payments: [], charges: [], expenses: [] });
    expect(v4?.activity).toEqual([]);
    const tomb = { id: 'c1', unitId: 'u1', tenancyId: 't1', date: '2026-01-01', label: 'x', kind: 'other', amount: 5, deletedAt: 9 };
    const v5 = upgradeDb({ schemaVersion: 5, units: [], tenancies: [], payments: [], charges: [tomb], expenses: [], activity: [{ id: 'a', at: 1, deviceId: 'pc', summary: 's' }] });
    expect(v5?.charges[0].deletedAt).toBe(9);
    expect(v5?.activity).toHaveLength(1);
  });
});
