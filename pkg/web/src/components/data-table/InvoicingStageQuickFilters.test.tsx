// @vitest-environment jsdom

import { type ColumnFiltersState, functionalUpdate, type Updater } from '@tanstack/react-table';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { InvoicingStageQuickFilters } from './InvoicingStageQuickFilters.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const range = { id: 'invoicedAt', value: { start: '2026-11-02', end: '2026-11-02' } };
const byStage = <Stage extends string, Value>(stages: readonly Stage[], value: (stage: Stage) => Value) =>
  Object.fromEntries(stages.map((stage) => [stage, value(stage)])) as Record<Stage, Value>;

function pressChip<Stage extends string>(stages: readonly Stage[], open: readonly Stage[], chip: string) {
  let filters: ColumnFiltersState = [range];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  act(() =>
    root.render(
      <InvoicingStageQuickFilters
        stages={stages}
        shown={open}
        labels={byStage(stages, (stage): string => stage)}
        colours={byStage(stages, () => ({ dot: 'bg-muted' }))}
        counts={undefined}
        columnFilters={filters}
        onColumnFiltersChange={(updater: Updater<ColumnFiltersState>) => {
          filters = functionalUpdate(updater, filters);
        }}
      />,
    ),
  );
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.startsWith(chip));
  act(() => button?.click());
  return filters;
}

describe('InvoicingStageQuickFilters', () => {
  it.each([
    ['Contracting', ['awaiting-invoice', 'invoiced'], ['awaiting-invoice']],
    [
      'Equipment',
      ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice', 'invoiced'],
      ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice'],
    ],
  ] as const)(
    'on %s, an open stage drops the stale Invoiced range so the list is not empty',
    (_business, stages, open) => {
      expect(pressChip(stages, open, 'awaiting-invoice')).toEqual([{ id: 'stage', value: ['awaiting-invoice'] }]);
    },
  );

  it('keeps the Invoiced range when the pick includes Invoiced', () => {
    expect(pressChip(['awaiting-invoice', 'invoiced'], ['awaiting-invoice'], 'All')).toEqual([
      range,
      { id: 'stage', value: ['awaiting-invoice', 'invoiced'] },
    ]);
  });
});
