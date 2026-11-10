import { AppSettings, Charge, Expense, Payment, Tenancy, UnitRecord } from '../types';
import { AppDatabase, CURRENT_SCHEMA_VERSION, saveDb, upgradeDb } from './storage';

export interface BackupData {
  app: 'rent-tracker';
  schemaVersion: number;
  exportedAt: string;
  counts: {
    units: number;
    tenancies: number;
    payments: number;
    charges: number;
    expenses: number;
  };
  settings: AppSettings;
  units: UnitRecord[];
  tenancies: Tenancy[];
  payments: Payment[];
  charges: Charge[];
  expenses: Expense[];
}

/** What a backup needs: the stored records (not the screen views). */
export type BackupSource = Pick<AppDatabase, 'settings' | 'units' | 'tenancies' | 'payments' | 'charges' | 'expenses'>;

interface BackupPayload {
  filename: string;
  content: string;
}

declare global {
  interface Window {
    rentAPI?: {
      /** Desktop: asks where to save; resolves true only if the file was written. */
      backupNow?: (payload: BackupPayload) => Promise<boolean>;
      /** Desktop: writes straight into the app's backups folder (used for safety copies). */
      backupSilently?: (payload: BackupPayload) => Promise<boolean>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    };
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a human-readable date: "18 Oct 2026, 10:42" (or "Never")
 */
export function formatBackupDate(ts?: number | string): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Never';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hours}:${minutes}`;
}

/**
 * Format date for confirmation text: "15 Oct 2026"
 */
export function formatBackupDayOnly(ts?: number | string): string {
  if (!ts) return 'Unknown date';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'Unknown date';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Generate standard backup filename: rent-tracker-backup-YYYY-MM-DD_HH-mm.json
 * Supports optional prefix like "before-restore-" or "before-erase-"
 */
export function formatBackupFilename(date: Date = new Date(), prefix = ''): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `rent-tracker-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}-${pad(date.getMinutes())}.json`;
  return prefix ? `${prefix}${base}` : base;
}

export function buildBackupData(source: BackupSource, now: Date = new Date()): BackupData {
  return {
    app: 'rent-tracker',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      units: source.units.length,
      tenancies: source.tenancies.length,
      payments: source.payments.length,
      charges: source.charges.length,
      expenses: (source.expenses || []).length
    },
    settings: { ...source.settings, lastBackupAt: now.getTime() },
    units: source.units,
    tenancies: source.tenancies,
    payments: source.payments,
    charges: source.charges,
    expenses: source.expenses || []
  };
}

/**
 * Exports a full JSON backup. Resolves true only when the file was actually saved
 * (false if the user cancelled the save dialog or writing failed).
 * - Desktop, normal backup: asks where to save.
 * - Desktop, safety copy (`prefix` given): saved straight into the app's backups folder.
 * - Browser: triggers a download (cannot detect cancellation, so resolves true).
 */
export async function exportBackup(source: BackupSource, prefix = ''): Promise<boolean> {
  const now = new Date();
  const filename = formatBackupFilename(now, prefix);
  const content = JSON.stringify(buildBackupData(source, now), null, 2);
  const api = typeof window !== 'undefined' ? window.rentAPI : undefined;

  try {
    if (prefix && typeof api?.backupSilently === 'function') {
      return Boolean(await api.backupSilently({ filename, content }));
    }
    if (typeof api?.backupNow === 'function') {
      return Boolean(await api.backupNow({ filename, content }));
    }
  } catch (err) {
    console.error('Desktop backup failed:', err);
    return false;
  }

  if (typeof window !== 'undefined') {
    triggerBrowserDownload(filename, content);
    return true;
  }
  return false;
}

function triggerBrowserDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

type Json = Record<string, unknown>;

function requireFields(items: unknown[], fields: readonly string[], kind: string): void {
  items.forEach((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Invalid ${kind} at index ${i}: Expected an object.`);
    }
    const o = item as Json;
    for (const field of fields) {
      if (o[field] === undefined || o[field] === null || o[field] === '') {
        throw new Error(`Invalid ${kind} at index ${i} (${String(o.name || o.id || 'unnamed')}): Missing required field "${field}".`);
      }
    }
  });
}

function requireNumber(items: unknown[], field: string, kind: string): void {
  for (const item of items as Json[]) {
    if (typeof item[field] !== 'number' || isNaN(item[field] as number)) {
      throw new Error(`Invalid ${kind} "${String(item.name || item.id)}": "${field}" must be a valid number.`);
    }
  }
}

function requireCycle(items: unknown[], kind: string): void {
  for (const item of items as Json[]) {
    if (typeof item.every !== 'number' || ![1, 3, 6, 12].includes(item.every)) {
      throw new Error(`Invalid ${kind} "${String(item.name || item.tenant || item.id)}": "every" frequency must be 1, 3, 6, or 12.`);
    }
  }
}

/**
 * Parses and validates backup JSON of any supported version, then upgrades it to the current schema.
 *
 * Rejects if: not valid JSON; app !== 'rent-tracker'; schemaVersion missing or newer than supported;
 * required arrays missing; required fields missing on units, tenancies or payments.
 *
 * Returns data and any warnings (e.g. payments pointing to non-existent units).
 */
export function parseBackup(text: string): { data: BackupData; warnings: string[] } {
  let parsed: Json;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON: File is corrupted or not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid backup: File root content must be a JSON object.');
  }
  if (parsed.app !== 'rent-tracker') {
    throw new Error(`Invalid backup: Expected app identifier "rent-tracker", but found "${String(parsed.app || 'none')}".`);
  }
  if (typeof parsed.schemaVersion !== 'number') {
    throw new Error('Invalid backup: "schemaVersion" is missing or not a number.');
  }
  if (parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Invalid backup: Schema version ${parsed.schemaVersion} is newer than supported by this app (max supported: ${CURRENT_SCHEMA_VERSION}).`
    );
  }
  if (!Array.isArray(parsed.units)) {
    throw new Error('Invalid backup: "units" must be an array.');
  }
  if (!Array.isArray(parsed.payments)) {
    throw new Error('Invalid backup: "payments" must be an array.');
  }

  if (parsed.schemaVersion < 3) {
    // Flat units carry the tenancy fields
    requireFields(parsed.units, ['id', 'building', 'name', 'rent', 'every', 'firstDue'], 'unit');
    requireNumber(parsed.units, 'rent', 'unit');
    requireCycle(parsed.units, 'unit');
  } else {
    if (!Array.isArray(parsed.tenancies)) {
      throw new Error('Invalid backup: "tenancies" must be an array.');
    }
    requireFields(parsed.units, ['id', 'building', 'name'], 'unit');
    requireFields(parsed.tenancies, ['id', 'unitId', 'rent', 'every', 'firstDue'], 'tenancy');
    requireNumber(parsed.tenancies, 'rent', 'tenancy');
    requireCycle(parsed.tenancies, 'tenancy');
  }
  requireFields(parsed.payments, ['id', 'unitId', 'amount', 'date'], 'payment');
  if (Array.isArray(parsed.expenses)) {
    requireFields(parsed.expenses, ['id', 'date', 'amount'], 'expense');
    requireNumber(parsed.expenses, 'amount', 'expense');
  }
  requireNumber(parsed.payments, 'amount', 'payment');

  const db = upgradeDb(parsed);
  if (!db) {
    throw new Error('Invalid backup: could not read this backup format.');
  }

  const warnings: string[] = [];
  const unitIds = new Set(db.units.map((u) => u.id));
  const orphaned = db.payments.filter((p) => !unitIds.has(p.unitId));
  if (orphaned.length > 0) {
    warnings.push(`${orphaned.length} payment(s) reference unit IDs that do not exist in the backup's units list.`);
  }
  if (parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(`This backup is from an older version (v${parsed.schemaVersion}); it will be upgraded on restore.`);
  }

  const data: BackupData = {
    ...buildBackupData(db),
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    settings: { ...db.settings, lastBackupAt: db.settings.lastBackupAt || Date.now(), updatedAt: Date.now() }
  };
  return { data, warnings };
}

/**
 * Applies the backup directly to storage.
 * Replaces all data.
 */
export function applyBackup(data: BackupData): AppDatabase {
  const db: AppDatabase = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: data.settings,
    units: data.units,
    tenancies: data.tenancies,
    payments: data.payments,
    charges: data.charges,
    expenses: data.expenses || [],
    activity: [],
    updatedAt: Date.now()
  };
  saveDb(db);
  return db;
}
