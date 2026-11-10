import { useState } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getTodayStr } from '../../logic/rentEngine';
import type { ChargeKind, Unit } from '../../types';
import { inputClass } from '../ui/ModalShell';
import { formatMoney } from '../../logic/format';

const KINDS: { value: ChargeKind; label: string }[] = [
  { value: 'late_fee', label: 'Late fee' },
  { value: 'utility', label: 'Utility (water / electricity)' },
  { value: 'repair', label: 'Repair / damage' },
  { value: 'bounced_cheque', label: 'Bounced cheque fee' },
  { value: 'other', label: 'Other' },
];

const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.value, k.label])) as Record<ChargeKind, string>;

/** One-off charges of the current tenancy: list, add, delete. They are added to what the tenant owes. */
export function ChargesSection({ unit }: { unit: Unit }) {
  const { addCharge, deleteCharge, currency } = useApp();
  const charges = [...(unit.charges || [])].sort((a, b) => b.date.localeCompare(a.date));
  const [isAdding, setIsAdding] = useState(false);
  const [kind, setKind] = useState<ChargeKind>('late_fee');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => {
    setIsAdding(false);
    setKind('late_fee');
    setLabel('');
    setAmount('');
    setDate(getTodayStr());
    setError('');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!(value > 0)) return setError('Amount must be greater than 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose the date it is due.');
    try {
      await addCharge({ unitId: unit.id, date, kind, label: label.trim() || KIND_LABEL[kind], amount: value });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the charge.');
    }
  };

  return (
    <section aria-labelledby={`charges-${unit.id}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 id={`charges-${unit.id}`} className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-2">
          <Receipt className="w-4 h-4" /> Extra charges ({charges.length})
        </h3>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add charge
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAdd} className="mb-3 p-3 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] space-y-3">
          {error && <p className="text-xs text-[#B4341F] dark:text-[#FF8A73]">{error}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select aria-label="Charge type" value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)} className={inputClass}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              aria-label="Description"
              placeholder={`Description (default: ${KIND_LABEL[kind]})`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              step="any"
              min="0"
              aria-label={`Amount (${currency})`}
              placeholder={`Amount (${currency})`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
            />
            <input type="date" aria-label="Due date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D] cursor-pointer">
              Add charge
            </button>
            <button type="button" onClick={reset} className="px-3 py-1.5 rounded-lg text-xs text-[#5E6E78] dark:text-[#8E9EA8] cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      )}

      {charges.length === 0 ? (
        !isAdding && (
          <p className="p-3 rounded-xl text-xs text-center bg-gray-50 dark:bg-[#10181D] text-[#5E6E78] dark:text-[#8E9EA8]">
            No extra charges. Add late fees, utility bills or repair costs here and they are added to what is owed.
          </p>
        )
      ) : (
        <ul className="border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
          {charges.map((c) => (
            <li key={c.id} className="p-3 text-xs sm:text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">{c.label}</div>
                  <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                    {c.date} · {KIND_LABEL[c.kind] || 'Other'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#B4341F] dark:text-[#FF8A73]">
                    {formatMoney(c.amount, currency)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete charge ${c.label}`}
                    onClick={() => setConfirmId(c.id)}
                    className="p-1.5 text-gray-400 hover:text-[#B4341F] dark:hover:text-[#FF8A73] rounded-lg cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {confirmId === c.id && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-[#B4341F] dark:text-[#FF8A73] font-semibold">Remove this charge?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteCharge(c.id);
                      setConfirmId(null);
                    }}
                    className="px-2.5 py-1 bg-[#B4341F] text-white font-bold rounded-lg cursor-pointer"
                  >
                    Remove
                  </button>
                  <button type="button" onClick={() => setConfirmId(null)} className="px-2.5 py-1 cursor-pointer">
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
