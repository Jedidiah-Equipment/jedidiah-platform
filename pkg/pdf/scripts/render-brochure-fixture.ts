import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BrochureDocumentImage,
  type BrochureDocumentModel,
  Locale,
  PRODUCT_KEY_FEATURES_MAX_COUNT,
} from '@pkg/schema';

import { renderBrochurePdf } from '../src/brochure/brochure-pdf-renderer.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DEFAULT_OUTPUT_PATH = path.join(REPO_ROOT, 'tmp/pdfs/brochure-fixture.pdf');

const PLACEHOLDER_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==';

type FixtureVariant = 'dense' | 'reference' | 'sparse';
type ImageFit = NonNullable<BrochureDocumentImage>['fit'];

async function main() {
  const outputPath = outputPathFromArg(process.argv[2]);
  const locale = fixtureLocale();
  const variant = fixtureVariant();
  const document = await fixtureDocument(variant);
  const bytes = await renderBrochurePdf({ document, filename: path.basename(outputPath), locale });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  console.log(`Rendered ${variant} ${locale} fixture (${bytes.byteLength} bytes) to ${outputPath}`);
}

async function fixtureDocument(variant: FixtureVariant): Promise<BrochureDocumentModel> {
  const document: BrochureDocumentModel = {
    bodyCopy: [
      "1836 Plus Crosshaul Silage and Grain trailers feature a robust construction designed and developed to work in any demanding conditions. Whether you're moving grain at high speed or silage in uneven fields, these trailers are perfectly balanced and every detail carefully considered.",
      "Years of rigorous testing in extremely harsh conditions ensure dependable service. With various additional options and the flexibility to customize any part to meet our customers' needs, these trailers are leaders in their field.",
    ],
    images: {
      primary: await imageFromEnv('BROCHURE_HERO_IMAGE', 'cover'),
      banner: await imageFromEnv('BROCHURE_SECONDARY_IMAGE', 'cover'),
      technicalDrawing: await imageFromEnv('BROCHURE_TECHNICAL_IMAGE', 'contain'),
    },
    keyFeatures: ['Pay load: 18 tons', 'Volume standard: 25 cubic meters', 'Volume with extensions: 36 cubic meters'],
    modelCode: 'SG1836',
    rangeLogo: await imageFromEnv('BROCHURE_RANGE_LOGO_IMAGE', 'contain'),
    optionalAssemblies: [
      'Air brakes',
      'Multi hitch with 32mm articulating ball hitch',
      'Quickturn cup drawbar for hauler tractor',
      'Rigid cup drawbar for hauler tractor',
      'Silage extensions',
      'Easy grease system',
      'Secondary trailer light plug',
      'Secondary trailer hydraulic brake line',
      'Tractor spray mudflaps',
      '2 side work lights',
      '1 rear work light',
      'Black rims',
      'BKT tyres',
      'Custom paint color',
    ],
    standardAssemblies: [
      'Walking beam suspension with Henred axles',
      'Bugle eye hitch',
      'Sprung drawbar',
      'Trunnion tip cylinder',
      'Hydraulic brakes',
      'Park jack',
      'Side marker lights',
      'Rear brake & indicator lights',
      '560-60 R22.5 flotation tyres',
      'Front and rear mudflaps',
      'Hydraulic rear door with ladder',
      'Grain chute',
      'Jedidiah yellow paint finish',
    ],
    subtitle: 'Silage & Grain',
    title: 'SG1836 Plus',
    titleHighlight: 'Plus',
  };

  if (variant === 'sparse') {
    return {
      ...document,
      bodyCopy: ['Built for high productivity and reliability in demanding field conditions.'],
      keyFeatures: ['Pay load: 18 tons'],
      optionalAssemblies: ['BKT tyres'],
      standardAssemblies: ['Walking beam suspension'],
    };
  }

  if (variant === 'dense') {
    return {
      ...document,
      bodyCopy: denseDescription(),
      keyFeatures: Array.from(
        { length: PRODUCT_KEY_FEATURES_MAX_COUNT },
        (_, index) =>
          `High capacity field feature ${index + 1} with operating detail that may wrap in the brochure preview`,
      ),
      optionalAssemblies: denseAssemblies('Optional', 20),
      standardAssemblies: denseAssemblies('Standard', 18),
    };
  }

  return document;
}

async function imageFromEnv(
  envName:
    | 'BROCHURE_HERO_IMAGE'
    | 'BROCHURE_RANGE_LOGO_IMAGE'
    | 'BROCHURE_SECONDARY_IMAGE'
    | 'BROCHURE_TECHNICAL_IMAGE',
  fit: ImageFit,
): Promise<BrochureDocumentImage> {
  const imagePath = process.env[envName];

  if (!imagePath) {
    return { dataUri: PLACEHOLDER_PNG_DATA_URI, fit };
  }

  const bytes = await readFile(imagePath);

  return {
    dataUri: `data:${mimeType(imagePath)};base64,${bytes.toString('base64')}`,
    fit,
  };
}

function mimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  throw new Error(`Unsupported brochure fixture image type: ${extension}`);
}

function fixtureVariant(): FixtureVariant {
  const value = process.env.BROCHURE_FIXTURE_VARIANT ?? 'reference';

  if (value === 'dense' || value === 'reference' || value === 'sparse') {
    return value;
  }

  throw new Error(`Unsupported brochure fixture variant: ${value}`);
}

function fixtureLocale(): Locale {
  return Locale.parse(process.env.BROCHURE_FIXTURE_LOCALE ?? 'en');
}

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

function outputPathFromArg(value: string | undefined): string {
  if (!value) {
    return DEFAULT_OUTPUT_PATH;
  }

  return path.isAbsolute(value) ? value : path.join(REPO_ROOT, value);
}

await main();
