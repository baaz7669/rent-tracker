export type MessageTemplateKey =
  | 'reminder_overdue'
  | 'reminder_upcoming'
  | 'paid_up'
  | 'lease_renewal'
  | 'receipt'
  | 'statement';

export type MessageTemplates = Partial<Record<MessageTemplateKey, string>>;

interface TemplateSpec {
  key: MessageTemplateKey;
  title: string;
  description: string;
  fields: string[];
  defaultText: string;
}

/** Defaults reproduce the app's built-in wording exactly. */
export const TEMPLATE_SPECS: TemplateSpec[] = [
  {
    key: 'reminder_overdue',
    title: 'Reminder: rent overdue',
    description: 'Sent from "To collect" when rent is due today or overdue.',
    fields: ['tenant', 'unit', 'amount', 'due_date', 'landlord'],
    defaultText:
      'Hello {tenant}, a reminder that rent for {unit} is pending. Amount outstanding: {amount} (due since {due_date}). Please arrange payment at your earliest convenience. Thank you.'
  },
  {
    key: 'reminder_upcoming',
    title: 'Reminder: rent due soon',
    description: 'Sent when rent falls due within the next 7 days.',
    fields: ['tenant', 'unit', 'amount', 'due_date', 'landlord'],
    defaultText: 'Hello {tenant}, a friendly reminder that rent of {amount} for {unit} is due on {due_date}. Thank you.'
  },
  {
    key: 'paid_up',
    title: 'All paid',
    description: 'Sent when nothing is due.',
    fields: ['tenant', 'unit', 'landlord'],
    defaultText: 'Hello {tenant}, rent statement for {unit}: all current dues are paid. Thank you!'
  },
  {
    key: 'lease_renewal',
    title: 'Lease renewal',
    description: 'Sent from the Leases tab when a lease ends soon or has ended.',
    fields: ['tenant', 'unit', 'lease_end', 'lease_status', 'landlord'],
    defaultText:
      'Hello {tenant}, this is regarding your lease contract for {unit} which {lease_status} on {lease_end}. Please let us know if you wish to renew. Thank you.'
  },
  {
    key: 'receipt',
    title: 'Receipt',
    description: 'Sent with a receipt (void and pending-cheque receipts keep their own wording).',
    fields: ['tenant', 'unit', 'amount', 'date', 'receipt_no', 'method', 'balance_line', 'landlord'],
    defaultText:
      'Receipt {receipt_no}\nReceived with thanks from {tenant}: {amount} for {unit} on {date}.\nPaid by: {method}\n{balance_line}\n— {landlord}'
  },
  {
    key: 'statement',
    title: 'Statement summary',
    description: 'Sent with a tenant statement.',
    fields: ['tenant', 'unit', 'date', 'total_due', 'total_paid', 'balance_line', 'pending_cheques_line', 'landlord'],
    defaultText:
      'Hello {tenant}, here is your rent statement for {unit} as of {date}:\nTotal due: {total_due}\nTotal paid: {total_paid}\n{balance_line}\n{pending_cheques_line}\n— {landlord}'
  }
];

const SPEC_BY_KEY = new Map(TEMPLATE_SPECS.map((s) => [s.key, s]));
const FIELD_RE = /\{([a-z_]+)\}/g;
export const MAX_TEMPLATE_LENGTH = 1500;

export function templateSpec(key: MessageTemplateKey): TemplateSpec {
  return SPEC_BY_KEY.get(key)!;
}

/** The template in use: the saved one, or the default when none is saved or it is blank. */
export function activeTemplate(key: MessageTemplateKey, templates?: MessageTemplates): string {
  const saved = templates?.[key];
  return saved && saved.trim() ? saved : templateSpec(key).defaultText;
}

/** Field names used in a template that this message type does not know. */
export function unknownFields(key: MessageTemplateKey, text: string): string[] {
  const allowed = new Set(templateSpec(key).fields);
  const unknown = new Set<string>();
  for (const m of text.matchAll(FIELD_RE)) if (!allowed.has(m[1])) unknown.add(m[1]);
  return [...unknown];
}

/**
 * Fills a template. A line that uses a field with no value (e.g. no landlord name, no payment method)
 * is left out, so messages never end up with dangling "Paid by:" lines. Unknown fields are left as typed.
 */
export function renderTemplate(text: string, values: Record<string, string | undefined>): string {
  return text
    .split('\n')
    .filter((line) => {
      for (const m of line.matchAll(FIELD_RE)) {
        if (m[1] in values && !(values[m[1]] || '').trim()) return false;
      }
      return true;
    })
    .map((line) => line.replace(FIELD_RE, (whole, name: string) => (name in values ? values[name] || '' : whole)))
    .join('\n')
    .trim();
}

/** Renders one message type with the saved template (or default). */
export function renderMessage(
  key: MessageTemplateKey,
  values: Record<string, string | undefined>,
  templates?: MessageTemplates
): string {
  return renderTemplate(activeTemplate(key, templates), values);
}

/** Keeps only known template keys with sensible text (used when loading settings). */
export function cleanTemplates(raw: unknown): MessageTemplates | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: MessageTemplates = {};
  for (const spec of TEMPLATE_SPECS) {
    const v = (raw as Record<string, unknown>)[spec.key];
    if (typeof v === 'string' && v.trim()) out[spec.key] = v.slice(0, MAX_TEMPLATE_LENGTH);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Sample values for the settings preview. */
export const SAMPLE_VALUES: Record<string, string> = {
  tenant: 'Sara Al-Hinai',
  unit: 'Al Andalus Tower · Flat 101',
  amount: 'OMR 220',
  due_date: '2026-11-01',
  date: '2026-11-05',
  lease_end: '2026-12-31',
  lease_status: 'is expiring',
  receipt_no: 'R-000042',
  method: 'Bank transfer',
  balance_line: 'All dues paid as of 2026-11-05. Thank you!',
  total_due: 'OMR 2,640',
  total_paid: 'OMR 2,420',
  pending_cheques_line: 'Cheques awaiting clearance: 1 (OMR 220)',
  landlord: 'Hamed Al-Rawahi'
};
