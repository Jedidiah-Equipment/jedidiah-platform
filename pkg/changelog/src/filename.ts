import { format } from 'date-fns';

/**
 * Derives the base name (no directory, no `.json` extension) for a changelog released at
 * `releasedAt`. The base name is the release date; when a base name is already taken — a second
 * release on the same calendar day — a `-2`, `-3`, … suffix is appended to the first free slot.
 */
export function deriveChangelogBasename(releasedAt: string, existing: Iterable<string>): string {
  const day = format(new Date(releasedAt), 'yyyy-MM-dd');
  const taken = new Set(existing);
  if (!taken.has(day)) return day;
  let suffix = 2;
  while (taken.has(`${day}-${suffix}`)) suffix += 1;
  return `${day}-${suffix}`;
}
