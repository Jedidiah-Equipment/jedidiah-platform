import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ canUpdatePart: true }));

vi.mock('@/hooks/use-access.js', () => ({
  useCan: () => ({ can: access.canUpdatePart }),
}));
vi.mock('@/components/page-layout/PageLayout.js', () => ({
  PageLayout: ({ actions, children, size }: { actions: React.ReactNode; children: React.ReactNode; size: string }) => (
    <>
      <header data-size={size}>{actions}</header>
      {children}
    </>
  ),
}));
vi.mock('./components/PartTable.js', () => ({
  PartTable: () => <div>Parts table</div>,
}));
vi.mock('./PartEditDialog.js', () => ({ PartEditDialog: () => null }));
vi.mock('./PartListCreateDialog.js', () => ({ PartListCreateDialog: () => null }));
vi.mock('./PartBulkImportDialog.js', () => ({
  PartBulkImportDialog: () => <button type="button">Bulk parts import</button>,
}));
vi.mock('./PartLabelBatchDialog.js', () => ({
  PartLabelBatchDialog: () => <button type="button">Print labels</button>,
}));

import { PartsPage } from './PartsPage.js';

describe('PartsPage actions', () => {
  beforeEach(() => {
    access.canUpdatePart = true;
  });

  it('offers create and CSV import actions to a Part editor', () => {
    const html = renderToStaticMarkup(<PartsPage />);

    expect(html).toContain('New part');
    expect(html).toContain('Bulk parts import');
    expect(html).toContain('Print labels');
    expect(html).toContain('data-size="full"');
  });

  it('keeps catalogue mutation actions away from a read-only user', () => {
    access.canUpdatePart = false;
    const html = renderToStaticMarkup(<PartsPage />);

    expect(html).not.toContain('New part');
    expect(html).not.toContain('Bulk parts import');
    expect(html).toContain('Print labels');
  });
});
