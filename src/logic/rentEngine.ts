import { DueItem, LeaseAlert, Payment, PropertyType, RentChange, Unit, UnitCalculation, UnitStatus } from '../types';
import { formatMoney } from './format';
import { MessageTemplates, renderMessage } from './templates';
import { normalizeWhatsAppPhone, whatsAppUrl } from './whatsapp';

export function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split('-').map(Number);
  return {
    year: parts[0] || 2026,
    month: parts[1] || 1,
    day: parts[2] || 1
  };
}

export function daysBetween(dateStrA: string, dateStrB: string): number {
  // Returns dateStrA minus dateStrB in days
  const [yA, mA, dA] = dateStrA.split('-').map(Number);
  const [yB, mB, dB] = dateStrB.split('-').map(Number);
  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((utcA - utcB) / msPerDay);
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const newY = date.getUTCFullYear();
  const newM = String(date.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(date.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

export function addMonthsClamped(dateStr: string, monthsToAdd: number): string {
  const { year: y, month: m, day: targetDay } = parseDate(dateStr);
  const newMonthZero = (m - 1) + monthsToAdd;
  const newYear = y + Math.floor(newMonthZero / 12);
  const newMonth = ((newMonthZero % 12) + 12) % 12; // 0..11
  // Days in target month
  const daysInTargetMonth = new Date(newYear, newMonth + 1, 0).getDate();
  const clampedDay = Math.min(targetDay, daysInTargetMonth);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${newYear}-${pad(newMonth + 1)}-${pad(clampedDay)}`;
}

/** Rent history sorted oldest-first; never mutates the unit. */
export function sortedRentHistory(unit: Unit): RentChange[] {
  if (!unit.rentHistory || unit.rentHistory.length === 0) return [];
  return [...unit.rentHistory].sort((a, b) => a.from.localeCompare(b.from));
}

/** The rent that applies to a due falling on `dueDate`. */
export function rentForDueDate(unit: Unit, dueDate: string): number {
  const history = sortedRentHistory(unit);
  if (history.length === 0) return unit.rent;
  let rent = history[0].rent;
  for (const change of history) {
    if (change.from <= dueDate) rent = change.rent;
    else break;
  }
  return rent;
}

/**
 * Returns a copy of the unit with `newRent` taking effect from `effectiveFrom`.
 * Past dues keep their old amount. A change on the same date replaces the earlier entry.
 */
export function applyRentChange(unit: Unit, newRent: number, effectiveFrom: string): Unit {
  const base = sortedRentHistory(unit);
  const history = base.length > 0 ? base : [{ from: unit.firstDue, rent: unit.rent }];
  const next = [...history.filter(c => c.from !== effectiveFrom), { from: effectiveFrom, rent: newRent }]
    .sort((a, b) => a.from.localeCompare(b.from));
  const latest = next[next.length - 1];
  return { ...unit, rentHistory: next, rent: latest.rent };
}

/**
 * Applies an edit to a unit.
 * - Rent changed + `rentEffectiveFrom` given: new rent applies from that date; earlier dues keep the old rent.
 * - Rent changed without a date: treated as a correction, so every due (past and future) uses the new rent.
 * - First due moved while there is a single rent entry: that entry moves with it.
 */
export function mergeUnitUpdate(unit: Unit, partial: Partial<Unit>, rentEffectiveFrom?: string): Unit {
  const merged: Unit = { ...unit, ...partial };
  const rentChanged = partial.rent !== undefined && partial.rent !== unit.rent;

  if (rentChanged && rentEffectiveFrom) {
    return applyRentChange({ ...merged, rent: unit.rent }, partial.rent as number, rentEffectiveFrom);
  }
  if (rentChanged) {
    return { ...merged, rentHistory: [{ from: merged.firstDue, rent: merged.rent }] };
  }
  if (partial.firstDue && merged.rentHistory && merged.rentHistory.length === 1) {
    return { ...merged, rentHistory: [{ from: merged.firstDue, rent: merged.rentHistory[0].rent }] };
  }
  return merged;
}

/** First rent due date on or after `dateStr` (used as the default effective date for a rent change). */
export function nextDueDateOnOrAfter(unit: Unit, dateStr: string): string {
  const every = unit.every || 1;
  for (let step = 0; step < 360; step++) {
    const due = addMonthsClamped(unit.firstDue, step * every);
    if (due >= dateStr) return due;
  }
  return dateStr;
}

export function generateDueDates(unit: Unit, todayStr: string): DueItem[] {
  const items: DueItem[] = [];
  const opening = Number(unit.opening) || 0;
  const firstDue = unit.firstDue || todayStr;
  const every = unit.every || 1;

  if (opening > 0) {
    items.push({
      id: `${unit.id}-prev-balance`,
      unitId: unit.id,
      label: 'Previous balance',
      dueDate: firstDue,
      amount: opening,
      paid: 0,
      remaining: opening,
      isPreviousBalance: true,
    });
  }

  let step = 0;
  const MAX_CYCLES = 360;

  while (step < MAX_CYCLES) {
    const dueDate = addMonthsClamped(firstDue, step * every);
    // After move-out no further rent falls due (a due on the move-out day itself is not charged).
    if (unit.endedAt && dueDate >= unit.endedAt) {
      break;
    }
    items.push({
      id: `${unit.id}-due-${step}-${dueDate}`,
      unitId: unit.id,
      label: 'Rent',
      dueDate,
      amount: rentForDueDate(unit, dueDate),
      paid: 0,
      remaining: rentForDueDate(unit, dueDate),
    });

    // "generated up to and including the first due date that is after today."
    if (dueDate > todayStr) {
      break;
    }
    step++;
  }

  for (const charge of unit.charges || []) {
    const amount = Number(charge.amount) || 0;
    if (amount <= 0) continue;
    items.push({
      id: `${unit.id}-charge-${charge.id}`,
      unitId: unit.id,
      label: charge.label || 'Charge',
      dueDate: charge.date,
      amount,
      paid: 0,
      remaining: amount,
      chargeId: charge.id,
    });
  }

  // Oldest first; the sort is stable, so on the same date previous balance comes before rent, then charges.
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Whether a payment belongs to the tenancy shown in this unit view. */
export function paymentBelongsTo(p: Payment, unit: Unit): boolean {
  if (unit.tenancyId && p.tenancyId) return p.tenancyId === unit.tenancyId;
  return p.unitId === unit.id;
}

/** Voided payments never count; cheques count only once cleared. */
export function paymentCounts(p: Payment): boolean {
  if (p.voidedAt) return false;
  if (p.cheque && p.cheque.status !== 'cleared') return false;
  return true;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function calculateUnit(unit: Unit, payments: Payment[], todayStr: string = getTodayStr()): UnitCalculation {
  const ownPayments = payments.filter(p => paymentBelongsTo(p, unit));
  const pendingChequeTotal = round3(
    ownPayments
      .filter(p => !p.voidedAt && p.cheque?.status === 'pending')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  );

  if (unit.isVacant) {
    return {
      unit,
      dueItems: [],
      totalDue: 0,
      totalPaid: 0,
      balance: 0,
      advanceCredit: 0,
      status: 'vacant',
      statusLabel: 'Vacant',
      pendingChequeTotal: 0,
    };
  }

  const unitPayments = ownPayments
    .filter(paymentCounts)
    .sort((a, b) => (a.date === b.date ? a.ts - b.ts : a.date.localeCompare(b.date)));

  const totalPaidMoney = round3(unitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const dueItems = generateDueDates(unit, todayStr);

  let remainingPayment = totalPaidMoney;
  let totalDue = 0;

  for (const item of dueItems) {
    totalDue += item.amount;
    const payTowards = Math.min(item.remaining, remainingPayment);
    item.paid = Math.round((item.paid + payTowards) * 1000) / 1000;
    item.remaining = Math.round((item.amount - item.paid) * 1000) / 1000;
    remainingPayment = Math.max(0, Math.round((remainingPayment - payTowards) * 1000) / 1000);
  }

  const advanceCredit = Math.max(0, remainingPayment);

  // Balance: "Sum of (amount - paid) for all items with due date on or before today."
  const balance = dueItems
    .filter(item => item.dueDate <= todayStr)
    .reduce((sum, item) => sum + item.remaining, 0);

  // Find oldest unpaid item
  const unpaidItems = dueItems.filter(item => item.remaining > 0);
  const oldestUnpaidBeforeToday = unpaidItems.find(item => item.dueDate < todayStr);
  const oldestUnpaidToday = unpaidItems.find(item => item.dueDate === todayStr);
  const nextUpcomingItem = dueItems.find(item => item.dueDate > todayStr && item.remaining > 0);

  let status: UnitStatus = 'ok';
  let statusLabel = 'Paid up';
  let daysOverdue: number | undefined;
  let daysUntilDue: number | undefined;

  const sevenDaysFromNow = addDays(todayStr, 7);

  if (oldestUnpaidBeforeToday) {
    status = 'overdue';
    daysOverdue = daysBetween(todayStr, oldestUnpaidBeforeToday.dueDate);
    statusLabel = daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`;
  } else if (oldestUnpaidToday) {
    status = 'today';
    statusLabel = 'Due today';
  } else if (nextUpcomingItem && nextUpcomingItem.dueDate <= sevenDaysFromNow) {
    status = 'soon';
    daysUntilDue = daysBetween(nextUpcomingItem.dueDate, todayStr);
    if (daysUntilDue === 0) {
      statusLabel = 'Due today';
    } else if (daysUntilDue === 1) {
      statusLabel = 'Due tomorrow';
    } else {
      statusLabel = `Due in ${daysUntilDue} days`;
    }
  } else {
    status = 'ok';
    if (advanceCredit > 0) {
      statusLabel = 'Advance credit';
    } else {
      statusLabel = 'All paid';
    }
  }

  // Find part-paid note if any
  let partPaidNote: string | undefined;
  const partPaidItem = dueItems.find(item => item.paid > 0 && item.remaining > 0);
  if (partPaidItem) {
    partPaidNote = `Part-paid: ${partPaidItem.paid} paid towards ${partPaidItem.label === 'Previous balance' ? 'previous balance' : partPaidItem.dueDate}`;
  }

  return {
    unit,
    dueItems,
    totalDue,
    totalPaid: totalPaidMoney,
    balance: Math.max(0, Math.round(balance * 1000) / 1000),
    advanceCredit: Math.round(advanceCredit * 1000) / 1000,
    status,
    statusLabel,
    daysOverdue,
    daysUntilDue,
    oldestUnpaidItem: oldestUnpaidBeforeToday || oldestUnpaidToday,
    nextUpcomingItem,
    partPaidNote,
    pendingChequeTotal
  };
}

/** @deprecated use normalizeWhatsAppPhone from ./whatsapp */
export function formatWhatsAppPhone(phone: string): string {
  return normalizeWhatsAppPhone(phone);
}

/** The reminder text for a unit's current state, using the saved template (or the default). */
export function buildReminderMessage(
  unit: Unit,
  calc: UnitCalculation,
  currency: string,
  templates?: MessageTemplates,
  landlordName?: string
): string {
  const base = { tenant: unit.tenant, unit: `${unit.building} · ${unit.name}`, landlord: landlordName };
  if (calc.status === 'overdue' || calc.status === 'today') {
    return renderMessage(
      'reminder_overdue',
      { ...base, amount: formatMoney(calc.balance, currency), due_date: calc.oldestUnpaidItem?.dueDate || unit.firstDue },
      templates
    );
  }
  if (calc.status === 'soon') {
    return renderMessage(
      'reminder_upcoming',
      {
        ...base,
        amount: formatMoney(calc.nextUpcomingItem?.remaining || unit.rent, currency),
        due_date: calc.nextUpcomingItem?.dueDate || ''
      },
      templates
    );
  }
  return renderMessage('paid_up', base, templates);
}

export function buildWhatsAppLink(
  unit: Unit,
  calc: UnitCalculation,
  currency: string,
  templates?: MessageTemplates,
  landlordName?: string
): { url: string; disabled: boolean; disabledReason?: string } {
  if (!unit.phone || !unit.phone.trim()) {
    return { url: '', disabled: true, disabledReason: 'No phone number' };
  }
  const url = whatsAppUrl(unit.phone, buildReminderMessage(unit, calc, currency, templates, landlordName));
  if (!url) {
    return { url: '', disabled: true, disabledReason: 'Invalid phone' };
  }
  return { url, disabled: false };
}

export function getLeaseAlerts(units: Unit[], todayStr: string = getTodayStr()): LeaseAlert[] {
  const alerts: LeaseAlert[] = [];

  for (const unit of units) {
    if (!unit.leaseEnd || !unit.leaseEnd.trim()) continue;
    const daysDiff = daysBetween(unit.leaseEnd, todayStr);
    // Ending within next 90 days (daysDiff <= 90) or already passed (daysDiff < 0)
    if (daysDiff <= 90) {
      alerts.push({
        unit,
        leaseEnd: unit.leaseEnd,
        daysDiff,
        isEnded: daysDiff < 0,
        isUrgent: daysDiff <= 30 // Red if 30 days or fewer or ended, amber otherwise
      });
    }
  }

  // Soonest first (most overdue / least daysDiff first)
  alerts.sort((a, b) => a.daysDiff - b.daysDiff);
  return alerts;
}

export interface BulkImportResult {
  units: Omit<Unit, 'id'>[];
  skippedRows: { rowNumber: number; reason: string; text: string }[];
}

export function parseBulkImport(text: string, currentMonthFirstDay: string): BulkImportResult {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const units: Omit<Unit, 'id'>[] = [];
  const skippedRows: { rowNumber: number; reason: string; text: string }[] = [];

  const splitRow = (line: string): string[] => {
    if (line.includes('\t')) {
      return line.split('\t').map(c => c.trim());
    }
    // Simple CSV parser supporting quotes
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  let startIndex = 0;
  if (lines.length > 0) {
    const firstCols = splitRow(lines[0]);
    if (firstCols[0] && firstCols[0].toLowerCase().trim() === 'building') {
      startIndex = 1;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const rowNum = i + 1;
    const line = lines[i];
    const cols = splitRow(line);

    const building = cols[0] || '';
    const unitName = cols[1] || '';
    const rawType = cols[2] || 'Flat';
    const tenant = cols[3] || '';
    const phone = cols[4] || '';
    const rentStr = cols[5] || '';
    const everyStr = cols[6] || '1';
    const firstDueStr = cols[7] || '';
    const leaseEndStr = cols[8] || '';

    // "Skip rows where rent is not a number or both Unit and Tenant are empty, and report the skipped row numbers."
    const rentNum = parseFloat(rentStr.replace(/[^\d.-]/g, ''));
    if (isNaN(rentNum) || rentNum < 0) {
      skippedRows.push({
        rowNumber: rowNum,
        reason: 'Rent must be a valid number',
        text: line
      });
      continue;
    }

    if (!unitName && !tenant) {
      skippedRows.push({
        rowNumber: rowNum,
        reason: 'Both Unit and Tenant cannot be empty',
        text: line
      });
      continue;
    }

    // Default every: if pays-every is not one of 1, 3, 6, 12 use 1
    const rawEvery = parseInt(everyStr, 10);
    const every: 1 | 3 | 6 | 12 = ([1, 3, 6, 12].includes(rawEvery) ? rawEvery : 1) as 1 | 3 | 6 | 12;

    // Type normalization
    let type: PropertyType = 'Flat';
    const lowerType = rawType.toLowerCase();
    if (lowerType.includes('shop')) type = 'Shop';
    else if (lowerType.includes('office')) type = 'Office';
    else if (lowerType.includes('flat') || lowerType.includes('apt')) type = 'Flat';
    else if (['flat', 'shop', 'office', 'other'].includes(lowerType)) {
      type = (rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase()) as PropertyType;
    } else {
      type = 'Other';
    }

    // First due date: "If first due date is missing or invalid use the first day of the current month."
    let firstDue = firstDueStr;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) {
      firstDue = currentMonthFirstDay;
    }

    let leaseEnd: string | undefined = undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(leaseEndStr)) {
      leaseEnd = leaseEndStr;
    }

    units.push({
      building: building || 'Main Building',
      name: unitName || `Unit ${rowNum}`,
      type,
      tenant: tenant || 'Occupant',
      phone,
      rent: rentNum,
      every,
      firstDue,
      opening: 0,
      leaseEnd,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  return { units, skippedRows };
}
