// @vitest-environment jsdom

import type { BreakdownPatchInput } from '@pkg/schema/contracting';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useAutosaveForm } from '@/components/form/hooks/use-autosave-form.js';
import { type ReportValues, reportPatchInput } from './types.js';

vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('saves edits made during a refetch without overwriting a later concurrent report change', async () => {
  const firstSave = deferredSave();
  const secondSave = deferredSave();
  const original: ReportValues = { description: 'Hose burst', urgency: 'code-red', jobId: '' };
  let server = original;
  const save = vi.fn(async (input: BreakdownPatchInput) => {
    if (save.mock.calls.length === 1) await firstSave.promise;
    else await secondSave.promise;
    server = {
      description: input.description ?? server.description,
      urgency: input.urgency ?? server.urgency,
      jobId: input.jobId === undefined ? server.jobId : (input.jobId ?? ''),
    };
  });
  const toInput = vi.fn((values: ReportValues, saved: ReportValues) => reportPatchInput('breakdown-1', saved, values));
  let editor: ReturnType<typeof useAutosaveForm<ReportValues, BreakdownPatchInput>> | undefined;
  function ReportForm({ defaults }: { defaults: ReportValues }) {
    editor = useAutosaveForm({
      defaultValues: defaults,
      failureMessage: 'Unable to update the report.',
      save,
      toInput,
      validator: z.object({
        description: z.string().min(1),
        urgency: z.enum(['code-red', 'code-green']),
        jobId: z.string(),
      }),
    });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ReportForm defaults={original} />));
    let flush: Promise<boolean> = Promise.resolve(false);
    act(() => {
      editor?.form.setFieldValue('description', 'Hose replaced');
      editor?.autosave.markChanged();
      flush = editor?.autosave.flush() ?? Promise.resolve(false);
    });
    expect(save).toHaveBeenCalledWith({ id: 'breakdown-1', description: 'Hose replaced' });
    server = { ...server, urgency: 'code-green' };
    await act(async () => root.render(<ReportForm defaults={server} />));
    expect(editor?.form.state.values).toEqual({ description: 'Hose replaced', urgency: 'code-green', jobId: '' });

    // Another editor changes urgency again before this page has refetched it.
    server = { ...server, urgency: 'code-red' };
    act(() => {
      editor?.form.setFieldValue('description', 'Hose replaced and tested');
      editor?.autosave.markChanged();
    });
    await act(async () => firstSave.resolve());
    expect(toInput).toHaveBeenLastCalledWith(
      { description: 'Hose replaced and tested', urgency: 'code-green', jobId: '' },
      { description: 'Hose replaced', urgency: 'code-green', jobId: '' },
    );
    expect(save).toHaveBeenLastCalledWith({ id: 'breakdown-1', description: 'Hose replaced and tested' });
    expect(editor?.autosave.state).toMatchObject({ hasUnsavedChanges: true, status: 'saving' });
    expect(editor?.autosave.hasPendingChanges()).toBe(true);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await act(async () => {
      secondSave.resolve();
      await expect(flush).resolves.toBe(true);
    });
    expect(server).toMatchObject({ description: 'Hose replaced and tested', urgency: 'code-red' });
    expect(editor?.autosave.state).toMatchObject({
      hasUnsavedChanges: false,
      shouldBlockNavigation: false,
      status: 'saved',
    });
    expect(editor?.autosave.hasPendingChanges()).toBe(false);
    expect(save).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

function deferredSave() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
