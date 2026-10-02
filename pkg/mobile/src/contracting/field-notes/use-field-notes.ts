import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { apiBaseUrl } from '@/lib/api-base-url';
import { useAuthSession } from '@/lib/auth-session';
import { captureSanitizedException } from '@/lib/observability';
import { fieldNoteFiles } from './files';
import { createFieldNoteStore, type FieldNoteStore, fieldNotesStorageKey } from './store';

// One store per storage key for the life of the process, so an operator's writes always share one chain.
const stores = new Map<string, FieldNoteStore>();

function fieldNoteStore(userId: string): FieldNoteStore {
  const key = fieldNotesStorageKey(apiBaseUrl, userId);
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
}

/** The signed-in operator's Field Notes and the store that writes them; `notes` is null until the first read. */
export function useFieldNotes() {
  const store = fieldNoteStore(useAuthSession().user.id);
  const notes = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { notes, store };
}
