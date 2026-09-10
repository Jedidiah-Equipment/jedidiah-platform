import { expect, test } from 'vitest';
import { latestKnownReading } from './latest-reading';

const queued = (localId: string, value: number, capturedAt: string, machineId = 'machine-1') => ({
  localId,
  machineId,
  role: 'spot' as const,
  value,
  capturedAt,
  photoLocalUri: null,
  disputePrevious: false,
  comment: null,
});
const synced = (id: string, value: number, capturedAt: string) => ({ id, value, capturedAt });

test('the minimum allowed value follows the newest capture on the phone or the server, and the server after sync', () => {
  const history = [synced('server-2', 120, '2026-09-08T09:00:00Z'), synced('server-1', 100, '2026-09-08T08:00:00Z')];
  expect(latestKnownReading('machine-1', [], history)).toEqual({ value: 120, id: 'server-2' });
  const local = [
    queued('local-old', 110, '2026-09-08T08:30:00Z'),
    queued('local-new', 130, '2026-09-08T10:00:00Z'),
    queued('other-machine', 999, '2026-09-08T11:00:00Z', 'machine-2'),
  ];
  expect(latestKnownReading('machine-1', local, history)).toEqual({ value: 130, id: 'local-new' });
  expect(latestKnownReading('machine-1', [local[0] as (typeof local)[number]], history)).toEqual({
    value: 120,
    id: 'server-2',
  });
  expect(latestKnownReading('machine-1', local, undefined)).toEqual({ value: 130, id: 'local-new' });
  expect(latestKnownReading('machine-1', [], [synced('server-3', 130, '2026-09-08T10:00:00Z'), ...history])).toEqual({
    value: 130,
    id: 'server-3',
  });
  expect(latestKnownReading('machine-1', [], undefined)).toBeUndefined();
});
