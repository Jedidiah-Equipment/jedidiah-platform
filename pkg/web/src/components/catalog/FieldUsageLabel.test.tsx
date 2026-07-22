import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import {
  FieldUsageLabel,
  PRODUCT_FIELD_USAGE,
  PRODUCT_IMAGE_SLOT_USAGE,
  PRODUCT_RANGE_FIELD_USAGE,
} from './FieldUsageLabel.js';

test('product form usage metadata marks the lander and brochure fields', () => {
  expect(PRODUCT_FIELD_USAGE).toEqual({
    assemblies: ['lander', 'brochure'],
    category: ['lander', 'brochure'],
    description: ['lander', 'brochure'],
    keyFeatures: ['lander', 'brochure'],
    modelCode: ['lander', 'brochure'],
    name: ['lander', 'brochure'],
    nameHighlight: ['brochure'],
    rangeId: ['lander', 'brochure'],
    technicalDetails: [],
  });

  expect(PRODUCT_FIELD_USAGE).not.toHaveProperty('basePrice');
  expect(PRODUCT_FIELD_USAGE).not.toHaveProperty('buildTimeDays');
  expect(PRODUCT_FIELD_USAGE).not.toHaveProperty('requiresVinNumber');
  expect(PRODUCT_FIELD_USAGE).not.toHaveProperty('thumbnailDataUrl');
});

test('product image slot usage metadata matches brochure and lander consumers', () => {
  expect(PRODUCT_IMAGE_SLOT_USAGE).toEqual({
    banner: ['brochure'],
    primary: ['lander', 'brochure'],
    secondary1: ['lander'],
    secondary2: ['lander'],
    technicalDrawing: ['brochure'],
  });
});

test('product range usage metadata marks public site and brochure-only fields', () => {
  expect(PRODUCT_RANGE_FIELD_USAGE).toEqual({
    description: ['lander'],
    image: ['lander'],
    logo: ['brochure'],
    name: ['lander'],
  });
});

test('field usage icons use the surface color classes', () => {
  const markup = renderToStaticMarkup(<FieldUsageLabel usage={['lander', 'brochure']}>Name</FieldUsageLabel>);

  expect(markup).toContain('text-purple-600');
  expect(markup).toContain('text-blue-600');
});
