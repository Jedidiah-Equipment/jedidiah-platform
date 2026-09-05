import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import type { PurchaseOrderSaveDraftInput, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconArrowBackUp, IconBan, IconCircleCheck, IconEye, IconFlagCheck, IconSend } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAutosaveForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { FilePreviewSheet } from '@/equipment/components/documents/FilePreviewSheet.js';
import { useFilePreview } from '@/equipment/components/documents/use-file-preview.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { fetchDocumentPreviewBlob } from '@/equipment/utils/document.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderDraft } from './components/PurchaseOrderDraft.js';
import { PurchaseOrderPartLabelsDialog } from './components/PurchaseOrderPartLabelsDialog.js';
import { fetchPurchaseOrderPreviewBlob } from './components/purchase-order-pdf.js';
import {
  PurchaseOrderDraftFormValues,
  toPurchaseOrderDraftFormValues,
  toPurchaseOrderDraftInput,
} from './components/types.js';

type PurchaseOrderEditingProps = {
  purchaseOrder: PurchaseOrderView;
  children: (regions: { actions: React.ReactElement; draft: React.ReactElement | null }) => React.ReactNode;
};

/**
 * Place each region once, with this owner above the Details/Audit tabs: hiding the draft must not
 * dispose the autosave that header actions still need. A null draft means this reader cannot edit.
 */
export function PurchaseOrderEditing({ purchaseOrder, children }: PurchaseOrderEditingProps) {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadCosts = hasPermission(accessQuery.data, 'equipment_inventory_cost:read');
  // What the order's own state allows, derived once on the server and read here — so a control is
  // never offered for a write the post would refuse. The role half of each rule stays local.
  const { actions } = purchaseOrder;
  // Line prices are part of the draft, so editing needs the cost gate open as well as create rights.
  const canEdit =
    actions.edit.allowed && canReadCosts && hasPermission(accessQuery.data, 'equipment_purchase_order:create');
  // Approving and withdrawing an approval are the same right: only someone who could sign the order
  // off may un-sign it, which is what keeps the revert an audited step rather than a way around the gate.
  const canApprove = actions.approve.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:approve');
  const canRevertToDraft =
    actions.revertToDraft.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:approve');
  const canSend = actions.send.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:send');
  const canCancel = actions.cancel.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:close');
  const canCloseShort = actions.closeShort.allowed && hasPermission(accessQuery.data, 'equipment_purchase_order:close');
  // The same either-read gate the label route applies: a label carries no cost, so the price-blind
  // stores role prints as readily as the catalog ones.
  const canPrintPartLabels =
    hasPermission(accessQuery.data, 'equipment_part:read') ||
    hasPermission(accessQuery.data, 'equipment_inventory:read');
  const { invalidatePurchaseOrders, invalidateJobs } = useQueryInvalidation();
  const [isLifecycleActionPending, setIsLifecycleActionPending] = useState(false);

  const saveMutation = useMutation(
    trpc.purchaseOrders.saveDraft.mutationOptions({
      onSuccess: () => Promise.all([invalidatePurchaseOrders(), invalidateJobs()]),
    }),
  );
  const editor = useAutosaveForm({
    defaultValues: toPurchaseOrderDraftFormValues(purchaseOrder),
    failureMessage: 'Unable to save this Purchase Order.',
    save: (input: PurchaseOrderSaveDraftInput) => saveMutation.mutateAsync(input),
    toInput: (values) => toPurchaseOrderDraftInput(purchaseOrder.id, values),
    validator: PurchaseOrderDraftFormValues,
  });

  const { autosave } = editor;

  /** Draft-dependent actions must wait for the same autosave the fields use. */
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
    isLifecycleActionPending ||
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

  return children({
    actions: (
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
        {canPrintPartLabels ? <PurchaseOrderPartLabelsDialog lines={purchaseOrder.lines} /> : null}
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
    ),
    draft: canEdit ? <PurchaseOrderDraft editor={editor} supplierId={purchaseOrder.supplierId} /> : null,
  });
}

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
