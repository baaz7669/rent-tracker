import { useState } from 'react';
import { History } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatBackupDate } from '../logic/backup';

const PAGE = 30;

/** Settings → Recent activity: what changed, when, and on which device. */
export function ActivityPanel() {
  const { db } = useApp();
  const [shown, setShown] = useState(PAGE);
  const entries = db.activity || [];

  return (
    <section
      aria-labelledby="activity-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
        <h3 id="activity-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
          Recent activity
        </h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">Changes you make will be listed here.</p>
      ) : (
        <>
          <ul className="divide-y divide-[#D5DDE3] dark:divide-[#2B3A44] text-xs sm:text-sm">
            {entries.slice(0, shown).map((e) => (
              <li key={e.id} className="py-2 flex items-start justify-between gap-3">
                <span className="text-[#1B2B34] dark:text-[#E6EDF1]">{e.summary}</span>
                <span className="shrink-0 text-[#5E6E78] dark:text-[#8E9EA8] tabular-nums">{formatBackupDate(e.at)}</span>
              </li>
            ))}
          </ul>
          {entries.length > shown && (
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer min-h-0"
            >
              Show more
            </button>
          )}
        </>
      )}
    </section>
  );
}
