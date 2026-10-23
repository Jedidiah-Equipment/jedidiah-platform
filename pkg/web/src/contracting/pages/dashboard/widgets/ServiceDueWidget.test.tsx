import type { Machine } from '@pkg/schema/contracting';
import { expect, it, vi } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';
import { ServiceDueWidget } from './ServiceDueWidget.js';

const machine = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'KOL220-2',
  make: 'Kobelco',
  model: '220',
  categoryName: 'Excavator',
  categoryIcon: 'excavator',
  categoryColour: 'amber',
  nextServiceDueHours: 4850,
  hoursToService: -12.5,
  serviceDueStatus: 'overdue',
  serviceBookedIn: false,
  busyOnJob: null,
} as unknown as Machine;

vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ contractingServices: { dueForService: { queryOptions: () => ({ queryKey: ['due'] }) } } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [machine], error: null }),
}));

it('lists the Machines Due for Service and opens the Services page from View all', async () => {
  const html = await renderWithRouter(<ServiceDueWidget />);

  expect(html).toContain('KOL220-2');
  expect(html).toContain('Overdue by 12.5 h');
  expect(html).toMatch(/href="\/contracting\/services"[^>]*>View all/);
});
