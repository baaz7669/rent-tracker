import { useState } from 'react';
import { LogOut, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calculateUnit, getTodayStr } from '../../logic/rentEngine';
import type { Unit } from '../../types';
import { ErrorBanner, Field, ModalShell, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/ModalShell';
import { formatMoney } from '../../logic/format';

type Props = {
  unit: Unit;
  onClose: () => void;
};

type DeductionRow = { key: number; label: string; amount: string };

export function MoveOutModal({ unit, onClose }: Props) {
  const { previewMoveOut, moveOut, currency, payments } = useApp();
  const [date, setDate] = useState(getTodayStr());
  const [applyDeposit, setApplyDeposit] = useState(true);
  const [rows, setRows] = useState<DeductionRow[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const deductions = rows.map((r) => ({ label: r.label, amount: parseFloat(r.amount) || 0 }));
  const pendingCheques = calculateUnit(unit, payments).pendingChequeTotal;

  let preview: ReturnType<typeof previewMoveOut> | null = null;
  let previewError = '';
  try {
    preview = previewMoveOut(unit.id, { date, applyDepositToBalance: applyDeposit, deductions });
  } catch (err) {
    previewError = err instanceof Error ? err.message : 'Check the details above.';
  }

  const money = (n: number) => `${formatMoney(n, currency)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (rows.some((r) => (parseFloat(r.amount) || 0) > 0 && !r.label.trim())) {
      setError('Give each deduction a reason (e.g. "Repaint walls").');
      return;
    }
    setIsSubmitting(true);
    try {
      await moveOut(unit.id, { date, applyDepositToBalance: applyDeposit, deductions, note });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the tenant out.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Move out" subtitle={`${unit.building} · ${unit.name} (${unit.tenant})`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {error && <ErrorBanner message={error} />}

        <Field label="Move-out date *">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
        </Field>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] -mt-2">
          No rent is charged for cycles starting on or after this date.
        </p>

        {pendingCheques > 0 && (
          <p className="text-xs p-2.5 rounded-lg bg-[#FEF8E7] dark:bg-[#382B0E] text-[#9A6A00] dark:text-[#F0C15A]">
            {money(pendingCheques)} in cheques is still pending and is not counted yet. Mark them cleared first if they
            have been paid.
          </p>
        )}

        <fieldset className="space-y-2.5">
          <legend className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
            Security deposit held: {money(unit.deposit?.amount || 0)}
          </legend>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={applyDeposit} onChange={(e) => setApplyDeposit(e.target.checked)} />
            Use the deposit to clear unpaid rent and charges
          </label>

          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Reason, e.g. Repaint walls"
                aria-label="Deduction reason"
                value={row.label}
                onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                aria-label="Deduction amount"
                value={row.amount}
                onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))}
                className={`${inputClass} w-28`}
              />
              <button
                type="button"
                aria-label="Remove deduction"
                onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                className="p-2 rounded-lg text-[#B4341F] dark:text-[#FF8A73] hover:bg-[#FDEDEB] dark:hover:bg-[#381A15] cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { key: Date.now(), label: '', amount: '' }])}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add deduction from deposit
          </button>
        </fieldset>

        <Field label="Note (optional)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        <div className="rounded-xl bg-[#EDF1F4]/70 dark:bg-[#10181D] p-4 text-sm space-y-1.5" aria-live="polite">
          {previewError ? (
            <p className="text-[#B4341F] dark:text-[#FF8A73] font-medium">{previewError}</p>
          ) : (
            preview && (
              <>
                <SummaryRow label="Unpaid rent and charges" value={money(preview.outstanding)} />
                {preview.appliedToBalance > 0 && (
                  <SummaryRow label="Paid from deposit" value={`− ${money(preview.appliedToBalance)}`} />
                )}
                {preview.deductionsTotal > 0 && (
                  <SummaryRow label="Deductions from deposit" value={money(preview.deductionsTotal)} />
                )}
                <div className="border-t border-[#D5DDE3] dark:border-[#2B3A44] pt-1.5 mt-1.5 space-y-1.5">
                  <SummaryRow label="Refund deposit to tenant" value={money(preview.refunded)} strong />
                  {preview.balanceStillOwed > 0 && (
                    <SummaryRow label="Tenant still owes" value={money(preview.balanceStillOwed)} strong danger />
                  )}
                  {preview.advanceCredit > 0 && (
                    <SummaryRow label="Tenant overpaid (refund separately)" value={money(preview.advanceCredit)} strong />
                  )}
                </div>
              </>
            )
          )}
        </div>

        <div className="pt-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || Boolean(previewError)} className={primaryButtonClass}>
            <LogOut className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Confirm move-out'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

type SummaryRowProps = { label: string; value: string; strong?: boolean; danger?: boolean };

function SummaryRow({ label, value, strong, danger }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#5E6E78] dark:text-[#8E9EA8]">{label}</span>
      <span
        className={`${strong ? 'font-black' : 'font-semibold'} ${
          danger ? 'text-[#B4341F] dark:text-[#FF8A73]' : 'text-[#1B2B34] dark:text-[#E6EDF1]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
