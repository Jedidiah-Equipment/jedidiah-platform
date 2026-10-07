import { createAutosaveController, stableSerialize, toFormIssues } from '@pkg/domain';
import { useBlocker } from '@tanstack/react-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { getApiMutationErrorMessage } from '@/lib/api-errors.js';
import { flushAfterFormStateCommit } from './autosave-timing.js';
import { useAppForm } from './use-app-form.js';

type AutosaveTrigger = 'blur' | 'change' | 'none';

type UseAutosaveFormOptions<TValues extends Record<string, unknown>, TInput> = {
  defaultValues: TValues;
  /** A read-only record never saves: flushing succeeds without a request and leaving is never blocked. */
  enabled?: boolean;
  failureMessage: string;
  onSaved?: (input: TInput) => Promise<void> | void;
  save: (input: TInput) => Promise<unknown>;
  /** The request for `values`; `saved` is what the server last confirmed, for a write that sends only what changed. */
  toInput: (values: TValues, saved: TValues) => TInput;
  validator: z.ZodType<TValues, TValues>;
};

const TEXT_INPUT_TYPES = new Set(['', 'email', 'number', 'password', 'search', 'tel', 'text', 'url']);

export function useAutosaveForm<TValues extends Record<string, unknown>, TInput>({
  defaultValues,
  enabled = true,
  failureMessage,
  onSaved,
  save,
  toInput,
  validator,
}: UseAutosaveFormOptions<TValues, TInput>) {
  const optionsRef = useRef({ enabled, failureMessage, onSaved, save, toInput, validator });
  optionsRef.current = { enabled, failureMessage, onSaved, save, toInput, validator };

  const form = useAppForm({
    defaultValues,
    validators: {
      onBlur: validator,
      onChange: validator,
      onSubmit: validator,
    },
    onSubmit: () => undefined,
  });
  const formRef = useRef(form);
  formRef.current = form;

  const controllerRef = useRef<ReturnType<typeof createAutosaveController<TValues>> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createAutosaveController<TValues>({
      getValues: () => formRef.current.state.values as TValues,
      save: async (values, saved) => {
        const input = optionsRef.current.toInput(values, saved);

        try {
          await optionsRef.current.save(input);
          await optionsRef.current.onSaved?.(input);
        } catch (error) {
          const message = getApiMutationErrorMessage(error, optionsRef.current.failureMessage);
          toast.error(message, {
            action: {
              label: 'Retry',
              onClick: () => {
                if (optionsRef.current.enabled) void controllerRef.current?.retry();
              },
            },
          });
          throw new Error(message);
        }
      },
      validate: (values) => {
        const result = optionsRef.current.validator.safeParse(values);

        return result.success ? [] : toFormIssues(result.error.issues);
      },
    });
  }

  const controller = controllerRef.current;
  const subscribe = useCallback(
    (listener: () => void) => {
      return controller.subscribe(listener);
    },
    [controller],
  );
  const autosaveState = useSyncExternalStore(subscribe, controller.getState, controller.getState);

  // A field still at its previous default adopts a refetched one, so a sibling write lands in the form without the
  // next flush posting server data back as though someone had edited it; a field someone is editing keeps the edit.
  const defaultValuesRef = useRef(defaultValues);
  defaultValuesRef.current = defaultValues;
  const defaultSnapshot = stableSerialize(defaultValues);
  const syncedDefaultsRef = useRef(defaultValues);
  useEffect(() => {
    const previous = syncedDefaultsRef.current;
    if (stableSerialize(previous) === defaultSnapshot) return;
    const defaults = defaultValuesRef.current;
    syncedDefaultsRef.current = defaults;
    const values = formRef.current.state.values as TValues;
    const saved = { ...controller.getSavedValues() };
    for (const key of Object.keys(defaults) as (keyof TValues & string)[]) {
      const current = stableSerialize(values[key]);
      if (current !== stableSerialize(defaults[key])) {
        if (current !== stableSerialize(previous[key])) continue;
        formRef.current.setFieldValue(key, defaults[key] as never, { dontUpdateMeta: true });
      }
      saved[key] = defaults[key];
    }
    if (stableSerialize(saved) === stableSerialize(controller.getSavedValues())) return;
    controller.updateSavedValues(saved);
  }, [controller, defaultSnapshot]);

  const flush = useCallback(async () => {
    if (!optionsRef.current.enabled) return true;

    const result = optionsRef.current.validator.safeParse(formRef.current.state.values);
    if (!result.success) {
      void formRef.current.handleSubmit();
    }

    return controller.flush();
  }, [controller]);

  const hasPendingChanges = useCallback(
    () => optionsRef.current.enabled && controller.hasPendingChanges(),
    [controller],
  );

  const markChanged = useCallback(() => {
    controller.markChanged();
  }, [controller]);

  // Save a discrete field (Select, checkbox) immediately. The microtask defers the flush until
  // after the field's onChange has committed its value into form state.
  const commit = useCallback(() => {
    markChanged();
    flushAfterFormStateCommit(() => {
      void flush();
    });
  }, [flush, markChanged]);

  const retry = useCallback(async () => {
    return flush();
  }, [flush]);

  const resetToSavedValues = useCallback(
    (values: TValues) => {
      formRef.current.reset(values);
      controller.updateSavedValues(values);
    },
    [controller],
  );

  const formProps = useMemo(
    () => ({
      onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
        if (getAutosaveTrigger(event.target) === 'blur') {
          markChanged();
          flushAfterFormStateCommit(() => {
            void flush();
          });
        }
      },
      onChange: (event: React.ChangeEvent<HTMLFormElement>) => {
        if (getAutosaveTrigger(event.target) === 'change') {
          markChanged();
          void flush();
        }
      },
      onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        event.stopPropagation();
        void flush();
      },
    }),
    [flush, markChanged],
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingChanges()) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  useBlocker({
    shouldBlockFn: async ({ current, next }) => {
      const didSave = await flush();
      // Moving between tabs of the same editor only changes the search params. Invalid or failed values
      // must not trap the user on the tab they need to leave to fix them — but they still flush first.
      if (current.pathname === next.pathname) return false;
      return !didSave && controller.getState().shouldBlockNavigation;
    },
    enableBeforeUnload: hasPendingChanges,
  });

  return {
    autosave: {
      commit,
      flush,
      hasPendingChanges,
      markChanged,
      resetToSavedValues,
      retry,
      state: autosaveState,
    },
    form,
    formProps,
  };
}

function getAutosaveTrigger(target: EventTarget | null): AutosaveTrigger {
  if (target instanceof HTMLTextAreaElement) {
    return 'blur';
  }

  if (target instanceof HTMLSelectElement) {
    return 'change';
  }

  if (!(target instanceof HTMLInputElement)) {
    return 'none';
  }

  if (TEXT_INPUT_TYPES.has(target.type)) {
    return 'blur';
  }

  return 'change';
}
