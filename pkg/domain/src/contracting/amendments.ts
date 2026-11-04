import { judgePlacement, type Misplacement, placementIn } from './capture.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import { isReported, ledgerOrder, type SequencedReading } from './readings.js';

export type ReadingAmendmentRefusal =
  | 'out_of_range'
  | 'contradicts_telematics'
  | 'outruns_clock'
  | 'future_read_at'
  | 'nothing_to_amend';
export type ReadingAmendmentResolution = { ok: false; reason: ReadingAmendmentRefusal; message: string } | { ok: true };
type Change = { value: number; capturedAt: Date };

/** How a misplacement refuses an amendment: past a Telematics Reading it contradicts John Deere, else it is out of range. */
const amendmentRefusalFor = ({ rule, neighbour }: Misplacement): ReadingAmendmentRefusal =>
  rule === 'outruns-clock' ? 'outruns_clock' : isReported(neighbour) ? 'contradicts_telematics' : 'out_of_range';

/** An amendment is already the fix: outside a captured neighbour it says so plainly, and states the clock rule alone. */
const amendmentSentence = ({ rule, neighbour, sentence }: Misplacement) =>
  rule === 'outruns-clock' || isReported(neighbour)
    ? sentence
    : 'Amended hours must be between the neighbouring readings.';

/** Whether an amendment moves its reading's hours or Read At; one that moves neither is refused. */
const amendmentMoves = (
  before: { value: number; capturedAt: Date | string },
  amendment: { value: number; capturedAt: Date | string },
) =>
  before.value !== amendment.value ||
  new Date(before.capturedAt).getTime() !== new Date(amendment.capturedAt).getTime();

/**
 * Whether `before`, one reading of a Machine's ledger (`readings`, any order), may take a change of hours or Read At.
 * One that changes nothing is refused. The amended reading is judged again as a fresh capture at its new place in
 * time: never in the future, then the placement judge against its ledger neighbours.
 */
export function resolveReadingAmendment(
  readings: readonly SequencedReading[],
  before: SequencedReading,
  change: Change,
  now: Date,
): ReadingAmendmentResolution {
  const refuse = (reason: ReadingAmendmentRefusal, message: string) => ({ ok: false, reason, message }) as const;
  if (!amendmentMoves(before, change)) return refuse('nothing_to_amend', 'Nothing to amend.');
  if (isFutureReadAt(change.capturedAt, now)) return refuse('future_read_at', FUTURE_READ_AT_REFUSAL);
  const amended = { ...before, ...change };
  const ledger = readings.map((reading) => (reading.id === before.id ? amended : reading)).sort(ledgerOrder);
  const misplaced = judgePlacement(placementIn(ledger, ledger.indexOf(amended)), amended);
  return misplaced ? refuse(amendmentRefusalFor(misplaced), amendmentSentence(misplaced)) : { ok: true };
}
