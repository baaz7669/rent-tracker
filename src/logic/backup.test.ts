import { describe, expect, it } from 'vitest';
import { buildBackupData, parseBackup } from './backup';
import { CURRENT_SCHEMA_VERSION } from './storage';

const v2Backup = {
  app: 'rent-tracker',
  schemaVersion: 2,
  exportedAt: '2026-10-01T10:00:00.000Z',
  settings: { currency: 'OMR' },
  units: [
    { id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat', tenant: 'Ali', phone: '', rent: 200, every: 1, firstDue: '2026-01-01' },
  ],
  payments: [{ id: 'p1', unitId: 'u1', amount: 200, date: '2026-01-01', ts: 1 }],
};

describe('parseBackup', () => {
  it('upgrades an older backup to the current schema on restore', () => {
    const { data, warnings } = parseBackup(JSON.stringify(v2Backup));
    expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(data.units[0]).not.toHaveProperty('tenant');
    expect(data.tenancies[0]).toMatchObject({ unitId: 'u1', tenant: 'Ali', rent: 200 });
    expect(data.payments[0].tenancyId).toBe(data.tenancies[0].id);
    expect(data.exportedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(warnings.some((w) => w.includes('older version'))).toBe(true);
  });

  it('round-trips a current backup', () => {
    const { data: upgraded } = parseBackup(JSON.stringify(v2Backup));
    const again = parseBackup(JSON.stringify(buildBackupData(upgraded)));
    expect(again.data.tenancies).toEqual(upgraded.tenancies);
    expect(again.data.payments).toEqual(upgraded.payments);
    expect(again.warnings).toEqual([]);
  });

  it('rejects other apps, newer versions and missing fields', () => {
    expect(() => parseBackup('not json')).toThrow(/Invalid JSON/);
    expect(() => parseBackup(JSON.stringify({ ...v2Backup, app: 'other' }))).toThrow(/rent-tracker/);
    expect(() => parseBackup(JSON.stringify({ ...v2Backup, schemaVersion: 99 }))).toThrow(/newer/);
    expect(() =>
      parseBackup(JSON.stringify({ ...v2Backup, schemaVersion: 3, units: [{ id: 'u1', building: 'T', name: 'F' }] }))
    ).toThrow(/tenancies/);
    expect(() =>
      parseBackup(JSON.stringify({ ...v2Backup, payments: [{ id: 'p', unitId: 'u1', date: '2026-01-01' }] }))
    ).toThrow(/amount/);
  });

  it('warns about payments for units that are not in the backup', () => {
    const { warnings } = parseBackup(
      JSON.stringify({ ...v2Backup, payments: [...v2Backup.payments, { id: 'p2', unitId: 'gone', amount: 5, date: '2026-01-01', ts: 2 }] })
    );
    expect(warnings.some((w) => w.includes('1 payment(s)'))).toBe(true);
  });
});

describe('expenses in backups', () => {
  it('round-trips expenses and rejects malformed ones', () => {
    const { data } = parseBackup(JSON.stringify(v2Backup));
    const withExpenses = { ...data, expenses: [{ id: 'e1', date: '2026-02-01', amount: 50, category: 'maintenance' as const }] };
    const again = parseBackup(JSON.stringify(buildBackupData(withExpenses)));
    expect(again.data.expenses).toEqual(withExpenses.expenses);
    expect(again.data.counts.expenses).toBe(1);
    expect(() =>
      parseBackup(JSON.stringify({ ...buildBackupData(withExpenses), expenses: [{ id: 'e2', date: '2026-01-01', amount: 'ten' }] }))
    ).toThrow(/amount/);
  });
});
