import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getTodayStr } from '../../logic/rentEngine';
import type { PaymentCycle, Unit } from '../../types';
import { ErrorBanner, Field, ModalShell, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/ModalShell';

type Props = {
  unit: Unit;
  /** Rent of the previous tenancy, used as a starting suggestion. */
  suggestedRent?: number;
  onClose: () => void;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MoveInModal({ unit, suggestedRent, onClose }: Props) {
  const { moveIn, currency } = useApp();
  const today = getTodayStr();
  const [tenant, setTenant] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [rent, setRent] = useState(suggestedRent ? String(suggestedRent) : '');
  const [every, setEvery] = useState<PaymentCycle>(1);
  const [firstDue, setFirstDue] = useState(today);
  const [leaseEnd, setLeaseEnd] = useState('');
  const [deposit, setDeposit] = useState('');
  const [depositDate, setDepositDate] = useState(today);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const rentNum = parseFloat(rent);
    const depositNum = parseFloat(deposit) || 0;
    if (!tenant.trim()) return setError('Enter the tenant name.');
    if (isNaN(rentNum) || rentNum < 0) return setError('Rent must be 0 or more.');
    if (!DATE_RE.test(firstDue)) return setError('Choose the first rent due date.');
    if (leaseEnd && leaseEnd <= firstDue) return setError('Lease end must be after the first due date.');
    if (depositNum < 0) return setError('Deposit cannot be negative.');

    setIsSubmitting(true);
    try {
      await moveIn(unit.id, {
        tenant: tenant.trim(),
        phone: phone.trim(),
        tenantIdNumber: idNumber.trim() || undefined,
        rent: rentNum,
        every,
        firstDue,
        leaseEnd: leaseEnd || undefined,
        deposit: depositNum > 0 ? { amount: depositNum, receivedDate: DATE_RE.test(depositDate) ? depositDate : undefined } : undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move the tenant in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Move in a new tenant" subtitle={`${unit.building} · ${unit.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        {error && <ErrorBanner message={error} />}

        <Field label="Tenant name *">
          <input type="text" value={tenant} onChange={(e) => setTenant(e.target.value)} autoFocus className={inputClass} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="WhatsApp phone (with country code)">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="96891234567" className={inputClass} />
          </Field>
          <Field label="ID / Civil ID number">
            <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={`Rent (${currency}) *`}>
            <input type="number" step="any" min="0" value={rent} onChange={(e) => setRent(e.target.value)} required className={inputClass} />
          </Field>
          <Field label="Pays every">
            <select value={every} onChange={(e) => setEvery(Number(e.target.value) as PaymentCycle)} className={inputClass}>
              <option value={1}>1 month (monthly)</option>
              <option value={3}>3 months (quarterly)</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months (yearly)</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First rent due *">
            <input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} required className={inputClass} />
          </Field>
          <Field label="Lease ends">
            <input type="date" value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={`Security deposit received (${currency})`}>
            <input type="number" step="any" min="0" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0" className={inputClass} />
          </Field>
          <Field label="Deposit received on">
            <input type="date" value={depositDate} onChange={(e) => setDepositDate(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
          The deposit is held separately and is not counted as rent. This tenant starts with a clean balance.
        </p>

        <div className="pt-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className={primaryButtonClass}>
            <UserPlus className="w-4 h-4" />
            {isSubmitting ? 'Saving...' : 'Move in'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
