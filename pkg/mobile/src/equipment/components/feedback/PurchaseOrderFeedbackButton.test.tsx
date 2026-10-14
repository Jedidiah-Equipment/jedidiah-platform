import type { AppRouter } from '@pkg/api';
import { FeedbackPurchaseOrder } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Modal: 'Modal',
  Platform: { OS: 'ios' },
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: 'SafeAreaProvider',
  SafeAreaView: 'SafeAreaView',
}));
vi.mock('@tabler/icons-react-native', () => ({
  IconEye: 'IconEye',
  IconLock: 'IconLock',
  IconMessagePlus: 'IconMessagePlus',
  IconShoppingCart: 'IconShoppingCart',
  IconX: 'IconX',
  IconCheck: 'IconCheck',
  IconChevronDown: 'IconChevronDown',
}));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/components/ui/toast', () => ({ useAppToast: () => vi.fn() }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'light' }) }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
vi.mock('nativewind', () => ({ vars: (value: unknown) => value }));
vi.mock('@/lib/api-base-url', () => ({ apiBaseUrl: 'http://feedback.test' }));
vi.mock('@/lib/auth', () => ({ sessionCookieHeader: () => '' }));
vi.mock('@/lib/observability', () => ({ addBreadcrumb: vi.fn() }));
// Unused field types contain native pickers; keep the actual form, SelectField and TextareaField.
vi.mock('@/components/form/fields/CurrencyField', () => ({ CurrencyField: 'CurrencyField' }));
vi.mock('@/components/form/fields/DateField', () => ({ DateField: 'DateField' }));
vi.mock('@/components/form/fields/MultiSelectField', () => ({ MultiSelectField: 'MultiSelectField' }));
vi.mock('@/components/form/fields/NumberField', () => ({ NumberField: 'NumberField' }));
vi.mock('@/components/form/fields/SearchSelectField', () => ({ SearchSelectField: 'SearchSelectField' }));
vi.mock('@/components/form/fields/SegmentedField', () => ({ SegmentedField: 'SegmentedField' }));
vi.mock('@/components/form/fields/TextField', () => ({ TextField: 'TextField' }));

import { TRPCProvider } from '@/lib/trpc';
import { PurchaseOrderFeedbackButton } from './PurchaseOrderFeedbackButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await act(cleanup);
});
const order = FeedbackPurchaseOrder.parse({
  id: '00000000-0000-4000-8000-000000000042',
  code: 42,
  supplierName: 'Mount Fifty',
});

test('hides Send PO Feedback without linked orders', async () => {
  const renderer = await mount([]);
  expect(renderer.toJSON()).toBeNull();
});

test('preselects the only linked PO and submits General Feedback from the full-screen modal', async () => {
  const sent: unknown[] = [];
  const renderer = await mount([order], sent);
  await act(async () => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
  expect(renderer.root.findByType('Modal' as never).props.transparent).toBe(false);
  const content = JSON.stringify(renderer.toJSON());
  expect(content).toContain('PO-00042 · Mount Fifty');
  expect(content).not.toContain('Who is this about?');
  expect(content).not.toContain('Public:');
  expect(content).not.toContain('Private:');
  await act(async () => renderer.root.findByType('TextInput' as never).props.onChangeText('Delivery tomorrow'));
  const submit = renderer.root
    .findAllByType('Pressable' as never)
    .find((node) => node.findAllByType('Text' as never).some((text) => text.children.includes('Submit Feedback')));
  expect(submit).toBeDefined();
  await act(async () => submit?.props.onPress());
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

async function mount(purchaseOrders: FeedbackPurchaseOrder[], sent: unknown[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://feedback.test/trpc',
        fetch: async (url, init) => {
          if (new URL(String(url)).pathname !== '/trpc/feedback.submit') throw new Error(`Unexpected request ${url}`);
          sent.push(JSON.parse(String(init?.body)));
          return Response.json({ result: { data: { id: order.id } } });
        },
      }),
    ],
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <TRPCProvider queryClient={client} trpcClient={trpcClient}>
          <PurchaseOrderFeedbackButton jobCode="JOB-00001" purchaseOrders={purchaseOrders} />
        </TRPCProvider>
      </QueryClientProvider>,
    );
  });
  cleanups.push(() => {
    renderer.unmount();
    client.clear();
  });
  return renderer;
}
