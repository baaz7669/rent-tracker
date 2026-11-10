import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a document straight into <body>, outside the app. It is hidden on screen and is the only
 * thing that prints while the body has the `print-doc` class (see index.css).
 */
export function PrintPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="print-doc-root">{children}</div>, document.body);
}
