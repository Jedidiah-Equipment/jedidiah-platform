import { type AutosaveStatus as AutosaveStatusValue, formatCurrency, formatDate, hasPermission } from '@pkg/domain';
import {
  PART_UNIT_OF_MEASURE_LABELS,
  type PurchaseOrder,
  type PurchaseOrderLineInput,
  PurchaseOrderLineInput as PurchaseOrderLineInputSchema,
  type PurchaseOrderUpdateHeaderInput,
  type UUID,
  UUID as UUIDSchema,
} from '@pkg/schema';
import { IconBan, IconDownload, IconEye, IconPlus, IconSend, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { usePartOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { allJobsInput } from '../jobs/components/all-jobs-input.js';
import { runAfterPurchaseOrderAutosaves } from './components/purchase-order-lifecycle.js';
import {
  PurchaseOrderHeaderFormValues,
  toPurchaseOrderHeaderFormValues,
  toPurchaseOrderHeaderInput,
} from './components/types.js';
import { PurchaseOrderStatusBadge } from './PurchaseOrdersPage.js';

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

const PurchaseOrderDetail: React.FC<{ purchaseOrder: PurchaseOrder }> = ({ purchaseOrder }) => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canEdit = purchaseOrder.status === 'draft' && hasPermission(accessQuery.data, 'purchase_order:create');
  const canReadCosts = hasPermission(accessQuery.data, 'inventory_cost:read');
  const canSend = purchaseOrder.status === 'draft' && hasPermission(accessQuery.data, 'purchase_order:send');
  const canCancel = purchaseOrder.status !== 'cancelled' && hasPermission(accessQuery.data, 'purchase_order:close');
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const autosaveRegistrations = useRef(new Map<PurchaseOrderAutosaveSection, PurchaseOrderAutosaveRegistration>());
  const [autosaveStatuses, setAutosaveStatuses] = useState<
    Partial<Record<PurchaseOrderAutosaveSection, AutosaveStatusValue>>
  >({});
  const [isLifecycleActionPending, setIsLifecycleActionPending] = useState(false);

  const registerAutosave = useCallback<RegisterPurchaseOrderAutosave>((section, registration) => {
    if (registration) autosaveRegistrations.current.set(section, registration);
    else autosaveRegistrations.current.delete(section);

    setAutosaveStatuses((current) => {
      const nextStatus = registration?.status;
      if (current[section] === nextStatus) return current;
      const next = { ...current };
      if (nextStatus) next[section] = nextStatus;
      else delete next[section];
      return next;
    });
  }, []);

  const runAfterAutosaves = useCallback(async (action: () => Promise<void>, failureMessage: string) => {
    setIsLifecycleActionPending(true);
    try {
      const didRun = await runAfterPurchaseOrderAutosaves(
        [...autosaveRegistrations.current.values()].map(({ flush }) => flush),
        action,
      );
      if (!didRun) toast.error(failureMessage);
      return didRun;
    } finally {
      setIsLifecycleActionPending(false);
    }
  }, []);

  const markSentMutation = useMutation(
    trpc.purchaseOrders.markSent.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to mark Purchase Order sent.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order marked sent');
      },
    }),
  );
  const cancelMutation = useMutation(
    trpc.purchaseOrders.cancel.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to cancel Purchase Order.'),
      onSuccess: async () => {
        await invalidatePurchaseOrders();
        toast.success('Purchase Order cancelled');
      },
    }),
  );
  const autosaveBlocksLifecycle = Object.values(autosaveStatuses).some((status) =>
    ['saving', 'invalid', 'error'].includes(status),
  );
  const lifecycleActionDisabled = isLifecycleActionPending || autosaveBlocksLifecycle;

  const handlePreview = () => {
    // Reserve the tab during the click gesture so browsers do not treat the post-flush navigation as a popup.
    const previewWindow = window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;

    void runAfterAutosaves(async () => {
      const url = `/api/purchase-orders/${purchaseOrder.id}/preview`;
      if (previewWindow) previewWindow.location.href = url;
      else window.location.assign(url);
    }, 'Save all Purchase Order changes before previewing the PDF.')
      .then((didRun) => {
        if (!didRun) previewWindow?.close();
      })
      .catch(() => previewWindow?.close());
  };

  const handleMarkSent = () => {
    void runAfterAutosaves(async () => {
      await markSentMutation.mutateAsync({ id: purchaseOrder.id });
    }, 'Save all Purchase Order changes before marking it sent.').catch(() => undefined);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PurchaseOrderStatusBadge status={purchaseOrder.status} />
        <div className="flex flex-wrap gap-2">
          {purchaseOrder.status === 'draft' && canEdit && canReadCosts ? (
            <Button disabled={lifecycleActionDisabled} onClick={handlePreview} variant="outline">
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
            <Button disabled={lifecycleActionDisabled || markSentMutation.isPending} onClick={handleMarkSent}>
              <IconSend data-icon="inline-start" /> Mark sent
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              disabled={lifecycleActionDisabled || cancelMutation.isPending}
              onClick={() => {
                if (!window.confirm(`Cancel ${purchaseOrder.code}?`)) return;
                void runAfterAutosaves(async () => {
                  await cancelMutation.mutateAsync({ id: purchaseOrder.id });
                }, 'Save all Purchase Order changes before cancelling it.').catch(() => undefined);
              }}
              variant="destructive"
            >
              <IconBan data-icon="inline-start" /> Cancel
            </Button>
          ) : null}
        </div>
      </div>
      <PurchaseOrderHeaderCard canEdit={canEdit} onAutosaveChange={registerAutosave} purchaseOrder={purchaseOrder} />
      <PurchaseOrderLinesCard
        canEdit={canEdit && canReadCosts}
        canReadCosts={canReadCosts}
        onAutosaveChange={registerAutosave}
        purchaseOrder={purchaseOrder}
      />
      <PurchaseOrderJobsCard canEdit={canEdit} onAutosaveChange={registerAutosave} purchaseOrder={purchaseOrder} />
    </div>
  );
};

const PurchaseOrderHeaderCard: React.FC<{
  canEdit: boolean;
  onAutosaveChange: RegisterPurchaseOrderAutosave;
  purchaseOrder: PurchaseOrder;
}> = ({ canEdit, onAutosaveChange, purchaseOrder }) => {
  const trpc = useTRPC();
  const suppliers = useSupplierOptions({ enabled: canEdit, limit: 0 });
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const updateMutation = useMutation(
    trpc.purchaseOrders.updateHeader.mutationOptions({ onSuccess: () => invalidatePurchaseOrders() }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toPurchaseOrderHeaderFormValues(purchaseOrder),
    failureMessage: 'Unable to update Purchase Order details.',
    save: (input: PurchaseOrderUpdateHeaderInput) => updateMutation.mutateAsync(input),
    toInput: (values) => toPurchaseOrderHeaderInput(purchaseOrder.id, values),
    validator: PurchaseOrderHeaderFormValues,
  });
  usePurchaseOrderAutosaveRegistration('header', canEdit, autosave, onAutosaveChange);

  if (!canEdit) {
    return (
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
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order details</CardTitle>
        <CardAction>
          <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <form {...formProps} className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="supplierId">
            {(field) => (
              <field.SelectField
                disabled={suppliers.isPending}
                label="Supplier"
                onValueCommit={autosave.commit}
                options={suppliers.selectOptions}
              />
            )}
          </form.AppField>
          <form.AppField name="expectedDeliveryDate">
            {(field) => (
              <field.DatePickerField
                label="Expected delivery date"
                onValueCommit={autosave.commit}
                placeholder="Optional"
              />
            )}
          </form.AppField>
        </form>
      </CardContent>
    </Card>
  );
};

const PurchaseOrderLinesFormValues = z.object({ lines: z.array(PurchaseOrderLineInputSchema) });

const PurchaseOrderLinesCard: React.FC<{
  canEdit: boolean;
  canReadCosts: boolean;
  onAutosaveChange: RegisterPurchaseOrderAutosave;
  purchaseOrder: PurchaseOrder;
}> = ({ canEdit, canReadCosts, onAutosaveChange, purchaseOrder }) => {
  const trpc = useTRPC();
  const parts = usePartOptions({ limit: 0, sortBy: 'name', sortDirection: 'asc' });
  const eligibleParts = useMemo(
    () => parts.items.filter((part) => part.supplierId === purchaseOrder.supplierId),
    [parts.items, purchaseOrder.supplierId],
  );
  const { invalidatePurchaseOrders } = useQueryInvalidation();
  const replaceMutation = useMutation(
    trpc.purchaseOrders.replaceLines.mutationOptions({
      onSuccess: () => invalidatePurchaseOrders(),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      lines: purchaseOrder.lines.flatMap((line) =>
        line.unitPrice === null ? [] : [{ partId: line.partId, quantity: line.quantity, unitPrice: line.unitPrice }],
      ),
    },
    failureMessage: 'Unable to save Purchase Order lines.',
    save: (input: { id: UUID; lines: PurchaseOrderLineInput[] }) => replaceMutation.mutateAsync(input),
    toInput: (values) => ({ id: purchaseOrder.id, lines: values.lines }),
    validator: PurchaseOrderLinesFormValues,
  });
  usePurchaseOrderAutosaveRegistration('lines', canEdit, autosave, onAutosaveChange);

  if (!canEdit) {
    const total = purchaseOrder.lines.reduce((sum, line) => sum + line.quantity * (line.unitPrice ?? 0), 0);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Parts</CardTitle>
          <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {purchaseOrder.lines.length > 0 ? (
            <ReadOnlyLinesTable canReadCosts={canReadCosts} purchaseOrder={purchaseOrder} />
          ) : (
            <p className="px-4 text-sm text-muted-foreground">No Parts added.</p>
          )}
        </CardContent>
        {canReadCosts ? (
          <div className="border-t px-4 pt-4 text-right font-medium">Total {formatCurrency(total, 'ZAR')}</div>
        ) : null}
      </Card>
    );
  }

  return (
    <form {...formProps}>
      <form.Subscribe selector={(state) => state.values.lines}>
        {(lines) => {
          const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
          return (
            <Card>
              <CardHeader>
                <CardTitle>Parts</CardTitle>
                <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
                <CardAction className="flex items-center gap-2">
                  <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
                  <Button
                    disabled={eligibleParts.length === 0 || lines.length >= eligibleParts.length}
                    onClick={() => {
                      const nextPart = eligibleParts.find((part) => !lines.some((line) => line.partId === part.id));
                      if (!nextPart) return;
                      form.setFieldValue('lines', [...lines, { partId: nextPart.id, quantity: 1, unitPrice: 0 }]);
                      autosave.commit();
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
                <EditableLinesTable
                  eligibleParts={eligibleParts}
                  lines={lines}
                  onChange={(nextLines) => form.setFieldValue('lines', nextLines)}
                  onCommit={autosave.commit}
                />
              </CardContent>
              <div className="border-t px-4 pt-4 text-right font-medium">Total {formatCurrency(total, 'ZAR')}</div>
            </Card>
          );
        }}
      </form.Subscribe>
    </form>
  );
};

const EditableLinesTable: React.FC<{
  eligibleParts: ReturnType<typeof usePartOptions>['items'];
  lines: PurchaseOrderLineInput[];
  onChange: (lines: PurchaseOrderLineInput[]) => void;
  onCommit: () => void;
}> = ({ eligibleParts, lines, onChange, onCommit }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Part</TableHead>
        <TableHead>Unit</TableHead>
        <TableHead>Quantity</TableHead>
        <TableHead>Unit price</TableHead>
        <TableHead>
          <span className="sr-only">Remove</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {lines.map((line, index) => {
        const part = eligibleParts.find((candidate) => candidate.id === line.partId);
        return (
          <TableRow key={line.partId}>
            <TableCell>
              <Select
                value={line.partId}
                onValueChange={(partId) => {
                  if (!partId) return;
                  onChange(lines.map((item, itemIndex) => (itemIndex === index ? { ...item, partId } : item)));
                  onCommit();
                }}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligibleParts.map((option) => (
                    <SelectItem
                      disabled={lines.some((item, itemIndex) => itemIndex !== index && item.partId === option.id)}
                      key={option.id}
                      value={option.id}
                    >
                      {option.code} · {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>{part ? purchaseUnitLabel(part) : '—'}</TableCell>
            <TableCell>
              <Input
                className="w-28"
                min="0.001"
                onChange={(event) =>
                  onChange(
                    lines.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, quantity: event.target.valueAsNumber } : item,
                    ),
                  )
                }
                step={part && ['kg', 'litre'].includes(part.unitOfMeasure) ? '0.001' : '1'}
                type="number"
                value={line.quantity}
              />
            </TableCell>
            <TableCell>
              <Input
                className="w-32"
                min="0"
                onChange={(event) =>
                  onChange(
                    lines.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, unitPrice: event.target.valueAsNumber } : item,
                    ),
                  )
                }
                step="0.01"
                type="number"
                value={line.unitPrice}
              />
            </TableCell>
            <TableCell>
              <Button
                aria-label={`Remove ${part?.name ?? 'line'}`}
                onClick={() => {
                  onChange(lines.filter((_, itemIndex) => itemIndex !== index));
                  onCommit();
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
);

const ReadOnlyLinesTable: React.FC<{ canReadCosts: boolean; purchaseOrder: PurchaseOrder }> = ({
  canReadCosts,
  purchaseOrder,
}) => (
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
              <TableCell className="text-right">{formatCurrency(line.unitPrice ?? 0, 'ZAR')}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(line.quantity * (line.unitPrice ?? 0), 'ZAR')}
              </TableCell>
            </>
          ) : null}
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const PurchaseOrderJobsFormValues = z.object({ jobIds: z.array(UUIDSchema) });

const PurchaseOrderJobsCard: React.FC<{
  canEdit: boolean;
  onAutosaveChange: RegisterPurchaseOrderAutosave;
  purchaseOrder: PurchaseOrder;
}> = ({ canEdit, onAutosaveChange, purchaseOrder }) => {
  const trpc = useTRPC();
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput, { enabled: canEdit }));
  const { invalidatePurchaseOrders, invalidateJobs } = useQueryInvalidation();
  const replaceMutation = useMutation(
    trpc.purchaseOrders.replaceJobLinks.mutationOptions({
      onSuccess: () => Promise.all([invalidatePurchaseOrders(), invalidateJobs()]),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { jobIds: purchaseOrder.jobs.map((job) => job.id) },
    failureMessage: 'Unable to save linked Jobs.',
    save: (input: { id: UUID; jobIds: UUID[] }) => replaceMutation.mutateAsync(input),
    toInput: (values) => ({ id: purchaseOrder.id, jobIds: values.jobIds }),
    validator: PurchaseOrderJobsFormValues,
  });
  usePurchaseOrderAutosaveRegistration('jobs', canEdit, autosave, onAutosaveChange);
  const jobs = jobsQuery.data?.items ?? [];

  if (!canEdit) {
    return (
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
  }

  return (
    <form {...formProps}>
      <form.Subscribe selector={(state) => state.values.jobIds}>
        {(jobIds) => (
          <Card>
            <CardHeader>
              <CardTitle>Linked Jobs</CardTitle>
              <CardDescription>Leave empty for restock, or link every Job this order supports.</CardDescription>
              <CardAction>
                <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {jobs.map((job) => (
                  <Label className="flex items-center gap-2 rounded-md border p-3" key={job.id}>
                    <input
                      checked={jobIds.includes(job.id)}
                      onChange={(event) => {
                        form.setFieldValue(
                          'jobIds',
                          event.target.checked ? [...jobIds, job.id] : jobIds.filter((id) => id !== job.id),
                        );
                        autosave.commit();
                      }}
                      type="checkbox"
                    />
                    <span>{job.code}</span>
                  </Label>
                ))}
                {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No Jobs available.</p> : null}
              </div>
            </CardContent>
          </Card>
        )}
      </form.Subscribe>
    </form>
  );
};

const ReadOnlyValue: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="mt-1">{value}</div>
  </div>
);

function statusDescription(purchaseOrder: PurchaseOrder): string {
  if (purchaseOrder.status === 'cancelled') return 'Cancelled';
  if (purchaseOrder.sentAt) return `Sent ${formatDate(purchaseOrder.sentAt)}`;
  return 'Draft';
}

function purchaseUnitLabel({
  standardPurchaseLengthMm,
  unitOfMeasure,
}: Pick<PurchaseOrder['lines'][number], 'standardPurchaseLengthMm' | 'unitOfMeasure'>): string {
  return unitOfMeasure === 'mm' && standardPurchaseLengthMm !== null
    ? `Pieces · ${standardPurchaseLengthMm} mm each`
    : PART_UNIT_OF_MEASURE_LABELS[unitOfMeasure];
}

type PurchaseOrderAutosaveSection = 'header' | 'jobs' | 'lines';
type PurchaseOrderAutosaveRegistration = {
  flush: () => Promise<boolean>;
  status: AutosaveStatusValue;
};
type RegisterPurchaseOrderAutosave = (
  section: PurchaseOrderAutosaveSection,
  registration: PurchaseOrderAutosaveRegistration | null,
) => void;

function usePurchaseOrderAutosaveRegistration(
  section: PurchaseOrderAutosaveSection,
  enabled: boolean,
  autosave: Pick<PurchaseOrderAutosaveRegistration, 'flush'> & { state: { status: AutosaveStatusValue } },
  register: RegisterPurchaseOrderAutosave,
) {
  useEffect(() => {
    if (!enabled) return;
    register(section, { flush: autosave.flush, status: autosave.state.status });
    return () => register(section, null);
  }, [autosave.flush, autosave.state.status, enabled, register, section]);
}
