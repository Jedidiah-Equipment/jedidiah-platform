import { UUID } from '@pkg/schema';
import { z } from 'zod';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import type { PhotoSource, PickedPhoto } from '@/contracting/lib/photo-picker';
import { newLocalId } from '@/contracting/readings/capture-attempt';

export const FIELD_NOTE_DESCRIPTION_MAX = 2000;
const NEEDS_CONTENT = 'A Field Note needs a description or a photo.';
const GONE = 'This Field Note no longer exists.';

/** One JSON array per API and signed-in operator: someone else signing in on the phone sees none of it. */
export const fieldNotesStorageKey = (apiBaseUrl: string, userId: string) =>
  contractingStorageKey('field-notes', 'v1', apiBaseUrl, userId);

/** `uri` is sandbox-relative on a phone (`field-notes/<noteId>/<photoId>.jpg`) and a data URI on web. */
export const FieldNotePhoto = z.object({ id: UUID, uri: z.string() }).strict();
export type FieldNotePhoto = z.infer<typeof FieldNotePhoto>;
export const FieldNote = z
  .object({
    id: UUID,
    createdAt: z.iso.datetime({ offset: true }),
    description: z.string().max(FIELD_NOTE_DESCRIPTION_MAX),
    status: z.enum(['open', 'closed']),
    photos: z.array(FieldNotePhoto),
  })
  .strict();
export type FieldNote = z.infer<typeof FieldNote>;

export type FieldNoteFiles = {
  photoLimit: number;
  /** Copies the photo into the note's own storage; `inGallery` is false when a camera photo missed the album. */
  keep(sourceUri: string, noteId: string, photoId: string, source: PhotoSource): Promise<KeptPhoto>;
  removePhoto(uri: string): Promise<void>;
  removeNote(noteId: string): Promise<void>;
};
type KeptPhoto = { uri: string; inGallery: boolean };

export class FieldNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldNoteError';
  }
}

type StorePorts = {
  storage: { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
  key: string;
  files: FieldNoteFiles;
  now?: () => Date;
  onError?: (error: unknown, operation: 'read' | 'cleanup_photo') => void;
};

/** One operator's Field Notes as one JSON array; every write is serialized behind the one before it. */
export function createFieldNoteStore({ storage, key, files, now = () => new Date(), onError }: StorePorts) {
  let writes: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  async function read(): Promise<FieldNote[]> {
    const raw = await storage.getItem(key);
    const rows = raw ? parseJson(raw, onError) : [];
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((row) => {
      const parsed = FieldNote.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  }
  function mutate<T>(change: (notes: FieldNote[]) => { notes: FieldNote[]; result: T }): Promise<T> {
    const result = writes.then(async () => {
      const next = change(await read());
      await storage.setItem(key, JSON.stringify(next.notes));
      for (const listener of listeners) listener();
      return next.result;
    });
    // The caller receives `result`; this handler only keeps the serialization chain usable after a failure.
    writes = result.then(undefined, () => undefined);
    return result;
  }
  function edit(noteId: string, change: (note: FieldNote) => FieldNote) {
    return mutate((notes) => {
      if (!notes.some((note) => note.id === noteId)) throw new FieldNoteError(GONE);
      return { notes: notes.map((note) => (note.id === noteId ? change(note) : note)), result: undefined };
    });
  }
  async function list() {
    await writes;
    return read();
  }

  return {
    list,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Mints the note, copies its photos, then writes it; nothing is written for a refused draft. */
    async create(draft: { description: string; photos: readonly PickedPhoto[] }) {
      const description = draft.description.trim().slice(0, FIELD_NOTE_DESCRIPTION_MAX);
      if (!description && draft.photos.length === 0) throw new FieldNoteError(NEEDS_CONTENT);
      const id = newLocalId();
      const { photos, galleryFailed } = await keepPhotos(id, draft.photos.slice(0, files.photoLimit));
      const note: FieldNote = { id, createdAt: now().toISOString(), description, status: 'open', photos };
      try {
        await mutate((notes) => ({ notes: [...notes, note], result: undefined }));
      } catch (error) {
        await files.removeNote(id).catch((cleanup) => onError?.(cleanup, 'cleanup_photo'));
        throw error;
      }
      return { note, galleryFailed };
    },
    setDescription(noteId: string, text: string) {
      const description = text.trim().slice(0, FIELD_NOTE_DESCRIPTION_MAX);
      return edit(noteId, (note) => {
        if (!description && note.photos.length === 0) throw new FieldNoteError(NEEDS_CONTENT);
        return { ...note, description };
      });
    },
    async addPhotos(noteId: string, picked: readonly PickedPhoto[]) {
      const current = (await list()).find((note) => note.id === noteId);
      if (!current) throw new FieldNoteError(GONE);
      const room = Math.max(0, files.photoLimit - current.photos.length);
      const { photos, galleryFailed } = await keepPhotos(noteId, picked.slice(0, room));
      let dropped: FieldNotePhoto[] = photos;
      try {
        await edit(noteId, (note) => {
          const all = [...note.photos, ...photos];
          dropped = all.slice(files.photoLimit);
          return { ...note, photos: all.slice(0, files.photoLimit) };
        });
      } finally {
        await Promise.all(dropped.map((photo) => cleanup(photo.uri)));
      }
      return { galleryFailed };
    },
    async removePhoto(noteId: string, photoId: string) {
      let removed: FieldNotePhoto | undefined;
      await edit(noteId, (note) => {
        removed = note.photos.find((photo) => photo.id === photoId);
        const photos = note.photos.filter((photo) => photo.id !== photoId);
        if (!note.description && photos.length === 0) throw new FieldNoteError(NEEDS_CONTENT);
        return { ...note, photos };
      });
      if (removed) await cleanup(removed.uri);
    },
    close: (noteId: string) => edit(noteId, (note) => ({ ...note, status: 'closed' })),
    reopen: (noteId: string) => edit(noteId, (note) => ({ ...note, status: 'open' })),
    /** Drops the note and its own copies; the gallery keeps every photo it was given. */
    async remove(noteId: string) {
      await mutate((notes) => ({ notes: notes.filter((note) => note.id !== noteId), result: undefined }));
      await files.removeNote(noteId).catch((error) => onError?.(error, 'cleanup_photo'));
    },
  };

  async function keepPhotos(noteId: string, picked: readonly PickedPhoto[]) {
    const kept: { photo: FieldNotePhoto; inGallery: boolean }[] = [];
    try {
      for (const { uri, source } of picked) {
        const id = newLocalId();
        const result = await files.keep(uri, noteId, id, source);
        kept.push({ photo: { id, uri: result.uri }, inGallery: result.inGallery });
      }
    } catch (error) {
      await Promise.all(kept.map(({ photo }) => cleanup(photo.uri)));
      throw error;
    }
    return { photos: kept.map(({ photo }) => photo), galleryFailed: kept.some(({ inGallery }) => !inGallery) };
  }
  function cleanup(uri: string) {
    return files.removePhoto(uri).catch((error) => onError?.(error, 'cleanup_photo'));
  }
}
export type FieldNoteStore = ReturnType<typeof createFieldNoteStore>;

function parseJson(raw: string, onError?: StorePorts['onError']): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    onError?.(error, 'read');
    return [];
  }
}
