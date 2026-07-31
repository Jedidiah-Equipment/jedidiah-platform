import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTableLoadMore } from './DataTableLoadMore.js';

describe('DataTableLoadMore', () => {
  it('centers the load-more action and renders it as a primary link', () => {
    const html = renderToStaticMarkup(
      <DataTableLoadMore
        hasNextPage
        loadedCount={25}
        onLoadMore={() => undefined}
        total={50}
        totalLabel={(total) => `${total} parts`}
      />,
    );

    expect(html).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
    expect(html).toContain('text-primary');
    expect(html).toContain('hover:underline');
  });
});
