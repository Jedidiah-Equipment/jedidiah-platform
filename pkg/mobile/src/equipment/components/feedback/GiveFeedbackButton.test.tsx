import type { AppRouter } from '@pkg/api';
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
// The voice session is mocked at its module boundary; the form's wiring to it is real.
const reportSaved = vi.hoisted(() => vi.fn());
const useVoiceSession = vi.hoisted(() =>
  vi.fn((_scope: unknown, field: object) => ({ ...field, busy: false, snapshotSaved: () => reportSaved })),
);
vi.mock('@/components/voice/use-voice-session', () => ({ useVoiceSession }));
vi.mock('@/components/voice/VoiceTextArea', () => ({ VoiceTextArea: 'TextInput' }));

import { TRPCProvider } from '@/lib/trpc';
import { GiveFeedbackButton } from './GiveFeedbackButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await act(cleanup);
  vi.clearAllMocks();
});
const jobId = '00000000-0000-4000-8000-000000000007';

test('reports the Voice Notes in a Job feedback as saved once the feedback is accepted', async () => {
  const sent: unknown[] = [];
  const renderer = await mount(sent);

  await typeAndSubmit(renderer, 'Weld cracked on the drawbar');

  await vi.waitFor(() =>
    expect(sent).toEqual([
      { kind: 'general', subject: { subjectType: 'job', jobId }, text: 'Weld cracked on the drawbar' },
    ]),
  );
  expect(useVoiceSession).toHaveBeenCalledWith({ business: 'equipment', purpose: 'job feedback' }, expect.anything());
  await vi.waitFor(() => expect(reportSaved).toHaveBeenCalledTimes(1));
});

test('a refused Job feedback reports no Voice Note as saved', async () => {
  const renderer = await mount([], { refuse: true });

  await typeAndSubmit(renderer, 'Weld cracked on the drawbar');

  await vi.waitFor(() => expect(JSON.stringify(renderer.toJSON())).toContain('Job is closed.'));
  expect(reportSaved).not.toHaveBeenCalled();
});

async function typeAndSubmit(renderer: ReactTestRenderer, text: string) {
  await act(async () => renderer.root.findAllByProps({ accessibilityRole: 'button' })[0]?.props.onPress());
  await act(async () => renderer.root.findByType('TextInput' as never).props.voice.onChangeText(text));
  const submit = renderer.root
    .findAllByType('Pressable' as never)
    .find((node) => node.findAllByType('Text' as never).some((label) => String(label.children).startsWith('Submit')));
  expect(submit).toBeDefined();
  await act(async () => submit?.props.onPress());
}

async function mount(sent: unknown[] = [], { refuse = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://feedback.test/trpc',
        fetch: async (url, init) => {
          if (new URL(String(url)).pathname !== '/trpc/feedback.submit') throw new Error(`Unexpected request ${url}`);
          sent.push(JSON.parse(String(init?.body)));
          if (refuse)
            return Response.json(
              { error: { message: 'Job is closed.', code: -32600, data: { code: 'BAD_REQUEST', httpStatus: 400 } } },
              { status: 400 },
            );
          return Response.json({ result: { data: { id: jobId } } });
        },
      }),
    ],
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <TRPCProvider queryClient={client} trpcClient={trpcClient}>
          <GiveFeedbackButton jobCode="JOB-00007" jobId={jobId} />
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
