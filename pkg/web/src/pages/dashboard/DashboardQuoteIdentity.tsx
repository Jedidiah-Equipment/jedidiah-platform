import { getQuoteOfferingName } from '@pkg/domain';
import type { JobCode, QuoteCode, QuoteKind, UUID } from '@pkg/schema';
import { Link } from '@tanstack/react-router';

import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';

type DashboardQuoteIdentityProps = {
  canOpenJob: boolean;
  quote: {
    code: QuoteCode;
    customerCompanyName: string;
    id: UUID;
    job: { jobCode: JobCode; jobId: UUID } | null;
    kind: QuoteKind;
    product: {
      buildTimeDays: number;
      modelCode: string;
      name: string;
      thumbnailDataUrl: string | null;
    } | null;
    workTitle: string | null;
  };
};

export function DashboardQuoteIdentity({ canOpenJob, quote }: DashboardQuoteIdentityProps) {
  const offeringName = getQuoteOfferingName(quote);

  return (
    <span className="flex min-w-0 items-center gap-2">
      <OfferingThumbnail
        kind={quote.kind}
        label={offeringName}
        preview={false}
        thumbnailDataUrl={getDashboardQuoteThumbnailDataUrl(quote)}
      />
      <span className="min-w-0">
        <Link
          className="block truncate font-medium text-foreground hover:underline"
          params={{ id: quote.id }}
          to="/quotes/$id/edit"
        >
          {quote.customerCompanyName}
        </Link>
        <span className="flex min-w-0 items-center text-muted-foreground text-xs">
          <Link
            className="shrink-0 hover:text-foreground hover:underline"
            params={{ id: quote.id }}
            to="/quotes/$id/edit"
          >
            {quote.code}
          </Link>
          <span aria-hidden className="px-1">
            ·
          </span>
          <span className="truncate">{offeringName}</span>
          {quote.job ? (
            <>
              <span aria-hidden className="shrink-0 px-1">
                ·
              </span>
              <span className="shrink-0">
                <JobCodeDisplay
                  canOpenJob={canOpenJob}
                  className="text-inherit"
                  jobCode={quote.job.jobCode}
                  jobId={quote.job.jobId}
                />
              </span>
            </>
          ) : null}
        </span>
      </span>
    </span>
  );
}

export function getDashboardQuoteThumbnailDataUrl(
  quote: DashboardQuoteIdentityProps['quote'],
): string | null | undefined {
  return quote.kind === 'product' ? quote.product?.thumbnailDataUrl : null;
}
