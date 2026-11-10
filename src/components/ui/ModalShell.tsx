import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { DialogFrame } from "./DialogFrame";

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-[#EDF1F4]/40 dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] text-sm focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]';

export const primaryButtonClass =
  'flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50';

export const secondaryButtonClass =
  'px-4 py-2 text-sm font-semibold rounded-lg text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-100 dark:hover:bg-[#2B3A44] transition cursor-pointer';

type ModalShellProps = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg';
};

/** Overlay + card + header with close button, matching the app's existing modals. */
export function ModalShell({ title, subtitle, onClose, children, size = 'md' }: ModalShellProps) {
  return (
    <DialogFrame
      onClose={onClose}
      label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div
        className={`bg-white dark:bg-[#18232A] rounded-2xl w-full ${
          size === 'lg' ? 'max-w-2xl' : 'max-w-md'
        } max-h-[92vh] flex flex-col shadow-2xl border border-[#D5DDE3] dark:border-[#2B3A44] overflow-hidden`}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[#D5DDE3] dark:border-[#2B3A44]">
          <div>
            <h2 className="text-lg font-bold text-[#1B2B34] dark:text-[#E6EDF1]">{title}</h2>
            {subtitle && <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </DialogFrame>
  );
}

type FieldProps = {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
};

export function Field({ label, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8]">{label}</span>
        {hint && <span className="text-xs text-[#2E3F8F] dark:text-[#7D8CE8] font-medium">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="p-3 text-xs sm:text-sm font-medium bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73] rounded-lg border border-[#B4341F]/20"
    >
      {message}
    </div>
  );
}
