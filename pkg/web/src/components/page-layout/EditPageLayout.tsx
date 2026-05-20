import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';

type EditPageLayoutProps = {
  back: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  description: string;
  title: string;
};

export const EditPageLayout: React.FC<EditPageLayoutProps> = ({ back, badge, children, description, title }) => (
  <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
    <div>{back}</div>
    <Card>
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{title}</CardTitle>
          {badge}
        </div>
      </CardHeader>
      <CardContent className="max-w-2xl">
        {children}
      </CardContent>
    </Card>
  </div>
);
