import type { QuoteDetail, QuoteInventoryPartOption, QuoteUpdateInput } from '@pkg/schema/equipment';
import { useStore } from '@tanstack/react-form';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

const INVENTORY_PARTS: QuoteInventoryPartOption[] = [
  inventoryPart({ code: 'BOLT-M12', name: 'M12 bolt', sellPricePerBasisUnit: 2.5 }),
  inventoryPart({
    code: 'TUBE-50',
    name: '50x50 tube',
    sellPricePerBasisUnit: 0.05,
    standardPurchaseLengthMm: 6000,
    unitOfMeasure: 'mm',
  }),
  inventoryPart({ averageUtilizationPercent: 70, code: 'PLATE-10', name: '10 mm plate', sellPricePerBasisUnit: 1000 }),
  inventoryPart({ code: 'NOCOST', name: 'Uncosted pin', priceNote: 'no-cost', sellPricePerBasisUnit: null }),
  inventoryPart({ code: 'NOMARKUP', name: 'Unmarked washer', priceNote: 'no-markup', sellPricePerBasisUnit: null }),
];

function inventoryPart(overrides: Partial<QuoteInventoryPartOption>): QuoteInventoryPartOption {
  return {
    averageUtilizationPercent: null,
    code: 'PART',
    freeQuantity: 3,
    id: crypto.randomUUID(),
    name: 'Part',
    partCategoryName: 'Hardware',
    priceNote: null,
    sellPricePerBasisUnit: 1,
    standardPurchaseLengthMm: null,
    unitOfMeasure: 'piece',
    ...overrides,
  };
}

vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({
    quotes: {
      inventoryParts: {
        infiniteQueryOptions: (input: unknown, options: object) => ({
          ...options,
          initialPageParam: 0,
          queryFn: async () => ({ items: INVENTORY_PARTS, nextCursor: null, total: INVENTORY_PARTS.length }),
          queryKey: ['quotes', 'inventoryParts', input],
        }),
      },
    },
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
  IconX: 'IconX',
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  View: 'View',
}));
vi.mock('@/components/ui/themed-modal', () => ({
  ThemedModal: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? children : null),
}));
vi.mock('@/components/ui/toast', () => ({ useAppToast: () => () => undefined }));
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

type HarnessProps = { onCommit?: () => void; onForm?: (form: HarnessForm) => void; readOnly?: boolean };
type HarnessForm = ReturnType<typeof useAutosaveForm<QuoteEditFormValues, QuoteUpdateInput, QuoteDetail>>['form'];

function QueryHarness(props: HarnessProps) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['laborRates', 'billing'], {
    hoursPerWorkingDay: 9,
    rates: [{ department: 'fabrication', billingRate: 777 }],
  });
  return (
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>
  );
}

function Harness({ onCommit, onForm, readOnly = false }: HarnessProps) {
  const { autosave, form } = useAutosaveForm<QuoteEditFormValues, QuoteUpdateInput, QuoteDetail>({
    defaultValues,
    failureMessage: 'Unable to update quote.',
    save: async () => ({}) as QuoteDetail,
    toInput: () => ({}) as QuoteUpdateInput,
    validator,
  });
  // QuoteDetailsScreen subscribes to all values to keep its live summary current.
  useStore(form.store, (state) => state.values);
  onForm?.(form);

  return (
    <form.AppForm>
      <QuoteWorkItemsEditor
        autosave={{ commit: onCommit ?? autosave.commit, markChanged: autosave.markChanged }}
        currencyCode="ZAR"
        form={form}
        readOnly={readOnly}
      />
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

function textOf(node: ReactTestInstance | string): string {
  return typeof node === 'string' ? node : node.children.map(textOf).join('');
}

function findButton(root: ReactTestInstance, label: string): ReactTestInstance {
  const matches = root.findAllByType('Pressable' as never).filter((button) => textOf(button) === label);
  const button = matches.at(-1);
  if (!button) throw new Error(`Missing ${label}`);
  return button;
}

async function pickInventoryPart(renderer: ReactTestRenderer, option: string) {
  await act(async () => {
    findButton(renderer.root, 'Add inventory part').props.onPress();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const row = renderer.root.findAllByType('Pressable' as never).find((button) => textOf(button).startsWith(option));
  if (!row) throw new Error(`Missing ${option}`);
  await act(async () => {
    row.props.onPress();
  });
}

function amountInput(root: ReactTestInstance, label: string): ReactTestInstance {
  const shell = root
    .findAllByType('View' as never)
    .find((view) => view.children.some((child) => typeof child !== 'string' && textOf(child) === label));
  if (!shell) throw new Error(`Missing ${label}`);
  return shell.findByType('TextInput' as never);
}

describe('Add inventory part', () => {
  test.each([
    {
      expected: { name: 'M12 bolt', quantity: 2, unitPrice: 2.5 },
      inputs: [['Quantity', '2']],
      option: 'BOLT-M12 · M12 bolt',
    },
    {
      expected: { name: '50x50 tube (450 mm)', quantity: 2, unitPrice: 22.5 },
      inputs: [
        ['Length (mm)', '450'],
        ['Pieces', '2'],
      ],
      option: 'TUBE-50 · 50x50 tube',
    },
    {
      expected: { name: '10 mm plate', quantity: 2, unitPrice: 114.29 },
      inputs: [
        ['% of plate', '8'],
        ['Quantity', '2'],
      ],
      option: 'PLATE-10 · 10 mm plate',
    },
  ])('pre-fills and commits $expected.name', async ({ expected, inputs, option }) => {
    const onCommit = vi.fn();
    let form!: HarnessForm;
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryHarness onCommit={onCommit} onForm={(current) => (form = current)} />);
    });
    await pickInventoryPart(renderer, option);
    for (const [label = '', value] of inputs) {
      await act(async () => {
        amountInput(renderer.root, label).props.onChangeText(value);
      });
    }
    await act(async () => {
      findButton(renderer.root, 'Add to work item').props.onPress();
    });

    expect(form.state.values.workItems[0]?.parts).toEqual([
      { ...expected, formKey: expect.stringMatching(/^work-item-part/) },
    ]);
    expect(onCommit).toHaveBeenCalledOnce();
    await act(async () => {
      renderer.unmount();
    });
  });

  test('disables both part buttons when read-only', async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryHarness readOnly />);
    });

    expect(findButton(renderer.root, 'Add custom part').props.disabled).toBe(true);
    expect(findButton(renderer.root, 'Add inventory part').props.disabled).toBe(true);
    await act(async () => {
      renderer.unmount();
    });
  });

  test.each([
    { label: 'NOCOST · Uncosted pin', message: 'This Part has no cost yet, so no price can be worked out.' },
    {
      label: 'NOMARKUP · Unmarked washer',
      message: 'Hardware has no markup set, so no price can be worked out.',
    },
  ])('explains a missing price: $message', async ({ label, message }) => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<QueryHarness />);
    });
    await pickInventoryPart(renderer, label);

    expect(textOf(renderer.root)).toContain(`${message} The row will be added at`);
    expect(textOf(renderer.root)).not.toContain('Unit price');
    await act(async () => {
      renderer.unmount();
    });
  });
});
