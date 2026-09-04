import { hasPermission } from '@pkg/domain';
import { isReworkQuote } from '@pkg/domain/equipment';
import type { QuoteDetail } from '@pkg/schema/equipment';
import { IconBriefcase2 } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { useAccess } from '@/hooks/use-access.js';
import { canStartJobFromQuote, type StartableQuote } from './start-job-eligibility.js';

type StartJobLinkProps = {
  className?: string;
  quote: StartableQuote & Pick<QuoteDetail, 'code' | 'id'>;
  size?: 'default' | 'icon-sm';
};

/** Entry point to the Start Job page; rendered only when this quote can start a Job. */
export const StartJobLink: React.FC<StartJobLinkProps> = ({ className, quote, size = 'default' }) => {
  const accessQuery = useAccess();
  const canCreateJob = hasPermission(accessQuery.data, 'equipment_job:create');
  const label = isReworkQuote(quote) ? 'Start Rework Job' : 'Start Job';

  if (!canCreateJob || !canStartJobFromQuote(quote)) {
    return null;
  }

  return (
    <Button
      aria-label={`${label} from quote ${quote.code}`}
      className={className}
      render={<Link params={{ id: quote.id }} to="/equipment/quotes/$id/start-job" />}
      size={size}
      variant={size === 'icon-sm' ? 'outline' : 'default'}
    >
      <IconBriefcase2 data-icon={size === 'icon-sm' ? undefined : 'inline-start'} />
      {size === 'icon-sm' ? null : label}
    </Button>
  );
};
