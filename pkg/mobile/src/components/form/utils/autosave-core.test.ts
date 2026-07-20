import { describe, expect, it, vi } from 'vitest';

import { createAutosaveController } from './autosave-core';

describe('mobile autosave controller', () => {
  it('saves changed valid values once and treats them as the new baseline', async () => {
    let values = { notes: 'First' };
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.notes.trim().length > 0,
      save,
    });

    values = { notes: 'Updated' };
    controller.markChanged();

    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ notes: 'Updated' });
    expect(controller.getState()).toMatchObject({ hasUnsavedChanges: false, status: 'saved' });

    await expect(controller.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it('holds invalid values locally without calling the mutation', async () => {
    let values = { notes: 'First' };
    const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createAutosaveController({
      getValues: () => values,
      isValid: (candidate) => candidate.notes.trim().length > 0,
      save,
    });

    values = { notes: '' };
    controller.markChanged();

    await expect(controller.flush()).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ hasUnsavedChanges: true, status: 'invalid' });
  });

  it('saves the latest values after an in-flight save finishes', async () => {
    let values = { notes: 'First' };
    let releaseFirstSave: () => void = () => undefined;
    const save = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirstSave = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const controller = createAutosaveController({ getValues: () => values, isValid: () => true, save });

    values = { notes: 'Second' };
    controller.markChanged();
    const firstFlush = controller.flush();
    values = { notes: 'Third' };
    controller.markChanged();
    const secondFlush = controller.flush();
    releaseFirstSave();

    await expect(firstFlush).resolves.toBe(true);
    await expect(secondFlush).resolves.toBe(true);
    expect(save).toHaveBeenNthCalledWith(1, { notes: 'Second' });
    expect(save).toHaveBeenNthCalledWith(2, { notes: 'Third' });
  });
});
