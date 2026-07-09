import { describe, expect, test } from 'vitest';

import type { CatalogGroup } from '../../server/catalog/products-data.js';
import { resolveProductsCatalogView } from './index.js';

describe('resolveProductsCatalogView', () => {
  test('filters a selected Range to a selected Variant and hides unassigned Products', () => {
    const { visibleGroups, activeVariant } = resolveProductsCatalogView(groups, {
      range: 'trailers',
      variant: 'wide-body',
    });

    expect(activeVariant?.id).toBe('variant-wide');
    expect(visibleGroups).toHaveLength(1);
    expect(visibleGroups[0]?.products.map((product) => product.id)).toEqual(['wide-model']);
    expect(visibleGroups[0]?.count).toBe(1);
  });

  test('shows the full Range when the Variant slug is unknown or absent', () => {
    expect(
      resolveProductsCatalogView(groups, { range: 'trailers' }).visibleGroups[0]?.products.map(({ id }) => id),
    ).toEqual(['base-model', 'wide-model', 'wide-dashed-model', 'narrow-model']);
    expect(
      resolveProductsCatalogView(groups, {
        range: 'trailers',
        variant: 'stale-variant',
      }).visibleGroups[0]?.products.map(({ id }) => id),
    ).toEqual(['base-model', 'wide-model', 'wide-dashed-model', 'narrow-model']);
  });

  test('ignores a Variant slug when there is no valid selected Range', () => {
    const view = resolveProductsCatalogView(groups, { variant: 'wide-body' });

    expect(view.activeSlug).toBeUndefined();
    expect(view.activeVariant).toBeUndefined();
    expect(view.visibleGroups.map((group) => group.id)).toEqual(['range-trailers', 'range-tanks']);
  });

  test('resolves duplicate Variant slugs only within the selected Range', () => {
    const { activeVariant, visibleGroups } = resolveProductsCatalogView(groups, {
      range: 'tanks',
      variant: 'wide-body',
    });

    expect(activeVariant?.id).toBe('tank-wide');
    expect(visibleGroups[0]?.products.map((product) => product.id)).toEqual(['tank-wide-model']);
  });

  test('resolves same-Range collision-safe Variant slugs independently', () => {
    const { activeVariant, visibleGroups } = resolveProductsCatalogView(groups, {
      range: 'trailers',
      variant: 'wide-body-12345678',
    });

    expect(activeVariant?.id).toBe('variant-wide-dashed');
    expect(visibleGroups[0]?.products.map((product) => product.id)).toEqual(['wide-dashed-model']);
  });
});

const groups: CatalogGroup[] = [
  {
    id: 'range-trailers',
    slug: 'trailers',
    name: 'Trailers',
    label: 'Trailers',
    description: '',
    count: 4,
    variants: [
      { id: 'variant-wide', name: 'Wide Body', slug: 'wide-body', label: 'Wide' },
      { id: 'variant-wide-dashed', name: 'Wide-Body', slug: 'wide-body-12345678', label: 'Wide-Body' },
      { id: 'variant-narrow', name: 'Narrow Body', slug: 'narrow-body', label: 'Narrow' },
    ],
    products: [
      product({ id: 'base-model', variantId: null }),
      product({ id: 'wide-model', variantId: 'variant-wide' }),
      product({ id: 'wide-dashed-model', variantId: 'variant-wide-dashed' }),
      product({ id: 'narrow-model', variantId: 'variant-narrow' }),
    ],
  },
  {
    id: 'range-tanks',
    slug: 'tanks',
    name: 'Tanks',
    label: 'Tanks',
    description: '',
    count: 1,
    variants: [{ id: 'tank-wide', name: 'Wide Body', slug: 'wide-body', label: 'Wide Body' }],
    products: [product({ id: 'tank-wide-model', variantId: 'tank-wide' })],
  },
];

function product({ id, variantId }: { id: string; variantId: string | null }) {
  return {
    id,
    variantId,
    name: id,
    modelCode: id.toUpperCase(),
    description: '',
    href: `/products/${id}`,
    imageUrl: `/images/products/${id}`,
  };
}
