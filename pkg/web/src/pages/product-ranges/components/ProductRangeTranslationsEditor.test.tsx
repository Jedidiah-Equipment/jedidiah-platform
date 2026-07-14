import type { CatalogProductRangeTranslation } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({
  useApiMutationErrorToast: () => vi.fn(),
}));

// Autosave guards navigation through the router; a static render has no router to guard.
vi.mock('@tanstack/react-router', () => ({
  useBlocker: () => undefined,
}));

import { ProductRangeTranslationsForm } from './ProductRangeTranslationsEditor.js';

describe('ProductRangeTranslationsForm', () => {
  it('renders Range fields and every Variant name with English beside Afrikaans', () => {
    const html = renderToStaticMarkup(
      <ProductRangeTranslationsForm
        isTogglePending={false}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        translation={buildTranslation()}
      />,
    );

    expect(html).toContain('Range translations');
    expect(html).toContain('Harvest Range');
    expect(html).toContain('Oesreeks');
    expect(html).toContain('Built for harvest');
    expect(html).toContain('Gebou vir oes');
    expect(html).toContain('Variant translations');
    expect(html).toContain('Heavy Duty');
    expect(html).toContain('Swaardiens');
    expect(html).toContain('Compact');
    expect(html).toContain('Kompak');
    expect(html.match(/>English</g)).toHaveLength(4);
    expect(html.match(/>Afrikaans</g)).toHaveLength(4);
  });

  it('leaves AI-managed fields disabled and manual fields editable', () => {
    const html = renderToStaticMarkup(
      <ProductRangeTranslationsForm
        isTogglePending={false}
        onSave={vi.fn()}
        onToggle={vi.fn()}
        translation={buildTranslation()}
      />,
    );

    // Name is AI-managed, Description is manual.
    expect(html).toMatch(/aria-label="Name Afrikaans"[^>]*disabled/);
    expect(html).not.toMatch(/aria-label="Description Afrikaans"[^>]*disabled/);
  });
});

function buildTranslation(): CatalogProductRangeTranslation {
  const field = (canonical: string, value: string, isManual: boolean) => ({
    canonical,
    state: 'fresh' as const,
    translation: {
      isManual,
      sourceHash: 'source-hash',
      translatedAt: '2026-07-14T12:00:00.000Z',
      value,
    },
  });

  return {
    fields: {
      description: field('Built for harvest', 'Gebou vir oes', true),
      name: field('Harvest Range', 'Oesreeks', false),
    },
    id: '123e4567-e89b-42d3-a456-426614174000',
    variants: [
      { fields: { name: field('Heavy Duty', 'Swaardiens', true) }, id: '123e4567-e89b-42d3-a456-426614174001' },
      { fields: { name: field('Compact', 'Kompak', false) }, id: '123e4567-e89b-42d3-a456-426614174002' },
    ],
  };
}
