import { describe, expect, it } from 'vitest';

import { isHydratedSession, sessionUserId } from './session-state';

describe('session state', () => {
  it('rejects a pre-hydration snapshot without a user', () => {
    expect(isHydratedSession({})).toBe(false);
    expect(sessionUserId({})).toBeNull();
  });

  it('accepts a hydrated session and returns its user id', () => {
    const session = { user: { id: 'user-1' } };

    expect(isHydratedSession(session)).toBe(true);
    expect(sessionUserId(session)).toBe('user-1');
  });
});
