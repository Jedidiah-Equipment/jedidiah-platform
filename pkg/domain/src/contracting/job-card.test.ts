import type { Assignment, JobDetail, StintReading } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { buildJobCardModel } from './job-card.js';

const now = new Date('2026-09-23T10:00:00.000Z');

function reading(hours: number, at: string, overrides: Partial<StintReading> = {}): StintReading {
  return {
    hours,
    at,
    byUserId: 'sipho',
    byName: 'Sipho',
    comment: null,
    telematics: null,
    ...overrides,
  } as StintReading;
}

function stint(overrides: Partial<Assignment>): Assignment {
  return {
    id: 'stint',
    jobId: 'job',
    machineId: 'machine',
    machineCode: 'MACHINE',
    categoryName: 'Excavator',
    categoryIcon: 'excavator',
    categoryColour: 'amber',
    implementId: null,
    implementCode: null,
    driverUserId: null,
    driverName: 'Sipho',
    state: 'left',
    createdAt: '2026-09-01T06:00:00.000Z',
    arrival: null,
    departure: null,
    travelHours: 0,
    travelClamped: false,
    travelSetByName: null,
    workHours: null,
    billableHours: null,
    attention: [],
    amendment: null,
    measures: [],
    pricing: null,
    ...overrides,
  } as Assignment;
}

const excavator = stint({
  id: 'cat',
  machineId: 'cat',
  machineCode: 'CAT320-1',
  arrival: reading(4002.6, '2026-09-01T07:00:00.000Z'),
  departure: reading(4051.2, '2026-09-06T16:00:00.000Z'),
  workHours: 48.6,
  billableHours: 48.6,
  pricing: {
    kind: 'rate',
    rateId: 'rate-excavator',
    name: 'Excavator, supervised',
    basis: 'time',
    measureTypeId: null,
    measureTypeName: null,
    unitAmount: 600,
    billedQuantity: 48.6,
    measureMissing: false,
    computedAmount: 29_160,
    finalAmount: 29_160,
    amountEdited: false,
  },
});
const grader = stint({
  id: 'grader',
  machineId: 'grader',
  machineCode: 'GRAD140K-1',
  categoryName: 'Grader',
  arrival: reading(7110, '2026-09-01T09:00:00.000Z'),
  departure: reading(7152.4, '2026-09-06T15:00:00.000Z'),
  workHours: 42.4,
  travelHours: 2.1,
  billableHours: 44.5,
  pricing: {
    kind: 'rate',
    rateId: 'rate-grader',
    name: 'Grader',
    basis: 'time',
    measureTypeId: null,
    measureTypeName: null,
    unitAmount: 550,
    billedQuantity: 44.5,
    measureMissing: false,
    computedAmount: 24_475,
    finalAmount: 24_475,
    amountEdited: false,
  },
});
const tractor = stint({
  id: 'tractor',
  machineId: 'tractor',
  machineCode: 'JD6140M-2',
  categoryName: 'Tractor',
  implementCode: 'TIP-TRAIL-3',
  arrival: reading(7102.5, '2026-09-01T11:00:00.000Z'),
  departure: reading(7141.3, '2026-09-06T14:00:00.000Z'),
  workHours: 38.8,
  travelHours: 1.2,
  billableHours: 40,
  measures: [{ id: 'measure', measureTypeId: 'loads', measureTypeName: 'Loads', quantity: 18 }],
  pricing: {
    kind: 'rate',
    rateId: 'rate-tanker',
    name: 'Tractor and tanker',
    basis: 'measure',
    measureTypeId: 'loads',
    measureTypeName: 'Loads',
    unitAmount: 850,
    billedQuantity: 18,
    measureMissing: false,
    computedAmount: 15_300,
    finalAmount: 15_300,
    amountEdited: false,
  },
});

function rateOf(stint: Assignment) {
  if (stint.pricing?.kind !== 'rate') throw new Error(`${stint.machineCode} is not on a Rate.`);
  return stint.pricing;
}

const rowleyPricing: NonNullable<JobDetail['pricing']> = {
  stintsTotal: 68_935,
  chargeLinesTotal: 3_500,
  subtotal: 72_435,
  discountAmount: 0,
  dieselAmount: 4_830,
  total: 77_265,
  gate: { ok: true, unpricedStints: 0, chargeLinesWithoutAmount: 0, dieselUnpriced: false },
};

/**
 * Spec #1378 scenario 1: Mr Rowley's dam, Priced at R 77,265.00 ex VAT. The Job Card reads no verdicts, so the
 * fixture's Machine Assignments carry none.
 */
function rowleyDam(
  overrides: Partial<Omit<JobDetail, 'assignments'>> & { assignments?: Assignment[] } = {},
): JobDetail {
  return {
    id: 'job',
    code: 42,
    jobNumber: 'CJOB-00042',
    customerId: 'rowley',
    customerName: 'Mr Rowley',
    farmId: 'rooikraal',
    farmName: 'Rooikraal',
    workTypeId: 'dam',
    workTypeName: 'Dam building',
    description: 'New dam wall',
    foremanUserId: 'sipho',
    foremanName: 'Sipho',
    status: 'priced',
    plannedStints: 0,
    onSiteStints: 0,
    leftStints: 3,
    looksFinished: false,
    assignmentAttention: 0,
    startDate: '2026-09-01',
    endDate: '2026-09-06',
    pricedAt: '2026-09-08T12:00:00.000Z',
    pricedTotal: 77_265,
    invoiceNumber: null,
    invoicedAt: null,
    createdAt: '2026-08-30T12:00:00.000Z',
    updatedAt: '2026-09-08T12:00:00.000Z',
    notes: 'Access through the northern gate.',
    dieselLitres: 210,
    diesel: { unitPrice: 23, amount: 4_830, amountEdited: false },
    discount: null,
    completedAt: '2026-09-07T12:00:00.000Z',
    invoicedByName: null,
    cancellationReason: null,
    reopenedAt: null,
    repricingNote: null,
    pricing: rowleyPricing,
    assignments: [tractor, excavator, grader],
    chargeLines: [{ id: 'lowbed', description: 'Lowbed move', amount: 3_500, displayOrder: 0 }],
    ...overrides,
  } as JobDetail;
}

const stintLines = (job: JobDetail, variant: 'customer' | 'internal') =>
  buildJobCardModel(job, variant, now).lines.filter((line) => line.kind === 'stint');

describe('buildJobCardModel', () => {
  test('the customer copy prints one hours figure per line and no evidence, attribution or notes', () => {
    const card = buildJobCardModel(rowleyDam(), 'customer', now);

    expect(card).toMatchObject({
      variant: 'customer',
      jobNumber: 'CJOB-00042',
      customerName: 'Mr Rowley',
      farmName: 'Rooikraal',
      notes: null,
      repricingNote: null,
      chargeLines: [{ description: 'Lowbed move', amount: 3_500 }],
      diesel: { litres: 210, unitPrice: 23, amount: 4_830 },
      discount: null,
      totals: { subtotal: 72_435, diesel: 4_830, total: 77_265 },
      generatedAt: '2026-09-23T10:00:00.000Z',
    });
    expect(card.lines).toEqual([
      expect.objectContaining({
        kind: 'stint',
        machineCode: 'CAT320-1',
        driverName: null,
        arrival: { hours: 4002.6, at: null, marker: null, comment: null, byName: null },
        hours: { variant: 'customer', total: 48.6 },
        rate: { name: 'Excavator, supervised', unitAmount: 600, per: 'h' },
        amount: 29_160,
      }),
      expect.objectContaining({ machineCode: 'GRAD140K-1', hours: { variant: 'customer', total: 44.5 } }),
      expect.objectContaining({
        machineCode: 'JD6140M-2',
        implementCode: 'TIP-TRAIL-3',
        measures: [{ name: 'Loads', quantity: 18 }],
        rate: { name: 'Tractor and tanker', unitAmount: 850, per: 'Loads' },
        amount: 15_300,
      }),
    ]);
  });

  test('the internal copy prints the work and travel split, who captured what and when, and sign-off notes', () => {
    const clampedGrader = {
      ...grader,
      travelHours: 0,
      travelClamped: true,
      arrival: reading(7110, '2026-09-01T09:00:00.000Z', { comment: 'Meter glass cracked' }),
    };
    const amendedExcavator = {
      ...excavator,
      amendment: { at: '2026-09-08T09:00:00.000Z', byName: 'Dean', reason: 'Misread the dash' },
    } as Assignment;
    const job = rowleyDam({
      assignments: [amendedExcavator, clampedGrader],
      repricingNote: 'Lowbed was double-counted',
    });
    const card = buildJobCardModel(job, 'internal', now);

    expect(card).toMatchObject({
      notes: 'Access through the northern gate.',
      repricingNote: 'Lowbed was double-counted',
    });
    expect(card.lines).toEqual([
      expect.objectContaining({
        machineCode: 'CAT320-1',
        driverName: 'Sipho',
        departure: expect.objectContaining({ marker: 'amended' }),
        hours: { variant: 'internal', work: 48.6, travel: 0, travelClamped: false },
      }),
      expect.objectContaining({
        machineCode: 'GRAD140K-1',
        arrival: {
          hours: 7110,
          at: '2026-09-01T09:00:00.000Z',
          marker: null,
          comment: 'Meter glass cracked',
          byName: 'Sipho',
        },
        hours: { variant: 'internal', work: 42.4, travel: 0, travelClamped: true },
      }),
    ]);
    const [customerGrader] = stintLines(job, 'customer').filter((line) => line.machineCode === 'GRAD140K-1');
    expect(customerGrader).toMatchObject({ hours: { variant: 'customer', total: 44.5 }, arrival: { comment: null } });
  });

  test('prints a No charge stint without a Rate and a percentage Discount as its own line', () => {
    const free: Assignment = { ...grader, pricing: { kind: 'no-charge' } };
    const card = buildJobCardModel(
      rowleyDam({
        assignments: [excavator, free],
        discount: { kind: 'percent', value: 5, amount: 3_621.75 },
        pricing: { ...rowleyPricing, discountAmount: 3_621.75, total: 73_643.25 },
      }),
      'customer',
      now,
    );
    expect(card.lines[1]).toMatchObject({ machineCode: 'GRAD140K-1', rate: null, noCharge: true, amount: 0 });
    expect(card.lines[0]).toMatchObject({ noCharge: false });
    expect(card.discount).toEqual({ label: 'Discount (5%)', amount: 3_621.75 });
    expect(card.totals).toMatchObject({ total: 73_643.25 });
  });

  test('names a measure Rate’s unit even when its Measure was never captured', () => {
    const noLoads: Assignment = {
      ...tractor,
      measures: [],
      pricing: { ...rateOf(tractor), measureMissing: true, computedAmount: 0, finalAmount: 0 },
    };
    const [line] = stintLines(rowleyDam({ assignments: [noLoads] }), 'customer');
    expect(line).toMatchObject({ rate: { per: 'Loads' }, amount: 0 });
  });

  test('prints no Diesel as R 0.00 on a Priced Job, as its totals do', () => {
    const card = buildJobCardModel(
      rowleyDam({
        dieselLitres: 0,
        diesel: null,
        pricing: { ...rowleyPricing, dieselAmount: 0, total: 72_435 },
      }),
      'customer',
      now,
    );
    expect(card.diesel).toEqual({ litres: 0, unitPrice: null, amount: 0 });
    expect(card.totals).toMatchObject({ diesel: 0 });
  });

  test('a Completed Job with any line still un-priced prints hours with no rates, amounts or totals', () => {
    const unpricedGrader: Assignment = { ...grader, pricing: null };
    const card = buildJobCardModel(
      rowleyDam({
        status: 'completed',
        pricedAt: null,
        assignments: [excavator, unpricedGrader],
        pricing: {
          ...rowleyPricing,
          gate: { ok: false, unpricedStints: 1, chargeLinesWithoutAmount: 0, dieselUnpriced: false },
        },
      }),
      'customer',
      now,
    );
    expect(card.totals).toBeNull();
    expect(card.lines.map((line) => line.amount)).toEqual([null, null]);
    expect(card.lines[0]).toMatchObject({ rate: null, noCharge: false, hours: { total: 48.6 } });
    expect(card.chargeLines).toEqual([{ description: 'Lowbed move', amount: null }]);
    expect(card.diesel).toEqual({ litres: 210, unitPrice: null, amount: null });
  });

  test('subtotals a Machine only when it has repeat stints', () => {
    const secondVisit: Assignment = {
      ...excavator,
      id: 'cat-2',
      arrival: reading(4060, '2026-09-10T07:00:00.000Z'),
      workHours: 2,
      billableHours: 2,
      pricing: { ...rateOf(excavator), finalAmount: 1_200 },
    };
    const job = rowleyDam({ assignments: [secondVisit, grader, excavator] });
    const card = buildJobCardModel(job, 'customer', now);
    expect(card.lines.map((line) => [line.kind, line.machineCode])).toEqual([
      ['stint', 'CAT320-1'],
      ['stint', 'CAT320-1'],
      ['subtotal', 'CAT320-1'],
      ['stint', 'GRAD140K-1'],
    ]);
    expect(card.lines[2]).toEqual({
      kind: 'subtotal',
      machineCode: 'CAT320-1',
      hours: { variant: 'customer', total: 50.6 },
      amount: 30_360,
    });
    expect(buildJobCardModel(job, 'internal', now).lines[2]).toMatchObject({
      hours: { variant: 'internal', work: 50.6, travel: 0 },
    });
  });

  test.each(['upcoming', 'active', 'cancelled'] as const)('refuses a %s Job', (status) => {
    expect(() => buildJobCardModel(rowleyDam({ status }), 'customer', now)).toThrow(/once the Job is Completed/);
  });
});
