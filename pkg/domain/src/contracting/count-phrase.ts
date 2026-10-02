import { formatNumber } from '../formatting/number.js';

/** "1 machine is" / "2 machines are": a formatted count with the phrase that agrees with it. */
export const countPhrase = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;
