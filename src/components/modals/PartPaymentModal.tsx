import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { ChequeStatus, PaymentMethod, UnitCalculation } from '../../types';
import { addMonthsClamped, getTodayStr } from '../../logic/rentEngine';
import { buildChequeSeries, PAYMENT_METHODS } from '../../logic/payments';
import { useApp } from '../../context/AppContext';
import { ErrorBanner, Field, ModalShell, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/ModalShell';
import { formatMoney } from '../../logic/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  calc: UnitCalculation | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Record a payment: amount, date, method (cash / transfer / cheque / card) and cheque details. */
export const PartPaymentModal: React.FC<Props> = ({ isOpen, onClose, calc }) => {
  const { recordPayment, recordPayments, currency } = useApp();
  const todayStr = getTodayStr();

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bank, setBank] = useState('');
  const [chequeDate, setChequeDate] = useState(todayStr);
  const [chequeCount, setChequeCount] = useState('1');
  const [isCleared, setIsCleared] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (calc) {
      // Suggest outstanding balance or next cycle remainder
      const suggested = calc.balance > 0 ? calc.balance : calc.nextUpcomingItem?.remaining || calc.unit.rent;
      setAmount(String(suggested));
      setDate(todayStr);
      setMethod('cash');
      setReference('');
      setChequeNo('');
      setBank('');
      setChequeDate(todayStr);
      setChequeCount('1');
      setIsCleared(false);
      setNote('');
      setError('');
    }
  }, [calc, isOpen, todayStr]);

  if (!isOpen || !calc) return null;

  const isCheque = method === 'cheque';
  const count = Math.max(1, Math.floor(Number(chequeCount) || 1));
  const isSeries = isCheque && count > 1;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return setError('Amount must be greater than 0.');
    if (!DATE_RE.test(date)) return setError('Choose the date received.');
    if (isCheque && !chequeNo.trim()) return setError('Enter the cheque number.');
    if (isCheque && !DATE_RE.test(chequeDate)) return setError('Choose the date written on the cheque.');
    if (isSeries && count > 60) return setError('Record at most 60 cheques at a time.');

    const base = {
      unitId: calc.unit.id,
      amount: parsedAmount,
      method,
      reference: !isCheque && reference.trim() ? reference.trim() : undefined,
      note: note.trim() || undefined
    };

    setIsSubmitting(true);
    try {
      if (isCheque) {
        const status: ChequeStatus = !isSeries && isCleared ? 'cleared' : 'pending';
        const series = buildChequeSeries(
          { count, firstNumber: chequeNo.trim(), firstDate: chequeDate, everyMonths: calc.unit.every || 1 },
          addMonthsClamped
        );
        const list = series.map((c) => ({
          ...base,
          // A cheque's money is dated by the cheque, not the day it was handed over
          date: c.date,
          cheque: { number: c.number, bank: bank.trim() || undefined, date: c.date, status }
        }));
        if (list.length === 1) {
          await recordPayment(list[0], { name: calc.unit.name, building: calc.unit.building });
        } else {
          await recordPayments(list);
        }
      } else {
        await recordPayment({ ...base, date }, { name: calc.unit.name, building: calc.unit.building });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitLabel = isSeries ? `Record ${count} cheques` : 'Record payment';

  return (
    <ModalShell
      title="Record payment"
      subtitle={`${calc.unit.building} · ${calc.unit.name} (${calc.unit.tenant})`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {error && <ErrorBanner message={error} />}

        <Field
          label={isSeries ? `Amount per cheque (${currency}) *` : `Payment amount (${currency}) *`}
          hint={`Currently owed: ${formatMoney(calc.balance, currency)}`}
        >
          <input
            type="number"
            step="any"
            min="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
            className={`${inputClass} text-base font-bold`}
          />
        </Field>

        <fieldset>
          <legend className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1.5">Paid by</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {PAYMENT_METHODS.map((m) => (
              <button
                type="button"
                key={m.value}
                role="radio"
                aria-checked={method === m.value}
                onClick={() => setMethod(m.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                  method === m.value
                    ? 'bg-[#2E3F8F] text-white border-[#2E3F8F] dark:bg-[#7D8CE8] dark:text-[#10181D] dark:border-[#7D8CE8]'
                    : 'border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-100 dark:hover:bg-[#2B3A44]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>

        {isCheque ? (
          <div className="space-y-4 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={isSeries ? 'First cheque number *' : 'Cheque number *'}>
                <input type="text" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Bank">
                <input type="text" value={bank} onChange={(e) => setBank(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={isSeries ? 'First cheque date *' : 'Date on cheque *'}>
                <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Number of cheques">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={chequeCount}
                  onChange={(e) => setChequeCount(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            {isSeries ? (
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                {count} post-dated cheques of {currency} {parseFloat(amount) || 0}, one every{' '}
                {calc.unit.every === 1 ? 'month' : `${calc.unit.every} months`}, numbered from {chequeNo || '…'}. They
                count as paid once you mark each one cleared in Payments → Cheques.
              </p>
            ) : (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} />
                Already cleared by the bank
              </label>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date received *">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClass} />
            </Field>
            {method !== 'cash' && (
              <Field label="Reference (optional)">
                <input
                  type="text"
                  placeholder="e.g. transfer ID"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}
          </div>
        )}

        <Field label="Note (optional)">
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </Field>

        <div className="pt-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Recording...' : submitLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
