import type { AuthId } from '@pkg/schema';

/**
 * The two ways the stores tablet's quick-switch can name someone it may not attribute a movement to.
 * They are kept apart because the fix differs at the tablet: an unknown badge is reprinted, a
 * disabled account is a question for the office.
 */

export class AssertedActorNotFoundError extends Error {
  readonly code = 'inventory.actor_not_found';
  readonly metadata: { actorUserId: AuthId };

  constructor(actorUserId: AuthId) {
    super(`Asserted actor not found: ${actorUserId}`);
    this.name = 'AssertedActorNotFoundError';
    this.metadata = { actorUserId };
  }
}

export class AssertedActorDisabledError extends Error {
  readonly code = 'inventory.actor_disabled';
  readonly metadata: { actorUserId: AuthId };

  constructor(actorUserId: AuthId) {
    super(`Asserted actor is disabled: ${actorUserId}`);
    this.name = 'AssertedActorDisabledError';
    this.metadata = { actorUserId };
  }
}

export type AssertedActorError = AssertedActorDisabledError | AssertedActorNotFoundError;

export function isAssertedActorError(error: unknown): error is AssertedActorError {
  return error instanceof AssertedActorDisabledError || error instanceof AssertedActorNotFoundError;
}
