import { expect, test, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.33.0' } } }));
vi.mock('expo-updates', () => ({ updateId: 'update-1' }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'https://api.example.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: vi.fn(async () => null) }));
vi.mock('@/lib/authed-fetch', () => ({ withSessionCookie: (init: RequestInit) => init }));

import { ReadingSyncError } from './reading-queue';
import { readingSyncTelemetryPayload } from './reading-telemetry';

test('reports bounded sync diagnostics without machine, photo-path, or comment data', () => {
  const payload = readingSyncTelemetryPayload(
    {
      error: new ReadingSyncError('reading.photo_unavailable', 'private device path'),
      item: {
        localId: '60c09019-bb71-4ca6-a3b1-3a4614493169',
        machineId: '5dfce55f-5fd7-4c5d-8ad5-6d6ed09fb345',
        role: 'spot',
        value: 100,
        capturedAt: '2026-09-15T10:47:25.000Z',
        photoLocalUri: 'file:///private/container/readings/private.jpg',
        comment: 'private operator note',
        disputePrevious: false,
      },
      stage: 'prepare_photo',
    },
    Date.parse('2026-09-17T10:47:25.000Z'),
  );

  expect(payload).toEqual({
    event: 'reading sync failed',
    properties: {
      appVersion: '1.33.0',
      code: 'reading.photo_unavailable',
      hasPhoto: true,
      platform: 'ios',
      queueAgeSeconds: 172_800,
      role: 'spot',
      stage: 'prepare_photo',
      updateId: 'update-1',
    },
  });
  expect(JSON.stringify(payload)).not.toContain('private operator note');
  expect(JSON.stringify(payload)).not.toContain('5dfce55f');
  expect(JSON.stringify(payload)).not.toContain('private/container');
});
