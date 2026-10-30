// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import { type ContractingSettings, ContractingSettingsUpdateInput } from '@pkg/schema/contracting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { SettingsPage } from './SettingsPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorReport: () => () => undefined,
  useApiMutationErrorToast: () => () => undefined,
}));

test('saves only on an explicit Save, resets to the saved row, and keeps a refused draft', async () => {
  let saved: ContractingSettings = {
    travelFlagThresholdHours: 4,
    johnDeereDifferenceThresholdHours: 10,
    serviceDueSoonThresholdHours: 100,
    utilisationTargetPercent: 70,
    updatedAt: '2026-10-12T08:00:00.000Z' as ContractingSettings['updatedAt'],
  };
  let refuseNextSave = false;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://settings.test/trpc',
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          if (path === 'auth.access')
            return Response.json({
              result: {
                data: createUserAccessSummary({
                  equipmentRole: null,
                  contractingRole: 'contracting-admin',
                  userId: 'admin',
                }),
              },
            });
          if (path === 'contractingSettings.update') {
            if (refuseNextSave)
              return Response.json(
                { error: { message: 'Settings are locked', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } },
                { status: 500 },
              );
            const input = ContractingSettingsUpdateInput.parse(JSON.parse(String(init?.body)));
            saved = { ...saved, ...input, updatedAt: '2026-10-12T09:00:00.000Z' as ContractingSettings['updatedAt'] };
          } else if (path !== 'contractingSettings.get') throw new Error(`Unexpected request ${path}`);
          return Response.json({ result: { data: saved } });
        },
      }),
    ],
  });
  const trpc = createTrpcOptions(queryClient, trpcClient);
  await queryClient.fetchQuery(trpc.auth.access.queryOptions());
  await queryClient.fetchQuery(trpc.contractingSettings.get.queryOptions());
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <SettingsPage tab="general" onTabChange={() => undefined} result={undefined} onResultShown={() => undefined} />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const field = (name: string) => {
    const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (!input) throw new Error(`Missing input ${name}`);
    return input;
  };
  const save = () => {
    const button = container.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) throw new Error('Missing Save');
    return button;
  };
  const edit = async (name: string, value: string) => {
    await act(async () => {
      const input = field(name);
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
    });
  };
  const submit = async () => {
    await act(async () => {
      save().click();
      await vi.waitFor(() => expect(queryClient.isMutating()).toBe(0));
    });
  };
  try {
    await act(async () => {
      await router.load();
      root.render(
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <RouterProvider router={router} />
          </TRPCProvider>
        </QueryClientProvider>,
      );
    });
    expect(field('utilisationTargetPercent').value).toBe('70');
    expect(save().disabled).toBe(true);

    // Save is enabled only while the draft differs from the saved row.
    await edit('travelFlagThresholdHours', '4.5');
    expect(save().disabled).toBe(false);
    await edit('travelFlagThresholdHours', '4.0');
    expect(save().disabled).toBe(true);

    // Typing changes nothing on the server until Save; clearing the target saves it as empty.
    await edit('travelFlagThresholdHours', '2.5');
    await edit('utilisationTargetPercent', '');
    expect(save().disabled).toBe(false);
    expect(saved.travelFlagThresholdHours).toBe(4);
    await submit();
    expect(saved).toMatchObject({ travelFlagThresholdHours: 2.5, utilisationTargetPercent: null });
    await vi.waitFor(() => expect(save().disabled).toBe(true));
    expect(field('travelFlagThresholdHours').value).toBe('2.5');
    expect(field('utilisationTargetPercent').value).toBe('');

    // The saved row is the new baseline, and a cleared target matches an empty one.
    await edit('travelFlagThresholdHours', '4');
    expect(save().disabled).toBe(false);
    await edit('travelFlagThresholdHours', '2.5');
    await edit('utilisationTargetPercent', '25');
    expect(save().disabled).toBe(false);
    await edit('utilisationTargetPercent', '');
    expect(save().disabled).toBe(true);

    // A refused save keeps the draft on screen with the error, ready to retry.
    refuseNextSave = true;
    await edit('serviceDueSoonThresholdHours', '150');
    await submit();
    expect(saved.serviceDueSoonThresholdHours).toBe(100);
    expect(field('serviceDueSoonThresholdHours').value).toBe('150');
    expect(save().disabled).toBe(false);
    // The mutation settles before React paints its error, so wait for the message rather than assert at once.
    await vi.waitFor(() => expect(container.textContent).toContain('Settings are locked'));
    refuseNextSave = false;
    await submit();
    expect(saved.serviceDueSoonThresholdHours).toBe(150);
    await vi.waitFor(() => expect(save().disabled).toBe(true));
  } finally {
    await act(async () => {
      root.unmount();
    });
    queryClient.clear();
    container.remove();
    scroll.mockRestore();
  }
});

test('switches between General and the John Deere tab through the URL', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const requested: string[] = [];
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://settings.test/trpc',
        fetch: async (input) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          requested.push(path);
          if (path === 'contractingJohnDeere.status')
            return Response.json({
              result: {
                data: {
                  configured: false,
                  status: 'not-connected',
                  organizations: [],
                  connectedBy: null,
                  connectedAt: null,
                  lastPolledAt: null,
                  lastError: null,
                },
              },
            });
          throw new Error(`Unexpected request ${path}`);
        },
      }),
    ],
  });
  const onTabChange = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (tab: 'general' | 'john-deere') =>
    act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
            <SettingsPage tab={tab} onTabChange={onTabChange} result={undefined} onResultShown={() => undefined} />
          </TRPCProvider>
        </QueryClientProvider>,
      );
    });
  try {
    await render('general');
    const trigger = [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'John Deere');
    await act(async () => (trigger as HTMLElement | undefined)?.click());
    expect(onTabChange).toHaveBeenCalledWith('john-deere');

    await render('john-deere');
    await vi.waitFor(() => expect(container.textContent).toContain('Not configured'));
    // Each tab reads only its own data.
    expect(requested).toEqual(['contractingSettings.get', 'contractingJohnDeere.status']);
  } finally {
    await act(async () => root.unmount());
    queryClient.clear();
    container.remove();
  }
});
