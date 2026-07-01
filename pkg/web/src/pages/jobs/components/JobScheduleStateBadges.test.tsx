import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { JobScheduleStateBadges } from './JobScheduleStateBadges.js';

test('renders nothing when schedule state was not requested', () => {
  expect(renderToStaticMarkup(<JobScheduleStateBadges scheduleState={null} />)).toBe('');
});

test('shows a single "Not scheduled" warning badge when the Job has no Work Slots', () => {
  const markup = renderToStaticMarkup(
    <JobScheduleStateBadges
      scheduleState={{ done: 0, active: 0, endDate: null, scheduled: 0, startDate: null, total: 0 }}
    />,
  );

  expect(markup).toContain('Not scheduled');
  expect(markup).toContain('bg-orange-500/15');
  expect(markup).not.toContain('Done');
  expect(markup).not.toContain('Scheduled');
});

test('renders one colored pill for a single non-zero state', () => {
  const markup = renderToStaticMarkup(
    <JobScheduleStateBadges
      scheduleState={{ done: 0, active: 3, endDate: null, scheduled: 0, startDate: null, total: 3 }}
    />,
  );

  expect(markup).toContain('3 Active');
  expect(markup).toContain('bg-blue-500/15');
  expect(markup).not.toContain('Done');
  expect(markup).not.toContain('Scheduled');
  expect(markup).not.toContain('Not scheduled');
});

test('renders a pill per non-zero state for a mixed Job, omitting zero counts', () => {
  const markup = renderToStaticMarkup(
    <JobScheduleStateBadges
      scheduleState={{ done: 1, active: 1, endDate: null, scheduled: 2, startDate: null, total: 4 }}
    />,
  );

  expect(markup).toContain('1 Done');
  expect(markup).toContain('1 Active');
  expect(markup).toContain('2 Scheduled');
  expect(markup).toContain('bg-muted');
  expect(markup).toContain('bg-blue-500/15');
  expect(markup).toContain('bg-emerald-500/15');
  expect(markup).not.toContain('Not scheduled');
});

test('renders only the done pill for an all-done Job', () => {
  const markup = renderToStaticMarkup(
    <JobScheduleStateBadges
      scheduleState={{ done: 5, active: 0, endDate: null, scheduled: 0, startDate: null, total: 5 }}
    />,
  );

  expect(markup).toContain('5 Done');
  expect(markup).toContain('bg-muted');
  expect(markup).not.toContain('bg-blue-500/15');
  expect(markup).not.toContain('bg-emerald-500/15');
  expect(markup).not.toContain('Active');
  expect(markup).not.toContain('Scheduled');
  expect(markup).not.toContain('Not scheduled');
});
