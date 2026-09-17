import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test } from 'vitest';
import { createReadingQueue, newLocalId } from './reading-queue';

const ids = new Map<string, string>();
const id = (name: string) => {
  if (!ids.has(name)) ids.set(name, newLocalId());
  return ids.get(name) as string;
};
const capture = (localId: string, capturedAt = '2026-09-08T08:00:00Z', machineId = 'machine-1') => ({
  localId: id(localId),
  machineId: id(machineId),
  role: 'spot' as const,
  value: 123.4,
  capturedAt,
  photoLocalUri: 'file:///readings/meter.jpg',
  disputePrevious: false,
  expectedPreviousId: id('server-previous'),
  comment: null,
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
    { localId: id('one'), photoLocalUri: 'file:///readings/meter.jpg' },
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
    if (item.localId === id('earlier'))
      throw new ReadingSyncError('reading.below_latest', 'Another reading landed first');
  });
  expect(sent).toEqual([id('earlier'), id('other')]);
  expect(await queue.list()).toMatchObject([
    { localId: id('later') },
    { localId: id('earlier'), disputePrevious: false, attention: { code: 'reading.below_latest' } },
  ]);
  await queue.resubmit(id('earlier'), id('latest-server-reading'));
  await queue.sync(async (item) => {
    sent.push(item.localId);
    if (item.localId === id('earlier'))
      expect(item).toMatchObject({ disputePrevious: true, expectedPreviousId: id('latest-server-reading') });
  });
  expect(sent).toEqual([id('earlier'), id('other'), id('earlier'), id('later')]);
  expect(await queue.list()).toEqual([]);
});

test('a refused arrival blocks its queued departure on the same Machine', async () => {
  const { ReadingSyncError } = await import('./reading-queue');
  const queue = createReadingQueue({ storage: AsyncStorage, key: 'operator-1', removePhoto: async () => {} });
  const assignmentId = id('assignment');
  await queue.enqueue({ ...capture('arrival'), role: 'arrival', assignmentId });
  await queue.enqueue({ ...capture('departure', '2026-09-08T09:00:00Z'), role: 'departure', assignmentId });
  const sent: string[] = [];

  await queue.sync(async (item) => {
    sent.push(item.role);
    throw new ReadingSyncError('reading.machine_on_site', 'Machine is still on another Job');
  });

  expect(sent).toEqual(['arrival']);
  const remaining = await queue.list();
  expect(remaining).toMatchObject([
    { role: 'arrival', attention: { code: 'reading.machine_on_site' } },
    { role: 'departure' },
  ]);
  expect(remaining[1]).not.toHaveProperty('attention');
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
  expect((await queue.list()).map((row) => row.localId)).toEqual([id('three')]);
  const other = createReadingQueue({ storage: AsyncStorage, key: 'operator-2', removePhoto: async () => {} });
  expect(await other.list()).toEqual([]);
  await queue.discard(id('three'));
  expect(await queue.list()).toEqual([]);
});

test('a stored row that no longer parses is dropped instead of breaking the queue', async () => {
  await AsyncStorage.setItem('operator-1', JSON.stringify([capture('valid'), { localId: 'not-a-capture' }]));
  const queue = createReadingQueue({ storage: AsyncStorage, key: 'operator-1', removePhoto: async () => {} });
  expect((await queue.list()).map((row) => row.localId)).toEqual([id('valid')]);
  await AsyncStorage.setItem('operator-1', '{not json');
  expect(await queue.list()).toEqual([]);
});
