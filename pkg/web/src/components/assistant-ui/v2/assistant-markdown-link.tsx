import { useNavigate } from '@tanstack/react-router';
import type React from 'react';

import { getClientConfig } from '@/lib/app-config.js';
import { cn } from '@/lib/utils.js';

type AssistantMarkdownLinkProps = React.ComponentProps<'a'>;

export const AssistantMarkdownLink: React.FC<AssistantMarkdownLinkProps> = ({ className, href, onClick, ...props }) => {
  const navigate = useNavigate();
  const resolvedHref = resolveAssistantLinkHref(href, getClientConfig().apiBaseUrl);

  return (
    <a
      className={cn('text-primary underline underline-offset-2 hover:text-primary/80', className)}
      href={resolvedHref}
      onClick={(event) => {
        onClick?.(event);

        if (event.defaultPrevented) {
          return;
        }

        const routerHref = getInternalRouterHref(resolvedHref);

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

export function resolveAssistantLinkHref(href: string | undefined, apiBaseUrl: string): string | undefined {
  // Generated document paths are API-owned; resolving them here keeps domain entity links app-relative
  // while ensuring document clicks cross to the API origin in split-origin development.
  return href?.startsWith('/api/') ? new URL(href, apiBaseUrl).toString() : href;
}

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
