import React, { useState } from 'react';
import { DialogFrame } from '../ui/DialogFrame';
import { Payment, Unit, UnitCalculation } from '../../types';
import { StatementModal } from './StatementModal';
import { useApp } from '../../context/AppContext';
import { X, CheckCircle, CheckCircle2, Clock, AlertTriangle, ArrowUpRight, Receipt, Wallet, AlertCircle, FileText } from 'lucide-react';
import { calculateUnit, getTodayStr, paymentBelongsTo } from '../../logic/rentEngine';
import { ChargesSection } from './ChargesSection';
import { paymentMethodLabel, receiptLabel } from '../../logic/payments';
import { PaymentStatusBadge } from '../ui/PaymentStatusBadge';
import { PastTenanciesSection } from './PastTenanciesSection';
import { ReceiptModal } from './ReceiptModal';
import { formatMoney } from '../../logic/format';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  calc: UnitCalculation | null;
}

export const UnitHistoryModal: React.FC<Props> = ({ isOpen, onClose, calc: openedCalc }) => {
  const { payments, currency, settings, units } = useApp();
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);
  const [statementUnit, setStatementUnit] = useState<Unit | null>(null);
  const todayStr = getTodayStr();

  if (!isOpen || !openedCalc) return null;

  // Recalculate from live data so charges/payments added while the modal is open show up immediately.
  const liveUnit = units.find((u) => u.id === openedCalc.unit.id) ?? openedCalc.unit;
  const calc = calculateUnit(liveUnit, payments, todayStr);

  // Only this tenancy's payments; previous tenants are listed separately below.
  const unitPayments = payments
    .filter((p) => paymentBelongsTo(p, calc.unit))
    .sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts);

  const paymentPercentage = calc.totalDue > 0
    ? Math.min(100, Math.round((calc.totalPaid / calc.totalDue) * 100))
    : 100;

  return (
    <DialogFrame onClose={onClose} label="Unit history" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-[#18232A] rounded-2xl w-full max-w-2xl shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden my-8">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#D5DDE3] dark:border-[#2B3A44]">
          <div>
            <h2 className="text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
              Unit history & statement
            </h2>
            <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
              {calc.unit.building} · {calc.unit.name} ({calc.unit.tenant})
            </p>
          </div>
          {!calc.unit.isVacant && (
            <button
              type="button"
              onClick={() => setStatementUnit(calc.unit)}
              className="ml-auto mr-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" /> Statement
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Prominent Visual Financial Summary Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-[#F4F7F9] to-white dark:from-[#141E24] dark:to-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 pb-3 border-b border-[#D5DDE3]/70 dark:border-[#2B3A44]/70">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[#1B2B34] dark:text-[#E6EDF1]">
                  Financial Summary
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-[#5E6E78] dark:text-[#8E9EA8]">
                  Cycle: {formatMoney(calc.unit.rent, currency)} / {calc.unit.every === 1 ? 'month' : `${calc.unit.every} mos`}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    calc.status === 'overdue'
                      ? 'bg-[#FDEDEB] text-[#B4341F] dark:bg-[#381A15] dark:text-[#FF8A73]'
                      : calc.status === 'today'
                      ? 'bg-[#FEF8E7] text-[#9A6A00] dark:bg-[#382B0E] dark:text-[#F0C15A]'
                      : calc.status === 'soon'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                      : 'bg-[#E8F7EE] text-[#1F7A4D] dark:bg-[#143523] dark:text-[#6CD39B]'
                  }`}
                >
                  {calc.statusLabel}
                </span>
              </div>
            </div>

            {/* 3 Metric Columns: Total Due, Total Paid, Remaining Balance */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Total Due */}
              <div className="p-3.5 bg-white dark:bg-[#10181D] rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44]">
                <div className="flex items-center justify-between text-[#5E6E78] dark:text-[#8E9EA8] mb-1">
                  <span className="text-xs font-semibold">Total Due</span>
                  <Receipt className="w-3.5 h-3.5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
                </div>
                <div className="text-lg sm:text-xl font-black text-[#1B2B34] dark:text-[#E6EDF1] tracking-tight">
                  {formatMoney(calc.totalDue, currency)}
                </div>
                <div className="text-[11px] text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                  {calc.dueItems.length} billing cycle{calc.dueItems.length === 1 ? '' : 's'}
                </div>
              </div>

              {/* Total Paid */}
              <div className="p-3.5 bg-white dark:bg-[#10181D] rounded-xl border border-[#1F7A4D]/25 dark:border-[#6CD39B]/25">
                <div className="flex items-center justify-between text-[#1F7A4D] dark:text-[#6CD39B] mb-1">
                  <span className="text-xs font-semibold">Total Paid</span>
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <div className="text-lg sm:text-xl font-black text-[#1F7A4D] dark:text-[#6CD39B] tracking-tight">
                  {formatMoney(calc.totalPaid, currency)}
                </div>
                <div className="text-[11px] text-[#1F7A4D]/80 dark:text-[#6CD39B]/80 mt-0.5">
                  {unitPayments.length} payment{unitPayments.length === 1 ? '' : 's'} received
                </div>
              </div>

              {/* Remaining Balance */}
              <div className={`p-3.5 rounded-xl border ${
                calc.balance > 0
                  ? 'bg-[#FDEDEB]/60 dark:bg-[#381A15]/60 border-[#B4341F]/30 dark:border-[#FF8A73]/30'
                  : 'bg-[#E8F7EE]/60 dark:bg-[#143523]/60 border-[#1F7A4D]/30 dark:border-[#6CD39B]/30'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${
                    calc.balance > 0 ? 'text-[#B4341F] dark:text-[#FF8A73]' : 'text-[#1F7A4D] dark:text-[#6CD39B]'
                  }`}>
                    Remaining Balance
                  </span>
                  {calc.balance > 0 ? (
                    <AlertCircle className="w-3.5 h-3.5 text-[#B4341F] dark:text-[#FF8A73]" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#1F7A4D] dark:text-[#6CD39B]" />
                  )}
                </div>
                <div className={`text-lg sm:text-xl font-black tracking-tight ${
                  calc.balance > 0 ? 'text-[#B4341F] dark:text-[#FF8A73]' : 'text-[#1F7A4D] dark:text-[#6CD39B]'
                }`}>
                  {formatMoney(calc.balance, currency)}
                </div>
                <div className="text-[11px] mt-0.5 font-medium">
                  {calc.balance > 0 ? (
                    <span className="text-[#B4341F] dark:text-[#FF8A73]">
                      {calc.daysOverdue ? `${calc.daysOverdue} days late` : calc.statusLabel}
                    </span>
                  ) : calc.advanceCredit > 0 ? (
                    <span className="text-[#1F7A4D] dark:text-[#6CD39B]">
                      Advance credit: {formatMoney(calc.advanceCredit, currency)}
                    </span>
                  ) : (
                    <span className="text-[#1F7A4D] dark:text-[#6CD39B]">
                      Zero balance owed
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Repayment Progress Bar */}
            <div className="mt-3.5 pt-3 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#5E6E78] dark:text-[#8E9EA8] mb-1.5">
                <span>Collection Progress</span>
                <span className="font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                  {paymentPercentage}% settled
                </span>
              </div>
              <div className="w-full bg-[#D5DDE3]/60 dark:bg-[#2B3A44] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#1F7A4D] dark:bg-[#6CD39B] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${paymentPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Due Items Breakdown (Generated Dues) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                Generated Dues & Allocation (FIFO)
              </h3>
              <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                First tracked due: {calc.unit.firstDue}
              </span>
            </div>

            <div className="space-y-2 border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl overflow-hidden divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
              {calc.dueItems.map((item) => {
                const isPaid = item.remaining === 0;
                const isPartPaid = item.paid > 0 && item.remaining > 0;
                const isOverdue = !isPaid && item.dueDate < todayStr;
                const isUpcoming = item.dueDate > todayStr;

                return (
                  <div
                    key={item.id}
                    className={`p-3 text-xs sm:text-sm flex items-center justify-between transition ${
                      isPaid
                        ? 'bg-white dark:bg-[#18232A]'
                        : isOverdue
                        ? 'bg-[#FDEDEB]/40 dark:bg-[#381A15]/40'
                        : isUpcoming
                        ? 'bg-[#FEF8E7]/30 dark:bg-[#382B0E]/30'
                        : 'bg-white dark:bg-[#18232A]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {isPaid ? (
                        <CheckCircle className="w-4 h-4 text-[#1F7A4D] dark:text-[#6CD39B] shrink-0" />
                      ) : isOverdue ? (
                        <AlertTriangle className="w-4 h-4 text-[#B4341F] dark:text-[#FF8A73] shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-[#9A6A00] dark:text-[#F0C15A] shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-1.5">
                          {item.label}
                          {item.isPreviousBalance && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              Opening
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#FEF8E7] dark:bg-[#382B0E] text-[#9A6A00] dark:text-[#F0C15A]">
                              Upcoming
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                          Due date: {item.dueDate}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                        {formatMoney(item.amount, currency)}
                      </div>
                      <div className="text-xs">
                        {isPaid ? (
                          <span className="text-[#1F7A4D] dark:text-[#6CD39B] font-semibold">
                            Fully paid
                          </span>
                        ) : isPartPaid ? (
                          <span className="text-[#9A6A00] dark:text-[#F0C15A] font-semibold">
                            Paid {currency} {item.paid} · Owed {currency} {item.remaining}
                          </span>
                        ) : (
                          <span className="text-[#B4341F] dark:text-[#FF8A73] font-semibold">
                            Unpaid ({currency} {item.remaining})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {!calc.unit.isVacant && <ChargesSection unit={calc.unit} />}

          {/* Payment Log for this Unit */}
          <div>
            <h3 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] mb-2">
              Payments Received ({unitPayments.length})
            </h3>
            {unitPayments.length === 0 ? (
              <div className="p-4 rounded-xl text-center bg-gray-50 dark:bg-[#10181D] text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                No payments have been recorded for this unit yet.
              </div>
            ) : (
              <div className="border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl overflow-hidden divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
                {unitPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 text-xs sm:text-sm flex items-center justify-between bg-white dark:bg-[#18232A]"
                  >
                    <div>
                      <div className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#1F7A4D] dark:text-[#6CD39B]" />
                        {formatMoney(p.amount, currency)}
                      </div>
                      <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                        {p.date}
                        {p.method ? ` · ${paymentMethodLabel(p)}` : ''}
                        {p.note ? ` · ${p.note}` : ''}
                        {p.receiptNo ? ` · Receipt ${receiptLabel(p, settings)}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <PaymentStatusBadge payment={p} />
                      {p.receiptNo && (
                        <button
                          type="button"
                          onClick={() => setReceiptPayment(p)}
                          className="p-1.5 text-gray-500 hover:text-[#2E3F8F] dark:hover:text-[#7D8CE8] rounded-lg cursor-pointer"
                          aria-label={`Open receipt ${receiptLabel(p, settings)}`}
                          title="Receipt"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <PastTenanciesSection unitId={calc.unit.id} onOpenStatement={setStatementUnit} />
        </div>
        {receiptPayment && <ReceiptModal payment={receiptPayment} onClose={() => setReceiptPayment(null)} />}
        {statementUnit && <StatementModal unit={statementUnit} onClose={() => setStatementUnit(null)} />}

        <div className="p-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] hover:opacity-90 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};
