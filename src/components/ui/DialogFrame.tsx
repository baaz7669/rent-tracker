import type { ReactNode } from 'react';
import { useModalA11y } from './useModalA11y';

type Props = {
  onClose: () => void;
  /** Accessible name of the dialog. */
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * Modal overlay with dialog semantics and keyboard behaviour (Esc closes, focus stays inside and
 * returns afterwards). Every modal in the app renders through this.
 */
export function DialogFrame({ onClose, label, className, children }: Props) {
  const ref = useModalA11y<HTMLDivElement>(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={className}>
      {children}
    </div>
  );
}
