import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusinessIcon, EditIcon } from 'lucide-react';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ButtonLink } from '@/components/button/ButtonLink.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatCurrency } from '@/utils/number.js';
import { QuoteLinkedJobs } from './components/QuoteLinkedJobs.js';
import { QuoteStatusBadge, quoteStatusLabels } from './components/QuoteStatusBadge.js';

type QuoteDetailPageProps = {
  quoteId: UUID;
};

export const QuoteDetailPage: React.FC<QuoteDetailPageProps> = ({ quoteId }) => {
  const trpc = useTRPC();
  const accessQuery = useAccess();

  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const quote = quoteQuery.data;

  const currencyCode = quote?.quotedCurrencyCode ?? quote?.productCurrencyCode ?? undefined;

  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canCreateJob = hasPermission(accessQuery.data, 'job:create');
  const canOpenJobs = hasPermission(accessQuery.data, 'job:read') || hasPermission(accessQuery.data, 'job:update');

  return (
    <DetailPageLayout
      back={<BackButton to="/quotes">Quotes</BackButton>}
      badge={quote ? <QuoteStatusBadge status={quote.status} /> : undefined}
      description={quote?.code}
      title={quote?.customerCompanyName}
    >
      <ErrorMessage error={quoteQuery.error} fallbackMessage="Unable to load quote." />
      {quote ? (
        <>
          <div className="flex flex-wrap gap-2">
            {canUpdateQuote ? (
              <ButtonLink params={{ id: quote.id }} to="/quotes/$id/edit" variant="outline">
                <EditIcon data-icon="inline-start" />
                Edit
              </ButtonLink>
            ) : null}
            {canCreateJob ? (
              <ButtonLink search={{ quoteId: quote.id }} to="/jobs/new">
                <BriefcaseBusinessIcon data-icon="inline-start" />
                Create job
              </ButtonLink>
            ) : null}
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <QuoteFact label="Status" value={quoteStatusLabels[quote.status]} />
            <QuoteFact
              label="Product"
              value={quote.productName ? `${quote.productName} (${quote.productModelCode})` : 'Not set'}
            />
            <QuoteFact label="Salesperson" value={quote.salesPersonName ?? 'Unassigned'} />
            <QuoteFact label="Valid until" value={<DateDisplay date={quote.validUntil} emptyValue="Not set" />} />
            <QuoteFact
              label="Preferred delivery date"
              value={<DateDisplay date={quote.preferredDeliveryDate} emptyValue="Not set" />}
            />
            <QuoteFact
              label="Planned delivery date"
              value={<DateDisplay date={quote.plannedDeliveryDate} emptyValue="Not set" />}
            />
            <QuoteFact label="Sent" value={<DateDisplay date={quote.sentAt} emptyValue="Not sent" format="medium" />} />
            <QuoteFact
              label="Total"
              value={quote.total === null ? 'Not set' : formatCurrency(quote.total, currencyCode)}
            />
            <QuoteFact label="Discount" value={formatCurrency(quote.discount, currencyCode)} />
            <QuoteFact
              label="Quoted base price"
              value={
                quote.quotedBasePrice === null ? 'Not snapshotted' : formatCurrency(quote.quotedBasePrice, currencyCode)
              }
            />
            <QuoteFact
              label="Jobs"
              value={<QuoteLinkedJobs canOpenJobs={canOpenJobs} linkedJobs={quote.linkedJobs} />}
            />
          </div>
          {quote.notes ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 font-medium">Notes</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{quote.notes}</p>
            </div>
          ) : null}
          {quote.paymentTerms ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 font-medium">Payment Terms</div>
              <p className="whitespace-pre-wrap text-muted-foreground">{quote.paymentTerms}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {quoteQuery.isLoading ? <Skeleton className="h-40" /> : null}
    </DetailPageLayout>
  );
};

const QuoteFact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-md border p-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="mt-1 wrap-break-word">{value}</div>
  </div>
);
