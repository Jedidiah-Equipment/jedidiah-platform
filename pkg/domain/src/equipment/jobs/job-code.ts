export { formatJobCode } from '@pkg/schema';

export function parseJobCodeSearch(search: string): number | undefined {
  const normalized = search.trim().replace(/^JOB-/i, '');

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const code = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(code) && code > 0 ? code : undefined;
}
