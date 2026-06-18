import type { EntityImage, UUID } from '@pkg/schema';
import type React from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { useCredentialedImagePreview } from '@/hooks/use-credentialed-image-preview.js';
import { fetchProductRangeImageBlob } from '@/utils/range-image.js';

type RangeThumbnailProps = {
  image: EntityImage | null;
  name: string;
  rangeId: UUID;
};

// A Range list/card avatar. Fetches the image as a credentialed blob (the bytes live behind an authed
// download route) and feeds the resulting object URL to the shared thumbnail, falling back to initials.
export const RangeThumbnail: React.FC<RangeThumbnailProps> = ({ image, name, rangeId }) => {
  const previewUrl = useCredentialedImagePreview({
    enabled: image !== null,
    fetchBlob: ({ signal }) => fetchProductRangeImageBlob({ rangeId, signal }),
    queryKey: ['range-image-preview', rangeId, image?.updatedAt ?? null],
  });

  return <EntityThumbnail label={name} size="lg" thumbnailDataUrl={previewUrl} />;
};
