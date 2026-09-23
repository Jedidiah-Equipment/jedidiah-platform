import { z } from 'zod';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { ReadingValue } from '../readings/reading.js';
import { Hours, JobNumber, Litres, Money, Quantity } from './job.js';

export const JobCardVariant = z.enum(['internal', 'customer']);
export type JobCardVariant = z.infer<typeof JobCardVariant>;
export const JobCardQuery = z.object({ variant: JobCardVariant.default('customer') }).strict();

export const jobCardReadingMarkers = ['verified', 'photo', 'no-photo', 'disputed', 'amended'] as const;
export type JobCardReadingMarker = (typeof jobCardReadingMarkers)[number];

const JobCardReading = z.object({
  value: ReadingValue,
  capturedAt: DateIso,
  /** Internal copy only; null on the customer copy. */
  marker: z.enum(jobCardReadingMarkers).nullable(),
  /** Internal copy only. */
  comment: z.string().nullable(),
});
export type JobCardReading = z.infer<typeof JobCardReading>;

const JobCardStintLine = z.object({
  kind: z.literal('stint'),
  machineCode: z.string(),
  categoryName: z.string(),
  implementCode: z.string().nullable(),
  /** Internal copy only. */
  driverName: z.string().nullable(),
  arrival: JobCardReading.nullable(),
  departure: JobCardReading.nullable(),
  /** The customer copy prints one figure (work + billed travel), never the split. */
  hours: z.discriminatedUnion('variant', [
    z.object({ variant: z.literal('customer'), total: Hours.nullable() }),
    z.object({
      variant: z.literal('internal'),
      work: Hours.nullable(),
      travel: Hours,
      unaccounted: Hours,
      gapReason: z.string().nullable(),
    }),
  ]),
  measures: z.array(z.object({ name: z.string(), quantity: Quantity })),
  /** Null while un-priced or when the stint is No charge. */
  rate: z
    .object({ name: z.string(), basis: z.enum(['time', 'measure']), unitAmount: Money, per: z.string() })
    .nullable(),
  noCharge: z.boolean(),
  amount: Money.nullable(),
});
export type JobCardStintLine = z.infer<typeof JobCardStintLine>;

const JobCardSubtotal = z.object({
  kind: z.literal('subtotal'),
  machineCode: z.string(),
  hours: Hours,
  amount: Money.nullable(),
});
export type JobCardSubtotal = z.infer<typeof JobCardSubtotal>;

export const JobCardModel = z.object({
  variant: JobCardVariant,
  jobNumber: JobNumber,
  status: z.enum(['completed', 'priced', 'invoiced']),
  customerName: z.string(),
  farmName: z.string(),
  workTypeName: z.string(),
  description: z.string().nullable(),
  foremanName: z.string().nullable(),
  startDate: DateOnlyIso.nullable(),
  endDate: DateOnlyIso.nullable(),
  invoiceNumber: z.string().nullable(),
  invoicedAt: DateIso.nullable(),
  pricedAt: DateIso.nullable(),
  lines: z.array(z.discriminatedUnion('kind', [JobCardStintLine, JobCardSubtotal])),
  chargeLines: z.array(z.object({ description: z.string(), amount: Money.nullable() })),
  /** Always printed, VAT-exempt; the amount is null while un-priced. */
  diesel: z.object({ litres: Litres, unitPrice: Money.nullable(), amount: Money.nullable() }),
  discount: z.object({ label: z.string(), amount: Money }).nullable(),
  /** Null while un-priced. */
  totals: z.object({ subtotal: Money, discount: Money, diesel: Money, total: Money }).nullable(),
  /** Internal copy only: site notes. */
  notes: z.string().nullable(),
  /** Internal copy only: why a reopened Job was re-priced. */
  repricingNote: z.string().nullable(),
  generatedAt: DateIso,
});
export type JobCardModel = z.infer<typeof JobCardModel>;

export type JobCardPdfRenderer = (input: { document: JobCardModel }) => Promise<Uint8Array>;
