import {
  type AiFlaggedVerification,
  aiFlaggedVerifications,
  type ReadingExceptionType,
  type ReadingVerification,
} from '@pkg/schema/contracting';
import { getBusinessRole } from '../auth/authorization.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';

export const readingExceptionTypeLabels = {
  'ai-flagged': 'AI flagged',
  disputed: 'Disputed',
} as const;

/** Reading exception colors shared by every contracting surface. */
export const readingExceptionTypeColorClassNames: Record<ReadingExceptionType, BadgeColorClassNames> = {
  'ai-flagged': statusBadgeColorClassNames.yellow,
  disputed: statusBadgeColorClassNames.red,
};

export const isAiFlaggedVerification = (verification: ReadingVerification): verification is AiFlaggedVerification =>
  (aiFlaggedVerifications as readonly ReadingVerification[]).includes(verification);

export function canCaptureBaseline(access: Parameters<typeof getBusinessRole>[0]): boolean {
  const role = getBusinessRole(access, 'contracting');
  return role === 'super-admin' || role === 'contracting-admin';
}

export function meterDisagreementHint({
  value,
  aiValue,
  aiVerification,
}: {
  value: number;
  aiValue: number | null;
  aiVerification: string;
}): string | null {
  if (aiVerification !== 'disagrees' || !aiValue || !value) return null;
  const ratio = aiValue / value;
  return (ratio >= 9 && ratio <= 11) || (ratio >= 0.09 && ratio <= 0.11)
    ? 'Possible tenths-drum misread (≈10× / 0.1×).'
    : null;
}

export type ReadingDisputeState = {
  disputed: boolean;
  disputeReason: string | null;
  disputedPreviousId: string | null;
};
export type AmendableReading = ReadingDisputeState & { id: string; value: number };
export type ReadingAmendmentResolution =
  | { ok: false; reason: 'not_found' | 'out_of_range' }
  | { ok: true; changes: ({ id: string } & ReadingDisputeState)[] };

/**
 * Where an amended value lands in a Machine's ledger (`readings` ascending by sequence) and which
 * dispute pairs it settles. Amended hours must stay between the neighbouring readings. A pair settles
 * when the disputing reading is no longer below the one it disputes and the amended reading is one of
 * the two; pairs the amendment did not touch keep their flags. `changes` lists the amended reading and
 * every other reading whose dispute state moved, so the caller writes exactly those rows.
 */
export function resolveReadingAmendment(
  readings: readonly AmendableReading[],
  amendment: { id: string; value: number },
): ReadingAmendmentResolution {
  const index = readings.findIndex((reading) => reading.id === amendment.id);
  const before = readings[index];
  if (!before) return { ok: false, reason: 'not_found' };
  const previous = readings[index - 1];
  const next = readings[index + 1];
  if (
    amendment.value !== before.value &&
    ((previous && amendment.value < previous.value) || (next && amendment.value > next.value))
  )
    return { ok: false, reason: 'out_of_range' };

  const values = new Map(
    readings.map((reading) => [reading.id, reading.id === amendment.id ? amendment.value : reading.value]),
  );
  const stillDisputed = new Set<string>();
  const settledLinks = new Set<string>();
  for (const reading of readings) {
    if (!reading.disputedPreviousId) continue;
    const disputedValue = values.get(reading.disputedPreviousId);
    if (disputedValue === undefined) continue;
    const touched = reading.id === amendment.id || reading.disputedPreviousId === amendment.id;
    if (touched && (values.get(reading.id) ?? 0) >= disputedValue) settledLinks.add(reading.id);
    else {
      stillDisputed.add(reading.id);
      stillDisputed.add(reading.disputedPreviousId);
    }
  }

  const changes: ({ id: string } & ReadingDisputeState)[] = [];
  for (const reading of readings) {
    const disputed = stillDisputed.has(reading.id);
    const state: ReadingDisputeState = {
      disputed,
      disputeReason: disputed ? reading.disputeReason : null,
      disputedPreviousId: settledLinks.has(reading.id) ? null : reading.disputedPreviousId,
    };
    const unchanged =
      reading.disputed === state.disputed &&
      reading.disputeReason === state.disputeReason &&
      reading.disputedPreviousId === state.disputedPreviousId;
    if (reading.id !== amendment.id && unchanged) continue;
    changes.push({ id: reading.id, ...state });
  }
  return { ok: true, changes };
}
