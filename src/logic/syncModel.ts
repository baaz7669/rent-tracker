import { ActivityEntry, Charge, Expense, Payment, SyncMeta, Tenancy, UnitRecord } from '../types';

/** The record collections that sync. Settings sync as one record. */
export const COLLECTIONS = ['units', 'tenancies', 'payments', 'charges', 'expenses'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export interface Collections {
  units: UnitRecord[];
  tenancies: Tenancy[];
  payments: Payment[];
  charges: Charge[];
  expenses: Expense[];
}

type Rec = SyncMeta & { id: string };

/** Keep the activity log to a sensible size. */
export const MAX_ACTIVITY = 500;

/* ------------------------------------------------------------------ */
/* Live view                                                           */
/* ------------------------------------------------------------------ */

/** Records that are not deleted (what screens, reports and backups use). */
export function liveView<T extends Collections>(db: T): T {
  const out = { ...db };
  for (const name of COLLECTIONS) {
    (out[name] as Rec[]) = ((db[name] || []) as Rec[]).filter((r) => !r.deletedAt);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Stamping changes                                                    */
/* ------------------------------------------------------------------ */

/** Record content without sync bookkeeping, for "did it really change?" comparisons. */
function contentKey(r: Rec): string {
  const { updatedAt: _u, updatedBy: _b, deletedAt: _d, ...rest } = r as Rec & Record<string, unknown>;
  return JSON.stringify(rest);
}

const LABELS: Record<CollectionName, string> = {
  units: 'unit',
  tenancies: 'tenancy',
  payments: 'payment',
  charges: 'charge',
  expenses: 'expense'
};

function describe(name: CollectionName, r: Rec, unitName: (id: string) => string): string {
  const any = r as Rec & Record<string, unknown>;
  switch (name) {
    case 'units':
      return `${any.building} · ${any.name}`;
    case 'tenancies':
      return `${any.tenant} (${unitName(String(any.unitId))})`;
    case 'payments':
    case 'charges':
      return `${any.amount} (${unitName(String(any.unitId))})`;
    case 'expenses':
      return `${any.amount}${any.note ? ` – ${any.note}` : ''}`;
  }
}

/**
 * Turns "before" and "after" live collections into the stored collections:
 * - new or changed records get updatedAt/updatedBy,
 * - records that disappeared are kept as tombstones (deletedAt),
 * - existing tombstones are carried over untouched,
 * and returns one activity entry per change.
 */
export function stampChanges(
  prevRaw: Collections,
  nextLive: Collections,
  now: number,
  deviceId: string,
  newId: () => string
): { raw: Collections; activity: ActivityEntry[] } {
  const raw = {} as Collections;
  const activity: ActivityEntry[] = [];
  const unitsById = new Map([...(prevRaw.units || []), ...(nextLive.units || [])].map((u) => [u.id, u]));
  const unitName = (id: string) => {
    const u = unitsById.get(id);
    return u ? `${u.building} · ${u.name}` : 'unit';
  };
  const log = (summary: string) => activity.push({ id: newId(), at: now, deviceId, summary });

  for (const name of COLLECTIONS) {
    const prev = new Map(((prevRaw[name] || []) as Rec[]).map((r) => [r.id, r]));
    const nextIds = new Set<string>();
    const out: Rec[] = [];

    for (const r of (nextLive[name] || []) as Rec[]) {
      nextIds.add(r.id);
      const before = prev.get(r.id);
      if (!before || before.deletedAt) {
        out.push({ ...r, deletedAt: undefined, updatedAt: now, updatedBy: deviceId });
        log(`Added ${LABELS[name]}: ${describe(name, r, unitName)}`);
      } else if (contentKey(before) !== contentKey(r)) {
        out.push({ ...r, updatedAt: now, updatedBy: deviceId });
        const voided = name === 'payments' && !before.deletedAt && (r as Payment).voidedAt && !(before as Payment).voidedAt;
        log(`${voided ? 'Voided' : 'Changed'} ${LABELS[name]}: ${describe(name, r, unitName)}`);
      } else {
        out.push(before);
      }
    }

    for (const [id, before] of prev) {
      if (nextIds.has(id)) continue;
      if (before.deletedAt) {
        out.push(before); // already a tombstone
      } else {
        out.push({ ...before, deletedAt: now, updatedAt: now, updatedBy: deviceId });
        log(`Deleted ${LABELS[name]}: ${describe(name, before, unitName)}`);
      }
    }

    (raw[name] as Rec[]) = out;
  }
  return { raw, activity };
}

/** Newest first, capped. */
export function appendActivity(existing: ActivityEntry[] | undefined, added: ActivityEntry[]): ActivityEntry[] {
  return [...added.reverse(), ...(existing || [])].slice(0, MAX_ACTIVITY);
}

/* ------------------------------------------------------------------ */
/* Receipt numbers per device                                          */
/* ------------------------------------------------------------------ */

/**
 * Next receipt number in a series: one more than the highest number already issued with this prefix
 * (voided and deleted payments included, so a number is never reused), and never below `floor`.
 * Each device uses its own prefix, so two devices can never issue the same number, even offline.
 */
export function nextReceiptNumber(payments: Payment[], prefix: string, floor = 1): number {
  let max = 0;
  for (const p of payments) {
    if (p.receiptNo && (p.receiptPrefix ?? 'R-') === prefix && p.receiptNo > max) max = p.receiptNo;
  }
  return Math.max(floor, max + 1);
}

/* ------------------------------------------------------------------ */
/* Erase everything                                                    */
/* ------------------------------------------------------------------ */

interface ErasableDb extends Collections {
  activity: ActivityEntry[];
  settings: { receiptPrefix?: string; nextReceiptNo?: number };
  updatedAt: number;
}

/**
 * Settings → Delete everything: removes every record (deletion markers included) and the recent activity log.
 * Settings stay. Receipt numbering carries on after the highest number already issued, so a number is never reused.
 */
export function eraseAllRecords<T extends ErasableDb>(db: T, now: number): T {
  const prefix = db.settings.receiptPrefix ?? 'R-';
  return {
    ...db,
    units: [],
    tenancies: [],
    payments: [],
    charges: [],
    expenses: [],
    activity: [],
    settings: { ...db.settings, nextReceiptNo: nextReceiptNumber(db.payments, prefix, db.settings.nextReceiptNo || 1) },
    updatedAt: now
  };
}

/* ------------------------------------------------------------------ */
/* Device identity (kept on the device, never synced)                  */
/* ------------------------------------------------------------------ */

export const DEVICE_KEY = 'rent_tracker_device';

export interface DeviceIdentity {
  id: string;
  /** This device's receipt prefix. Unset on the main PC, which uses Settings' prefix. */
  receiptPrefix?: string;
}

export function loadDeviceIdentity(storage: Pick<Storage, 'getItem' | 'setItem'>, makeId: () => string): DeviceIdentity {
  try {
    const raw = storage.getItem(DEVICE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed && typeof parsed.id === 'string' && parsed.id) return parsed;
    }
  } catch {
    // fall through to a new identity
  }
  const identity: DeviceIdentity = { id: makeId() };
  try {
    storage.setItem(DEVICE_KEY, JSON.stringify(identity));
  } catch {
    // storage unavailable: the identity lasts for this session only
  }
  return identity;
}
