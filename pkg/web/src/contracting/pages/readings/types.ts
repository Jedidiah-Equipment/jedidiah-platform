import { formatNumber } from '@pkg/domain';
import { amendmentEffects } from '@pkg/domain/contracting';
import { UUID } from '@pkg/schema';
import {
  type DisputeReading,
  READING_AMENDMENTS_MAX,
  type ReadingAmendInput,
  ReadingReason,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { ReadingCorrection, recordedCorrection, toAmendment } from '@/contracting/components/readings/types.js';
import { readingRefusal } from '@/contracting/lib/reading-refusal.js';

/** The resolve form: each reading's corrected hours and Read At, in the Dispute's ledger order, under one reason. */
export const DisputeResolveValues = z.object({
  readings: ReadingCorrection.extend({ id: UUID }).array().min(1),
  reason: ReadingReason,
});
export type DisputeResolveValues = z.infer<typeof DisputeResolveValues>;
/** What the form reads off a Dispute: each reading as recorded, and how it is Disputed. */
type RecordedDispute = {
  readings: readonly Pick<DisputeReading, 'id' | 'value' | 'capturedAt' | 'disputed' | 'disputedPreviousId'>[];
};

/** Every reading prefilled as recorded, and no reason yet. */
export const disputeResolveDefaults = (dispute: RecordedDispute): DisputeResolveValues => ({
  readings: dispute.readings.map((reading) => ({ id: reading.id, ...recordedCorrection(reading) })),
  reason: '',
});

/**
 * The amend a resolve posts: every reading whose correction moves it or settles it, judged together. One that would
 * only acknowledge its evidence, an untouched reading of a pair, stays out, so it is not stamped as amended.
 */
export function toReadingAmendInput(values: DisputeResolveValues, dispute: RecordedDispute): ReadingAmendInput {
  const recorded = new Map(dispute.readings.map((reading) => [reading.id, reading]));
  const amendments = values.readings.map((correction) => {
    const reading = recorded.get(correction.id);
    if (!reading) throw new Error(`Reading ${correction.id} is not in this Dispute.`);
    return toAmendment(correction, reading);
  });
  const effects = amendmentEffects(dispute.readings, amendments);
  return {
    amendments: amendments.filter((amendment) => effects.get(amendment.id) !== 'acknowledges'),
    reason: values.reason,
  };
}

/** The reading an amendment's refusal names, so its card can be marked; null when it names none. */
export const refusedReadingId = (error: unknown): string | null => readingRefusal(error).readingId ?? null;

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
