import { Charge, Deposit, DepositSettlement, Tenancy, Unit, UnitRecord } from '../types';

/** Fields of the Unit view that belong to the physical unit; everything else belongs to the tenancy. */
const UNIT_RECORD_FIELDS = ['id', 'building', 'name', 'type', 'archivedAt', 'createdAt', 'updatedAt'] as const;

export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** The tenancy currently occupying a unit: not ended, latest start. Undefined when vacant. */
export function currentTenancyOf(unitId: string, tenancies: Tenancy[]): Tenancy | undefined {
  return tenancies
    .filter(t => t.unitId === unitId && !t.endedAt)
    .sort((a, b) => b.firstDue.localeCompare(a.firstDue))[0];
}

/** All tenancies of a unit, newest first. */
export function tenanciesOf(unitId: string, tenancies: Tenancy[]): Tenancy[] {
  return tenancies
    .filter(t => t.unitId === unitId)
    .sort((a, b) => b.firstDue.localeCompare(a.firstDue));
}

/** Combines a unit with one tenancy (or none = vacant) into the shape the screens use. */
export function buildUnitView(unit: UnitRecord, tenancy: Tenancy | undefined, charges: Charge[]): Unit {
  const base = {
    id: unit.id,
    building: unit.building,
    name: unit.name,
    type: unit.type,
    archivedAt: unit.archivedAt,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
  };
  if (!tenancy) {
    return { ...base, tenant: '', phone: '', rent: 0, every: 1, firstDue: '', isVacant: true, charges: [] };
  }
  return {
    ...base,
    tenancyId: tenancy.id,
    tenant: tenancy.tenant,
    phone: tenancy.phone,
    tenantIdNumber: tenancy.tenantIdNumber,
    rent: tenancy.rent,
    every: tenancy.every,
    firstDue: tenancy.firstDue,
    opening: tenancy.opening,
    leaseEnd: tenancy.leaseEnd,
    rentHistory: tenancy.rentHistory,
    endedAt: tenancy.endedAt,
    deposit: tenancy.deposit,
    charges: charges.filter(c => c.tenancyId === tenancy.id),
  };
}

/** Builds the view of every unit with its current tenancy. */
export function buildUnitViews(units: UnitRecord[], tenancies: Tenancy[], charges: Charge[]): Unit[] {
  return units.map(u => buildUnitView(u, currentTenancyOf(u.id, tenancies), charges));
}

/** Splits an edited view back into the stored unit record and tenancy record. */
export function splitUnitView(view: Unit, existingTenancy?: Tenancy): { unit: UnitRecord; tenancy?: Tenancy } {
  const unit: UnitRecord = {
    id: view.id,
    building: view.building,
    name: view.name,
    type: view.type,
    archivedAt: view.archivedAt,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
  for (const key of UNIT_RECORD_FIELDS) {
    if (unit[key] === undefined) delete unit[key];
  }
  if (view.isVacant || !existingTenancy) return { unit };
  const tenancy: Tenancy = {
    ...existingTenancy,
    tenant: view.tenant,
    phone: view.phone,
    tenantIdNumber: view.tenantIdNumber,
    rent: view.rent,
    every: view.every,
    firstDue: view.firstDue,
    opening: view.opening,
    leaseEnd: view.leaseEnd,
    rentHistory: view.rentHistory,
    deposit: view.deposit,
    updatedAt: Date.now(),
  };
  return { unit, tenancy };
}

/** Input for creating a unit together with its first tenancy (from a form or a bulk import). */
export type NewUnitInput = Omit<Unit, 'id'>;

export function createUnitWithTenancy(input: NewUnitInput): { unit: UnitRecord; tenancy: Tenancy } {
  const now = Date.now();
  const unitId = newId('unit');
  const unit: UnitRecord = {
    id: unitId,
    building: input.building,
    name: input.name,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };
  const tenancy: Tenancy = {
    id: newId('ten'),
    unitId,
    tenant: input.tenant,
    phone: input.phone,
    tenantIdNumber: input.tenantIdNumber,
    rent: input.rent,
    every: input.every,
    firstDue: input.firstDue,
    opening: input.opening,
    leaseEnd: input.leaseEnd,
    rentHistory: input.rentHistory?.length ? input.rentHistory : [{ from: input.firstDue, rent: input.rent }],
    deposit: input.deposit,
    createdAt: now,
    updatedAt: now,
  };
  return { unit, tenancy };
}

/* ------------------------------------------------------------------ */
/* Deposit settlement                                                  */
/* ------------------------------------------------------------------ */

export interface SettlementPlan {
  depositHeld: number;
  appliedToBalance: number;
  deductionsTotal: number;
  refunded: number;
  /** Unpaid balance left after the deposit is applied (the tenant still owes this). */
  balanceStillOwed: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Works out a move-out settlement. The deposit first covers unpaid balance (if `applyToBalance`),
 * then listed deductions; whatever remains is refunded. Throws if deductions exceed what is left.
 */
export function planSettlement(
  deposit: Deposit | undefined,
  outstandingBalance: number,
  deductions: { amount: number }[],
  applyToBalance: boolean
): SettlementPlan {
  const depositHeld = round3(Math.max(0, Number(deposit?.amount) || 0));
  const balance = round3(Math.max(0, outstandingBalance));
  const appliedToBalance = applyToBalance ? Math.min(depositHeld, balance) : 0;
  const deductionsTotal = round3(deductions.reduce((s, d) => s + Math.max(0, Number(d.amount) || 0), 0));
  const left = round3(depositHeld - appliedToBalance);
  if (deductionsTotal > left) {
    throw new Error(`Deductions (${deductionsTotal}) are more than the deposit left (${left}).`);
  }
  return {
    depositHeld,
    appliedToBalance: round3(appliedToBalance),
    deductionsTotal,
    refunded: round3(left - deductionsTotal),
    balanceStillOwed: round3(balance - appliedToBalance),
  };
}

/** Total security deposits currently held for tenants who have not moved out. */
export function depositsHeld(tenancies: Tenancy[]): number {
  return round3(
    tenancies
      .filter(t => !t.endedAt && t.deposit && !t.deposit.settlement)
      .reduce((s, t) => s + (Number(t.deposit?.amount) || 0), 0)
  );
}

export function settlementRecord(
  plan: SettlementPlan,
  date: string,
  deductions: { label: string; amount: number }[],
  note?: string
): DepositSettlement {
  return {
    date,
    appliedToBalance: plan.appliedToBalance,
    deductions: deductions.filter(d => Number(d.amount) > 0).map(d => ({ label: d.label.trim() || 'Deduction', amount: round3(Number(d.amount)) })),
    refunded: plan.refunded,
    note: note?.trim() || undefined,
  };
}
