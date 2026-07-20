export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

export type AutosaveControllerState = {
  errorMessage: string | null;
  hasUnsavedChanges: boolean;
  status: AutosaveStatus;
};

type AutosaveOptions<TValues> = {
  getValues: () => TValues;
  isValid: (values: TValues) => boolean;
  save: (values: TValues) => Promise<void>;
};

export function createAutosaveController<TValues>({ getValues, isValid, save }: AutosaveOptions<TValues>) {
  const listeners = new Set<() => void>();
  let lastSavedSnapshot = JSON.stringify(getValues());
  let pendingSnapshot: string | null = null;
  let savePromise: Promise<boolean> | null = null;
  let state: AutosaveControllerState = { errorMessage: null, hasUnsavedChanges: false, status: 'idle' };

  const updateState = (next: Partial<AutosaveControllerState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => {
      listener();
    });
  };

  async function flush(): Promise<boolean> {
    const values = getValues();
    const snapshot = JSON.stringify(values);

    if (snapshot === lastSavedSnapshot && state.status !== 'error') {
      updateState({ errorMessage: null, hasUnsavedChanges: false, status: 'saved' });
      return true;
    }

    if (!isValid(values)) {
      pendingSnapshot = snapshot;
      updateState({
        errorMessage: 'Fix the highlighted fields before leaving this page.',
        hasUnsavedChanges: true,
        status: 'invalid',
      });
      return false;
    }

    if (savePromise) return savePromise;

    pendingSnapshot = snapshot;
    updateState({ errorMessage: null, hasUnsavedChanges: true, status: 'saving' });
    const activeSave = save(values)
      .then(() => {
        lastSavedSnapshot = snapshot;
        if (pendingSnapshot !== null && pendingSnapshot !== snapshot) {
          savePromise = null;
          return flush();
        }

        pendingSnapshot = null;
        updateState({ errorMessage: null, hasUnsavedChanges: false, status: 'saved' });
        return true;
      })
      .catch((error: unknown) => {
        updateState({
          errorMessage: error instanceof Error ? error.message : 'Unable to save.',
          hasUnsavedChanges: true,
          status: 'error',
        });
        return false;
      })
      .finally(() => {
        if (savePromise === activeSave) savePromise = null;
      });
    savePromise = activeSave;
    return savePromise;
  }

  return {
    flush,
    getState: () => state,
    hasPendingChanges: () => state.hasUnsavedChanges || JSON.stringify(getValues()) !== lastSavedSnapshot,
    markChanged() {
      const snapshot = JSON.stringify(getValues());
      if (snapshot === lastSavedSnapshot) {
        updateState({ hasUnsavedChanges: false, status: state.status === 'saving' ? 'saving' : 'saved' });
        return;
      }

      pendingSnapshot = snapshot;
      updateState({ hasUnsavedChanges: true, status: state.status === 'saving' ? 'saving' : 'idle' });
    },
    retry: flush,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    updateSavedValues(values: TValues) {
      lastSavedSnapshot = JSON.stringify(values);
      pendingSnapshot = null;
      updateState({ errorMessage: null, hasUnsavedChanges: false, status: 'saved' });
    },
  };
}
