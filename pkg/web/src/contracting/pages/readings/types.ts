import { UUID } from '@pkg/schema';
import { type DisputeReading, type ReadingAmendInput, ReadingAmendment, ReadingReason } from '@pkg/schema/contracting';
import { z } from 'zod';
import {
  CorrectedReadAt,
  correctedCapturedAt,
  recordedReadAtValue,
} from '@/contracting/components/readings/read-at-correction.js';
import { getApiErrorMetadata } from '@/lib/api-errors.js';

/** The resolve form: each reading's corrected hours and Read At, in the Dispute's ledger order, under one reason. */
export const DisputeResolveValues = z.object({
  readings: ReadingAmendment.pick({ id: true, value: true }).extend({ readAt: CorrectedReadAt }).array().min(1),
  reason: ReadingReason,
});
export type DisputeResolveValues = z.infer<typeof DisputeResolveValues>;
/** What the form reads off a Dispute: each reading as recorded. */
type RecordedDispute = { readings: readonly Pick<DisputeReading, 'id' | 'value' | 'capturedAt'>[] };

/** Every reading prefilled as recorded, and no reason yet. */
export const disputeResolveDefaults = (dispute: RecordedDispute): DisputeResolveValues => ({
  readings: dispute.readings.map(({ id, value, capturedAt }) => ({
    id,
    value,
    readAt: recordedReadAtValue(capturedAt),
  })),
  reason: '',
});

/** One amendment per reading in the Dispute, so the server judges them together. */
export function toReadingAmendInput(values: DisputeResolveValues, dispute: RecordedDispute): ReadingAmendInput {
  const recorded = new Map(dispute.readings.map((reading) => [reading.id, reading.capturedAt]));
  return {
    amendments: values.readings.map(({ id, value, readAt }) => {
      const capturedAt = recorded.get(id);
      if (!capturedAt) throw new Error(`Reading ${id} is not in this Dispute.`);
      return { id, value, capturedAt: correctedCapturedAt(readAt, capturedAt) };
    }),
    reason: values.reason,
  };
}

const RefusedReading = z.object({ readingId: UUID });

/** The reading an amendment's refusal names, so its card can be marked; null when it names none. */
export function refusedReadingId(error: unknown): string | null {
  const refused = RefusedReading.safeParse(getApiErrorMetadata(error));
  return refused.success ? refused.data.readingId : null;
}
