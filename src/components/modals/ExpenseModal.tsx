import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getTodayStr } from '../../logic/rentEngine';
import { EXPENSE_CATEGORIES } from '../../logic/expenses';
import type { Expense, ExpenseCategory } from '../../types';
import { ErrorBanner, Field, ModalShell, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/ModalShell';

type Props = {
  /** Expense to edit; omit to add a new one. */
  expense?: Expense;
  onClose: () => void;
};

/** "where" is either '' (whole portfolio), 'b:<building>' or 'u:<unitId>'. */
function whereOf(e?: Expense): string {
  if (e?.unitId) return `u:${e.unitId}`;
  if (e?.building) return `b:${e.building}`;
  return '';
}

export function ExpenseModal({ expense, onClose }: Props) {
  const { addExpense, updateExpense, units, currency } = useApp();
  const [date, setDate] = useState(expense?.date || getTodayStr());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category || 'maintenance');
  const [where, setWhere] = useState(whereOf(expense));
  const [note, setNote] = useState(expense?.note || '');
  const [error, setError] = useState('');

  const buildings = [...new Set(units.map((u) => u.building.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const sortedUnits = [...units].sort((a, b) => `${a.building}${a.name}`.localeCompare(`${b.building}${b.name}`));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return setError('Amount must be greater than 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose the date.');
    const record = {
      date,
      amount: value,
      category,
      unitId: where.startsWith('u:') ? where.slice(2) : undefined,
      building: where.startsWith('b:') ? where.slice(2) : undefined,
      note: note.trim() || undefined
    };
    try {
      if (expense) await updateExpense(expense.id, record);
      else await addExpense(record);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the expense.');
    }
  };

  return (
    <ModalShell title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {error && <ErrorBanner message={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={`Amount (${currency}) *`}>
            <input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className={inputClass} />
          </Field>
          <Field label="Date *">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Category">
          <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} className={inputClass}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="For">
          <select value={where} onChange={(e) => setWhere(e.target.value)} className={inputClass}>
            <option value="">Whole portfolio</option>
            {buildings.length > 0 && (
              <optgroup label="Building">
                {buildings.map((b) => (
                  <option key={b} value={`b:${b}`}>
                    {b}
                  </option>
                ))}
              </optgroup>
            )}
            {sortedUnits.length > 0 && (
              <optgroup label="Unit">
                {sortedUnits.map((u) => (
                  <option key={u.id} value={`u:${u.id}`}>
                    {u.building} · {u.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Note">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. AC repair, municipality fee" className={inputClass} />
        </Field>
        <div className="pt-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" className={primaryButtonClass}>
            <Check className="w-4 h-4" />
            {expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
