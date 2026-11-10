import type { SecuritySettings } from './logic/pin';
/** Sync bookkeeping on every stored record (schema v5). */
export interface SyncMeta {
  /** Last change (ms). Set automatically on every save. */
  updatedAt?: number;
  /** Set instead of removing the record, so other devices learn about the deletion. */
  deletedAt?: number;
  /** Device that made the last change. */
  updatedBy?: string;
}

/** One line in the activity log. */
export interface ActivityEntry {
  id: string;
  at: number;
  deviceId: string;
  summary: string;
}

export type PropertyType = 'Flat' | 'Shop' | 'Office' | 'Other';
export type PaymentCycle = 1 | 3 | 6 | 12;

/* ------------------------------------------------------------------ */
/* Stored records (schema v3)                                          */
/* ------------------------------------------------------------------ */

/** The physical unit. Who lives there is a Tenancy. */
export interface UnitRecord extends SyncMeta {
  id: string;
  building: string;
  name: string;
  type: PropertyType;
  /** Set when the unit is archived. Archived units keep their history but are hidden from daily views. */
  archivedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface RentChange {
  from: string; // YYYY-MM-DD, first due date this rent applies to
  rent: number;
}

export interface DepositDeduction {
  label: string;
  amount: number;
}

/** How a security deposit was closed when the tenant moved out. */
export interface DepositSettlement {
  date: string; // YYYY-MM-DD
  /** Part of the deposit used to clear unpaid rent/charges (recorded as a payment with method 'deposit'). */
  appliedToBalance: number;
  deductions: DepositDeduction[];
  refunded: number;
  note?: string;
}

export interface Deposit {
  amount: number;
  receivedDate?: string; // YYYY-MM-DD
  settlement?: DepositSettlement;
}

/** One tenant's occupation of one unit. Balances never carry from one tenancy to another. */
export interface Tenancy extends SyncMeta {
  id: string;
  unitId: string;
  tenant: string;
  phone: string;
  tenantIdNumber?: string;
  rent: number; // latest rent (mirror of the last rentHistory entry)
  every: PaymentCycle;
  firstDue: string; // YYYY-MM-DD, also the move-in / start date
  opening?: number; // previous balance brought forward, default 0
  leaseEnd?: string; // YYYY-MM-DD, contract end
  rentHistory?: RentChange[];
  /** Move-out date (YYYY-MM-DD). Dues on or after this date are not generated. */
  endedAt?: string;
  deposit?: Deposit;
  createdAt?: number;
  updatedAt?: number;
}

export type PaymentMethod = 'cash' | 'transfer' | 'cheque' | 'card' | 'deposit' | 'other';
export type ChequeStatus = 'pending' | 'cleared' | 'bounced';

export interface ChequeDetails {
  number: string;
  bank?: string;
  date: string; // YYYY-MM-DD, date written on the cheque (post-dated cheques are in the future)
  status: ChequeStatus;
}

export interface Payment extends SyncMeta {
  id: string;
  unitId: string;
  /** Tenancy this payment belongs to. Missing only on data from before schema v3. */
  tenancyId?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note?: string;
  method?: PaymentMethod;
  reference?: string;
  cheque?: ChequeDetails;
  /** Sequential receipt number; never reused. */
  receiptNo?: number;
  /** Receipt prefix in force when the number was issued (so reprints match the original). */
  receiptPrefix?: string;
  /** Set instead of deleting once a receipt number was issued; voided payments do not count. */
  voidedAt?: number;
  ts: number;
  createdAt?: number;
}

export type ChargeKind = 'late_fee' | 'utility' | 'repair' | 'bounced_cheque' | 'other';

/** A one-off amount owed by a tenancy, in addition to rent. */
export interface Charge extends SyncMeta {
  id: string;
  unitId: string;
  tenancyId: string;
  date: string; // YYYY-MM-DD, when it becomes due
  label: string;
  kind: ChargeKind;
  amount: number;
  createdAt?: number;
}

export type ExpenseCategory = 'maintenance' | 'utilities' | 'tax_fees' | 'insurance' | 'management' | 'other';

/** Money spent on the property portfolio (for net income). */
export interface Expense extends SyncMeta {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  /** Optional: the unit it was for (its building is implied). */
  unitId?: string;
  /** Optional: the building it was for, when not tied to one unit. */
  building?: string;
  note?: string;
  createdAt?: number;
}

export interface LandlordDetails {
  name?: string;
  phone?: string;
  address?: string;
}

export interface AppSettings {
  currency: string;
  lastBackupAt?: number;
  updatedAt?: number | string;
  /** Device that last changed a synced setting. */
  updatedBy?: string;
  landlord?: LandlordDetails;
  receiptPrefix?: string;
  /** Next receipt number to issue. Only ever increases. */
  nextReceiptNo?: number;
  /** Custom WhatsApp message wording, by message type (see logic/templates). */
  messageTemplates?: Partial<Record<string, string>>;
  /** Windows app: show a summary notification of what needs attention when the app opens. */
  notifyOnOpen?: boolean;
  /** Optional PIN lock (privacy screen; the data file is not encrypted). */
  security?: SecuritySettings;
}

// Backwards compatibility alias for settings
export type PortfolioSettings = AppSettings;

/* ------------------------------------------------------------------ */
/* View model used by the screens                                      */
/* ------------------------------------------------------------------ */

/**
 * A unit combined with one tenancy (normally the current one). Screens work with this shape;
 * `id` is always the unit id. A vacant unit has `isVacant` and empty tenancy fields.
 */
export interface Unit {
  id: string;
  building: string;
  name: string;
  type: PropertyType;
  tenant: string;
  phone: string;
  rent: number;
  every: PaymentCycle;
  firstDue: string; // YYYY-MM-DD
  opening?: number; // default 0
  leaseEnd?: string; // YYYY-MM-DD
  /**
   * Effective-dated rent changes. A due on date D uses the latest entry with from <= D.
   * Dues before the earliest entry use that earliest entry's rent.
   * When absent (legacy data), every due uses `rent`.
   */
  rentHistory?: RentChange[];
  archivedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  tenancyId?: string;
  tenantIdNumber?: string;
  endedAt?: string;
  deposit?: Deposit;
  isVacant?: boolean;
  /** One-off charges of this tenancy (included in what is owed). */
  charges?: Charge[];
}

export interface DueItem {
  id: string;
  unitId: string;
  label: string;
  dueDate: string; // YYYY-MM-DD
  amount: number;
  paid: number;
  remaining: number;
  isPreviousBalance?: boolean;
  chargeId?: string;
}

export type UnitStatus = 'overdue' | 'today' | 'soon' | 'ok' | 'vacant';

export interface UnitCalculation {
  unit: Unit;
  dueItems: DueItem[];
  totalDue: number;
  totalPaid: number;
  balance: number; // for due dates <= today
  advanceCredit: number;
  status: UnitStatus;
  statusLabel: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  oldestUnpaidItem?: DueItem;
  nextUpcomingItem?: DueItem;
  partPaidNote?: string;
  /** Pending (uncleared) cheques: not counted as paid yet. */
  pendingChequeTotal: number;
}

export interface LeaseAlert {
  unit: Unit;
  leaseEnd: string;
  daysDiff: number; // positive = days until expiry, negative = days expired
  isEnded: boolean;
  isUrgent: boolean; // 30 days or fewer or ended (Red) vs amber
}
