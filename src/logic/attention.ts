import { Payment, Unit } from '../types';
import { calculateUnit, daysBetween } from './rentEngine';
import { paymentState } from './payments';
import { formatMoney } from './format';

export type AttentionKind = 'cheques_to_deposit' | 'long_overdue' | 'leases_ending' | 'vacant';
export type AttentionTarget = 'payments_cheques' | 'reports' | 'leases' | 'units';

export interface AttentionItem {
  kind: AttentionKind;
  /** Most urgent first. */
  priority: number;
  title: string;
  detail: string;
  actionLabel: string;
  target: AttentionTarget;
}

/** Tenants owing for longer than this many days are flagged. */
export const LONG_OVERDUE_DAYS = 30;
/** Leases ending within this many days (or already ended) are flagged. */
export const LEASE_WARNING_DAYS = 30;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What needs doing today, most urgent first. Empty when everything is in order. */
export function buildAttentionItems(units: Unit[], payments: Payment[], currency: string, today: string): AttentionItem[] {
  const items: AttentionItem[] = [];
  const active = units.filter((u) => !u.archivedAt);

  const toDeposit = payments.filter((p) => paymentState(p) === 'pending' && (p.cheque?.date || p.date) <= today);
  if (toDeposit.length > 0) {
    const total = toDeposit.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    items.push({
      kind: 'cheques_to_deposit',
      priority: 1,
      title: `${plural(toDeposit.length, 'cheque', 'cheques')} to deposit`,
      detail: `${formatMoney(total, currency)} dated today or earlier. Mark each one cleared once the bank pays it.`,
      actionLabel: 'Open cheques',
      target: 'payments_cheques'
    });
  }

  const longOverdue = active
    .filter((u) => !u.isVacant)
    .map((u) => calculateUnit(u, payments, today))
    .filter((c) => c.status === 'overdue' && (c.daysOverdue || 0) > LONG_OVERDUE_DAYS);
  if (longOverdue.length > 0) {
    const total = longOverdue.reduce((s, c) => s + c.balance, 0);
    const worst = longOverdue.reduce((a, b) => ((b.daysOverdue || 0) > (a.daysOverdue || 0) ? b : a));
    items.push({
      kind: 'long_overdue',
      priority: 2,
      title: `${plural(longOverdue.length, 'tenant', 'tenants')} overdue more than ${LONG_OVERDUE_DAYS} days`,
      detail: `${formatMoney(total, currency)} in total. Longest: ${worst.unit.tenant} (${worst.daysOverdue} days).`,
      actionLabel: 'See who owes',
      target: 'reports'
    });
  }

  const ending = active.filter(
    (u) => !u.isVacant && u.leaseEnd && daysBetween(u.leaseEnd, today) <= LEASE_WARNING_DAYS
  );
  if (ending.length > 0) {
    const ended = ending.filter((u) => u.leaseEnd! < today).length;
    items.push({
      kind: 'leases_ending',
      priority: 3,
      title: `${plural(ending.length, 'lease', 'leases')} ending within ${LEASE_WARNING_DAYS} days`,
      detail: ended > 0 ? `${ended} already ended. Agree a renewal or plan the move-out.` : 'Agree a renewal or plan the move-out.',
      actionLabel: 'Open leases',
      target: 'leases'
    });
  }

  const vacant = active.filter((u) => u.isVacant);
  if (vacant.length > 0) {
    items.push({
      kind: 'vacant',
      priority: 4,
      title: `${plural(vacant.length, 'unit is', 'units are')} vacant`,
      detail: vacant.slice(0, 3).map((u) => `${u.building} · ${u.name}`).join(', ') + (vacant.length > 3 ? ', …' : ''),
      actionLabel: 'Open units',
      target: 'units'
    });
  }

  return items.sort((a, b) => a.priority - b.priority);
}

/** One-line summary for a desktop notification, e.g. "3 cheques to deposit · 2 tenants overdue …". */
export function attentionSummary(items: AttentionItem[]): string {
  return items.map((i) => i.title).join(' · ');
}
