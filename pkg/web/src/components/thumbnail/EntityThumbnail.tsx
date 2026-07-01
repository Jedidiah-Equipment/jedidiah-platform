import type React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { cn } from '@/lib/utils.js';

// Thumbnails are stored square at 256px (see `ThumbnailField`), so that is the largest we can preview.
const PREVIEW_SIZE = 'h-64 w-64';
const PREVIEW_DELAY_MS = 1500;

type EntityThumbnailProps = {
  className?: string;
  label: string;
  thumbnailDataUrl?: string | null | undefined;
  size?: 'sm' | 'default' | 'lg';
};

export const EntityThumbnail: React.FC<EntityThumbnailProps> = ({
  className,
  label,
  size = 'default',
  thumbnailDataUrl,
}) => {
  const avatar = (
    <Avatar className={cn('rounded-md after:rounded-md', className)} size={size}>
      {thumbnailDataUrl ? <AvatarImage alt="" className="rounded-md" src={thumbnailDataUrl} /> : null}
      <AvatarFallback className="rounded-md font-medium">{getInitials(label)}</AvatarFallback>
    </Avatar>
  );

  if (!thumbnailDataUrl) {
    return avatar;
  }

  return (
    <HoverCard>
      <HoverCardTrigger delay={PREVIEW_DELAY_MS} render={<span className="inline-flex">{avatar}</span>} />
      <HoverCardContent className="w-auto p-1.5">
        <img alt={label} className={cn('rounded-md object-cover', PREVIEW_SIZE)} src={thumbnailDataUrl} />
      </HoverCardContent>
    </HoverCard>
  );
};

export function getInitials(label: string): string {
  const parts = label
    .trim()
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}
