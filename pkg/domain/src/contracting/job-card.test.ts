import { DateIso } from '@pkg/schema';
import type { Assignment, JobDetail, JobReading } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { buildJobCardModel } from './job-card.js';

const now = new Date('2026-09-23T10:00:00.000Z');

function reading(value: number, capturedAt: string, overrides: Partial<JobReading> = {}): JobReading {
  return {
    id: `reading-${value}`,
    role: 'arrival',
    value,
    capturedAt,
    capturedByUserId: 'sipho',
    method: 'photo',
    comment: null,
    aiValue: value,
    aiConfidence: 0.98,
    aiVerification: 'agrees',
    aiHint: null,
    disputed: false,
    disputeReason: null,
    evidenceReviewedAt: null,
    amendedAt: null,
    amendmentReason: null,
    photoBacked: true,
    capturedByName: 'Sipho',
    needsALook: [],
    ...overrides,
  } as JobReading;
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
    travelIncluded: true,
    workHours: null,
    gapHours: null,
    travelHours: 0,
    unaccountedHours: 0,
    billableHours: null,
    gapFlag: false,
    gapResolved: false,
    gapReason: null,
    measures: [],
    rateId: null,
    rateName: null,
    rateBasis: null,
    rateMeasureTypeId: null,
    rateUnitAmount: null,
    computedAmount: null,
    finalAmount: null,
    amountEdited: false,
    measureMissing: false,
    billedQuantity: null,
    ...overrides,
  } as Assignment;
}

const excavator = stint({
  id: 'cat',
  machineId: 'cat',
  machineCode: 'CAT320-1',
  arrival: reading(4002.6, '2026-09-01T07:00:00.000Z'),
  departure: reading(4051.2, '2026-09-06T16:00:00.000Z', { role: 'departure' }),
  workHours: 48.6,
  billableHours: 48.6,
  rateId: 'rate-excavator',
  rateName: 'Excavator, supervised',
  rateBasis: 'time',
  rateUnitAmount: 600,
  computedAmount: 29_160,
  finalAmount: 29_160,
  billedQuantity: 48.6,
});
const grader = stint({
  id: 'grader',
  machineId: 'grader',
  machineCode: 'GRAD140K-1',
  categoryName: 'Grader',
  arrival: reading(7110, '2026-09-01T09:00:00.000Z'),
  departure: reading(7152.4, '2026-09-06T15:00:00.000Z', { role: 'departure' }),
  workHours: 42.4,
  gapHours: 2.1,
  travelHours: 2.1,
  billableHours: 44.5,
  rateId: 'rate-grader',
  rateName: 'Grader',
  rateBasis: 'time',
  rateUnitAmount: 550,
  computedAmount: 24_475,
  finalAmount: 24_475,
  billedQuantity: 44.5,
});
const tractor = stint({
  id: 'tractor',
  machineId: 'tractor',
  machineCode: 'JD6140M-2',
  categoryName: 'Tractor',
  implementCode: 'TIP-TRAIL-3',
  arrival: reading(7102.5, '2026-09-01T11:00:00.000Z'),
  departure: reading(7141.3, '2026-09-06T14:00:00.000Z', { role: 'departure' }),
  workHours: 38.8,
  gapHours: 1.2,
  travelHours: 1.2,
  billableHours: 40,
  measures: [{ id: 'measure', measureTypeId: 'loads', measureTypeName: 'Loads', quantity: 18 }],
  rateId: 'rate-tanker',
  rateName: 'Tractor and tanker',
  rateBasis: 'measure',
  rateMeasureTypeId: 'loads',
  rateUnitAmount: 850,
  computedAmount: 15_300,
  finalAmount: 15_300,
  billedQuantity: 18,
});

const rowleyPricing: NonNullable<JobDetail['pricing']> = {
  stintsTotal: 68_935,
  chargeLinesTotal: 3_500,
  subtotal: 72_435,
  discountAmount: 0,
  dieselAmount: 4_830,
  total: 77_265,
  gate: { ok: true, unpricedStints: 0, chargeLinesWithoutAmount: 0, dieselUnpriced: false },
};

/** Spec #1378 scenario 1: Mr Rowley's dam, Priced at R 77,265.00 ex VAT. */
function rowleyDam(overrides: Partial<JobDetail> = {}): JobDetail {
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
    openGapFlags: 0,
    needsALook: 0,
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
    dieselUnitPrice: 23,
    dieselAmount: 4_830,
    dieselAmountEdited: false,
    discountKind: null,
    discountValue: null,
    discountAmount: null,
    pricedSubtotal: 72_435,
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
      status: 'priced',
      customerName: 'Mr Rowley',
      farmName: 'Rooikraal',
      notes: null,
      repricingNote: null,
      chargeLines: [{ description: 'Lowbed move', amount: 3_500 }],
      diesel: { litres: 210, unitPrice: 23, amount: 4_830 },
      discount: null,
      totals: { subtotal: 72_435, discount: 0, diesel: 4_830, total: 77_265 },
      generatedAt: '2026-09-23T10:00:00.000Z',
    });
    expect(card.lines).toEqual([
      expect.objectContaining({
        kind: 'stint',
        machineCode: 'CAT320-1',
        driverName: null,
        arrival: { value: 4002.6, capturedAt: '2026-09-01T07:00:00.000Z', marker: null, comment: null },
        hours: { variant: 'customer', total: 48.6 },
        rate: { name: 'Excavator, supervised', basis: 'time', unitAmount: 600, per: 'h' },
        amount: 29_160,
      }),
      expect.objectContaining({ machineCode: 'GRAD140K-1', hours: { variant: 'customer', total: 44.5 } }),
      expect.objectContaining({
        machineCode: 'JD6140M-2',
        implementCode: 'TIP-TRAIL-3',
        measures: [{ name: 'Loads', quantity: 18 }],
        rate: { name: 'Tractor and tanker', basis: 'measure', unitAmount: 850, per: 'Loads' },
        amount: 15_300,
      }),
    ]);
  });

  test('the internal copy prints the work and travel split, the gap reason, evidence markers and site notes', () => {
    const yardGrader = {
      ...grader,
      gapHours: 9.1,
      travelHours: 2.1,
      unaccountedHours: 7,
      gapResolved: true,
      gapReason: 'yard work at Stony Brook',
      arrival: reading(7110, '2026-09-01T09:00:00.000Z', { comment: 'Meter glass cracked' }),
      departure: reading(7152.4, '2026-09-06T15:00:00.000Z', {
        role: 'departure',
        method: 'manual',
        photoBacked: false,
        aiVerification: 'not-applicable',
      }),
    };
    const amendedExcavator = {
      ...excavator,
      departure: reading(4051.2, '2026-09-06T16:00:00.000Z', { role: 'departure', amendedAt: DateIso.parse(now) }),
    };
    const job = rowleyDam({ assignments: [amendedExcavator, yardGrader], repricingNote: 'Lowbed was double-counted' });
    const card = buildJobCardModel(job, 'internal', now);

    expect(card).toMatchObject({
      notes: 'Access through the northern gate.',
      repricingNote: 'Lowbed was double-counted',
    });
    expect(card.lines).toEqual([
      expect.objectContaining({
        machineCode: 'CAT320-1',
        driverName: 'Sipho',
        arrival: expect.objectContaining({ marker: 'verified' }),
        departure: expect.objectContaining({ marker: 'amended' }),
        hours: { variant: 'internal', work: 48.6, travel: 0, unaccounted: 0, gapReason: null },
      }),
      expect.objectContaining({
        machineCode: 'GRAD140K-1',
        arrival: expect.objectContaining({ marker: 'verified', comment: 'Meter glass cracked' }),
        departure: expect.objectContaining({ marker: 'no-photo' }),
        hours: { variant: 'internal', work: 42.4, travel: 2.1, unaccounted: 7, gapReason: 'yard work at Stony Brook' },
      }),
    ]);
    const [customerGrader] = stintLines(job, 'customer').filter((line) => line.machineCode === 'GRAD140K-1');
    expect(customerGrader).toMatchObject({ hours: { variant: 'customer', total: 44.5 }, arrival: { comment: null } });
  });

  test('marks a disputed reading ahead of any other evidence', () => {
    const disputed = {
      ...excavator,
      arrival: reading(4002.6, '2026-09-01T07:00:00.000Z', { disputed: true, amendedAt: DateIso.parse(now) }),
    };
    const [line] = stintLines(rowleyDam({ assignments: [disputed] }), 'internal');
    expect(line?.arrival?.marker).toBe('disputed');
  });

  test('prints a No charge stint without a Rate and a percentage Discount as its own line', () => {
    const free = { ...grader, rateId: null, rateName: null, rateBasis: null, rateUnitAmount: 0, finalAmount: 0 };
    const card = buildJobCardModel(
      rowleyDam({
        assignments: [excavator, free],
        discountKind: 'percent',
        discountValue: 5,
        discountAmount: 3_621.75,
        pricing: { ...rowleyPricing, discountAmount: 3_621.75, total: 73_643.25 },
      }),
      'customer',
      now,
    );
    expect(card.lines[1]).toMatchObject({ machineCode: 'GRAD140K-1', rate: null, noCharge: true, amount: 0 });
    expect(card.lines[0]).toMatchObject({ noCharge: false });
    expect(card.discount).toEqual({ label: 'Discount (5%)', amount: 3_621.75 });
    expect(card.totals).toMatchObject({ discount: 3_621.75, total: 73_643.25 });
  });

  test('a Completed Job with any line still un-priced prints hours with no rates, amounts or totals', () => {
    const unpricedGrader = {
      ...grader,
      rateId: null,
      rateName: null,
      rateBasis: null,
      rateUnitAmount: null,
      computedAmount: null,
      finalAmount: null,
    };
    const card = buildJobCardModel(
      rowleyDam({
        status: 'completed',
        pricedAt: null,
        assignments: [excavator, unpricedGrader],
        dieselAmount: 4_830,
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
    const secondVisit = {
      ...excavator,
      id: 'cat-2',
      arrival: reading(4060, '2026-09-10T07:00:00.000Z'),
      workHours: 2,
      billableHours: 2,
      finalAmount: 1_200,
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
