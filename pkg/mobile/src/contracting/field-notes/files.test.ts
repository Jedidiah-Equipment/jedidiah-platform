import { beforeEach, expect, test, vi } from 'vitest';

const fileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///current/Documents/', ...fileSystem }));

import { fieldNoteFiles, resolveFieldNotePhotoUri } from './files';

beforeEach(() => {
  vi.clearAllMocks();
});

test('copies a photo into the note’s sandbox folder and stores the sandbox-relative key', async () => {
  const kept = await fieldNoteFiles.keep('file:///picker/a.jpg', 'note-1', 'photo-1');

  expect(fileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///current/Documents/field-notes/note-1/', {
    intermediates: true,
  });
  expect(fileSystem.copyAsync).toHaveBeenCalledWith({
    from: 'file:///picker/a.jpg',
    to: 'file:///current/Documents/field-notes/note-1/photo-1.jpg',
  });
  expect(kept).toBe('field-notes/note-1/photo-1.jpg');
});

test('removing a note deletes its folder', async () => {
  await fieldNoteFiles.removeNote('note-1');

  expect(fileSystem.deleteAsync).toHaveBeenCalledWith('file:///current/Documents/field-notes/note-1/', {
    idempotent: true,
  });
});

test('resolves only keys inside the Field Note folder', () => {
  expect(resolveFieldNotePhotoUri('field-notes/note-1/photo-1.jpg')).toBe(
    'file:///current/Documents/field-notes/note-1/photo-1.jpg',
  );
  expect(() => resolveFieldNotePhotoUri('field-notes/../readings/x.jpg')).toThrow();
  expect(() => resolveFieldNotePhotoUri('readings/x.jpg')).toThrow();
});
