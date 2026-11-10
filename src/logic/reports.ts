import { Charge, Expense, Payment, Tenancy, Unit, UnitRecord } from '../types';
import { addDays, calculateUnit, daysBetween, generateDueDates, paymentCounts } from './rentEngine';
import { buildUnitView, currentTenancyOf } from './tenancy';

/** The stored records a report needs. */
export interface ReportSource {
  units: UnitRecord[];
  tenancies: Tenancy[];
  payments: Payment[];
  charges: Charge[];
  expenses?: Expense[];
}

export interface Period {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

interface TenancyEntry {
  tenancy: Tenancy;
  unit: UnitRecord;
  view: Unit;
}

/** Every tenancy (current and former) with its unit, as a view the rent engine understands. */
export function tenancyEntries(src: ReportSource): TenancyEntry[] {
  const unitById = new Map(src.units.map((u) => [u.id, u]));
  const entries: TenancyEntry[] = [];
  for (const t of src.tenancies) {
    const unit = unitById.get(t.unitId);
    if (unit) entries.push({ tenancy: t, unit, view: buildUnitView(unit, t, src.charges) });
  }
  return entries;
}

/** 'YYYY-MM' for every calendar month touched by the period. */
export function monthsInPeriod(period: Period): string[] {
  const months: string[] = [];
  let [y, m] = period.from.split('-').map(Number);
  const [ty, tm] = period.to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

/** Last day of a 'YYYY-MM' month. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

/** Rent and charges that fall due in the period, per tenancy. Previous balances brought forward are excluded. */
function duesInPeriod(entry: TenancyEntry, period: Period): { date: string; amount: number }[] {
  return generateDueDates(entry.view, period.to)
    .filter((d) => !d.isPreviousBalance && inPeriod(d.dueDate, period))
    .map((d) => ({ date: d.dueDate, amount: d.amount }));
}

/** Cleared money received in the period (cash basis; cheques are dated by the cheque). */
function collectedInPeriod(payments: Payment[], period: Period): Payment[] {
  return payments.filter((p) => paymentCounts(p) && inPeriod(p.date, period));
}

function expenseBuilding(e: Expense, unitById: Map<string, UnitRecord>): string | undefined {
  if (e.unitId) return unitById.get(e.unitId)?.building.trim() || e.building?.trim();
  return e.building?.trim() || undefined;
}

/* ------------------------------------------------------------------ */
/* Month by month                                                      */
/* ------------------------------------------------------------------ */

export interface MonthRow {
  month: string; // YYYY-MM
  due: number;
  collected: number;
  expenses: number;
  net: number; // collected - expenses
}

export function monthlySummary(src: ReportSource, period: Period): MonthRow[] {
  const months = monthsInPeriod(period);
  const rows = new Map<string, MonthRow>(months.map((m) => [m, { month: m, due: 0, collected: 0, expenses: 0, net: 0 }]));
  const key = (date: string) => date.slice(0, 7);

  for (const entry of tenancyEntries(src)) {
    for (const d of duesInPeriod(entry, period)) {
      const row = rows.get(key(d.date));
      if (row) row.due += d.amount;
    }
  }
  for (const p of collectedInPeriod(src.payments, period)) {
    const row = rows.get(key(p.date));
    if (row) row.collected += Number(p.amount) || 0;
  }
  for (const e of src.expenses || []) {
    if (!inPeriod(e.date, period)) continue;
    const row = rows.get(key(e.date));
    if (row) row.expenses += Number(e.amount) || 0;
  }

  return months.map((m) => {
    const r = rows.get(m)!;
    return { month: m, due: round3(r.due), collected: round3(r.collected), expenses: round3(r.expenses), net: round3(r.collected - r.expenses) };
  });
}

export interface PeriodTotals {
  due: number;
  collected: number;
  expenses: number;
  net: number;
  /** collected / due; can exceed 1 when old arrears are paid. Null when nothing fell due. */
  collectionRate: number | null;
}

export function periodTotals(rows: MonthRow[]): PeriodTotals {
  const sum = (k: 'due' | 'collected' | 'expenses') => round3(rows.reduce((s, r) => s + r[k], 0));
  const due = sum('due');
  const collected = sum('collected');
  const expenses = sum('expenses');
  return { due, collected, expenses, net: round3(collected - expenses), collectionRate: due > 0 ? collected / due : null };
}

/* ------------------------------------------------------------------ */
/* Arrears by age                                                      */
/* ------------------------------------------------------------------ */

export const AGE_BUCKETS = ['0–30 days', '31–60 days', '61–90 days', '90+ days'] as const;

export interface ArrearsRow {
  unitId: string;
  tenancyId: string;
  building: string;
  unitLabel: string;
  tenant: string;
  isFormerTenant: boolean;
  buckets: [number, number, number, number];
  total: number;
  oldestDays: number;
}

function bucketIndex(ageDays: number): 0 | 1 | 2 | 3 {
  if (ageDays <= 30) return 0;
  if (ageDays <= 60) return 1;
  if (ageDays <= 90) return 2;
  return 3;
}

/**
 * Everything owed as of `asOf`, per tenancy (current and former), split by how long each unpaid
 * amount has been due. Uses the same oldest-first allocation as the rest of the app.
 */
export function arrearsAgeing(src: ReportSource, asOf: string): { rows: ArrearsRow[]; totals: [number, number, number, number]; total: number } {
  const rows: ArrearsRow[] = [];
  for (const entry of tenancyEntries(src)) {
    const calc = calculateUnit(entry.view, src.payments, asOf);
    if (calc.balance <= 0) continue;
    const buckets: [number, number, number, number] = [0, 0, 0, 0];
    let oldestDays = 0;
    for (const item of calc.dueItems) {
      if (item.dueDate > asOf || item.remaining <= 0) continue;
      const age = daysBetween(asOf, item.dueDate);
      buckets[bucketIndex(age)] += item.remaining;
      oldestDays = Math.max(oldestDays, age);
    }
    rows.push({
      unitId: entry.unit.id,
      tenancyId: entry.tenancy.id,
      building: entry.unit.building,
      unitLabel: `${entry.unit.building} · ${entry.unit.name}`,
      tenant: entry.tenancy.tenant,
      isFormerTenant: Boolean(entry.tenancy.endedAt),
      buckets: buckets.map(round3) as [number, number, number, number],
      total: calc.balance,
      oldestDays
    });
  }
  rows.sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total);
  const totals = [0, 1, 2, 3].map((i) => round3(rows.reduce((s, r) => s + r.buckets[i], 0))) as [number, number, number, number];
  return { rows, totals, total: round3(rows.reduce((s, r) => s + r.total, 0)) };
}

/* ------------------------------------------------------------------ */
/* Occupancy                                                           */
/* ------------------------------------------------------------------ */

export interface UnitOccupancy {
  unitId: string;
  building: string;
  unitLabel: string;
  isVacantNow: boolean;
  vacantDays: number;
  periodDays: number;
}

/** Days in [from, to] (inclusive) not covered by any tenancy of the unit. A tenancy covers [firstDue, endedAt). */
function vacantDaysFor(unitId: string, tenancies: Tenancy[], from: string, to: string): number {
  if (to < from) return 0;
  const intervals = tenancies
    .filter((t) => t.unitId === unitId)
    .map((t) => ({ start: t.firstDue, end: t.endedAt ? addDays(t.endedAt, -1) : to }))
    .filter((i) => i.end >= from && i.start <= to)
    .map((i) => ({ start: i.start < from ? from : i.start, end: i.end > to ? to : i.end }))
    .sort((a, b) => a.start.localeCompare(b.start));
  let covered = 0;
  let cursor = from;
  for (const i of intervals) {
    const start = i.start > cursor ? i.start : cursor;
    if (i.end >= start) {
      covered += daysBetween(i.end, start) + 1;
      cursor = addDays(i.end, 1);
    }
  }
  return daysBetween(to, from) + 1 - covered;
}

/** First day the app knows about a unit: its earliest tenancy start, else the day it was added. */
function trackingStart(u: UnitRecord, tenancies: Tenancy[]): string | undefined {
  const starts = tenancies.filter((t) => t.unitId === u.id).map((t) => t.firstDue).sort();
  if (starts.length) return starts[0];
  if (u.createdAt) {
    const d = new Date(u.createdAt);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return undefined;
}

export function occupancy(src: ReportSource, period: Period, asOf: string) {
  const active = src.units.filter((u) => !u.archivedAt);
  // Only count days up to today; the future is not vacant yet.
  const to = period.to < asOf ? period.to : asOf;
  const units: UnitOccupancy[] = active.map((u) => {
    // Days before the app started tracking a unit are unknown, not vacant: leave them out.
    const start = trackingStart(u, src.tenancies);
    const from = start && start > period.from ? start : period.from;
    return {
      unitId: u.id,
      building: u.building,
      unitLabel: `${u.building} · ${u.name}`,
      isVacantNow: !currentTenancyOf(u.id, src.tenancies),
      vacantDays: vacantDaysFor(u.id, src.tenancies, from, to),
      periodDays: to >= from ? daysBetween(to, from) + 1 : 0
    };
  });
  const occupiedNow = units.filter((u) => !u.isVacantNow).length;
  const totalDays = units.reduce((s, u) => s + u.periodDays, 0);
  const vacantDays = units.reduce((s, u) => s + u.vacantDays, 0);
  return {
    units,
    occupiedNow,
    vacantNow: units.length - occupiedNow,
    rateNow: units.length ? occupiedNow / units.length : null,
    /** Share of unit-days in the period that were occupied. */
    ratePeriod: totalDays ? (totalDays - vacantDays) / totalDays : null
  };
}

/* ------------------------------------------------------------------ */
/* Per building                                                        */
/* ------------------------------------------------------------------ */

export interface BuildingRow {
  building: string;
  units: number;
  occupied: number;
  vacant: number;
  due: number;
  collected: number;
  arrears: number;
  depositsHeld: number;
  expenses: number;
  net: number;
}

export function buildingSummary(src: ReportSource, period: Period, asOf: string): BuildingRow[] {
  const unitById = new Map(src.units.map((u) => [u.id, u]));
  const rows = new Map<string, BuildingRow>();
  const row = (name: string) => {
    const key = name.trim() || 'Unassigned';
    if (!rows.has(key)) {
      rows.set(key, { building: key, units: 0, occupied: 0, vacant: 0, due: 0, collected: 0, arrears: 0, depositsHeld: 0, expenses: 0, net: 0 });
    }
    return rows.get(key)!;
  };

  for (const u of src.units.filter((x) => !x.archivedAt)) {
    const r = row(u.building);
    r.units += 1;
    const current = currentTenancyOf(u.id, src.tenancies);
    if (current) {
      r.occupied += 1;
      if (current.deposit && !current.deposit.settlement) r.depositsHeld += Number(current.deposit.amount) || 0;
    } else {
      r.vacant += 1;
    }
  }
  for (const entry of tenancyEntries(src)) {
    const r = row(entry.unit.building);
    for (const d of duesInPeriod(entry, period)) r.due += d.amount;
  }
  for (const p of collectedInPeriod(src.payments, period)) {
    const u = unitById.get(p.unitId);
    if (u) row(u.building).collected += Number(p.amount) || 0;
  }
  for (const a of arrearsAgeing(src, asOf).rows) row(a.building).arrears += a.total;
  for (const e of src.expenses || []) {
    if (!inPeriod(e.date, period)) continue;
    row(expenseBuilding(e, unitById) || 'Whole portfolio').expenses += Number(e.amount) || 0;
  }

  return [...rows.values()]
    .map((r) => ({
      ...r,
      due: round3(r.due),
      collected: round3(r.collected),
      arrears: round3(r.arrears),
      depositsHeld: round3(r.depositsHeld),
      expenses: round3(r.expenses),
      net: round3(r.collected - r.expenses)
    }))
    .sort((a, b) => a.building.localeCompare(b.building));
}

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

export type PeriodPreset = 'this_month' | 'last_3' | 'last_6' | 'last_12' | 'this_year';

/** Period ending today (or the end of this month for "this month"). */
export function presetPeriod(preset: PeriodPreset, today: string): Period {
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const monthsBack = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  };
  switch (preset) {
    case 'this_month':
      return { from: `${month}-01`, to: monthEnd(month) };
    case 'last_3':
      return { from: monthsBack(3), to: monthEnd(month) };
    case 'last_6':
      return { from: monthsBack(6), to: monthEnd(month) };
    case 'last_12':
      return { from: monthsBack(12), to: monthEnd(month) };
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
}
