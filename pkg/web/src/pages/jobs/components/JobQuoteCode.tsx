import type { QuoteCode, UUID } from '@pkg/schema';
import { IconExternalLink } from '@tabler/icons-react';
import type React from 'react';

import { PrimaryLink } from '@/components/common/PrimaryLink.js';

export const JobQuoteCode: React.FC<{
  canOpenQuote: boolean;
  onOpenQuote: () => void;
  quoteCode: QuoteCode | null;
  quoteId: UUID | null;
}> = ({ canOpenQuote, onOpenQuote, quoteCode, quoteId }) => {
  if (!quoteCode || !quoteId) {
    // A Stock Build has no sale behind it, so there is no Quote to name or open.
    return <>Stock Build</>;
  }

  if (!canOpenQuote) {
    return <>{quoteCode}</>;
  }

  return (
    <PrimaryLink
      className="inline-flex items-center gap-1"
      onClick={onOpenQuote}
      params={{ id: quoteId }}
      to="/quotes/$id/edit"
    >
      {quoteCode}
      <IconExternalLink aria-hidden size={16} />
    </PrimaryLink>
  );
};
