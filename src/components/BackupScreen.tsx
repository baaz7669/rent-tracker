import React, { useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportPaymentsToCSV, exportUnitsToCSV } from '../logic/csvExport';
import { DesktopDataPanel } from './DesktopDataPanel';
import { LandlordSettingsPanel } from './LandlordSettingsPanel';
import { TemplatesPanel } from './TemplatesPanel';
import { SecurityPanel } from './SecurityPanel';
import { ActivityPanel } from './ActivityPanel';
import { AboutPanel } from './AboutPanel';
import {
  exportBackup,
  parseBackup,
  formatBackupDate,
  formatBackupDayOnly,
  BackupData
} from '../logic/backup';
import {
  HardDrive,
  Download,
  Upload,
  Trash2,
  Coins,
  Check,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  Clock,
  Info
} from 'lucide-react';

export const BackupScreen: React.FC = () => {
  const {
    currency,
    settings,
    units,
    payments,
    db,
    updateSettings,
    eraseEverything,
    restoreBackup
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currencyInput, setCurrencyInput] = useState(currency);
  const [currencySaved, setCurrencySaved] = useState(false);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [eraseConfirmText, setEraseConfirmText] = useState('');
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [restoreErrorMsg, setRestoreErrorMsg] = useState<string | null>(null);

  // Restore confirmation modal state with parsed backup data and warnings
  const [pendingRestore, setPendingRestore] = useState<{
    data: BackupData;
    warnings: string[];
  } | null>(null);

  // Download full JSON backup
  const handleDownloadFullBackup = async () => {
    try {
      const now = Date.now();
      // Only count it as a backup if a file was actually saved (not if the dialog was cancelled)
      const saved = await exportBackup(db);
      if (!saved) return;
      updateSettings({ lastBackupAt: now });
      setBackupDownloaded(true);
      setTimeout(() => setBackupDownloaded(false), 3000);
    } catch (err) {
      console.error('Failed to download backup:', err);
      alert('Failed to generate backup file.');
    }
  };

  // Trigger file selection for restore
  const handleRestoreClick = () => {
    setRestoreErrorMsg(null);
    setRestoreSuccessMsg(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Handle selected backup file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = parseBackup(text);
        setRestoreErrorMsg(null);
        setPendingRestore(result);
      } catch (err) {
        console.error('Error parsing backup JSON:', err);
        setPendingRestore(null);
        setRestoreErrorMsg(err instanceof Error ? err.message : 'Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };

  // Confirm restore replacement
  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    try {
      // 1. FIRST automatically download a safety backup of current data with prefix "before-restore-"
      const safetySaved = await exportBackup(db, 'before-restore-');
      if (!safetySaved) {
        alert('Could not save a safety backup of your current data, so nothing was restored.');
        return;
      }

      // 2. THEN replace units, payments and settings
      const { data } = pendingRestore;
      await restoreBackup(data);
      const uCount = data.units.length;
      const pCount = data.payments.length;
      setPendingRestore(null);

      // 3. THEN show a success toast with the counts
      setRestoreSuccessMsg(
        `Successfully restored ${uCount} units and ${pCount} payments. Current data was replaced, and a safety backup was saved.`
      );
      setTimeout(() => setRestoreSuccessMsg(null), 6000);
    } catch (err) {
      console.error('Failed to restore backup:', err);
      alert('Failed to restore backup data.');
    }
  };

  const handleSaveCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currencyInput.trim()) return;
    await updateSettings({
      currency: currencyInput.trim().toUpperCase()
    });
    setCurrencySaved(true);
    setTimeout(() => setCurrencySaved(false), 2500);
  };

  const handleEraseConfirm = async () => {
    if (eraseConfirmText !== 'DELETE') return;
    // Step 5: Automatically download a backup first, before erasing
    const safetySaved = await exportBackup(db, 'before-erase-');
    if (!safetySaved) {
      alert('Could not save a safety backup first, so nothing was erased.');
      return;
    }
    await eraseEverything();
    setShowEraseModal(false);
    setEraseConfirmText('');
    setRestoreSuccessMsg('All data has been erased. A safety backup was downloaded before erasure.');
    setTimeout(() => setRestoreSuccessMsg(null), 6000);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <DesktopDataPanel />
      {/* Hidden File Input for Restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Local Storage & Full Backup / Restore (Replaces the cloud card) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#E8F7EE] dark:bg-[#143523] text-[#1F7A4D] dark:text-[#6CD39B] flex items-center justify-center shrink-0">
              <HardDrive className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                  Local Storage & Full Backup
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E8F7EE] dark:bg-[#143523] text-[#1F7A4D] dark:text-[#6CD39B] flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  100% Offline & Private
                </span>
              </div>
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                Your data is stored securely on this device without third-party servers. Download a full JSON backup regularly to keep your records safe or restore onto another phone or PC.
              </p>
            </div>
          </div>
        </div>

        {/* Status Strip */}
        <div className="p-3.5 rounded-xl bg-[#EDF1F4]/70 dark:bg-[#10181D]/60 border border-[#D5DDE3] dark:border-[#2B3A44] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[#5E6E78] dark:text-[#8E9EA8]">Units:</span>{' '}
              <strong className="text-[#1B2B34] dark:text-[#E6EDF1]">{units.length}</strong>
            </div>
            <div>
              <span className="text-[#5E6E78] dark:text-[#8E9EA8]">Payments:</span>{' '}
              <strong className="text-[#1B2B34] dark:text-[#E6EDF1]">{payments.length}</strong>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[#5E6E78] dark:text-[#8E9EA8]">
            <Clock className="w-3.5 h-3.5" />
            <span>Last full backup:</span>
            <strong className="text-[#1B2B34] dark:text-[#E6EDF1]">
              {formatBackupDate(settings.lastBackupAt)}
            </strong>
          </div>
        </div>

        {/* Feedback Messages */}
        {restoreErrorMsg && (
          <div className="p-3.5 rounded-xl bg-[#FDEDEB] dark:bg-[#381A15] border border-[#B4341F]/30 text-[#B4341F] dark:text-[#FF8A73] text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{restoreErrorMsg}</span>
          </div>
        )}

        {restoreSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-[#E8F7EE] dark:bg-[#143523] border border-[#1F7A4D]/30 text-[#1F7A4D] dark:text-[#6CD39B] text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{restoreSuccessMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleDownloadFullBackup}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] shadow-xs transition active:scale-95 cursor-pointer w-full"
            >
              {backupDownloaded ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {backupDownloaded ? 'Backup Downloaded!' : 'DOWNLOAD JSON BACKUP'}
            </button>
            <p className="text-[11px] text-center text-[#5E6E78] dark:text-[#8E9EA8]">
              Last backup: {formatBackupDate(settings.lastBackupAt)}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              onClick={handleRestoreClick}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs sm:text-sm font-bold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition active:scale-95 cursor-pointer w-full"
            >
              <Upload className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
              RESTORE FROM JSON BACKUP
            </button>
            <p className="text-[11px] text-center text-[#5E6E78] dark:text-[#8E9EA8]">
              Replaces all data from file
            </p>
          </div>
        </div>
      </div>

      {/* CSV Export & Spreadsheet Downloads */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1] flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
            Export Data to Spreadsheet (CSV)
          </h3>
          <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
            Download your portfolio and payment history as CSV files compatible with Excel and Google Sheets.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <button
            onClick={() => exportUnitsToCSV(units)}
            className="flex items-center justify-between p-4 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer group"
          >
            <div className="text-left">
              <span className="font-bold text-sm text-[#1B2B34] dark:text-[#E6EDF1] group-hover:text-[#2E3F8F] dark:group-hover:text-[#7D8CE8]">
                Export Units CSV
              </span>
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                {units.length} units with rent, tenants, phones, frequencies
              </p>
            </div>
            <Download className="w-4 h-4 text-[#5E6E78] dark:text-[#8E9EA8]" />
          </button>

          <button
            onClick={() => exportPaymentsToCSV(payments, db.units, db.tenancies, settings)}
            className="flex items-center justify-between p-4 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer group"
          >
            <div className="text-left">
              <span className="font-bold text-sm text-[#1B2B34] dark:text-[#E6EDF1] group-hover:text-[#2E3F8F] dark:group-hover:text-[#7D8CE8]">
                Export Payments CSV
              </span>
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                {payments.length} payment records with dates, amounts, notes
              </p>
            </div>
            <Download className="w-4 h-4 text-[#5E6E78] dark:text-[#8E9EA8]" />
          </button>
        </div>
      </div>

      <LandlordSettingsPanel />

      <TemplatesPanel />


      <SecurityPanel />


      <ActivityPanel />

      <AboutPanel />

      {/* Currency Settings */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
            <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
              Currency Symbol / Code
            </h3>
          </div>
          <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
            Set the currency used across rent calculations, receipts, and agreements (e.g. OMR, USD, AED, SAR).
          </p>
        </div>

        <form onSubmit={handleSaveCurrency} className="flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex gap-2">
            {['OMR', 'AED', 'SAR', 'USD', 'EUR', 'GBP'].map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCurrencyInput(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  currencyInput === c
                    ? 'bg-[#2E3F8F] text-white border-[#2E3F8F] dark:bg-[#7D8CE8] dark:text-[#10181D]'
                    : 'border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8]'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <input
              type="text"
              value={currencyInput}
              onChange={(e) => setCurrencyInput(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1]"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
            >
              {currencySaved ? 'Saved' : 'Update'}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone: Erase Everything */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#FDEDEB]/60 dark:bg-[#381A15]/40 border border-[#B4341F]/30 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-[#B4341F] dark:text-[#FF8A73]">
          <Trash2 className="w-5 h-5" />
          <h3 className="text-base font-bold">
            Danger Zone: Erase everything
          </h3>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
          Permanently deletes all {units.length} units and {payments.length} payment records from local storage. A safety backup will automatically be saved to your device before erasing.
        </p>

        <button
          onClick={() => setShowEraseModal(true)}
          className="px-4 py-2 bg-[#B4341F] hover:bg-[#972b19] text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
        >
          Erase everything
        </button>
      </div>

      {/* Confirmation Modal for Restore */}
      {pendingRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#18232A] rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FEF8E7] dark:bg-[#382B0E] text-[#9A6A00] dark:text-[#F0C15A] flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                Confirm Database Restore
              </h3>

              {/* Exact comparison string required by prompt:
                  "Current: 12 units, 340 payments → Backup from 15 Oct 2026: 12 units, 355 payments. This replaces all current data." */}
              <div className="p-3.5 rounded-xl bg-[#EDF1F4]/70 dark:bg-[#10181D]/60 border border-[#D5DDE3] dark:border-[#2B3A44] text-xs sm:text-sm text-[#1B2B34] dark:text-[#E6EDF1] font-medium leading-relaxed">
                Current: <strong className="text-[#2E3F8F] dark:text-[#7D8CE8]">{units.length} units</strong>,{' '}
                <strong className="text-[#2E3F8F] dark:text-[#7D8CE8]">{payments.length} payments</strong> → Backup from{' '}
                <strong>{formatBackupDayOnly(pendingRestore.data.exportedAt)}</strong>:{' '}
                <strong className="text-[#1F7A4D] dark:text-[#6CD39B]">{pendingRestore.data.units.length} units</strong>,{' '}
                <strong className="text-[#1F7A4D] dark:text-[#6CD39B]">{pendingRestore.data.payments.length} payments</strong>.
                <span className="block mt-1 font-semibold text-red-600 dark:text-red-400">
                  This replaces all current data.
                </span>
              </div>

              {pendingRestore.warnings.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-left text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    {pendingRestore.warnings.map((w, idx) => (
                      <p key={idx}>{w}</p>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                A safety backup of your current data (<span className="font-mono">before-restore-*.json</span>) will be automatically downloaded before replacing.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setPendingRestore(null)}
                className="flex-1 py-2.5 text-xs font-semibold rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] cursor-pointer hover:bg-gray-50 dark:hover:bg-[#24333D]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRestore}
                className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] cursor-pointer"
              >
                Confirm & Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Erase Modal Confirmation */}
      {showEraseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#18232A] rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl border border-red-300 dark:border-red-900 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                Are you absolutely sure?
              </h3>
              <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
                This will wipe out all {units.length} units and {payments.length} payments. A safety backup will be downloaded first. To confirm, type{' '}
                <span className="font-mono font-bold text-red-600">DELETE</span> below:
              </p>
            </div>

            <input
              type="text"
              placeholder="Type DELETE to confirm"
              value={eraseConfirmText}
              onChange={(e) => setEraseConfirmText(e.target.value)}
              className="w-full px-3.5 py-2 text-center font-mono font-bold text-sm rounded-xl border border-red-300 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-600 focus:outline-hidden"
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowEraseModal(false);
                  setEraseConfirmText('');
                }}
                className="flex-1 py-2 text-xs font-semibold rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEraseConfirm}
                disabled={eraseConfirmText !== 'DELETE'}
                className="flex-1 py-2 text-xs font-bold rounded-xl bg-[#B4341F] text-white hover:bg-[#972b19] disabled:opacity-40 cursor-pointer"
              >
                Permanently erase
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
