import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { AppContextType, useApp } from '../context/AppContext';
import { connectEncryption, DeviceSyncConfig, getClient, isValidProjectUrl, loadSyncConfig, saveSyncConfig, SupabaseSyncServer } from '../logic/cloudSync';
import { importKey, isAcceptablePassphrase, MIN_PASSPHRASE_LENGTH } from '../logic/crypto';
import { INITIAL_SYNC_STATE, runSync } from '../logic/sync';
import { formatBackupDate } from '../logic/backup';
import { Field, inputClass } from './ui/ModalShell';

/* ------------------------------------------------------------------ */
/* Status store (shared by the runner and the Settings panel)          */
/* ------------------------------------------------------------------ */

type Phase = 'off' | 'idle' | 'syncing' | 'error';
interface SyncStatus {
  phase: Phase;
  message?: string;
  lastSyncAt?: number;
}

let status: SyncStatus = { phase: loadSyncConfig()?.keyRaw ? 'idle' : 'off', lastSyncAt: loadSyncConfig()?.lastSyncAt };
const listeners = new Set<() => void>();
const setStatus = (s: SyncStatus) => {
  status = s;
  listeners.forEach((l) => l());
};
const useSyncStatus = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status
  );

let isRunning = false;
const AUTO_SYNC_MS = 5 * 60 * 1000;
const AFTER_CHANGE_MS = 20 * 1000;

/** One sync round with the cloud. Safe to call often; overlapping calls are skipped. */
export async function syncNow(app: Pick<AppContextType, 'rawDb' | 'device' | 'mergeFromSync'>): Promise<void> {
  const config = loadSyncConfig();
  if (!config?.keyRaw) return setStatus({ phase: 'off' });
  if (isRunning) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return setStatus({ ...status, phase: 'error', message: 'Offline. Changes will sync when you are back online.' });
  }
  isRunning = true;
  setStatus({ ...status, phase: 'syncing', message: undefined });
  try {
    const client = getClient(config);
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Signed out of sync. Sign in again in Settings.');
    const key = await importKey(config.keyRaw);
    const raw = app.rawDb;
    const result = await runSync(
      { settings: raw.settings, units: raw.units, tenancies: raw.tenancies, payments: raw.payments, charges: raw.charges, expenses: raw.expenses },
      config.state,
      new SupabaseSyncServer(client),
      key,
      app.device.id
    );
    app.mergeFromSync(result.data, result.pulled);
    const lastSyncAt = Date.now();
    saveSyncConfig({ ...config, state: result.state, lastSyncAt, lastError: undefined });
    setStatus({ phase: 'idle', lastSyncAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed.';
    // A paused free Supabase project or no internet shows up as a fetch error.
    const friendly = /fetch|network/i.test(message) ? 'Cannot reach the cloud. Check the internet, or wake the project in Supabase.' : message;
    setStatus({ ...status, phase: 'error', message: friendly });
  } finally {
    isRunning = false;
  }
}

/** Mounted once: syncs on start, every few minutes, after changes and when back online. */
export function CloudSyncRunner() {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;

  useEffect(() => {
    const run = () => syncNow(appRef.current);
    run();
    const timer = window.setInterval(run, AUTO_SYNC_MS);
    window.addEventListener('online', run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', run);
    };
  }, []);

  // Push local changes shortly after they are made.
  const changedAt = app.rawDb.updatedAt;
  useEffect(() => {
    if (!loadSyncConfig()?.keyRaw) return;
    const t = window.setTimeout(() => syncNow(appRef.current), AFTER_CHANGE_MS);
    return () => window.clearTimeout(t);
  }, [changedAt]);

  return null;
}

/* ------------------------------------------------------------------ */
/* Settings panel                                                      */
/* ------------------------------------------------------------------ */

export function SyncPanel() {
  const app = useApp();
  const live = useSyncStatus();
  const [config, setConfig] = useState<DeviceSyncConfig | null>(() => loadSyncConfig());
  const isConnected = Boolean(config?.keyRaw);

  return (
    <section
      aria-labelledby="sync-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4"
    >
      <div>
        <div className="flex items-center gap-2">
          {isConnected ? <Cloud className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" /> : <CloudOff className="w-5 h-5 text-[#5E6E78]" />}
          <h3 id="sync-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            Sync with your phone
          </h3>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Keeps this device and your phone in step through your own Supabase project. Everything is encrypted on the device with
          your sync passphrase before it is sent; the cloud only stores scrambled data.
        </p>
      </div>
      {isConnected && config ? (
        <ConnectedView config={config} live={live} onDisconnect={() => setConfig(null)} app={app} />
      ) : (
        <ConnectForm app={app} onConnected={(c) => setConfig(c)} />
      )}
    </section>
  );
}

function ConnectedView({
  config,
  live,
  onDisconnect,
  app
}: {
  config: DeviceSyncConfig;
  live: SyncStatus;
  onDisconnect: () => void;
  app: AppContextType;
}) {
  const [prefix, setPrefix] = useState(app.device.receiptPrefix || '');
  const statusText =
    live.phase === 'syncing'
      ? 'Syncing…'
      : live.phase === 'error'
        ? live.message
        : live.lastSyncAt
          ? `Synced ${formatBackupDate(live.lastSyncAt)}`
          : 'Connected. Waiting for the first sync.';

  return (
    <div className="space-y-3">
      <p role="status" className={`text-sm font-semibold ${live.phase === 'error' ? 'text-[#B4341F] dark:text-[#FF8A73]' : 'text-[#1F7A4D] dark:text-[#6CD39B]'}`}>
        {statusText}
      </p>
      <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">Signed in as {config.email}.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={live.phase === 'syncing'}
          onClick={() => syncNow(app)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${live.phase === 'syncing' ? 'animate-spin' : ''}`} /> Sync now
        </button>
        <button
          type="button"
          onClick={async () => {
            await getClient(config).auth.signOut().catch(() => undefined);
            saveSyncConfig(null);
            setStatus({ phase: 'off' });
            onDisconnect();
          }}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8] cursor-pointer"
        >
          Disconnect this device
        </button>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-[#1B2B34] dark:text-[#E6EDF1]">
        Receipt numbers on this device start with
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          onBlur={() => app.setDeviceReceiptPrefix(prefix || undefined)}
          placeholder={app.settings.receiptPrefix ?? 'R-'}
          aria-label="Receipt prefix for this device"
          className="w-20 px-2 py-1 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] font-mono min-h-0"
        />
        <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">Each device needs its own prefix so receipt numbers never clash.</span>
      </label>
    </div>
  );
}

function ConnectForm({ app, onConnected }: { app: AppContextType; onConnected: (c: DeviceSyncConfig) => void }) {
  const saved = loadSyncConfig();
  const [url, setUrl] = useState(saved?.url || '');
  const [anonKey, setAnonKey] = useState(saved?.anonKey || '');
  const [email, setEmail] = useState(saved?.email || '');
  const [password, setPassword] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const connect = async (mode: 'signup' | 'signin') => {
    setMessage('');
    if (!isValidProjectUrl(url)) return setMessage('Enter your Supabase project URL, like https://abcd.supabase.co');
    if (anonKey.trim().length < 20) return setMessage('Paste the anon (public) key from Supabase → Project Settings → API.');
    if (!email.includes('@') || password.length < 8) return setMessage('Enter your email and a password of at least 8 characters.');
    if (!isAcceptablePassphrase(passphrase)) return setMessage(`The sync passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
    if (mode === 'signup' && passphrase !== confirm) return setMessage('The two passphrases do not match.');
    setIsBusy(true);
    try {
      const client = getClient({ url, anonKey });
      const auth =
        mode === 'signup'
          ? await client.auth.signUp({ email: email.trim(), password })
          : await client.auth.signInWithPassword({ email: email.trim(), password });
      if (auth.error) throw new Error(auth.error.message);
      if (!auth.data.session) {
        saveSyncConfig({ url: url.trim(), anonKey: anonKey.trim(), email: email.trim(), state: { ...INITIAL_SYNC_STATE } });
        return setMessage('Account created. Confirm it from the email Supabase sent you, then press "Sign in and connect".');
      }
      const { keyRaw, isFirstDevice } = await connectEncryption(client, passphrase);
      // The first device keeps the main receipt series; others get their own.
      if (!isFirstDevice && !app.device.receiptPrefix) app.setDeviceReceiptPrefix('P-');
      const config: DeviceSyncConfig = { url: url.trim(), anonKey: anonKey.trim(), email: email.trim(), keyRaw, state: { ...INITIAL_SYNC_STATE } };
      saveSyncConfig(config);
      onConnected(config);
      setStatus({ phase: 'idle' });
      await syncNow(app);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not connect.');
    } finally {
      setPassword('');
      setIsBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Supabase project URL">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" className={inputClass} />
        </Field>
        <Field label="Anon (public) key">
          <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <Field label={`Sync passphrase (${MIN_PASSPHRASE_LENGTH}+ characters)`}>
          <input type="password" autoComplete="off" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Repeat passphrase (first device only)">
          <input type="password" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-[#9A6A00] dark:text-[#F0C15A]">
        The passphrase cannot be recovered. Without it the cloud copy cannot be read (your devices keep their own copies).
      </p>
      {message && <p role="alert" className="text-xs font-semibold text-[#B4341F] dark:text-[#FF8A73]">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => connect('signin')}
          className="px-3.5 py-2 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] disabled:opacity-50 cursor-pointer"
        >
          {isBusy ? 'Connecting…' : 'Sign in and connect'}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => connect('signup')}
          className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] disabled:opacity-50 cursor-pointer"
        >
          Create account and connect
        </button>
      </div>
    </form>
  );
}
