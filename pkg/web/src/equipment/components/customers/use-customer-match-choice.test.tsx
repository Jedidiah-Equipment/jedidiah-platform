// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { TRPCProvider } from '@/lib/trpc.js';
import { useCustomerMatchChoice } from './use-customer-match-choice.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a lookup from an earlier dialog opening cannot continue creation after reopening', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let respond = (_response: Response) => {};
  const response = new Promise<Response>((done) => {
    respond = done;
  });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [httpLink({ url: 'http://customer-matches.test/trpc', fetch: () => response })],
  });
  let choose: ReturnType<typeof useCustomerMatchChoice>['choose'] = async () => null;
  function Harness({ open }: { open: boolean }) {
    choose = useCustomerMatchChoice(open).choose;
    return null;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (open: boolean) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <Harness open={open} />
          </TRPCProvider>
        </QueryClientProvider>,
      );
    });
  try {
    await render(true);
    const pending = choose('Previous company');
    await render(false);
    await render(true);
    await act(async () => {
      respond(Response.json({ result: { data: [] } }));
      // Returning "new" here would let the old submission create and close the new dialog.
      expect(await pending).toBeNull();
    });
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
  }
});
