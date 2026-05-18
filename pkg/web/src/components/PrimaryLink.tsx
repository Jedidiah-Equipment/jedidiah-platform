import { createLink } from '@tanstack/react-router';
import React from 'react';

import { cn } from '@/lib/utils.js';

type PrimaryLinkAnchorProps = React.ComponentProps<'a'>;

const PrimaryLinkAnchor = React.forwardRef<HTMLAnchorElement, PrimaryLinkAnchorProps>(
  ({ className, ...props }, ref) => (
    <a ref={ref} className={cn('font-medium text-primary underline-offset-4 hover:underline', className)} {...props} />
  ),
);

PrimaryLinkAnchor.displayName = 'PrimaryLinkAnchor';

export const PrimaryLink = createLink(PrimaryLinkAnchor);
