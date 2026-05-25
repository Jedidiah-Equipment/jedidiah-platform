import { format } from 'date-fns';
import { z } from 'zod';

const DateIsoString = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const DateOnlyIsoString = z.iso.date();

export type DateIso = z.infer<typeof DateIso>;
export const DateIso = z
  .union([DateIsoString, z.date().transform((date) => date.toISOString())])
  .pipe(DateIsoString.brand<'DateIso'>());

export type DateOnlyIso = z.infer<typeof DateOnlyIso>;
export const DateOnlyIso = z
  .union([DateOnlyIsoString, z.date().transform((date) => format(date, 'yyyy-MM-dd'))])
  .pipe(DateOnlyIsoString.brand<'DateOnlyIso'>());
