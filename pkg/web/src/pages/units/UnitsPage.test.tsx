import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));
vi.mock('@/components/page-layout/PageLayout.js', () => ({
  PageLayout: ({ actions, children }: { actions?: React.ReactNode; children: React.ReactNode }) => (
    <>
      <header data-page-actions>{actions}</header>
      <main>{children}</main>
    </>
  ),
}));
vi.mock('./components/ProductUnitTable.js', () => ({
  ProductUnitTable: ({
    render,
  }: {
    render?: (view: { exportAction: React.ReactNode; tableContent: React.ReactNode }) => React.ReactNode;
  }) => {
    const exportAction = <button type="button">Export Units</button>;
    const tableContent = <div>Units table</div>;

    return render ? render({ exportAction, tableContent }) : <div data-table-toolbar>{exportAction}</div>;
  },
}));

import { UnitsPage } from './UnitsPage.js';

describe('UnitsPage', () => {
  it('places the export action in the page header instead of the table toolbar', () => {
    const html = renderToStaticMarkup(<UnitsPage />);

    expect(html).toContain('<header data-page-actions="true"><button type="button">Export Units</button></header>');
    expect(html).toContain('<main><div>Units table</div></main>');
    expect(html).not.toContain('data-table-toolbar');
  });
});
