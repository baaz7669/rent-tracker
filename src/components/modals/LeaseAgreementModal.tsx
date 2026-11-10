import React, { useEffect, useMemo, useState } from 'react';
import { whatsAppUrl } from '../../logic/whatsapp';
import { DialogFrame } from '../ui/DialogFrame';
import { formatMoney } from '../../logic/format';
import { Unit } from '../../types';
import { useApp } from '../../context/AppContext';
import { getTodayStr, nextDueDateOnOrAfter } from '../../logic/rentEngine';
import {
  X,
  FileSignature,
  Printer,
  Copy,
  Check,
  Building,
  User,
  Calendar,
  DollarSign,
  FileText,
  Eye,
  Edit3,
  Sparkles,
  ArrowRight,
  MessageCircle,
  ShieldCheck
} from 'lucide-react';

export interface LeaseAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  unit?: Unit | null;
  preselectedUnit?: Unit | null;
}

export const LeaseAgreementModal: React.FC<LeaseAgreementModalProps> = ({
  isOpen,
  onClose,
  unit,
  preselectedUnit
}) => {
  const { activeUnits, updateUnit, currency, settings } = useApp();
  // Agreements are for a tenant, so vacant units are not offered here.
  // Memoised: the setup effect below depends on this list and must not re-run on every keystroke.
  const units = useMemo(() => activeUnits.filter((u) => !u.isVacant), [activeUnits]);
  const todayStr = getTodayStr();

  // Mode: 'edit' or 'preview'
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Selected Unit ID for quick dropdown selector
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Required Fields
  const [tenantName, setTenantName] = useState<string>('');
  const [unitAddress, setUnitAddress] = useState<string>('');
  const [rentAmount, setRentAmount] = useState<number>(250);
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>('');

  // Additional Practical Lease Agreement Details
  const [landlordName, setLandlordName] = useState<string>('');
  const [landlordPhone, setLandlordPhone] = useState<string>('');
  const [tenantPhone, setTenantPhone] = useState<string>('');
  const [tenantIdNumber, setTenantIdNumber] = useState<string>('');
  const [securityDeposit, setSecurityDeposit] = useState<number>(250);
  const [paymentFrequency, setPaymentFrequency] = useState<number>(1); // months
  const [dueDay, setDueDay] = useState<number>(1);
  const [specialTerms, setSpecialTerms] = useState<string>(
    'The Tenant agrees to keep the premises in good and clean condition. Electricity and utility bills shall be settled promptly by the Tenant.'
  );

  // Helper to compute 1 year from start date
  const computeOneYear = (start: string) => {
    try {
      const d = new Date(start);
      if (isNaN(d.getTime())) return '';
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  };

  // Preset duration helper
  const handleDurationPreset = (months: number) => {
    try {
      const d = new Date(startDate || todayStr);
      if (isNaN(d.getTime())) return;
      d.setMonth(d.getMonth() + months);
      d.setDate(d.getDate() - 1);
      setEndDate(d.toISOString().slice(0, 10));
    } catch {
      // ignore
    }
  };

  // Populate form fields from unit
  const populateFromUnit = (u: Unit) => {
    setTenantName(u.tenant || '');
    setTenantPhone(u.phone || '');
    // Standard Unit Address: Room/Unit name and Building
    const address = u.building ? `${u.name}, ${u.building}` : u.name;
    setUnitAddress(address);
    setRentAmount(Number(u.rent) || 0);
    setPaymentFrequency(u.every || 1);
    setSecurityDeposit(Number(u.deposit?.amount) || Number(u.rent) || 0);

    const start = u.firstDue || todayStr;
    setStartDate(start);
    setEndDate(u.leaseEnd || computeOneYear(start));
  };

  // Effect to load initial data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setActiveTab('edit');
    setSavedSuccess(false);

    // Landlord details from settings (Settings → Landlord & receipts)
    setLandlordName(settings.landlord?.name || 'LANDLORD / PROPERTY OWNER');
    setLandlordPhone(settings.landlord?.phone || '');

    const initialUnit = unit || preselectedUnit || (units.length > 0 ? units[0] : null);

    if (initialUnit) {
      setSelectedUnitId(initialUnit.id);
      populateFromUnit(initialUnit);
    } else {
      setSelectedUnitId('');
      setTenantName('');
      setTenantPhone('');
      setUnitAddress('Flat 101, Horizon Plaza');
      setRentAmount(250);
      setPaymentFrequency(1);
      setSecurityDeposit(250);
      setStartDate(todayStr);
      setEndDate(computeOneYear(todayStr));
    }
  }, [isOpen, unit, preselectedUnit, units]);

  if (!isOpen) return null;

  // Change selected unit from dropdown
  const handleUnitDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedUnitId(val);
    const found = units.find((u) => u.id === val);
    if (found) {
      populateFromUnit(found);
    }
  };

  // Save updated lease expiry & rent back to unit in database/context
  const handleSaveToUnit = async () => {
    if (!selectedUnitId) return;
    const unit = units.find((u) => u.id === selectedUnitId);
    if (!unit) return;
    try {
      // A renewal at a new rent starts at the first due on/after the lease start; earlier dues keep the old rent.
      await updateUnit(
        selectedUnitId,
        {
          leaseEnd: endDate,
          tenant: tenantName,
          phone: tenantPhone,
          rent: rentAmount,
          every: paymentFrequency as 1 | 3 | 6 | 12
        },
        { rentEffectiveFrom: nextDueDateOnOrAfter(unit, startDate || todayStr) }
      );
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save changes to unit');
    }
  };

  // Print/Export handler using window.print()
  const handlePrint = () => {
    window.print();
  };

  // Plaintext copy handler
  const handleCopyText = () => {
    const text = `
TENANCY CONTRACT / LEASE AGREEMENT
====================================
Date of Agreement: ${todayStr}

1. PARTIES:
   Landlord (First Party): ${landlordName || 'N/A'} (Phone: ${landlordPhone || 'N/A'})
   Tenant (Second Party):   ${tenantName || 'N/A'} (Phone: ${tenantPhone || 'N/A'}, ID: ${tenantIdNumber || 'N/A'})

2. LEASED UNIT ADDRESS:
   ${unitAddress || 'N/A'}

3. TERM & DURATION:
   Commencement Date: ${startDate || 'N/A'}
   Expiration Date:   ${endDate || 'N/A'}

4. RENTAL CONSIDERATION:
   Rent Amount:      ${formatMoney(rentAmount, currency)} (Every ${paymentFrequency} month(s))
   Security Deposit: ${formatMoney(securityDeposit, currency)} (Refundable)
   Due Day:          Day ${dueDay} of each cycle

5. TERMS & CONDITIONS:
   ${specialTerms}

SIGNATURES:
Landlord: __________________________       Tenant: __________________________
Date:     __________________________       Date:   __________________________
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // WhatsApp summary
  const waSummary = `Hello ${tenantName || 'Tenant'},\nHere is a summary of your Tenancy Agreement for ${unitAddress}:\n• Period: ${startDate} to ${endDate}\n• Rent: ${formatMoney(rentAmount, currency)}\n• Security Deposit: ${formatMoney(securityDeposit, currency)}\n• Payment Due: Day ${dueDay} of each cycle.\n\nThank you!`;
  const waUrl = whatsAppUrl(tenantPhone, waSummary) || '';

  return (
    <DialogFrame onClose={onClose} label="Tenancy agreement" className="lease-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="lease-modal-container relative w-full max-w-4xl bg-white dark:bg-[#18232A] rounded-2xl sm:rounded-3xl shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header Bar (Hidden during printing) */}
        <div className="no-print flex items-center justify-between px-5 sm:px-7 py-4 border-b border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/50 dark:bg-[#10181D]/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] flex items-center justify-center shadow-xs">
              <FileSignature className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#1B2B34] dark:text-[#E6EDF1] leading-tight">
                Lease Agreement Form
              </h2>
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                Standard, editable rental contract with printable A4 export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher Tabs */}
            <div className="flex items-center p-1 rounded-xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'edit'
                    ? 'bg-[#2E3F8F] text-white shadow-xs'
                    : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Form
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-[#2E3F8F] text-white shadow-xs'
                    : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Contract Preview
              </button>
            </div>

            {/* Print/Export Button directly accessible from header bar */}
            <button
              type="button"
              onClick={handlePrint}
              id="lease-print-btn"
              aria-label="Print/Export"
              className="tap-target flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer ml-1"
            >
              <Printer className="w-4 h-4" />
              <span>Print/Export</span>
            </button>

            <button
              onClick={onClose}
              className="tap-target p-2 rounded-xl text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition cursor-pointer ml-1"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {/* ================= EDITABLE AGREEMENT FORM (Screen Only when activeTab === 'edit') ================= */}
          <div className={`${activeTab === 'edit' ? 'block' : 'hidden'} print:hidden space-y-6 no-print`}>
              {/* Unit Pre-population selector */}
              {units.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#EDF1F4]/70 dark:bg-[#10181D]/60 border border-[#D5DDE3] dark:border-[#2B3A44] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1] uppercase tracking-wider block mb-0.5">
                      Auto-Populate from Existing Unit:
                    </label>
                    <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                      Select a unit to automatically fill Tenant Name, Unit Address, Rent, and Dates.
                    </p>
                  </div>
                  <select
                    value={selectedUnitId}
                    onChange={handleUnitDropdownChange}
                    className="tap-target px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] min-w-[220px]"
                  >
                    <option value="">-- Choose Unit to Auto-fill --</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.building} · {u.name} ({u.tenant || 'Vacant'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Primary Required Fields Section */}
              <div className="p-4 sm:p-5 rounded-2xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] shadow-xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                  <User className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
                  <h3 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                    Required Agreement Terms
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Field: Tenant Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1] mb-1">
                      Tenant Name *
                    </label>
                    <input
                      type="text"
                      value={tenantName}
                      onChange={(e) => setTenantName(e.target.value)}
                      placeholder="e.g. Salim Al Harthy"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] focus:ring-2 focus:ring-[#2E3F8F]"
                    />
                  </div>

                  {/* Field: Unit Address */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1] mb-1">
                      Unit Address *
                    </label>
                    <input
                      type="text"
                      value={unitAddress}
                      onChange={(e) => setUnitAddress(e.target.value)}
                      placeholder="e.g. Flat 304, Al Khuwair Plaza, Muscat"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] focus:ring-2 focus:ring-[#2E3F8F]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  {/* Field: Rent Amount */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1] mb-1">
                      Rent Amount ({currency}) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={rentAmount || ''}
                      onChange={(e) => setRentAmount(Number(e.target.value))}
                      placeholder="e.g. 250"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-bold bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] focus:ring-2 focus:ring-[#2E3F8F]"
                    />
                  </div>

                  {/* Field: Lease Start Date */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1] mb-1">
                      Lease Start Date *
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (!endDate) setEndDate(computeOneYear(e.target.value));
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] focus:ring-2 focus:ring-[#2E3F8F]"
                    />
                  </div>

                  {/* Field: Lease End Date */}
                  <div>
                    <label className="block text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1] mb-1">
                      Lease End Date *
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] focus:ring-2 focus:ring-[#2E3F8F]"
                    />
                  </div>
                </div>

                {/* Duration preset helpers */}
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <span className="text-[#5E6E78] dark:text-[#8E9EA8] font-medium">Quick Duration:</span>
                  <button
                    type="button"
                    onClick={() => handleDurationPreset(6)}
                    className="px-2.5 py-1 rounded-lg bg-[#EDF1F4] dark:bg-[#10181D] hover:bg-[#D5DDE3] dark:hover:bg-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] font-semibold transition cursor-pointer"
                  >
                    +6 Months
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDurationPreset(12)}
                    className="px-2.5 py-1 rounded-lg bg-[#EDF1F4] dark:bg-[#10181D] hover:bg-[#D5DDE3] dark:hover:bg-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] font-semibold transition cursor-pointer"
                  >
                    +1 Year (Standard)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDurationPreset(24)}
                    className="px-2.5 py-1 rounded-lg bg-[#EDF1F4] dark:bg-[#10181D] hover:bg-[#D5DDE3] dark:hover:bg-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] font-semibold transition cursor-pointer"
                  >
                    +2 Years
                  </button>
                </div>
              </div>

              {/* Secondary Details: Parties & Financial Terms */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Landlord Info */}
                <div className="p-4 sm:p-5 rounded-2xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] shadow-xs space-y-3.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                    <Building className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
                    <h4 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                      Landlord Details (First Party)
                    </h4>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                      Landlord / Property Owner Name
                    </label>
                    <input
                      type="text"
                      value={landlordName}
                      onChange={(e) => setLandlordName(e.target.value)}
                      placeholder="e.g. Al Rawahi Real Estate"
                      className="w-full px-3 py-2 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                      Landlord Contact Phone
                    </label>
                    <input
                      type="text"
                      value={landlordPhone}
                      onChange={(e) => setLandlordPhone(e.target.value)}
                      placeholder="e.g. +968 9123 4567"
                      className="w-full px-3 py-2 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                    />
                  </div>
                </div>

                {/* Additional Tenant & Financial Details */}
                <div className="p-4 sm:p-5 rounded-2xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] shadow-xs space-y-3.5">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                    <DollarSign className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
                    <h4 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                      Deposit & Payment Terms
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                        Security Deposit ({currency})
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={securityDeposit || ''}
                        onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                        placeholder="e.g. 250"
                        className="w-full px-3 py-2 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                        Tenant Phone
                      </label>
                      <input
                        type="text"
                        value={tenantPhone}
                        onChange={(e) => setTenantPhone(e.target.value)}
                        placeholder="e.g. +968 9988 7766"
                        className="w-full px-3 py-2 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                      Tenant ID / Passport No.
                    </label>
                    <input
                      type="text"
                      value={tenantIdNumber}
                      onChange={(e) => setTenantIdNumber(e.target.value)}
                      placeholder="e.g. P1234567"
                      className="w-full px-3 py-2 rounded-xl text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                    />
                  </div>
                </div>
              </div>

              {/* Special Conditions / Clauses */}
              <div className="p-4 sm:p-5 rounded-2xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] shadow-xs space-y-2">
                <label className="block text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1] uppercase tracking-wider">
                  Special Clauses & Conditions:
                </label>
                <textarea
                  rows={3}
                  value={specialTerms}
                  onChange={(e) => setSpecialTerms(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-[#EDF1F4]/40 dark:bg-[#10181D]/40 border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]"
                  placeholder="Enter any custom clauses, parking stipulations, or maintenance terms..."
                />
              </div>
          </div>

          {/* ================= DEDICATED A4 PRINT VIEW (Formatted with CSS Grid) ================= */}
          {/* Always rendered for print (print:block), and shown on screen when activeTab === 'preview' */}
          <div className={`${activeTab === 'preview' ? 'block' : 'hidden'} print:block space-y-6`}>
              {/* Document Actions Bar (Hidden during print) */}
              <div className="no-print p-4 rounded-2xl bg-[#EDF1F4]/70 dark:bg-[#10181D]/60 border border-[#D5DDE3] dark:border-[#2B3A44] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="tap-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Print/Export</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyText}
                    className="tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1] bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] hover:bg-gray-50 dark:hover:bg-[#2B3A44] transition active:scale-95 cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-[#5E6E78]" />}
                    <span>{copied ? 'Copied to Clipboard!' : 'Copy Plain Text'}</span>
                  </button>

                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#1F7A4D] dark:text-[#6CD39B] bg-[#E8F7EE] dark:bg-[#143523] border border-[#1F7A4D]/20 hover:opacity-90 transition active:scale-95 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 fill-current" />
                      <span>WhatsApp Summary</span>
                    </a>
                  )}
                </div>

                {selectedUnitId && (
                  <button
                    type="button"
                    onClick={handleSaveToUnit}
                    className={`tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 cursor-pointer ${
                      savedSuccess
                        ? 'bg-green-600 text-white'
                        : 'bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#2E3F8F] dark:text-[#7D8CE8]'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>{savedSuccess ? 'Saved to Portfolio!' : 'Save Expiry Date to Unit'}</span>
                  </button>
                )}
              </div>

              {/* Dedicated A4 Print View Container using CSS Grid */}
              <div className="lease-agreement-print-view printable-lease-agreement bg-white text-black p-6 sm:p-10 rounded-2xl border border-gray-300 shadow-md print:shadow-none print:border-none print:p-0 print:m-0 font-sans text-xs leading-normal">
                
                {/* CSS Grid Section: Contract Title & Metadata */}
                <div className="grid grid-cols-12 gap-2 border-b-2 border-black pb-3 mb-4">
                  <div className="col-span-8">
                    <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
                      STANDARD TENANCY AGREEMENT
                    </h1>
                    <p className="text-xs text-gray-700 tracking-wide font-medium uppercase mt-0.5">
                      Residential & Commercial Property Lease Contract
                    </p>
                  </div>
                  <div className="col-span-4 text-right flex flex-col justify-end text-[11px] font-mono text-gray-700">
                    <div><strong>Date:</strong> {todayStr}</div>
                    <div><strong>Ref:</strong> AGR-{selectedUnitId ? selectedUnitId.slice(0, 8).toUpperCase() : 'STANDARD'}</div>
                  </div>
                </div>

                {/* CSS Grid Section 1: Parties to the Agreement */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-wider bg-gray-100 p-1.5 border-l-4 border-black text-gray-900 mb-2">
                    1. PARTIES TO THIS AGREEMENT
                  </div>
                  <div className="grid grid-cols-12 gap-3">
                    {/* Landlord Box (Col Span 6) */}
                    <div className="col-span-6 border border-gray-300 rounded-lg p-3 space-y-1.5 bg-gray-50/50">
                      <div className="font-bold text-gray-900 border-b border-gray-200 pb-1 text-xs uppercase">
                        First Party: Landlord (Lessor)
                      </div>
                      <div className="grid grid-cols-12 gap-1 text-xs">
                        <span className="col-span-4 font-semibold text-gray-600">Full Name:</span>
                        <span className="col-span-8 font-bold text-gray-900">{landlordName || '___________________________'}</span>
                      </div>
                      <div className="grid grid-cols-12 gap-1 text-xs">
                        <span className="col-span-4 font-semibold text-gray-600">Phone Number:</span>
                        <span className="col-span-8 text-gray-900">{landlordPhone || '___________________________'}</span>
                      </div>
                    </div>

                    {/* Tenant Box (Col Span 6) */}
                    <div className="col-span-6 border border-gray-300 rounded-lg p-3 space-y-1.5 bg-gray-50/50">
                      <div className="font-bold text-gray-900 border-b border-gray-200 pb-1 text-xs uppercase">
                        Second Party: Tenant (Lessee)
                      </div>
                      <div className="grid grid-cols-12 gap-1 text-xs">
                        <span className="col-span-4 font-semibold text-gray-600">Tenant Name:</span>
                        <span className="col-span-8 font-bold text-black">{tenantName || '___________________________'}</span>
                      </div>
                      <div className="grid grid-cols-12 gap-1 text-xs">
                        <span className="col-span-4 font-semibold text-gray-600">Phone Number:</span>
                        <span className="col-span-8 text-gray-900">{tenantPhone || '___________________________'}</span>
                      </div>
                      <div className="grid grid-cols-12 gap-1 text-xs">
                        <span className="col-span-4 font-semibold text-gray-600">ID / Passport:</span>
                        <span className="col-span-8 text-gray-900">{tenantIdNumber || '___________________________'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CSS Grid Section 2: Leased Unit Address */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-wider bg-gray-100 p-1.5 border-l-4 border-black text-gray-900 mb-2">
                    2. LEASED PREMISES & ADDRESS
                  </div>
                  <div className="grid grid-cols-12 gap-2 border border-gray-300 rounded-lg p-3 bg-gray-50/30">
                    <div className="col-span-3 font-bold text-gray-700 text-xs flex items-center">
                      Unit Address:
                    </div>
                    <div className="col-span-9 font-bold text-sm text-black">
                      {unitAddress || '_____________________________________________'}
                    </div>
                  </div>
                </div>

                {/* CSS Grid Section 3: Duration & Financial Schedule */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-wider bg-gray-100 p-1.5 border-l-4 border-black text-gray-900 mb-2">
                    3. LEASE DURATION & FINANCIAL TERMS
                  </div>
                  <div className="grid grid-cols-12 gap-2.5 border border-gray-300 rounded-lg p-3">
                    <div className="col-span-3 border-r border-gray-200 pr-2">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Commencement Date</div>
                      <div className="font-mono font-bold text-black text-xs">{startDate || '__________________'}</div>
                    </div>

                    <div className="col-span-3 border-r border-gray-200 pr-2">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Expiration Date</div>
                      <div className="font-mono font-bold text-black text-xs">{endDate || '__________________'}</div>
                    </div>

                    <div className="col-span-3 border-r border-gray-200 pr-2">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Rent Amount</div>
                      <div className="font-bold text-black text-sm">{formatMoney(rentAmount, currency)}</div>
                    </div>

                    <div className="col-span-3">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Payment Cycle</div>
                      <div className="font-semibold text-black text-xs">Every {paymentFrequency} month(s)</div>
                    </div>

                    <div className="col-span-6 pt-2 border-t border-gray-200">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Refundable Security Deposit</div>
                      <div className="font-semibold text-black text-xs">{formatMoney(securityDeposit, currency)}</div>
                    </div>

                    <div className="col-span-6 pt-2 border-t border-gray-200">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold">Payment Due Day</div>
                      <div className="font-semibold text-black text-xs">Day {dueDay} of each payment period</div>
                    </div>
                  </div>
                </div>

                {/* CSS Grid Section 4: Standard Terms & Covenants */}
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-wider bg-gray-100 p-1.5 border-l-4 border-black text-gray-900 mb-2">
                    4. STANDARD TERMS & COVENANTS
                  </div>
                  <div className="grid grid-cols-12 gap-2 border border-gray-300 rounded-lg p-3">
                    <div className="col-span-12 space-y-1.5 text-xs text-gray-800 leading-relaxed">
                      <p>
                        1. <strong>Rent Payment:</strong> The Tenant agrees to pay the stipulated Rent Amount promptly on or before the due date agreed upon without delay.
                      </p>
                      <p>
                        2. <strong>Premises Use:</strong> The leased unit shall be used solely for lawful purposes. Subleasing or assigning tenancy without the Landlord's written consent is strictly prohibited.
                      </p>
                      <p>
                        3. <strong>Utilities & Upkeep:</strong> The Tenant undertakes to pay all consumption bills (electricity, water, internet) promptly and preserve the unit in good order.
                      </p>
                      <p>
                        4. <strong>Vacating & Renewal:</strong> Either party shall provide notice at least 60 days prior to the expiration date regarding intention to renew or vacate.
                      </p>
                      {specialTerms && (
                        <p className="pt-1.5 border-t border-gray-200 text-gray-900">
                          5. <strong>Additional Agreed Stipulations:</strong> {specialTerms}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* CSS Grid Section 5: Signatures (Col Span 6 each) */}
                <div className="pt-3 border-t-2 border-black">
                  <p className="text-[11px] text-gray-600 text-center italic mb-3">
                    Both parties acknowledge having read, understood, and agreed to all terms and conditions set forth herein.
                  </p>

                  <div className="grid grid-cols-12 gap-6 pt-1">
                    {/* Landlord Signature Block */}
                    <div className="col-span-6 border border-gray-300 rounded-lg p-3.5 space-y-4">
                      <div className="text-xs font-bold uppercase text-gray-900 border-b border-gray-200 pb-1">
                        First Party: Landlord (Lessor)
                      </div>
                      <div className="pt-6 border-b border-black w-4/5"></div>
                      <div className="text-[10px] text-gray-600 space-y-1">
                        <div>Signature: __________________________</div>
                        <div>Date: _______________________________</div>
                      </div>
                    </div>

                    {/* Tenant Signature Block */}
                    <div className="col-span-6 border border-gray-300 rounded-lg p-3.5 space-y-4">
                      <div className="text-xs font-bold uppercase text-gray-900 border-b border-gray-200 pb-1">
                        Second Party: Tenant (Lessee)
                      </div>
                      <div className="pt-6 border-b border-black w-4/5"></div>
                      <div className="text-[10px] text-gray-600 space-y-1">
                        <div>Signature: __________________________</div>
                        <div>Date: _______________________________</div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
          </div>
        </div>

        {/* Modal Footer (Hidden during printing) */}
        <div className="no-print px-5 sm:px-7 py-3.5 border-t border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/50 dark:bg-[#10181D]/50 flex items-center justify-between">
          <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            {activeTab === 'edit'
              ? 'Complete the details above or switch to Contract Preview to print or export.'
              : 'Official agreement preview formatted for standard A4 printing.'}
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'edit' ? (
              <>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="tap-target flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1] bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] hover:bg-gray-50 dark:hover:bg-[#2B3A44] transition active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print/Export</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="tap-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <span>Preview Contract</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className="tap-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1] bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] hover:bg-gray-50 transition active:scale-95 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Back to Edit</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="tap-target flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print/Export</span>
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </DialogFrame>
  );
};

export default LeaseAgreementModal;
