import type { AuthId } from '@pkg/schema';

/**
 * The ways an account can fail to be a person the ledger may attribute a movement to.
 *
 * They are kept apart because the fix differs at the tablet: an unknown badge is reprinted, a
 * disabled account is a question for the office, and the two device failures mean the tablet has
 * lost track of who is standing at it.
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

/**
 * A shared device tried to move stock without naming anybody. "No person, no movements" (spec §11)
 * is enforced here rather than only by a disabled button: the button is UX, and a movement landing
 * under a device's name is exactly the record the attribution rule exists to prevent.
 */
export class DeviceActorRequiredError extends Error {
  readonly code = 'inventory.actor_required';
  readonly metadata: { deviceUserId: AuthId };

  constructor(deviceUserId: AuthId) {
    super(`A shared device must name the person moving the stock: ${deviceUserId}`);
    this.name = 'DeviceActorRequiredError';
    this.metadata = { deviceUserId };
  }
}

/** A device is not somebody, so it can never be the person a movement is attributed to. */
export class DeviceActorAssertedError extends Error {
  readonly code = 'inventory.actor_is_device';
  readonly metadata: { actorUserId: AuthId };

  constructor(actorUserId: AuthId) {
    super(`A shared device cannot be named as the actor: ${actorUserId}`);
    this.name = 'DeviceActorAssertedError';
    this.metadata = { actorUserId };
  }
}

export type AssertedActorError =
  | AssertedActorDisabledError
  | AssertedActorNotFoundError
  | DeviceActorAssertedError
  | DeviceActorRequiredError;

export function isAssertedActorError(error: unknown): error is AssertedActorError {
  return (
    error instanceof AssertedActorDisabledError ||
    error instanceof AssertedActorNotFoundError ||
    error instanceof DeviceActorAssertedError ||
    error instanceof DeviceActorRequiredError
  );
}
