import React, { useState } from 'react';
import { DialogFrame } from '../ui/DialogFrame';
import { useApp } from '../../context/AppContext';
import { parseBulkImport, getTodayStr } from '../../logic/rentEngine';
import { X, Upload, AlertCircle, CheckCircle, FileSpreadsheet } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const BulkImportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { bulkImportUnits, currency } = useApp();
  const todayStr = getTodayStr();
  const currentMonthFirst = todayStr.slice(0, 7) + '-01';

  const [rawText, setRawText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const parsed = parseBulkImport(rawText, currentMonthFirst);

  const handleInsertSample = () => {
    const sample = `Building\tUnit\tType\tTenant\tPhone\tRent\tPays every\tFirst due date\tLease end\nAl Andalus Tower\tFlat 101\tFlat\tAli Khan\t96891234567\t150\t1\t${currentMonthFirst}\t2027-06-30\nRuwi Plaza\tShop 4\tShop\tOman Traders\t96898765432\t350\t3\t${currentMonthFirst}\t2027-12-31\nBousher View\tFlat 202\tFlat\tSara Al-Busaidi\t96894445566\t200\t1\t${currentMonthFirst}\t`;
    setRawText(sample);
  };

  const handleImport = async () => {
    if (parsed.units.length === 0) return;
    setIsImporting(true);
    setErrorMsg('');
    try {
      const count = await bulkImportUnits(parsed.units);
      setSuccessCount(count);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <DialogFrame onClose={onClose} label="Paste units from Excel" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-[#18232A] rounded-2xl w-full max-w-3xl shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden my-8">
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#D5DDE3] dark:border-[#2B3A44]">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
            <h2 className="text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
              Paste from Excel / Google Sheets
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="p-3.5 bg-[#EDF1F4]/70 dark:bg-[#10181D] rounded-xl text-xs text-[#5E6E78] dark:text-[#8E9EA8] space-y-1.5">
            <p className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">
              Copy rows from your spreadsheet and paste them below.
            </p>
            <p>
              Expected column order: <span className="font-mono text-[11px] text-[#2E3F8F] dark:text-[#7D8CE8]">Building · Unit · Type · Tenant · Phone · Rent · Pays every (1, 3, 6, 12) · First due (YYYY-MM-DD) · Lease end (optional)</span>
            </p>
            <p className="text-[11px]">
              Tip: If a header row starts with "Building", it is automatically skipped. Invalid or missing first-due defaults to the 1st of the current month.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
              Pasted Data
            </label>
            <button
              type="button"
              onClick={handleInsertSample}
              className="text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] hover:underline cursor-pointer"
            >
              Insert example rows
            </button>
          </div>

          <textarea
            rows={7}
            placeholder={`Tower A\tFlat 101\tFlat\tAli Khan\t9689xxxxxxx\t150\t1\t2026-10-01\t2027-06-30\nTower A\tShop 2\tShop\tModern Mart\t9689xxxxxxx\t300\t3\t2026-10-01\t`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="w-full p-3 font-mono text-xs rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/30 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
          />

          {errorMsg && (
            <div className="p-3 bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73] text-xs font-semibold rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          {successCount !== null && (
            <div className="p-3 bg-[#E8F7EE] dark:bg-[#143523] text-[#1F7A4D] dark:text-[#6CD39B] text-xs font-bold rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Successfully imported {successCount} units!
            </div>
          )}

          {/* Skipped rows warnings */}
          {parsed.skippedRows.length > 0 && (
            <div className="p-3 bg-[#FDEDEB]/60 dark:bg-[#381A15]/60 border border-[#B4341F]/30 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#B4341F] dark:text-[#FF8A73]">
                <AlertCircle className="w-3.5 h-3.5" />
                Skipped {parsed.skippedRows.length} invalid {parsed.skippedRows.length === 1 ? 'row' : 'rows'}:
              </div>
              <ul className="text-xs text-[#B4341F] dark:text-[#FF8A73] list-disc list-inside space-y-0.5 max-h-28 overflow-y-auto">
                {parsed.skippedRows.map((skip, idx) => (
                  <li key={idx}>
                    Row #{skip.rowNumber}: {skip.reason} ({skip.text.slice(0, 40)}...)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsed.units.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                  Ready to import ({parsed.units.length} {parsed.units.length === 1 ? 'unit' : 'units'})
                </span>
                <span className="text-xs text-[#1F7A4D] dark:text-[#6CD39B] font-semibold">
                  Valid format
                </span>
              </div>
              <div className="border border-[#D5DDE3] dark:border-[#2B3A44] rounded-xl overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-100 dark:bg-[#10181D] text-[#5E6E78] dark:text-[#8E9EA8] uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-2">Building</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Tenant</th>
                      <th className="p-2">Rent ({currency})</th>
                      <th className="p-2">Freq</th>
                      <th className="p-2">First Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D5DDE3] dark:divide-[#2B3A44] bg-white dark:bg-[#18232A]">
                    {parsed.units.map((u, i) => (
                      <tr key={i}>
                        <td className="p-2 font-medium">{u.building}</td>
                        <td className="p-2 font-bold">{u.name}</td>
                        <td className="p-2">{u.type}</td>
                        <td className="p-2">{u.tenant}</td>
                        <td className="p-2 font-semibold">{currency} {u.rent}</td>
                        <td className="p-2">{u.every}m</td>
                        <td className="p-2 text-gray-500">{u.firstDue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#D5DDE3] dark:border-[#2B3A44] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold rounded-lg text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={parsed.units.length === 0 || isImporting}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : `Import ${parsed.units.length} units`}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};
