import {
  createStableRowKeys,
  formatCurrency,
  formatNumber,
  formatPercent,
  getQuoteOfferingName,
  type QuoteComputedSummary,
  quoteProductSourceOf,
  quoteStatusLabels,
  quoteWorkItemSummaryRows,
} from '@pkg/domain';
import type { QuoteDetail, QuoteWorkItemCharge } from '@pkg/schema';
import {
  IconBuildingWarehouse,
  IconClock,
  IconFileDescription,
  IconMail,
  IconMapPin,
  IconPackage,
  IconPhone,
  IconReceipt2,
  IconSubtask,
} from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { cn } from '@/lib/utils.js';
import { QuoteProductSourceBadge } from '../QuoteProductSourceBadge.js';
import { StartJobLink } from '../StartJobLink.js';

// The summary prices the API-shaped Work Items the form maps into, not the browser shape itself.
type QuoteWorkItemFormInput = QuoteComputedSummary['workItems'][number];
const getSummaryWorkItemKey = createStableRowKeys<QuoteWorkItemFormInput>('quote-summary-work-item');
const getSummaryWorkItemPartKey =
  createStableRowKeys<QuoteWorkItemFormInput['parts'][number]>('quote-summary-work-item-part');

export function QuoteRightPanel({
  canOpenJobs,
  onOpenJob,
  quote,
  summary,
}: {
  canOpenJobs: boolean;
  onOpenJob: () => void;
  quote: QuoteDetail;
  summary: QuoteComputedSummary;
}) {
  return (
    <aside className="order-first grid h-fit gap-4 border-b pb-5 text-sm xl:sticky xl:top-4 xl:order-0 xl:border-b-0 xl:pb-0 xl:pl-5">
      <QuoteCustomerCard quote={quote} />
      <QuoteProductCard quote={quote} />
      {quote.kind === 'product' && quote.productUnit ? <QuoteAllocationCard quote={quote} /> : null}
      {quote.job ? <QuoteJobCard canOpenJobs={canOpenJobs} job={quote.job} onOpenJob={onOpenJob} /> : null}
      <QuoteTotalCard quote={quote} summary={summary} />
    </aside>
  );
}

function QuoteJobCard({
  canOpenJobs,
  job,
  onOpenJob,
}: {
  canOpenJobs: boolean;
  job: NonNullable<QuoteDetail['job']>;
  onOpenJob: () => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Job</CardDescription>
        <CardTitle className="font-mono">{job.jobCode}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className={cn('whitespace-pre-wrap', job.jobDescription ? '' : 'text-muted-foreground')}>
          {job.jobDescription ?? 'No description captured.'}
        </p>
        {canOpenJobs ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onOpenJob}>
              <IconFileDescription data-icon="inline-start" />
              Open sheet
            </Button>
            <Button render={<Link search={{ job: job.jobId }} to="/jobs" />} variant="outline">
              <IconSubtask data-icon="inline-start" />
              Planner
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QuoteAllocationCard({ quote }: { quote: Extract<QuoteDetail, { kind: 'product' }> }) {
  if (!quote.productUnit) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Allocation Quote</CardDescription>
        <CardTitle className="min-w-0">
          <Link
            className="block truncate underline-offset-4 hover:underline"
            params={{ id: quote.productUnit.id }}
            to="/units/$id"
          >
            {quote.productUnit.productSerialNumber}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <QuotePanelFact
          icon={<IconBuildingWarehouse />}
          label="Product Unit"
          value={quote.productUnit.vinNumber ? `VIN ${quote.productUnit.vinNumber}` : 'VIN not captured'}
          muted={!quote.productUnit.vinNumber}
        />
        <Separator />
        <div className="grid gap-2">
          <span className="text-muted-foreground text-xs">Other live Quotes for this Unit</span>
          {quote.competingAllocationQuotes.length === 0 ? (
            <span className="text-muted-foreground">No competing Quotes.</span>
          ) : (
            quote.competingAllocationQuotes.map((competitor) => (
              <Link
                className="grid rounded-md border p-2 underline-offset-4 hover:bg-muted hover:underline"
                key={competitor.id}
                params={{ id: competitor.id }}
                to="/quotes/$id/edit"
              >
                <span className="font-medium">{competitor.code}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {competitor.customerCompanyName} · {competitor.salesPersonName ?? 'Unassigned'} ·{' '}
                  {quoteStatusLabels[competitor.status]}
                </span>
              </Link>
            ))
          )}
        </div>
      </CardContent>
    </Card>
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
  if (quote.kind === 'custom') {
    return <QuoteCustomWorkCard quote={quote} />;
  }

  const assemblies = quote.product?.assemblies ?? [];
  const standardCount = assemblies.filter((assembly) => assembly.kind === 'standard').length;
  const optionalCount = assemblies.filter((assembly) => assembly.kind === 'optional').length;
  const productName = quote.product?.name ?? '—';
  const productModelCode = quote.product?.modelCode ?? '—';
  const productCurrencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const productBuildTimeDays = quote.product ? `${quote.product.buildTimeDays} days` : '—';
  const productSource = quoteProductSourceOf(quote);

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Product</CardDescription>
        <CardTitle className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="block truncate">{productName}</span>
            <Badge variant="outline">{productModelCode}</Badge>
          </div>
        </CardTitle>
        <CardAction>
          <OfferingThumbnail
            className="size-10"
            kind="product"
            label={productName}
            size="lg"
            thumbnailDataUrl={quote.product?.thumbnailDataUrl ?? null}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <QuoteMiniMetric
            icon={<IconPackage />}
            label="Base price"
            value={formatCurrency(quote.quotedBasePrice, productCurrencyCode)}
          />
          <QuoteMiniMetric icon={<IconClock />} label="Build" value={productBuildTimeDays} />
          <QuoteMiniMetric label="Standard Assemblies" value={String(standardCount)} />
          <QuoteMiniMetric label="Optional Assemblies" value={String(optionalCount)} />
          {productSource ? (
            <QuoteMiniMetric
              className="col-span-2"
              label="Product Source"
              value={<QuoteProductSourceBadge className="mt-1" productSource={productSource} />}
            />
          ) : null}
        </div>
        <Separator />
        <p
          className={cn('max-h-20 overflow-hidden text-sm', quote.product?.description ? '' : 'text-muted-foreground')}
        >
          {quote.product?.description ?? 'No product description captured.'}
        </p>
      </CardContent>
    </Card>
  );
}

function QuoteCustomWorkCard({ quote }: { quote: Extract<QuoteDetail, { kind: 'custom' }> }) {
  const workTitle = getQuoteOfferingName(quote);

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Custom work</CardDescription>
        <CardTitle className="min-w-0 truncate">{workTitle}</CardTitle>
        <CardAction>
          <OfferingThumbnail className="size-10" kind="custom" label={workTitle} size="lg" thumbnailDataUrl={null} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <QuoteMiniMetric icon={<IconPackage />} label="Work items" value={String(quote.workItems.length)} />
        </div>
      </CardContent>
    </Card>
  );
}

function QuoteTotalCard({ quote, summary }: { quote: QuoteDetail; summary: QuoteComputedSummary }) {
  const workItemRows = quote.kind === 'custom' ? quoteWorkItemSummaryRows({ workItems: summary.workItems }) : [];
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Quote total</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatCurrency(summary.total, summary.currencyCode)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {quote.kind === 'product' ? (
          <QuoteSummaryRow label="Product price" value={formatCurrency(summary.basePrice, summary.currencyCode)} />
        ) : null}
        {summary.selectedAssemblies.length > 0 ? (
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
        {summary.workItems.length > 0 ? (
          <div className="grid gap-1">
            <QuoteSummaryRow label="Work items" value={formatCurrency(summary.workItemTotal, summary.currencyCode)} />
            <div className="grid gap-1 border-l pl-3">
              {workItemRows.map((row) => (
                <div className="grid gap-1" key={getSummaryWorkItemKey(row.workItem)}>
                  <QuoteSummaryRow
                    className="text-xs"
                    label={row.name}
                    value={formatCurrency(row.total, summary.currencyCode)}
                    valueClassName="text-muted-foreground"
                  />
                  {row.charges.length > 0 ? (
                    <div className="grid gap-1 border-l pl-3">
                      {row.charges.map((charge) => (
                        <QuoteSummaryChargeRow
                          charge={charge}
                          currencyCode={summary.currencyCode}
                          key={charge.part ? getSummaryWorkItemPartKey(charge.part) : 'labour'}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <QuoteSummaryRow
          label="Less discount"
          value={`${formatCurrency(summary.discountAmount, summary.currencyCode)} (${formatPercent(summary.discountPercent)})`}
        />
        {!summary.deliveryIncluded ? (
          <QuoteSummaryRow label="Delivery" value={formatCurrency(summary.deliveryPrice, summary.currencyCode)} />
        ) : null}
        <div className="grid gap-1 border-t pt-2">
          <QuoteSummaryRow label="Subtotal" value={formatCurrency(summary.subtotal, summary.currencyCode)} />
          <QuoteSummaryRow
            label={`VAT (${formatPercent(summary.vatPercent)})`}
            value={formatCurrency(summary.vatAmount, summary.currencyCode)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 font-medium">
          <span>Total</span>
          <span>{formatCurrency(summary.total, summary.currencyCode)}</span>
        </div>
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

function QuoteMiniMetric({
  className,
  icon,
  label,
  value,
}: {
  className?: string;
  icon?: React.ReactElement;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className={cn('min-h-14', className)} size="sm">
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

function QuoteSummaryChargeRow({ charge, currencyCode }: { charge: QuoteWorkItemCharge; currencyCode: string }) {
  const quantity =
    charge.kind === 'labour' ? `${formatNumber(charge.quantity, { decimals: 2 })} h` : formatNumber(charge.quantity);

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="min-w-0">
        <span className="block truncate text-muted-foreground">{charge.label}</span>
        <span className="block whitespace-nowrap text-[11px] text-muted-foreground/80">
          {`${quantity} × ${formatCurrency(charge.unitPrice, currencyCode)}`}
        </span>
      </span>
      <span className="shrink-0 text-muted-foreground">{formatCurrency(charge.amount, currencyCode)}</span>
    </div>
  );
}
