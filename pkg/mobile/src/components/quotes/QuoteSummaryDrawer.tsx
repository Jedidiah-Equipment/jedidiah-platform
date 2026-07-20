import { createStableRowKeys, formatCurrency, formatPercent, type QuoteComputedSummary } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { IconX } from '@tabler/icons-react-native';
import type React from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

const getSummaryLineItemKey = createStableRowKeys<{ name: string; quantity: number; unitPrice: number }>(
  'quote-summary-line-item',
);

export function QuoteSummaryDrawer({
  onClose,
  open,
  quote,
  summary,
}: {
  onClose: () => void;
  open: boolean;
  quote: QuoteDetail;
  summary: QuoteComputedSummary;
}) {
  return (
    <ThemedModal backdropLabel="Close quote summary" onClose={onClose} open={open} placement="right">
      <View className="h-full w-[88%] max-w-[340px] border-l border-border bg-background shadow-2xl">
        <View className="h-16 flex-row items-center justify-between border-b border-border px-4">
          <Text className="text-[11px] uppercase tracking-[1.5px] text-muted-foreground" mono weight="semibold">
            Quote summary
          </Text>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface active:bg-muted"
            onPress={onClose}
          >
            <Icon className="text-muted-foreground" icon={IconX} size={17} />
          </Pressable>
        </View>
        <ScrollView contentContainerClassName="gap-3.5 p-4">
          <CustomerCard quote={quote} />
          {quote.kind === 'product' ? <ProductCard quote={quote} /> : null}
          <TotalCard quote={quote} summary={summary} />
        </ScrollView>
      </View>
    </ThemedModal>
  );
}

function CustomerCard({ quote }: { quote: QuoteDetail }) {
  return (
    <SummaryCard>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <CardLabel>Customer</CardLabel>
          <Text className="mt-1 text-base text-foreground" numberOfLines={2} weight="bold">
            {quote.customerCompanyName}
          </Text>
        </View>
        <Avatar
          className="h-10 w-10 rounded-xl"
          name={quote.customerCompanyName}
          uri={quote.customerThumbnailDataUrl}
        />
      </View>
      <View className="mt-3 gap-3">
        <Fact label="Email" value={quote.customerEmail} />
        <Fact label="Contact person" value={quote.customerContactPerson} />
        <Fact label="Phone" value={quote.customerPhone} />
        <Fact label="VAT" value={quote.customerVatNumber} />
        <Fact label="Address" value={quote.customerAddress} />
      </View>
    </SummaryCard>
  );
}

function ProductCard({ quote }: { quote: Extract<QuoteDetail, { kind: 'product' }> }) {
  const assemblies = quote.product?.assemblies ?? [];
  const productName = quote.product?.name ?? 'Unavailable product';

  return (
    <SummaryCard>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <CardLabel>Product</CardLabel>
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <Text className="min-w-0 text-[15px] text-foreground" numberOfLines={2} weight="bold">
              {productName}
            </Text>
            <View className="rounded-md border border-border bg-muted px-2 py-1">
              <Text className="text-[9px] text-muted-foreground" mono>
                {quote.product?.modelCode ?? '—'}
              </Text>
            </View>
          </View>
        </View>
        <Avatar className="h-11 w-11 rounded-xl" name={productName} uri={quote.product?.thumbnailDataUrl} />
      </View>
      <View className="mt-3 flex-row flex-wrap gap-2">
        <MiniMetric label="Base price" value={formatCurrency(quote.quotedBasePrice, summaryCurrency(quote))} />
        <MiniMetric label="Build" value={quote.product ? `${quote.product.buildTimeDays} days` : '—'} />
        <MiniMetric
          label="Standard"
          value={String(assemblies.filter((assembly) => assembly.kind === 'standard').length)}
        />
        <MiniMetric
          label="Optional"
          value={String(assemblies.filter((assembly) => assembly.kind === 'optional').length)}
        />
      </View>
      <View className="mt-3 border-t border-border pt-3">
        <Text className="text-xs leading-5 text-muted-foreground">
          {quote.product?.description ?? 'No product description captured.'}
        </Text>
      </View>
    </SummaryCard>
  );
}

function TotalCard({ quote, summary }: { quote: QuoteDetail; summary: QuoteComputedSummary }) {
  return (
    <SummaryCard>
      <CardLabel>Quote total</CardLabel>
      <Text className="mb-4 mt-1 text-2xl text-primary" mono weight="bold">
        {formatCurrency(summary.total, summary.currencyCode)}
      </Text>
      <View className="gap-2.5">
        <SummaryRow
          label={quote.kind === 'custom' ? 'Base price' : 'Product price'}
          value={formatCurrency(summary.basePrice, summary.currencyCode)}
        />
        {summary.selectedAssemblies.length > 0 ? (
          <View className="gap-2">
            <SummaryRow
              label="Optional assemblies"
              value={formatCurrency(summary.selectedAssemblyTotal, summary.currencyCode)}
            />
            <View className="ml-1 gap-1.5 border-l-2 border-border pl-3">
              {summary.selectedAssemblies.map((assembly) => (
                <SummaryRow
                  key={`${assembly.id}:${assembly.productAssemblyId ?? 'stale'}`}
                  label={assembly.quotedName}
                  small
                  value={formatCurrency(assembly.quotedPrice, summary.currencyCode)}
                />
              ))}
            </View>
          </View>
        ) : null}
        {summary.lineItems.length > 0 ? (
          <View className="gap-2">
            <SummaryRow label="Line items" value={formatCurrency(summary.lineItemTotal, summary.currencyCode)} />
            <View className="ml-1 gap-1.5 border-l-2 border-border pl-3">
              {summary.lineItems.map((item) => (
                <SummaryRow
                  key={getSummaryLineItemKey(item)}
                  label={item.quantity === 1 ? item.name : `${item.quantity} × ${item.name}`}
                  small
                  value={formatCurrency(item.quantity * item.unitPrice, summary.currencyCode)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <SummaryRow
          label={`Less discount (${formatPercent(summary.discountPercent)})`}
          value={`− ${formatCurrency(summary.discountAmount, summary.currencyCode)}`}
        />
        {!summary.deliveryIncluded ? (
          <SummaryRow label="Delivery" value={formatCurrency(summary.deliveryPrice, summary.currencyCode)} />
        ) : null}
        <View className="mt-1 gap-2 border-t border-border pt-3">
          <SummaryRow label="Subtotal" value={formatCurrency(summary.subtotal, summary.currencyCode)} />
          <SummaryRow
            label={`VAT (${formatPercent(summary.vatPercent)})`}
            value={formatCurrency(summary.vatAmount, summary.currencyCode)}
          />
        </View>
        <View className="flex-row items-center justify-between gap-3 pt-1">
          <Text className="text-sm text-foreground" weight="bold">
            Total
          </Text>
          <Text className="text-sm text-foreground" mono weight="bold">
            {formatCurrency(summary.total, summary.currencyCode)}
          </Text>
        </View>
        {quote.job ? (
          <View className="mt-2 flex-row items-center gap-2 border-t border-border pt-3">
            <CardLabel>Linked job</CardLabel>
            <View className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
              <Text className="text-[10px] text-primary" mono weight="semibold">
                {quote.job.jobCode}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </SummaryCard>
  );
}

function SummaryCard({ children }: { children: React.ReactNode }) {
  return <View className="rounded-2xl border border-border bg-surface p-4">{children}</View>;
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-[9px] uppercase tracking-widest text-muted-foreground" mono>
      {children}
    </Text>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text className="text-[9px] uppercase tracking-wide text-muted-foreground" mono>
        {label}
      </Text>
      <Text className={`mt-0.5 text-xs ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
        {value ?? 'Not captured'}
      </Text>
    </View>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-xl border border-border bg-background p-2.5">
      <Text className="text-[9px] uppercase tracking-wide text-muted-foreground" mono>
        {label}
      </Text>
      <Text className="mt-1 text-xs text-foreground" numberOfLines={1} weight="semibold">
        {value}
      </Text>
    </View>
  );
}

function SummaryRow({ label, small = false, value }: { label: string; small?: boolean; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={`${small ? 'text-[11px]' : 'text-xs'} min-w-0 flex-1 text-muted-foreground`} numberOfLines={1}>
        {label}
      </Text>
      <Text className={`${small ? 'text-[11px]' : 'text-xs'} text-foreground`} mono>
        {value}
      </Text>
    </View>
  );
}

function summaryCurrency(quote: Extract<QuoteDetail, { kind: 'product' }>): string {
  return quote.product?.currencyCode ?? quote.quotedCurrencyCode;
}
