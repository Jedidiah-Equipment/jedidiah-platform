import { describe, expect, test } from 'vitest';
import { appPermissionRow } from './app-permission-rows';

describe('appPermissionRow', () => {
  test('a permission never asked for offers Allow', () => {
    expect(appPermissionRow('camera', { status: 'undetermined', canAskAgain: true })).toMatchObject({
      label: 'Camera',
      statusLabel: 'Not asked yet',
      action: 'allow',
    });
  });

  test('a refusal the OS will still ask about again offers Allow, one it will not offers Open Settings', () => {
    expect(appPermissionRow('microphone', { status: 'denied', canAskAgain: true })).toMatchObject({
      statusLabel: 'Not allowed',
      action: 'allow',
    });
    expect(appPermissionRow('microphone', { status: 'denied', canAskAgain: false })).toMatchObject({
      statusLabel: 'Not allowed',
      action: 'open-settings',
    });
  });

  test('a granted permission needs nothing, and one the phone does not have is not listed', () => {
    expect(appPermissionRow('location', { status: 'granted', canAskAgain: true })).toMatchObject({
      statusLabel: 'Allowed',
      action: null,
    });
    expect(appPermissionRow('photos', 'unavailable')).toBeNull();
  });
});
