import { AppSettings, Payment, PaymentMethod } from '../types';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'transfer', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
];

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  transfer: 'Bank transfer',
  cheque: 'Cheque',
  card: 'Card',
  deposit: 'From deposit',
  other: 'Other',
};

export function paymentMethodLabel(p: Pick<Payment, 'method' | 'cheque' | 'reference'>): string {
  if (!p.method) return '';
  let label = METHOD_LABELS[p.method] || 'Other';
  if (p.method === 'cheque' && p.cheque?.number) label += ` #${p.cheque.number}`;
  if (p.reference && p.method !== 'cheque') label += ` (${p.reference})`;
  return label;
}

/** "RT-000042" style receipt number; prefix defaults to "R-". */
export function formatReceiptNo(n: number, prefix?: string): string {
  return `${prefix ?? 'R-'}${String(n).padStart(6, '0')}`;
}

/**
 * Receipt number as printed. Uses the prefix stored on the payment when it was issued, so a later
 * prefix change never alters receipts already handed out. Empty string when no number was issued.
 */
export function receiptLabel(
  p: Pick<Payment, 'receiptNo' | 'receiptPrefix'>,
  settings: Pick<AppSettings, 'receiptPrefix'>
): string {
  if (!p.receiptNo) return '';
  return formatReceiptNo(p.receiptNo, p.receiptPrefix ?? settings.receiptPrefix);
}

export type PaymentState = 'received' | 'pending' | 'bounced' | 'void';

export function paymentState(p: Pick<Payment, 'voidedAt' | 'cheque'>): PaymentState {
  if (p.voidedAt) return 'void';
  if (p.cheque?.status === 'pending') return 'pending';
  if (p.cheque?.status === 'bounced') return 'bounced';
  return 'received';
}

/** Next cheque number: increments numeric numbers keeping their width ("000123" → "000124"). */
export function nextChequeNumber(number: string, step = 1): string {
  const match = number.match(/^(.*?)(\d+)$/);
  if (!match) return number;
  const [, prefix, digits] = match;
  const next = String(Number(digits) + step).padStart(digits.length, '0');
  return `${prefix}${next}`;
}

export interface ChequeSeriesInput {
  count: number;
  firstNumber: string;
  firstDate: string; // YYYY-MM-DD
  everyMonths: number;
}

/**
 * A run of post-dated cheques (e.g. 12 monthly cheques handed over at signing):
 * numbers increment, dates step by the payment cycle (month-end dates clamp).
 */
export function buildChequeSeries(
  input: ChequeSeriesInput,
  addMonths: (date: string, months: number) => string
): { number: string; date: string }[] {
  const count = Math.max(1, Math.min(60, Math.floor(input.count)));
  return Array.from({ length: count }, (_, i) => ({
    number: nextChequeNumber(input.firstNumber, i),
    date: addMonths(input.firstDate, i * input.everyMonths),
  }));
}

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  received: 'Received',
  pending: 'Cheque pending',
  bounced: 'Bounced',
  void: 'Void',
};
