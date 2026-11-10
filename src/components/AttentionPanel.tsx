import { AlertTriangle, ArrowRight, CalendarClock, Home, Landmark } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AttentionKind, AttentionTarget, buildAttentionItems } from '../logic/attention';
import { getTodayStr } from '../logic/rentEngine';

const ICONS: Record<AttentionKind, typeof Landmark> = {
  cheques_to_deposit: Landmark,
  long_overdue: AlertTriangle,
  leases_ending: CalendarClock,
  vacant: Home
};

type Props = {
  onNavigate: (target: AttentionTarget) => void;
};

/** "Needs attention today": cheques to deposit, long arrears, leases ending, vacant units. */
export function AttentionPanel({ onNavigate }: Props) {
  const { units, payments, currency } = useApp();
  const items = buildAttentionItems(units, payments, currency, getTodayStr());
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="attention-heading"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs"
    >
      <h2 id="attention-heading" className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1] mb-3">
        Needs attention today
      </h2>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          const isUrgent = item.kind === 'long_overdue';
          return (
            <li
              key={item.kind}
              className={`flex items-start gap-3 p-3 rounded-xl border ${
                isUrgent
                  ? 'border-[#B4341F]/30 bg-[#FDEDEB] dark:bg-[#381A15]'
                  : 'border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/50 dark:bg-[#10181D]'
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`w-5 h-5 mt-0.5 shrink-0 ${isUrgent ? 'text-[#B4341F] dark:text-[#FF8A73]' : 'text-[#2E3F8F] dark:text-[#7D8CE8]'}`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">{item.title}</div>
                <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">{item.detail}</div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(item.target)}
                className="flex items-center gap-1 text-xs font-bold text-[#2E3F8F] dark:text-[#7D8CE8] whitespace-nowrap cursor-pointer min-h-0 self-center"
              >
                {item.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
