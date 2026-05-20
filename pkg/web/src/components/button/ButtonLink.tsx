import { createLink } from '@tanstack/react-router';
import type { VariantProps } from 'class-variance-authority';
import React from 'react';

import { buttonVariants } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

type ButtonLinkAnchorProps = React.ComponentProps<'a'> & VariantProps<typeof buttonVariants>;

const ButtonLinkAnchor = React.forwardRef<HTMLAnchorElement, ButtonLinkAnchorProps>(
  ({ className, size = 'default', variant = 'default', ...props }, ref) => (
    <a ref={ref} data-slot="button-link" className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);

ButtonLinkAnchor.displayName = 'ButtonLinkAnchor';

export const ButtonLink = createLink(ButtonLinkAnchor);
