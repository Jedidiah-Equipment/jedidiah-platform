import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorToast: () => vi.fn(),
}));

vi.mock('@/hooks/use-credentialed-image-preview.js', () => ({
  useCredentialedImagePreview: () => null,
}));

vi.mock('@/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateProducts: vi.fn() }),
}));

import { ProductImageSlotTile } from './ProductImageSlotTile.js';

describe('ProductImageSlotTile', () => {
  it('previews the brochure banner at its rendered aspect ratio', () => {
    const html = renderToStaticMarkup(
      <ProductImageSlotTile
        canEdit
        description="Wide brochure banner. Center-cropped to fill."
        image={null}
        label="Banner image"
        productId="123e4567-e89b-42d3-a456-426614174000"
        slot="banner"
        usage={['brochure']}
      />,
    );

    expect(html).toContain('2400×880px');
    expect(html).toContain('style="aspect-ratio:30 / 11"');
    expect(html).not.toContain('aspect-video');
  });
});
