import { formatCurrency, formatPercent } from '@pkg/domain';
import type { ProductDocument, QuoteDetail } from '@pkg/schema';
import {
  IconAlertTriangle,
  IconClock,
  IconEye,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPhone,
  IconReceipt2,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { openQuoteEmailAssistant } from '../quote-email-assistant.js';
import { StartJobLink } from '../StartJobLink.js';
import type { SelectedAssemblySnapshot } from '../types.js';
import { DraftQuoteEmailDialog } from './DraftQuoteEmailDialog.js';

export type QuoteComputedSummary = {
  currencyCode: string;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountAmount: number;
  discountPercent: number;
  productPrice: number;
  selectedAssemblies: SelectedAssemblySnapshot[];
  selectedAssemblyTotal: number;
  total: number;
};

export function QuoteRightPanel({
  flushAutosave,
  quote,
  summary,
}: {
  flushAutosave: () => Promise<boolean>;
  quote: QuoteDetail;
  summary: QuoteComputedSummary;
}) {
  return (
    <aside className="order-first grid h-fit gap-4 border-b pb-5 text-sm xl:sticky xl:top-4 xl:order-0 xl:border-b-0 xl:pb-0 xl:pl-5">
      <QuoteCustomerCard quote={quote} />
      <QuoteProductCard quote={quote} />
      <QuoteTotalCard flushAutosave={flushAutosave} quote={quote} summary={summary} />
    </aside>
  );
}

function QuoteCustomerCard({ quote }: { quote: QuoteDetail }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Customer</CardDescription>
        <CardTitle className="min-w-0">
          <span className="block truncate">{quote.customerCompanyName}</span>
        </CardTitle>
        <CardAction>
          <EntityThumbnail
            className="size-10"
            label={quote.customerCompanyName}
            size="lg"
            thumbnailDataUrl={quote.customerThumbnailDataUrl}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <QuotePanelFact
          icon={<IconMail />}
          label="Email"
          value={
            quote.customerEmail ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 truncate">{quote.customerEmail}</span>
                <CopyValueButton label="Copy customer email" value={quote.customerEmail} />
              </span>
            ) : (
              'Not captured'
            )
          }
          muted={!quote.customerEmail}
        />
        <QuotePanelFact
          icon={<IconPhone />}
          label={quote.customerContactPerson ? quote.customerContactPerson : 'Phone'}
          value={quote.customerPhone ?? 'Not captured'}
          muted={!quote.customerPhone}
        />
        <QuotePanelFact
          icon={<IconReceipt2 />}
          label="VAT"
          value={quote.customerVatNumber ?? 'Not captured'}
          muted={!quote.customerVatNumber}
        />
        <QuotePanelFact
          icon={<IconMapPin />}
          label="Address"
          value={
            quote.customerAddress ? (
              <span className="block max-h-16 overflow-hidden whitespace-pre-line">{quote.customerAddress}</span>
            ) : (
              'Not captured'
            )
          }
          muted={!quote.customerAddress}
        />
      </CardContent>
    </Card>
  );
}

function QuoteProductCard({ quote }: { quote: QuoteDetail }) {
  const trpc = useTRPC();
  const [previewDocument, setPreviewDocument] = useState<ProductDocument | null>(null);

  const brochureQuery = useQuery(trpc.quotes.getProductBrochure.queryOptions({ quoteId: quote.id }));

  const standardCount = quote.productAssemblies.filter((assembly) => assembly.kind === 'standard').length;
  const optionalCount = quote.productAssemblies.filter((assembly) => assembly.kind === 'optional').length;
  const brochure = brochureQuery.data ?? null;

  const isMissingBrochure = brochureQuery.isSuccess && !brochure;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Product</CardDescription>
        <CardTitle className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="block truncate">{quote.productName}</span>
            <Badge variant="outline">{quote.productModelCode}</Badge>
          </div>
        </CardTitle>
        <CardAction>
          <EntityThumbnail
            className="size-10"
            label={quote.productName}
            size="lg"
            thumbnailDataUrl={quote.productThumbnailDataUrl}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!isMissingBrochure && (
          <div className="flex justify-end">
            <Button
              aria-label={`View brochure for ${quote.productName}`}
              disabled={brochureQuery.isLoading || !brochure}
              size="xs"
              type="button"
              variant="outline"
              onClick={() => {
                if (!brochure) {
                  toast.warning('No Product brochure is attached.');
                  return;
                }

                setPreviewDocument(brochure);
              }}
            >
              <IconEye data-icon="inline-start" />
              View Brochure
            </Button>
          </div>
        )}
        {isMissingBrochure ? (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertDescription>No Product brochure is attached.</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <QuoteMiniMetric
            icon={<IconPackage />}
            label="Base price"
            value={formatCurrency(quote.quotedBasePrice, quote.productCurrencyCode)}
          />
          <QuoteMiniMetric icon={<IconClock />} label="Build" value={`${quote.productBuildTimeDays} days`} />
          <QuoteMiniMetric label="Standard Assemblies" value={String(standardCount)} />
          <QuoteMiniMetric label="Optional Assemblies" value={String(optionalCount)} />
        </div>
        <Separator />
        <p className={cn('max-h-20 overflow-hidden text-sm', quote.productDescription ? '' : 'text-muted-foreground')}>
          {quote.productDescription ?? 'No product description captured.'}
        </p>
        <DocumentPreviewSheet
          document={previewDocument}
          onOpenChange={(open) => {
            if (!open) {
              setPreviewDocument(null);
            }
          }}
          open={Boolean(previewDocument)}
          owner={{ id: quote.id, type: 'quote-product-brochure' }}
        />
      </CardContent>
    </Card>
  );
}

function QuoteTotalCard({
  flushAutosave,
  quote,
  summary,
}: {
  flushAutosave: () => Promise<boolean>;
  quote: QuoteDetail;
  summary: QuoteComputedSummary;
}) {
  const navigate = useNavigate();

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Quote total</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatCurrency(summary.total, summary.currencyCode)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <QuoteSummaryRow label="Product price" value={formatCurrency(summary.productPrice, summary.currencyCode)} />
        <QuoteSummaryRow
          label="Less discount"
          value={`${formatCurrency(summary.discountAmount, summary.currencyCode)} (${formatPercent(summary.discountPercent)})`}
        />
        {summary.selectedAssemblyTotal > 0 ? (
          <div className="grid gap-1">
            <QuoteSummaryRow
              label="Optional assemblies"
              value={formatCurrency(summary.selectedAssemblyTotal, summary.currencyCode)}
            />
            <div className="grid gap-1 border-l pl-3">
              {summary.selectedAssemblies.map((assembly) => (
                <QuoteSummaryRow
                  className="text-xs"
                  key={`${assembly.id}:${assembly.productAssemblyId ?? 'stale'}`}
                  label={assembly.quotedName}
                  value={formatCurrency(assembly.quotedPrice, summary.currencyCode)}
                  valueClassName="text-muted-foreground"
                />
              ))}
            </div>
          </div>
        ) : null}
        {summary.deliveryIncluded ? (
          <QuoteSummaryRow label="Delivery" value={formatCurrency(summary.deliveryPrice, summary.currencyCode)} />
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t pt-2 font-medium">
          <span>Total</span>
          <span>{formatCurrency(summary.total, summary.currencyCode)}</span>
        </div>
        <Button
          className="mt-2 w-full"
          onClick={() => {
            void openQuoteEmailAssistant({
              flushAutosave,
              navigate,
              quote,
            }).then((didOpen) => {
              if (!didOpen) {
                toast.error('Fix the highlighted quote fields before generating the email.');
              }
            });
          }}
          type="button"
          variant="outline"
        >
          <IconMail data-icon="inline-start" />
          Generate Email
        </Button>
        <DraftQuoteEmailDialog className="mt-2 w-full" flushAutosave={flushAutosave} quote={quote} />
        <StartJobLink className="mt-2 w-full" quote={quote} />
      </CardContent>
    </Card>
  );
}

function QuotePanelFact({
  icon,
  label,
  muted,
  value,
}: {
  icon: React.ReactElement;
  label: string;
  muted?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
      <span className="pt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-muted-foreground text-xs">{label}</span>
        <span className={cn('block min-w-0', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</span>
      </span>
    </div>
  );
}

function QuoteMiniMetric({ icon, label, value }: { icon?: React.ReactElement; label: string; value: string }) {
  return (
    <Card className="min-h-14" size="sm">
      <CardContent className="grid gap-1">
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          {icon ? <span className="[&>svg]:size-3.5">{icon}</span> : null}
          <span className="truncate">{label}</span>
        </span>
        <span className="truncate font-medium">{value}</span>
      </CardContent>
    </Card>
  );
}

type QuoteSummaryRowProps = {
  className?: string;
  label: string;
  value: string;
  valueClassName?: string;
};

function QuoteSummaryRow({ className, label, value, valueClassName }: QuoteSummaryRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-muted-foreground', className)}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn('shrink-0 text-foreground', valueClassName)}>{value}</span>
    </div>
  );
}
