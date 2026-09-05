import { formatCurrency, formatDate, hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import type { PurchaseOrderAmendmentKind, PurchaseOrderView } from '@pkg/schema/equipment';
import { purchaseOrderHasUnpricedLines } from '@pkg/schema/equipment';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { AuditTable, usePurchaseOrderAuditTableStore } from '@/equipment/components/audit/AuditTable.js';
import { formatPurchaseUnitLabel } from '@/equipment/utils/part-quantity-format.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderAmendDialog } from './components/PurchaseOrderAmendDialog.js';
import { PurchaseOrderAmendmentsCard } from './components/PurchaseOrderAmendmentsCard.js';
import { PurchaseOrderDocumentsCard } from './components/PurchaseOrderDocumentsCard.js';
import { PurchaseOrderInvoiceCrossCheckCard } from './components/PurchaseOrderInvoiceCrossCheckCard.js';
import { PurchaseOrderReceivingCard } from './components/PurchaseOrderReceivingCard.js';
import { PurchaseOrderReturnsCard } from './components/PurchaseOrderReturnsCard.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
import { purchaseOrderLinesTotal } from './components/types.js';
import { PurchaseOrderEditing } from './PurchaseOrderEditing.js';

export const PurchaseOrderDetailPage: React.FC<{ purchaseOrderId: UUID }> = ({ purchaseOrderId }) => {
  const trpc = useTRPC();
  const query = useQuery(trpc.purchaseOrders.get.queryOptions({ id: purchaseOrderId }));

  if (query.data) {
    return <PurchaseOrderDetail purchaseOrder={query.data} queryError={query.error} />;
  }

  return (
    <PageLayout description="Purchase Order" size="lg" title="Loading Purchase Order...">
      {query.isPending ? <Skeleton className="h-64 w-full" /> : null}
      <ErrorMessage error={query.error} fallbackMessage="Unable to load this Purchase Order." />
    </PageLayout>
  );
};

const PurchaseOrderDetail: React.FC<{ purchaseOrder: PurchaseOrderView; queryError: unknown }> = ({
  purchaseOrder,
  queryError,
}) => {
  const accessQuery = useAccess();
  const canReadCosts = hasPermission(accessQuery.data, 'equipment_inventory_cost:read');
  const { actions } = purchaseOrder;
  const canReceive = actions.receive.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:receive');
  const canAmend = actions.amend.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:amend');
  // The server accepts either the physical move right or the PO amendment right for this PO-bound flow.
  const canReturn =
    actions.returnToSupplier.allowed &&
    (hasPermission(accessQuery.data, 'equipment_inventory:move') ||
      hasPermission(accessQuery.data, 'equipment_purchase_order:amend'));
  // The same single gate the upload route applies — filing the paperwork is procurement's job, and
  // it is the amend right that says who does it.
  const canFileCreditNote =
    actions.fileDocuments.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:amend');
  // A Supplier invoice is filed by the same procurement hands the credit note is. Reading the
  // cross-check it feeds is the narrower cost question, and confirming a price needs the right to
  // revalue on top of that.
  const canFileSupplierInvoice = canFileCreditNote;
  const canApplyInvoicePrices = canReadCosts && hasPermission(accessQuery.data, 'equipment_inventory_cost:revalue');
  return (
    <PurchaseOrderEditing key={purchaseOrder.id} purchaseOrder={purchaseOrder}>
      {({ actions: editingActions, draft }) => (
        <PageLayout
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {editingActions}
              <PurchaseOrderStatusBadge size="lg" status={purchaseOrder.derivedStatus} />
            </div>
          }
          description={`${purchaseOrder.supplier.companyName} · ${statusDescription(purchaseOrder)}`}
          size="lg"
          title={purchaseOrder.code}
        >
          <ErrorMessage error={queryError} fallbackMessage="Unable to refresh this Purchase Order." />
          <PurchaseOrderDetailTabs purchaseOrderId={purchaseOrder.id}>
            {draft ?? (
              <>
                <ReadOnlyDetailsCard canAmend={canAmend} purchaseOrder={purchaseOrder} />
                {canReceive ? (
                  <PurchaseOrderReceivingCard canReadCosts={canReadCosts} purchaseOrder={purchaseOrder} />
                ) : null}
                <ReadOnlyLinesCard canAmend={canAmend} canReadCosts={canReadCosts} purchaseOrder={purchaseOrder} />
                <PurchaseOrderReturnsCard
                  canFileCreditNote={canFileCreditNote}
                  canReadCosts={canReadCosts}
                  canReturn={canReturn}
                  purchaseOrder={purchaseOrder}
                />
                {/* Entirely about prices, so it never renders for a price-blind reader (spec §11). */}
                {canReadCosts ? (
                  <PurchaseOrderInvoiceCrossCheckCard
                    canApplyPrices={canApplyInvoicePrices}
                    canFileInvoice={canFileSupplierInvoice}
                    purchaseOrderId={purchaseOrder.id}
                  />
                ) : null}
                <PurchaseOrderAmendmentsCard purchaseOrderId={purchaseOrder.id} />
                <PurchaseOrderDocumentsCard canReadCosts={canReadCosts} purchaseOrderId={purchaseOrder.id} />
                <ReadOnlyJobsCard purchaseOrder={purchaseOrder} />
              </>
            )}
          </PurchaseOrderDetailTabs>
        </PageLayout>
      )}
    </PurchaseOrderEditing>
  );
};

export const PurchaseOrderDetailTabs: React.FC<{ children: React.ReactNode; purchaseOrderId: UUID }> = ({
  children,
  purchaseOrderId,
}) => {
  const auditAccess = useCan('equipment_audit:read');
  const purchaseOrderAuditFilters = useMemo(
    () => ({
      entityIds: [purchaseOrderId],
      entityTypes: ['purchase_order' as const],
    }),
    [purchaseOrderId],
  );

  return (
    <Tabs defaultValue="details" size="sm">
      <TabsList variant="default">
        <TabsTrigger value="details">Details</TabsTrigger>
        {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
      </TabsList>
      <TabsContent className="pt-4" value="details">
        <div className="grid gap-4">{children}</div>
      </TabsContent>
      {auditAccess.can ? (
        <TabsContent className="pt-4" value="audit">
          <AuditTable
            emptyMessage="No audit events found for this purchase order."
            fixedFilters={purchaseOrderAuditFilters}
            showEntityTypeFilter={false}
            store={usePurchaseOrderAuditTableStore}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
};

const ReadOnlyDetailsCard: React.FC<{ canAmend: boolean; purchaseOrder: PurchaseOrderView }> = ({
  canAmend,
  purchaseOrder,
}) => {
  const [isAmendingExpectedDate, setIsAmendingExpectedDate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order details</CardTitle>
        {canAmend ? (
          <CardAction>
            <Button onClick={() => setIsAmendingExpectedDate(true)} size="sm" type="button" variant="outline">
              Change expected date
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <ReadOnlyValue label="Supplier" value={purchaseOrder.supplier.companyName} />
        <ReadOnlyValue
          label="Expected delivery"
          value={purchaseOrder.expectedDeliveryDate ? formatDate(purchaseOrder.expectedDeliveryDate) : 'Not set'}
        />
        <ReadOnlyValue label="Created" value={formatDate(purchaseOrder.createdAt)} />
        <ReadOnlyValue label="Sent" value={purchaseOrder.sentAt ? formatDate(purchaseOrder.sentAt) : 'Not sent'} />
      </CardContent>
      {isAmendingExpectedDate ? (
        <PurchaseOrderAmendDialog
          kind="expected-date-change"
          line={null}
          onOpenChange={setIsAmendingExpectedDate}
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </Card>
  );
};

/**
 * A sent order's lines. They are read-only in the editing sense, but not frozen: an amendment is
 * how a sent order changes, and every one of them is logged and re-rendered as a PDF revision.
 */
const ReadOnlyLinesCard: React.FC<{
  canAmend: boolean;
  canReadCosts: boolean;
  purchaseOrder: PurchaseOrderView;
}> = ({ canAmend, canReadCosts, purchaseOrder }) => {
  const [amendment, setAmendment] = useState<{ kind: PurchaseOrderAmendmentKind; partId: string | null } | null>(null);
  const amendingLine = purchaseOrder.lines.find((line) => line.partId === amendment?.partId) ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Parts</CardTitle>
        <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
        {canAmend ? (
          <CardAction>
            <Button
              onClick={() => setAmendment({ kind: 'add-line', partId: null })}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconPlus data-icon="inline-start" /> Add line
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <PurchaseOrderReadOnlyLinesTable
          canReadCosts={canReadCosts}
          items={purchaseOrder.lines}
          onAmend={canAmend ? (kind, partId) => setAmendment({ kind, partId }) : null}
        />
      </CardContent>
      {canReadCosts ? (
        <div className="border-t px-4 pt-4 text-right font-medium">
          Total{' '}
          {purchaseOrderHasUnpricedLines(purchaseOrder)
            ? 'Not priced'
            : formatCurrency(purchaseOrderLinesTotal(purchaseOrder.lines), 'ZAR')}
        </div>
      ) : null}
      {amendment ? (
        <PurchaseOrderAmendDialog
          key={`${amendment.kind}:${amendment.partId ?? 'new'}`}
          kind={amendment.kind}
          line={amendingLine}
          onOpenChange={(open) => setAmendment(open ? amendment : null)}
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </Card>
  );
};

const PurchaseOrderReadOnlyLinesTable: React.FC<{
  canReadCosts: boolean;
  items: PurchaseOrderView['lines'];
  /** Absent when the reader may not amend, which is what drops the actions column entirely. */
  onAmend: ((kind: PurchaseOrderAmendmentKind, partId: string) => void) | null;
}> = ({ canReadCosts, items, onAmend }) => {
  const columns = useMemo<DataTableColumnDef<PurchaseOrderView['lines'][number]>[]>(
    () => [
      {
        accessorFn: (line) => `${line.partCode} ${line.partName}`,
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.partCode}</span> · {row.original.partName}
          </>
        ),
        header: 'Part',
        id: 'part',
      },
      {
        accessorFn: formatPurchaseUnitLabel,
        header: 'Unit',
        id: 'unit',
      },
      { accessorKey: 'quantity', header: 'Quantity' },
      {
        accessorKey: 'receivedQuantity',
        header: 'Received',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      ...(canReadCosts
        ? [
            {
              accessorKey: 'unitPrice',
              cell: ({ row }) =>
                row.original.unitPrice === null ? '—' : formatCurrency(row.original.unitPrice, 'ZAR'),
              header: 'Unit price',
              meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
            } satisfies DataTableColumnDef<PurchaseOrderView['lines'][number]>,
            {
              accessorFn: (line) => (line.unitPrice === null ? null : line.quantity * line.unitPrice),
              cell: ({ getValue }) => {
                const value = getValue<number | null>();
                return value === null ? '—' : formatCurrency(value, 'ZAR');
              },
              header: 'Amount',
              id: 'amount',
              meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
            } satisfies DataTableColumnDef<PurchaseOrderView['lines'][number]>,
          ]
        : []),
      ...(onAmend
        ? [
            {
              cell: ({ row }) => (
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => onAmend('quantity-change', row.original.partId)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Change quantity
                  </Button>
                  {/* Every movement keys off (order, Part), so only a line nothing has moved
                      against can change its Part — the same test the server's guard applies. A
                      fully returned line reads zero received but still carries its ledger rows. */}
                  <Button
                    disabled={row.original.hasStockMovements}
                    onClick={() => onAmend('substitute-part', row.original.partId)}
                    size="sm"
                    title={
                      row.original.hasStockMovements
                        ? 'Stock has already arrived against this line, so its Part cannot change'
                        : undefined
                    }
                    type="button"
                    variant="ghost"
                  >
                    Substitute
                  </Button>
                </div>
              ),
              enableSorting: false,
              header: () => <span className="sr-only">Amend</span>,
              id: 'amend',
            } satisfies DataTableColumnDef<PurchaseOrderView['lines'][number]>,
          ]
        : []),
    ],
    [canReadCosts, onAmend],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (line) => line.partId,
  });

  return (
    <DataTable
      emptyMessage="No Parts added."
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={items.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
};

const ReadOnlyJobsCard: React.FC<{ purchaseOrder: PurchaseOrderView }> = ({ purchaseOrder }) => (
  <Card>
    <CardHeader>
      <CardTitle>Linked Jobs</CardTitle>
      <CardDescription>Leave empty for restock, or link every Job this order supports.</CardDescription>
    </CardHeader>
    <CardContent>
      {purchaseOrder.jobs.length ? (
        <div className="flex flex-wrap gap-2">
          {purchaseOrder.jobs.map((job) => (
            <Badge key={job.id} variant="outline">
              {job.code}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Restock order — no Jobs linked.</p>
      )}
    </CardContent>
  </Card>
);

const ReadOnlyValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1">{value}</div>
  </div>
);

function statusDescription(purchaseOrder: PurchaseOrderView): string {
  if (purchaseOrder.status === 'cancelled') return 'Cancelled';
  if (purchaseOrder.closedShortAt) return `Closed short ${formatDate(purchaseOrder.closedShortAt)}`;
  if (purchaseOrder.sentAt) return `Sent ${formatDate(purchaseOrder.sentAt)}`;
  if (purchaseOrder.approvedAt) return `Approved ${formatDate(purchaseOrder.approvedAt)}`;
  return 'Draft';
}
