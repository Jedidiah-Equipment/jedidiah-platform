import type { QuoteCode, UUID } from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import type React from 'react';

export const JobQuoteCode: React.FC<{
  canOpenQuote: boolean;
  quoteCode: QuoteCode | null;
  quoteId: UUID | null;
}> = ({ canOpenQuote, quoteCode, quoteId }) => {
  if (!quoteCode || !quoteId) {
    return <>Stock Build</>;
  }

  if (!canOpenQuote) {
    return <>{quoteCode}</>;
  }

  return (
    <Link className="underline-offset-4 hover:underline" params={{ id: quoteId }} to="/quotes/$id/edit">
      {quoteCode}
    </Link>
  );
};
