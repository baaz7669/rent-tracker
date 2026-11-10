import { AppSettings, Payment, Tenancy, UnitRecord } from '../types';
import { receiptLabel } from './payments';

export type SearchResultKind = 'unit' | 'tenant' | 'receipt' | 'cheque';

export interface SearchResult {
  kind: SearchResultKind;
  /** Stable key for lists. */
  key: string;
  label: string;
  detail: string;
  unitId: string;
  paymentId?: string;
  score: number;
}

export interface SearchSource {
  units: UnitRecord[];
  tenancies: Tenancy[];
  payments: Payment[];
  settings: Pick<AppSettings, 'receiptPrefix'>;
}

export const MAX_RESULTS = 20;

/** 3 = whole value, 2 = starts with, 1 = contains, 0 = no match. Digits-only queries also match phones. */
function matchScore(value: string | undefined, q: string): number {
  if (!value) return 0;
  const v = value.toLowerCase();
  if (v === q) return 3;
  if (v.startsWith(q) || v.split(/[\s·,-]+/).some((w) => w.startsWith(q))) return 2;
  return v.includes(q) ? 1 : 0;
}

function digits(s: string | undefined): string {
  return (s || '').replace(/\D/g, '');
}

/** Finds tenants (current and former), units, phones, receipt numbers and cheque numbers. */
export function searchAll(query: string, src: SearchSource): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const qDigits = digits(q);
  const unitById = new Map(src.units.map((u) => [u.id, u]));
  const results: SearchResult[] = [];

  for (const u of src.units) {
    const score = Math.max(matchScore(`${u.building} · ${u.name}`, q), matchScore(u.name, q), matchScore(u.building, q));
    if (score) {
      results.push({ kind: 'unit', key: `u-${u.id}`, label: `${u.building} · ${u.name}`, detail: u.archivedAt ? 'Unit (archived)' : 'Unit', unitId: u.id, score });
    }
  }

  for (const t of src.tenancies) {
    const unit = unitById.get(t.unitId);
    if (!unit) continue;
    const phoneScore = qDigits.length >= 4 && digits(t.phone).includes(qDigits) ? 2 : 0;
    const score = Math.max(matchScore(t.tenant, q), matchScore(t.tenantIdNumber, q), phoneScore);
    if (score) {
      results.push({
        kind: 'tenant',
        key: `t-${t.id}`,
        label: t.tenant || 'Unnamed tenant',
        detail: `${unit.building} · ${unit.name}${t.endedAt ? ` · moved out ${t.endedAt}` : ''}`,
        unitId: unit.id,
        score: score + (t.endedAt ? 0 : 0.5) // current tenants before former ones
      });
    }
  }

  for (const p of src.payments) {
    const unit = unitById.get(p.unitId);
    if (!unit) continue;
    const receipt = receiptLabel(p, src.settings);
    const receiptScore = receipt ? Math.max(matchScore(receipt, q), qDigits.length >= 2 && digits(receipt).endsWith(qDigits) ? 2 : 0) : 0;
    if (receiptScore) {
      results.push({ kind: 'receipt', key: `r-${p.id}`, label: `Receipt ${receipt}`, detail: `${unit.building} · ${unit.name} · ${p.date}`, unitId: unit.id, paymentId: p.id, score: receiptScore });
    }
    const chequeScore = p.cheque ? matchScore(p.cheque.number, q) : 0;
    if (chequeScore) {
      results.push({ kind: 'cheque', key: `c-${p.id}`, label: `Cheque #${p.cheque!.number}`, detail: `${unit.building} · ${unit.name} · ${p.cheque!.date}`, unitId: unit.id, paymentId: p.id, score: chequeScore });
    }
  }

  return results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, MAX_RESULTS);
}

/** Simple list filter for screens: building, unit, tenant or phone digits contain the query. */
export function matchesUnitQuery(
  u: { building: string; name: string; tenant: string; phone: string },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  return (
    `${u.building} ${u.name} ${u.tenant}`.toLowerCase().includes(q) ||
    (qDigits.length >= 3 && u.phone.replace(/\D/g, '').includes(qDigits))
  );
}
