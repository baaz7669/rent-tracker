import type { LandlordDetails } from '../types';
import { AGE_BUCKETS, ArrearsRow, BuildingRow, MonthRow, Period, PeriodTotals } from '../logic/reports';
import { formatAmount } from '../logic/format';

type Props = {
  period: Period;
  asOf: string;
  currency: string;
  landlord?: LandlordDetails;
  totals: PeriodTotals;
  months: MonthRow[];
  arrears: { rows: ArrearsRow[]; totals: [number, number, number, number]; total: number };
  buildings: BuildingRow[];
  occupancyNow: number | null;
  depositsHeld: number;
};

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const cell = 'py-1 pr-2 text-right tabular-nums';
const head = 'py-1 pr-2 font-semibold text-right';

/** Portfolio report for a period (A4), plain black-on-white for print and PDF. */
export function ReportDocument(p: Props) {
  const n = (v: number) => formatAmount(v, p.currency);
  return (
    <article className="report-doc bg-white text-black font-sans text-[10.5px] leading-snug p-6 max-w-[210mm] mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4 pb-3 border-b-2 border-black">
        <div>
          <div className="text-base font-black">{p.landlord?.name || 'Rent Tracker'}</div>
          {p.landlord?.address && <div className="whitespace-pre-line">{p.landlord.address}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-black tracking-wide">PORTFOLIO REPORT</div>
          <div>
            {p.period.from} to {p.period.to}
          </div>
          <div>Arrears and occupancy as of {p.asOf}</div>
        </div>
      </header>

      <section>
        <h4 className="font-bold mb-1">Summary ({p.currency})</h4>
        <table className="w-full border-collapse">
          <tbody>
            {[
              ['Rent and charges due', n(p.totals.due)],
              ['Collected (cleared money received)', n(p.totals.collected)],
              ['Collection rate', pct(p.totals.collectionRate)],
              ['Expenses', n(p.totals.expenses)],
              ['Net income (collected − expenses)', n(p.totals.net)],
              ['Arrears today', n(p.arrears.total)],
              ['Deposits held', n(p.depositsHeld)],
              ['Occupancy now', pct(p.occupancyNow)]
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-gray-300">
                <td className="py-1">{label}</td>
                <td className={cell}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4 className="font-bold mb-1">Month by month ({p.currency})</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-2 font-semibold text-left">Month</th>
              <th className={head}>Due</th>
              <th className={head}>Collected</th>
              <th className={head}>Expenses</th>
              <th className={head}>Net</th>
            </tr>
          </thead>
          <tbody>
            {p.months.map((m) => (
              <tr key={m.month} className="border-b border-gray-300">
                <td className="py-1">{m.month}</td>
                <td className={cell}>{n(m.due)}</td>
                <td className={cell}>{n(m.collected)}</td>
                <td className={cell}>{n(m.expenses)}</td>
                <td className={cell}>{n(m.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4 className="font-bold mb-1">Arrears by age ({p.currency})</h4>
        {p.arrears.rows.length === 0 ? (
          <p>Nothing is owed.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1 pr-2 font-semibold text-left">Tenant</th>
                <th className="py-1 pr-2 font-semibold text-left">Unit</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b} className={head}>
                    {b}
                  </th>
                ))}
                <th className={head}>Total</th>
              </tr>
            </thead>
            <tbody>
              {p.arrears.rows.map((r) => (
                <tr key={r.tenancyId} className="border-b border-gray-300">
                  <td className="py-1 pr-2">
                    {r.tenant}
                    {r.isFormerTenant ? ' (moved out)' : ''}
                  </td>
                  <td className="py-1 pr-2">{r.unitLabel}</td>
                  {r.buckets.map((v, i) => (
                    <td key={i} className={cell}>
                      {v ? n(v) : ''}
                    </td>
                  ))}
                  <td className={`${cell} font-bold`}>{n(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td className="py-1" colSpan={2}>
                  Total
                </td>
                {p.arrears.totals.map((v, i) => (
                  <td key={i} className={cell}>
                    {n(v)}
                  </td>
                ))}
                <td className={cell}>{n(p.arrears.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <section>
        <h4 className="font-bold mb-1">Buildings ({p.currency})</h4>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 pr-2 font-semibold text-left">Building</th>
              <th className={head}>Units</th>
              <th className={head}>Vacant</th>
              <th className={head}>Due</th>
              <th className={head}>Collected</th>
              <th className={head}>Arrears</th>
              <th className={head}>Expenses</th>
              <th className={head}>Net</th>
            </tr>
          </thead>
          <tbody>
            {p.buildings.map((b) => (
              <tr key={b.building} className="border-b border-gray-300">
                <td className="py-1 pr-2">{b.building}</td>
                <td className={cell}>{b.units}</td>
                <td className={cell}>{b.vacant}</td>
                <td className={cell}>{n(b.due)}</td>
                <td className={cell}>{n(b.collected)}</td>
                <td className={cell}>{n(b.arrears)}</td>
                <td className={cell}>{n(b.expenses)}</td>
                <td className={cell}>{n(b.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="text-[9px] text-gray-600 flex justify-between pt-2 border-t border-gray-300">
        <span>Generated by Rent Tracker</span>
        <span>Collected = cleared money received in the period (cheques by cheque date).</span>
      </footer>
    </article>
  );
}
