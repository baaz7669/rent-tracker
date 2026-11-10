import React from 'react';
import { useApp } from '../context/AppContext';
import { calculateUnit, getTodayStr, paymentCounts } from '../logic/rentEngine';
import { depositsHeld } from '../logic/tenancy';
import { AlertCircle, Calendar, CheckCircle2, Building2 } from 'lucide-react';
import { formatMoney } from '../logic/format';

export const HeaderStats: React.FC = () => {
  const { activeUnits: units, payments, tenancies, currency } = useApp();
  const todayStr = getTodayStr();
  const currentMonthPrefix = todayStr.slice(0, 7); // YYYY-MM

  // Process all units
  const calcs = units.map(u => calculateUnit(u, payments, todayStr));

  // 1. Total overdue amount and number of units overdue
  const overdueCalcs = calcs.filter(c => c.status === 'overdue');
  const totalOverdueAmount = overdueCalcs.reduce((sum, c) => sum + c.balance, 0);
  const overdueUnitsCount = overdueCalcs.length;

  // 2. Total due in next 7 days and number of units
  // includes units due today and units due soon (within 7 days)
  const dueSoonCalcs = calcs.filter(c => c.status === 'soon' || c.status === 'today');
  const totalDueSoonAmount = dueSoonCalcs.reduce((sum, c) => {
    if (c.status === 'today') return sum + c.balance;
    if (c.status === 'soon' && c.nextUpcomingItem) return sum + c.nextUpcomingItem.remaining;
    return sum;
  }, 0);
  const dueSoonUnitsCount = dueSoonCalcs.length;

  // 3. Collected this calendar month: cleared money only (no pending/bounced cheques, no voided payments)
  const collectedThisMonth = payments
    .filter(p => p.date && p.date.startsWith(currentMonthPrefix) && paymentCounts(p))
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // 4. Portfolio: units, vacancies and deposits held
  const totalUnitsCount = units.length;
  const vacantCount = units.filter(u => u.isVacant).length;
  const depositsHeldTotal = depositsHeld(tenancies);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* 1. Overdue */}
      <div className={`p-4 rounded-xl border transition-all ${
        overdueUnitsCount > 0
          ? 'bg-[#FDEDEB] dark:bg-[#381A15] border-[#B4341F]/30 dark:border-[#FF8A73]/30'
          : 'bg-white dark:bg-[#18232A] border-[#D5DDE3] dark:border-[#2B3A44]'
      }`}>
        <div className="flex items-center justify-between text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
          <span className="flex items-center gap-1.5 font-semibold text-[#B4341F] dark:text-[#FF8A73]">
            <AlertCircle className="w-4 h-4" />
            Overdue
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#B4341F]/10 text-[#B4341F] dark:bg-[#FF8A73]/20 dark:text-[#FF8A73]">
            {overdueUnitsCount} {overdueUnitsCount === 1 ? 'unit' : 'units'}
          </span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-[#B4341F] dark:text-[#FF8A73] tracking-tight">
          {formatMoney(totalOverdueAmount, currency)}
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Past due date
        </p>
      </div>

      {/* 2. Due Next 7 Days */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44]">
        <div className="flex items-center justify-between text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
          <span className="flex items-center gap-1.5 font-semibold text-[#9A6A00] dark:text-[#F0C15A]">
            <Calendar className="w-4 h-4" />
            Due in 7 days
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FEF8E7] text-[#9A6A00] dark:bg-[#382B0E] dark:text-[#F0C15A]">
            {dueSoonUnitsCount} {dueSoonUnitsCount === 1 ? 'unit' : 'units'}
          </span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-[#1B2B34] dark:text-[#E6EDF1] tracking-tight">
          {formatMoney(totalDueSoonAmount, currency)}
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Upcoming collections
        </p>
      </div>

      {/* 3. Collected this Month */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44]">
        <div className="flex items-center justify-between text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
          <span className="flex items-center gap-1.5 font-semibold text-[#1F7A4D] dark:text-[#6CD39B]">
            <CheckCircle2 className="w-4 h-4" />
            Collected
          </span>
          <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">This month</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-[#1F7A4D] dark:text-[#6CD39B] tracking-tight">
          {formatMoney(collectedThisMonth, currency)}
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Received in {new Date().toLocaleString('default', { month: 'short' })}
        </p>
      </div>

      {/* 4. Total Units */}
      <div className="p-4 rounded-xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44]">
        <div className="flex items-center justify-between text-xs font-medium text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
          <span className="flex items-center gap-1.5 font-semibold text-[#2E3F8F] dark:text-[#7D8CE8]">
            <Building2 className="w-4 h-4" />
            Portfolio
          </span>
          <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">All units</span>
        </div>
        <div className="text-xl sm:text-2xl font-black text-[#1B2B34] dark:text-[#E6EDF1] tracking-tight">
          {totalUnitsCount}
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          {vacantCount > 0 ? `${vacantCount} vacant` : 'All let'}
          {depositsHeldTotal > 0 && ` · ${formatMoney(depositsHeldTotal, currency)} deposits held`}
        </p>
      </div>
    </div>
  );
};
