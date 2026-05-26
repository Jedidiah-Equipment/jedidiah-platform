import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';

type ListPageLayoutProps = {
  action?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
};

export const ListPageLayout: React.FC<ListPageLayoutProps> = ({ action, children, description, title }) => (
  <div className="flex flex-1 flex-col gap-4 p-4 pt-3">
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardDescription>{description}</CardDescription>
            <CardTitle>{title}</CardTitle>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Separator />
        {children}
      </CardContent>
    </Card>
  </div>
);
