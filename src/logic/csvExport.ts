import { AppSettings, Expense, Payment, Tenancy, Unit, UnitRecord } from '../types';
import { paymentMethodLabel, paymentState, PAYMENT_STATE_LABELS, receiptLabel } from './payments';
import { expenseCategoryLabel, expenseScopeLabel } from './expenses';
import { AGE_BUCKETS, ArrearsRow, BuildingRow, MonthRow } from './reports';

type Cell = string | number | null | undefined;

/** Quotes a value for CSV. Text that a spreadsheet would run as a formula is neutralised. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Builds CSV text. Starts with a byte-order mark so Excel reads UTF-8 (Arabic names) correctly,
 * and uses CRLF line endings.
 */
export function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Units and payments                                                  */
/* ------------------------------------------------------------------ */

export function unitsCsv(units: Unit[]): string {
  return toCsv(
    ['Building', 'Unit', 'Type', 'Status', 'Tenant', 'Phone', 'Rent', 'Pays every (months)', 'First due date', 'Opening balance', 'Lease end', 'Deposit held', 'Archived'],
    units.map((u) => [
      u.building,
      u.name,
      u.type,
      u.isVacant ? 'Vacant' : 'Let',
      u.isVacant ? '' : u.tenant,
      u.isVacant ? '' : u.phone,
      u.isVacant ? null : u.rent,
      u.isVacant ? null : u.every,
      u.isVacant ? '' : u.firstDue,
      u.isVacant ? null : u.opening || 0,
      u.isVacant ? '' : u.leaseEnd || '',
      u.deposit && !u.deposit.settlement ? u.deposit.amount : null,
      u.archivedAt ? 'Yes' : ''
    ])
  );
}

export function paymentsCsv(
  payments: Payment[],
  units: Pick<UnitRecord, 'id' | 'building' | 'name'>[],
  tenancies: Tenancy[],
  settings: Pick<AppSettings, 'receiptPrefix'>
): string {
  const unitById = new Map(units.map((u) => [u.id, u]));
  const tenancyById = new Map(tenancies.map((t) => [t.id, t]));
  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);
  return toCsv(
    ['Date', 'Building', 'Unit', 'Tenant', 'Amount', 'Status', 'Counts as paid', 'Method', 'Cheque no.', 'Bank', 'Cheque date', 'Reference', 'Receipt no.', 'Note', 'Payment ID'],
    sorted.map((p) => {
      const unit = unitById.get(p.unitId);
      const state = paymentState(p);
      return [
        p.date,
        unit?.building || 'Unit removed',
        unit?.name || '',
        // The tenant who paid, even after they moved out
        (p.tenancyId && tenancyById.get(p.tenancyId)?.tenant) || 'Unknown',
        p.amount,
        PAYMENT_STATE_LABELS[state],
        state === 'received' ? 'Yes' : 'No',
        p.method ? paymentMethodLabel({ method: p.method }) : '',
        p.cheque?.number || '',
        p.cheque?.bank || '',
        p.cheque?.date || '',
        p.reference || '',
        receiptLabel(p, settings),
        p.note || '',
        p.id
      ];
    })
  );
}

export function exportUnitsToCSV(units: Unit[]): void {
  downloadCsv(`rent_tracker_units_${stamp()}.csv`, unitsCsv(units));
}

export function exportPaymentsToCSV(
  payments: Payment[],
  units: Pick<UnitRecord, 'id' | 'building' | 'name'>[],
  tenancies: Tenancy[],
  settings: Pick<AppSettings, 'receiptPrefix'>
): void {
  downloadCsv(`rent_tracker_payments_${stamp()}.csv`, paymentsCsv(payments, units, tenancies, settings));
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export function monthlyCsv(rows: MonthRow[]): string {
  return toCsv(
    ['Month', 'Due', 'Collected', 'Expenses', 'Net income'],
    rows.map((r) => [r.month, r.due, r.collected, r.expenses, r.net])
  );
}

export function arrearsCsv(rows: ArrearsRow[]): string {
  return toCsv(
    ['Tenant', 'Moved out', 'Building', 'Unit', ...AGE_BUCKETS, 'Total', 'Oldest unpaid (days)'],
    rows.map((r) => [r.tenant, r.isFormerTenant ? 'Yes' : '', r.building, r.unitLabel, ...r.buckets, r.total, r.oldestDays])
  );
}

export function buildingsCsv(rows: BuildingRow[]): string {
  return toCsv(
    ['Building', 'Units', 'Let', 'Vacant', 'Due', 'Collected', 'Arrears today', 'Deposits held', 'Expenses', 'Net income'],
    rows.map((r) => [r.building, r.units, r.occupied, r.vacant, r.due, r.collected, r.arrears, r.depositsHeld, r.expenses, r.net])
  );
}

export function expensesCsv(expenses: Expense[], units: Pick<UnitRecord, 'id' | 'building' | 'name'>[]): string {
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
  return toCsv(
    ['Date', 'Category', 'For', 'Amount', 'Note'],
    sorted.map((e) => [e.date, expenseCategoryLabel(e.category), expenseScopeLabel(e, units), e.amount, e.note || ''])
  );
}
