import { describe, expect, it } from 'vitest';
import { checkVerifier, deriveSyncKey, makeVerifier, randomSalt } from './crypto';
import { INITIAL_SYNC_STATE, incomingWins, OutgoingRow, RemoteRow, runSync, SyncData, SyncServer, SyncState } from './sync';

/** In-memory stand-in for the cloud: upsert by id, increasing seq per write. */
class FakeServer implements SyncServer {
  rows = new Map<string, RemoteRow>();
  seq = 0;
  async pull(afterSeq: number) {
    return [...this.rows.values()].filter((r) => r.seq > afterSeq).sort((a, b) => a.seq - b.seq);
  }
  async push(rows: OutgoingRow[]) {
    for (const r of rows) this.rows.set(r.id, { ...r, seq: ++this.seq });
  }
}

const emptyData = (): SyncData => ({
  settings: { currency: 'OMR' },
  units: [],
  tenancies: [],
  payments: [],
  charges: [],
  expenses: [],
});

const FAST = 10_000; // fewer key iterations keep tests quick
const salt = randomSalt();

async function device(id: string) {
  return { id, key: await deriveSyncKey('correct horse battery', salt, FAST), data: emptyData(), state: { ...INITIAL_SYNC_STATE } as SyncState };
}

let clock = 1_000;
const tick = () => ++clock;

async function sync(d: Awaited<ReturnType<typeof device>>, server: FakeServer) {
  const r = await runSync(d.data, d.state, server, d.key, d.id, tick);
  d.data = r.data;
  d.state = r.state;
  return r;
}

describe('encryption', () => {
  it('only stores ciphertext on the server', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    pc.data.tenancies = [{ id: 't1', unitId: 'u1', tenant: 'Sara Al-Hinai', phone: '96899887766', rent: 220, every: 1, firstDue: '2026-01-01', updatedAt: tick(), updatedBy: 'pc' }];
    await sync(pc, server);
    const stored = JSON.stringify([...server.rows.values()]);
    expect(stored).not.toContain('Sara');
    expect(stored).not.toContain('96899887766');
  });

  it('tells a right passphrase from a wrong one', async () => {
    const right = await deriveSyncKey('correct horse battery', salt, FAST);
    const wrong = await deriveSyncKey('wrong passphrase!!', salt, FAST);
    const verifier = await makeVerifier(right);
    expect(await checkVerifier(right, verifier)).toBe(true);
    expect(await checkVerifier(wrong, verifier)).toBe(false);
  });
});

describe('two devices', () => {
  it('first sync uploads existing data; a new device downloads it', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    pc.data.units = [{ id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' }]; // made before sync: no owner
    const first = await sync(pc, server);
    expect(first.pushed).toBe(2); // unit + settings
    const phone = await device('phone');
    const r = await sync(phone, server);
    expect(r.pulled).toBe(2);
    expect(phone.data.units.map((u) => u.name)).toEqual(['Flat 1']);
  });

  it('edits on each device reach the other and do not bounce back', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    const phone = await device('phone');
    await sync(pc, server);
    await sync(phone, server);

    pc.data.units = [{ id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat', updatedAt: tick(), updatedBy: 'pc' }];
    phone.data.expenses = [{ id: 'e1', date: '2026-02-01', amount: 30, category: 'utilities', updatedAt: tick(), updatedBy: 'phone' }];
    await sync(pc, server);
    await sync(phone, server);
    await sync(pc, server);

    expect(phone.data.units.map((u) => u.id)).toEqual(['u1']);
    expect(pc.data.expenses.map((e) => e.id)).toEqual(['e1']);
    const quiet = await sync(pc, server);
    expect(quiet.pushed).toBe(0); // nothing re-uploaded
  });

  it('a deletion on one device reaches the other as a tombstone', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    const phone = await device('phone');
    pc.data.charges = [{ id: 'c1', unitId: 'u1', tenancyId: 't1', date: '2026-01-05', label: 'Water', kind: 'utility', amount: 9, updatedAt: tick(), updatedBy: 'pc' }];
    await sync(pc, server);
    await sync(phone, server);
    pc.data.charges = [{ ...pc.data.charges[0], deletedAt: tick(), updatedAt: clock, updatedBy: 'pc' }];
    await sync(pc, server);
    await sync(phone, server);
    expect(phone.data.charges[0].deletedAt).toBeTruthy();
  });

  it('when both edit the same record, the later edit wins on both devices', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    const phone = await device('phone');
    const base = { id: 'u1', building: 'Tower', name: 'Flat 1', type: 'Flat' as const };
    pc.data.units = [{ ...base, updatedAt: tick(), updatedBy: 'pc' }];
    await sync(pc, server);
    await sync(phone, server);

    pc.data.units = [{ ...base, name: 'PC name', updatedAt: tick(), updatedBy: 'pc' }];
    phone.data.units = [{ ...base, name: 'Phone name', updatedAt: tick(), updatedBy: 'phone' }]; // later
    await sync(pc, server);
    await sync(phone, server);
    await sync(pc, server);
    expect(pc.data.units[0].name).toBe('Phone name');
    expect(phone.data.units[0].name).toBe('Phone name');
  });

  it('keeps each device’s PIN and notification setting out of sync', async () => {
    const server = new FakeServer();
    const pc = await device('pc');
    const phone = await device('phone');
    pc.data.settings = { currency: 'AED', notifyOnOpen: true, security: { lockAfterMinutes: 5 }, updatedAt: tick(), updatedBy: 'pc' };
    phone.data.settings = { currency: 'OMR', security: { lockAfterMinutes: 30 } };
    await sync(pc, server);
    await sync(phone, server);
    expect(phone.data.settings.currency).toBe('AED');
    expect(phone.data.settings.security).toEqual({ lockAfterMinutes: 30 });
    expect(phone.data.settings.notifyOnOpen).toBeUndefined();
    expect(JSON.stringify([...server.rows.values()])).not.toContain('lockAfterMinutes');
  });
});

describe('incomingWins', () => {
  it('prefers the newer edit and breaks ties the same way on every device', () => {
    expect(incomingWins(undefined, { id: 'x' })).toBe(true);
    expect(incomingWins({ id: 'x', updatedAt: 5 }, { id: 'x', updatedAt: 4 })).toBe(false);
    expect(incomingWins({ id: 'x', updatedAt: 5, updatedBy: 'a' }, { id: 'x', updatedAt: 5, updatedBy: 'b' })).toBe(true);
    expect(incomingWins({ id: 'x', updatedAt: 5, updatedBy: 'b' }, { id: 'x', updatedAt: 5, updatedBy: 'a' })).toBe(false);
  });
});
