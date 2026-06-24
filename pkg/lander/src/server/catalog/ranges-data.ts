import { listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';

export type HomeRange = {
  id: string;
  name: string;
  description: string;
  // Typed as the literal route so range cards can navigate via the router's <Link> with full type safety.
  href: '/products';
  imageUrl: string;
};

// Equipment Ranges for the Home grid. Real data only: a Range with no marketing blurb renders an empty
// description rather than fabricated copy. Every card points at the public Range image route, which streams
// the real image or falls back to the neutral placeholder, so the view model needs no image presence flag.
export async function loadHomeRanges(db: Db): Promise<HomeRange[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.map((range) => ({
    id: range.id,
    name: range.name,
    description: range.description ?? '',
    href: '/products',
    imageUrl: `/images/ranges/${range.id}`,
  }));
}
