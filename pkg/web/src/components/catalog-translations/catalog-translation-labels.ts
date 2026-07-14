import type { CatalogProductRangeTranslation, CatalogProductTranslation } from '@pkg/schema';

export const PRODUCT_TRANSLATION_FIELD_LABELS = {
  category: 'Category',
  description: 'Description',
  keyFeatures: 'Key features',
  name: 'Name',
  nameHighlight: 'Name highlight',
  technicalDetails: 'Technical details',
} satisfies Record<keyof CatalogProductTranslation['fields'], string>;

export const PRODUCT_RANGE_TRANSLATION_FIELD_LABELS = {
  description: 'Description',
  name: 'Name',
} satisfies Record<keyof CatalogProductRangeTranslation['fields'], string>;
