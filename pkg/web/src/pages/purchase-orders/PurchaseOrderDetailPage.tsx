import { createStableRowKeys, formatCurrency, formatDate, hasPermission } from '@pkg/domain';
import {
  PART_UNIT_OF_MEASURE_LABELS,
  type PurchaseOrderLineInput,
  type PurchaseOrderSaveDraftInput,
  type PurchaseOrderView,
  type UUID,
} from '@pkg/schema';
import { IconBan, IconDownload, IconEye, IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { usePartOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { allJobsInput } from '../jobs/components/all-jobs-input.js';
import { PurchaseOrderStatusBadge } from './components/PurchaseOrderStatusBadge.js';
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

  return (
    <PageLayout
      description={
        query.data ? `${query.data.supplier.companyName} · ${statusDescription(query.data)}` : 'Purchase Order'
      }
      size="lg"
      title={query.data?.code ?? 'Loading Purchase Order...'}
    >
      {query.isPending ? <Skeleton className="h-64 w-full" /> : null}
      <ErrorMessage error={query.error} fallbackMessage="Unable to load this Purchase Order." />
      {query.data ? <PurchaseOrderDetail purchaseOrder={query.data} /> : null}
    </PageLayout>
  );
};

const PurchaseOrderDetail: React.FC<{ purchaseOrder: PurchaseOrderView }> = ({ purchaseOrder }) => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadCosts = hasPermission(accessQuery.data, 'inventory_cost:read');
  // Line prices are part of the draft, so editing needs the cost gate open as well as create rights.
  const canEdit =
    purchaseOrder.status === 'draft' && canReadCosts && hasPermission(accessQuery.data, 'purchase_order:create');
  const canSend = purchaseOrder.status === 'draft' && hasPermission(accessQuery.data, 'purchase_order:send');
  const canCancel = purchaseOrder.status !== 'cancelled' && hasPermission(accessQuery.data, 'purchase_order:close');
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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PurchaseOrderStatusBadge status={purchaseOrder.status} />
        <PurchaseOrderActions
          canCancel={canCancel}
          canEdit={canEdit}
          canReadCosts={canReadCosts}
          canSend={canSend}
          isPending={isLifecycleActionPending}
          purchaseOrder={purchaseOrder}
          runAfterSave={runAfterSave}
        />
      </div>
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
          <ReadOnlyDetailsCard purchaseOrder={purchaseOrder} />
          <ReadOnlyLinesCard canReadCosts={canReadCosts} purchaseOrder={purchaseOrder} />
          <ReadOnlyJobsCard purchaseOrder={purchaseOrder} />
        </>
      )}
    </div>
  );
};

type DraftForm = ReturnType<typeof useAutosaveForm<PurchaseOrderDraftFormValues, unknown>>['form'];

const SupplierField: React.FC<{ commit: () => void; form: DraftForm }> = ({ commit, form }) => {
  const suppliers = useSupplierOptions({ limit: 0 });

  return (
    <form.AppField name="supplierId">
      {(field) => (
        <field.SelectField
          disabled={suppliers.isPending}
          label="Supplier"
          onValueCommit={commit}
          options={suppliers.selectOptions}
        />
      )}
    </form.AppField>
  );
};

const PurchaseOrderActions: React.FC<{
  canCancel: boolean;
  canEdit: boolean;
  canReadCosts: boolean;
  canSend: boolean;
  isPending: boolean;
  purchaseOrder: PurchaseOrderView;
  runAfterSave: (action: () => Promise<void>, failureMessage: string) => Promise<boolean>;
}> = ({ canCancel, canEdit, canReadCosts, canSend, isPending, purchaseOrder, runAfterSave }) => {
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
  const disabled = isPending || markSentMutation.isPending || cancelMutation.isPending;

  const handlePreview = () => {
    // Reserve the tab during the click gesture so browsers do not treat the post-save navigation as a popup.
    const previewWindow = window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;

    void runAfterSave(async () => {
      const url = `/api/purchase-orders/${purchaseOrder.id}/preview`;
      if (previewWindow) previewWindow.location.href = url;
      else window.location.assign(url);
    }, 'Save all Purchase Order changes before previewing the PDF.')
      .then((didRun) => {
        if (!didRun) previewWindow?.close();
      })
      .catch(() => previewWindow?.close());
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
          render={
            <a href={`/api/purchase-orders/${purchaseOrder.id}/documents/${purchaseOrder.documentId}/download`} />
          }
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
            <CardContent className="px-0">
              {lines.length === 0 ? (
                <p className="px-4 text-sm text-muted-foreground">No Parts added.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="w-32">Quantity</TableHead>
                      <TableHead className="w-40">Unit price</TableHead>
                      <TableHead>
                        <span className="sr-only">Remove</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const part = eligibleParts.find((candidate) => candidate.id === line.partId);
                      // A Part appears once per order, so every other row's pick drops out of this
                      // one's choices; its own stays so the selected value keeps a label.
                      const partOptions = eligibleParts
                        .filter(
                          (option) => option.id === line.partId || !lines.some((other) => other.partId === option.id),
                        )
                        .map((option) => ({ label: `${option.code} · ${option.name}`, value: option.id }));

                      return (
                        <TableRow key={getLineKey(line)}>
                          <TableCell>
                            <form.AppField name={`lines[${index}].partId`}>
                              {(field) => (
                                <field.SelectField
                                  label={<span className="sr-only">Part</span>}
                                  onValueCommit={commit}
                                  options={partOptions}
                                />
                              )}
                            </form.AppField>
                          </TableCell>
                          <TableCell>{part ? purchaseUnitLabel(part) : '—'}</TableCell>
                          <TableCell>
                            <form.AppField name={`lines[${index}].quantity`}>
                              {(field) => (
                                <field.NumberField
                                  decimals={part && isMeasuredUnit(part.unitOfMeasure) ? 3 : 0}
                                  label={<span className="sr-only">Quantity</span>}
                                />
                              )}
                            </form.AppField>
                          </TableCell>
                          <TableCell>
                            <form.AppField name={`lines[${index}].unitPrice`}>
                              {(field) => <field.CurrencyField label={<span className="sr-only">Unit price</span>} />}
                            </form.AppField>
                          </TableCell>
                          <TableCell>
                            <Button
                              aria-label={`Remove ${part?.name ?? 'line'}`}
                              onClick={() => {
                                linesField.removeValue(index);
                                commit();
                              }}
                              size="icon-sm"
                              type="button"
                              variant="ghost"
                            >
                              <IconTrash />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
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

const ReadOnlyDetailsCard: React.FC<{ purchaseOrder: PurchaseOrderView }> = ({ purchaseOrder }) => (
  <Card>
    <CardHeader>
      <CardTitle>Order details</CardTitle>
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
  </Card>
);

const ReadOnlyLinesCard: React.FC<{ canReadCosts: boolean; purchaseOrder: PurchaseOrderView }> = ({
  canReadCosts,
  purchaseOrder,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Parts</CardTitle>
      <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
    </CardHeader>
    <CardContent className="px-0">
      {purchaseOrder.lines.length === 0 ? (
        <p className="px-4 text-sm text-muted-foreground">No Parts added.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Quantity</TableHead>
              {canReadCosts ? (
                <>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchaseOrder.lines.map((line) => (
              <TableRow key={line.partId}>
                <TableCell>
                  <span className="font-medium">{line.partCode}</span> · {line.partName}
                </TableCell>
                <TableCell>{purchaseUnitLabel(line)}</TableCell>
                <TableCell>{line.quantity}</TableCell>
                {canReadCosts ? (
                  <>
                    <TableCell className="text-right">
                      {line.unitPrice === null ? '—' : formatCurrency(line.unitPrice, 'ZAR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {line.unitPrice === null ? '—' : formatCurrency(line.quantity * line.unitPrice, 'ZAR')}
                    </TableCell>
                  </>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
    {canReadCosts ? (
      <div className="border-t px-4 pt-4 text-right font-medium">
        Total {formatCurrency(lineTotal(purchaseOrder.lines), 'ZAR')}
      </div>
    ) : null}
  </Card>
);

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
  if (purchaseOrder.sentAt) return `Sent ${formatDate(purchaseOrder.sentAt)}`;
  return 'Draft';
}

function isMeasuredUnit(unitOfMeasure: PurchaseOrderView['lines'][number]['unitOfMeasure']): boolean {
  return unitOfMeasure === 'kg' || unitOfMeasure === 'litre';
}

/** A linear Part is ordered as whole pieces of its standard length, never as millimetres (spec §2). */
function purchaseUnitLabel({
  standardPurchaseLengthMm,
  unitOfMeasure,
}: {
  standardPurchaseLengthMm: number | null;
  unitOfMeasure: PurchaseOrderView['lines'][number]['unitOfMeasure'];
}): string {
  return unitOfMeasure === 'mm' && standardPurchaseLengthMm !== null
    ? `Pieces · ${standardPurchaseLengthMm} mm each`
    : PART_UNIT_OF_MEASURE_LABELS[unitOfMeasure];
}
