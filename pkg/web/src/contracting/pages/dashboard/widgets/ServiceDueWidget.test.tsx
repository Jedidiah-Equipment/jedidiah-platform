import { expect, it, vi } from 'vitest';
import { buildMachine } from '@/contracting/test/fleet-fixtures.js';
import { renderWithRouter } from '@/test/router-harness.js';
import { ServiceDueWidget } from './ServiceDueWidget.js';

const machine = buildMachine();

vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ contractingFleet: { machines: { list: { queryOptions: () => ({ queryKey: ['machines'] }) } } } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [machine], error: null }),
}));

it('lists the Machines Due for Service on their Service tab and opens the Services page from View all', async () => {
  const html = await renderWithRouter(<ServiceDueWidget />);

  expect(html).toContain('KOL220-2');
  expect(html).toContain(`href="/contracting/fleet/${machine.id}/edit?tab=service"`);
  expect(html).toContain('Overdue by 12.5 h');
  expect(html).toMatch(/href="\/contracting\/services"[^>]*>View all/);
});
