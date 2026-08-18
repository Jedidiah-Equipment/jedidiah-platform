import { type HelpTopic, helpUrl } from '@pkg/domain';
import type React from 'react';

import { getClientConfig } from '@/lib/app-config.js';
import { cn } from '@/lib/utils.js';

import { HelpIcon } from './HelpIcon.js';

type HelpLinkProps = {
  label: string;
  topic: HelpTopic;
} & Omit<React.ComponentProps<'a'>, 'aria-label' | 'href' | 'rel' | 'target'>;

/** Icon-only Help for a component whose topic is narrower than the surrounding page. */
export function HelpLink({ className, label, topic, ...props }: HelpLinkProps) {
  const { docsBaseUrl } = getClientConfig();

  if (!docsBaseUrl) {
    return null;
  }

  return (
    <a
      aria-label={label}
      className={cn('text-primary hover:text-primary/80', className)}
      href={helpUrl(docsBaseUrl, topic)}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      <HelpIcon className="size-5" />
    </a>
  );
}
