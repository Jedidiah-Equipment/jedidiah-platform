/** @vitest-environment jsdom */

import { formatDate } from '@pkg/domain';
import { DateIso } from '@pkg/schema';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { type DialogReading, ReadingDialog } from './ReadingDialog.js';

const idle = { reset: () => undefined, mutate: () => undefined, mutateAsync: async () => undefined, error: null };
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));
vi.mock('@/contracting/hooks/use-reading-review.js', () => ({
  useReadingReview: () => ({ amend: idle, reverify: idle }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: undefined, error: null, refetch: async () => undefined }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const machine = { machineCode: 'BEL14-1', categoryIcon: 'tractor', categoryColour: 'lime' } as const;
const readAt = DateIso.parse('2026-10-25T13:03:00.000Z');
const reading: DialogReading = {
  id: '00000000-0000-4000-8000-000000000001',
  role: 'arrival',
  value: 6537.4,
  capturedAt: readAt,
  createdAt: readAt,
  capturedByUserId: 'henk',
  capturedByName: 'Henk Botha',
  method: 'manual',
  comment: null,
  aiValue: null,
  aiConfidence: null,
  aiVerification: 'not-applicable',
  aiHint: null,
  disputed: false,
  disputeReason: null,
  evidenceReviewedAt: null,
  amendedAt: null,
  amendedByName: null,
  amendmentReason: null,
  photoBacked: false,
};

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function show(overrides: Partial<DialogReading>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ReadingDialog selected={{ reading: { ...reading, ...overrides }, machine }} onClose={vi.fn()} amendReadings />
      </QueryClientProvider>,
    ),
  );
  return document.body.textContent ?? '';
}

it('says when a backdated reading was saved, and only then', async () => {
  const savedAt = DateIso.parse('2026-10-27T16:17:00.000Z');
  expect(await show({})).not.toContain('saved');
  const text = await show({ createdAt: savedAt });
  expect(text).toContain(`Read At ${formatDate(readAt, 'medium')}`);
  expect(text).toContain(`saved ${formatDate(savedAt, 'medium')}`);
});

it('shows the AI assessment only for a reading with a photo', async () => {
  expect(await show({})).not.toContain('AI assessment of the photo');
  expect(await show({ photoBacked: true, method: 'photo', aiVerification: 'pending' })).toContain(
    'AI assessment of the photo',
  );
});
