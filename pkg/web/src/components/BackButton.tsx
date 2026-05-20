import { createLink } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';
import { ArrowLeftIcon } from 'lucide-react';
import React from 'react';

import { buttonVariants } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

type BackButtonAnchorProps = React.ComponentProps<'a'> & Pick<VariantProps<typeof buttonVariants>, 'size'>;

const BackButtonAnchor = React.forwardRef<HTMLAnchorElement, BackButtonAnchorProps>(
  ({ className, size = 'default', children, ...props }, ref) => (
    <a ref={ref} data-slot="back-button" className={cn(buttonVariants({ variant: 'ghost', size, className }))} {...props}>
      <ArrowLeftIcon data-icon="inline-start" />
      {children}
    </a>
  ),
);

BackButtonAnchor.displayName = 'BackButtonAnchor';

export const BackButton = createLink(BackButtonAnchor);
