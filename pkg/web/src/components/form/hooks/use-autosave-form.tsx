import { useBlocker } from '@tanstack/react-router';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';

import { getApiMutationErrorMessage } from '@/lib/api-errors.js';
import { createAutosaveController } from '../utils/autosave-core.js';
import { useAppForm } from './use-app-form.js';

type AutosaveTrigger = 'blur' | 'change' | 'none';

type UseAutosaveFormOptions<TValues extends Record<string, unknown>, TInput> = {
  defaultValues: TValues;
  failureMessage: string;
  onSaved?: (input: TInput) => Promise<void> | void;
  save: (input: TInput) => Promise<unknown>;
  toInput: (values: TValues) => TInput;
  validator: z.ZodType<TValues, TValues>;
};

const TEXT_INPUT_TYPES = new Set(['', 'email', 'number', 'password', 'search', 'tel', 'text', 'url']);

export function useAutosaveForm<TValues extends Record<string, unknown>, TInput>({
  defaultValues,
  failureMessage,
  onSaved,
  save,
  toInput,
  validator,
}: UseAutosaveFormOptions<TValues, TInput>) {
  const optionsRef = useRef({ failureMessage, onSaved, save, toInput, validator });
  optionsRef.current = { failureMessage, onSaved, save, toInput, validator };

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
      isValid: (values) => optionsRef.current.validator.safeParse(values).success,
      save: async (values) => {
        const input = optionsRef.current.toInput(values);

        try {
          await optionsRef.current.save(input);
          await optionsRef.current.onSaved?.(input);
        } catch (error) {
          const message = getApiMutationErrorMessage(error, optionsRef.current.failureMessage);
          toast.error(message, {
            action: {
              label: 'Retry',
              onClick: () => {
                void controllerRef.current?.retry();
              },
            },
          });
          throw new Error(message);
        }
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

  const flush = useCallback(async () => {
    const result = optionsRef.current.validator.safeParse(formRef.current.state.values);
    if (!result.success) {
      void formRef.current.handleSubmit();
    }

    return controller.flush();
  }, [controller]);

  const markChanged = useCallback(() => {
    controller.markChanged();
  }, [controller]);

  const retry = useCallback(async () => {
    return flush();
  }, [flush]);

  const formProps = useMemo(
    () => ({
      onBlur: (event: React.FocusEvent<HTMLFormElement>) => {
        if (getAutosaveTrigger(event.target) === 'blur') {
          markChanged();
          void flush();
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
      if (!controller.hasPendingChanges()) {
        return;
      }

      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [controller]);

  useBlocker({
    shouldBlockFn: async () => {
      const didSave = await flush();
      return !didSave && controller.getState().shouldBlockNavigation;
    },
    enableBeforeUnload: () => controller.hasPendingChanges(),
  });

  return {
    autosave: {
      flush,
      markChanged,
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
