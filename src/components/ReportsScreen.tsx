import { useMemo, useState } from 'react';
import { FileDown, Info, Printer, Sheet } from 'lucide-react';
import { arrearsCsv, buildingsCsv, downloadCsv, monthlyCsv } from '../logic/csvExport';
import { canSavePdf, printDocument, saveDocumentPdf } from '../logic/print';
import { PrintPortal } from './ui/PrintPortal';
import { ReportDocument } from './ReportDocument';
import { useApp } from '../context/AppContext';
import { getTodayStr } from '../logic/rentEngine';
import {
  AGE_BUCKETS,
  arrearsAgeing,
  buildingSummary,
  monthlySummary,
  occupancy,
  Period,
  PeriodPreset,
  periodTotals,
  presetPeriod,
  tenancyEntries
} from '../logic/reports';
import { depositsHeld } from '../logic/tenancy';
import type { Unit } from '../types';
import { ColumnChart } from './charts/ColumnChart';
import { ExpensesSection } from './ExpensesSection';
import { StatementModal } from './modals/StatementModal';
import { formatMoney, formatAmount } from '../logic/format';

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_3', label: '3 months' },
  { value: 'last_6', label: '6 months' },
  { value: 'last_12', label: '12 months' },
  { value: 'this_year', label: 'This year' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const card = 'p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs';
const th = 'py-1.5 pr-3 font-semibold text-[#5E6E78] dark:text-[#8E9EA8]';
const td = 'py-1.5 pr-3 tabular-nums text-[#1B2B34] dark:text-[#E6EDF1]';
const toolButton =
  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] cursor-pointer min-h-0';

export function ReportsScreen() {
  const { db, currency, settings } = useApp();
  const today = getTodayStr();
  const [preset, setPreset] = useState<PeriodPreset | 'custom'>('last_6');
  const [custom, setCustom] = useState<Period>(presetPeriod('last_6', today));
  const [statementUnit, setStatementUnit] = useState<Unit | null>(null);

  const period = preset === 'custom' ? custom : presetPeriod(preset, today);
  const isValidPeriod = /^\d{4}-\d{2}-\d{2}$/.test(period.from) && /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to;

  const report = useMemo(() => {
    if (!isValidPeriod) return null;
    const months = monthlySummary(db, period);
    return {
      months,
      totals: periodTotals(months),
      ageing: arrearsAgeing(db, today),
      buildings: buildingSummary(db, period, today),
      occ: occupancy(db, period, today),
      deposits: depositsHeld(db.tenancies),
      views: new Map(tenancyEntries(db).map((e) => [e.tenancy.id, e.view]))
    };
  }, [db, period.from, period.to, today, isValidPeriod]);

  const money = (n: number) => `${formatMoney(n, currency)}`;
  // Chart axes use rounded numbers; tables use the currency's precision.
  const short = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const amt = (n: number) => formatAmount(n, currency);
  const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);

  return (
    <div className="space-y-6">
      {/* Period picker */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Report period" className="flex flex-wrap gap-1 bg-white dark:bg-[#18232A] p-1 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44]">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-0 ${
                preset === p.value
                  ? 'bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D]'
                  : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={preset === 'custom'}
            onClick={() => {
              setCustom(period);
              setPreset('custom');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer min-h-0 ${
              preset === 'custom'
                ? 'bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D]'
                : 'text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1]'
            }`}
          >
            Custom
          </button>
        </div>
        {preset === 'custom' ? (
          <span className="flex items-center gap-2 text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            <input
              type="date"
              aria-label="From"
              value={custom.from}
              onChange={(e) => setCustom({ ...custom, from: e.target.value })}
              className="px-2 py-1 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] min-h-0"
            />
            to
            <input
              type="date"
              aria-label="To"
              value={custom.to}
              onChange={(e) => setCustom({ ...custom, to: e.target.value })}
              className="px-2 py-1 rounded-lg border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#10181D] text-[#1B2B34] dark:text-[#E6EDF1] min-h-0"
            />
          </span>
        ) : (
          <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            {period.from} to {period.to}
          </span>
        )}
        {report && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => printDocument('A4')} className={toolButton}>
              <Printer className="w-3.5 h-3.5" /> Print report
            </button>
            {canSavePdf() && (
              <button
                type="button"
                onClick={() => saveDocumentPdf(`Rent report ${period.from} to ${period.to}.pdf`, 'A4')}
                className={toolButton}
              >
                <FileDown className="w-3.5 h-3.5" /> Save PDF
              </button>
            )}
            <button
              type="button"
              onClick={() => downloadCsv(`rent_report_months_${period.from}_${period.to}.csv`, monthlyCsv(report.months))}
              className={toolButton}
            >
              <Sheet className="w-3.5 h-3.5" /> Months CSV
            </button>
          </span>
        )}
      </div>

      {!report ? (
        <p className={`${card} text-sm text-[#B4341F] dark:text-[#FF8A73]`}>Choose a start date on or before the end date.</p>
      ) : (
        <>
          {/* Headline figures */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Collected" value={money(report.totals.collected)} sub={`of ${money(report.totals.due)} due`} />
            <Kpi
              label="Collection rate"
              value={pct(report.totals.collectionRate)}
              sub="Collected as % of due"
              hint="Cash basis: money received in the period (cleared cheques by cheque date) divided by rent and charges that fell due in the period. It can be over 100% when tenants pay off older arrears."
            />
            <Kpi label="Arrears today" value={money(report.ageing.total)} sub={`${report.ageing.rows.length} tenant(s) owe`} tone={report.ageing.total > 0 ? 'bad' : 'good'} />
            <Kpi label="Net income" value={money(report.totals.net)} sub={`after ${money(report.totals.expenses)} expenses`} tone={report.totals.net < 0 ? 'bad' : undefined} />
            <Kpi
              label="Occupancy now"
              value={pct(report.occ.rateNow)}
              sub={`${report.occ.occupiedNow} let · ${report.occ.vacantNow} vacant`}
            />
            <Kpi label="Occupancy in period" value={pct(report.occ.ratePeriod)} sub="Share of unit-days let" />
            <Kpi label="Deposits held" value={money(report.deposits)} sub="Owed back to current tenants" />
            <Kpi label="Expenses" value={money(report.totals.expenses)} sub="In period" />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className={card}>
              <ColumnChart
                title="Due vs collected by month"
                categories={report.months.map((m) => monthLabel(m.month))}
                series={[
                  { key: 'due', label: 'Due', color: 'var(--series-1)', values: report.months.map((m) => m.due) },
                  { key: 'collected', label: 'Collected', color: 'var(--series-2)', values: report.months.map((m) => m.collected) }
                ]}
                formatValue={short}
              />
            </div>
            <div className={card}>
              <ColumnChart
                title={`Net income by month (${currency})`}
                categories={report.months.map((m) => monthLabel(m.month))}
                series={[{ key: 'net', label: 'Net income', color: 'var(--series-1)', values: report.months.map((m) => m.net) }]}
                formatValue={short}
              />
            </div>
          </div>

          {/* Arrears by age */}
          <section aria-labelledby="ageing-heading" className={card}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 id="ageing-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                Who owes, and for how long
              </h3>
              <button
                type="button"
                onClick={() => downloadCsv(`rent_report_arrears_${today}.csv`, arrearsCsv(report.ageing.rows))}
                className={toolButton}
              >
                <Sheet className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mb-3">As of {today}. Click a row to open the tenant's statement.</p>
            {report.ageing.rows.length === 0 ? (
              <p className="text-sm text-[#1F7A4D] dark:text-[#6CD39B] font-semibold">Nobody owes anything. Well done.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-left border-b border-[#D5DDE3] dark:border-[#2B3A44]">
                      <th className={th}>Tenant</th>
                      <th className={th}>Unit</th>
                      {AGE_BUCKETS.map((b) => (
                        <th key={b} className={`${th} text-right`}>
                          {b}
                        </th>
                      ))}
                      <th className={`${th} text-right`}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ageing.rows.map((r) => (
                      <tr
                        key={r.tenancyId}
                        tabIndex={0}
                        onClick={() => setStatementUnit(report.views.get(r.tenancyId) || null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setStatementUnit(report.views.get(r.tenancyId) || null);
                        }}
                        className="border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60 hover:bg-gray-50 dark:hover:bg-[#1c2931] cursor-pointer"
                      >
                        <td className={td}>
                          {r.tenant}
                          {r.isFormerTenant && <span className="ml-1.5 text-[10px] font-semibold text-[#5E6E78] dark:text-[#8E9EA8]">(moved out)</span>}
                        </td>
                        <td className={td}>{r.unitLabel}</td>
                        {r.buckets.map((v, i) => (
                          <td key={i} className={`${td} text-right ${i === 3 && v > 0 ? 'font-bold text-[#B4341F] dark:text-[#FF8A73]' : ''}`}>
                            {v ? amt(v) : ''}
                          </td>
                        ))}
                        <td className={`${td} text-right font-bold`}>{amt(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td className={td} colSpan={2}>
                        Total ({currency})
                      </td>
                      {report.ageing.totals.map((v, i) => (
                        <td key={i} className={`${td} text-right`}>
                          {amt(v)}
                        </td>
                      ))}
                      <td className={`${td} text-right`}>{amt(report.ageing.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Buildings */}
          <section aria-labelledby="buildings-heading" className={card}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 id="buildings-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                Buildings ({currency}, {period.from} to {period.to})
              </h3>
              <button
                type="button"
                onClick={() => downloadCsv(`rent_report_buildings_${period.from}_${period.to}.csv`, buildingsCsv(report.buildings))}
                className={toolButton}
              >
                <Sheet className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-left border-b border-[#D5DDE3] dark:border-[#2B3A44]">
                    <th className={th}>Building</th>
                    <th className={`${th} text-right`}>Units</th>
                    <th className={`${th} text-right`}>Vacant</th>
                    <th className={`${th} text-right`}>Due</th>
                    <th className={`${th} text-right`}>Collected</th>
                    <th className={`${th} text-right`}>Arrears today</th>
                    <th className={`${th} text-right`}>Expenses</th>
                    <th className={`${th} text-right`}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.buildings.map((b) => (
                    <tr key={b.building} className="border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                      <td className={`${td} font-semibold`}>{b.building}</td>
                      <td className={`${td} text-right`}>{b.units}</td>
                      <td className={`${td} text-right`}>{b.vacant || ''}</td>
                      <td className={`${td} text-right`}>{amt(b.due)}</td>
                      <td className={`${td} text-right`}>{amt(b.collected)}</td>
                      <td className={`${td} text-right`}>{b.arrears ? amt(b.arrears) : ''}</td>
                      <td className={`${td} text-right`}>{b.expenses ? amt(b.expenses) : ''}</td>
                      <td className={`${td} text-right font-bold`}>{amt(b.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Vacancy */}
          <section aria-labelledby="vacancy-heading" className={card}>
            <h3 id="vacancy-heading" className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1] mb-3">
              Vacancy in period
            </h3>
            {report.occ.units.filter((u) => u.vacantDays > 0).length === 0 ? (
              <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8]">Every unit was let for the whole period.</p>
            ) : (
              <ul className="divide-y divide-[#D5DDE3] dark:divide-[#2B3A44] text-xs sm:text-sm">
                {report.occ.units
                  .filter((u) => u.vacantDays > 0)
                  .sort((a, b) => b.vacantDays - a.vacantDays)
                  .map((u) => (
                    <li key={u.unitId} className="py-2 flex items-center justify-between gap-3">
                      <span className="text-[#1B2B34] dark:text-[#E6EDF1]">
                        {u.unitLabel}
                        {u.isVacantNow && <span className="ml-2 text-[10px] font-bold text-[#9A6A00] dark:text-[#F0C15A]">VACANT NOW</span>}
                      </span>
                      <span className="tabular-nums text-[#5E6E78] dark:text-[#8E9EA8]">
                        {u.vacantDays} of {u.periodDays} days empty
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <ExpensesSection period={period} />

          <PrintPortal>
            <ReportDocument
              period={period}
              asOf={today}
              currency={currency}
              landlord={settings.landlord}
              totals={report.totals}
              months={report.months}
              arrears={report.ageing}
              buildings={report.buildings}
              occupancyNow={report.occ.rateNow}
              depositsHeld={report.deposits}
            />
          </PrintPortal>
        </>
      )}

      {statementUnit && <StatementModal unit={statementUnit} onClose={() => setStatementUnit(null)} />}
    </div>
  );
}

type KpiProps = { label: string; value: string; sub?: string; hint?: string; tone?: 'good' | 'bad' };

function Kpi({ label, value, sub, hint, tone }: KpiProps) {
  return (
    <div className="p-4 rounded-xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs">
      <div className="flex items-center gap-1 text-xs font-semibold text-[#5E6E78] dark:text-[#8E9EA8]">
        {label}
        {hint && (
          <span title={hint} aria-label={hint} className="cursor-help">
            <Info className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      <div
        className={`mt-1 text-lg sm:text-xl font-black tracking-tight ${
          tone === 'bad' ? 'text-[#B4341F] dark:text-[#FF8A73]' : tone === 'good' ? 'text-[#1F7A4D] dark:text-[#6CD39B]' : 'text-[#1B2B34] dark:text-[#E6EDF1]'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">{sub}</div>}
    </div>
  );
}
