import { quoteKindColorClassNames } from '@pkg/domain';
import type { QuoteKind } from '@pkg/schema';
import { IconPackage, IconTools } from '@tabler/icons-react';
import type React from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { cn } from '@/lib/utils.js';

const offeringKindIcons = {
  custom: IconTools,
  product: IconPackage,
} as const satisfies Record<QuoteKind, React.ElementType>;

type OfferingThumbnailProps = {
  className?: string;
  kind: QuoteKind;
  label: string;
  preview?: boolean;
  size?: 'sm' | 'default' | 'lg';
  thumbnailDataUrl?: string | null | undefined;
};

/**
 * Avatar for what a Quote or Job sells: the Product photo when there is one, otherwise the offering
 * kind's icon on its colour. Offerings never fall back to initials — the kind is the useful signal.
 */
export const OfferingThumbnail: React.FC<OfferingThumbnailProps> = ({ kind, ...props }) => {
  const KindIcon = offeringKindIcons[kind];
  const { chip, text } = quoteKindColorClassNames[kind];

  return (
    <EntityThumbnail
      {...props}
      fallback={<KindIcon aria-hidden className="size-[55%]" />}
      fallbackClassName={cn(chip, text)}
    />
  );
};
