import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { Skeleton } from '@/components/ui/skeleton.js';

type DetailPageLayoutProps = {
  aside?: React.ReactNode;
  back: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  description?: string | undefined;
  title?: string | undefined;
};

export const DetailPageLayout: React.FC<DetailPageLayoutProps> = ({
  aside,
  back,
  badge,
  children,
  description,
  title,
}) => (
  <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
    <div>{back}</div>
    <Card>
      <CardHeader>
        {title !== undefined ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              {description ? <CardDescription>{description}</CardDescription> : null}
              <CardTitle>{title}</CardTitle>
            </div>
            {badge}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-64" />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        {aside ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex min-w-0 flex-col gap-4">{children}</div>
            <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">{aside}</aside>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  </div>
);
