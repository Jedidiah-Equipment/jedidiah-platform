import type { QuoteDetail, QuoteUpdateInput } from '@pkg/schema';
import { useStore } from '@tanstack/react-form';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

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
  deliveryIncluded: true,
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
      renderer = create(<Harness />);
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
