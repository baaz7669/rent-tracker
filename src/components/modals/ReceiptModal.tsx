import { useState } from 'react';
import { FileDown, MessageCircle, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calculateUnit, getTodayStr } from '../../logic/rentEngine';
import { buildUnitView } from '../../logic/tenancy';
import { ReceiptContext, receiptFilename, receiptWhatsAppUrl } from '../../logic/receipts';
import { canSavePdf, printDocument, saveDocumentPdf } from '../../logic/print';
import type { Payment } from '../../types';
import { ModalShell, secondaryButtonClass } from '../ui/ModalShell';
import { PrintPortal } from '../ui/PrintPortal';
import { ReceiptDocument } from '../ReceiptDocument';

type Props = {
  payment: Payment;
  onClose: () => void;
};

/** Builds the receipt data for a payment, including the tenancy's balance as of today. */
export function useReceiptContext(payment: Payment): ReceiptContext {
  const { db, currency, settings } = useApp();
  const asOf = getTodayStr();
  const unit = db.units.find((u) => u.id === payment.unitId);
  const tenancy = db.tenancies.find((t) => t.id === payment.tenancyId);
  let balanceAfter = 0;
  if (unit && tenancy) {
    balanceAfter = calculateUnit(buildUnitView(unit, tenancy, db.charges), db.payments, asOf).balance;
  }
  return {
    payment,
    tenantName: tenancy?.tenant || 'Tenant',
    tenantPhone: tenancy?.phone,
    unitLabel: unit ? `${unit.building} · ${unit.name}` : 'Unit',
    currency,
    settings,
    balanceAfter,
    asOf
  };
}

export function ReceiptModal({ payment, onClose }: Props) {
  const ctx = useReceiptContext(payment);
  const [status, setStatus] = useState('');
  const waUrl = receiptWhatsAppUrl(ctx);
  const hasLandlord = Boolean(ctx.settings.landlord?.name);

  const handlePdf = async () => {
    setStatus('');
    const saved = await saveDocumentPdf(receiptFilename(ctx), 'A5');
    setStatus(saved ? 'PDF saved.' : '');
  };

  const actionClass =
    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer';

  return (
    <ModalShell title="Receipt" subtitle={`${ctx.unitLabel} · ${ctx.tenantName}`} onClose={onClose} size="lg">
      <div className="p-4 sm:p-5 space-y-4">
        {!hasLandlord && (
          <p className="text-xs p-2.5 rounded-lg bg-[#EDF1F4] dark:bg-[#10181D] text-[#5E6E78] dark:text-[#8E9EA8]">
            Tip: add your name, phone and address under Settings → Landlord &amp; receipts so they appear on
            every receipt.
          </p>
        )}

        <div className="rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden">
          <ReceiptDocument ctx={ctx} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => printDocument('A5')} className={actionClass}>
            <Printer className="w-4 h-4" /> Print
          </button>
          {canSavePdf() && (
            <button type="button" onClick={handlePdf} className={actionClass}>
              <FileDown className="w-4 h-4" /> Save PDF
            </button>
          )}
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className={actionClass}>
              <MessageCircle className="w-4 h-4 text-[#1F7A4D] dark:text-[#6CD39B]" /> Send on WhatsApp
            </a>
          ) : (
            <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">No phone number for WhatsApp.</span>
          )}
          {status && <span className="text-xs font-semibold text-[#1F7A4D] dark:text-[#6CD39B]">{status}</span>}
          <button type="button" onClick={onClose} className={`${secondaryButtonClass} ml-auto`}>
            Close
          </button>
        </div>
      </div>

      <PrintPortal>
        <ReceiptDocument ctx={ctx} />
      </PrintPortal>
    </ModalShell>
  );
}
