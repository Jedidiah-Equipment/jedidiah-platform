import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test, vi } from 'vitest';
import { createFieldNoteStore, FieldNoteError, type FieldNoteFiles, fieldNotesStorageKey } from './store';

const NOTE_NEEDS_CONTENT = 'A Field Note needs a description or a photo.';
let clock = Date.parse('2026-10-01T06:00:00Z');

function fakeFiles(overrides: Partial<FieldNoteFiles> = {}) {
  const files: FieldNoteFiles = {
    photoLimit: 12,
    keep: vi.fn(async (_source, noteId, photoId) => ({ uri: `field-notes/${noteId}/${photoId}.jpg`, inGallery: true })),
    removePhoto: vi.fn(async () => {}),
    removeNote: vi.fn(async () => {}),
    ...overrides,
  };
  return files;
}

const KEY = 'contracting:field-notes:v1:https://api.test:user-1';

function store(key = KEY, files = fakeFiles(), onError?: Parameters<typeof createFieldNoteStore>[0]['onError']) {
  const now = () => {
    clock += 60_000;
    return new Date(clock);
  };
  return createFieldNoteStore({ storage: AsyncStorage, key, files, now, onError });
}

function nextPublish(notes: ReturnType<typeof store>) {
  return new Promise<void>((resolve) => {
    const unsubscribe = notes.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('refuses an empty note and keeps a trimmed description or a photo', async () => {
  const notes = store();
  await expect(notes.create({ description: '   ', photos: [] })).rejects.toThrow(NOTE_NEEDS_CONTENT);

  const { note: written } = await notes.create({ description: '  T12 at Rietfontein, 4211.5  ', photos: [] });
  const { note: photographed } = await notes.create({
    description: '',
    photos: [{ uri: 'file:///camera/1.jpg', source: 'camera' }],
  });

  expect(written).toMatchObject({ description: 'T12 at Rietfontein, 4211.5', status: 'open', photos: [] });
  expect(photographed.photos).toEqual([
    { id: expect.any(String), uri: `field-notes/${photographed.id}/${photographed.photos[0]?.id}.jpg` },
  ]);
  expect((await store().list()).map((note) => note.id)).toEqual([written.id, photographed.id]);
});

test('closes, reopens, and deletes a note with its files', async () => {
  const files = fakeFiles();
  const notes = store(undefined, files);
  const { note } = await notes.create({ description: 'Meter fogged', photos: [] });

  await notes.close(note.id);
  expect((await notes.list())[0]?.status).toBe('closed');
  await notes.reopen(note.id);
  expect((await notes.list())[0]?.status).toBe('open');

  await notes.remove(note.id);
  expect(await notes.list()).toEqual([]);
  expect(files.removeNote).toHaveBeenCalledWith(note.id);
});

test('refuses to remove the last photo of a note without a description', async () => {
  const files = fakeFiles();
  const notes = store(undefined, files);
  const { note } = await notes.create({
    description: '',
    photos: [
      { uri: 'file:///camera/1.jpg', source: 'camera' },
      { uri: 'file:///gallery/2.jpg', source: 'gallery' },
    ],
  });
  const [first, second] = note.photos;

  await notes.removePhoto(note.id, first?.id ?? '');
  expect(files.removePhoto).toHaveBeenCalledWith(first?.uri);
  await expect(notes.removePhoto(note.id, second?.id ?? '')).rejects.toThrow(NOTE_NEEDS_CONTENT);
  await expect(notes.setDescription(note.id, ' ')).resolves.toBeUndefined();
  expect((await notes.list())[0]?.photos).toEqual([second]);
});

test('a photo the gallery refused stays on the note and is reported once', async () => {
  const files = fakeFiles({
    keep: vi.fn(async (_source, noteId, photoId, source) => ({
      uri: `field-notes/${noteId}/${photoId}.jpg`,
      inGallery: source === 'gallery',
    })),
  });
  const notes = store(undefined, files);
  const { note, galleryFailed } = await notes.create({
    description: '',
    photos: [{ uri: 'file:///camera/1.jpg', source: 'camera' }],
  });
  expect(galleryFailed).toBe(true);
  expect(note.photos).toHaveLength(1);

  const added = await notes.addPhotos(note.id, [{ uri: 'file:///gallery/2.jpg', source: 'gallery' }]);
  expect(added.galleryFailed).toBe(false);
  expect((await notes.list())[0]?.photos).toHaveLength(2);
});

test('keeps at most the photo limit on a note', async () => {
  const files = fakeFiles({ photoLimit: 2 });
  const notes = store(undefined, files);
  const { note } = await notes.create({ description: 'x', photos: [{ uri: 'file:///1.jpg', source: 'camera' }] });

  await notes.addPhotos(note.id, [
    { uri: 'file:///2.jpg', source: 'gallery' },
    { uri: 'file:///3.jpg', source: 'gallery' },
  ]);

  expect((await notes.list())[0]?.photos).toHaveLength(2);
  expect(files.keep).toHaveBeenCalledTimes(2);
});

test('each operator has their own notes, under a key the legacy purge leaves alone', async () => {
  expect(fieldNotesStorageKey('https://api.test', 'user-1')).toBe('contracting:field-notes:v1:https://api.test:user-1');
  await store('contracting:field-notes:v1:https://api.test:user-1').create({ description: 'mine', photos: [] });
  expect(await store('contracting:field-notes:v1:https://api.test:user-2').list()).toEqual([]);
});

test('serializes concurrent writes so none is lost', async () => {
  const notes = store();
  await Promise.all(['a', 'b', 'c'].map((description) => notes.create({ description, photos: [] })));
  const [first] = await notes.list();
  await Promise.all([notes.close(first?.id ?? ''), notes.setDescription(first?.id ?? '', 'a, edited')]);

  const listed = await notes.list();
  expect(listed.map((note) => note.description).sort()).toEqual(['a, edited', 'b', 'c']);
  expect(listed.find((note) => note.description === 'a, edited')?.status).toBe('closed');
});

test('corrupt storage falls back to an empty list and drops rows that no longer parse', async () => {
  const key = 'contracting:field-notes:v1:https://api.test:user-1';
  const { note } = await store(key).create({ description: 'valid', photos: [] });
  const raw = JSON.parse((await AsyncStorage.getItem(key)) ?? '[]');
  await AsyncStorage.setItem(key, JSON.stringify([...raw, { id: 'not-a-note' }]));
  expect((await store(key).list()).map((row) => row.id)).toEqual([note.id]);

  await AsyncStorage.setItem(key, '{not json');
  expect(await store(key).list()).toEqual([]);
});

test('names refusals as Field Note errors', async () => {
  await expect(store().close('missing')).rejects.toBeInstanceOf(FieldNoteError);
});

test('the snapshot is null until the first subscription reads storage', async () => {
  const { note } = await store().create({ description: 'T12 at Rietfontein', photos: [] });
  const notes = store();
  expect(notes.getSnapshot()).toBeNull();

  await nextPublish(notes);

  expect(notes.getSnapshot()).toEqual([note]);
});

test('a write publishes what it wrote, and the snapshot keeps its identity until the next write', async () => {
  const notes = store();
  const listener = vi.fn();
  notes.subscribe(listener);
  await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

  const { note } = await notes.create({ description: 'Meter fogged', photos: [] });
  expect(listener).toHaveBeenCalledTimes(2);
  const created = notes.getSnapshot();
  expect(notes.getSnapshot()).toBe(created);

  await notes.close(note.id);
  expect(notes.getSnapshot()).not.toBe(created);
  expect(notes.getSnapshot()).toEqual([{ ...note, status: 'closed' }]);
});

test('a failed first read publishes an empty list and reports it', async () => {
  const failure = new Error('storage unavailable');
  vi.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(failure);
  const onError = vi.fn();
  const notes = store(KEY, fakeFiles(), onError);

  await nextPublish(notes);

  expect(notes.getSnapshot()).toEqual([]);
  expect(onError).toHaveBeenCalledWith(failure, 'read');
});
