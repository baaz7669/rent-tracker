import React, { useState } from 'react';
import { ListSearch } from './ui/ListSearch';
import { matchesUnitQuery } from '../logic/search';
import { AttentionPanel } from './AttentionPanel';
import type { AttentionTarget } from '../logic/attention';
import { useApp } from '../context/AppContext';
import { buildWhatsAppLink, calculateUnit, getTodayStr } from '../logic/rentEngine';
import { UnitCalculation } from '../types';
import { exportBackup } from '../logic/backup';
import { PartPaymentModal } from './modals/PartPaymentModal';
import { UnitHistoryModal } from './modals/UnitHistoryModal';
import { Check, DollarSign, MessageCircle, Building2, CheckCircle2, History, AlertCircle, Download, X } from 'lucide-react';
import { formatMoney } from '../logic/format';

type CollectScreenProps = {
  /** Jump to another tab from the "Needs attention" panel. */
  onNavigate?: (target: AttentionTarget) => void;
};

export const CollectScreen: React.FC<CollectScreenProps> = ({ onNavigate }) => {
  const { db, activeUnits: units, payments, recordPayment, currency, settings, updateSettings } = useApp();
  const todayStr = getTodayStr();

  const [partPayTarget, setPartPayTarget] = useState<UnitCalculation | null>(null);
  const [historyTarget, setHistoryTarget] = useState<UnitCalculation | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBackupBannerDismissed, setIsBackupBannerDismissed] = useState(false);

  // 7-day reminder: show banner if lastBackupAt is empty or older than 7 days
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const needsBackup = !settings.lastBackupAt || Date.now() - settings.lastBackupAt > SEVEN_DAYS_MS;

  const getBackupReminderText = () => {
    if (!settings.lastBackupAt) {
      return 'No backup created yet — Download backup';
    }
    const daysAgo = Math.floor((Date.now() - settings.lastBackupAt) / (24 * 60 * 60 * 1000));
    return `Last backup was ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago — Download backup`;
  };

  const handleQuickBackup = async () => {
    try {
      const now = Date.now();
      const saved = await exportBackup(db);
      if (!saved) return;
      updateSettings({ lastBackupAt: now });
      setIsBackupBannerDismissed(true);
    } catch (err) {
      console.error('Failed to download backup:', err);
    }
  };

  // Calculate all units
  const allCalcs = units.map((u) => calculateUnit(u, payments, todayStr));

  // Filter units for "To collect": status in ['overdue', 'today', 'soon']
  const collectCalcs = allCalcs.filter((c) => ['overdue', 'today', 'soon'].includes(c.status));
  const [listQuery, setListQuery] = useState('');
  const visibleCalcs = collectCalcs.filter((c) => matchesUnitQuery(c.unit, listQuery));

  // Sort: overdue first (most days late first), then due today, then due soon (soonest first)
  collectCalcs.sort((a, b) => {
    if (a.status === 'overdue' && b.status === 'overdue') {
      return (b.daysOverdue || 0) - (a.daysOverdue || 0); // most overdue first
    }
    if (a.status === 'overdue') return -1;
    if (b.status === 'overdue') return 1;

    if (a.status === 'today' && b.status === 'today') return 0;
    if (a.status === 'today') return -1;
    if (b.status === 'today') return 1;

    // both soon: sort by days until due (ascending)
    return (a.daysUntilDue || 0) - (b.daysUntilDue || 0);
  });

  // Footer: Outstanding by building (per-building overdue total and count, or 'All clear')
  const buildingMap = new Map<string, { overdueSum: number; overdueCount: number; totalUnits: number }>();

  units.forEach((u) => {
    const bName = u.building || 'Main Building';
    if (!buildingMap.has(bName)) {
      buildingMap.set(bName, { overdueSum: 0, overdueCount: 0, totalUnits: 0 });
    }
    const entry = buildingMap.get(bName)!;
    entry.totalUnits += 1;
  });

  allCalcs.forEach((c) => {
    if (c.status === 'overdue') {
      const bName = c.unit.building || 'Main Building';
      const entry = buildingMap.get(bName);
      if (entry) {
        entry.overdueSum += c.balance;
        entry.overdueCount += 1;
      }
    }
  });

  const buildingsList = Array.from(buildingMap.entries()).sort((a, b) => b[1].overdueSum - a[1].overdueSum);
  const totalOverdueCount = allCalcs.filter((c) => c.status === 'overdue').length;

  const handlePaidInFull = async (calc: UnitCalculation) => {
    setProcessingId(calc.unit.id);
    try {
      let amountToPay = 0;
      if (calc.status === 'overdue' || calc.status === 'today') {
        amountToPay = calc.balance;
      } else if (calc.status === 'soon') {
        amountToPay = calc.nextUpcomingItem?.remaining || calc.unit.rent;
      }

      if (amountToPay <= 0) return;

      await recordPayment(
        {
          unitId: calc.unit.id,
          amount: amountToPay,
          date: todayStr,
          note: 'Full payment'
        },
        {
          name: calc.unit.name,
          building: calc.unit.building
        }
      );
    } catch (e) {
      console.error('Failed to record paid in full', e);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {onNavigate && <AttentionPanel onNavigate={onNavigate} />}

      {/* 14-day Dismissible Backup Amber Banner */}
      {needsBackup && !isBackupBannerDismissed && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-[#FEF8E7] dark:bg-[#382B0E] border border-[#9A6A00]/30 text-[#9A6A00] dark:text-[#F0C15A] shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-xs sm:text-sm font-semibold">
              {getBackupReminderText()}
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleQuickBackup}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#9A6A00] hover:bg-[#835a00] dark:bg-[#F0C15A] dark:hover:bg-[#dfb14b] text-white dark:text-[#10181D] transition active:scale-95 cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download backup</span>
            </button>
            <button
              onClick={() => setIsBackupBannerDismissed(true)}
              className="p-1.5 text-[#9A6A00] dark:text-[#F0C15A] hover:opacity-75 transition cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {collectCalcs.length > 3 && (
        <ListSearch value={listQuery} onChange={setListQuery} placeholder="Search tenant, unit or phone in this list" />
      )}

      {/* List of Units to Collect */}
      {collectCalcs.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center shadow-xs">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#E8F7EE] dark:bg-[#143523] flex items-center justify-center text-[#1F7A4D] dark:text-[#6CD39B]">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            All clear
          </h3>
          <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8] max-w-md mx-auto mt-1">
            Nothing to chase right now. No one is overdue and nothing falls due in the next 7 days.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleCalcs.length === 0 && (
            <p className="md:col-span-2 p-4 text-sm text-center text-[#5E6E78] dark:text-[#8E9EA8]">No one in this list matches "{listQuery}".</p>
          )}
          {visibleCalcs.map((calc) => {
            const wa = buildWhatsAppLink(calc.unit, calc, currency, settings.messageTemplates, settings.landlord?.name);
            const amountOwed = calc.status === 'soon'
              ? (calc.nextUpcomingItem?.remaining || calc.unit.rent)
              : calc.balance;

            return (
              <div
                key={calc.unit.id}
                className={`p-4 sm:p-5 rounded-2xl border shadow-xs transition-all flex flex-col justify-between ${
                  calc.status === 'overdue'
                    ? 'bg-white dark:bg-[#18232A] border-[#B4341F]/40 dark:border-[#FF8A73]/40 ring-1 ring-[#B4341F]/20'
                    : calc.status === 'today'
                    ? 'bg-white dark:bg-[#18232A] border-[#9A6A00]/40 dark:border-[#F0C15A]/40 ring-1 ring-[#9A6A00]/20'
                    : 'bg-white dark:bg-[#18232A] border-[#D5DDE3] dark:border-[#2B3A44]'
                }`}
              >
                <div>
                  {/* Top line: Building · Unit and Status Pill */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1] leading-tight">
                        {calc.unit.building} · {calc.unit.name}
                      </h3>
                      <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                        {calc.unit.type} · Cycle rent: {formatMoney(calc.unit.rent, currency)}
                      </p>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-tight shrink-0 ${
                        calc.status === 'overdue'
                          ? 'bg-[#FDEDEB] text-[#B4341F] dark:bg-[#381A15] dark:text-[#FF8A73]'
                          : calc.status === 'today'
                          ? 'bg-[#FEF8E7] text-[#9A6A00] dark:bg-[#382B0E] dark:text-[#F0C15A]'
                          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                      }`}
                    >
                      {calc.statusLabel}
                    </span>
                  </div>

                  {/* Tenant and Phone */}
                  <div className="text-xs sm:text-sm text-[#1B2B34] dark:text-[#E6EDF1] font-medium flex items-center justify-between mt-1">
                    <span>{calc.unit.tenant}</span>
                    <span className="text-[#5E6E78] dark:text-[#8E9EA8] font-mono text-xs">
                      {calc.unit.phone || 'No phone'}
                    </span>
                  </div>

                  {/* Amount Owed */}
                  <div className="mt-3.5 pt-3 border-t border-[#D5DDE3]/70 dark:border-[#2B3A44]/70 flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8]">
                      {calc.status === 'soon' ? 'Upcoming due:' : 'Amount outstanding:'}
                    </span>
                    <span
                      className={`text-xl sm:text-2xl font-black tracking-tight ${
                        calc.status === 'overdue'
                          ? 'text-[#B4341F] dark:text-[#FF8A73]'
                          : calc.status === 'today'
                          ? 'text-[#9A6A00] dark:text-[#F0C15A]'
                          : 'text-[#1B2B34] dark:text-[#E6EDF1]'
                      }`}
                    >
                      {formatMoney(amountOwed, currency)}
                    </span>
                  </div>

                  {/* Note if part-paid earlier */}
                  {calc.partPaidNote && (
                    <div className="mt-2 text-xs font-medium text-[#9A6A00] dark:text-[#F0C15A] bg-[#FEF8E7] dark:bg-[#382B0E] p-2 rounded-lg">
                      {calc.partPaidNote}
                    </div>
                  )}
                </div>

                {/* Card Actions: Paid in full, Part payment, WhatsApp reminder */}
                <div className="mt-4 pt-3.5 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Paid in full button */}
                    <button
                      onClick={() => handlePaidInFull(calc)}
                      disabled={processingId === calc.unit.id}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-[#1F7A4D] hover:bg-[#18603d] text-white shadow-xs transition active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      Paid in full
                    </button>

                    {/* Part payment button */}
                    <button
                      onClick={() => setPartPayTarget(calc)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-[#dbe3e8] dark:hover:bg-[#364855] transition active:scale-95 cursor-pointer"
                    >
                      <DollarSign className="w-4 h-4" />
                      Part payment
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {/* WhatsApp reminder */}
                    {wa.disabled ? (
                      <button
                        disabled
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-[#10181D] text-gray-400 dark:text-gray-600 cursor-not-allowed border border-dashed border-[#D5DDE3] dark:border-[#2B3A44]"
                      >
                        <MessageCircle className="w-4 h-4" />
                        No phone number
                      </button>
                    ) : (
                      <a
                        href={wa.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-target flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-[#1F7A4D] dark:text-[#6CD39B] bg-[#E8F7EE] dark:bg-[#143523] hover:opacity-90 transition active:scale-95 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 fill-current" />
                        WhatsApp reminder
                      </a>
                    )}

                    {/* History statement button */}
                    <button
                      onClick={() => setHistoryTarget(calc)}
                      title="View unit history & statement"
                      className="p-2 rounded-xl bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] transition cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: Outstanding by building */}
      <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs">
        <div className="flex items-center justify-between mb-3 border-b border-[#D5DDE3] dark:border-[#2B3A44] pb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
            <h4 className="text-xs sm:text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] uppercase tracking-wide">
              Outstanding by building
            </h4>
          </div>
          <span className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8]">
            {totalOverdueCount === 0 ? 'All clear' : `${totalOverdueCount} units overdue`}
          </span>
        </div>

        {totalOverdueCount === 0 ? (
          <div className="py-2 flex items-center gap-2 text-xs font-semibold text-[#1F7A4D] dark:text-[#6CD39B]">
            <CheckCircle2 className="w-4 h-4" />
            All clear — no overdue rent across any building!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
            {buildingsList.map(([bName, stat]) => (
              <div
                key={bName}
                className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                  stat.overdueCount > 0
                    ? 'bg-[#FDEDEB]/50 dark:bg-[#381A15]/50 border-[#B4341F]/20 text-[#B4341F] dark:text-[#FF8A73]'
                    : 'bg-[#EDF1F4]/40 dark:bg-[#10181D] border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8]'
                }`}
              >
                <div>
                  <div className="font-bold text-[#1B2B34] dark:text-[#E6EDF1] truncate max-w-[140px]">
                    {bName}
                  </div>
                  <div className="text-[11px] opacity-80">
                    {stat.overdueCount > 0
                      ? `${stat.overdueCount} of ${stat.totalUnits} overdue`
                      : `All ${stat.totalUnits} clear`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-sm">
                    {stat.overdueCount > 0 ? `${formatMoney(stat.overdueSum, currency)}` : '0'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Part Payment Modal */}
      {partPayTarget && (
        <PartPaymentModal
          isOpen={!!partPayTarget}
          onClose={() => setPartPayTarget(null)}
          calc={partPayTarget}
        />
      )}

      {/* History Modal */}
      {historyTarget && (
        <UnitHistoryModal
          isOpen={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          calc={historyTarget}
        />
      )}
    </div>
  );
};
