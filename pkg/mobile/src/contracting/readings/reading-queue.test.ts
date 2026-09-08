import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test } from 'vitest';
import { createReadingQueue } from './reading-queue';

const capture = (localId: string, capturedAt = '2026-09-08T08:00:00Z', machineId = 'machine-1') => ({
  localId,
  machineId,
  role: 'spot' as const,
  value: 123.4,
  capturedAt,
  photoLocalUri: 'file:///readings/meter.jpg',
  disputePrevious: false,
});
beforeEach(() => AsyncStorage.clear());

test('a capture survives restart with its photo and only leaves storage after upload succeeds', async () => {
  const photos: string[] = [];
  const ports = {
    storage: AsyncStorage,
    key: 'operator-1',
    removePhoto: async (uri: string) => {
      photos.push(uri);
    },
  };
  await createReadingQueue(ports).enqueue(capture('one'));
  const restarted = createReadingQueue(ports);
  await expect(restarted.list()).resolves.toMatchObject([
    { localId: 'one', photoLocalUri: 'file:///readings/meter.jpg' },
  ]);
  await restarted.sync(async () => {
    throw new Error('offline');
  });
  expect(await restarted.list()).toHaveLength(1);
  expect(photos).toEqual([]);
  await restarted.sync(async (item) => {
    expect(item.value).toBe(123.4);
  });
  expect(await createReadingQueue(ports).list()).toEqual([]);
  expect(photos).toEqual(['file:///readings/meter.jpg']);
});

test('a race-lost capture blocks later captures on that machine until explicitly disputed', async () => {
  const { ReadingSyncError } = await import('./reading-queue');
  const queue = createReadingQueue({ storage: AsyncStorage, key: 'operator-1', removePhoto: async () => {} });
  await queue.enqueue(capture('later', '2026-09-08T09:00:00Z'));
  await queue.enqueue(capture('earlier'));
  await queue.enqueue(capture('other', '2026-09-08T08:30:00Z', 'machine-2'));
  const sent: string[] = [];
  await queue.sync(async (item) => {
    sent.push(item.localId);
    if (item.localId === 'earlier') throw new ReadingSyncError('reading.below_latest', 'Another reading landed first');
  });
  expect(sent).toEqual(['earlier', 'other']);
  expect(await queue.list()).toMatchObject([
    { localId: 'later' },
    { localId: 'earlier', disputePrevious: false, attention: { code: 'reading.below_latest' } },
  ]);
  await queue.resubmit('earlier');
  await queue.sync(async (item) => {
    sent.push(item.localId);
    if (item.localId === 'earlier') expect(item.disputePrevious).toBe(true);
  });
  expect(sent).toEqual(['earlier', 'other', 'earlier', 'later']);
  expect(await queue.list()).toEqual([]);
});

test('concurrent saves and sync preserve a newly captured reading and isolate operators', async () => {
  const queue = createReadingQueue({ storage: AsyncStorage, key: 'operator-1', removePhoto: async () => {} });
  await Promise.all([queue.enqueue(capture('one')), queue.enqueue(capture('two'))]);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  const upload = async (item: { localId: string }) => {
    sent.push(item.localId);
    await gate;
  };
  const first = queue.sync(upload);
  const second = queue.sync(upload);
  await queue.enqueue(capture('three'));
  release();
  await Promise.all([first, second]);
  expect(new Set(sent).size).toBe(sent.length);
  expect((await queue.list()).map((row) => row.localId)).toEqual(['three']);
  const other = createReadingQueue({ storage: AsyncStorage, key: 'operator-2', removePhoto: async () => {} });
  expect(await other.list()).toEqual([]);
  await queue.discard('three');
  expect(await queue.list()).toEqual([]);
});
