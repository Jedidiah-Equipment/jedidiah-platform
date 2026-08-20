import { downloadFile } from './download.js';

/**
 * The two rules every priced CSV this app hands to a spreadsheet obeys. Both reports read the same
 * ledger under the same "unpriced is unknown, not free" contract, so they write money the same way
 * rather than each keeping a copy of the rule that could drift.
 */

/**
 * Money to the cent, so a column of it sums without the reader reformatting anything — and a figure we
 * do not have as an **empty cell**, never `0.00`. A cost nobody has priced yet that arrived as a zero
 * would total in Excel as free material, which is the one thing a cost report must not do.
 */
export function toCsvAmount(value: number | null): string {
  return value === null ? '' : value.toFixed(2);
}

export function downloadCsv(contents: string, filename: string): void {
  downloadFile(contents, filename, 'text/csv;charset=utf-8');
}
