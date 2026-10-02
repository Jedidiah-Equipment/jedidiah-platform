import { newLocalId } from '@/contracting/lib/local-id';

/**
 * One press of Save and its retries: the server replays a capture only when its id and time match, so a
 * retry reuses both. `attemptedAt` is the time sent when Read At is still "now".
 */
export type AttemptIdentity = { localId: string; attemptedAt: Date; fingerprint: string };

/** Everything the Foreman entered that the server's replay compares; Read At is part of it. */
export function captureAttemptPayload(form: {
  role: string;
  assignmentId: string | null;
  value: number;
  photo: string | null;
  comment: string;
  disputedReadingId: string | null;
  stintOverrides: unknown;
  readAt: Date | null;
}): readonly unknown[] {
  return [
    form.role,
    form.assignmentId,
    form.value,
    form.photo,
    form.comment.trim(),
    form.disputedReadingId,
    form.stintOverrides,
    form.readAt?.toISOString() ?? null,
  ];
}

/** The attempt to send: the current one while nothing in the payload changed, else a new identity. */
export function captureAttempt(current: AttemptIdentity | null, payload: readonly unknown[]): AttemptIdentity {
  const fingerprint = JSON.stringify(payload);
  if (current?.fingerprint === fingerprint) return current;
  return { localId: newLocalId(), attemptedAt: new Date(), fingerprint };
}
