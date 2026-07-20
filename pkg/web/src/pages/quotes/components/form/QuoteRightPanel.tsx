import { formatCurrency, formatPercent, getQuoteOfferingName } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { IconClock, IconMail, IconMapPin, IconPackage, IconPhone, IconReceipt2 } from '@tabler/icons-react';
import type React from 'react';

import { CopyValueButton } from '@/components/button/CopyValueButton.js';
import { createStableRowKeys } from '@/components/form/create-stable-row-keys.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { cn } from '@/lib/utils.js';
import { StartJobLink } from '../StartJobLink.js';
import type { QuoteComputedSummary, QuoteFormValues } from '../types.js';

type QuoteLineItemFormInput = QuoteFormValues['lineItems'][number];
const getSummaryLineItemKey = createStableRowKeys<QuoteLineItemFormInput>('quote-summary-line-item');

export function QuoteRightPanel({ quote, summary }: { quote: QuoteDetail; summary: QuoteComputedSummary }) {
  return (
    <aside className="order-first grid h-fit gap-4 border-b pb-5 text-sm xl:sticky xl:top-4 xl:order-0 xl:border-b-0 xl:pb-0 xl:pl-5">
      <QuoteCustomerCard quote={quote} />
      <QuoteProductCard quote={quote} />
      <QuoteTotalCard quote={quote} summary={summary} />
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
          <EntityThumbnail
            className="size-10"
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

function QuoteCustomWorkCard({ quote }: { quote: QuoteDetail }) {
  const workTitle = getQuoteOfferingName(quote);

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Custom work</CardDescription>
        <CardTitle className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="block truncate">{workTitle}</span>
            <Badge variant="outline">Custom</Badge>
          </div>
        </CardTitle>
        <CardAction>
          <EntityThumbnail className="size-10" label={workTitle} size="lg" thumbnailDataUrl={null} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <QuoteMiniMetric
            icon={<IconReceipt2 />}
            label="Base price"
            value={formatCurrency(quote.quotedBasePrice, quote.quotedCurrencyCode)}
          />
          <QuoteMiniMetric icon={<IconPackage />} label="Line items" value={String(quote.lineItems.length)} />
        </div>
      </CardContent>
    </Card>
  );
}

function QuoteTotalCard({ quote, summary }: { quote: QuoteDetail; summary: QuoteComputedSummary }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Quote total</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatCurrency(summary.total, summary.currencyCode)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <QuoteSummaryRow
          label={quote.kind === 'custom' ? 'Base price' : 'Product price'}
          value={formatCurrency(summary.basePrice, summary.currencyCode)}
        />
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
        {summary.lineItems.length > 0 ? (
          <div className="grid gap-1">
            <QuoteSummaryRow label="Line items" value={formatCurrency(summary.lineItemTotal, summary.currencyCode)} />
            <div className="grid gap-1 border-l pl-3">
              {summary.lineItems.map((item) => (
                <QuoteSummaryRow
                  className="text-xs"
                  key={getSummaryLineItemKey(item)}
                  label={formatLineItemLabel(item)}
                  value={formatCurrency(item.quantity * item.unitPrice, summary.currencyCode)}
                  valueClassName="text-muted-foreground"
                />
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

function formatLineItemLabel(item: QuoteLineItemFormInput): string {
  return item.quantity === 1 ? item.name : `${item.quantity} x ${item.name}`;
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
