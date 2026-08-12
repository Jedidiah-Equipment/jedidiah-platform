import { quoteKindColorClassNames } from '@pkg/domain';
import { QuoteKind } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { OfferingThumbnail } from './OfferingThumbnail.js';

describe('OfferingThumbnail', () => {
  it('falls back to the kind icon on its colour rather than initials', () => {
    for (const kind of QuoteKind.options) {
      const markup = renderToStaticMarkup(<OfferingThumbnail kind={kind} label="Hydraulic repair" />);

      expect(markup).toContain('<svg');
      expect(markup).toContain(quoteKindColorClassNames[kind].chip);
      expect(markup).not.toContain('HR');
    }
  });

  it('gives Custom work and Product builds different colours', () => {
    expect(quoteKindColorClassNames.custom.chip).not.toBe(quoteKindColorClassNames.product.chip);
  });
});
