import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { checkVerifier, deriveSyncKey, EncryptedPayload, exportKey, makeVerifier, randomSalt } from './crypto';
import { INITIAL_SYNC_STATE, OutgoingRow, RemoteRow, SyncServer, SyncState } from './sync';

/** Kept on this device only (never synced). */
export interface DeviceSyncConfig {
  url: string;
  anonKey: string;
  email?: string;
  /** Exported AES key (base64). The local data file is not encrypted, so keeping it here adds no exposure. */
  keyRaw?: string;
  state: SyncState;
  lastSyncAt?: number;
  lastError?: string;
}

const CONFIG_KEY = 'rent_tracker_sync';
const PAGE = 1000;
const PUSH_CHUNK = 200;
/** Re-read a few recent rows each time so a write that committed slightly out of order is never missed. */
const PULL_OVERLAP = 100;

export function loadSyncConfig(): DeviceSyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as DeviceSyncConfig;
    return c && typeof c.url === 'string' && typeof c.anonKey === 'string' ? { ...c, state: c.state || { ...INITIAL_SYNC_STATE } } : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: DeviceSyncConfig | null): void {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch (err) {
    console.warn('Could not save sync settings', err);
  }
}

/** Only https Supabase project addresses are accepted. */
export function isValidProjectUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && !u.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

let cached: { key: string; client: SupabaseClient } | null = null;

export function getClient(config: Pick<DeviceSyncConfig, 'url' | 'anonKey'>): SupabaseClient {
  const cacheKey = `${config.url}|${config.anonKey}`;
  if (cached?.key !== cacheKey) {
    cached = {
      key: cacheKey,
      client: createClient(config.url.trim(), config.anonKey.trim(), {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rent_tracker_auth' }
      })
    };
  }
  return cached.client;
}

export class SupabaseSyncServer implements SyncServer {
  constructor(private client: SupabaseClient) {}

  async pull(afterSeq: number): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    let from = Math.max(0, afterSeq - PULL_OVERLAP);
    for (;;) {
      const { data, error } = await this.client
        .from('sync_records')
        .select('id, collection, payload, seq')
        .gt('seq', from)
        .order('seq', { ascending: true })
        .limit(PAGE);
      if (error) throw new Error(error.message);
      const rows = (data || []) as RemoteRow[];
      out.push(...rows);
      if (rows.length < PAGE) return out;
      from = rows[rows.length - 1].seq;
    }
  }

  async push(rows: OutgoingRow[]): Promise<void> {
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const chunk = rows.slice(i, i + PUSH_CHUNK).map((r) => ({ id: r.id, collection: r.collection, payload: r.payload }));
      const { error } = await this.client.from('sync_records').upsert(chunk, { onConflict: 'user_id,id' });
      if (error) throw new Error(error.message);
    }
  }
}

/**
 * Sets up encryption for this account. The first device creates the salt and a check value;
 * later devices must enter the same passphrase. Returns the exported key and whether this device created it.
 */
export async function connectEncryption(client: SupabaseClient, passphrase: string): Promise<{ keyRaw: string; isFirstDevice: boolean }> {
  const { data, error } = await client.from('sync_keys').select('salt, verifier').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const salt = randomSalt();
    const key = await deriveSyncKey(passphrase, salt, undefined, true);
    const { error: insertError } = await client.from('sync_keys').insert({ salt, verifier: await makeVerifier(key) });
    if (insertError) throw new Error(insertError.message);
    return { keyRaw: await exportKey(key), isFirstDevice: true };
  }
  const key = await deriveSyncKey(passphrase, data.salt as string, undefined, true);
  if (!(await checkVerifier(key, data.verifier as EncryptedPayload))) {
    throw new Error('That passphrase does not match the one used on your other device.');
  }
  return { keyRaw: await exportKey(key), isFirstDevice: false };
}
