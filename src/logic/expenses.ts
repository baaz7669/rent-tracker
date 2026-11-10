import { Expense, ExpenseCategory, UnitRecord } from '../types';

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance & repairs' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'tax_fees', label: 'Taxes & fees' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'management', label: 'Management & staff' },
  { value: 'other', label: 'Other' },
];

const LABELS = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label])) as Record<ExpenseCategory, string>;

export function expenseCategoryLabel(c: ExpenseCategory): string {
  return LABELS[c] || 'Other';
}

/** Where an expense applies, for display: "Tower A · Flat 1", "Tower A", or "Whole portfolio". */
export function expenseScopeLabel(e: Expense, units: Pick<UnitRecord, 'id' | 'building' | 'name'>[]): string {
  if (e.unitId) {
    const u = units.find((x) => x.id === e.unitId);
    if (u) return `${u.building} · ${u.name}`;
  }
  return e.building || 'Whole portfolio';
}
