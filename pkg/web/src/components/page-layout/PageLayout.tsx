import type React from 'react';

import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';
import { getPageLayoutSizeClassName, type PageLayoutSize } from './page-layout-size.js';

type PageLayoutProps = {
  actions?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  description?: string | undefined;
  size?: PageLayoutSize;
  title?: React.ReactNode | undefined;
};

export const PageLayout: React.FC<PageLayoutProps> = ({
  actions,
  aside,
  children,
  description,
  size = 'full',
  title,
}) => (
  <div className="flex flex-1 flex-col p-4 pt-6">
    <div className={cn('flex flex-col gap-4', getPageLayoutSizeClassName(size))}>
      {title !== undefined ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-heading text-2xl leading-tight font-medium">{title}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2 text-sm font-sans">{actions}</div> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-24" />
        </div>
      )}
      <Separator />
      {aside ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
          <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">{aside}</aside>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-4">{children}</div>
      )}
    </div>
  </div>
);
