// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { PurchaseOrderCode } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TRPCProvider } from '@/lib/trpc.js';
import { GiveFeedbackButton } from './GiveFeedbackButton.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: Array<() => void> = [];
afterEach(async () => {
  for (const cleanup of mounted.splice(0)) await act(cleanup);
});
const order = {
  id: '00000000-0000-4000-8000-000000000042',
  code: PurchaseOrderCode.parse(42),
  supplierName: 'Mount Fifty',
};
const subject = { subjectType: 'job' as const, jobId: '00000000-0000-4000-8000-000000000001' };

it('hides Send PO Feedback when the Job has no linked orders', async () => {
  await mount(<GiveFeedbackButton purchaseOrders={[]} subject={subject} subjectLabel="JOB-00001" />);
  expect(document.body.textContent).not.toContain('Send PO Feedback');
});

it('preselects the sole linked PO and submits General Feedback without a Kind or visibility banner', async () => {
  const sent: unknown[] = [];
  await mount(<GiveFeedbackButton purchaseOrders={[order]} subject={subject} subjectLabel="JOB-00001" />, sent);
  await act(async () => findButton('Send PO Feedback').click());
  expect(document.body.textContent).toContain('PO-00042 · Mount Fifty');
  expect(document.body.textContent).not.toContain('Kind');
  expect(document.body.textContent).not.toContain('PUBLIC');
  expect(document.body.textContent).not.toContain('PRIVATE');
  const textarea = document.querySelector('textarea');
  if (!textarea) throw new Error('Missing feedback textbox');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'Delivery tomorrow');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => findButton('Submit Feedback').click());
  await vi.waitFor(() =>
    expect(sent).toEqual([
      {
        kind: 'general',
        subject: { subjectType: 'purchase-order', purchaseOrderId: order.id },
        text: 'Delivery tomorrow',
      },
    ]),
  );
});

it('opens the order form directly with only Feedback and the public description', async () => {
  await mount(
    <GiveFeedbackButton
      subject={{ subjectType: 'purchase-order', purchaseOrderId: order.id }}
      subjectLabel="PO-00042"
    />,
  );
  await act(async () => findButton('Send Feedback').click());
  expect(document.body.textContent).toContain(
    'Share feedback about PO-00042. Everyone who can view this Purchase Order or its linked Jobs will see it.',
  );
  expect(document.body.textContent).not.toContain('Kind');
  expect(document.body.textContent).not.toContain('PUBLIC');
  expect(findButton('Submit Feedback')).toBeDefined();
});

function findButton(label: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  return button;
}

async function mount(node: React.ReactNode, sent: unknown[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://feedback.test/trpc',
        fetch: async (url, init) => {
          const path = new URL(String(url)).pathname;
          if (path !== '/trpc/feedback.submit') throw new Error(`Unexpected request ${path}`);
          sent.push(JSON.parse(String(init?.body)));
          return Response.json({ result: { data: { id: order.id } } });
        },
      }),
    ],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push(() => {
    root.unmount();
    container.remove();
    client.clear();
  });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <TRPCProvider queryClient={client} trpcClient={trpcClient}>
          {node}
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );
}
