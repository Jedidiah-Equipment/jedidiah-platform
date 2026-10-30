import { formatNumber } from '@pkg/domain';
import { standaloneDisputes } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  type DisputeReading,
  READING_AMENDMENTS_MAX,
  type ReadingAmendInput,
  ReadingAmendment,
  ReadingReason,
} from '@pkg/schema/contracting';
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
/** What the form reads off a Dispute: each reading as recorded, and how it is Disputed. */
type RecordedDispute = {
  readings: readonly Pick<DisputeReading, 'id' | 'value' | 'capturedAt' | 'disputed' | 'disputedPreviousId'>[];
};

/** Every reading prefilled as recorded, and no reason yet. */
export const disputeResolveDefaults = (dispute: RecordedDispute): DisputeResolveValues => ({
  readings: dispute.readings.map(({ id, value, capturedAt }) => ({
    id,
    value,
    readAt: recordedReadAtValue(capturedAt),
  })),
  reason: '',
});

/**
 * The amend a resolve posts: the readings whose hours or Read At were corrected, judged together, and every reading
 * John Deere contradicted on its own, which only an amendment naming it clears. An untouched reading of a pair stays
 * out, so the Job it bounds is neither re-priced nor stamped as amended.
 */
export function toReadingAmendInput(values: DisputeResolveValues, dispute: RecordedDispute): ReadingAmendInput {
  const recorded = new Map(dispute.readings.map((reading) => [reading.id, reading]));
  const standalone = standaloneDisputes(dispute.readings);
  return {
    amendments: values.readings.flatMap(({ id, value, readAt }) => {
      const reading = recorded.get(id);
      if (!reading) throw new Error(`Reading ${id} is not in this Dispute.`);
      const capturedAt = correctedCapturedAt(readAt, reading.capturedAt);
      const moved = value !== reading.value || capturedAt !== reading.capturedAt;
      return moved || standalone.has(id) ? [{ id, value, capturedAt }] : [];
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

/**
 * Why Resolve cannot post yet, or null: nothing corrected, or more readings than one amend carries. A long Dispute
 * resolves a part at a time; each part settles the pairs it touches.
 */
export function unpostableReason(values: DisputeResolveValues, dispute: RecordedDispute): string | null {
  const { amendments } = toReadingAmendInput(values, dispute);
  if (!amendments.length) return 'Correct the hours or Read At of a reading to resolve the Dispute.';
  if (amendments.length > READING_AMENDMENTS_MAX)
    return `Correct at most ${formatNumber(READING_AMENDMENTS_MAX)} readings in one Resolve.`;
  return null;
}
