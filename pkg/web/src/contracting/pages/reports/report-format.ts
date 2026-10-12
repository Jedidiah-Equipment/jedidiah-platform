import { formatPercent } from '@pkg/domain';

/** A Utilisation or Fleet Load figure; a subject with no fleet days has none, shown as a dash. */
export const percentOrDash = (value: number | null) => (value === null ? '—' : formatPercent(value));
