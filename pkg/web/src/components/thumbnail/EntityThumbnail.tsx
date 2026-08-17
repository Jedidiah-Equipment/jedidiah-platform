import type React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import { Badge } from '@/components/ui/badge.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card.js';
import { cn } from '@/lib/utils.js';

// Thumbnails are stored square at 256px (see `ThumbnailField`), so that is the largest we can preview.
const PREVIEW_SIZE = 'h-64 w-64';
const PREVIEW_DELAY_MS = 1500;

type EntityThumbnailProps = {
  className?: string;
  /** Replaces the initials when there is no image, for entities an icon identifies better than a name. */
  fallback?: React.ReactNode;
  fallbackClassName?: string;
  /** Accessible name for an icon `fallback`, which carries no text of its own. */
  fallbackLabel?: string;
  label: string;
  preview?: boolean;
  /** Circles read as a person rather than a record — reach for one where a surface says "who". */
  shape?: 'circle' | 'square';
  thumbnailDataUrl?: string | null | undefined;
  size?: 'sm' | 'default' | 'lg';
};

export const EntityThumbnail: React.FC<EntityThumbnailProps> = ({
  className,
  fallback,
  fallbackClassName,
  fallbackLabel,
  label,
  preview = true,
  shape = 'square',
  size = 'default',
  thumbnailDataUrl,
}) => {
  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-md';
  const avatar = (
    <Avatar
      className={cn(rounded, shape === 'circle' ? 'after:rounded-full' : 'after:rounded-md', className)}
      size={size}
    >
      {thumbnailDataUrl ? <AvatarImage alt="" className={rounded} src={thumbnailDataUrl} /> : null}
      <AvatarFallback
        aria-label={fallback ? fallbackLabel : undefined}
        className={cn(rounded, 'font-medium', fallbackClassName)}
        role={fallback ? 'img' : undefined}
      >
        {fallback ?? getInitials(label)}
      </AvatarFallback>
    </Avatar>
  );

  if (!thumbnailDataUrl || !preview) {
    return avatar;
  }

  return (
    <HoverCard>
      <HoverCardTrigger delay={PREVIEW_DELAY_MS} render={<span className="inline-flex">{avatar}</span>} />
      <HoverCardContent className="relative w-auto p-1.5">
        <img alt={label} className={cn('rounded-md object-cover', PREVIEW_SIZE)} src={thumbnailDataUrl} />
        <Badge className="absolute right-3 bottom-3 max-w-[calc(100%-1.5rem)] truncate shadow-sm" variant="secondary">
          {label}
        </Badge>
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
