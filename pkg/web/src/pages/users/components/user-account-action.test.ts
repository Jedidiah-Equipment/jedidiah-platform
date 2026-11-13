import { describe, expect, it } from 'vitest';
import { userAccountAction } from './user-account-action.js';

const admin = { canDisable: true, canRemove: true, disabled: false, isSelf: false };

describe('userAccountAction', () => {
  it('offers Remove without history, Disable with it, and nothing until the verdict loads', () => {
    expect(userAccountAction({ ...admin, hasHistory: false })).toBe('remove');
    expect(userAccountAction({ ...admin, hasHistory: true })).toBe('disable');
    expect(userAccountAction({ ...admin, hasHistory: undefined })).toBeNull();
  });

  it('offers Enable on a Disabled User and nothing on the actor’s own row', () => {
    expect(userAccountAction({ ...admin, disabled: true, hasHistory: true })).toBe('enable');
    expect(userAccountAction({ ...admin, isSelf: true, hasHistory: false })).toBeNull();
  });
});
