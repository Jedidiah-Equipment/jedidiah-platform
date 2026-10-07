import type { FormIssue } from './form-issues.js';
import { stableSerialize } from './stable-serialize.js';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

export type AutosaveSnapshot<TValues> = {
  getValues: () => TValues;
  save: (values: TValues, saved: TValues) => Promise<void>;
  serialize?: (values: TValues) => string;
  /** Every blocking problem with `values`; empty means saveable. */
  validate: (values: TValues) => readonly FormIssue[];
};

export type AutosaveControllerState = {
  errorMessage: string | null;
  hasUnsavedChanges: boolean;
  /**
   * What is blocking the save, so the banner can name it and the owning rows can highlight
   * themselves. Field-level error meta cannot carry cross-field rules (a duplicate part is a
   * property of the array, not of either row), so this list is the one source both surfaces read.
   */
  issues: readonly FormIssue[];
  shouldBlockNavigation: boolean;
  status: AutosaveStatus;
};

type AutosaveStateListener = (state: AutosaveControllerState) => void;

export function createAutosaveController<TValues extends Record<string, unknown>>({
  getValues,
  save,
  serialize = stableSerialize,
  validate,
}: AutosaveSnapshot<TValues>) {
  const listeners = new Set<AutosaveStateListener>();
  let lastSavedValues = getValues();
  let lastSavedSnapshot = serialize(lastSavedValues);
  let pendingSnapshot: string | null = null;
  let savePromise: Promise<boolean> | null = null;
  let state: AutosaveControllerState = {
    errorMessage: null,
    hasUnsavedChanges: false,
    issues: [],
    shouldBlockNavigation: false,
    status: 'idle',
  };

  function updateState(nextState: Partial<AutosaveControllerState>) {
    state = { ...state, ...nextState };
    listeners.forEach((listener) => {
      listener(state);
    });
  }

  async function flush(): Promise<boolean> {
    const values = getValues();
    const currentSnapshot = serialize(values);

    if (!savePromise && currentSnapshot === lastSavedSnapshot && state.status !== 'error') {
      updateState({
        errorMessage: null,
        hasUnsavedChanges: false,
        issues: [],
        shouldBlockNavigation: false,
        status: 'saved',
      });
      return true;
    }

    const issues = validate(values);

    if (issues.length > 0) {
      pendingSnapshot = currentSnapshot;
      updateState({
        errorMessage: 'Fix the highlighted fields before leaving this page.',
        hasUnsavedChanges: true,
        issues,
        shouldBlockNavigation: true,
        status: 'invalid',
      });
      return false;
    }

    if (savePromise) {
      pendingSnapshot = currentSnapshot;
      return savePromise;
    }

    pendingSnapshot = currentSnapshot;
    updateState({
      errorMessage: null,
      hasUnsavedChanges: true,
      issues: [],
      shouldBlockNavigation: false,
      status: 'saving',
    });

    const savedAtRequest = lastSavedValues;
    const activeSavePromise = save(values, savedAtRequest)
      .then(() => {
        // A refetch may have confirmed newer fields during the request. Acknowledge the request only
        // where the baseline is still the one it started with; never acknowledge newer local edits.
        const saved = { ...lastSavedValues };
        for (const key of Object.keys(values) as (keyof TValues)[]) {
          if (stableSerialize(lastSavedValues[key]) === stableSerialize(savedAtRequest[key])) {
            saved[key] = values[key];
          }
        }
        lastSavedValues = saved;
        lastSavedSnapshot = serialize(saved);
        const hasUnsavedChanges = serialize(getValues()) !== lastSavedSnapshot;
        if (hasUnsavedChanges && pendingSnapshot !== null && pendingSnapshot !== currentSnapshot) {
          savePromise = null;
          return flush();
        }

        pendingSnapshot = null;
        updateState({
          errorMessage: null,
          hasUnsavedChanges,
          issues: [],
          shouldBlockNavigation: false,
          status: hasUnsavedChanges ? 'idle' : 'saved',
        });
        return true;
      })
      .catch((error: unknown) => {
        updateState({
          errorMessage: error instanceof Error ? error.message : 'Unable to save.',
          hasUnsavedChanges: true,
          issues: [],
          shouldBlockNavigation: true,
          status: 'error',
        });
        return false;
      })
      .finally(() => {
        if (savePromise === activeSavePromise) {
          savePromise = null;
        }
      });
    savePromise = activeSavePromise;

    return savePromise;
  }

  function markChanged() {
    const currentSnapshot = serialize(getValues());
    if (currentSnapshot === lastSavedSnapshot) {
      pendingSnapshot = savePromise ? currentSnapshot : null;
      updateState({
        hasUnsavedChanges: savePromise !== null,
        shouldBlockNavigation: false,
        status: savePromise ? 'saving' : 'saved',
      });
      return;
    }

    pendingSnapshot = currentSnapshot;
    updateState({
      hasUnsavedChanges: true,
      shouldBlockNavigation: state.status === 'invalid' || state.status === 'error',
      status: state.status === 'saving' ? 'saving' : 'idle',
    });
  }

  return {
    flush,
    getSavedValues: () => lastSavedValues,
    getState: () => state,
    hasPendingChanges: () => state.hasUnsavedChanges || serialize(getValues()) !== lastSavedSnapshot,
    markChanged,
    retry: flush,
    subscribe(listener: AutosaveStateListener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    updateSavedValues(values: TValues) {
      lastSavedValues = values;
      lastSavedSnapshot = serialize(values);
      // Refetching detects unsaved typing but does not commit it. Only markChanged/flush queue a save.
      if (!savePromise && pendingSnapshot === lastSavedSnapshot) pendingSnapshot = null;
      const hasUnsavedChanges = savePromise !== null || serialize(getValues()) !== lastSavedSnapshot;
      updateState({
        errorMessage: hasUnsavedChanges ? state.errorMessage : null,
        hasUnsavedChanges,
        issues: hasUnsavedChanges ? state.issues : [],
        shouldBlockNavigation: hasUnsavedChanges && state.shouldBlockNavigation,
        status: savePromise ? 'saving' : hasUnsavedChanges ? state.status : 'saved',
      });
    },
  };
}
