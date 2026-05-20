import type React from 'react';

import logoSmallUrl from '@/assets/logo_small.png';
import { cn } from '@/lib/utils.js';

type AppBrandProps = {
  className?: string;
  size?: 'md' | 'sm';
};

const appBrandSizes: Record<NonNullable<AppBrandProps['size']>, { icon: string; text: string }> = {
  md: {
    icon: 'size-8',
    text: 'text-xl',
  },
  sm: {
    icon: 'size-6',
    text: 'text-lg',
  },
};

export const AppBrand: React.FC<AppBrandProps> = ({ className, size = 'md' }) => {
  const sizeClassNames = appBrandSizes[size];

  return (
    <div className={cn('flex min-w-0 items-center gap-2 text-left', className)}>
      <div
        className={cn(
          'flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary',
          sizeClassNames.icon,
        )}
      >
        <img alt="" className="size-full object-cover" src={logoSmallUrl} />
      </div>
      <div className={cn('min-w-0 flex-1 truncate whitespace-nowrap font-medium leading-none', sizeClassNames.text)}>
        <span>Jedidiah</span>
        <span className="text-primary">Ops</span>
      </div>
    </div>
  );
};
