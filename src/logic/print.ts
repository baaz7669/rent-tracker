/**
 * Printing of standalone documents (receipts, statements).
 * The document is rendered into a print-only root (see PrintPortal); while printing, the body gets
 * the `print-doc` class so CSS hides the app and shows only that root.
 */

export type PageSize = 'A4' | 'A5';

interface PdfBridge {
  savePdf: (opts: { filename: string; pageSize: PageSize }) => Promise<boolean>;
}

function pdfBridge(): PdfBridge | null {
  const api = typeof window !== 'undefined' ? window.rentAPI : undefined;
  return api && typeof api.savePdf === 'function' ? (api as unknown as PdfBridge) : null;
}

/** True when a one-click "Save as PDF" is available (Windows app). */
export function canSavePdf(): boolean {
  return pdfBridge() !== null;
}

function withPrintMode<T>(pageSize: PageSize, run: () => T): T {
  const body = document.body;
  body.classList.add('print-doc', `print-${pageSize.toLowerCase()}`);
  try {
    return run();
  } finally {
    // window.print() blocks until the dialog closes; PDF export awaits below before cleanup.
  }
}

function clearPrintMode() {
  document.body.classList.remove('print-doc', 'print-a4', 'print-a5');
}

/** Opens the system print dialog for the current print-only document. */
export function printDocument(pageSize: PageSize): void {
  withPrintMode(pageSize, () => window.print());
  clearPrintMode();
}

/** Saves the current print-only document as a PDF (Windows app). Resolves true if saved. */
export async function saveDocumentPdf(filename: string, pageSize: PageSize): Promise<boolean> {
  const bridge = pdfBridge();
  if (!bridge) return false;
  try {
    withPrintMode(pageSize, () => undefined);
    // Let the browser apply the print-mode classes before capturing.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return Boolean(await bridge.savePdf({ filename, pageSize }));
  } finally {
    clearPrintMode();
  }
}
