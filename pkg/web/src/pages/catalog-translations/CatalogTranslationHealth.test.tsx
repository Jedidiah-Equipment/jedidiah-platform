import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CatalogTranslationHealthCard } from './CatalogTranslationHealthCard.js';

describe('CatalogTranslationHealthCard', () => {
  it('shows the total and per-entity missing and stale counts', () => {
    const html = renderToStaticMarkup(
      <CatalogTranslationHealthCard
        isPending={false}
        onRetranslate={vi.fn()}
        status={{
          products: { missing: 2, needsReview: 0, stale: 1 },
          ranges: { missing: 0, needsReview: 0, stale: 1 },
          variants: { missing: 1, needsReview: 0, stale: 0 },
        }}
      />,
    );

    expect(html).toContain('5 items need Afrikaans translation');
    expect(html).toContain('Products');
    expect(html).toContain('2 missing');
    expect(html).toContain('1 stale');
    expect(html).toContain('Ranges');
    expect(html).toContain('0 missing');
    expect(html).toContain('Variants');
    expect(html).toContain('Retranslate stale');
  });

  it('disables recovery when every translation is current', () => {
    const html = renderToStaticMarkup(
      <CatalogTranslationHealthCard
        isPending={false}
        onRetranslate={vi.fn()}
        status={{
          products: { missing: 0, needsReview: 0, stale: 0 },
          ranges: { missing: 0, needsReview: 0, stale: 0 },
          variants: { missing: 0, needsReview: 0, stale: 0 },
        }}
      />,
    );

    expect(html).toContain('All Afrikaans catalog translations are up to date');
    expect(html).toContain('disabled=""');
  });
});
