import { useEffect, useState } from 'react';

const SEARCH_DEBOUNCE_MS = 250;

export function useDebouncedSearch(search: string): string {
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  return debouncedSearch;
}
