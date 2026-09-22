import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let canManagePartCategories = false;
vi.mock('@/hooks/use-access.js', () => ({ useCan: () => ({ can: canManagePartCategories }) }));
vi.mock('@/equipment/pages/part-categories/PartCategoryCreateDialog.js', () => ({
  PartCategoryCreateDialog: () => null,
}));

import { NewPartCategoryButton } from './NewPartCategoryButton.js';

describe('NewPartCategoryButton', () => {
  it('offers a new Part Category only to the people who manage them', () => {
    canManagePartCategories = false;
    expect(renderToStaticMarkup(<NewPartCategoryButton onCreated={vi.fn()} />)).toBe('');

    canManagePartCategories = true;
    expect(renderToStaticMarkup(<NewPartCategoryButton onCreated={vi.fn()} />)).toContain('New Part Category');
  });
});
