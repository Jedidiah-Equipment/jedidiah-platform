import type { UUID } from '@pkg/schema';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProductRangeEditTab } from '@/pages/product-ranges/product-range-edit-tabs.js';
import type { ProductEditTab } from '@/pages/products/product-edit-tabs.js';

type ProductEditPageProps = {
  onTabChange: (tab: ProductEditTab) => void;
  tab: ProductEditTab;
};

type ProductRangeEditPageProps = {
  onTabChange: (tab: ProductRangeEditTab) => void;
  tab: ProductRangeEditTab;
};

const captured = vi.hoisted(() => ({
  product: undefined as ProductEditPageProps | undefined,
  range: undefined as ProductRangeEditPageProps | undefined,
}));

vi.mock('@/pages/products/ProductEditPage.js', () => ({
  ProductEditPage: (props: ProductEditPageProps) => {
    captured.product = props;
    return <p>{props.tab}</p>;
  },
}));

vi.mock('@/pages/product-ranges/ProductRangeEditPage.js', () => ({
  ProductRangeEditPage: (props: ProductRangeEditPageProps) => {
    captured.range = props;
    return <p>{props.tab}</p>;
  },
}));

import { Route as ProductRangeEditRoute } from './_authed.product-ranges.$id.edit.js';
import { Route as ProductEditRoute } from './_authed.products.$id.edit.js';

const entityId = '123e4567-e89b-12d3-a456-426614174000' as UUID;

describe('catalog edit routes', () => {
  beforeEach(() => {
    captured.product = undefined;
    captured.range = undefined;
    vi.restoreAllMocks();
  });

  it('drives the Product tab from route search and writes tab changes back to search', () => {
    const navigate = vi.fn();
    vi.spyOn(ProductEditRoute, 'useParams').mockReturnValue({ id: entityId });
    vi.spyOn(ProductEditRoute, 'useSearch').mockReturnValue({ tab: 'images' });
    vi.spyOn(ProductEditRoute, 'useNavigate').mockReturnValue(navigate as never);

    const ProductRouteComponent = ProductEditRoute.options.component as React.ComponentType;
    renderToStaticMarkup(<ProductRouteComponent />);

    expect(captured.product?.tab).toBe('images');
    captured.product?.onTabChange('details');
    expect(navigate).toHaveBeenCalledWith({ search: { tab: 'details' } });
  });

  it('drives the Product Range tab from route search and writes tab changes back to search', () => {
    const navigate = vi.fn();
    vi.spyOn(ProductRangeEditRoute, 'useParams').mockReturnValue({ id: entityId });
    vi.spyOn(ProductRangeEditRoute, 'useSearch').mockReturnValue({ tab: 'variants' });
    vi.spyOn(ProductRangeEditRoute, 'useNavigate').mockReturnValue(navigate as never);

    const ProductRangeRouteComponent = ProductRangeEditRoute.options.component as React.ComponentType;
    renderToStaticMarkup(<ProductRangeRouteComponent />);

    expect(captured.range?.tab).toBe('variants');
    captured.range?.onTabChange('details');
    expect(navigate).toHaveBeenCalledWith({ search: { tab: 'details' } });
  });
});
