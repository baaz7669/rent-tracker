import { useEffect, useState } from 'react';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { isDesktopApp } from '../logic/storage';
import { useApp } from '../context/AppContext';

interface DesktopAppInfo {
  dataFile: string;
  backupFolder: string;
  version: string;
}

interface DesktopApi {
  getAppInfo: () => Promise<DesktopAppInfo | null>;
  openBackupFolder: () => Promise<boolean>;
}

function desktopApi(): DesktopApi | null {
  const api = typeof window !== 'undefined' ? window.rentAPI : undefined;
  if (api && typeof api.getAppInfo === 'function' && typeof api.openBackupFolder === 'function') {
    return api as unknown as DesktopApi;
  }
  return null;
}

/** Shown only in the Windows app: where data is saved and the automatic daily backups. */
export function DesktopDataPanel() {
  const [info, setInfo] = useState<DesktopAppInfo | null>(null);
  const { settings, updateSettings } = useApp();
  const api = desktopApi();

  useEffect(() => {
    const bridge = desktopApi();
    if (!bridge) return;
    let isCancelled = false;
    bridge
      .getAppInfo()
      .then((result) => {
        if (!isCancelled) setInfo(result);
      })
      .catch((err: unknown) => console.warn('Could not read app info', err));
    return () => {
      isCancelled = true;
    };
  }, []);

  if (!isDesktopApp() || !api) return null;

  return (
    <section
      aria-labelledby="desktop-data-heading"
      className="rounded-2xl border border-[#2E3F8F]/30 dark:border-[#7D8CE8]/30 bg-[#2E3F8F]/5 dark:bg-[#7D8CE8]/10 p-5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 mt-0.5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
        <div className="space-y-1">
          <h3 id="desktop-data-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            Saved on this PC, backed up daily
          </h3>
          <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">
            Every change is saved to a file straight away. A copy is kept automatically each day (last 30 days).
          </p>
          {info && (
            <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] break-all">
              Data file: <span className="font-mono">{info.dataFile}</span> · App version {info.version}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => api.openBackupFolder()}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer"
      >
        <FolderOpen className="w-4 h-4" />
        Open daily backups folder
      </button>
      <label className="flex items-center gap-2 text-sm text-[#1B2B34] dark:text-[#E6EDF1] cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(settings.notifyOnOpen)}
          onChange={(e) => updateSettings({ notifyOnOpen: e.target.checked || undefined })}
        />
        Show a Windows notification of what needs attention when the app opens
      </label>
    </section>
  );
}
