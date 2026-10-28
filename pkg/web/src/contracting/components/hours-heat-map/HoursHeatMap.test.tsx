import type { DateOnlyIso } from '@pkg/schema';
import type { DailyHoursDay } from '@pkg/schema/contracting';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

const access = { current: true };
const query = { current: { data: undefined, error: null } as { data?: unknown; error: unknown } };
vi.mock('@/hooks/use-access.js', () => ({ useCan: () => ({ can: access.current }) }));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({ contractingReports: { hoursHeatMap: { queryOptions: () => ({ queryKey: ['heat-map'] }) } } }),
}));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => query.current,
}));

import { HoursHeatMap } from './HoursHeatMap.js';
import { HoursHeatMapCard } from './HoursHeatMapCard.js';

const day = (date: string, hours: number, estimated = false): DailyHoursDay => ({
  date: date as DateOnlyIso,
  hours,
  estimated,
});
// 2026-06-03 is a Wednesday, so the first week is padded back to Monday.
const days = [day('2026-06-03', 0), day('2026-06-04', 4), day('2026-06-05', 8, true), day('2026-06-06', 2)];

test('labels every cell with its date and hours, flagging an estimated day, and draws the legend', () => {
  query.current = { data: { start: '2026-06-03', end: '2026-06-06', days }, error: null };
  const html = renderToStaticMarkup(<HoursHeatMap />);
  expect(html).toContain('aria-label="Thursday, 4 June 2026: 4.0 h"');
  expect(html).toContain('aria-label="Friday, 5 June 2026: 8.0 h, estimated"');
  expect(html).toContain('Less');
  expect(html).toContain('More');
  expect(html).not.toContain('No hours recorded');
});

test('says so when nothing ran in the range', () => {
  query.current = { data: { start: '2026-06-03', end: '2026-06-04', days: [day('2026-06-03', 0)] }, error: null };
  expect(renderToStaticMarkup(<HoursHeatMap />)).toContain('No hours recorded');
});

test('shows the load error instead of a grid', () => {
  query.current = { data: undefined, error: new Error('boom') };
  expect(renderToStaticMarkup(<HoursHeatMap />)).not.toContain('Less');
});

test('renders the card only for a role that can read reports', () => {
  query.current = { data: { start: '2026-06-03', end: '2026-06-04', days: [day('2026-06-03', 1)] }, error: null };
  expect(renderToStaticMarkup(<HoursHeatMapCard />)).toContain('Daily hours');
  access.current = false;
  expect(renderToStaticMarkup(<HoursHeatMapCard />)).toBe('');
  access.current = true;
});
