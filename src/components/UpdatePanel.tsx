import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'downloaded' | 'error' | 'unavailable';

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  percent: number;
  message: string;
}

interface UpdateBridge {
  getAppInfo: () => Promise<{ version: string } | null>;
  getUpdateState: () => Promise<UpdateState | null>;
  checkForUpdates: () => Promise<UpdateState>;
  installUpdate: () => Promise<boolean>;
  onUpdateStatus: (cb: (s: UpdateState) => void) => () => void;
}

function bridge(): UpdateBridge | null {
  const api = typeof window !== 'undefined' ? window.rentAPI : undefined;
  return api && typeof api.checkForUpdates === 'function' ? (api as unknown as UpdateBridge) : null;
}

function describe(s: UpdateState | null): string {
  if (!s) return '';
  switch (s.status) {
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return 'You have the latest version.';
    case 'downloading':
      return `Downloading version ${s.version ?? ''}… ${s.percent}%`;
    case 'downloaded':
      return `Version ${s.version} is ready. Restart to finish updating; your data is already saved.`;
    case 'error':
      return `Could not check for updates: ${s.message}`;
    case 'unavailable':
      return s.message;
    default:
      return 'Updates are checked automatically every few hours.';
  }
}

/** Windows app only: current version, update status, check / restart buttons. */
export function UpdatePanel() {
  const api = bridge();
  const [state, setState] = useState<UpdateState | null>(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    const b = bridge();
    if (!b) return;
    b.getAppInfo().then((info) => setVersion(info?.version || '')).catch(() => undefined);
    b.getUpdateState().then(setState).catch(() => undefined);
    return b.onUpdateStatus(setState);
  }, []);

  if (!api) return null;
  const isBusy = state?.status === 'checking' || state?.status === 'downloading';

  return (
    <section
      aria-labelledby="updates-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-3"
    >
      <div className="flex items-center gap-2">
        <Download className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
        <h3 id="updates-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
          App updates
        </h3>
        {version && <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">Version {version}</span>}
      </div>
      <p role="status" className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">
        {describe(state)}
      </p>
      <div className="flex flex-wrap gap-2">
        {state?.status === 'downloaded' ? (
          <button
            type="button"
            onClick={() => api.installUpdate()}
            className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
          >
            Restart to update
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={async () => setState(await api.checkForUpdates())}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} /> Check for updates
          </button>
        )}
      </div>
    </section>
  );
}
