import type React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.js';
import { cn } from '@/lib/utils.js';

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
}) => (
  <Avatar className={cn('rounded-md after:rounded-md', className)} size={size}>
    {thumbnailDataUrl ? <AvatarImage alt="" className="rounded-md" src={thumbnailDataUrl} /> : null}
    <AvatarFallback className="rounded-md font-medium">{getInitials(label)}</AvatarFallback>
  </Avatar>
);

export function getInitials(label: string): string {
  const parts = label
    .trim()
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);

  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}
