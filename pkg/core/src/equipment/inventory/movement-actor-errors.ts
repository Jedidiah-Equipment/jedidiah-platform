import type { AuthId } from '@pkg/schema';

/**
 * The ways an account can fail to be a person the ledger may attribute a movement to.
 *
 * They are kept apart because the fix differs at the tablet: an unknown badge is reprinted, a
 * disabled account is a question for the office, and the two device failures mean the tablet has
 * lost track of who is standing at it.
 */
export type AssertedActorErrorCode =
  | 'inventory.actor_disabled'
  | 'inventory.actor_is_device'
  | 'inventory.actor_not_found'
  | 'inventory.actor_required';

export class AssertedActorError extends Error {
  constructor(
    readonly code: AssertedActorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssertedActorError';
  }
}

export const isAssertedActorError = (error: unknown): error is AssertedActorError =>
  error instanceof AssertedActorError;
export const assertedActorNotFound = (actorUserId: AuthId) =>
  new AssertedActorError('inventory.actor_not_found', `Asserted actor not found: ${actorUserId}`);
export const assertedActorDisabled = (actorUserId: AuthId) =>
  new AssertedActorError('inventory.actor_disabled', `Asserted actor is disabled: ${actorUserId}`);

/**
 * A shared device tried to move stock without naming anybody. "No person, no movements" (spec §11)
 * is enforced here rather than only by a disabled button: the button is UX, and a movement landing
 * under a device's name is exactly the record the attribution rule exists to prevent.
 */
export const deviceActorRequired = (deviceUserId: AuthId) =>
  new AssertedActorError(
    'inventory.actor_required',
    `A shared device must name the person moving the stock: ${deviceUserId}`,
  );

/** A device is not somebody, so it can never be the person a movement is attributed to. */
export const deviceActorAsserted = (actorUserId: AuthId) =>
  new AssertedActorError('inventory.actor_is_device', `A shared device cannot be named as the actor: ${actorUserId}`);
