// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { departureBeforeArrivalSentence } from '@pkg/domain/contracting';
import type { Assignment, JobStatus, LatestTelematics, StintReading } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { TRPCProvider } from '@/lib/trpc.js';
import { StintHoursDialog, type StintHoursMode } from './StintHoursDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobHours: async () => undefined }),
}));

const reading = (hours: number) =>
  ({
    hours,
    at: '2026-10-28T08:00:00.000Z',
    byUserId: 'u1',
    byName: 'Sipho Dlamini',
    comment: null,
    telematics: null,
  }) as StintReading;
const stint = {
  id: '00000000-0000-4000-8000-000000000001',
  machineId: '00000000-0000-4000-8000-000000000002',
  machineCode: 'JD8R-1',
  categoryIcon: 'tractor',
  categoryColour: 'lime',
  arrival: reading(4400),
  departure: null,
} as unknown as Assignment;
const deere: LatestTelematics = { hours: 4512, at: '2026-10-28T12:05:00.000Z' as LatestTelematics['at'] };

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function mount(mode: StintHoursMode, target: Assignment, status: JobStatus = 'active') {
  const posted: Record<string, unknown> = {};
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://hours.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          if (path === 'contractingReadings.latestTelematics') return Response.json({ result: { data: deere } });
          posted[path] = JSON.parse(String(init?.body));
          return Response.json({ result: { data: null } });
        },
      }),
    ],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <StintHoursDialog
            target={{ mode, stint: target }}
            job={{ status, johnDeereDifferenceThresholdHours: 10 }}
            onClose={onClose}
          />
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );
  cleanups.push(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
    document.body.replaceChildren();
  });
  return { posted, onClose };
}

const save = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[type="submit"]')].find(
    (button) => button.textContent === 'Save hours',
  );
async function enter(name: string, value: string) {
  await act(async () => {
    const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (!field) throw new Error(`Missing field ${name}`);
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    field.focus();
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.blur();
  });
}

test('a departure shows John Deere under the hours, refuses one below the arrival and warns far from Deere', async () => {
  const { posted, onClose } = await mount('departure', stint);
  await vi.waitFor(() => expect(document.body.textContent).toContain('John Deere read 4 512.0 h'));

  await enter('hours', '4380');
  expect(document.body.textContent).toContain(departureBeforeArrivalSentence(4400));
  expect(save()?.disabled).toBe(true);

  await enter('hours', '4480');
  expect(document.body.textContent).not.toContain(departureBeforeArrivalSentence(4400));
  expect(document.body.textContent).toContain("That is 32.0 h away from John Deere's last reading of 4 512.0 h");
  expect(save()?.disabled).toBe(false);
  await act(async () => save()?.click());
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(posted['contractingJobs.assignments.captureHours']).toEqual({
    assignmentId: stint.id,
    role: 'departure',
    hours: 4480,
    comment: null,
  });
});

test('editing hours on a Completed Job asks for a reason before it saves', async () => {
  const { posted, onClose } = await mount('edit', { ...stint, departure: reading(4500) }, 'completed');
  await vi.waitFor(() => expect(document.querySelector('[name="reason"]')).not.toBeNull());
  await enter('departureHours', '4510');
  expect(save()?.disabled).toBe(true);
  await enter('reason', 'Misread the meter');
  expect(save()?.disabled).toBe(false);
  await act(async () => save()?.click());
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(posted['contractingJobs.assignments.editHours']).toMatchObject({
    assignmentId: stint.id,
    arrivalHours: 4400,
    departureHours: 4510,
    reason: 'Misread the meter',
  });
});
