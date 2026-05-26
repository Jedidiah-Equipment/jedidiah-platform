import type React from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { cn } from '@/lib/utils.js';

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
      <CardContent className="flex flex-col gap-4">
        <Separator />
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </CardContent>
    </Card>
  </div>
);

function EditFormGrid({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('grid w-full gap-5 lg:grid-cols-2', className)} {...props} />;
}

function EditFormFullWidth({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('lg:col-span-2', className)} {...props} />;
}

function EditFormActions({ className, ...props }: React.ComponentProps<'div'>) {
  return <EditFormFullWidth className={cn('flex justify-end gap-2', className)} {...props} />;
}

export { EditFormActions, EditFormFullWidth, EditFormGrid };
