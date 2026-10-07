import type { ColumnFiltersState } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useDataTable } from '@/components/data-table/features.js';
import { historyKindColumn } from './history-kind-column.js';

type Access = { isMachine: boolean; readsBreakdowns: boolean; readsServices: boolean };

function renderKinds(access: Access, selectedKind?: string) {
  const columnFilters: ColumnFiltersState = selectedKind ? [{ id: 'kindLabel', value: selectedKind }] : [];
  function Table() {
    const table = useDataTable({
      columns: [historyKindColumn(access)],
      data: [{ kindLabel: 'Readings' }, { kindLabel: 'Breakdowns' }, { kindLabel: 'Services' }],
      state: { columnFilters },
    });
    const column = table.getColumn('kindLabel');
    if (!column) throw new Error('History has no Kind column');
    return (
      <div>
        {column.getCanFilter() ? (
          <select>
            {column.columnDef.meta?.filterOptions?.map(({ value }) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        ) : null}
        <ul>
          {table.getRowModel().rows.map((row) => (
            <li key={row.id}>{row.original.kindLabel}</li>
          ))}
        </ul>
      </div>
    );
  }
  const html = renderToStaticMarkup(<Table />);
  return {
    options: [...html.matchAll(/<option>(.*?)<\/option>/g)].map(([, value]) => value),
    rows: [...html.matchAll(/<li>(.*?)<\/li>/g)].map(([, value]) => value),
    hasFilter: html.includes('<select>'),
  };
}

describe('History kind filter', () => {
  it('keeps all three kinds for a Machine reader with both permissions', () => {
    expect(renderKinds({ isMachine: true, readsBreakdowns: true, readsServices: true }).options).toEqual([
      'Readings',
      'Breakdowns',
      'Services',
    ]);
  });
  it.each([true, false])('omits Breakdowns without access, with Service Record access %s', (readsServices) => {
    expect(renderKinds({ isMachine: true, readsBreakdowns: false, readsServices }).options).toEqual(
      readsServices ? ['Readings', 'Services'] : ['Readings'],
    );
  });
  it('offers no Kind filter for an Implement, while retaining the Kind column', () => {
    const result = renderKinds({ isMachine: false, readsBreakdowns: true, readsServices: true });
    expect(result.hasFilter).toBe(false);
    expect(result.rows).toContain('Breakdowns');
  });
  it('offers only Breakdowns and Readings to a Machine reader without Service Record access', () => {
    expect(renderKinds({ isMachine: true, readsBreakdowns: true, readsServices: false }).options).toEqual([
      'Readings',
      'Breakdowns',
    ]);
  });
  it.each([
    [{ isMachine: false, readsBreakdowns: true, readsServices: false }, 'Readings'],
    [{ isMachine: true, readsBreakdowns: true, readsServices: false }, 'Services'],
    [{ isMachine: true, readsBreakdowns: false, readsServices: true }, 'Breakdowns'],
  ] satisfies [Access, string][])(
    'shows the full timeline when a saved kind is unavailable: %s, %s',
    (access, kind) => {
      expect(renderKinds(access, kind).rows).toEqual(['Readings', 'Breakdowns', 'Services']);
    },
  );
  it('still filters the timeline by an available kind', () => {
    expect(renderKinds({ isMachine: true, readsBreakdowns: true, readsServices: true }, 'Services').rows).toEqual([
      'Services',
    ]);
  });
});
