import { hasPermission } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { IconBriefcase2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { useAccess } from '@/hooks/use-access.js';

type StartJobLinkProps = {
  className?: string;
  quote: Pick<QuoteDetail, 'code' | 'id' | 'job' | 'kind' | 'status'>;
  size?: 'default' | 'icon-sm';
};

/** Entry point to the Start Job page; rendered only when this quote can start a Job. */
export const StartJobLink: React.FC<StartJobLinkProps> = ({ className, quote, size = 'default' }) => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canGenerate = quote.kind === 'product' && quote.status === 'accepted' && quote.job === null;

  if (!canCreateJob || !canGenerate) {
    return null;
  }

  return (
    <Button
      aria-label={`Generate CFO and start job from quote ${quote.code}`}
      className={className}
      render={<Link params={{ id: quote.id }} to="/quotes/$id/start-job" />}
      size={size}
      variant={size === 'icon-sm' ? 'outline' : 'default'}
    >
      <IconBriefcase2 data-icon={size === 'icon-sm' ? undefined : 'inline-start'} />
      {size === 'icon-sm' ? null : 'Generate CFO & Start Job'}
    </Button>
  );
};
