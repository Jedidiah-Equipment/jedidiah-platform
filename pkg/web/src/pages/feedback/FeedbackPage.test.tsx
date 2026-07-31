import { FeedbackListItem, type FeedbackListItem as FeedbackListItemType } from '@pkg/schema';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable } from '@/components/data-table/DataTable.js';

import { createFeedbackInboxColumns, feedbackTablePinnedRightColumns } from './FeedbackPage.js';

describe('Feedback table', () => {
  it('renders status as a right-pinned column', () => {
    const html = renderFeedbackTableRows([buildFeedbackItem()]);

    expect(html).toContain('right:0px');
    expect(html).toContain('bg-inherit');
    expect(html.match(/sticky/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('marks selected rows through the shared table row state', () => {
    const item = buildFeedbackItem();
    const html = renderFeedbackTableRows([item], item.id);

    expect(html).toContain('data-state="selected"');
    expect(html).toContain('data-[state=selected]:[--table-row-bg:var(--muted)]');
    expect(html).not.toContain('bg-muted/70');
  });
});

function renderFeedbackTableRows(rows: FeedbackListItemType[], selectedFeedbackId: string | null = null) {
  return renderToStaticMarkup(<TestFeedbackTable rows={rows} selectedFeedbackId={selectedFeedbackId} />);
}

function TestFeedbackTable({
  rows,
  selectedFeedbackId,
}: {
  rows: FeedbackListItemType[];
  selectedFeedbackId: string | null;
}) {
  const table = useReactTable({
    columns: createFeedbackInboxColumns(),
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    initialState: {
      columnPinning: {
        right: feedbackTablePinnedRightColumns,
      },
    },
  });

  return (
    <DataTable
      emptyMessage="No feedback found."
      getRowState={(item) => (item.id === selectedFeedbackId ? 'selected' : undefined)}
      hideGlobalFilter
      table={table}
      total={rows.length}
    />
  );
}

function buildFeedbackItem(overrides: Partial<Record<keyof FeedbackListItemType, unknown>> = {}): FeedbackListItemType {
  return FeedbackListItem.parse({
    createdAt: '2026-06-01T10:00:00.000Z',
    departments: [],
    id: '00000000-0000-4000-8000-000000000000',
    kind: 'general',
    status: 'open',
    subject: {
      id: '10000000-0000-4000-8000-000000000000',
      label: 'JOB-00001',
      subjectType: 'job',
    },
    submitter: {
      email: 'operator@example.com',
      id: '20000000-0000-4000-8000-000000000000',
      name: 'Operator User',
      thumbnailDataUrl: null,
    },
    users: [],
    ...overrides,
  });
}
