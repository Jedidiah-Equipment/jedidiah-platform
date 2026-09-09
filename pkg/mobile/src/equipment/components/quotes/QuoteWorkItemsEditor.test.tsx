import type { QuoteDetail, QuoteUpdateInput } from '@pkg/schema/equipment';
import { useStore } from '@tanstack/react-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({
    laborRates: {
      billing: {
        queryOptions: () => ({
          queryKey: ['laborRates', 'billing'],
          queryFn: async () => ({ hoursPerWorkingDay: 9, rates: [{ department: 'fabrication', billingRate: 777 }] }),
        }),
      },
    },
  }),
}));

vi.mock('@tabler/icons-react-native', () => ({
  IconCheck: 'IconCheck',
  IconChevronDown: 'IconChevronDown',
  IconPlus: 'IconPlus',
  IconTrash: 'IconTrash',
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', TextInput: 'TextInput', View: 'View' }));
vi.mock('@/components/form/fields/DateField', () => ({ DateField: () => null }));
vi.mock('@/components/form/fields/MultiSelectField', () => ({ MultiSelectField: () => null }));
vi.mock('@/components/form/fields/SegmentedField', () => ({ SegmentedField: () => null }));
vi.mock('@/components/form/fields/TextareaField', () => ({ TextareaField: () => null }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'light' }) }));

import { useAutosaveForm } from '@/components/form';
import { getQuoteEditFormValuesValidator, type QuoteEditFormValues } from '@/equipment/lib/quote-presentation';
import { QuoteWorkItemsEditor } from './QuoteWorkItemsEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const defaultValues: QuoteEditFormValues = {
  cancellationReason: '',
  deliveryTerms: 'included',
  deliveryPrice: 0,
  depositPercent: 0,
  discountPercent: 0,
  documentNotes: '',
  invoiceNumber: '',
  notes: '',
  plannedDeliveryDate: '',
  preferredDeliveryDate: '',
  salesPersonId: 'auth-user-1',
  selectedAssemblies: [],
  status: 'accepted',
  validUntil: '',
  workItems: [
    {
      department: 'fabrication',
      description: 'Starter',
      formKey: 'work-item-test',
      hourlyRate: 550,
      hours: 0,
      name: '',
      parts: [],
    },
  ],
  workTitle: 'Repair',
};
const validator = getQuoteEditFormValuesValidator('custom');

function QueryHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['laborRates', 'billing'], {
    hoursPerWorkingDay: 9,
    rates: [{ department: 'fabrication', billingRate: 777 }],
  });
  return (
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>
  );
}

function Harness() {
  const { autosave, form } = useAutosaveForm<QuoteEditFormValues, QuoteUpdateInput, QuoteDetail>({
    defaultValues,
    failureMessage: 'Unable to update quote.',
    save: async () => ({}) as QuoteDetail,
    toInput: () => ({}) as QuoteUpdateInput,
    validator,
  });
  // QuoteDetailsScreen subscribes to all values to keep its live summary current.
  useStore(form.store, (state) => state.values);

  return (
    <form.AppForm>
      <QuoteWorkItemsEditor autosave={autosave} currencyCode="ZAR" form={form} readOnly={false} />
    </form.AppForm>
  );
}

describe('QuoteWorkItemsEditor', () => {
  test('keeps the Description input mounted through repeated backspace edits', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryHarness />);
    });
    const description = renderer.root.findByProps({ value: 'Starter' });

    for (const value of ['Starte', 'Start', 'Star', 'Sta', 'St', 'S', '']) {
      await act(async () => {
        description.props.onChangeText(value);
      });

      expect(renderer.root.findByProps({ value })).toBe(description);
    }
  });
});

test('seeds a new Work Item from billing while retaining the existing quoted rate', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<QueryHarness />);
  });
  const add = renderer.root
    .findAllByType('Pressable' as never)
    .find((button) => button.findAllByType('Text' as never).some((text) => text.children.includes('Add work item')));
  if (!add) throw new Error('Missing Add work item');
  await act(async () => {
    add.props.onPress();
  });
  const values = renderer.root.findAllByType('TextInput' as never).map((input) => input.props.value);
  expect(values).toContain('777');
  expect(values).toContain('550');
  await act(async () => {
    renderer.unmount();
  });
});
