import { createStableRowKeys, formatCurrency } from '@pkg/domain';
import { defaultPurchaseOrderUnitPrice } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import type { Part, PurchaseOrderLineInput, PurchaseOrderSaveDraftInput, StockOnHandRow } from '@pkg/schema/equipment';
import { isPurchaseOrderLineUnpriced } from '@pkg/schema/equipment';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useId, useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { AutosaveStatus, type useAutosaveForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { JobMultiPicker, useJobPicker } from '@/equipment/components/job-picker/index.js';
import { usePartOptions, useSupplierOptions } from '@/equipment/hooks/options/index.js';
import { allJobsInput } from '@/equipment/pages/jobs/components/all-jobs-input.js';
import { formatPurchaseUnitLabel } from '@/equipment/utils/part-quantity-format.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  type PurchaseOrderDraftFormValues,
  purchaseOrderLinesTotal,
  quantityDecimals,
  quantityForPart,
} from './types.js';

type DraftEditor = ReturnType<typeof useAutosaveForm<PurchaseOrderDraftFormValues, PurchaseOrderSaveDraftInput>>;
type DraftForm = DraftEditor['form'];
const getLineKey = createStableRowKeys<PurchaseOrderLineInput>('purchase-order-line');

export function PurchaseOrderDraft({ editor, supplierId }: { editor: DraftEditor; supplierId: UUID }) {
  const { autosave, form, formProps } = editor;
  return (
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
      <PurchaseOrderLinesCard commit={autosave.commit} form={form} supplierId={supplierId} />
      <PurchaseOrderJobsCard commit={autosave.commit} form={form} />
    </form>
  );
}

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
      <ErrorMessage error={parts.query.error} fallbackMessage="Unable to load Parts." />
      <ErrorMessage error={stockOnHandQuery.error} fallbackMessage="Unable to load inventory price defaults." />
      <PurchaseOrderLinesEditor
        commit={commit}
        form={form}
        isLoading={parts.isPending || stockOnHandQuery.isPending}
        parts={eligibleParts}
        partsLoadFailed={Boolean(parts.query.error)}
      />
    </>
  );
};

type PurchaseOrderPartOption = Part & Pick<StockOnHandRow, 'averageUnitCost'>;

export const PurchaseOrderLinesEditor: React.FC<{
  commit: () => void;
  form: DraftForm;
  isLoading: boolean;
  parts: PurchaseOrderPartOption[];
  partsLoadFailed: boolean;
}> = ({ commit, form, isLoading, parts, partsLoadFailed }) => {
  const disabledReasonId = useId();

  return (
    <form.AppField mode="array" name="lines">
      {(linesField) => {
        const lines = linesField.state.value;
        const nextPart = parts.find((part) => !lines.some((line) => line.partId === part.id));
        let disabledReason: string | null = null;
        if (isLoading) disabledReason = 'Loading available Parts...';
        else if (!nextPart && parts.length === 0 && partsLoadFailed)
          disabledReason = 'Parts could not be loaded. Try again.';
        else if (!nextPart && parts.length === 0) disabledReason = 'Add a Part for this Supplier before adding a line.';
        else if (!nextPart) disabledReason = 'All Parts for this Supplier are already on the order.';

        return (
          <Card>
            <CardHeader>
              <CardTitle>Parts</CardTitle>
              <CardDescription>Quantities are ordered in the Part's purchasing unit.</CardDescription>
              <CardAction className="flex items-center gap-2">
                {disabledReason ? (
                  <span className="text-muted-foreground text-xs" id={disabledReasonId}>
                    {disabledReason}
                  </span>
                ) : null}
                <Button
                  aria-describedby={disabledReason ? disabledReasonId : undefined}
                  disabled={Boolean(disabledReason)}
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
              Total{' '}
              {lines.some(isPurchaseOrderLineUnpriced)
                ? 'Not priced'
                : formatCurrency(purchaseOrderLinesTotal(lines), 'ZAR')}
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
  const columns = useMemo<DataTableColumnDef<PurchaseOrderLineTableRow>[]>(
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
  const table = useDataTable({
    columns,
    data,
    enableColumnFilters: false,
    enableSorting: false,
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
          {(field) => {
            const linked = jobs.filter((job) => field.state.value.includes(job.id));
            // `jobs.list` never returns a cancelled Job, so a link to one has nothing here to
            // resolve against. Its id rides through every edit rather than being dropped by the
            // first change the reader makes — the link is the Job's id, not what this list can show.
            const unreachableJobIds = field.state.value.filter((id) => !linked.some((job) => job.id === id));

            return (
              <Field>
                <FieldLabel className="sr-only" htmlFor={field.name}>
                  Linked Jobs
                </FieldLabel>
                <JobMultiPicker
                  controller={jobPicker}
                  disabled={jobsQuery.isPending}
                  id={field.name}
                  onChange={(selected) => field.handleChange([...unreachableJobIds, ...selected.map((job) => job.id)])}
                  value={linked}
                />
              </Field>
            );
          }}
        </form.AppField>
      </CardContent>
    </Card>
  );
};
