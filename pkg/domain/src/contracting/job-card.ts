import { DateIso } from '@pkg/schema';
import {
  type Assignment,
  type FinishedJobStatus,
  finishedJobStatuses,
  type JobCardModel,
  type JobCardReading,
  type JobCardReadingMarker,
  type JobCardStintLine,
  type JobCardVariant,
  type JobDetail,
  type JobReading,
} from '@pkg/schema/contracting';
import { formatPercent } from '../formatting/number.js';
import { round1 } from './hours.js';
import { round2 } from './pricing.js';
import { groupStints } from './stints.js';

export const hasJobCard = (status: string): status is FinishedJobStatus =>
  (finishedJobStatuses as readonly string[]).includes(status);

/** The API route that renders a Job Card, relative to the API origin. */
export const jobCardPath = (jobNumber: string, variant: JobCardVariant) =>
  `/api/contracting/jobs/${encodeURIComponent(jobNumber)}/job-card?variant=${variant}`;

export const jobCardFilename = (jobNumber: string, variant: JobCardVariant) => `${jobNumber}-job-card-${variant}.pdf`;

function readingMarker(reading: JobReading): JobCardReadingMarker {
  if (reading.disputed) return 'disputed';
  if (reading.amendedAt) return 'amended';
  if (reading.photoBacked && reading.aiVerification === 'agrees') return 'verified';
  return reading.photoBacked ? 'photo' : 'no-photo';
}

function cardReading(reading: JobReading | null, internal: boolean): JobCardReading | null {
  if (!reading) return null;
  return {
    value: reading.value,
    capturedAt: reading.capturedAt,
    marker: internal ? readingMarker(reading) : null,
    comment: internal ? reading.comment : null,
  };
}

function cardRate(stint: Assignment): JobCardStintLine['rate'] {
  if (stint.rateUnitAmount === null || stint.rateBasis === null) return null;
  const measureName = stint.measures.find(
    (measure) => measure.measureTypeId === stint.rateMeasureTypeId,
  )?.measureTypeName;
  return {
    name: stint.rateName ?? '',
    basis: stint.rateBasis,
    unitAmount: stint.rateUnitAmount,
    per: stint.rateBasis === 'time' ? 'h' : (measureName ?? 'unit'),
  };
}

function stintLine(stint: Assignment, internal: boolean, priced: boolean): JobCardStintLine {
  return {
    kind: 'stint',
    machineCode: stint.machineCode,
    categoryName: stint.categoryName,
    implementCode: stint.implementCode,
    driverName: internal ? stint.driverName : null,
    arrival: cardReading(stint.arrival, internal),
    departure: cardReading(stint.departure, internal),
    hours: internal
      ? {
          variant: 'internal',
          work: stint.workHours,
          travel: stint.travelHours,
          unaccounted: stint.unaccountedHours,
          gapReason: stint.gapReason,
        }
      : { variant: 'customer', total: stint.billableHours },
    measures: stint.measures.map((measure) => ({ name: measure.measureTypeName, quantity: measure.quantity })),
    rate: priced ? cardRate(stint) : null,
    noCharge: priced && stint.rateBasis === null,
    amount: priced ? stint.finalAmount : null,
  };
}

function discountLine(job: JobDetail, amount: number): JobCardModel['discount'] {
  if (job.discountKind === null || job.discountValue === null) return null;
  return {
    label: job.discountKind === 'percent' ? `Discount (${formatPercent(job.discountValue)})` : 'Discount',
    amount,
  };
}

/** The one place the Job Card's variant rules live; the renderer prints what this returns. */
export function buildJobCardModel(job: JobDetail, variant: JobCardVariant, now: Date): JobCardModel {
  const { status } = job;
  if (!hasJobCard(status)) throw new Error('A Job Card exists once the Job is Completed.');
  const internal = variant === 'internal';
  const pricing = job.pricing;
  const priced = pricing !== null && (status !== 'completed' || pricing.gate.ok);

  const lines: JobCardModel['lines'] = [];
  let group: Assignment[] = [];
  for (const row of groupStints(job.assignments)) {
    if (row.kind === 'planned') throw new Error('A Completed Job has no planned stints.');
    if (row.kind === 'stint') {
      if (row.firstOfMachine) group = [];
      group.push(row.stint);
      lines.push(stintLine(row.stint, internal, priced));
      continue;
    }
    lines.push({
      kind: 'subtotal',
      machineCode: row.machineCode,
      hours: internal
        ? { variant: 'internal', work: row.workHours, travel: row.travelHours }
        : { variant: 'customer', total: round1(row.workHours + row.travelHours) },
      amount: priced ? round2(group.reduce((total, stint) => total + (stint.finalAmount ?? 0), 0)) : null,
    });
  }

  return {
    variant,
    jobNumber: job.jobNumber,
    status,
    customerName: job.customerName,
    farmName: job.farmName,
    workTypeName: job.workTypeName,
    description: job.description,
    foremanName: job.foremanName,
    startDate: job.startDate,
    endDate: job.endDate,
    invoiceNumber: job.invoiceNumber,
    invoicedAt: job.invoicedAt,
    pricedAt: job.pricedAt,
    lines,
    chargeLines: job.chargeLines.map((line) => ({
      description: line.description,
      amount: priced ? line.amount : null,
    })),
    diesel: {
      litres: job.dieselLitres,
      unitPrice: priced ? job.dieselUnitPrice : null,
      amount: priced ? job.dieselAmount : null,
    },
    discount: priced ? discountLine(job, pricing.discountAmount) : null,
    totals: priced
      ? {
          subtotal: pricing.subtotal,
          discount: pricing.discountAmount,
          diesel: pricing.dieselAmount,
          total: pricing.total,
        }
      : null,
    notes: internal ? job.notes : null,
    repricingNote: internal ? job.repricingNote : null,
    generatedAt: DateIso.parse(now),
  };
}
