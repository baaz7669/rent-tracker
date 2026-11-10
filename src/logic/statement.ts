import { Payment, Unit } from '../types';
import { generateDueDates, paymentBelongsTo, paymentCounts } from './rentEngine';
import { paymentMethodLabel, paymentState } from './payments';
import { formatMoney } from './format';
import { MessageTemplates, renderMessage } from './templates';

export interface StatementLine {
  date: string; // YYYY-MM-DD
  description: string;
  charge: number; // amount owed added on this line (0 for payments)
  payment: number; // amount paid on this line (0 for charges)
  balance: number; // running balance after this line (negative = in credit)
}

export interface Statement {
  lines: StatementLine[];
  totalCharged: number;
  totalPaid: number;
  closingBalance: number; // negative = tenant in credit
  /** Cheques received but not cleared yet; not included in the balance. */
  pendingCheques: { date: string; description: string; amount: number }[];
  asOf: string;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * A tenancy's account: every amount that has fallen due (rent, previous balance, charges) up to `asOf`
 * and every payment that counts, in date order, with a running balance.
 * On the same date, amounts owed are listed before payments.
 */
export function buildStatement(unit: Unit, payments: Payment[], asOf: string): Statement {
  type Entry = { date: string; order: number; description: string; charge: number; payment: number };
  const entries: Entry[] = [];

  if (!unit.isVacant) {
    for (const item of generateDueDates(unit, asOf)) {
      if (item.dueDate > asOf) continue; // not due yet
      const description = item.isPreviousBalance
        ? 'Previous balance brought forward'
        : item.chargeId
          ? item.label
          : `Rent due ${item.dueDate}`;
      entries.push({ date: item.dueDate, order: 0, description, charge: item.amount, payment: 0 });
    }
  }

  const own = payments.filter((p) => paymentBelongsTo(p, unit));
  for (const p of own.filter(paymentCounts)) {
    if (p.date > asOf) continue;
    const method = paymentMethodLabel(p);
    entries.push({
      date: p.date,
      order: 1,
      description: method ? `Payment received (${method})` : 'Payment received',
      charge: 0,
      payment: Number(p.amount) || 0
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  let balance = 0;
  const lines: StatementLine[] = entries.map((e) => {
    balance = round3(balance + e.charge - e.payment);
    return { date: e.date, description: e.description, charge: e.charge, payment: e.payment, balance };
  });

  const pendingCheques = own
    .filter((p) => paymentState(p) === 'pending')
    .map((p) => ({ date: p.cheque?.date || p.date, description: paymentMethodLabel(p) || 'Cheque', amount: Number(p.amount) || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    lines,
    totalCharged: round3(entries.reduce((s, e) => s + e.charge, 0)),
    totalPaid: round3(entries.reduce((s, e) => s + e.payment, 0)),
    closingBalance: balance,
    pendingCheques,
    asOf
  };
}

/** Short WhatsApp summary of a statement. */
export function buildStatementMessage(
  unit: Unit,
  statement: Statement,
  currency: string,
  landlordName?: string,
  templates?: MessageTemplates
): string {
  const money = (n: number) => `${formatMoney(Math.abs(n), currency)}`;
  const pendingTotal = statement.pendingCheques.reduce((s, c) => s + c.amount, 0);
  return renderMessage(
    'statement',
    {
      tenant: unit.tenant,
      unit: `${unit.building} · ${unit.name}`,
      date: statement.asOf,
      total_due: money(statement.totalCharged),
      total_paid: money(statement.totalPaid),
      balance_line:
        statement.closingBalance > 0
          ? `Balance outstanding: ${money(statement.closingBalance)}`
          : statement.closingBalance < 0
            ? `You are in credit by ${money(statement.closingBalance)}`
            : 'Nothing is outstanding. Thank you!',
      pending_cheques_line:
        statement.pendingCheques.length > 0
          ? `Cheques awaiting clearance: ${statement.pendingCheques.length} (${money(pendingTotal)})`
          : '',
      landlord: landlordName
    },
    templates
  );
}
