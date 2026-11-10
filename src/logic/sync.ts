import { AppSettings, SyncMeta } from '../types';
import { decryptJson, EncryptedPayload, encryptJson } from './crypto';
import { COLLECTIONS, CollectionName, Collections } from './syncModel';

/** What the server stores per record: only ids, the collection name and ciphertext. */
export interface RemoteRow {
  id: string; // "<collection>:<record id>" or "settings:main"
  collection: CollectionName | 'settings';
  payload: EncryptedPayload;
  /** Server-assigned, increasing with every write; used as the pull cursor. */
  seq: number;
}

export interface OutgoingRow {
  id: string;
  collection: RemoteRow['collection'];
  payload: EncryptedPayload;
}

/** The cloud side, implemented by the Supabase adapter (and a fake one in tests). */
export interface SyncServer {
  pull(afterSeq: number): Promise<RemoteRow[]>;
  push(rows: OutgoingRow[]): Promise<void>;
}

/** Kept on the device only. */
export interface SyncState {
  /** Highest server seq already pulled. */
  cursor: number;
  /** Local changes made up to this time (ms) have been pushed. 0 = never synced. */
  pushedUpTo: number;
}

export const INITIAL_SYNC_STATE: SyncState = { cursor: 0, pushedUpTo: 0 };

/** Settings that belong to one device and never sync (PIN, notifications). */
const DEVICE_ONLY_SETTINGS = ['security', 'notifyOnOpen'] as const;

export type SyncedSettings = Omit<AppSettings, (typeof DEVICE_ONLY_SETTINGS)[number]> & {
  updatedBy?: string;
};

export interface SyncData extends Collections {
  settings: AppSettings & { updatedBy?: string };
}

type Rec = SyncMeta & { id: string };

function stripDeviceOnly(s: AppSettings & { updatedBy?: string }): SyncedSettings {
  const copy = { ...s } as Record<string, unknown>;
  for (const k of DEVICE_ONLY_SETTINGS) delete copy[k];
  return copy as SyncedSettings;
}

function stamp(r: { updatedAt?: number | string }): number {
  return typeof r.updatedAt === 'number' ? r.updatedAt : 0;
}

/** True when `incoming` should replace `local`: newer edit wins; ties broken by device id so all devices agree. */
export function incomingWins(local: Rec | undefined, incoming: Rec): boolean {
  if (!local) return true;
  const a = stamp(local);
  const b = stamp(incoming);
  if (b !== a) return b > a;
  // Local never edited (e.g. a new device's defaults): take what the other device has.
  if (!local.updatedBy) return true;
  return (incoming.updatedBy || '') > local.updatedBy;
}

export interface SyncResult {
  data: SyncData;
  state: SyncState;
  pulled: number;
  pushed: number;
}

/**
 * One sync round:
 * 1. pull rows newer than the cursor, decrypt, merge (most recent edit per record wins; tombstones included),
 * 2. push this device's own changes made since the last push (encrypted).
 * Records last changed by another device are never pushed back, so changes do not bounce.
 * On a device's first sync, records with no owner (made before sync existed) are pushed too.
 */
export async function runSync(
  data: SyncData,
  state: SyncState,
  server: SyncServer,
  key: CryptoKey,
  deviceId: string,
  now: () => number = Date.now
): Promise<SyncResult> {
  const startedAt = now();
  const next: SyncData = { ...data, settings: { ...data.settings } };
  for (const name of COLLECTIONS) (next[name] as Rec[]) = [...((data[name] || []) as Rec[])];

  // 1. Pull and merge
  const rows = await server.pull(state.cursor);
  let cursor = state.cursor;
  let pulled = 0;
  for (const row of rows) {
    cursor = Math.max(cursor, row.seq);
    if (row.collection === 'settings') {
      const incoming = await decryptJson<SyncedSettings>(key, row.payload);
      if (incomingWins(next.settings as unknown as Rec, incoming as unknown as Rec)) {
        // Keep this device's own PIN and notification choice.
        const local = next.settings as unknown as Record<string, unknown>;
        next.settings = { ...incoming, security: local.security, notifyOnOpen: local.notifyOnOpen } as SyncData['settings'];
        pulled++;
      }
      continue;
    }
    if (!(COLLECTIONS as readonly string[]).includes(row.collection)) continue;
    const incoming = await decryptJson<Rec>(key, row.payload);
    const list = next[row.collection] as Rec[];
    const i = list.findIndex((r) => r.id === incoming.id);
    if (incomingWins(i >= 0 ? list[i] : undefined, incoming)) {
      if (i >= 0) list[i] = incoming;
      else list.push(incoming);
      pulled++;
    }
  }

  // 2. Push own changes
  const isFirstSync = state.pushedUpTo === 0;
  const isMine = (r: Rec) => r.updatedBy === deviceId || (isFirstSync && !r.updatedBy);
  const isNew = (r: Rec) => isFirstSync || stamp(r) > state.pushedUpTo;
  const outgoing: OutgoingRow[] = [];
  for (const name of COLLECTIONS) {
    for (const r of next[name] as Rec[]) {
      if (isMine(r) && isNew(r)) outgoing.push({ id: `${name}:${r.id}`, collection: name, payload: await encryptJson(key, r) });
    }
  }
  const settings = next.settings as unknown as Rec & AppSettings;
  if (isMine(settings) && isNew(settings)) {
    outgoing.push({ id: 'settings:main', collection: 'settings', payload: await encryptJson(key, stripDeviceOnly(settings)) });
  }
  if (outgoing.length > 0) await server.push(outgoing);

  return { data: next, state: { cursor, pushedUpTo: startedAt }, pulled, pushed: outgoing.length };
}
