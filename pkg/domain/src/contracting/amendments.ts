import { judgePlacement, type Misplacement, placementIn } from './capture.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import { isReported, ledgerOrder, type SequencedReading } from './readings.js';

export type ReadingAmendmentRefusal =
  | 'not_found'
  | 'out_of_range'
  | 'contradicts_telematics'
  | 'outruns_clock'
  | 'future_read_at'
  | 'nothing_to_amend';
export type ReadingAmendmentResolution =
  | { ok: false; reason: ReadingAmendmentRefusal; id: string; message: string }
  | { ok: true };
type Amendment = { id: string; value: number; capturedAt: Date };

/** How a misplacement refuses an amendment: past a Telematics Reading it contradicts John Deere, else it is out of range. */
const amendmentRefusalFor = ({ rule, neighbour }: Misplacement): ReadingAmendmentRefusal =>
  rule === 'outruns-clock' ? 'outruns_clock' : isReported(neighbour) ? 'contradicts_telematics' : 'out_of_range';

/** An amendment is already the fix: outside a captured neighbour it says so plainly, and states the clock rule alone. */
const amendmentSentence = ({ rule, neighbour, sentence }: Misplacement) =>
  rule === 'outruns-clock' || isReported(neighbour)
    ? sentence
    : 'Amended hours must be between the neighbouring readings.';

/** A Machine's ledger as the amendments would leave it: amended values and Read Ats in place, in ledger order. */
function amendedLedger<T extends SequencedReading>(readings: readonly T[], amendments: readonly Amendment[]): T[] {
  const amended = new Map(amendments.map((amendment) => [amendment.id, amendment]));
  return readings
    .map((reading) => {
      const change = amended.get(reading.id);
      return change ? { ...reading, value: change.value, capturedAt: change.capturedAt } : reading;
    })
    .sort(ledgerOrder);
}

/** Whether an amendment moves its reading's hours or Read At; one that moves neither is refused. */
export const amendmentMoves = (
  before: { value: number; capturedAt: Date | string },
  amendment: { value: number; capturedAt: Date | string },
) =>
  before.value !== amendment.value ||
  new Date(before.capturedAt).getTime() !== new Date(amendment.capturedAt).getTime();

/**
 * Whether a set of amendments may land on a Machine's ledger (`readings`, any order). An amendment that changes
 * nothing is refused. Each amended reading is judged again as a fresh capture at its new place in time: never in the
 * future, then the placement judge against its ledger neighbours.
 */
export function resolveReadingAmendments(
  readings: readonly SequencedReading[],
  amendments: readonly Amendment[],
  now: Date,
): ReadingAmendmentResolution {
  const refuse = (reason: ReadingAmendmentRefusal, id: string, message: string) =>
    ({ ok: false, reason, id, message }) as const;
  const recorded = new Map(readings.map((reading) => [reading.id, reading]));
  const missing = amendments.find((amendment) => !recorded.has(amendment.id));
  if (missing) return refuse('not_found', missing.id, 'Hour Reading not found.');
  const unchanged = amendments.find((amendment) => {
    const before = recorded.get(amendment.id);
    return before && !amendmentMoves(before, amendment);
  });
  if (unchanged) return refuse('nothing_to_amend', unchanged.id, 'Nothing to amend.');
  const amended = new Set(amendments.map((amendment) => amendment.id));
  const ledger = amendedLedger(readings, amendments);
  const judged = [...ledger.entries()].filter(([, reading]) => amended.has(reading.id));
  const future = judged.find(([, reading]) => isFutureReadAt(reading.capturedAt, now));
  if (future) return refuse('future_read_at', future[1].id, FUTURE_READ_AT_REFUSAL);
  for (const [index, reading] of judged) {
    const misplaced = judgePlacement(placementIn(ledger, index), reading);
    if (misplaced) return refuse(amendmentRefusalFor(misplaced), reading.id, amendmentSentence(misplaced));
  }
  return { ok: true };
}
