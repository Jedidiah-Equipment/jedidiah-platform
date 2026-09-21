import { expect, test, vi } from 'vitest';

const observability = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureEvent: vi.fn(),
  captureSanitizedException: vi.fn(),
}));

vi.mock('@/lib/observability', () => observability);

import { recordReadingSyncFailure } from './observability';
import { ReadingSyncError } from './readings/reading-queue';

test('reports bounded sync diagnostics without machine, photo-path, or comment data', () => {
  recordReadingSyncFailure(
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

  expect(observability.captureEvent).toHaveBeenCalledWith('reading sync failed', {
    code: 'reading.photo_unavailable',
    hasPhoto: true,
    queueAgeSeconds: 172_800,
    role: 'spot',
    stage: 'prepare_photo',
  });
  const sent = JSON.stringify([
    observability.captureEvent.mock.calls,
    observability.addBreadcrumb.mock.calls,
    observability.captureSanitizedException.mock.calls.map(([, message, properties]) => [message, properties]),
  ]);
  expect(sent).not.toContain('private operator note');
  expect(sent).not.toContain('5dfce55f');
  expect(sent).not.toContain('private/container');
});
