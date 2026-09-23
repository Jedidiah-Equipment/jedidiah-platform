/** The currency the plant keeps its books in: the inventory ledger, stocktakes, costing, and Custom Quotes. */
export const PLANT_CURRENCY_CODE = 'ZAR';

export const CURRENCY_SYMBOL_BY_CODE: Record<string, string> = {
  ZAR: 'R',
};

export type FormatNumberOptions = {
  decimals?: number;
};

export type FormatPercentOptions = FormatNumberOptions & {
  appendSymbol?: boolean;
};

export function formatNumber(value: number, options: FormatNumberOptions = {}): string {
  if (!Number.isFinite(value)) return '';

  const decimals = options.decimals ?? 0;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    useGrouping: true,
  })
    .format(value)
    .replaceAll(',', ' ');
}

/**
 * Rand unless the record carries another currency code. `decimals: 0` rounds to the nearest whole unit,
 * for lists where cents are noise.
 */
export function formatCurrency(
  value: number,
  currencyCode: string = PLANT_CURRENCY_CODE,
  options: FormatNumberOptions = {},
): string {
  if (!Number.isFinite(value)) return '';
  const formattedValue = formatNumber(value, { decimals: options.decimals ?? 2 });

  return `${CURRENCY_SYMBOL_BY_CODE[currencyCode] ?? currencyCode} ${formattedValue}`;
}

export function formatPercent(value: number, options: FormatPercentOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  const decimals = options.decimals ?? (Number.isInteger(value) ? 0 : 1);
  const formattedValue = formatNumber(value, { decimals });
  return options.appendSymbol === false ? formattedValue : `${formattedValue}%`;
}

/** Machine hours, as read off an hour meter: one decimal and an `h` suffix. */
export function formatHours(value: number): string {
  if (!Number.isFinite(value)) return '';
  return `${formatNumber(value, { decimals: 1 })} h`;
}

/**
 * Money for a CSV cell: to the cent with no grouping or symbol, so a column sums without the reader
 * reformatting anything. A figure we do not have is an **empty cell**, never `0.00` — an unpriced cost
 * that arrived as zero would total in a spreadsheet as free material.
 */
export function toCsvAmount(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}
