import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { recordFieldNoteChanged, recordFieldNoteCreated } from '@/contracting/observability';
import { apiBaseUrl } from '@/lib/api-base-url';
import { useAuthSession } from '@/lib/auth-session';
import { captureSanitizedException } from '@/lib/observability';
import { fieldNoteFiles } from './files';
import { createFieldNoteStore, type FieldNote, type FieldNoteStore, fieldNotesStorageKey } from './store';

// Outlives the provider, which remounts when the signed-in operator changes, so one operator's writes
// are always serialized through the same chain.
const stores = new Map<string, FieldNoteStore>();

type FieldNotesValue = Omit<FieldNoteStore, 'list' | 'subscribe'> & {
  /** Null until the stored notes have been read. */
  notes: FieldNote[] | null;
};
const Context = createContext<FieldNotesValue | null>(null);

export function FieldNotesProvider({ children }: { children: ReactNode }) {
  const session = useAuthSession();
  const key = fieldNotesStorageKey(apiBaseUrl, session.user.id);
  const store = useMemo(() => {
    let store = stores.get(key);
    if (!store) {
      store = createFieldNoteStore({
        storage: AsyncStorage,
        key,
        files: fieldNoteFiles,
        onError: (error, operation) =>
          captureSanitizedException(error, 'Field Note storage failed', { source: 'field_notes', stage: operation }),
      });
      stores.set(key, store);
    }
    return store;
  }, [key]);
  const [notes, setNotes] = useState<FieldNote[] | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void store
        .list()
        .then((rows) => {
          if (active) setNotes(rows);
        })
        .catch((error: unknown) => {
          captureSanitizedException(error, 'Field Note read failed', { source: 'field_notes', stage: 'list' });
          if (active) setNotes((current) => current ?? []);
        });
    };
    refresh();
    const unsubscribe = store.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);

  const value = useMemo<FieldNotesValue>(
    () => ({
      notes,
      async create(draft) {
        const created = await store.create(draft);
        recordFieldNoteCreated({
          hasPhoto: created.note.photos.length > 0,
          photoCount: created.note.photos.length,
          hasDescription: created.note.description.length > 0,
        });
        return created;
      },
      setDescription: store.setDescription,
      addPhotos: store.addPhotos,
      removePhoto: store.removePhoto,
      async close(noteId) {
        await store.close(noteId);
        recordFieldNoteChanged('closed');
      },
      async reopen(noteId) {
        await store.reopen(noteId);
        recordFieldNoteChanged('reopened');
      },
      async remove(noteId) {
        await store.remove(noteId);
        recordFieldNoteChanged('deleted');
      },
    }),
    [notes, store],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFieldNotes(): FieldNotesValue {
  const context = useContext(Context);
  if (!context) throw new Error('FieldNotesProvider is required');
  return context;
}
