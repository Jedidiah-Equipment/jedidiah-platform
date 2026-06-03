import { describe, expect, it, vi } from 'vitest';

import { createAutosaveController } from './autosave-core.js';

type TestValues = {
  name: string;
};

describe('createAutosaveController', () => {
  it('flushes changed valid values and does not resave unchanged values', async () => {
    let values: TestValues = { name: 'Acme' };
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.name.trim().length > 0,
      save,
    });

    values = { name: 'Bolt Co' };
    controller.markChanged();

    expect(controller.hasPendingChanges()).toBe(true);
    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ name: 'Bolt Co' });
    expect(controller.getState()).toMatchObject({
      hasUnsavedChanges: false,
      shouldBlockNavigation: false,
      status: 'saved',
    });

    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(controller.hasPendingChanges()).toBe(false);
  });

  it('detects pending typed values before an autosave event marks them changed', () => {
    let values: TestValues = { name: 'Acme' };
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.name.trim().length > 0,
      save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    });

    values = { name: 'Bolt Co' };

    expect(controller.getState().hasUnsavedChanges).toBe(false);
    expect(controller.hasPendingChanges()).toBe(true);
  });

  it('blocks navigation when pending values are invalid', async () => {
    let values: TestValues = { name: 'Acme' };
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.name.trim().length > 0,
      save,
    });

    values = { name: '' };
    controller.markChanged();

    await expect(controller.flush()).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      hasUnsavedChanges: true,
      shouldBlockNavigation: true,
      status: 'invalid',
    });
  });

  it('keeps failed values unsaved until retry succeeds', async () => {
    let values: TestValues = { name: 'Acme' };
    const save = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('Nope')).mockResolvedValueOnce(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.name.trim().length > 0,
      save,
    });

    values = { name: 'Bolt Co' };
    controller.markChanged();

    await expect(controller.flush()).resolves.toBe(false);
    expect(controller.getState()).toMatchObject({
      errorMessage: 'Nope',
      hasUnsavedChanges: true,
      shouldBlockNavigation: true,
      status: 'error',
    });

    await expect(controller.retry()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ name: 'Bolt Co' });
    expect(controller.getState()).toMatchObject({
      hasUnsavedChanges: false,
      shouldBlockNavigation: false,
      status: 'saved',
    });
  });

  it('saves the latest pending values after an in-flight save finishes', async () => {
    let values: TestValues = { name: 'Acme' };
    let resolveFirstSave: () => void = () => undefined;
    const save = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.name.trim().length > 0,
      save,
    });

    values = { name: 'Bolt Co' };
    controller.markChanged();
    const firstFlush = controller.flush();

    values = { name: 'Bolt Co Updated' };
    controller.markChanged();
    const secondFlush = controller.flush();
    resolveFirstSave();

    await expect(firstFlush).resolves.toBe(true);
    await expect(secondFlush).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(1, { name: 'Bolt Co' });
    expect(save).toHaveBeenNthCalledWith(2, { name: 'Bolt Co Updated' });
    expect(controller.hasPendingChanges()).toBe(false);
  });
});
