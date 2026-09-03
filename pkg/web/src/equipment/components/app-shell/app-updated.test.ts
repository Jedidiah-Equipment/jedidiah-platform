import { describe, expect, it } from 'vitest';

import { parseAppVersionResponse, shouldShowAppUpdatedToast } from './app-updated.js';

describe('app update detection', () => {
  it('does not show an update notice when the current version is missing', () => {
    expect(shouldShowAppUpdatedToast(null, 'new-version')).toBe(false);
  });

  it('does not show an update notice when the latest version is missing', () => {
    expect(shouldShowAppUpdatedToast('current-version', null)).toBe(false);
  });

  it('does not show an update notice when versions match', () => {
    expect(shouldShowAppUpdatedToast('current-version', 'current-version')).toBe(false);
  });

  it('shows an update notice when versions differ', () => {
    expect(shouldShowAppUpdatedToast('current-version', 'new-version')).toBe(true);
  });

  it('normalizes invalid app version responses to missing metadata', () => {
    expect(parseAppVersionResponse({ deploymentVersion: '' })).toEqual({ deploymentVersion: null });
    expect(parseAppVersionResponse({ deploymentVersion: 123 })).toEqual({ deploymentVersion: null });
    expect(parseAppVersionResponse({})).toEqual({ deploymentVersion: null });
  });
});
