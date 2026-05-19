import { useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { cn } from '@/lib/utils.js';

type AssistantMarkdownLinkProps = React.ComponentProps<'a'>;

export const AssistantMarkdownLink: React.FC<AssistantMarkdownLinkProps> = ({ className, href, onClick, ...props }) => {
  const navigate = useNavigate();

  return (
    <a
      className={cn('text-primary underline underline-offset-2 hover:text-primary/80', className)}
      href={href}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const routerHref = getInternalRouterHref(href);

        if (!routerHref || shouldUseNativeLinkBehavior(event, props)) {
          return;
        }

        event.preventDefault();
        void navigate({ href: routerHref });
      }}
      {...props}
    />
  );
};

export function getInternalRouterHref(href: string | undefined, origin = window.location.origin): string | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, origin);

    if (url.origin !== origin) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function shouldUseNativeLinkBehavior(
  event: React.MouseEvent<HTMLAnchorElement>,
  props: Pick<AssistantMarkdownLinkProps, 'download' | 'target'>,
): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey ||
    Boolean(props.download) ||
    Boolean(props.target)
  );
}
