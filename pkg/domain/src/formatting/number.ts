const currencySymbolByCode: Record<string, string> = {
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

export function formatCurrency(value: number, currencyCode?: string): string {
  if (!Number.isFinite(value)) return '';
  const formattedValue = formatNumber(value, { decimals: 2 });

  if (!currencyCode) {
    return formattedValue;
  }

  return `${currencySymbolByCode[currencyCode] ?? currencyCode} ${formattedValue}`;
}

export function formatPercent(value: number, options: FormatPercentOptions = {}): string {
  if (!Number.isFinite(value)) return '';
  const decimals = options.decimals ?? (Number.isInteger(value) ? 0 : 1);
  const formattedValue = formatNumber(value, { decimals });
  return options.appendSymbol === false ? formattedValue : `${formattedValue}%`;
}
