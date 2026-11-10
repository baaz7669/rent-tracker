import { AppSettings, Payment } from '../types';
import { paymentMethodLabel, paymentState, receiptLabel } from './payments';
import { formatMoney } from './format';
import { MessageTemplates, renderMessage } from './templates';
import { whatsAppUrl } from './whatsapp';

export interface ReceiptContext {
  payment: Payment;
  tenantName: string;
  tenantPhone?: string;
  unitLabel: string; // "Building · Unit"
  currency: string;
  settings: Pick<AppSettings, 'landlord' | 'receiptPrefix' | 'messageTemplates'>;
  /** Outstanding balance for this tenancy as of `asOf`. */
  balanceAfter: number;
  asOf: string; // YYYY-MM-DD
}

export function receiptNumberText(ctx: Pick<ReceiptContext, 'payment' | 'settings'>): string {
  return receiptLabel(ctx.payment, ctx.settings) || 'No receipt number';
}

/** Plain-text receipt for WhatsApp (WhatsApp links cannot attach files). */
export function buildReceiptMessage(ctx: ReceiptContext): string {
  const { payment: p, currency } = ctx;
  const state = paymentState(p);
  const amount = `${formatMoney(p.amount, currency)}`;
  const landlordLine = ctx.settings.landlord?.name
    ? `${ctx.settings.landlord.name}${ctx.settings.landlord.phone ? ` (${ctx.settings.landlord.phone})` : ''}`
    : '';
  const balanceLine =
    ctx.balanceAfter > 0
      ? `Balance outstanding as of ${ctx.asOf}: ${formatMoney(ctx.balanceAfter, currency)}`
      : `All dues paid as of ${ctx.asOf}. Thank you!`;

  // Normal receipts use the editable template; void / pending / bounced keep their fixed, careful wording.
  if (state === 'received') {
    const method = paymentMethodLabel(p);
    return renderMessage(
      'receipt',
      {
        receipt_no: receiptNumberText(ctx),
        tenant: ctx.tenantName,
        amount,
        unit: ctx.unitLabel,
        date: p.date,
        method: method ? `${method}${p.cheque?.bank ? `, ${p.cheque.bank}` : ''}` : '',
        balance_line: balanceLine,
        landlord: landlordLine
      },
      ctx.settings.messageTemplates as MessageTemplates | undefined
    );
  }

  const lines: string[] = [];

  if (state === 'void') {
    lines.push(`Receipt ${receiptNumberText(ctx)} is VOID and no longer valid.`);
  } else {
    lines.push(`Receipt ${receiptNumberText(ctx)}`);
    lines.push(
      state === 'pending'
        ? `Received from ${ctx.tenantName}: cheque for ${amount} for ${ctx.unitLabel}, dated ${p.cheque?.date}. It counts as paid once it clears.`
        : `Received with thanks from ${ctx.tenantName}: ${amount} for ${ctx.unitLabel} on ${p.date}.`
    );
    const method = paymentMethodLabel(p);
    if (method) lines.push(`Paid by: ${method}${p.cheque?.bank ? `, ${p.cheque.bank}` : ''}`);
    if (state === 'bounced') lines.push('Note: this cheque bounced and has not been paid.');
    lines.push(
      ctx.balanceAfter > 0
        ? `Balance outstanding as of ${ctx.asOf}: ${formatMoney(ctx.balanceAfter, currency)}`
        : `All dues paid as of ${ctx.asOf}. Thank you!`
    );
  }

  const landlord = ctx.settings.landlord;
  if (landlord?.name) lines.push(`— ${landlord.name}${landlord.phone ? ` (${landlord.phone})` : ''}`);
  return lines.join('\n');
}

/** wa.me link with the receipt text, or null when the tenant has no usable phone number. */
export function receiptWhatsAppUrl(ctx: ReceiptContext): string | null {
  return whatsAppUrl(ctx.tenantPhone, buildReceiptMessage(ctx));
}

export function receiptFilename(ctx: Pick<ReceiptContext, 'payment' | 'settings' | 'tenantName'>): string {
  const safe = `${receiptNumberText(ctx)} ${ctx.tenantName}`.replace(/[\\/:*?"<>|]/g, '-').trim();
  return `Receipt ${safe}.pdf`;
}
