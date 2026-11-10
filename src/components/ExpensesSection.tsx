import { useState } from 'react';
import { Edit2, Plus, Trash2, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EXPENSE_CATEGORIES, expenseCategoryLabel, expenseScopeLabel } from '../logic/expenses';
import { downloadCsv, expensesCsv } from '../logic/csvExport';
import type { Period } from '../logic/reports';
import type { Expense } from '../types';
import { ExpenseModal } from './modals/ExpenseModal';
import { formatMoney } from '../logic/format';

type Props = {
  period: Period;
};

/** Expenses in the selected period: add, edit, delete, filter by category. */
export function ExpensesSection({ period }: Props) {
  const { expenses, units, currency, deleteExpense } = useApp();
  const [category, setCategory] = useState<string>('all');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const list = expenses
    .filter((e) => e.date >= period.from && e.date <= period.to)
    .filter((e) => category === 'all' || e.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <section
      aria-labelledby="expenses-heading"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="expenses-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" /> Expenses
        </h3>
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter expenses by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] text-xs text-[#1B2B34] dark:text-[#E6EDF1]"
          >
            <option value="all">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {list.length > 0 && (
            <button
              type="button"
              onClick={() => downloadCsv(`rent_expenses_${period.from}_${period.to}.csv`, expensesCsv(list, units))}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] cursor-pointer min-h-0"
            >
              CSV
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add expense
          </button>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="p-4 rounded-xl text-xs text-center bg-gray-50 dark:bg-[#10181D] text-[#5E6E78] dark:text-[#8E9EA8]">
          No expenses in this period. Record repairs, utility bills, fees and other costs to see your net income.
        </p>
      ) : (
        <>
          <ul className="border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
            {list.map((e) => (
              <li key={e.id} className="p-3 text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">
                      {e.note || expenseCategoryLabel(e.category)}
                    </div>
                    <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                      {e.date} · {expenseCategoryLabel(e.category)} · {expenseScopeLabel(e, units)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-[#1B2B34] dark:text-[#E6EDF1] mr-1">
                      {formatMoney(e.amount, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      aria-label={`Edit expense ${e.note || expenseCategoryLabel(e.category)}`}
                      className="p-1.5 text-gray-500 hover:text-[#2E3F8F] dark:hover:text-[#7D8CE8] rounded-lg cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(e.id)}
                      aria-label={`Delete expense ${e.note || expenseCategoryLabel(e.category)}`}
                      className="p-1.5 text-gray-400 hover:text-[#B4341F] dark:hover:text-[#FF8A73] rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {confirmId === e.id && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-[#B4341F] dark:text-[#FF8A73] font-semibold">Delete this expense?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteExpense(e.id);
                        setConfirmId(null);
                      }}
                      className="px-2.5 py-1 bg-[#B4341F] text-white font-bold rounded-lg cursor-pointer"
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmId(null)} className="px-2.5 py-1 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="text-right text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            Total: {formatMoney(total, currency)}
          </div>
        </>
      )}

      {(isAdding || editing) && (
        <ExpenseModal
          expense={editing || undefined}
          onClose={() => {
            setIsAdding(false);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
