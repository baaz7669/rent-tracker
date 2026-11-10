import { useState } from 'react';
import { whatsAppUrl } from '../../logic/whatsapp';
import { FileDown, MessageCircle, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getTodayStr } from '../../logic/rentEngine';
import { buildStatement, buildStatementMessage } from '../../logic/statement';
import { canSavePdf, printDocument, saveDocumentPdf } from '../../logic/print';
import type { Unit } from '../../types';
import { ModalShell, secondaryButtonClass } from '../ui/ModalShell';
import { PrintPortal } from '../ui/PrintPortal';
import { StatementDocument } from '../StatementDocument';

type Props = {
  /** Unit view for the tenancy to report on (current or a previous tenancy). */
  unit: Unit;
  onClose: () => void;
};

export function StatementModal({ unit, onClose }: Props) {
  const { payments, currency, settings } = useApp();
  const [status, setStatus] = useState('');
  // Up to today. For a tenancy that has ended, no rent falls due after its move-out date anyway.
  const asOf = getTodayStr();
  const statement = buildStatement(unit, payments, asOf);
  const waUrl = whatsAppUrl(
    unit.phone,
    buildStatementMessage(unit, statement, currency, settings.landlord?.name, settings.messageTemplates)
  );

  const filename = `Statement ${unit.building} ${unit.name} ${unit.tenant} ${asOf}.pdf`.replace(/[\\/:*?"<>|]/g, '-');

  const handlePdf = async () => {
    setStatus('');
    const saved = await saveDocumentPdf(filename, 'A4');
    setStatus(saved ? 'PDF saved.' : '');
  };

  const actionClass =
    'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer';

  const doc = <StatementDocument unit={unit} statement={statement} currency={currency} landlord={settings.landlord} />;

  return (
    <ModalShell title="Tenant statement" subtitle={`${unit.building} · ${unit.name} · ${unit.tenant}`} onClose={onClose} size="lg">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-x-auto">{doc}</div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => printDocument('A4')} className={actionClass}>
            <Printer className="w-4 h-4" /> Print
          </button>
          {canSavePdf() && (
            <button type="button" onClick={handlePdf} className={actionClass}>
              <FileDown className="w-4 h-4" /> Save PDF
            </button>
          )}
          {waUrl ? (
            <a href={waUrl} target="_blank" rel="noopener noreferrer" className={actionClass}>
              <MessageCircle className="w-4 h-4 text-[#1F7A4D] dark:text-[#6CD39B]" /> Send summary on WhatsApp
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
      <PrintPortal>{doc}</PrintPortal>
    </ModalShell>
  );
}
