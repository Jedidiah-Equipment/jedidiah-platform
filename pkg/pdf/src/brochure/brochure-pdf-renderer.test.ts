import { type BrochureDocumentModel, PRODUCT_KEY_FEATURES_MAX_COUNT } from '@pkg/schema';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../bytes/pdf-bytes.js';
import { getCoverLayout } from './BrochureDocumentPdf.js';
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
      primary: image('cover'),
      technicalDrawing: image('contain'),
      banner: image('cover'),
    },
    keyFeatures: ['Heavy-duty steel construction', 'Low maintenance', 'Hydraulic drive'],
    locale: 'en',
    modelCode: 'SG1836',
    optionalAssemblies: ['Side working lights', 'BKT tyres'],
    rangeLogo: image('contain'),
    standardAssemblies: ['Main chassis', 'Auger assembly'],
    subtitle: 'Silage & Grain',
    title: 'Silage Grain 18 36',
    titleHighlight: '18 36',
  };
}

async function expectTwoPageBrochure(document: BrochureDocumentModel) {
  const bytes = await renderBrochurePdf({ document, filename: 'SG1836-brochure.pdf' });

  expect(bytes.byteLength).toBeGreaterThan(1_000);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  expect(await getPdfPageSizes(bytes)).toHaveLength(2);
}

describe('renderBrochurePdf', () => {
  test('renders Afrikaans PDF metadata', async () => {
    const bytes = await renderBrochurePdf({
      document: { ...fullBrochure(), locale: 'af' },
      filename: 'SG1836-brochure-af.pdf',
    });
    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getSubject()).toBe('Brosjure SG1836');
  });

  test('renders a complete brochure model to valid PDF bytes spanning two pages', async () => {
    await expectTwoPageBrochure(fullBrochure());
  });

  test('omits absent optional sections and still renders valid bytes across two pages', async () => {
    await expectTwoPageBrochure({
      bodyCopy: [],
      images: { primary: null, technicalDrawing: null, banner: null },
      keyFeatures: [],
      locale: 'en',
      modelCode: 'SG1836',
      optionalAssemblies: [],
      rangeLogo: null,
      standardAssemblies: [],
      subtitle: null,
      title: 'Silage Grain 18 36',
      titleHighlight: null,
    });
  });

  test('keeps the maximum configured key features on the two-page brochure', async () => {
    await expectTwoPageBrochure({
      ...fullBrochure(),
      keyFeatures: Array.from(
        { length: PRODUCT_KEY_FEATURES_MAX_COUNT },
        (_, index) =>
          `Extended feature ${index + 1} with enough copy to exercise wrapping without flowing onto a third page`,
      ),
    });
  });

  test('keeps long product names from pushing cover content onto an extra page', async () => {
    await expectTwoPageBrochure({
      ...fullBrochure(),
      title: 'KUILVOER- EN GRAANSLEEPWA 18 TON',
      titleHighlight: '18',
    });
  });

  test('keeps dense assembly columns on the two-page brochure', async () => {
    await expectTwoPageBrochure({
      ...fullBrochure(),
      optionalAssemblies: denseAssemblies('Optional', 20),
      standardAssemblies: denseAssemblies('Standard', 18),
    });
  });

  test('keeps a longer brochure description on the two-page brochure', async () => {
    await expectTwoPageBrochure({
      ...fullBrochure(),
      bodyCopy: denseDescription(),
    });
  });

  test('keeps dense feature, assembly, and description content on the two-page brochure', async () => {
    await expectTwoPageBrochure({
      ...fullBrochure(),
      bodyCopy: denseDescription(),
      keyFeatures: Array.from(
        { length: PRODUCT_KEY_FEATURES_MAX_COUNT },
        (_, index) =>
          `High capacity field feature ${index + 1} with operating detail that may wrap in the brochure preview`,
      ),
      optionalAssemblies: denseAssemblies('Optional', 20),
      standardAssemblies: denseAssemblies('Standard', 18),
    });
  });
});

describe('getCoverLayout', () => {
  test('reduces the title font size without changing cover spacing', () => {
    const keyFeatures = ['Pay load: 18 tons', 'Volume standard: 25 cubic meters'];

    expect(getCoverLayout(keyFeatures, 'SG1836 Plus').titleFontSize).toBe(52);
    expect(getCoverLayout(keyFeatures, 'KUILVOER- EN GRAANSLEEPWA 18 TON').titleFontSize).toBe(40);
    expect(getCoverLayout(keyFeatures, 'SG1836 Plus').sectionMarginTop).toBe(86);
    expect(getCoverLayout(keyFeatures, 'KUILVOER- EN GRAANSLEEPWA 18 TON').sectionMarginTop).toBe(86);
  });

  test('widens the key feature list for cubic-meter labels', () => {
    expect(
      getCoverLayout([
        'Pay load: 18 tons',
        'Volume standard: 25 cubic meters',
        'Volume with extensions: 36 cubic meters',
      ]).featureListWidth,
    ).toBe(334);
  });

  test('caps very long key feature labels', () => {
    expect(getCoverLayout(['Extended operating feature '.repeat(20)]).featureListWidth).toBe(430);
  });
});

function denseAssemblies(prefix: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${prefix} assembly ${index + 1} with extended field-ready equipment description`,
  );
}

function denseDescription(): string[] {
  return [
    '1836 Plus Crosshaul Silage and Grain trailers feature a robust construction designed and developed to work in demanding conditions with dependable field performance.',
    'Whether moving grain at speed or silage in uneven fields, these trailers remain balanced and every detail is carefully considered for long working days.',
    'Years of rigorous testing in harsh conditions ensure dependable service, practical maintenance, and reliable productivity across varied farming operations.',
    'Additional options and flexible customization let customers configure the trailer around their operating needs while keeping the brochure to two pages.',
  ];
}
