import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppSettings,
  Charge,
  ChargeKind,
  Deposit,
  DepositDeduction,
  Expense,
  Payment,
  SyncMeta,
  PaymentCycle,
  Tenancy,
  Unit,
  UnitRecord
} from '../types';
import { SAMPLE_UNITS } from '../data/sampleUnits';
import {
  AppDatabase,
  CURRENT_SCHEMA_VERSION,
  loadDb,
  normalizeTenancies,
  onStorageError,
  saveDb,
  STORAGE_KEY_DB,
  upgradeDb
} from '../logic/storage';
import { calculateUnit, getTodayStr, mergeUnitUpdate } from '../logic/rentEngine';
import {
  buildUnitView,
  buildUnitViews,
  createUnitWithTenancy,
  currentTenancyOf,
  NewUnitInput,
  newId,
  planSettlement,
  SettlementPlan,
  settlementRecord,
  splitUnitView
} from '../logic/tenancy';
import { appendActivity, COLLECTIONS, DEVICE_KEY, DeviceIdentity, eraseAllRecords, liveView, loadDeviceIdentity, nextReceiptNumber, stampChanges } from '../logic/syncModel';
import { incomingWins, SyncData } from '../logic/sync';
import { BackupData } from '../logic/backup';

export interface UpdateUnitOptions {
  /** When the rent changes, the first due date the new rent applies to. Omit to correct all dues. */
  rentEffectiveFrom?: string;
}

interface UndoPaymentAction {
  id: string;
  paymentId: string;
  amount: number;
  unitName: string;
  building: string;
  timerId: ReturnType<typeof setTimeout>;
  expiresAt: number;
}

export type NewPaymentInput = Omit<Payment, 'id' | 'ts' | 'tenancyId' | 'receiptNo' | 'voidedAt' | 'createdAt'>;

export interface MoveOutInput {
  date: string; // YYYY-MM-DD
  applyDepositToBalance: boolean;
  deductions: DepositDeduction[];
  note?: string;
}

export interface MoveInInput {
  tenant: string;
  phone: string;
  tenantIdNumber?: string;
  rent: number;
  every: PaymentCycle;
  firstDue: string;
  leaseEnd?: string;
  opening?: number;
  deposit?: Deposit;
}

export interface NewChargeInput {
  unitId: string;
  /** Defaults to the unit's current tenancy. */
  tenancyId?: string;
  date: string;
  label: string;
  kind: ChargeKind;
  amount: number;
}

export interface AppContextType {
  currency: string;
  settings: AppSettings;
  /** All units (current tenancy view), including archived ones. Daily views should use `activeUnits`. */
  units: Unit[];
  activeUnits: Unit[];
  archivedUnits: Unit[];
  payments: Payment[];
  tenancies: Tenancy[];
  charges: Charge[];
  /** Raw stored records, e.g. for backups. */
  db: AppDatabase;
  undoAction: UndoPaymentAction | null;
  storageError: string | null;
  clearStorageError: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  addUnit: (unit: NewUnitInput) => Promise<string>;
  updateUnit: (id: string, unit: Partial<Unit>, options?: UpdateUnitOptions) => Promise<void>;
  archiveUnit: (id: string) => Promise<void>;
  unarchiveUnit: (id: string) => Promise<void>;
  /** Permanently removes a unit with all its tenancies, payments and charges. */
  deleteUnit: (id: string) => Promise<void>;
  recordPayment: (payment: NewPaymentInput, unitInfo?: { name: string; building: string }) => Promise<string>;
  /** Records several payments at once (e.g. a series of post-dated cheques). No undo toast. */
  recordPayments: (payments: NewPaymentInput[]) => Promise<number>;
  updatePayment: (paymentId: string, partial: Partial<Pick<Payment, 'cheque' | 'note' | 'method' | 'reference'>>) => Promise<void>;
  /** Removes a payment, or voids it if a receipt number was already issued. */
  deletePayment: (paymentId: string) => Promise<void>;
  undoLastPayment: () => Promise<void>;
  dismissUndo: () => void;
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<string>;
  updateExpense: (id: string, partial: Partial<Omit<Expense, 'id'>>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addCharge: (charge: NewChargeInput) => Promise<string>;
  deleteCharge: (chargeId: string) => Promise<void>;
  previewMoveOut: (unitId: string, input: MoveOutInput) => SettlementPlan & { outstanding: number; advanceCredit: number };
  moveOut: (unitId: string, input: MoveOutInput) => Promise<void>;
  moveIn: (unitId: string, input: MoveInInput) => Promise<void>;
  loadSampleUnits: () => Promise<void>;
  eraseEverything: () => Promise<void>;
  bulkImportUnits: (newUnits: NewUnitInput[]) => Promise<number>;
  restoreBackup: (newDb: AppDatabase | BackupData) => Promise<void>;
  /** Stored data including deletion markers (what sync sends). */
  rawDb: AppDatabase;
  /** This device's id and receipt series (device-local). */
  device: DeviceIdentity;
  setDeviceReceiptPrefix: (prefix: string | undefined) => void;
  /** Merges a sync result: per record, the newer edit wins; local edits made during the sync are kept. */
  mergeFromSync: (incoming: SyncData, pulled: number) => void;
}

export const AppContext = createContext<AppContextType | null>(null);

/** Far-future "today": counts every due up to move-out plus every charge. */
const END_OF_TIME = '9999-12-31';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load once (in the desktop app this reads the data file).
  // Stored data including deletion markers (for sync); screens get the live view below.
  const [rawDb, setRawDb] = useState<AppDatabase>(() => loadDb());
  const dbRef = useRef(rawDb);
  const db = useMemo(() => liveView(rawDb), [rawDb]);
  // This device (kept on the device, never synced): its id and receipt series.
  const [device] = useState<DeviceIdentity>(() =>
    typeof localStorage !== 'undefined' ? loadDeviceIdentity(localStorage, () => newId('dev')) : { id: 'server' }
  );
  const [undoAction, setUndoAction] = useState<UndoPaymentAction | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Theme support
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('rent_tracker_theme');
        if (saved === 'dark' || saved === 'light') {
          return saved;
        }
      }
    } catch (e) {
      console.error('Failed to load theme from localStorage', e);
    }
    return 'light';
  });

  const syncThemeDOM = useCallback((t: 'light' | 'dark') => {
    if (typeof document !== 'undefined') {
      const els = [document.documentElement, document.body, document.getElementById('root')];
      els.forEach((el) => el?.classList.toggle('dark', t === 'dark'));
    }
  }, []);

  useEffect(() => {
    syncThemeDOM(theme);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('rent_tracker_theme', theme);
      }
    } catch (e) {
      console.error('Failed to save theme to localStorage', e);
    }
  }, [theme, syncThemeDOM]);

  const setTheme = (t: 'light' | 'dark') => setThemeState(t);
  const toggleTheme = () => setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'));

  // Subscribe to storage errors (quota or private mode)
  useEffect(() => onStorageError((msg) => setStorageError(msg)), []);
  const clearStorageError = () => setStorageError(null);

  // MULTIPLE TABS (browser): reload data another tab saved instead of overwriting it
  useEffect(() => {
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_DB && e.newValue) {
        try {
          const remoteDb = upgradeDb(JSON.parse(e.newValue));
          if (remoteDb) {
            dbRef.current = remoteDb;
            setRawDb(remoteDb);
          }
        } catch (err) {
          console.error('Failed to parse remote storage update:', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  /** Applies a change to the latest database, then saves it. */
  const commit = useCallback(
    (change: (current: AppDatabase) => AppDatabase) => {
      const prevRaw = dbRef.current;
      const now = Date.now();
      // Changes are made against the live view; stamping turns them into dated records and tombstones.
      const nextLive = change(liveView(prevRaw));
      // Synced settings changed? Stamp them too (PIN and notifications are device-only and not compared).
      const syncedKey = (s: AppSettings) => {
        const { updatedAt: _a, updatedBy: _b, security: _s, notifyOnOpen: _n, lastBackupAt: _l, ...rest } = s;
        return JSON.stringify(rest);
      };
      if (syncedKey(nextLive.settings) !== syncedKey(prevRaw.settings)) {
        nextLive.settings = { ...nextLive.settings, updatedAt: now, updatedBy: device.id };
      }
      const stamped = stampChanges(prevRaw, nextLive, now, device.id, () => newId('act'));
      const next: AppDatabase = {
        ...nextLive,
        ...stamped.raw,
        activity: appendActivity(prevRaw.activity, stamped.activity),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        updatedAt: now
      };
      dbRef.current = next;
      setRawDb(next);
      saveDb(next);
      return next;
    },
    [device.id]
  );

  /** This device's receipt series: its own prefix, numbered after the highest number already issued. */
  const receiptSeries = (cur: AppDatabase) => {
    const prefix = device.receiptPrefix ?? cur.settings.receiptPrefix ?? 'R-';
    const floor = device.receiptPrefix ? 1 : cur.settings.nextReceiptNo || 1;
    // Uses stored payments including deleted ones, so a number is never handed out twice.
    return { prefix, first: nextReceiptNumber(dbRef.current.payments, prefix, floor), isMainSeries: !device.receiptPrefix };
  };

  // Stable between saves, so screens that depend on these lists do not reset on unrelated re-renders.
  const views = useMemo(() => buildUnitViews(db.units, db.tenancies, db.charges), [db]);
  const activeUnits = useMemo(() => views.filter((u) => !u.archivedAt), [views]);
  const archivedUnits = useMemo(() => views.filter((u) => Boolean(u.archivedAt)), [views]);

  const updateSettings = async (partial: Partial<AppSettings>) => {
    commit((cur) => ({ ...cur, settings: { ...cur.settings, ...partial, updatedAt: Date.now() } }));
  };

  const addUnit = async (input: NewUnitInput): Promise<string> => {
    const { unit, tenancy } = createUnitWithTenancy(input);
    commit((cur) => ({ ...cur, units: [...cur.units, unit], tenancies: [...cur.tenancies, tenancy] }));
    return unit.id;
  };

  const updateUnit = async (id: string, partial: Partial<Unit>, options?: UpdateUnitOptions) => {
    commit((cur) => {
      const record = cur.units.find((u) => u.id === id);
      if (!record) return cur;
      const tenancy = currentTenancyOf(id, cur.tenancies);
      const view = buildUnitView(record, tenancy, cur.charges);
      const merged = { ...mergeUnitUpdate(view, partial, options?.rentEffectiveFrom), updatedAt: Date.now() };
      const split = splitUnitView(merged, tenancy);
      return {
        ...cur,
        units: cur.units.map((u) => (u.id === id ? split.unit : u)),
        tenancies: split.tenancy ? cur.tenancies.map((t) => (t.id === split.tenancy!.id ? split.tenancy! : t)) : cur.tenancies
      };
    });
  };

  const setArchived = (id: string, archived: boolean) => {
    commit((cur) => ({
      ...cur,
      units: cur.units.map((u): UnitRecord => {
        if (u.id !== id) return u;
        const { archivedAt: _previous, ...rest } = u;
        return archived ? { ...rest, archivedAt: Date.now(), updatedAt: Date.now() } : { ...rest, updatedAt: Date.now() };
      })
    }));
  };
  const archiveUnit = async (id: string) => setArchived(id, true);
  const unarchiveUnit = async (id: string) => setArchived(id, false);

  const deleteUnit = async (id: string) => {
    commit((cur) => ({
      ...cur,
      units: cur.units.filter((u) => u.id !== id),
      tenancies: cur.tenancies.filter((t) => t.unitId !== id),
      payments: cur.payments.filter((p) => p.unitId !== id),
      charges: cur.charges.filter((c) => c.unitId !== id),
      // Money spent is still real: keep the expense, attached to the building instead of the deleted unit.
      expenses: (cur.expenses || []).map((e) => {
        if (e.unitId !== id) return e;
        const { unitId: _gone, ...rest } = e;
        return { ...rest, building: rest.building || cur.units.find((u) => u.id === id)?.building };
      })
    }));
  };

  const recordPayment = async (payment: NewPaymentInput, unitInfo?: { name: string; building: string }): Promise<string> => {
    const id = newId('pay');
    const ts = Date.now();
    commit((cur) => {
      const tenancy = currentTenancyOf(payment.unitId, cur.tenancies);
      const series = receiptSeries(cur);
      const receiptNo = series.first;
      const record: Payment = {
        ...payment,
        id,
        ts,
        createdAt: ts,
        tenancyId: tenancy?.id,
        receiptNo,
        receiptPrefix: series.prefix
      };
      return {
        ...cur,
        payments: [record, ...cur.payments],
        settings: series.isMainSeries ? { ...cur.settings, nextReceiptNo: receiptNo + 1 } : cur.settings
      };
    });

    // 6-second undo toast
    if (undoAction?.timerId) clearTimeout(undoAction.timerId);
    const timerId = setTimeout(() => setUndoAction(null), 6000);
    setUndoAction({
      id: 'undo_' + ts,
      paymentId: id,
      amount: payment.amount,
      unitName: unitInfo?.name || 'Unit',
      building: unitInfo?.building || 'Building',
      timerId,
      expiresAt: ts + 6000
    });

    return id;
  };

  const recordPayments = async (list: NewPaymentInput[]): Promise<number> => {
    if (list.length === 0) return 0;
    commit((cur) => {
      const series = receiptSeries(cur);
      let receiptNo = series.first;
      const created: Payment[] = list.map((payment, i) => {
        const ts = Date.now() + i;
        return {
          ...payment,
          id: newId('pay'),
          ts,
          createdAt: ts,
          tenancyId: currentTenancyOf(payment.unitId, cur.tenancies)?.id,
          receiptNo: receiptNo++,
          receiptPrefix: series.prefix
        };
      });
      return {
        ...cur,
        payments: [...created.reverse(), ...cur.payments],
        settings: series.isMainSeries ? { ...cur.settings, nextReceiptNo: receiptNo } : cur.settings
      };
    });
    return list.length;
  };

  const updatePayment: AppContextType['updatePayment'] = async (paymentId, partial) => {
    commit((cur) => ({
      ...cur,
      payments: cur.payments.map((p) => (p.id === paymentId ? { ...p, ...partial } : p))
    }));
  };

  const removeOrVoid = (paymentId: string) => {
    commit((cur) => ({
      ...cur,
      payments: cur.payments.flatMap((p) => {
        if (p.id !== paymentId) return [p];
        // A receipt number, once issued, is never reused: keep the payment as VOID.
        return p.receiptNo ? [{ ...p, voidedAt: Date.now() }] : [];
      })
    }));
  };

  const deletePayment = async (paymentId: string) => removeOrVoid(paymentId);

  const undoLastPayment = async () => {
    if (!undoAction) return;
    clearTimeout(undoAction.timerId);
    setUndoAction(null);
    removeOrVoid(undoAction.paymentId);
  };

  const dismissUndo = () => {
    if (undoAction?.timerId) clearTimeout(undoAction.timerId);
    setUndoAction(null);
  };

  const addCharge = async (input: NewChargeInput): Promise<string> => {
    const id = newId('chg');
    commit((cur) => {
      const tenancyId = input.tenancyId || currentTenancyOf(input.unitId, cur.tenancies)?.id;
      if (!tenancyId) throw new Error('This unit is vacant: there is no tenant to charge.');
      const charge: Charge = { ...input, id, tenancyId, createdAt: Date.now() };
      return { ...cur, charges: [...cur.charges, charge] };
    });
    return id;
  };

  const addExpense: AppContextType['addExpense'] = async (expense) => {
    const id = newId('exp');
    commit((cur) => ({ ...cur, expenses: [...(cur.expenses || []), { ...expense, id, createdAt: Date.now() }] }));
    return id;
  };

  const updateExpense: AppContextType['updateExpense'] = async (id, partial) => {
    commit((cur) => ({ ...cur, expenses: (cur.expenses || []).map((e) => (e.id === id ? { ...e, ...partial } : e)) }));
  };

  const deleteExpense = async (id: string) => {
    commit((cur) => ({ ...cur, expenses: (cur.expenses || []).filter((e) => e.id !== id) }));
  };

  const deleteCharge = async (chargeId: string) => {
    commit((cur) => ({ ...cur, charges: cur.charges.filter((c) => c.id !== chargeId) }));
  };

  /** Settlement figures for moving the current tenant out on `input.date`. */
  const computeMoveOut = (cur: AppDatabase, unitId: string, input: MoveOutInput) => {
    const record = cur.units.find((u) => u.id === unitId);
    const tenancy = currentTenancyOf(unitId, cur.tenancies);
    if (!record || !tenancy) throw new Error('This unit has no current tenant.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Choose the move-out date.');
    if (input.date < tenancy.firstDue) throw new Error('Move-out date cannot be before the tenancy started.');
    const endedView = buildUnitView(record, { ...tenancy, endedAt: input.date }, cur.charges);
    const calc = calculateUnit(endedView, cur.payments, END_OF_TIME);
    const plan = planSettlement(tenancy.deposit, calc.balance, input.deductions, input.applyDepositToBalance);
    return { record, tenancy, plan, outstanding: calc.balance, advanceCredit: calc.advanceCredit };
  };

  const previewMoveOut: AppContextType['previewMoveOut'] = (unitId, input) => {
    const { plan, outstanding, advanceCredit } = computeMoveOut(liveView(dbRef.current), unitId, input);
    return { ...plan, outstanding, advanceCredit };
  };

  const moveOut = async (unitId: string, input: MoveOutInput) => {
    commit((cur) => {
      const { tenancy, plan } = computeMoveOut(cur, unitId, input);
      const payments = [...cur.payments];
      if (plan.appliedToBalance > 0) {
        const ts = Date.now();
        payments.unshift({
          id: newId('pay'),
          unitId,
          tenancyId: tenancy.id,
          amount: plan.appliedToBalance,
          date: input.date,
          method: 'deposit',
          note: 'Security deposit applied at move-out',
          ts,
          createdAt: ts
        });
      }
      const hasDeposit = plan.depositHeld > 0 || input.deductions.length > 0;
      const ended: Tenancy = {
        ...tenancy,
        endedAt: input.date,
        deposit: hasDeposit
          ? {
              amount: tenancy.deposit?.amount || 0,
              receivedDate: tenancy.deposit?.receivedDate,
              settlement: settlementRecord(plan, input.date, input.deductions, input.note)
            }
          : tenancy.deposit,
        updatedAt: Date.now()
      };
      return { ...cur, payments, tenancies: cur.tenancies.map((t) => (t.id === tenancy.id ? ended : t)) };
    });
  };

  const moveIn = async (unitId: string, input: MoveInInput) => {
    commit((cur) => {
      if (!cur.units.some((u) => u.id === unitId)) throw new Error('Unit not found.');
      if (currentTenancyOf(unitId, cur.tenancies)) throw new Error('This unit already has a tenant. Move them out first.');
      const now = Date.now();
      const [tenancy] = normalizeTenancies([
        {
          id: newId('ten'),
          unitId,
          tenant: input.tenant,
          phone: input.phone,
          tenantIdNumber: input.tenantIdNumber,
          rent: input.rent,
          every: input.every,
          firstDue: input.firstDue,
          leaseEnd: input.leaseEnd,
          opening: input.opening,
          deposit: input.deposit,
          createdAt: now,
          updatedAt: now
        }
      ]);
      return { ...cur, tenancies: [...cur.tenancies, tenancy] };
    });
  };

  const insertUnits = (inputs: NewUnitInput[]) => {
    const created = inputs.map((u) => createUnitWithTenancy(u));
    commit((cur) => ({
      ...cur,
      units: [...cur.units, ...created.map((c) => c.unit)],
      tenancies: [...cur.tenancies, ...created.map((c) => c.tenancy)]
    }));
    return created.length;
  };

  const loadSampleUnits = async () => {
    insertUnits(SAMPLE_UNITS);
  };

  const eraseEverything = async () => {
    // A full wipe, not a normal edit: no deletion markers are kept and the activity log is cleared too.
    const next = eraseAllRecords(dbRef.current, Date.now());
    dbRef.current = next;
    setRawDb(next);
    saveDb(next);
  };

  const bulkImportUnits = async (newUnits: NewUnitInput[]): Promise<number> => insertUnits(newUnits);

  const [deviceState, setDeviceState] = useState(device);
  const setDeviceReceiptPrefix = (prefix: string | undefined) => {
    const next = { ...deviceState, receiptPrefix: prefix?.trim() || undefined };
    try {
      localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn('Could not save device settings', err);
    }
    device.receiptPrefix = next.receiptPrefix; // used by receipt numbering
    setDeviceState(next);
  };

  const mergeFromSync = useCallback((incoming: SyncData, pulled: number) => {
    const cur = dbRef.current;
    const next: AppDatabase = { ...cur };
    for (const name of COLLECTIONS) {
      const list = [...((cur[name] || []) as (SyncMeta & { id: string })[])];
      const index = new Map(list.map((r, i) => [r.id, i]));
      for (const r of (incoming[name] || []) as (SyncMeta & { id: string })[]) {
        const i = index.get(r.id);
        if (i === undefined) {
          index.set(r.id, list.length);
          list.push(r);
        } else if (list[i] !== r && incomingWins(list[i], r)) {
          list[i] = r;
        }
      }
      (next[name] as unknown) = list;
    }
    const s = incoming.settings as AppSettings;
    if (incomingWins(cur.settings as unknown as SyncMeta & { id: string }, s as unknown as SyncMeta & { id: string })) {
      next.settings = { ...s, security: cur.settings.security, notifyOnOpen: cur.settings.notifyOnOpen };
    }
    if (pulled > 0) {
      next.activity = appendActivity(cur.activity, [
        { id: newId('act'), at: Date.now(), deviceId: device.id, summary: `Synced ${pulled} change(s) from your other device` }
      ]);
    }
    dbRef.current = next;
    setRawDb(next);
    saveDb(next);
  }, [device.id]);

  const restoreBackup = async (incoming: AppDatabase | BackupData) => {
    const upgraded = upgradeDb({ ...incoming, schemaVersion: incoming.schemaVersion || CURRENT_SCHEMA_VERSION });
    if (!upgraded) throw new Error('Backup could not be read.');
    commit(() => ({
      ...upgraded,
      settings: {
        ...upgraded.settings,
        currency: upgraded.settings.currency || dbRef.current.settings.currency,
        lastBackupAt: upgraded.settings.lastBackupAt || Date.now(),
        // Never let a restore move receipt numbering backwards
        nextReceiptNo: Math.max(upgraded.settings.nextReceiptNo || 1, dbRef.current.settings.nextReceiptNo || 1),
        updatedAt: Date.now()
      }
    }));
  };

  return (
    <AppContext.Provider
      value={{
        currency: db.settings.currency || 'OMR',
        settings: db.settings,
        units: views,
        activeUnits,
        archivedUnits,
        payments: db.payments,
        tenancies: db.tenancies,
        charges: db.charges,
        db,
        undoAction,
        storageError,
        clearStorageError,
        theme,
        setTheme,
        toggleTheme,
        updateSettings,
        addUnit,
        updateUnit,
        archiveUnit,
        unarchiveUnit,
        deleteUnit,
        recordPayment,
        recordPayments,
        updatePayment,
        deletePayment,
        undoLastPayment,
        dismissUndo,
        expenses: db.expenses || [],
        addExpense,
        updateExpense,
        deleteExpense,
        addCharge,
        deleteCharge,
        previewMoveOut,
        moveOut,
        moveIn,
        loadSampleUnits,
        eraseEverything,
        bulkImportUnits,
        restoreBackup,
        rawDb,
        device: deviceState,
        setDeviceReceiptPrefix,
        mergeFromSync
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export { getTodayStr };
