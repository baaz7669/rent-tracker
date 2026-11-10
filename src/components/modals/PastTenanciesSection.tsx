import { History } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { calculateUnit } from '../../logic/rentEngine';
import { buildUnitView, tenanciesOf } from '../../logic/tenancy';
import type { Unit } from '../../types';
import { formatMoney } from '../../logic/format';

type Props = {
  unitId: string;
  /** Opens the statement for one previous tenancy. */
  onOpenStatement?: (tenancyView: Unit) => void;
};

const END_OF_TIME = '9999-12-31';

/** Previous tenants of a unit, each with their own final balance and deposit settlement. */
export function PastTenanciesSection({ unitId, onOpenStatement }: Props) {
  const { db, currency } = useApp();
  const record = db.units.find((u) => u.id === unitId);
  const past = tenanciesOf(unitId, db.tenancies).filter((t) => t.endedAt);
  if (!record || past.length === 0) return null;

  const money = (n: number) => `${formatMoney(n, currency)}`;

  return (
    <section aria-labelledby={`past-tenants-${unitId}`}>
      <h3
        id={`past-tenants-${unitId}`}
        className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] mb-2 flex items-center gap-2"
      >
        <History className="w-4 h-4" /> Previous tenants ({past.length})
      </h3>
      <ul className="border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl divide-y divide-[#D5DDE3] dark:divide-[#2B3A44]">
        {past.map((t) => {
          const view = buildUnitView(record, t, db.charges);
          const calc = calculateUnit(view, db.payments, END_OF_TIME);
          const s = t.deposit?.settlement;
          return (
            <li key={t.id} className="p-3 text-xs sm:text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">{t.tenant || 'Unnamed tenant'}</span>
                <span className="flex items-center gap-3 text-[#5E6E78] dark:text-[#8E9EA8]">
                  {t.firstDue} → {t.endedAt}
                  {onOpenStatement && (
                    <button
                      type="button"
                      onClick={() => onOpenStatement(view)}
                      className="text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer"
                    >
                      Statement
                    </button>
                  )}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#5E6E78] dark:text-[#8E9EA8]">
                <span>Paid {money(calc.totalPaid)}</span>
                {calc.balance > 0 ? (
                  <span className="font-semibold text-[#B4341F] dark:text-[#FF8A73]">Left owing {money(calc.balance)}</span>
                ) : (
                  <span className="font-semibold text-[#1F7A4D] dark:text-[#6CD39B]">Settled</span>
                )}
                {s && (
                  <span>
                    Deposit {money(t.deposit?.amount || 0)}: {s.appliedToBalance > 0 && `${money(s.appliedToBalance)} to rent, `}
                    {s.deductions.length > 0 &&
                      `${s.deductions.map((d) => `${d.label} ${money(d.amount)}`).join(', ')}, `}
                    refunded {money(s.refunded)}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
