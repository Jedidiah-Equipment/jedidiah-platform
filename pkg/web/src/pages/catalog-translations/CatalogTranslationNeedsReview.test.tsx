import type { CatalogTranslationNeedsReviewItem } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Link needs a router context it can't have in a static render; the route target is what matters here, so
// render it as the anchor it becomes.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
    to,
  }: {
    children?: React.ReactNode;
    params: { id: string };
    search: { tab: string };
    to: string;
  }) => <a href={`${to.replace('$id', params.id)}?tab=${search.tab}`}>{children}</a>,
}));

import { CatalogTranslationNeedsReviewContent } from './CatalogTranslationNeedsReview.js';

describe('CatalogTranslationNeedsReview', () => {
  it('renders affected fields and translation-tab links for every entity kind', () => {
    const items = [
      {
        affectedFields: [
          { field: 'description', kind: 'product' },
          { kind: 'assembly', name: 'Hydraulic tailgate' },
        ],
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'product',
        name: 'Silage Trailer',
      },
      {
        affectedFields: [{ field: 'description', kind: 'range' }],
        id: '22222222-2222-4222-8222-222222222222',
        kind: 'range',
        name: 'Trailers',
      },
      {
        affectedFields: [{ field: 'name', kind: 'variant' }],
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'variant',
        name: 'Heavy Duty',
        rangeId: '22222222-2222-4222-8222-222222222222',
      },
    ] satisfies CatalogTranslationNeedsReviewItem[];

    const html = renderToStaticMarkup(
      <CatalogTranslationNeedsReviewContent hasError={false} isLoading={false} items={items} />,
    );

    expect(html).toContain('Silage Trailer');
    expect(html).toContain('Description, Assembly: Hydraulic tailgate');
    expect(html).toContain('/products/11111111-1111-4111-8111-111111111111/edit?tab=translations');
    expect(html).toContain('Trailers');
    expect(html).toContain('/product-ranges/22222222-2222-4222-8222-222222222222/edit?tab=translations');
    expect(html).toContain('Heavy Duty');
    expect(html.match(/product-ranges\/22222222-2222-4222-8222-222222222222\/edit\?tab=translations/g)).toHaveLength(2);
  });

  it('shows a clear empty state when no manual translations need review', () => {
    const html = renderToStaticMarkup(
      <CatalogTranslationNeedsReviewContent hasError={false} isLoading={false} items={[]} />,
    );

    expect(html).toContain('No Afrikaans translations need review.');
  });
});
