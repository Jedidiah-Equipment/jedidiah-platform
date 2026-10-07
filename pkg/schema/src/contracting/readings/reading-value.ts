import { z } from 'zod';

/** An hour-meter value: tenths of an hour, as the meter shows them. */
export const ReadingValue = z.number().nonnegative().max(999999999.9).multipleOf(0.1);
