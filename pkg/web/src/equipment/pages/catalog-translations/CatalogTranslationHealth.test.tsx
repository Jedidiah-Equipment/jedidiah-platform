import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { CatalogTranslationHealthCard } from './CatalogTranslationHealthCard.js';

describe('CatalogTranslationHealthCard', () => {
  it('shows the total and per-entity translation attention counts', () => {
    const html = renderToStaticMarkup(
      <CatalogTranslationHealthCard
        isPending={false}
        onRetranslate={vi.fn()}
        status={{
          products: { missing: 2, needsReview: 2, stale: 1 },
          ranges: { missing: 0, needsReview: 0, stale: 1 },
          variants: { missing: 1, needsReview: 0, stale: 0 },
        }}
      />,
    );

    expect(html).toContain('7 items need Afrikaans translation attention');
    expect(html).toContain('Products');
    expect(html).toContain('2 missing');
    expect(html).toContain('1 stale');
    expect(html).toContain('2 need review');
    expect(html).toContain('Ranges');
    expect(html).toContain('0 missing');
    expect(html).toContain('Variants');
    expect(html).toContain('Retranslate stale');
  });

  it('surfaces manual review work without enabling AI recovery', () => {
    const html = renderToStaticMarkup(
      <CatalogTranslationHealthCard
        isPending={false}
        onRetranslate={vi.fn()}
        status={{
          products: { missing: 0, needsReview: 1, stale: 0 },
          ranges: { missing: 0, needsReview: 0, stale: 0 },
          variants: { missing: 0, needsReview: 0, stale: 0 },
        }}
      />,
    );

    expect(html).toContain('1 item needs Afrikaans translation attention');
    expect(html).toContain('1 needs review');
    expect(html).toContain('disabled=""');
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
