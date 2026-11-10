import React, { useState } from 'react';
import { ListSearch } from './ui/ListSearch';
import { matchesUnitQuery } from '../logic/search';
import { useApp } from '../context/AppContext';
import { getLeaseAlerts, getTodayStr } from '../logic/rentEngine';
import { CalendarClock, AlertTriangle, Clock, MessageCircle, Building2, FileSignature, Plus } from 'lucide-react';
import { Unit } from '../types';
import { LeaseAgreementModal } from './modals/LeaseAgreementModal';
import { formatMoney } from '../logic/format';
import { renderMessage } from '../logic/templates';
import { whatsAppUrl } from '../logic/whatsapp';

export const LeasesScreen: React.FC = () => {
  const { activeUnits: units, currency, settings } = useApp();
  const todayStr = getTodayStr();

  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementUnit, setAgreementUnit] = useState<Unit | null>(null);

  const [listQuery, setListQuery] = useState('');
  const allAlerts = getLeaseAlerts(units, todayStr);
  const alerts = allAlerts.filter((a) => matchesUnitQuery(a.unit, listQuery));

  const handleOpenAgreement = (unit?: Unit) => {
    setAgreementUnit(unit || null);
    setIsAgreementOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            Lease Expiry Watch & Agreements
          </h2>
          <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            Monitor contracts ending soon and generate official lease agreements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleOpenAgreement()}
            className="tap-target flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer"
          >
            <FileSignature className="w-4 h-4 stroke-[2.5]" />
            Make Lease Agreement
          </button>

          <div className="hidden sm:flex items-center gap-2 text-xs font-semibold">
            <span className="flex items-center gap-1 text-[#B4341F] dark:text-[#FF8A73]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B4341F] dark:bg-[#FF8A73]" />
              ≤30d
            </span>
            <span className="flex items-center gap-1 text-[#9A6A00] dark:text-[#F0C15A] ml-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9A6A00] dark:bg-[#F0C15A]" />
              31-90d
            </span>
          </div>
        </div>
      </div>

      {allAlerts.length > 3 && (
        <ListSearch value={listQuery} onChange={setListQuery} placeholder="Search tenant, unit or phone in leases" />
      )}

      {alerts.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center shadow-xs">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#E8F7EE] dark:bg-[#143523] flex items-center justify-center text-[#1F7A4D] dark:text-[#6CD39B]">
            <Clock className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            No imminent lease expiries
          </h3>
          <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8] max-w-md mx-auto mt-1 mb-5">
            {listQuery && allAlerts.length > 0
              ? `No lease matches "${listQuery}".`
              : 'No leases end within the next 90 days. You can draft or print a new tenancy agreement anytime.'}
          </p>

          <button
            onClick={() => handleOpenAgreement()}
            className="tap-target inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer"
          >
            <FileSignature className="w-4 h-4 stroke-[2.5]" />
            Make Lease Agreement Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {alerts.map((alert) => {
            const { unit, daysDiff, isEnded, isUrgent } = alert;

            let label = '';
            if (isEnded) {
              const absDays = Math.abs(daysDiff);
              label = absDays === 0 ? 'Ended today' : `Ended ${absDays} day${absDays === 1 ? '' : 's'} ago`;
            } else if (daysDiff === 0) {
              label = 'Ends today';
            } else if (daysDiff === 1) {
              label = 'Ends tomorrow';
            } else {
              label = `Ends in ${daysDiff} days`;
            }

            // WhatsApp link for renewal discussion
            const renewalMsg = renderMessage(
              'lease_renewal',
              {
                tenant: unit.tenant,
                unit: `${unit.building} · ${unit.name}`,
                lease_end: unit.leaseEnd,
                lease_status: isEnded ? 'expired' : 'is expiring',
                landlord: settings.landlord?.name
              },
              settings.messageTemplates
            );
            const waUrl = whatsAppUrl(unit.phone, renewalMsg) || '';

            return (
              <div
                key={unit.id}
                className={`p-4 sm:p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between ${
                  isUrgent
                    ? 'bg-white dark:bg-[#18232A] border-[#B4341F]/40 dark:border-[#FF8A73]/40 ring-1 ring-[#B4341F]/20'
                    : 'bg-white dark:bg-[#18232A] border-[#9A6A00]/40 dark:border-[#F0C15A]/40 ring-1 ring-[#9A6A00]/20'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1] leading-tight">
                        {unit.building} · {unit.name}
                      </h3>
                      <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                        {unit.type} · Rent: {formatMoney(unit.rent, currency)} / {unit.every}m
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                        isUrgent
                          ? 'bg-[#FDEDEB] text-[#B4341F] dark:bg-[#381A15] dark:text-[#FF8A73]'
                          : 'bg-[#FEF8E7] text-[#9A6A00] dark:bg-[#382B0E] dark:text-[#F0C15A]'
                      }`}
                    >
                      {label}
                    </span>
                  </div>

                  <div className="text-xs sm:text-sm text-[#1B2B34] dark:text-[#E6EDF1] font-medium flex items-center justify-between mt-2 pt-2 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                    <span>Tenant: {unit.tenant}</span>
                    <span className="font-mono text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                      {unit.phone || 'No phone'}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-[#5E6E78] dark:text-[#8E9EA8] flex items-center justify-between">
                    <span>Contract expiry date:</span>
                    <span className="font-mono font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                      {unit.leaseEnd}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleOpenAgreement(unit)}
                    className="tap-target flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#2E3F8F] dark:text-[#7D8CE8] bg-[#EDF1F4] dark:bg-[#10181D] hover:bg-[#D5DDE3] dark:hover:bg-[#2B3A44] transition active:scale-95 cursor-pointer"
                  >
                    <FileSignature className="w-4 h-4 stroke-[2]" />
                    Make Agreement
                  </button>

                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tap-target flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#1F7A4D] dark:text-[#6CD39B] bg-[#E8F7EE] dark:bg-[#143523] hover:opacity-90 transition active:scale-95 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4 fill-current" />
                      Contact Tenant
                    </a>
                  ) : (
                    <button
                      disabled
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-[#10181D] text-gray-400 dark:text-gray-600 cursor-not-allowed"
                    >
                      No phone
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lease Agreement Generator Modal */}
      <LeaseAgreementModal
        isOpen={isAgreementOpen}
        onClose={() => {
          setIsAgreementOpen(false);
          setAgreementUnit(null);
        }}
        preselectedUnit={agreementUnit}
      />
    </div>
  );
};
