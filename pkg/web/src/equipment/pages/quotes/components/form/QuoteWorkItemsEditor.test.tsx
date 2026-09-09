// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { useAppForm } from '@/components/form/index.js';
import { emptyQuoteFormValues, type QuoteFormValues } from '../types.js';
import { QuoteAddWorkItemButton, QuoteWorkItemsEditor } from './QuoteWorkItemsEditor.js';

vi.mock('@/lib/trpc.js', () => ({
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
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
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
              onRemoveWorkItem={() => {}}
              readOnly={false}
            />
            <QuoteAddWorkItemButton workItemsField={field} readOnly={false} />
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
