/** @vitest-environment jsdom */

import { readAtFromInput, readAtInputValue } from '@pkg/domain/contracting';
import { DateIso } from '@pkg/schema';
import type { DisputeReading, ReadingDispute } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { DisputeResolveDialog } from './DisputeResolveDialog.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

const reading = (id: string, role: DisputeReading['role'], value: number, capturedAt: string): DisputeReading => ({
  id,
  machineId: '00000000-0000-4000-8000-0000000000aa',
  sequence: 1,
  role,
  value,
  capturedAt: DateIso.parse(capturedAt),
  createdAt: DateIso.parse(capturedAt),
  capturedByUserId: 'foreman',
  method: 'manual',
  telematicsProvider: null,
  comment: null,
  disputed: true,
  disputeReason: null,
  disputedPreviousId: null,
  amendedBy: null,
  amendedAt: null,
  amendmentReason: null,
  capturedByName: 'Sipho',
  stint: null,
});
const arrival = reading('00000000-0000-4000-8000-000000000001', 'arrival', 2906.7, '2026-10-27T13:00:42.000Z');
const departure = reading('00000000-0000-4000-8000-000000000002', 'departure', 2914.1, '2026-10-27T13:02:10.000Z');
const dispute: ReadingDispute = {
  id: arrival.id,
  machineId: arrival.machineId,
  machineCode: 'F720-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  readings: [arrival, departure],
  reported: {
    id: '00000000-0000-4000-8000-0000000000bb',
    value: 2927.2,
    capturedAt: DateIso.parse('2026-10-27T08:09:00.000Z'),
    telematicsProvider: 'john-deere',
  },
  reason: 'John Deere reported 2 927.2 h at 27 Oct 2026, 10:09.',
};

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

function button(label: string) {
  const result = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`Button missing: ${label}`);
  return result;
}

async function mount(error: unknown = null) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onResolve = vi.fn(async () => undefined);
  const onResolved = vi.fn();
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <DisputeResolveDialog
          dispute={dispute}
          onOpenChange={vi.fn()}
          onResolve={onResolve}
          onResolved={onResolved}
          error={error}
        />
      </QueryClientProvider>,
    );
  });
  return { onResolve, onResolved };
}

async function enter(name: string, value: string) {
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
  if (!input) throw new Error(`Field missing: ${name}`);
  await act(async () => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

it('shows what John Deere reported and posts each reading it contradicted under one reason', async () => {
  const { onResolve, onResolved } = await mount();
  expect(document.body.textContent).toContain('John Deere reported 2 927.2 h at 27 Oct 2026, 10:09.');
  await enter('readings[0].readAt-time', '07:30');
  await enter('readings[1].readAt-time', '09:00');
  await enter('reason', 'Captured the day after');
  await act(async () => button('Resolve').click());
  const day = readAtInputValue(new Date(arrival.capturedAt)).slice(0, 10);
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({
    amendments: [
      { id: arrival.id, value: 2906.7, capturedAt: readAtFromInput(`${day}T07:30`)?.toISOString() },
      { id: departure.id, value: 2914.1, capturedAt: readAtFromInput(`${day}T09:00`)?.toISOString() },
    ],
    reason: 'Captured the day after',
  });
  expect(onResolved).toHaveBeenCalledOnce();
});

it('marks the card the refusal names and shows its sentence', async () => {
  const sentence = '7.4 h of engine time cannot pass in 0.0 h of clock time since the arrival reading.';
  await mount({ message: sentence, data: { metadata: { readingId: departure.id } } });
  expect(document.body.textContent).toContain(sentence);
  expect([...document.querySelectorAll('[data-refused]')].map((card) => card.getAttribute('aria-label'))).toEqual([
    'Departure reading',
  ]);
});
