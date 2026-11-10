/** Currencies whose minor unit is 1/1000 (fils/baisa). */
const THREE_DECIMALS = new Set(['OMR', 'BHD', 'KWD', 'JOD', 'TND', 'LYD', 'IQD']);
const ZERO_DECIMALS = new Set(['JPY', 'KRW', 'VND', 'IDR']);

export function currencyDecimals(currency: string): number {
  const code = (currency || '').trim().toUpperCase();
  if (THREE_DECIMALS.has(code)) return 3;
  if (ZERO_DECIMALS.has(code)) return 0;
  return 2;
}

/**
 * Amount without the currency code. Whole amounts show no decimals ("1,250"); anything with a
 * fraction shows the currency's full precision ("220.500" for OMR, "99.50" for AED), so the same
 * amount always looks the same everywhere.
 */
export function formatAmount(amount: number, currency: string): string {
  const value = Number(amount) || 0;
  const decimals = currencyDecimals(currency);
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals;
  const isWhole = Number.isInteger(rounded);
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: isWhole ? 0 : decimals,
    maximumFractionDigits: decimals
  });
}

/** "OMR 220.500". */
export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${formatAmount(amount, currency)}`;
}
