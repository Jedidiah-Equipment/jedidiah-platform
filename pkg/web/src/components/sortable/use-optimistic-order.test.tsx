/** @vitest-environment jsdom */

import type { DragEndEvent } from '@dnd-kit/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useOptimisticOrder } from './use-optimistic-order.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

type Row = { id: string };
const served = (...ids: string[]): Row[] => ids.map((id) => ({ id }));
const drop = (active: string, over: string | null) =>
  ({ active: { id: active }, over: over === null ? null : { id: over } }) as unknown as DragEndEvent;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function mount(rows: Row[] | undefined, save: (orderedIds: string[]) => Promise<unknown>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const probe: { current: ReturnType<typeof useOptimisticOrder<Row>> | null } = { current: null };
  function Probe({ rows }: { rows: Row[] | undefined }) {
    probe.current = useOptimisticOrder(rows, save);
    return null;
  }
  async function render(next: Row[] | undefined) {
    await act(async () => root.render(<Probe rows={next} />));
  }
  await render(rows);
  const state = () => {
    if (!probe.current) throw new Error('Probe not rendered');
    return probe.current;
  };
  const ids = () => state().rows.map((row) => row.id);
  return { render, state, ids };
}

it('shows a drop at once and saves the new order', async () => {
  const pending = deferred();
  const save = vi.fn(() => pending.promise);
  const { state, ids } = await mount(served('a', 'b', 'c'), save);
  await act(async () => state().onDragEnd(drop('c', 'a')));
  expect(ids()).toEqual(['c', 'a', 'b']);
  expect(save).toHaveBeenCalledExactlyOnceWith(['c', 'a', 'b']);
  expect(state().isSaving).toBe(true);
  await act(async () => pending.resolve());
  expect(state().isSaving).toBe(false);
  expect(ids()).toEqual(['c', 'a', 'b']);
});

it('restores the served order when the save is refused', async () => {
  const save = vi.fn(() => Promise.reject(new Error('refused')));
  const { state, ids } = await mount(served('a', 'b', 'c'), save);
  await act(async () => state().onDragEnd(drop('c', 'a')));
  expect(ids()).toEqual(['a', 'b', 'c']);
  expect(state().isSaving).toBe(false);
});

it('ignores drops while a save is in flight', async () => {
  const pending = deferred();
  const save = vi.fn(() => pending.promise);
  const { state } = await mount(served('a', 'b', 'c'), save);
  await act(async () => state().onDragEnd(drop('c', 'a')));
  await act(async () => state().onDragEnd(drop('a', 'b')));
  expect(save).toHaveBeenCalledOnce();
  await act(async () => pending.resolve());
});

it('ignores a drop on itself, outside the list, or on an unknown row', async () => {
  const save = vi.fn(() => Promise.resolve());
  const { state, ids } = await mount(served('a', 'b', 'c'), save);
  await act(async () => state().onDragEnd(drop('a', 'a')));
  await act(async () => state().onDragEnd(drop('a', null)));
  await act(async () => state().onDragEnd(drop('a', 'z')));
  expect(save).not.toHaveBeenCalled();
  expect(ids()).toEqual(['a', 'b', 'c']);
});

it('resyncs when the served rows change', async () => {
  const { render, ids } = await mount(
    served('a', 'b', 'c'),
    vi.fn(() => Promise.resolve()),
  );
  await render(served('b', 'a', 'c'));
  expect(ids()).toEqual(['b', 'a', 'c']);
});

it('keeps the list empty until rows are served', async () => {
  const { render, ids } = await mount(
    undefined,
    vi.fn(() => Promise.resolve()),
  );
  expect(ids()).toEqual([]);
  await render(served('a', 'b'));
  expect(ids()).toEqual(['a', 'b']);
});
