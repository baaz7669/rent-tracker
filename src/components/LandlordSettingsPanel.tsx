import { useState } from 'react';
import { Check, UserRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatReceiptNo } from '../logic/payments';
import { Field, inputClass } from './ui/ModalShell';

/** Landlord details printed on receipts/agreements, and receipt numbering. */
export function LandlordSettingsPanel() {
  const { settings, updateSettings } = useApp();
  const current = settings.nextReceiptNo || 1;
  const [name, setName] = useState(settings.landlord?.name || '');
  const [phone, setPhone] = useState(settings.landlord?.phone || '');
  const [address, setAddress] = useState(settings.landlord?.address || '');
  const [prefix, setPrefix] = useState(settings.receiptPrefix ?? 'R-');
  const [nextNo, setNextNo] = useState(String(current));
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const next = Math.floor(Number(nextNo));
    // Numbers already issued must never be issued again.
    if (!(next >= current)) {
      setError(`The next receipt number can only go up (currently ${current}).`);
      return;
    }
    await updateSettings({
      landlord: { name: name.trim() || undefined, phone: phone.trim() || undefined, address: address.trim() || undefined },
      receiptPrefix: prefix,
      nextReceiptNo: next
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <section
      aria-labelledby="landlord-settings-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4"
    >
      <div>
        <div className="flex items-center gap-2">
          <UserRound className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
          <h3 id="landlord-settings-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            Landlord &amp; receipts
          </h3>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Shown on receipts, statements and tenancy agreements.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Your name or company">
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Address">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Receipt number prefix">
            <input type="text" value={prefix} onChange={(e) => setPrefix(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Next receipt number" hint={`Next: ${formatReceiptNo(Math.max(1, Math.floor(Number(nextNo)) || 1), prefix)}`}>
            <input type="number" min={current} value={nextNo} onChange={(e) => setNextNo(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {error && <p role="alert" className="text-xs text-[#B4341F] dark:text-[#FF8A73]">{error}</p>}
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          {isSaved ? 'Saved' : 'Save details'}
        </button>
      </form>
    </section>
  );
}
