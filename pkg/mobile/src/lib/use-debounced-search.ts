import { useDebouncedValue } from './use-debounced-value';

const SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedSearch(search: string): string {
  return useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
}
