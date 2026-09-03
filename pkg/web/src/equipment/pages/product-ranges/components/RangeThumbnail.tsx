import type { EntityFile, UUID } from '@pkg/schema';
import type React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import { getInitials } from '@/equipment/components/thumbnail/EntityThumbnail.js';
import { useCredentialedImagePreview } from '@/equipment/hooks/use-credentialed-image-preview.js';
import { fetchProductRangeImageBlob } from '@/equipment/utils/range-image.js';
import { fetchProductRangeLogoBlob } from '@/equipment/utils/range-logo.js';
import { cn } from '@/lib/utils.js';

type RangeThumbnailProps = {
  asset: 'image' | 'logo';
  image: EntityFile | null;
  name: string;
  rangeId: UUID;
};

// Range image bytes live behind authed download routes, so list thumbnails fetch credentialed blobs
// instead of using direct object-storage URLs.
export const RangeThumbnail: React.FC<RangeThumbnailProps> = ({ asset, image, name, rangeId }) => {
  const previewUrl = useCredentialedImagePreview({
    enabled: image !== null,
    fetchBlob: ({ signal }) =>
      asset === 'logo'
        ? fetchProductRangeLogoBlob({ rangeId, signal })
        : fetchProductRangeImageBlob({ rangeId, signal }),
    queryKey: [`range-${asset}-preview`, rangeId, image?.updatedAt ?? null],
  });

  return (
    <Avatar className="rounded-md after:rounded-md" size="lg">
      {previewUrl ? (
        <AvatarImage
          alt=""
          className={cn('rounded-md', asset === 'logo' ? 'bg-background object-contain p-1' : 'object-cover')}
          src={previewUrl}
        />
      ) : null}
      <AvatarFallback className="rounded-md font-medium">{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
};
