// A v4 UUID without a native dependency; it is an idempotency identifier, not a secret.
export function newLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 3) | 8).toString(16);
  });
}

/** One press of Save and its retries: the server replays a capture only when its id and time match. */
export type AttemptIdentity = { localId: string; capturedAt: string; fingerprint: string };

/** The attempt to send: the current one while nothing in the payload changed, else a new identity. */
export function captureAttempt(current: AttemptIdentity | null, payload: readonly unknown[]): AttemptIdentity {
  const fingerprint = JSON.stringify(payload);
  if (current?.fingerprint === fingerprint) return current;
  return { localId: newLocalId(), capturedAt: new Date().toISOString(), fingerprint };
}
