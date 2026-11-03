import { expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';
import { InvoicedByMonthWidget } from './InvoicedByMonthWidget.js';

vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    contractingJobs: { jobs: { invoicedByMonth: { queryOptions: () => ({ queryKey: ['invoicedByMonth'] }) } } },
  }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({
    data: {
      months: [
        { month: '2026-11-01', total: 3073709.4, jobs: 17 },
        { month: '2026-10-01', total: 103519, jobs: 3 },
        { month: '2026-09-01', total: 0, jobs: 0 },
        { month: '2026-08-01', total: 0, jobs: 1 },
      ],
    },
    error: null,
  }),
}));

it('shows this month to date first, each month opening the Invoiced Jobs', async () => {
  const html = await renderWithRouter(<InvoicedByMonthWidget />);

  expect(html).toContain('November 2026 to date');
  expect(html).not.toContain('October 2026 to date');
  expect(html.match(/href="\/contracting\/jobs\?stage=invoiced"/g)).toHaveLength(4);
});
