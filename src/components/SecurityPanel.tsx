import { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { createPinRecord, DEFAULT_LOCK_MINUTES, isValidPin, LOCK_OPTIONS, verifyPin } from '../logic/pin';
import { LOCK_EVENT } from './LockGate';
import { Field, inputClass } from './ui/ModalShell';

type Mode = 'idle' | 'set' | 'change' | 'remove';

/** Settings → Security: set, change or remove the PIN; auto-lock time; lock now. */
export function SecurityPanel() {
  const { settings, updateSettings } = useApp();
  const security = settings.security || {};
  const hasPin = Boolean(security.pin);
  const [mode, setMode] = useState<Mode>('idle');
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const reset = () => {
    setMode('idle');
    setCurrent('');
    setPin('');
    setConfirm('');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      if ((mode === 'change' || mode === 'remove') && !(await verifyPin(current, security.pin!))) {
        return setError('Current PIN is wrong.');
      }
      if (mode === 'remove') {
        await updateSettings({ security: { ...security, pin: undefined } });
        return reset();
      }
      if (!isValidPin(pin)) return setError('Use 4 to 8 digits.');
      if (pin !== confirm) return setError('The two PINs do not match.');
      const { record, recoveryCode: code } = await createPinRecord(pin);
      await updateSettings({ security: { ...security, pin: record } });
      reset();
      setRecoveryCode(code);
    } finally {
      setIsBusy(false);
    }
  };

  const button = 'px-3.5 py-2 rounded-lg text-xs font-bold cursor-pointer';

  return (
    <section
      aria-labelledby="security-heading"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs space-y-4"
    >
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
          <h3 id="security-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            PIN lock
          </h3>
        </div>
        <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-1">
          Asks for a PIN when the app opens and after it has been idle. This keeps others on a shared PC out of the app.
          It does <strong>not</strong> encrypt your data file or backups.
        </p>
      </div>

      {recoveryCode && (
        <div role="alert" className="p-4 rounded-xl border-2 border-[#9A6A00] bg-[#FEF8E7] dark:bg-[#382B0E] space-y-2">
          <p className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">Write down your recovery code</p>
          <p className="font-mono text-xl font-black tracking-widest text-[#1B2B34] dark:text-[#E6EDF1]">{recoveryCode}</p>
          <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            If you forget your PIN, this code removes it. It is shown only once and cannot be recovered.
          </p>
          <button type="button" onClick={() => setRecoveryCode('')} className={`${button} bg-[#9A6A00] text-white`}>
            I have written it down
          </button>
        </div>
      )}

      {mode === 'idle' ? (
        <div className="flex flex-wrap items-center gap-2">
          {hasPin ? (
            <>
              <span className="text-sm font-semibold text-[#1F7A4D] dark:text-[#6CD39B] mr-2">PIN is on</span>
              <button type="button" onClick={() => setMode('change')} className={`${button} border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1]`}>
                Change PIN
              </button>
              <button type="button" onClick={() => setMode('remove')} className={`${button} text-[#B4341F] dark:text-[#FF8A73]`}>
                Remove PIN
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event(LOCK_EVENT))}
                className={`${button} flex items-center gap-1.5 bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D]`}
              >
                <Lock className="w-3.5 h-3.5" /> Lock now
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode('set')} className={`${button} bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D]`}>
              Set a PIN
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 max-w-sm">
          {(mode === 'change' || mode === 'remove') && (
            <Field label="Current PIN">
              <input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} autoFocus />
            </Field>
          )}
          {(mode === 'set' || mode === 'change') && (
            <>
              <Field label="New PIN (4 to 8 digits)">
                <input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} className={inputClass} autoFocus={mode === 'set'} />
              </Field>
              <Field label="Repeat new PIN">
                <input type="password" inputMode="numeric" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
              </Field>
            </>
          )}
          {error && <p role="alert" className="text-xs font-semibold text-[#B4341F] dark:text-[#FF8A73]">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="submit" disabled={isBusy} className={`${button} bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] disabled:opacity-50`}>
              {mode === 'remove' ? 'Remove PIN' : 'Save PIN'}
            </button>
            <button type="button" onClick={reset} className={`${button} text-[#5E6E78] dark:text-[#8E9EA8]`}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {hasPin && (
        <label className="flex items-center gap-2 text-sm text-[#1B2B34] dark:text-[#E6EDF1]">
          Lock after
          <select
            value={security.lockAfterMinutes ?? DEFAULT_LOCK_MINUTES}
            onChange={(e) => updateSettings({ security: { ...security, lockAfterMinutes: Number(e.target.value) } })}
            className="px-2 py-1 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] min-h-0"
          >
            {LOCK_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'only when the app starts' : `${m} minutes idle`}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
