import type * as React from 'react';

import { cn } from '@/lib/utils';

type CardProps = React.ComponentProps<'div'> & {
  interactive?: boolean;
  size?: 'default' | 'sm';
};

function Card({ className, interactive = false, size = 'default', ...props }: CardProps) {
  return (
    <div
      data-interactive={interactive ? 'true' : undefined}
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex min-w-0 flex-col gap-4 overflow-hidden rounded-lg border border-border/70 bg-card py-4 text-sm text-card-foreground transition-colors has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[interactive=true]:hover:border-foreground/20 data-[interactive=true]:hover:bg-muted/30 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 in-data-[slot=card]:bg-muted/30 dark:in-data-[slot=card]:bg-muted/40 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-lg px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function CardAction({
  className,
  span = 'header',
  ...props
}: React.ComponentProps<'div'> & { span?: 'header' | 'title' }) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-start-1 self-start justify-self-end',
        // Use title span when the header content owns its own subtitle; the default spans title + description rows.
        span === 'header' ? 'row-span-2' : 'row-span-1',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 group-data-[size=sm]/card:px-3', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center rounded-b-lg border-t bg-muted/50 p-4 group-data-[size=sm]/card:p-3', className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
