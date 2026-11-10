import { useState } from 'react';
import { Building, FileText, Landmark, Search, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { searchAll, SearchResult, SearchResultKind } from '../logic/search';
import { calculateUnit, getTodayStr } from '../logic/rentEngine';
import type { Payment, UnitCalculation } from '../types';
import { DialogFrame } from './ui/DialogFrame';
import { ModalShell } from './ui/ModalShell';
import { UnitHistoryModal } from './modals/UnitHistoryModal';
import { ReceiptModal } from './modals/ReceiptModal';

const ICONS: Record<SearchResultKind, typeof User> = { unit: Building, tenant: User, receipt: FileText, cheque: Landmark };

type Props = { onClose: () => void };

/** Ctrl+K: find a tenant, unit, phone, receipt or cheque and jump straight to it. */
export function QuickSearch({ onClose }: Props) {
  const { db, units, payments } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [historyCalc, setHistoryCalc] = useState<UnitCalculation | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);

  const results = searchAll(query, { units: db.units, tenancies: db.tenancies, payments: db.payments, settings: db.settings });

  const open = (r: SearchResult) => {
    if (r.paymentId) {
      const p = payments.find((x) => x.id === r.paymentId);
      if (p) return setReceipt(p);
    }
    const unit = units.find((u) => u.id === r.unitId);
    if (unit) setHistoryCalc(calculateUnit(unit, payments, getTodayStr()));
  };

  if (historyCalc) return <UnitHistoryModal isOpen calc={historyCalc} onClose={onClose} />;
  if (receipt) return <ReceiptModal payment={receipt} onClose={onClose} />;

  return (
    <DialogFrame
      onClose={onClose}
      label="Search"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh] bg-black/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl bg-white dark:bg-[#18232A] rounded-2xl shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-[#D5DDE3] dark:border-[#2B3A44]">
          <Search className="w-4 h-4 text-[#5E6E78] dark:text-[#8E9EA8]" aria-hidden="true" />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="quick-search-results"
            aria-activedescendant={results[active] ? `qs-${results[active].key}` : undefined}
            aria-label="Search tenants, units, phones, receipts and cheques"
            placeholder="Tenant, unit, phone, receipt or cheque number…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && results[active]) {
                e.preventDefault();
                open(results[active]);
              }
            }}
            className="flex-1 py-3.5 bg-transparent text-sm text-[#1B2B34] dark:text-[#E6EDF1] placeholder-[#5E6E78] dark:placeholder-[#8E9EA8] outline-none"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8]">Esc</kbd>
        </div>
        {query.trim().length >= 2 && (
          <ul id="quick-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
            {results.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-[#5E6E78] dark:text-[#8E9EA8]">Nothing found for "{query}".</li>
            ) : (
              results.map((r, i) => {
                const Icon = ICONS[r.kind];
                return (
                  <li
                    key={r.key}
                    id={`qs-${r.key}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => open(r)}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer ${
                      i === active ? 'bg-[#EDF1F4] dark:bg-[#24333D]' : ''
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-[#2E3F8F] dark:text-[#7D8CE8]" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#1B2B34] dark:text-[#E6EDF1] truncate">{r.label}</span>
                      <span className="block text-xs text-[#5E6E78] dark:text-[#8E9EA8] truncate">{r.detail}</span>
                    </span>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </DialogFrame>
  );
}

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl + K', action: 'Search tenants, units, phones, receipts and cheques' },
  { keys: 'Ctrl + 1 … 6', action: 'Switch tab (Collect, Units, Payments, Leases, Reports, Settings)' },
  { keys: 'Esc', action: 'Close the open window' },
  { keys: '?', action: 'Show these shortcuts' }
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Keyboard shortcuts" onClose={onClose}>
      <dl className="p-5 space-y-2.5">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 text-sm">
            <dt>
              <kbd className="px-2 py-0.5 rounded border border-[#D5DDE3] dark:border-[#2B3A44] text-xs font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">
                {s.keys}
              </kbd>
            </dt>
            <dd className="text-right text-[#5E6E78] dark:text-[#8E9EA8]">{s.action}</dd>
          </div>
        ))}
      </dl>
    </ModalShell>
  );
}
