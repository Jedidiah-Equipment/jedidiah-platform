import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrochureDocumentImage, BrochureDocumentModel } from '@pkg/schema';

import { renderBrochurePdf } from '../src/brochure/brochure-pdf-renderer.js';

const DEFAULT_OUTPUT_PATH = fileURLToPath(new URL('../../../tmp/pdfs/brochure-fixture.pdf', import.meta.url));

const PLACEHOLDER_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4YaMBRwzEcQDxwxLBXOwG1wAAAABJRU5ErkJggg==';

async function main() {
  const outputPath = path.resolve(process.argv[2] ?? DEFAULT_OUTPUT_PATH);
  const document = await fixtureDocument();
  const bytes = await renderBrochurePdf({ document, filename: path.basename(outputPath) });

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  console.log(`Rendered ${bytes.byteLength} bytes to ${outputPath}`);
}

async function fixtureDocument(): Promise<BrochureDocumentModel> {
  return {
    bodyCopy: [
      "1836 Plus Crosshaul Silage and Grain trailers feature a robust construction designed and developed to work in any demanding conditions. Whether you're moving grain at high speed or silage in uneven fields, these trailers are perfectly balanced and every detail carefully considered.",
      "Years of rigorous testing in extremely harsh conditions ensure dependable service. With various additional options and the flexibility to customize any part to meet our customers' needs, these trailers are leaders in their field.",
    ],
    images: {
      hero: await imageFromEnv('BROCHURE_HERO_IMAGE', 'cover'),
      rangeLogo: null,
      secondary: await imageFromEnv('BROCHURE_SECONDARY_IMAGE', 'cover'),
      technicalDrawing: await imageFromEnv('BROCHURE_TECHNICAL_IMAGE', 'contain'),
    },
    keyFeatures: ['Pay load : 18 tons', 'Volume standard : 25 cubes', 'Volume with extensions: 36 cubes'],
    modelCode: 'SG1836',
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
  };
}

async function imageFromEnv(
  envName: 'BROCHURE_HERO_IMAGE' | 'BROCHURE_SECONDARY_IMAGE' | 'BROCHURE_TECHNICAL_IMAGE',
  fit: BrochureDocumentImage['fit'],
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

await main();
