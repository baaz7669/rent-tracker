import { useState } from 'react';
import { ArrowUpRight, Ban, Calendar, CheckCircle2, DollarSign, FileText, Landmark, Search, Trash2 } from 'lucide-react';
import { ReceiptModal } from './modals/ReceiptModal';
import { useApp } from '../context/AppContext';
import { getTodayStr, paymentCounts } from '../logic/rentEngine';
import { paymentMethodLabel, paymentState, receiptLabel } from '../logic/payments';
import type { Payment } from '../types';
import { PaymentStatusBadge } from './ui/PaymentStatusBadge';
import { formatMoney } from '../logic/format';

type View = 'all' | 'cheques';

type PaymentsScreenProps = {
  initialView?: 'all' | 'cheques';
};

export function PaymentsScreen({ initialView = 'all' }: PaymentsScreenProps) {
  const { payments, units, tenancies, currency, settings } = useApp();
  const [view, setView] = useState<View>(initialView);
  const [search, setSearch] = useState('');
  const todayStr = getTodayStr();

  const unitMap = new Map(units.map((u) => [u.id, u]));
  const tenancyMap = new Map(tenancies.map((t) => [t.id, t]));

  const describe = (p: Payment) => {
    const unit = unitMap.get(p.unitId);
    const tenancy = p.tenancyId ? tenancyMap.get(p.tenancyId) : undefined;
    return {
      place: unit ? `${unit.building} · ${unit.name}` : 'Unit removed',
      // The tenant who paid, even if they have since moved out
      tenant: tenancy?.tenant || unit?.tenant || 'Unknown tenant',
    };
  };

  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
  const q = search.toLowerCase().trim();
  const filtered = sorted.filter((p) => {
    if (!q) return true;
    const d = describe(p);
    const receipt = p.receiptNo ? receiptLabel(p, settings) : '';
    return [d.place, d.tenant, p.note || '', p.date, paymentMethodLabel(p), receipt].some((s) =>
      s.toLowerCase().includes(q)
    );
  });

  const countedTotal = filtered.filter(paymentCounts).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const pendingCheques = payments
    .filter((p) => paymentState(p) === 'pending')
    .sort((a, b) => (a.cheque?.date || '').localeCompare(b.cheque?.date || ''));
  const readyToDeposit = pendingCheques.filter((p) => (p.cheque?.date || '') <= todayStr);
  const postDated = pendingCheques.filter((p) => (p.cheque?.date || '') > todayStr);
  const bounced = payments.filter((p) => paymentState(p) === 'bounced').sort((a, b) => b.date.localeCompare(a.date));
  const sum = (list: Payment[]) => list.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 bg-white dark:bg-[#18232A] p-1 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] w-fit" role="tablist">
        <TabButton isActive={view === 'all'} onClick={() => setView('all')}>
          All payments
        </TabButton>
        <TabButton isActive={view === 'cheques'} onClick={() => setView('cheques')}>
          Cheques
          {readyToDeposit.length > 0 && (
            <span className="ml-1.5 px-1.5 rounded-full text-[10px] font-black bg-[#9A6A00] text-white">{readyToDeposit.length}</span>
          )}
        </TabButton>
      </div>

      {view === 'all' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E6E78] dark:text-[#8E9EA8]" />
              <input
                type="text"
                placeholder="Search by tenant, unit, date, method, receipt no..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-sm text-[#1B2B34] dark:text-[#E6EDF1] placeholder-[#5E6E78] dark:placeholder-[#8E9EA8] focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
              />
            </div>
            <div className="px-4 py-2 bg-white dark:bg-[#18232A] rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] flex items-center justify-between sm:justify-start gap-3">
              <span>{filtered.length} payments</span>
              <span className="text-sm font-black text-[#1F7A4D] dark:text-[#6CD39B]" title="Pending, bounced and void payments are not included">
                Received: {formatMoney(countedTotal, currency)}
              </span>
            </div>
          </div>

          {payments.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center">
              <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">No payments found matching "{search}".</p>
            </div>
          ) : (
            <PaymentList payments={filtered} describe={describe} />
          )}
        </>
      ) : (
        <div className="space-y-6">
          <ChequeGroup
            title="Ready to deposit"
            subtitle="Dated today or earlier. Mark each one cleared once the bank has paid it."
            payments={readyToDeposit}
            total={sum(readyToDeposit)}
            describe={describe}
            emptyText="No cheques are waiting to be deposited."
          />
          <ChequeGroup
            title="Post-dated"
            subtitle="Not due for deposit yet. They count as paid only once cleared."
            payments={postDated}
            total={sum(postDated)}
            describe={describe}
            emptyText="No post-dated cheques on hand."
          />
          {bounced.length > 0 && (
            <ChequeGroup title="Bounced" payments={bounced} total={sum(bounced)} describe={describe} emptyText="" />
          )}
        </div>
      )}
    </div>
  );
}

type Describe = (p: Payment) => { place: string; tenant: string };

function TabButton({ isActive, onClick, children }: { isActive: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center ${
        isActive
          ? 'bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D]'
          : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="p-10 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center shadow-xs">
      <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#E8F7EE] dark:bg-[#143523] flex items-center justify-center text-[#1F7A4D] dark:text-[#6CD39B]">
        <DollarSign className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">No payments recorded yet</h3>
      <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8] max-w-md mx-auto mt-1">
        Tap "Paid in full" or "Record payment" on any unit to log rent received.
      </p>
    </div>
  );
}

type ChequeGroupProps = {
  title: string;
  subtitle?: string;
  payments: Payment[];
  total: number;
  describe: Describe;
  emptyText: string;
};

function ChequeGroup({ title, subtitle, payments, total, describe, emptyText }: ChequeGroupProps) {
  const { currency } = useApp();
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-2">
            <Landmark className="w-4 h-4" /> {title} ({payments.length})
          </h3>
          {subtitle && <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">{subtitle}</p>}
        </div>
        {payments.length > 0 && (
          <span className="text-sm font-black text-[#1B2B34] dark:text-[#E6EDF1]">
            {formatMoney(total, currency)}
          </span>
        )}
      </div>
      {payments.length === 0 ? (
        <p className="p-4 rounded-xl text-xs text-center bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8]">
          {emptyText}
        </p>
      ) : (
        <PaymentList payments={payments} describe={describe} />
      )}
    </section>
  );
}

function PaymentList({ payments, describe }: { payments: Payment[]; describe: Describe }) {
  return (
    <div className="bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] rounded-2xl shadow-xs overflow-hidden divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
      {payments.map((p) => (
        <PaymentRow key={p.id} payment={p} describe={describe} />
      ))}
    </div>
  );
}

type Pending = 'none' | 'void' | 'bounce';

function PaymentRow({ payment: p, describe }: { payment: Payment; describe: Describe }) {
  const { currency, settings, updatePayment, deletePayment, addCharge } = useApp();
  const [pending, setPending] = useState<Pending>('none');
  const [fee, setFee] = useState('');
  const [error, setError] = useState('');
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const state = paymentState(p);
  const d = describe(p);
  const isStruck = state === 'void' || state === 'bounced';

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      setPending('none');
      setFee('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const markCleared = () => run(() => updatePayment(p.id, { cheque: { ...p.cheque!, status: 'cleared' } }));

  const markBounced = () =>
    run(async () => {
      await updatePayment(p.id, { cheque: { ...p.cheque!, status: 'bounced' } });
      const feeAmount = parseFloat(fee);
      if (feeAmount > 0) {
        await addCharge({
          unitId: p.unitId,
          tenancyId: p.tenancyId,
          date: getTodayStr(),
          label: p.cheque?.number ? `Bounced cheque #${p.cheque.number} fee` : 'Bounced cheque fee',
          kind: 'bounced_cheque',
          amount: feeAmount
        });
      }
    });

  return (
    <div className="p-4 space-y-2 hover:bg-gray-50/70 dark:hover:bg-[#1c2931] transition">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#E8F7EE] dark:bg-[#143523] text-[#1F7A4D] dark:text-[#6CD39B] flex items-center justify-center shrink-0 mt-0.5">
            <ArrowUpRight className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-bold text-sm text-[#1B2B34] dark:text-[#E6EDF1]">{d.place}</span>
              <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">({d.tenant})</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
              <span className="flex items-center gap-1 font-mono text-[11px]">
                <Calendar className="w-3.5 h-3.5" />
                {p.date}
              </span>
              {p.method && <span className="font-medium">{paymentMethodLabel(p)}</span>}
              {p.cheque?.bank && <span>{p.cheque.bank}</span>}
              {p.receiptNo && <span className="font-mono">{receiptLabel(p, settings)}</span>}
              {p.note && (
                <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-[#2B3A44] text-gray-700 dark:text-gray-300 font-medium">
                  {p.note}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#D5DDE3]/50 dark:border-[#2B3A44]/50">
          <PaymentStatusBadge payment={p} />
          <span
            className={`text-base sm:text-lg font-black tracking-tight ${
              isStruck
                ? 'line-through text-[#5E6E78] dark:text-[#8E9EA8]'
                : state === 'pending'
                ? 'text-[#9A6A00] dark:text-[#F0C15A]'
                : 'text-[#1F7A4D] dark:text-[#6CD39B]'
            }`}
          >
            {formatMoney(p.amount, currency)}
          </span>
          {state === 'pending' && (
            <>
              <button
                type="button"
                onClick={markCleared}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#1F7A4D] text-white dark:bg-[#6CD39B] dark:text-[#10181D] cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Cleared
              </button>
              <button
                type="button"
                onClick={() => setPending('bounce')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#B4341F] dark:text-[#FF8A73] hover:bg-[#FDEDEB] dark:hover:bg-[#381A15] cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" /> Bounced
              </button>
            </>
          )}
          {p.receiptNo && (
            <button
              type="button"
              onClick={() => setIsReceiptOpen(true)}
              className="p-2 text-gray-500 hover:text-[#2E3F8F] dark:hover:text-[#7D8CE8] rounded-lg transition cursor-pointer"
              title="Receipt: print, PDF or WhatsApp"
              aria-label={`Receipt ${receiptLabel(p, settings)}`}
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
          {state !== 'void' && (
            <button
              type="button"
              onClick={() => setPending('void')}
              className="p-2 text-gray-400 hover:text-[#B4341F] dark:hover:text-[#FF8A73] rounded-lg transition cursor-pointer"
              title={p.receiptNo ? 'Void payment (receipt number is kept)' : 'Delete payment'}
              aria-label={p.receiptNo ? 'Void payment' : 'Delete payment'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-[#B4341F] dark:text-[#FF8A73]">{error}</p>}

      {isReceiptOpen && <ReceiptModal payment={p} onClose={() => setIsReceiptOpen(false)} />}

      {pending === 'void' && (
        <ConfirmBar
          text={
            p.receiptNo
              ? `Void this payment? It stops counting, and receipt ${receiptLabel(p, settings)} will print as VOID.`
              : 'Delete this payment?'
          }
          confirmLabel={p.receiptNo ? 'Void' : 'Delete'}
          onConfirm={() => run(() => deletePayment(p.id))}
          onCancel={() => setPending('none')}
        />
      )}
      {pending === 'bounce' && (
        <ConfirmBar
          text="Mark this cheque as bounced? The rent it covered becomes owed again."
          confirmLabel="Mark bounced"
          onConfirm={markBounced}
          onCancel={() => setPending('none')}
        >
          <label className="flex items-center gap-2 text-xs">
            Bounce fee to charge ({currency}, optional)
            <input
              type="number"
              step="any"
              min="0"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="w-24 px-2 py-1 rounded-md border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D]"
            />
          </label>
        </ConfirmBar>
      )}
    </div>
  );
}

type ConfirmBarProps = {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

function ConfirmBar({ text, confirmLabel, onConfirm, onCancel, children }: ConfirmBarProps) {
  return (
    <div className="p-3 bg-[#FDEDEB] dark:bg-[#381A15] border border-[#B4341F]/30 rounded-xl space-y-2 text-xs">
      <p className="font-semibold text-[#B4341F] dark:text-[#FF8A73]">{text}</p>
      {children}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onConfirm} className="px-3 py-1 bg-[#B4341F] text-white font-bold rounded-lg cursor-pointer">
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 bg-white dark:bg-[#18232A] text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
