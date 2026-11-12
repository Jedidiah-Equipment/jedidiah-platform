// @vitest-environment jsdom

import { deriveQuoteActions } from '@pkg/domain/equipment';
import { accessForRole } from '@pkg/domain/testing';
import type { EquipmentRole } from '@pkg/schema';
import type { QuoteDeliveryTerms, QuoteDetail, QuoteStage } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    quotes: new Proxy({}, { get: () => ({ mutationOptions: (options: unknown) => options }) }),
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ error: null, isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({ useQueryInvalidation: () => ({}) }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('@/components/help/index.js', () => ({ HelpLink: () => null }));
vi.mock('@/components/common/RemoveEntityButton.js', () => ({ RemoveEntityDialog: () => null }));
vi.mock('@/components/form/ReasonDialog.js', () => ({ ReasonDialog: () => null }));
vi.mock('./QuoteStampInvoiceDialog.js', () => ({ QuoteStampInvoiceDialog: () => null }));

import { QuoteStageCard } from './QuoteStageCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  toastError.mockReset();
});

function renderCard({
  deliveryTerms = 'included',
  flushAutosave = async () => true,
  role,
  stage,
}: {
  deliveryTerms?: QuoteDeliveryTerms;
  flushAutosave?: () => Promise<boolean>;
  role: EquipmentRole;
  stage: QuoteStage;
}) {
  const quote = {
    actions: deriveQuoteActions({ deliveryTerms, stage }, accessForRole(role, 'auth-user-1')),
    code: 'QUO-00241',
    id: '550e8400-e29b-41d4-a716-446655440000',
    invoiceNumber: null,
    sentBackNote: null,
    stage,
  } as unknown as QuoteDetail;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  act(() => root.render(<QuoteStageCard flushAutosave={flushAutosave} quote={quote} />));
  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  return { button, container };
}

describe('QuoteStageCard', () => {
  it('hides what the person may never do and disables, with the reason, what the stage refuses', () => {
    const { button } = renderCard({ role: 'admin', stage: 'awaiting-pricing' });

    expect(button('Send for approval')?.disabled).toBe(false);
    expect(button('Approve')).toBeUndefined();
    expect(button('Send back')).toBeUndefined();
    expect(button('Remove')).toBeUndefined();
    expect(button('Enter Invoice Number')?.disabled).toBe(true);
    expect(button('Enter Invoice Number')?.title).toBe(
      'You can only enter an Invoice Number while it is Awaiting invoice.',
    );
  });

  it('disables Send for approval until delivery is confirmed, and says so', () => {
    const { button, container } = renderCard({ deliveryTerms: 'tbc', role: 'admin', stage: 'awaiting-pricing' });

    expect(button('Send for approval')?.disabled).toBe(true);
    expect(button('Send for approval')?.title).toBe('Confirm delivery before sending this quote for approval.');
    expect(container.textContent).toContain('Confirm delivery before sending this quote for approval.');
  });

  it('keeps focus in the field being edited on mousedown, so the autosave banner cannot move the button away', () => {
    const { button } = renderCard({ role: 'admin', stage: 'awaiting-pricing' });
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

    button('Send for approval')?.dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
  });

  it('waits on an invalid pending edit and says why', async () => {
    const { button } = renderCard({
      flushAutosave: async () => false,
      role: 'admin',
      stage: 'awaiting-pricing',
    });

    await act(async () => button('Send for approval')?.click());

    expect(toastError).toHaveBeenCalledWith('Fix the highlighted quote fields before moving the quote.');
    expect(document.body.textContent).not.toContain('Send QUO-00241 for approval?');
  });
});
