import { useRef, useState } from 'react';
import { Cloud, FileSpreadsheet, Plus, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { parseBackup } from '../logic/backup';
import { BulkImportModal } from './modals/BulkImportModal';
import { AddEditUnitModal } from './modals/AddEditUnitModal';

/** First-run screen when there is no data yet. */
type WelcomeScreenProps = {
  /** Opens Settings (where sync is connected). */
  onOpenSettings?: () => void;
};

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps) {
  const { restoreBackup, loadSampleUnits } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [error, setError] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setIsRestoring(true);
    try {
      // Nothing to overwrite yet, so no safety copy is needed before restoring.
      const { data } = parseBackup(await file.text());
      await restoreBackup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read as a Rent Tracker backup.');
    } finally {
      setIsRestoring(false);
    }
  };

  const options = [
    ...(onOpenSettings
      ? [
          {
            icon: Cloud,
            title: 'Connect to sync',
            text: 'Already using Rent Tracker on another device? Sign in to bring all your data here.',
            action: onOpenSettings,
            isPrimary: false
          }
        ]
      : []),
    {
      icon: Upload,
      title: 'Restore a backup',
      text: 'Moving from the browser version or another PC? Pick the backup file (.json) you downloaded there.',
      action: () => fileRef.current?.click(),
      isPrimary: true
    },
    {
      icon: FileSpreadsheet,
      title: 'Import from Excel',
      text: 'Paste your list of units and tenants straight from a spreadsheet.',
      action: () => setIsImportOpen(true)
    },
    { icon: Plus, title: 'Add your first unit', text: 'Enter one flat, shop or office and its tenant.', action: () => setIsAddOpen(true) },
    { icon: Sparkles, title: 'Try with sample data', text: 'Explore the app with six example units. Erase them later in Settings.', action: () => loadSampleUnits() }
  ];

  return (
    <section aria-labelledby="welcome-heading" className="max-w-3xl mx-auto py-6 space-y-6">
      <div className="text-center space-y-2">
        <h2 id="welcome-heading" className="text-2xl font-black text-[#1B2B34] dark:text-[#E6EDF1]">
          Welcome to Rent Tracker
        </h2>
        <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">
          Everything stays on this computer. How would you like to start?
        </p>
      </div>

      {error && (
        <p role="alert" className="p-3 rounded-xl text-sm font-medium bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73]">
          {error}
        </p>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((o) => (
          <li key={o.title}>
            <button
              type="button"
              onClick={o.action}
              disabled={isRestoring}
              className={`w-full h-full text-left p-5 rounded-2xl border transition cursor-pointer disabled:opacity-60 ${
                o.isPrimary
                  ? 'border-[#2E3F8F] dark:border-[#7D8CE8] bg-[#2E3F8F]/5 dark:bg-[#7D8CE8]/10'
                  : 'border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] hover:border-[#2E3F8F] dark:hover:border-[#7D8CE8]'
              }`}
            >
              <o.icon className="w-6 h-6 text-[#2E3F8F] dark:text-[#7D8CE8]" aria-hidden="true" />
              <span className="block mt-3 text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                {o.isPrimary && isRestoring ? 'Restoring…' : o.title}
              </span>
              <span className="block mt-1 text-sm text-[#5E6E78] dark:text-[#8E9EA8]">{o.text}</span>
            </button>
          </li>
        ))}
      </ul>

      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-hidden="true" tabIndex={-1} onChange={handleFile} />
      {isImportOpen && <BulkImportModal isOpen onClose={() => setIsImportOpen(false)} />}
      {isAddOpen && <AddEditUnitModal isOpen onClose={() => setIsAddOpen(false)} />}
    </section>
  );
}
