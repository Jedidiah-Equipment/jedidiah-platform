import { JobCardModel, type JobCardVariant } from '@pkg/schema/contracting';

/** Spec #1378 scenario 1 — Mr Rowley's dam, Priced at R 77 265.00 ex VAT — in either variant. */
export function jobCardFixture(variant: JobCardVariant): JobCardModel {
  const internal = variant === 'internal';
  const reading = (
    value: number,
    capturedAt: string,
    marker: 'verified' | 'no-photo',
    comment: string | null = null,
  ) => ({
    value,
    capturedAt,
    marker: internal ? marker : null,
    comment: internal ? comment : null,
    capturedByName: internal ? 'Sipho' : null,
  });
  const hours = (work: number, travel: number, unaccounted = 0, gapReason: string | null = null) =>
    internal
      ? { variant: 'internal' as const, work, travel, unaccounted, gapReason }
      : { variant: 'customer' as const, total: Math.round((work + travel) * 10) / 10 };

  return JobCardModel.parse({
    variant,
    jobNumber: 'CJOB-00042',
    status: 'priced',
    customerName: 'Mr Rowley',
    farmName: 'Rooikraal',
    workTypeName: 'Dam building',
    description: 'New dam wall below the homestead',
    foremanName: 'Sipho',
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    invoiceNumber: null,
    invoicedAt: null,
    pricedAt: '2026-09-08T12:00:00.000Z',
    lines: [
      {
        kind: 'stint',
        machineCode: 'CAT320-1',
        categoryName: 'Excavator',
        implementCode: null,
        driverName: internal ? 'Sipho' : null,
        arrival: reading(4002.6, '2026-09-01T07:00:00.000Z', 'verified'),
        departure: reading(4051.2, '2026-09-06T16:00:00.000Z', 'verified'),
        hours: hours(48.6, 0),
        measures: [],
        rate: { name: 'Excavator, supervised', basis: 'time', unitAmount: 600, per: 'h' },
        noCharge: false,
        amount: 29_160,
      },
      {
        kind: 'stint',
        machineCode: 'GRAD140K-1',
        categoryName: 'Grader',
        implementCode: null,
        driverName: internal ? 'Thabo' : null,
        arrival: reading(7110, '2026-09-01T09:00:00.000Z', 'verified', "Foreman's note: meter glass cracked"),
        departure: reading(7152.4, '2026-09-06T15:00:00.000Z', 'no-photo'),
        hours: hours(42.4, 2.1, 7, 'yard work at Stony Brook'),
        measures: [],
        rate: { name: 'Grader', basis: 'time', unitAmount: 550, per: 'h' },
        noCharge: false,
        amount: 24_475,
      },
      {
        kind: 'stint',
        machineCode: 'JD6140M-2',
        categoryName: 'Tractor',
        implementCode: 'TIP-TRAIL-3',
        driverName: internal ? 'Sipho' : null,
        arrival: reading(7102.5, '2026-09-01T11:00:00.000Z', 'verified'),
        departure: reading(7141.3, '2026-09-06T14:00:00.000Z', 'verified'),
        hours: hours(38.8, 1.2),
        measures: [{ name: 'Loads', quantity: 18 }],
        rate: { name: 'Tractor and tanker', basis: 'measure', unitAmount: 850, per: 'Loads' },
        noCharge: false,
        amount: 15_300,
      },
    ],
    chargeLines: [{ description: 'Lowbed move', amount: 3_500 }],
    diesel: { litres: 210, unitPrice: 23, amount: 4_830 },
    discount: null,
    totals: { subtotal: 72_435, discount: 0, diesel: 4_830, total: 77_265 },
    notes: internal ? 'Access through the northern gate.' : null,
    repricingNote: null,
    generatedAt: '2026-09-23T10:00:00.000Z',
  });
}
