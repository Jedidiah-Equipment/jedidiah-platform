// @vitest-environment jsdom

import type { QuoteInventoryPartOption } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { useAppForm } from '@/components/form/index.js';
import { emptyQuoteFormValues, type QuoteFormValues } from '../types.js';
import { QuoteAddWorkItemButton, QuoteWorkItemsEditor } from './QuoteWorkItemsEditor.js';

const inventoryParts: QuoteInventoryPartOption[] = [
  {
    averageUtilizationPercent: null,
    code: 'TUBE-50',
    freeQuantity: 4,
    id: '00000000-0000-4000-8000-000000000001',
    name: '50x50 tube',
    partCategoryName: 'Tube',
    priceNote: null,
    sellPricePerBasisUnit: 0.125,
    standardPurchaseLengthMm: 6_000,
    unitOfMeasure: 'mm',
  },
  {
    averageUtilizationPercent: 70,
    code: 'PLATE-10',
    freeQuantity: 0,
    id: '00000000-0000-4000-8000-000000000002',
    name: '10mm plate',
    partCategoryName: 'Plate',
    priceNote: null,
    sellPricePerBasisUnit: 1_000,
    standardPurchaseLengthMm: null,
    unitOfMeasure: 'piece',
  },
  {
    averageUtilizationPercent: null,
    code: 'BOLT-M10',
    freeQuantity: 12,
    id: '00000000-0000-4000-8000-000000000003',
    name: 'M10 bolt',
    partCategoryName: 'Fasteners',
    priceNote: 'no-markup',
    sellPricePerBasisUnit: null,
    standardPurchaseLengthMm: null,
    unitOfMeasure: 'piece',
  },
  {
    averageUtilizationPercent: null,
    code: 'NUT-M10',
    freeQuantity: 0,
    id: '00000000-0000-4000-8000-000000000004',
    name: 'M10 nut',
    partCategoryName: 'Fasteners',
    priceNote: 'no-cost',
    sellPricePerBasisUnit: null,
    standardPurchaseLengthMm: null,
    unitOfMeasure: 'piece',
  },
];

vi.mock('@/components/help/index.js', () => ({ HelpLink: () => null }));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    quotes: {
      inventoryParts: {
        infiniteQueryOptions: (
          input: { search: string },
          { initialCursor: _initialCursor, ...options }: { initialCursor: number },
        ) => ({
          ...options,
          initialPageParam: 0,
          queryFn: async () => ({ items: inventoryParts, nextCursor: null, total: inventoryParts.length }),
          queryKey: ['quotes', 'inventoryParts', input.search],
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
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ onPartsChanged = () => {}, readOnly = false }: { onPartsChanged?: () => void; readOnly?: boolean }) {
  const form = useAppForm({
    defaultValues: {
      ...emptyQuoteFormValues,
      workItems: [
        {
          department: 'fabrication' as const,
          description: 'Existing work',
          hourlyRate: 123,
          hours: 2,
          name: '',
          parts: [],
        },
      ],
    } as QuoteFormValues,
  });
  return (
    <form.AppForm>
      <form.Field name="workItems" mode="array">
        {(field) => (
          <>
            <QuoteWorkItemsEditor
              workItemsField={field}
              currencyCode="ZAR"
              onPartsChanged={onPartsChanged}
              onRemoveWorkItem={() => {}}
              readOnly={readOnly}
            />
            <QuoteAddWorkItemButton workItemsField={field} readOnly={readOnly} />
          </>
        )}
      </form.Field>
    </form.AppForm>
  );
}

test('seeds a new Work Item from billing while retaining the existing quoted rate', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['laborRates', 'billing'], {
    hoursPerWorkingDay: 9,
    rates: [{ department: 'fabrication', billingRate: 777 }],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      );
    });
    const add = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Add work item'),
    );
    if (!add) throw new Error('Missing Add work item');
    await act(async () => {
      add.click();
    });
    const values = [...container.querySelectorAll('input')].map((input) => input.value);
    expect(values).toEqual(expect.arrayContaining(['777.00', '123.00']));
  } finally {
    await act(async () => {
      root.unmount();
    });
    client.clear();
    container.remove();
  }
});

async function renderEditor(props: React.ComponentProps<typeof Harness> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness {...props} />
      </QueryClientProvider>,
    );
  });

  return {
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      client.clear();
      container.remove();
    },
    container,
  };
}

function findButton(scope: ParentNode, text: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === text);
  if (!button) throw new Error(`Missing button ${text}`);
  return button;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.click();
  });
}

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function openDialogAndPick(container: HTMLElement, code: string) {
  await click(findButton(container, 'Add inventory part'));
  const search = document.querySelector<HTMLInputElement>('#quote-inventory-part-search');
  if (!search) throw new Error('Missing Part search');
  await act(async () => {
    search.focus();
  });
  await typeInto(search, code);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  await act(async () => {
    search.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((candidate) =>
    candidate.textContent?.includes(code),
  );
  if (!option) throw new Error(`Missing option ${code}`);
  await click(option);
}

function dialog(): HTMLElement {
  const element = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!element) throw new Error('Missing dialog');
  return element;
}

function inputValues(container: HTMLElement): string[] {
  return [...container.querySelectorAll('input')].map((input) => input.value);
}

test('adds a length of an inventory Part as an ordinary row and tells autosave', async () => {
  const onPartsChanged = vi.fn();
  const { cleanup, container } = await renderEditor({ onPartsChanged });
  try {
    await openDialogAndPick(container, 'TUBE-50');
    const length = dialog().querySelector<HTMLInputElement>('#quote-inventory-part-length');
    const pieces = dialog().querySelector<HTMLInputElement>('#quote-inventory-part-quantity');
    if (!length || !pieces) throw new Error('Missing amount fields');
    expect(length.value).toBe('6000');
    await typeInto(length, '450');
    await typeInto(pieces, '4');
    expect(dialog().textContent).toContain('R 56.25');

    await click(findButton(dialog(), 'Add to work item'));

    expect(onPartsChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(inputValues(container)).toEqual(expect.arrayContaining(['50x50 tube (450 mm)', '4', '56.25']));
  } finally {
    await cleanup();
  }
});

test('shows how a share of a plate is priced to cover its scrap', async () => {
  const { cleanup, container } = await renderEditor();
  try {
    await openDialogAndPick(container, 'PLATE-10');
    const percent = dialog().querySelector<HTMLInputElement>('#quote-inventory-part-plate-percent');
    if (!percent) throw new Error('Missing % of plate');
    await typeInto(percent, '8');

    expect(dialog().textContent).toContain('8% of plate ÷ 70% yield = 11.43% of a plate');
    expect(dialog().textContent).toContain('R 114.29');
  } finally {
    await cleanup();
  }
});

test.each([
  ['BOLT-M10', 'Fasteners has no markup set, so no price can be worked out. The row will be added at R 0.00.'],
  ['NUT-M10', 'This Part has no cost yet, so no price can be worked out. The row will be added at R 0.00.'],
])('says why %s cannot be priced', async (code, message) => {
  const { cleanup, container } = await renderEditor();
  try {
    await openDialogAndPick(container, code);

    expect(dialog().textContent).toContain(message);
  } finally {
    await cleanup();
  }
});

test('disables both ways of adding a part on a read-only Quote', async () => {
  const { cleanup, container } = await renderEditor({ readOnly: true });
  try {
    expect(findButton(container, 'Add custom part').disabled).toBe(true);
    expect(findButton(container, 'Add inventory part').disabled).toBe(true);
  } finally {
    await cleanup();
  }
});
