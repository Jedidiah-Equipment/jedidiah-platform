import { BROCHURE_KEY_FEATURES_MAX_COUNT, type BrochureDocumentModel } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../bytes/pdf-bytes.js';
import { renderBrochurePdf } from './brochure-pdf-renderer.js';

// A tiny 4x4 PNG so the renderer exercises its real image path without bundling a large fixture.
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==';

function image(fit: 'contain' | 'cover') {
  return { dataUri: PNG_DATA_URI, fit };
}

function fullBrochure(): BrochureDocumentModel {
  return {
    bodyCopy: ['A rugged feed mixer built for daily use.', 'Engineered for high productivity and reliability.'],
    images: {
      rangeLogo: image('contain'),
      hero: image('cover'),
      technicalDrawing: image('cover'),
      secondary: image('cover'),
    },
    keyFeatures: ['Heavy-duty steel construction', 'Low maintenance', 'Hydraulic drive'],
    modelCode: 'SG1836',
    optionalAssemblies: ['Side working lights', 'BKT tyres'],
    standardAssemblies: ['Main chassis', 'Auger assembly'],
    subtitle: 'Silage & Grain',
    title: 'Silage Grain 18 36',
  };
}

describe('renderBrochurePdf', () => {
  test('renders a complete brochure model to valid PDF bytes spanning two pages', async () => {
    const bytes = await renderBrochurePdf({ document: fullBrochure(), filename: 'SG1836-brochure.pdf' });

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(await getPdfPageSizes(bytes)).toHaveLength(2);
  });

  test('omits absent optional sections and still renders valid bytes across two pages', async () => {
    const bytes = await renderBrochurePdf({
      document: {
        bodyCopy: [],
        images: { rangeLogo: null, hero: null, technicalDrawing: null, secondary: null },
        keyFeatures: [],
        modelCode: 'SG1836',
        optionalAssemblies: [],
        standardAssemblies: [],
        subtitle: null,
        title: 'Silage Grain 18 36',
      },
      filename: 'SG1836-brochure.pdf',
    });

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(await getPdfPageSizes(bytes)).toHaveLength(2);
  });

  test('keeps the maximum configured key features on the two-page brochure', async () => {
    const bytes = await renderBrochurePdf({
      document: {
        ...fullBrochure(),
        keyFeatures: Array.from(
          { length: BROCHURE_KEY_FEATURES_MAX_COUNT },
          (_, index) =>
            `Extended feature ${index + 1} with enough copy to exercise wrapping without flowing onto a third page`,
        ),
      },
      filename: 'SG1836-brochure.pdf',
    });

    expect(await getPdfPageSizes(bytes)).toHaveLength(2);
  });
});
