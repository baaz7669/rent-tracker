import React, { useState, useEffect } from 'react';
import { DialogFrame } from '../ui/DialogFrame';
import { PropertyType, Unit } from '../../types';
import { getTodayStr, nextDueDateOnOrAfter, sortedRentHistory } from '../../logic/rentEngine';
import { X, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  unitToEdit?: Unit | null;
}

export const AddEditUnitModal: React.FC<Props> = ({ isOpen, onClose, unitToEdit }) => {
  const { addUnit, updateUnit, currency } = useApp();
  const todayStr = getTodayStr();

  const [building, setBuilding] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<PropertyType>('Flat');
  const [tenant, setTenant] = useState('');
  const [phone, setPhone] = useState('');
  const [rent, setRent] = useState<string>('150');
  const [every, setEvery] = useState<1 | 3 | 6 | 12>(1);
  const [firstDue, setFirstDue] = useState(todayStr.slice(0, 7) + '-01');
  const [opening, setOpening] = useState<string>('0');
  const [leaseEnd, setLeaseEnd] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // How an edited rent applies: from a date (keeps history) or as a correction to every due
  const [rentMode, setRentMode] = useState<'from' | 'correct'>('from');
  const [rentFrom, setRentFrom] = useState('');

  useEffect(() => {
    if (unitToEdit) {
      setBuilding(unitToEdit.building || '');
      setName(unitToEdit.name || '');
      setType(unitToEdit.type || 'Flat');
      setTenant(unitToEdit.tenant || '');
      setPhone(unitToEdit.phone || '');
      setRent(String(unitToEdit.rent || ''));
      setEvery(unitToEdit.every || 1);
      setFirstDue(unitToEdit.firstDue || todayStr);
      setOpening(String(unitToEdit.opening || 0));
      setLeaseEnd(unitToEdit.leaseEnd || '');
      setRentMode('from');
      setRentFrom(nextDueDateOnOrAfter(unitToEdit, todayStr));
    } else {
      setBuilding('');
      setName('');
      setType('Flat');
      setTenant('');
      setPhone('');
      setRent('150');
      setEvery(1);
      setFirstDue(todayStr.slice(0, 7) + '-01');
      setOpening('0');
      setLeaseEnd('');
    }
    setError('');
  }, [unitToEdit, isOpen, todayStr]);

  if (!isOpen) return null;

  const parsedRent = parseFloat(rent);
  const isRentChanged = Boolean(unitToEdit) && !isNaN(parsedRent) && parsedRent !== unitToEdit?.rent;
  const rentHistory = unitToEdit ? sortedRentHistory(unitToEdit) : [];
  // A vacant unit has no tenancy to edit: only the building/name/type can change here.
  const isVacantEdit = Boolean(unitToEdit?.isVacant);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!building.trim()) {
      setError('Please provide a building name or block.');
      return;
    }
    if (!name.trim()) {
      setError('Please provide a unit/flat/shop number.');
      return;
    }
    if (isVacantEdit && unitToEdit) {
      setIsSubmitting(true);
      try {
        await updateUnit(unitToEdit.id, { building: building.trim(), name: name.trim(), type });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save unit.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!tenant.trim()) {
      setError('Please provide tenant name.');
      return;
    }

    const rentNum = parseFloat(rent);
    if (isNaN(rentNum) || rentNum < 0) {
      setError('Rent amount must be a non-negative number.');
      return;
    }

    const openingNum = parseFloat(opening) || 0;
    if (isNaN(openingNum) || openingNum < 0) {
      setError('Opening balance must be 0 or greater.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      setError('First due date must be formatted YYYY-MM-DD.');
      return;
    }

    if (leaseEnd && !/^\d{4}-\d{2}-\d{2}$/.test(leaseEnd)) {
      setError('Lease end date must be formatted YYYY-MM-DD.');
      return;
    }

    if (isRentChanged && rentMode === 'from' && !/^\d{4}-\d{2}-\d{2}$/.test(rentFrom)) {
      setError('Choose the date the new rent starts from.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (unitToEdit) {
        await updateUnit(unitToEdit.id, {
          building: building.trim(),
          name: name.trim(),
          type,
          tenant: tenant.trim(),
          phone: phone.trim(),
          rent: rentNum,
          every,
          firstDue,
          opening: openingNum,
          leaseEnd: leaseEnd ? leaseEnd : undefined
        }, {
          rentEffectiveFrom: isRentChanged && rentMode === 'from' ? rentFrom : undefined
        });
      } else {
        await addUnit({
          building: building.trim(),
          name: name.trim(),
          type,
          tenant: tenant.trim(),
          phone: phone.trim(),
          rent: rentNum,
          every,
          firstDue,
          opening: openingNum,
          leaseEnd: leaseEnd ? leaseEnd : undefined
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save unit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame onClose={onClose} label={unitToEdit ? 'Edit unit' : 'Add unit'} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-[#18232A] rounded-2xl w-full max-w-lg shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden my-8">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#D5DDE3] dark:border-[#2B3A44]">
          <h2 className="text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            {unitToEdit ? 'Edit unit' : 'Add unit'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 text-xs sm:text-sm font-medium bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73] rounded-lg border border-[#B4341F]/20">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Building *
              </label>
              <input
                type="text"
                placeholder="e.g. Al Andalus Tower"
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Unit / Flat / Shop # *
              </label>
              <input
                type="text"
                placeholder="e.g. Flat 101 or Shop 3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              >
                <option value="Flat">Flat</option>
                <option value="Shop">Shop</option>
                <option value="Office">Office</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {!isVacantEdit && (
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Tenant name *
              </label>
              <input
                type="text"
                placeholder="e.g. Tariq Al-Balushi"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>
            )}
          </div>

          {isVacantEdit ? (
            <p className="text-xs p-3 rounded-lg bg-[#EDF1F4] dark:bg-[#10181D] text-[#5E6E78] dark:text-[#8E9EA8]">
              This unit is vacant. Use <span className="font-semibold">Move in tenant</span> on the unit card to add the
              next tenant, rent and deposit.
            </p>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                WhatsApp Phone (with country code)
              </label>
              <input
                type="text"
                placeholder="e.g. 96891234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Rent amount ({currency}) *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="150"
                value={rent}
                onChange={(e) => setRent(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>
          </div>

          {isRentChanged && (
            <fieldset
              data-testid="rent-change-options"
              className="rounded-xl border border-[#2E3F8F]/40 dark:border-[#7D8CE8]/40 bg-[#2E3F8F]/5 dark:bg-[#7D8CE8]/10 p-4 space-y-3"
            >
              <legend className="px-1 text-xs font-bold text-[#2E3F8F] dark:text-[#7D8CE8]">
                Rent changing from {currency} {unitToEdit?.rent} to {currency} {parsedRent}
              </legend>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="rent-mode"
                  checked={rentMode === 'from'}
                  onChange={() => setRentMode('from')}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="font-semibold">New rent starts from</span>
                  <input
                    type="date"
                    value={rentFrom}
                    onChange={(e) => {
                      setRentFrom(e.target.value);
                      setRentMode('from');
                    }}
                    aria-label="New rent starts from"
                    className="ml-2 px-2 py-1 rounded-md border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] text-sm"
                  />
                  <span className="block text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
                    Dues before this date keep the old rent. Use this for a rent increase or decrease.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="rent-mode"
                  checked={rentMode === 'correct'}
                  onChange={() => setRentMode('correct')}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="font-semibold">Correct a mistake</span>
                  <span className="block text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                    Every due, past and future, uses the new rent. Balances will be recalculated.
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {rentHistory.length > 1 && (
            <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
              <span className="font-semibold">Rent history: </span>
              {rentHistory.map((c) => `${currency} ${c.rent} from ${c.from}`).join(' · ')}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Pays every
              </label>
              <select
                value={every}
                onChange={(e) => setEvery(parseInt(e.target.value, 10) as 1 | 3 | 6 | 12)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              >
                <option value={1}>1 month (monthly)</option>
                <option value={3}>3 months (quarterly)</option>
                <option value={6}>6 months (every 6 months)</option>
                <option value={12}>12 months (yearly)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                First due date *
              </label>
              <input
                type="date"
                value={firstDue}
                onChange={(e) => setFirstDue(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
              <p className="text-[11px] text-[#5E6E78] dark:text-[#8E9EA8] mt-1 leading-normal">
                Earlier months are ignored, so old history does not show as owed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Opening balance owed ({currency})
              </label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
              <p className="text-[11px] text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
                Amount already owed before first due date.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                Lease end date (optional)
              </label>
              <input
                type="date"
                value={leaseEnd}
                onChange={(e) => setLeaseEnd(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
              <p className="text-[11px] text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
                Used to alert you 90 days before expiration.
              </p>
            </div>
          </div>
          </>
          )}

          <div className="pt-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : unitToEdit ? 'Save changes' : 'Add unit'}
            </button>
          </div>
        </form>
      </div>
    </DialogFrame>
  );
};
