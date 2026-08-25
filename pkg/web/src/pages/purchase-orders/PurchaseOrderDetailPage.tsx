import {
  createStableRowKeys,
  defaultPurchaseOrderUnitPrice,
  formatCurrency,
  formatDate,
  hasPermission,
} from '@pkg/domain';
import type {
  Part,
  PurchaseOrderAmendmentKind,
  PurchaseOrderLineInput,
  PurchaseOrderSaveDraftInput,
  PurchaseOrderView,
  StockOnHandRow,
  UUID,
} from '@pkg/schema';
import { isPurchaseOrderLineUnpriced, purchaseOrderHasUnpricedLines } from '@pkg/schema';
import {
  IconArrowBackUp,
  IconBan,
  IconCircleCheck,
  IconEye,
  IconFlagCheck,
  IconPlus,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { AuditTable, usePurchaseOrderAuditTableStore } from '@/components/audit/AuditTable.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { FilePreviewSheet } from '@/components/documents/FilePreviewSheet.js';
import { useFilePreview } from '@/components/documents/use-file-preview.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { JobMultiPicker, useJobPicker } from '@/components/job-picker/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { usePartOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { fetchDocumentPreviewBlob } from '@/utils/document.js';
import { formatPurchaseUnitLabel } from '@/utils/part-quantity-format.js';
import { allJobsInput } from '../jobs/components/all-jobs-input.js';
import { PurchaseOrderAmendDialog } from './components/PurchaseOrderAmendDialog.js';
import { PurchaseOrderAmendmentsCard } from './components/PurchaseOrderAmendmentsCard.js';
import { PurchaseOrderDocumentsCard } from './components/PurchaseOrderDocumentsCard.js';
import { PurchaseOrderInvoiceCrossCheckCard } from './components/PurchaseOrderInvoiceCrossCheckCard.js';
import { PurchaseOrderReceivingCard } from './components/PurchaseOrderReceivingCard.js';
import { PurchaseOrderReturnsCard } from './components/PurchaseOrderReturnsCard.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
import { fetchPurchaseOrderPreviewBlob } from './components/purchase-order-pdf.js';
import {
  type PurchaseOrderDraftFormValues,
  PurchaseOrderDraftFormValues as PurchaseOrderDraftFormValuesSchema,
  quantityDecimals,
  quantityForPart,
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
  // What the order's own state allows, derived once on the server and read here — so a control is
  // never offered for a write the post would refuse. The role half of each rule stays local.
  const { actions } = purchaseOrder;
  // Line prices are part of the draft, so editing needs the cost gate open as well as create rights.
  const canEdit = actions.edit.allowed && canReadCosts && hasPermission(accessQuery.data, 'purchase_order:create');
  // Approving and withdrawing an approval are the same right: only someone who could sign the order
  // off may un-sign it, which is what keeps the revert an audited step rather than a way around the gate.
  const canApprove = actions.approve.allowed && hasPermission(accessQuery.data, 'purchase_order:approve');
  const canRevertToDraft = actions.revertToDraft.allowed && hasPermission(accessQuery.data, 'purchase_order:approve');
  const canSend = actions.send.allowed && hasPermission(accessQuery.data, 'purchase_order:send');
  const canCancel = actions.cancel.allowed && hasPermission(accessQuery.data, 'purchase_order:close');
  const canCloseShort = actions.closeShort.allowed && hasPermission(accessQuery.data, 'purchase_order:close');
  const canReceive = actions.receive.allowed && hasPermission(accessQuery.data, 'purchase_order:receive');
  const canAmend = actions.amend.allowed && hasPermission(accessQuery.data, 'purchase_order:amend');
  // The server accepts either the physical move right or the PO amendment right for this PO-bound flow.
  const canReturn =
    actions.returnToSupplier.allowed &&
    (hasPermission(accessQuery.data, 'inventory:move') || hasPermission(accessQuery.data, 'purchase_order:amend'));
  // The same single gate the upload route applies — filing the paperwork is procurement's job, and
  // it is the amend right that says who does it.
  const canFileCreditNote = actions.fileDocuments.allowed && hasPermission(accessQuery.data, 'purchase_order:amend');
  // A Supplier invoice is filed by the same procurement hands the credit note is. Reading the
  // cross-check it feeds is the narrower cost question, and confirming a price needs the right to
  // revalue on top of that.
  const canFileSupplierInvoice = canFileCreditNote;
  const canApplyInvoicePrices = canReadCosts && hasPermission(accessQuery.data, 'inventory_cost:revalue');
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
            canApprove={canApprove}
            canCancel={canCancel}
            canCloseShort={canCloseShort}
            canEdit={canEdit}
            canReadCosts={canReadCosts}
            canRevertToDraft={canRevertToDraft}
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
      <PurchaseOrderDetailTabs purchaseOrderId={purchaseOrder.id}>
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
  );
};

export const PurchaseOrderDetailTabs: React.FC<{ children: React.ReactNode; purchaseOrderId: UUID }> = ({
  children,
  purchaseOrderId,
}) => {
  const auditAccess = useCan('audit:read');
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

type DraftForm = ReturnType<typeof useAutosaveForm<PurchaseOrderDraftFormValues, unknown>>['form'];

/**
 * The as-sent PDF, previewed in the same sheet every other filed document uses. The document row is
 * only fetched when the sheet opens: until it lands the order's own code names the file, so the
 * button never sits disabled behind a request the buyer cannot see.
 */
const PurchaseOrderSentPdfButton: React.FC<{
  code: PurchaseOrderView['code'];
  documentId: UUID;
  purchaseOrderId: UUID;
}> = ({ code, documentId, purchaseOrderId }) => {
  const trpc = useTRPC();
  const preview = useFilePreview();
  const owner = useMemo(() => ({ id: purchaseOrderId, type: 'purchase_order' }) as const, [purchaseOrderId]);
  const documentsQuery = useQuery({
    ...trpc.purchaseOrders.documents.queryOptions({ purchaseOrderId }),
    enabled: preview.isOpen,
  });
  // An amended order files further revisions, so only the row knows whether this is `rev 2`.
  const filename = documentsQuery.data?.items.find((item) => item.id === documentId)?.filename ?? `${code}.pdf`;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => fetchDocumentPreviewBlob({ document: { id: documentId }, owner, signal }),
    [documentId, owner],
  );

  return (
    <>
      <Button onClick={() => preview.open()} variant="outline">
        <IconEye data-icon="inline-start" /> View PDF
      </Button>
      <FilePreviewSheet
        description="Filed PDF"
        downloadFilename={filename}
        fetchBlob={fetchBlob}
        kind="pdf"
        onOpenChange={preview.onOpenChange}
        open={preview.isOpen}
        queryKey={['purchase-order-document', purchaseOrderId, documentId]}
        staleTime={Infinity}
        subject="Purchase Order"
        title={filename}
      />
    </>
  );
};

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

export const PurchaseOrderActions: React.FC<{
  canApprove: boolean;
  canCancel: boolean;
  canCloseShort: boolean;
  canEdit: boolean;
  canReadCosts: boolean;
  canRevertToDraft: boolean;
  canSend: boolean;
  isPending: boolean;
  purchaseOrder: PurchaseOrderView;
  runAfterSave: (action: () => Promise<void>, failureMessage: string) => Promise<boolean>;
}> = ({
  canApprove,
  canCancel,
  canCloseShort,
  canEdit,
  canReadCosts,
  canRevertToDraft,
  canSend,
  isPending,
  purchaseOrder,
  runAfterSave,
}) => {
  const trpc = useTRPC();
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const preview = useFilePreview();
  // Every lifecycle refusal the server can raise is a state rule the buyer can act on — an unpriced
  // line names its Part, a cancellation names its receipts. Without this the click just does nothing.
  const showMutationError = useApiMutationErrorToast();
  const approveMutation = useMutation(
    trpc.purchaseOrders.approve.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to approve this Purchase Order.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order approved');
      },
    }),
  );
  const revertToDraftMutation = useMutation(
    trpc.purchaseOrders.revertToDraft.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to revert this Purchase Order to draft.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order reverted to draft');
      },
    }),
  );
  const markSentMutation = useMutation(
    trpc.purchaseOrders.markSent.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to mark this Purchase Order sent.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order marked sent');
      },
    }),
  );
  const cancelMutation = useMutation(
    trpc.purchaseOrders.cancel.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to cancel this Purchase Order.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order cancelled');
      },
    }),
  );
  const closeShortMutation = useMutation(
    trpc.purchaseOrders.closeShort.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to close this Purchase Order short.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order closed short');
      },
    }),
  );
  const disabled =
    isPending ||
    approveMutation.isPending ||
    revertToDraftMutation.isPending ||
    markSentMutation.isPending ||
    cancelMutation.isPending ||
    closeShortMutation.isPending;

  const fetchPreviewBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) =>
      fetchPurchaseOrderPreviewBlob({ purchaseOrderId: purchaseOrder.id, signal }),
    [purchaseOrder.id],
  );

  // The preview renders the *saved* order, so the draft flushes before the sheet asks for it.
  const handlePreview = () => {
    void runAfterSave(async () => {
      preview.open();
    }, 'Save all Purchase Order changes before previewing the PDF.').catch(() => undefined);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canEdit ? (
        <>
          <Button disabled={disabled} onClick={handlePreview} variant="outline">
            <IconEye data-icon="inline-start" /> Preview PDF
          </Button>
          <FilePreviewSheet
            description="Generated PDF"
            downloadFilename={`${purchaseOrder.code}.pdf`}
            fetchBlob={fetchPreviewBlob}
            kind="pdf"
            onOpenChange={preview.onOpenChange}
            open={preview.isOpen}
            queryKey={['purchase-order-preview', purchaseOrder.id, preview.request]}
            subject="Purchase Order"
            title={`${purchaseOrder.code}.pdf`}
          />
        </>
      ) : null}
      {canReadCosts && purchaseOrder.documentId ? (
        <PurchaseOrderSentPdfButton
          code={purchaseOrder.code}
          documentId={purchaseOrder.documentId}
          purchaseOrderId={purchaseOrder.id}
        />
      ) : null}
      {canRevertToDraft ? (
        <Button
          disabled={disabled}
          onClick={() => {
            if (!window.confirm(`Revert ${purchaseOrder.code} to draft? Its approval will be withdrawn.`)) return;
            void revertToDraftMutation.mutateAsync({ id: purchaseOrder.id }).catch(() => undefined);
          }}
          variant="outline"
        >
          <IconArrowBackUp data-icon="inline-start" /> Revert to draft
        </Button>
      ) : null}
      {canApprove ? (
        <Button
          disabled={disabled}
          onClick={() => {
            void runAfterSave(async () => {
              await approveMutation.mutateAsync({ id: purchaseOrder.id });
            }, 'Save all Purchase Order changes before approving it.').catch(() => undefined);
          }}
        >
          <IconCircleCheck data-icon="inline-start" /> Approve
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
  const trpc = useTRPC();
  const parts = usePartOptions({ limit: 0, sortBy: 'name', sortDirection: 'asc' });
  const stockOnHandQuery = useQuery(trpc.inventory.stockOnHand.queryOptions());
  const averageCostByPart = new Map(
    (stockOnHandQuery.data?.items ?? []).map((part) => [part.partId, part.averageUnitCost]),
  );
  // Do not let a quick click turn a costed Part into an unpriced line while its default is still loading.
  // A failed query settles and leaves manual pricing available alongside the visible error.
  const eligibleParts = stockOnHandQuery.isPending
    ? []
    : parts.items
        .filter((part) => part.supplierId === supplierId)
        .map((part) => ({ ...part, averageUnitCost: averageCostByPart.get(part.id) ?? null }));

  return (
    <>
      <ErrorMessage error={stockOnHandQuery.error} fallbackMessage="Unable to load inventory price defaults." />
      <PurchaseOrderLinesEditor commit={commit} form={form} parts={eligibleParts} />
    </>
  );
};

type PurchaseOrderPartOption = Part & Pick<StockOnHandRow, 'averageUnitCost'>;

export const PurchaseOrderLinesEditor: React.FC<{
  commit: () => void;
  form: DraftForm;
  parts: PurchaseOrderPartOption[];
}> = ({ commit, form, parts }) => {
  return (
    <form.AppField mode="array" name="lines">
      {(linesField) => {
        const lines = linesField.state.value;
        const nextPart = parts.find((part) => !lines.some((line) => line.partId === part.id));

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
                    linesField.pushValue({
                      partId: nextPart.id,
                      quantity: 1,
                      unitPrice: defaultPurchaseOrderUnitPrice(nextPart),
                    });
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
                eligibleParts={parts}
                form={form}
                lines={lines}
                removeLine={(index) => linesField.removeValue(index)}
              />
            </CardContent>
            <div className="border-t px-4 pt-4 text-right font-medium">
              Total {lines.some(isPurchaseOrderLineUnpriced) ? 'Not priced' : formatCurrency(lineTotal(lines), 'ZAR')}
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
  eligibleParts: PurchaseOrderPartOption[];
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
                  onValueCommit={(partId) => {
                    const quantityName = `lines[${index}].quantity` as const;
                    const unitPriceName = `lines[${index}].unitPrice` as const;
                    const nextPart = eligibleParts.find((candidate) => candidate.id === partId);
                    form.setFieldValue(quantityName, quantityForPart(form.getFieldValue(quantityName), nextPart));
                    form.setFieldValue(
                      unitPriceName,
                      defaultPurchaseOrderUnitPrice({
                        averageUnitCost: nextPart?.averageUnitCost ?? null,
                        standardPurchaseLengthMm: nextPart?.standardPurchaseLengthMm ?? null,
                      }),
                    );
                    commit();
                  }}
                  options={options}
                  placeholder="Search parts"
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
                  decimals={quantityDecimals(part)}
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
            {(field) => (
              <field.CurrencyField
                displayZeroAsEmpty
                label={<span className="sr-only">Unit price</span>}
                placeholder="Not priced"
              />
            )}
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
  const jobs = useMemo(() => jobsQuery.data?.items ?? [], [jobsQuery.data]);
  const jobPicker = useJobPicker({ isLoading: jobsQuery.isPending, options: jobs });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Jobs</CardTitle>
        <CardDescription>Leave empty for restock, or link every Job this order supports.</CardDescription>
      </CardHeader>
      <CardContent onBlur={commit}>
        <form.AppField name="jobIds">
          {(field) => (
            <Field>
              <FieldLabel className="sr-only" htmlFor={field.name}>
                Linked Jobs
              </FieldLabel>
              <JobMultiPicker
                controller={jobPicker}
                disabled={jobsQuery.isPending}
                id={field.name}
                onChange={(selected) => field.handleChange(selected.map((job) => job.id))}
                value={jobs.filter((job) => field.state.value.includes(job.id))}
              />
            </Field>
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
          Total{' '}
          {purchaseOrderHasUnpricedLines(purchaseOrder)
            ? 'Not priced'
            : formatCurrency(lineTotal(purchaseOrder.lines), 'ZAR')}
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
  if (purchaseOrder.approvedAt) return `Approved ${formatDate(purchaseOrder.approvedAt)}`;
  return 'Draft';
}
