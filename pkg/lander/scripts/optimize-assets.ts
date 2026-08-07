// Regenerates the Lander's presentation images from their full-resolution sources.
//
// The sources are authoring masters — a 3793px wide wordmark, a 1833px hero photograph — and shipping them
// as-is put roughly 1.2 MB of images on the homepage's critical path. The outputs below are sized to what
// the layout actually paints (times a 3x device pixel ratio) and encoded as WebP.
//
// Outputs land in `src/assets/generated/` so Vite content-hashes them and they can be served immutably.
// They are committed: generating at build time would put sharp on the deploy critical path for files that
// only change when a designer hands over a new master.
//
// Run `pnpm --filter @pkg/lander assets:optimize` after replacing any source, and commit the result.

import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const landerDir = join(scriptDir, '..');
const brandDir = join(landerDir, '..', 'domain', 'assets', 'brand');
const sourceDir = join(landerDir, 'assets', 'sources');
const outDir = join(landerDir, 'src', 'assets', 'generated');

// A photograph carries noise that WebP spends bits on for no visible gain; a flat-colour wordmark shows
// ringing at the same setting. Hence the tiers.
const PHOTO = { quality: 74, effort: 6 } as const;
// The hero is never seen unmediated: a 94%-to-15% black gradient sits over it on the homepage and a blur
// plus a 55% scrim on every other page. Detail below this threshold cannot survive the overlay.
const OVERLAID_PHOTO = { quality: 62, effort: 6 } as const;
const GRAPHIC = { quality: 90, effort: 6 } as const;

type Job = {
  source: string;
  /** Output basename; each width is emitted as `<name>-<width>.webp`. */
  name: string;
  widths: number[];
  encode: { effort: number; quality: number };
};

const JOBS: Job[] = [
  // Homepage hero, full-bleed. Also reused, at its narrow widths, as the blurred backdrop behind every
  // secondary page heading.
  // The 1833px master is deliberately not emitted: past 1600px the extra bytes buy nothing a viewer can see
  // through the overlay.
  {
    source: join(sourceDir, 'hero-silage-harvest.jpg'),
    name: 'hero-silage-harvest',
    widths: [640, 960, 1280, 1600],
    encode: OVERLAID_PHOTO,
  },
  // About page team photo, below the fold, painted at most ~1224px wide.
  {
    source: join(sourceDir, 'about-staff.webp'),
    name: 'about-staff',
    widths: [768, 1224, 2048],
    encode: PHOTO,
  },
  // Nav wordmark: 44px tall, ~161px wide.
  { source: join(brandDir, 'jedidiah-logo.png'), name: 'jedidiah-logo', widths: [480], encode: GRAPHIC },
  // Footer wordmark: 40px tall, ~185px wide.
  { source: join(brandDir, 'jedidiah-logo-full.png'), name: 'jedidiah-logo-full', widths: [560], encode: GRAPHIC },
  // Section watermark. CSS paints it up to 780px wide, but the master is 583px and it renders at 4.5%
  // opacity, where the upscale is invisible — as it already is today.
  { source: join(brandDir, 'jedidiah-mark-black.png'), name: 'jedidiah-mark-black', widths: [583], encode: GRAPHIC },
  // Feature bar icons: 56px square.
  {
    source: join(sourceDir, 'feature-icons', 'sa-built.png'),
    name: 'feature-sa-built',
    widths: [168],
    encode: GRAPHIC,
  },
  {
    source: join(sourceDir, 'feature-icons', 'heavy-duty.png'),
    name: 'feature-heavy-duty',
    widths: [168],
    encode: GRAPHIC,
  },
  { source: join(sourceDir, 'feature-icons', 'trailer.png'), name: 'feature-trailer', widths: [168], encode: GRAPHIC },
];

async function run(): Promise<void> {
  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  const aspects: string[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const job of JOBS) {
    const { height: sourceHeight, width: sourceWidth } = await sharp(job.source).metadata();
    if (!sourceWidth || !sourceHeight) {
      throw new Error(`Could not read dimensions for ${job.source}`);
    }
    totalIn += (await stat(job.source)).size;

    for (const width of job.widths) {
      if (width > sourceWidth) {
        throw new Error(`${job.name}: requested ${width}px from a ${sourceWidth}px source — upscaling is never right`);
      }

      const buffer = await sharp(job.source).resize({ width }).webp(job.encode).toBuffer();
      await writeFile(join(outDir, `${job.name}-${width}.webp`), buffer);
      totalOut += buffer.byteLength;
    }

    aspects.push(`  '${job.name}': { width: ${sourceWidth}, height: ${sourceHeight} },`);
    console.log(`${job.name}: ${sourceWidth}x${sourceHeight} -> ${job.widths.join(', ')}`);
  }

  // Emitted rather than hand-maintained: an `<img>` needs the intrinsic ratio to reserve its box before the
  // bytes arrive, and a number that silently disagrees with the file is exactly the kind of layout shift
  // this whole script exists to remove.
  await writeFile(
    join(outDir, 'dimensions.ts'),
    [
      '// Generated by scripts/optimize-assets.ts. Do not edit.',
      '// Intrinsic dimensions of each master, for width/height attributes and aspect-ratio boxes.',
      '',
      'export const SOURCE_DIMENSIONS = {',
      ...aspects,
      '} as const;',
      '',
    ].join('\n'),
  );

  const generated = (await readdir(outDir)).length;
  console.log(`\n${generated} files, ${kb(totalIn)} of sources -> ${kb(totalOut)} generated`);
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}

await run();
