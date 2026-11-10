import { useEffect, useRef, useState } from 'react';

export interface ColumnSeries {
  key: string;
  label: string;
  /** CSS custom property holding the series colour, e.g. 'var(--series-1)'. */
  color: string;
  values: number[];
}

type Props = {
  title: string;
  /** Category labels along the x axis (e.g. "Jan 26"). */
  categories: string[];
  series: ColumnSeries[];
  formatValue: (n: number) => string;
  height?: number;
};

const PAD = { top: 12, right: 8, bottom: 26, left: 56 };
const MAX_BAR = 24; // px: never fill the slot
const BAR_GAP = 2; // px surface gap between adjacent bars
const RADIUS = 4; // px rounded data-end

/** Nice round tick step for a range. */
function niceStep(range: number, count: number): number {
  if (range <= 0) return 1;
  const raw = range / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Column with a 4px rounded end away from the baseline and a square end at the baseline. */
function columnPath(x: number, w: number, yValue: number, yBase: number): string {
  const h = Math.abs(yBase - yValue);
  if (h < 0.5) return '';
  const r = Math.min(RADIUS, w / 2, h);
  if (yValue < yBase) {
    // positive: grows up
    return `M${x},${yBase} V${yValue + r} Q${x},${yValue} ${x + r},${yValue} H${x + w - r} Q${x + w},${yValue} ${x + w},${yValue + r} V${yBase} Z`;
  }
  // negative: grows down
  return `M${x},${yBase} V${yValue - r} Q${x},${yValue} ${x + r},${yValue} H${x + w - r} Q${x + w},${yValue} ${x + w},${yValue - r} V${yBase} Z`;
}

/**
 * Grouped column chart on one zero baseline (negatives allowed). Hover or focus a month for a tooltip;
 * a legend shows for 2+ series; "Show table" gives the same numbers as a table.
 */
export function ColumnChart({ title, categories, series, formatValue, height = 220 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const [isTable, setIsTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.max(280, entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isTable]);

  const all = series.flatMap((s) => s.values);
  const maxV = Math.max(0, ...all);
  const minV = Math.min(0, ...all);
  const step = niceStep(maxV - minV || 1, 4);
  const top = Math.ceil(maxV / step) * step || step;
  const bottom = Math.floor(minV / step) * step;
  const ticks: number[] = [];
  for (let v = bottom; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom || 1)) * plotH;
  const band = categories.length ? plotW / categories.length : plotW;
  const barW = Math.max(2, Math.min(MAX_BAR, (band * 0.7 - BAR_GAP * (series.length - 1)) / series.length));
  const groupW = barW * series.length + BAR_GAP * (series.length - 1);
  // Thin out x labels when crowded
  const labelEvery = Math.max(1, Math.ceil(categories.length / Math.max(1, Math.floor(plotW / 48))));

  const tooltipLeft = active === null ? 0 : Math.min(Math.max(PAD.left + band * active + band / 2, 90), width - 90);

  return (
    <figure className="viz-root space-y-2" aria-label={title}>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold text-[#1B2B34] dark:text-[#E6EDF1]">{title}</span>
        <span className="flex items-center gap-3">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
                <span aria-hidden="true" className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          <button
            type="button"
            onClick={() => setIsTable((t) => !t)}
            className="text-xs font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] cursor-pointer min-h-0"
          >
            {isTable ? 'Show chart' : 'Show table'}
          </button>
        </span>
      </figcaption>

      {isTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[#5E6E78] dark:text-[#8E9EA8] border-b border-[#D5DDE3] dark:border-[#2B3A44]">
                <th className="py-1.5 pr-3 font-semibold">Month</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1.5 pr-3 font-semibold text-right">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c} className="border-b border-[#D5DDE3]/60 dark:border-[#2B3A44]/60 text-[#1B2B34] dark:text-[#E6EDF1]">
                  <td className="py-1.5 pr-3">{c}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1.5 pr-3 text-right tabular-nums">
                      {formatValue(s.values[i] || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} className="relative" onMouseLeave={() => setActive(null)}>
          <svg width={width} height={height} role="img" aria-label={`${title} chart`} className="block">
            {/* Recessive grid + y labels */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--viz-grid)"
                  strokeWidth={t === 0 ? 1.5 : 1}
                  strokeDasharray={t === 0 ? undefined : '2 3'}
                />
                <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--viz-muted)">
                  {formatValue(t)}
                </text>
              </g>
            ))}

            {categories.map((c, i) => {
              const gx = PAD.left + band * i + (band - groupW) / 2;
              return (
                <g key={c}>
                  {active === i && (
                    <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="var(--viz-hover)" />
                  )}
                  {series.map((s, si) => (
                    <path
                      key={s.key}
                      d={columnPath(gx + si * (barW + BAR_GAP), barW, y(s.values[i] || 0), y(0))}
                      fill={s.color}
                    />
                  ))}
                  {i % labelEvery === 0 && (
                    <text x={PAD.left + band * i + band / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--viz-muted)">
                      {c}
                    </text>
                  )}
                  {/* Hit target: the whole month band, bigger than the marks */}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${c}: ${series.map((s) => `${s.label} ${formatValue(s.values[i] || 0)}`).join(', ')}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    style={{ outline: 'none', cursor: 'default' }}
                  />
                </g>
              );
            })}
          </svg>

          {active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-1 -translate-x-1/2 px-3 py-2 rounded-lg shadow-lg text-xs bg-white dark:bg-[#10181D] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#1B2B34] dark:text-[#E6EDF1] whitespace-nowrap"
              style={{ left: tooltipLeft }}
            >
              <div className="font-bold mb-1">{categories[active]}</div>
              {series.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span aria-hidden="true" className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
                  <span className="text-[#5E6E78] dark:text-[#8E9EA8]">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">{formatValue(s.values[active] || 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
