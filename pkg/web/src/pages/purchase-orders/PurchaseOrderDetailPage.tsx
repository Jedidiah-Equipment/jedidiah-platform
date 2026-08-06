import { createStableRowKeys, formatCurrency, formatDate, hasPermission } from '@pkg/domain';
import type {
  Part,
  PurchaseOrderAmendmentKind,
  PurchaseOrderLineInput,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderView,
  UUID,
} from '@pkg/schema';
import { IconBan, IconDownload, IconEye, IconFlagCheck, IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { usePartOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatPurchaseUnitLabel } from '@/utils/part-quantity-format.js';
import { allJobsInput } from '../jobs/components/all-jobs-input.js';
import { PurchaseOrderAmendDialog } from './components/PurchaseOrderAmendDialog.js';
import { PurchaseOrderAmendmentsCard } from './components/PurchaseOrderAmendmentsCard.js';
import { PurchaseOrderDocumentsCard } from './components/PurchaseOrderDocumentsCard.js';
import { PurchaseOrderReceivingCard } from './components/PurchaseOrderReceivingCard.js';
import { PurchaseOrderReturnsCard } from './components/PurchaseOrderReturnsCard.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
import {
  ensurePurchaseOrderPreview,
  purchaseOrderDocumentDownloadUrl,
  purchaseOrderPreviewUrl,
} from './components/purchase-order-pdf.js';
import {
  type PurchaseOrderDraftFormValues,
  PurchaseOrderDraftFormValues as PurchaseOrderDraftFormValuesSchema,
  toPurchaseOrderDraftFormValues,
  toPurchaseOrderDraftInput,
} from './components/types.js';

const getLineKey = createStableRowKeys<PurchaseOrderLineInput>('purchase-order-line');

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
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadCosts = hasPermission(accessQuery.data, 'inventory_cost:read');
  // Line prices are part of the draft, so editing needs the cost gate open as well as create rights.
  const canEdit =
    purchaseOrder.derivedStatus === 'draft' && canReadCosts && hasPermission(accessQuery.data, 'purchase_order:create');
  const canSend = purchaseOrder.derivedStatus === 'draft' && hasPermission(accessQuery.data, 'purchase_order:send');
  // Receipts freeze cancellation server-side, so only an order nothing has arrived against offers it.
  const canCancel =
    (purchaseOrder.derivedStatus === 'draft' || purchaseOrder.derivedStatus === 'sent') &&
    hasPermission(accessQuery.data, 'purchase_order:close');
  const canCloseShort =
    purchaseOrder.derivedStatus === 'partially-received' && hasPermission(accessQuery.data, 'purchase_order:close');
  // A fully received order still receives: over-receipt warns and posts, and stock that turns up
  // late has to reach the ledger. Only closing short (or cancelling) stops the dock.
  const canReceive =
    purchaseOrder.status === 'sent' &&
    purchaseOrder.closedShortAt === null &&
    hasPermission(accessQuery.data, 'purchase_order:receive');
  // Amendments are for an order the Supplier is already holding; a closed-short one has had its
  // remainder released, and a draft is edited whole rather than amended (spec §4).
  const canAmend =
    purchaseOrder.status === 'sent' &&
    purchaseOrder.closedShortAt === null &&
    hasPermission(accessQuery.data, 'purchase_order:amend');
  // Returns stay available after close-short: what already arrived can still turn out to be wrong.
  // The server accepts either the physical move right or the PO amendment right for this PO-bound flow.
  const canReturn =
    purchaseOrder.status === 'sent' &&
    (hasPermission(accessQuery.data, 'inventory:move') || hasPermission(accessQuery.data, 'purchase_order:amend'));
  // The same single gate the upload route applies — filing the credit is procurement's job, and it
  // is the amend right that says who does it.
  const canFileCreditNote = purchaseOrder.status === 'sent' && hasPermission(accessQuery.data, 'purchase_order:amend');
  const { invalidatePurchaseOrders, invalidateJobs } = useQueryInvalidation();
  const [isLifecycleActionPending, setIsLifecycleActionPending] = useState(false);

  const saveMutation = useMutation(
    trpc.purchaseOrders.saveDraft.mutationOptions({
      onSuccess: () => Promise.all([invalidatePurchaseOrders(), invalidateJobs()]),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toPurchaseOrderDraftFormValues(purchaseOrder),
    failureMessage: 'Unable to save this Purchase Order.',
    save: (input: PurchaseOrderSaveDraftInput) => saveMutation.mutateAsync(input),
    toInput: (values) => toPurchaseOrderDraftInput(purchaseOrder.id, values),
    validator: PurchaseOrderDraftFormValuesSchema,
  });

  /** Every lifecycle action acts on the saved order, so the one draft form flushes first. */
  const runAfterSave = useCallback(
    async (action: () => Promise<void>, failureMessage: string) => {
      setIsLifecycleActionPending(true);
      try {
        if (!(await autosave.flush())) {
          toast.error(failureMessage);
          return false;
        }
        await action();
        return true;
      } finally {
        setIsLifecycleActionPending(false);
      }
    },
    [autosave.flush],
  );

  return (
    <PageLayout
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PurchaseOrderActions
            canCancel={canCancel}
            canCloseShort={canCloseShort}
            canEdit={canEdit}
            canReadCosts={canReadCosts}
            canSend={canSend}
            isPending={isLifecycleActionPending}
            purchaseOrder={purchaseOrder}
            runAfterSave={runAfterSave}
          />
          <PurchaseOrderStatusBadge size="lg" status={purchaseOrder.derivedStatus} />
        </div>
      }
      description={`${purchaseOrder.supplier.companyName} · ${statusDescription(purchaseOrder)}`}
      size="lg"
      title={purchaseOrder.code}
    >
      <ErrorMessage error={queryError} fallbackMessage="Unable to refresh this Purchase Order." />
      <div className="grid gap-4">
        {canEdit ? (
          <form {...formProps} className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Order details</CardTitle>
                <CardAction>
                  <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <SupplierField commit={autosave.commit} form={form} />
                <form.AppField name="expectedDeliveryDate">
                  {(field) => (
                    <field.DatePickerField
                      label="Expected delivery date"
                      onValueCommit={autosave.commit}
                      placeholder="Optional"
                    />
                  )}
                </form.AppField>
              </CardContent>
            </Card>
            <PurchaseOrderLinesCard commit={autosave.commit} form={form} supplierId={purchaseOrder.supplierId} />
            <PurchaseOrderJobsCard commit={autosave.commit} form={form} />
          </form>
        ) : (
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
            <PurchaseOrderAmendmentsCard purchaseOrderId={purchaseOrder.id} />
            <PurchaseOrderDocumentsCard canReadCosts={canReadCosts} purchaseOrderId={purchaseOrder.id} />
            <ReadOnlyJobsCard purchaseOrder={purchaseOrder} />
          </>
        )}
      </div>
    </PageLayout>
  );
};

type DraftForm = ReturnType<typeof useAutosaveForm<PurchaseOrderDraftFormValues, unknown>>['form'];

const SupplierField: React.FC<{ commit: () => void; form: DraftForm }> = ({ commit, form }) => {
  const suppliers = useSupplierOptions({ limit: 0 });

  return (
    <form.AppField name="supplierId">
      {(field) => (
        <field.ComboboxField
          disabled={suppliers.isPending}
          emptyMessage="No suppliers found."
          label="Supplier"
          onValueCommit={commit}
          options={suppliers.selectOptions}
          placeholder={suppliers.isPending ? 'Loading suppliers...' : 'Search suppliers'}
        />
      )}
    </form.AppField>
  );
};

const PurchaseOrderActions: React.FC<{
  canCancel: boolean;
  canCloseShort: boolean;
  canEdit: boolean;
  canReadCosts: boolean;
  canSend: boolean;
  isPending: boolean;
  purchaseOrder: PurchaseOrderView;
  runAfterSave: (action: () => Promise<void>, failureMessage: string) => Promise<boolean>;
}> = ({ canCancel, canCloseShort, canEdit, canReadCosts, canSend, isPending, purchaseOrder, runAfterSave }) => {
  const trpc = useTRPC();
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const markSentMutation = useMutation(
    trpc.purchaseOrders.markSent.mutationOptions({
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order marked sent');
      },
    }),
  );
  const cancelMutation = useMutation(
    trpc.purchaseOrders.cancel.mutationOptions({
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order cancelled');
      },
    }),
  );
  const closeShortMutation = useMutation(
    trpc.purchaseOrders.closeShort.mutationOptions({
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order closed short');
      },
    }),
  );
  const disabled = isPending || markSentMutation.isPending || cancelMutation.isPending || closeShortMutation.isPending;

  const handlePreview = () => {
    // Reserve the tab during the click gesture so browsers do not treat the post-save navigation as a popup.
    const previewWindow = window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;

    void runAfterSave(async () => {
      const url = purchaseOrderPreviewUrl(purchaseOrder.id);
      const toastId = `purchase-order-preview-${purchaseOrder.id}`;
      toast.loading('Preparing PDF preview...', { id: toastId });
      try {
        await ensurePurchaseOrderPreview(url);
      } catch (error) {
        toast.error('Unable to open the PDF preview.', { id: toastId });
        throw error;
      }
      toast.success('PDF preview opened', { id: toastId });
      // Navigate to the server response so the PDF viewer retains the PO filename from Content-Disposition.
      if (previewWindow) previewWindow.location.href = url;
      else window.location.assign(url);
    }, 'Save all Purchase Order changes before previewing the PDF.')
      .then((didRun) => {
        if (!didRun) previewWindow?.close();
      })
      .catch(() => {
        previewWindow?.close();
      });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit ? (
        <Button disabled={disabled} onClick={handlePreview} variant="outline">
          <IconEye data-icon="inline-start" /> Preview PDF
        </Button>
      ) : null}
      {canReadCosts && purchaseOrder.documentId ? (
        <Button
          render={<a href={purchaseOrderDocumentDownloadUrl(purchaseOrder.id, purchaseOrder.documentId)} />}
          variant="outline"
        >
          <IconDownload data-icon="inline-start" /> Download PDF
        </Button>
      ) : null}
      {canSend ? (
        <Button
          disabled={disabled}
          onClick={() => {
            void runAfterSave(async () => {
              await markSentMutation.mutateAsync({ id: purchaseOrder.id });
            }, 'Save all Purchase Order changes before marking it sent.').catch(() => undefined);
          }}
        >
          <IconSend data-icon="inline-start" /> Mark sent
        </Button>
      ) : null}
      {canCloseShort ? (
        <Button
          disabled={disabled}
          onClick={() => {
            if (!window.confirm(`Close ${purchaseOrder.code} short? Its outstanding quantities will be released.`)) {
              return;
            }
            void closeShortMutation.mutateAsync({ id: purchaseOrder.id }).catch(() => undefined);
          }}
          variant="outline"
        >
          <IconFlagCheck data-icon="inline-start" /> Close short
        </Button>
      ) : null}
      {canCancel ? (
        <Button
          disabled={disabled}
          onClick={() => {
            if (!window.confirm(`Cancel ${purchaseOrder.code}?`)) return;
            void runAfterSave(async () => {
              await cancelMutation.mutateAsync({ id: purchaseOrder.id });
            }, 'Save all Purchase Order changes before cancelling it.').catch(() => undefined);
          }}
          variant="destructive"
        >
          <IconBan data-icon="inline-start" /> Cancel
        </Button>
      ) : null}
    </div>
  );
};

const PurchaseOrderLinesCard: React.FC<{ commit: () => void; form: DraftForm; supplierId: UUID }> = ({
  commit,
  form,
  supplierId,
}) => {
  const parts = usePartOptions({ limit: 0, sortBy: 'name', sortDirection: 'asc' });

  return (
    <form.AppField mode="array" name="lines">
      {(linesField) => {
        const lines = linesField.state.value;
        // A PO is an order on one Supplier (spec §4), so only that Supplier's Parts can be lined up.
        const eligibleParts = parts.items.filter((part) => part.supplierId === supplierId);
        const nextPart = eligibleParts.find((part) => !lines.some((line) => line.partId === part.id));

        return (
          <Card>
            <CardHeader>
              <CardTitle>Parts</CardTitle>
              <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
              <CardAction>
                <Button
                  disabled={!nextPart}
                  onClick={() => {
                    if (!nextPart) return;
                    linesField.pushValue({ partId: nextPart.id, quantity: 1, unitPrice: 0 });
                    commit();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconPlus data-icon="inline-start" /> Add line
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <PurchaseOrderLinesDataTable
                commit={commit}
                eligibleParts={eligibleParts}
                form={form}
                lines={lines}
                removeLine={(index) => linesField.removeValue(index)}
              />
            </CardContent>
            <div className="border-t px-4 pt-4 text-right font-medium">
              Total {formatCurrency(lineTotal(lines), 'ZAR')}
            </div>
          </Card>
        );
      }}
    </form.AppField>
  );
};

type PurchaseOrderLineTableRow = {
  index: number;
  key: string;
  line: PurchaseOrderLineInput;
};

const PurchaseOrderLinesDataTable: React.FC<{
  commit: () => void;
  eligibleParts: Part[];
  form: DraftForm;
  lines: PurchaseOrderLineInput[];
  removeLine: (index: number) => void;
}> = ({ commit, eligibleParts, form, lines, removeLine }) => {
  const data = useMemo(() => lines.map((line, index) => ({ index, key: getLineKey(line), line })), [lines]);
  const columns = useMemo<ColumnDef<PurchaseOrderLineTableRow>[]>(
    () => [
      {
        cell: ({ row }) => {
          const { index, line } = row.original;
          // A Part appears once per order, so every other row's pick drops out of this
          // one's choices; its own stays so the selected value keeps a label.
          const options = eligibleParts
            .filter((option) => option.id === line.partId || !lines.some((other) => other.partId === option.id))
            .map((option) => ({ label: `${option.code} · ${option.name}`, value: option.id }));

          return (
            <form.AppField name={`lines[${index}].partId`}>
              {(field) => (
                <field.ComboboxField
                  emptyMessage="No Parts found."
                  label={<span className="sr-only">Part</span>}
                  onValueCommit={commit}
                  options={options}
                  placeholder="Search Parts"
                />
              )}
            </form.AppField>
          );
        },
        header: 'Part',
        id: 'part',
      },
      {
        cell: ({ row }) => {
          const part = eligibleParts.find((candidate) => candidate.id === row.original.line.partId);
          return part ? formatPurchaseUnitLabel(part) : '—';
        },
        header: 'Unit',
        id: 'unit',
      },
      {
        cell: ({ row }) => {
          const part = eligibleParts.find((candidate) => candidate.id === row.original.line.partId);
          return (
            <form.AppField name={`lines[${row.original.index}].quantity`}>
              {(field) => (
                <field.NumberField
                  decimals={part && isMeasuredUnit(part.unitOfMeasure) ? 3 : 0}
                  label={<span className="sr-only">Quantity</span>}
                />
              )}
            </form.AppField>
          );
        },
        header: 'Quantity',
        id: 'quantity',
        meta: { headerClassName: 'w-32' },
      },
      {
        cell: ({ row }) => (
          <form.AppField name={`lines[${row.original.index}].unitPrice`}>
            {(field) => <field.CurrencyField label={<span className="sr-only">Unit price</span>} />}
          </form.AppField>
        ),
        header: 'Unit price',
        id: 'unitPrice',
        meta: { headerClassName: 'w-40' },
      },
      {
        cell: ({ row }) => {
          const part = eligibleParts.find((candidate) => candidate.id === row.original.line.partId);
          return (
            <Button
              aria-label={`Remove ${part?.name ?? 'line'}`}
              onClick={() => {
                removeLine(row.original.index);
                commit();
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <IconTrash />
            </Button>
          );
        },
        enableSorting: false,
        header: () => <span className="sr-only">Remove</span>,
        id: 'remove',
      },
    ],
    [commit, eligibleParts, form, lines, removeLine],
  );
  const table = useReactTable({
    columns,
    data,
    enableColumnFilters: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.key,
  });

  return (
    <DataTable
      emptyMessage="No Parts added."
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={data.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
    />
  );
};

const PurchaseOrderJobsCard: React.FC<{ commit: () => void; form: DraftForm }> = ({ commit, form }) => {
  const trpc = useTRPC();
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));
  const jobOptions = (jobsQuery.data?.items ?? []).map((job) => ({ label: job.code, value: job.id }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Jobs</CardTitle>
        <CardDescription>Leave empty for restock, or link every Job this order supports.</CardDescription>
      </CardHeader>
      <CardContent onBlur={commit}>
        <form.AppField name="jobIds">
          {(field) => (
            <field.MultiComboboxField
              disabled={jobsQuery.isPending}
              emptyMessage="No Jobs found."
              label={<span className="sr-only">Linked Jobs</span>}
              options={jobOptions}
              placeholder="Search Jobs to link"
            />
          )}
        </form.AppField>
      </CardContent>
    </Card>
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
          Total {formatCurrency(lineTotal(purchaseOrder.lines), 'ZAR')}
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
  const columns = useMemo<ColumnDef<PurchaseOrderView['lines'][number]>[]>(
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
            } satisfies ColumnDef<PurchaseOrderView['lines'][number]>,
            {
              accessorFn: (line) => (line.unitPrice === null ? null : line.quantity * line.unitPrice),
              cell: ({ getValue }) => {
                const value = getValue<number | null>();
                return value === null ? '—' : formatCurrency(value, 'ZAR');
              },
              header: 'Amount',
              id: 'amount',
              meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
            } satisfies ColumnDef<PurchaseOrderView['lines'][number]>,
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
            } satisfies ColumnDef<PurchaseOrderView['lines'][number]>,
          ]
        : []),
    ],
    [canReadCosts, onAmend],
  );
  const table = useReactTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
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

function lineTotal(lines: ReadonlyArray<{ quantity: number; unitPrice: number | null }>): number {
  return lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? 0), 0);
}

function statusDescription(purchaseOrder: PurchaseOrderView): string {
  if (purchaseOrder.status === 'cancelled') return 'Cancelled';
  if (purchaseOrder.closedShortAt) return `Closed short ${formatDate(purchaseOrder.closedShortAt)}`;
  if (purchaseOrder.sentAt) return `Sent ${formatDate(purchaseOrder.sentAt)}`;
  return 'Draft';
}

function isMeasuredUnit(unitOfMeasure: PurchaseOrderView['lines'][number]['unitOfMeasure']): boolean {
  return unitOfMeasure === 'kg' || unitOfMeasure === 'litre';
}
