import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { z } from 'zod';

import { createAutosaveController } from '../utils/autosave-core';
import { useAppForm } from './use-app-form';

type UseAutosaveFormOptions<TValues extends Record<string, unknown>, TInput, TResult> = {
  defaultValues: TValues;
  failureMessage: string;
  onSaveError?: (error: unknown) => Promise<TValues | undefined>;
  onSaved?: (result: TResult) => Promise<void> | void;
  save: (input: TInput) => Promise<TResult>;
  toInput: (values: TValues) => TInput;
  validator: z.ZodType<TValues, TValues>;
};

export function useAutosaveForm<TValues extends Record<string, unknown>, TInput, TResult>({
  defaultValues,
  failureMessage,
  onSaveError,
  onSaved,
  save,
  toInput,
  validator,
}: UseAutosaveFormOptions<TValues, TInput, TResult>) {
  const optionsRef = useRef({ failureMessage, onSaveError, onSaved, save, toInput, validator });
  optionsRef.current = { failureMessage, onSaveError, onSaved, save, toInput, validator };
  const lastErrorRef = useRef<unknown>(null);
  const reconcilePromiseRef = useRef<Promise<void> | null>(null);

  const form = useAppForm({
    defaultValues,
    validators: { onBlur: validator, onChange: validator, onSubmit: validator },
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
        try {
          const result = await optionsRef.current.save(optionsRef.current.toInput(values));
          await optionsRef.current.onSaved?.(result);
        } catch (error) {
          lastErrorRef.current = error;
          throw new Error(errorMessage(error, optionsRef.current.failureMessage));
        }
      },
    });
  }

  const controller = controllerRef.current;
  const autosaveState = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  const reconcileAfterError = useCallback(async () => {
    if (!optionsRef.current.onSaveError || reconcilePromiseRef.current) return reconcilePromiseRef.current;

    const reconcilePromise = optionsRef.current
      .onSaveError(lastErrorRef.current)
      .then((values) => {
        if (!values) return;
        formRef.current.reset(values);
        controller.updateSavedValues(values);
      })
      .finally(() => {
        reconcilePromiseRef.current = null;
        lastErrorRef.current = null;
      });
    reconcilePromiseRef.current = reconcilePromise;
    return reconcilePromise;
  }, [controller]);

  const flush = useCallback(async () => {
    const result = optionsRef.current.validator.safeParse(formRef.current.state.values);
    if (!result.success) void formRef.current.handleSubmit();

    const saved = await controller.flush();
    if (!saved && controller.getState().status === 'error') await reconcileAfterError();
    return saved;
  }, [controller, reconcileAfterError]);

  const commit = useCallback(() => {
    controller.markChanged();
    queueMicrotask(() => void flush());
  }, [controller, flush]);

  const resetToSavedValues = useCallback(
    (values: TValues) => {
      formRef.current.reset(values);
      controller.updateSavedValues(values);
    },
    [controller],
  );

  return {
    autosave: {
      commit,
      flush,
      markChanged: controller.markChanged,
      resetToSavedValues,
      retry: flush,
      state: autosaveState,
    },
    form,
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
