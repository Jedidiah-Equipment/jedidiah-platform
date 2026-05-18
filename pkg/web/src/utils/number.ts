const currencySymbolByCode: Record<string, string> = {
  ZAR: 'R',
};

export function formatCurrency(value: number, currencyCode?: string): string {
  if (!Number.isFinite(value)) return '';
  const formattedValue = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(value);

  if (!currencyCode) {
    return formattedValue;
  }

  return `${currencySymbolByCode[currencyCode] ?? currencyCode} ${formattedValue}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}
