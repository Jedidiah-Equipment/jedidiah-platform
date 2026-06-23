import { listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';

export type HomeRange = {
  id: string;
  name: string;
  description: string;
  href: string;
};

// Equipment Ranges for the Home grid. Real data only: a Range with no marketing blurb renders an empty
// description rather than fabricated copy. Range imagery is a neutral placeholder until the image-routes
// slice lands, so the view model carries no image URL yet.
export async function loadHomeRanges(db: Db): Promise<HomeRange[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.map((range) => ({
    id: range.id,
    name: range.name,
    description: range.description ?? '',
    href: '/products',
  }));
}
