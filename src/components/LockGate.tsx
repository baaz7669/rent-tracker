import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { DEFAULT_LOCK_MINUTES, LOCKOUT_SECONDS, MAX_ATTEMPTS, verifyPin, verifyRecoveryCode } from '../logic/pin';

/** Dispatch this to lock immediately (e.g. "Lock now" in Settings). */
export const LOCK_EVENT = 'rent-tracker:lock';
const IDLE_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'] as const;

/**
 * Shows a PIN screen instead of the app when a PIN is set: on start and after the chosen idle time.
 * Nothing of the app is rendered while locked.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useApp();
  const pin = settings.security?.pin;
  const [isLocked, setIsLocked] = useState(Boolean(pin));
  const lockMinutes = settings.security?.lockAfterMinutes ?? DEFAULT_LOCK_MINUTES;
  const lastActivity = useRef(Date.now());

  // If the PIN is removed, unlock; if one is set for the first time, stay unlocked until idle/start.
  useEffect(() => {
    if (!pin) setIsLocked(false);
  }, [pin]);

  useEffect(() => {
    if (!pin) return;
    const lockNow = () => setIsLocked(true);
    window.addEventListener(LOCK_EVENT, lockNow);
    if (lockMinutes <= 0) return () => window.removeEventListener(LOCK_EVENT, lockNow);

    const markActive = () => (lastActivity.current = Date.now());
    IDLE_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > lockMinutes * 60_000) setIsLocked(true);
    }, 15_000);
    return () => {
      window.removeEventListener(LOCK_EVENT, lockNow);
      IDLE_EVENTS.forEach((e) => window.removeEventListener(e, markActive));
      window.clearInterval(timer);
    };
  }, [pin, lockMinutes]);

  if (!pin || !isLocked) return <>{children}</>;
  return (
    <LockScreen
      onUnlock={() => {
        lastActivity.current = Date.now();
        setIsLocked(false);
      }}
    />
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { settings, updateSettings } = useApp();
  const record = settings.security!.pin!;
  const [mode, setMode] = useState<'pin' | 'recover'>('pin');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (pausedUntil <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [pausedUntil, now]);

  const secondsLeft = Math.max(0, Math.ceil((pausedUntil - now) / 1000));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (secondsLeft > 0 || isChecking) return;
    setIsChecking(true);
    setError('');
    try {
      if (mode === 'pin') {
        if (await verifyPin(value, record)) return onUnlock();
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          setAttempts(0);
          setPausedUntil(Date.now() + LOCKOUT_SECONDS * 1000);
          setNow(Date.now());
          setError(`Too many wrong tries. Wait ${LOCKOUT_SECONDS} seconds.`);
        } else {
          setError('Wrong PIN.');
        }
      } else if (await verifyRecoveryCode(value, record)) {
        // The recovery code removes the PIN; a new one can be set in Settings.
        await updateSettings({ security: { ...settings.security, pin: undefined } });
        onUnlock();
      } else {
        setError('That recovery code does not match.');
      }
    } finally {
      setValue('');
      setIsChecking(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#EDF1F4] dark:bg-[#10181D]">
      <form
        onSubmit={submit}
        aria-labelledby="lock-heading"
        className="w-full max-w-sm p-6 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xl space-y-4 text-center"
      >
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h1 id="lock-heading" className="text-lg font-black text-[#1B2B34] dark:text-[#E6EDF1]">
          {mode === 'pin' ? 'Rent Tracker is locked' : 'Use your recovery code'}
        </h1>
        <input
          autoFocus
          type={mode === 'pin' ? 'password' : 'text'}
          inputMode={mode === 'pin' ? 'numeric' : 'text'}
          autoComplete="off"
          aria-label={mode === 'pin' ? 'PIN' : 'Recovery code'}
          placeholder={mode === 'pin' ? 'PIN' : 'XXXX-XXXX-XXXX'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={secondsLeft > 0}
          className="w-full px-4 py-3 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-center text-lg tracking-widest text-[#1B2B34] dark:text-[#E6EDF1] focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
        />
        {(error || secondsLeft > 0) && (
          <p role="alert" className="text-sm font-semibold text-[#B4341F] dark:text-[#FF8A73]">
            {secondsLeft > 0 ? `Too many wrong tries. Try again in ${secondsLeft}s.` : error}
          </p>
        )}
        <button
          type="submit"
          disabled={isChecking || secondsLeft > 0 || !value}
          className="w-full py-3 rounded-xl font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] disabled:opacity-50 cursor-pointer"
        >
          {isChecking ? 'Checking…' : mode === 'pin' ? 'Unlock' : 'Remove PIN and unlock'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'pin' ? 'recover' : 'pin');
            setValue('');
            setError('');
          }}
          className="text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer min-h-0"
        >
          {mode === 'pin' ? 'Forgot PIN?' : 'Back to PIN'}
        </button>
      </form>
    </main>
  );
}
