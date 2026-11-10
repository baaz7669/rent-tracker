import { ActivityEntry, AppSettings, Charge, Expense, Payment, RentChange, Tenancy, Unit, UnitRecord } from '../types';
import { currentTenancyOf } from './tenancy';
import { cleanTemplates } from './templates';
import { cleanSecurity } from './pin';
import { MAX_ACTIVITY } from './syncModel';

export const STORAGE_KEY_DB = 'rent_tracker_db';
/** Raw copy of the v1 database, written once before upgrading. */
export const STORAGE_KEY_V1_BACKUP = 'rent_tracker_db_backup_v1';
/** Prefix for the raw copy kept before upgrading from any older schema (v1, v2, ...). */
export const STORAGE_KEY_UPGRADE_BACKUP_PREFIX = 'rent_tracker_db_backup_v';

/**
 * Schema history:
 * 1 - original format (tenant fields on the unit)
 * 2 - units carry `rentHistory` (effective-dated rent) and optional `archivedAt`
 * 3 - units are physical only; tenants live in `tenancies`; payments link to a tenancy;
 *     one-off `charges`; payment method/cheque/receipt fields; landlord + receipt settings
 * 4 - `expenses` (for net income)
 * 5 - sync-ready: records carry updatedAt/updatedBy, deletions are kept as tombstones (deletedAt),
 *     activity log; receipt numbers continue per device series
 */
export const CURRENT_SCHEMA_VERSION = 5;

// Old keys for one-time migration
const OLD_KEY_UNITS = 'rent_tracker_units_local';
const OLD_KEY_PAYMENTS = 'rent_tracker_payments_local';
const OLD_KEY_SETTINGS = 'rent_tracker_settings_local';

export interface AppDatabase {
  schemaVersion: number;
  settings: AppSettings;
  units: UnitRecord[];
  tenancies: Tenancy[];
  payments: Payment[];
  charges: Charge[];
  expenses: Expense[];
  activity: ActivityEntry[];
  updatedAt: number;
}

/** Bridge exposed by the Electron preload script. Absent in a plain browser. */
export interface DesktopStorageBridge {
  readDbSync: () => string | null;
  writeDbSync: (json: string) => boolean;
}

function desktopBridge(): DesktopStorageBridge | null {
  if (typeof window === 'undefined') return null;
  const api = window.rentAPI;
  if (api && typeof api.readDbSync === 'function' && typeof api.writeDbSync === 'function') {
    return api as unknown as DesktopStorageBridge;
  }
  return null;
}

/** True when running inside the desktop (Electron) app with file-based storage. */
export function isDesktopApp(): boolean {
  return desktopBridge() !== null;
}

// Storage error listeners (for showing error toasts if quota or private mode prevents saving)
type StorageErrorListener = (message: string) => void;
const errorListeners: Set<StorageErrorListener> = new Set();

export function onStorageError(listener: StorageErrorListener): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function notifyStorageError(message: string) {
  if (errorListeners.size > 0) {
    errorListeners.forEach((l) => {
      try {
        l(message);
      } catch (err) {
        console.error('Error listener threw', err);
      }
    });
  } else if (typeof window !== 'undefined') {
    // Fallback if no listener is mounted
    console.error('Storage Error:', message);
  }
}

/**
 * On startup, call navigator.storage?.persist?.() to request persistent storage.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    }
  } catch (err) {
    console.warn('Could not request persistent storage:', err);
  }
  return false;
}

// Request persistence immediately on module load (browser only; desktop uses a file)
if (typeof window !== 'undefined' && !isDesktopApp()) {
  requestPersistentStorage();
}

/* ------------------------------------------------------------------ */
/* Normalising and upgrading                                           */
/* ------------------------------------------------------------------ */

function isValidRentChange(value: unknown): value is RentChange {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.from === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(c.from) &&
    typeof c.rent === 'number' &&
    Number.isFinite(c.rent) &&
    c.rent >= 0
  );
}

function normalizeRentHistory<T extends { rentHistory?: RentChange[]; firstDue: string; rent: number }>(item: T): T {
  const history = Array.isArray(item.rentHistory) ? item.rentHistory.filter(isValidRentChange) : [];
  if (history.length > 0) {
    return { ...item, rentHistory: [...history].sort((a, b) => a.from.localeCompare(b.from)) };
  }
  return { ...item, rentHistory: [{ from: item.firstDue, rent: Number(item.rent) || 0 }] };
}

/**
 * Brings flat (v1/v2-style) units up to date without changing what anyone owes:
 * a unit with no valid rent history gets a single entry starting at its first due date
 * with its current rent, which reproduces the v1 calculation exactly.
 */
export function normalizeUnits(units: Unit[]): Unit[] {
  return units.map((u) => normalizeRentHistory(u));
}

export function normalizeTenancies(tenancies: Tenancy[]): Tenancy[] {
  return tenancies.map((t) => normalizeRentHistory(t));
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Keeps only known settings fields, with safe defaults. */
export function cleanSettings(raw: unknown): AppSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const landlordRaw = (s.landlord && typeof s.landlord === 'object' ? s.landlord : {}) as Record<string, unknown>;
  const landlord = { name: str(landlordRaw.name), phone: str(landlordRaw.phone), address: str(landlordRaw.address) };
  const hasLandlord = Boolean(landlord.name || landlord.phone || landlord.address);
  const next = typeof s.nextReceiptNo === 'number' && s.nextReceiptNo >= 1 ? Math.floor(s.nextReceiptNo) : undefined;
  return {
    currency: str(s.currency) || 'OMR',
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : undefined,
    updatedBy: str(s.updatedBy),
    lastBackupAt: typeof s.lastBackupAt === 'number' ? s.lastBackupAt : undefined,
    landlord: hasLandlord ? landlord : undefined,
    receiptPrefix: typeof s.receiptPrefix === 'string' ? s.receiptPrefix : undefined,
    nextReceiptNo: next,
    messageTemplates: cleanTemplates(s.messageTemplates),
    notifyOnOpen: s.notifyOnOpen === true ? true : undefined,
    security: cleanSecurity(s.security),
  };
}

/**
 * Converts flat v1/v2 units (tenant on the unit) into unit records + one tenancy each,
 * and links every payment to that tenancy. Tenancy ids are derived from the unit id so the
 * conversion is deterministic.
 */
export function splitLegacyUnits(
  legacyUnits: Unit[],
  payments: Payment[]
): { units: UnitRecord[]; tenancies: Tenancy[]; payments: Payment[] } {
  const normalized = normalizeUnits(legacyUnits);
  const units: UnitRecord[] = [];
  const tenancies: Tenancy[] = [];
  const tenancyByUnit = new Map<string, string>();

  for (const u of normalized) {
    const unit: UnitRecord = { id: u.id, building: u.building, name: u.name, type: u.type };
    if (u.archivedAt) unit.archivedAt = u.archivedAt;
    if (u.createdAt) unit.createdAt = u.createdAt;
    if (u.updatedAt) unit.updatedAt = u.updatedAt;
    units.push(unit);

    const tenancyId = `ten_${u.id}`;
    tenancyByUnit.set(u.id, tenancyId);
    tenancies.push({
      id: tenancyId,
      unitId: u.id,
      tenant: u.tenant || '',
      phone: u.phone || '',
      rent: Number(u.rent) || 0,
      every: u.every || 1,
      firstDue: u.firstDue,
      opening: u.opening,
      leaseEnd: u.leaseEnd,
      rentHistory: u.rentHistory,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    });
  }

  const linked = payments.map((p) => {
    const tenancyId = tenancyByUnit.get(p.unitId);
    return tenancyId && !p.tenancyId ? { ...p, tenancyId } : p;
  });

  return { units, tenancies, payments: linked };
}

function emptyDb(): AppDatabase {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: { currency: 'OMR' },
    units: [],
    tenancies: [],
    payments: [],
    charges: [],
    expenses: [],
    activity: [],
    updatedAt: Date.now()
  };
}

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Turns parsed JSON of any supported schema version into a current-version database.
 * Returns null if the value is not a recognisable database.
 */
export function upgradeDb(parsed: unknown): AppDatabase | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  const version = p.schemaVersion;
  if (typeof version !== 'number' || version < 1 || version > CURRENT_SCHEMA_VERSION) {
    return null;
  }
  const settings = cleanSettings(p.settings);
  const updatedAt = typeof p.updatedAt === 'number' ? p.updatedAt : Date.now();

  if (version < 3) {
    const split = splitLegacyUnits(arr<Unit>(p.units), arr<Payment>(p.payments));
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      settings,
      units: split.units,
      tenancies: split.tenancies,
      payments: split.payments,
      charges: [],
      expenses: [],
      activity: [],
      updatedAt
    };
  }

  const units = arr<UnitRecord>(p.units);
  const tenancies = normalizeTenancies(arr<Tenancy>(p.tenancies));
  // Any payment still missing its tenancy is linked to the unit's current tenancy.
  const payments = arr<Payment>(p.payments).map((pay) => {
    if (pay.tenancyId) return pay;
    const current = currentTenancyOf(pay.unitId, tenancies);
    return current ? { ...pay, tenancyId: current.id } : pay;
  });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings,
    units,
    tenancies,
    payments,
    charges: arr<Charge>(p.charges),
    expenses: arr<Expense>(p.expenses),
    activity: arr<ActivityEntry>(p.activity).slice(0, MAX_ACTIVITY),
    updatedAt
  };
}

function readRaw(): string | null {
  const bridge = desktopBridge();
  if (bridge) return bridge.readDbSync();
  return localStorage.getItem(STORAGE_KEY_DB);
}

function writeRaw(json: string): void {
  const bridge = desktopBridge();
  if (bridge) {
    if (!bridge.writeDbSync(json)) {
      throw new Error('Desktop storage write failed');
    }
    return;
  }
  localStorage.setItem(STORAGE_KEY_DB, json);
}

/**
 * Migrate old keys (rent_tracker_units_local, rent_tracker_payments_local, rent_tracker_settings_local)
 * into the new rent_tracker_db key, then delete the old keys.
 */
function checkAndMigrateOldKeys(): AppDatabase | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawOldUnits = localStorage.getItem(OLD_KEY_UNITS);
    const rawOldPayments = localStorage.getItem(OLD_KEY_PAYMENTS);
    const rawOldSettings = localStorage.getItem(OLD_KEY_SETTINGS);

    if (rawOldUnits || rawOldPayments || rawOldSettings) {
      const parseArray = (raw: string | null): unknown[] => {
        if (!raw) return [];
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      let settings: unknown = { currency: 'OMR' };
      if (rawOldSettings) {
        try {
          settings = JSON.parse(rawOldSettings);
        } catch {
          // ignore
        }
      }

      const migratedDb = upgradeDb({
        schemaVersion: 1,
        settings,
        units: parseArray(rawOldUnits),
        payments: parseArray(rawOldPayments),
        updatedAt: Date.now()
      });
      if (!migratedDb) return null;

      writeRaw(JSON.stringify(migratedDb));
      localStorage.removeItem(OLD_KEY_UNITS);
      localStorage.removeItem(OLD_KEY_PAYMENTS);
      localStorage.removeItem(OLD_KEY_SETTINGS);

      return migratedDb;
    }
  } catch (err) {
    console.error('Migration from old storage keys failed:', err);
  }

  return null;
}

/**
 * Loads the database (file in the desktop app, localStorage in a browser).
 * Upgrades older schema versions, keeping a raw copy of the old data first.
 * Returns an empty database if none exists. Does NOT auto-insert sample units.
 */
export function loadDb(): AppDatabase {
  if (typeof window === 'undefined') return emptyDb();

  try {
    const raw = readRaw();
    if (raw) {
      const parsed = JSON.parse(raw);
      const upgraded = upgradeDb(parsed);
      if (upgraded) {
        if (parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
          preserveUpgradeCopy(parsed.schemaVersion, raw);
          saveDb(upgraded);
        }
        return upgraded;
      }
      notifyStorageError(
        `Saved data has an unsupported format (schema ${String(parsed?.schemaVersion)}). It was left untouched; restore from a backup.`
      );
      return emptyDb();
    }

    const migrated = checkAndMigrateOldKeys();
    if (migrated) {
      return migrated;
    }
  } catch (err) {
    console.error('Failed to load local database:', err);
    notifyStorageError('Failed to read saved data. Your browser may be in strict private mode.');
  }

  return emptyDb();
}

function preserveUpgradeCopy(fromVersion: number, raw: string): void {
  const key = `${STORAGE_KEY_UPGRADE_BACKUP_PREFIX}${fromVersion}`;
  try {
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, raw);
    }
  } catch (err) {
    console.warn(`Could not keep a copy of v${fromVersion} data before upgrading:`, err);
  }
}

/**
 * Saves the database. Wrapped in try/catch to gracefully handle storage quota limits,
 * private mode restrictions, or desktop file write failures.
 */
export function saveDb(db: AppDatabase): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const dataToSave: AppDatabase = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      settings: cleanSettings(db.settings),
      units: db.units || [],
      tenancies: db.tenancies || [],
      payments: db.payments || [],
      charges: db.charges || [],
      expenses: db.expenses || [],
      activity: db.activity || [],
      updatedAt: Date.now()
    };

    writeRaw(JSON.stringify(dataToSave));
    return true;
  } catch (err) {
    console.error('Failed to save local database:', err);
    const msg = isDesktopApp()
      ? 'Failed to save data to disk. Check free disk space, then try again.'
      : err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)
        ? 'Local storage quota exceeded. Please export and clean up old records.'
        : 'Failed to save data. Local storage may be restricted in private browsing mode.';
    notifyStorageError(msg);
    return false;
  }
}
