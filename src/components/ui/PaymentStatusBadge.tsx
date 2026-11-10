import type { Payment } from '../../types';
import { PAYMENT_STATE_LABELS, paymentState } from '../../logic/payments';

const STYLES = {
  received: 'bg-[#E8F7EE] dark:bg-[#143523] text-[#1F7A4D] dark:text-[#6CD39B]',
  pending: 'bg-[#FEF8E7] dark:bg-[#382B0E] text-[#9A6A00] dark:text-[#F0C15A]',
  bounced: 'bg-[#FDEDEB] dark:bg-[#381A15] text-[#B4341F] dark:text-[#FF8A73]',
  void: 'bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] line-through',
} as const;

export function PaymentStatusBadge({ payment }: { payment: Payment }) {
  const state = paymentState(payment);
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded font-medium whitespace-nowrap ${STYLES[state]}`}>
      {PAYMENT_STATE_LABELS[state]}
    </span>
  );
}
