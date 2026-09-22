import { deriveCheckoutBasketWarnings, warningMessageFor } from '@pkg/domain/equipment';
import type {
  CheckoutBasketPostResult,
  InventoryQuoteOption,
  InventoryRecipientOption,
  JobPickerOption,
  StockMovementWarningCode,
  StockOnHandRow,
} from '@pkg/schema/equipment';
import { StockMovementLengthMm, StockMovementQuantity } from '@pkg/schema/equipment';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { JobPicker, JobPickerTrigger } from '@/equipment/components/job-picker/index.js';
import { useInventoryJobPicker } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiErrorMetadata } from '@/lib/api-errors.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';

import { InventoryQuotePicker } from './InventoryQuotePicker.js';
import { StockMovementWarningPrompt } from './StockMovementWarningPrompt.js';
import {
  type CheckoutBasketFormValues,
  type CheckoutBasketLineValues,
  canAddCheckoutBasketLine,
  checkoutBasketValidator,
  mergeCheckoutBasketLine,
  partIdFromScanToken,
  partSelectOptions,
  type StockMovementTarget,
  type StockPartOption,
  toCheckoutBasketInput,
  unacknowledgedCheckoutBasketWarnings,
  wholeUnitQuantityMessage,
} from './types.js';
import { useInventoryQuotePicker } from './use-inventory-quote-picker.js';

type FixedTarget = { code: string; id: string };

export function CheckoutBasketDialog({
  fixedJob,
  fixedQuote,
  isLoadingParts = false,
  items,
  onOpenChange,
  open,
  parts,
}: {
  fixedJob?: FixedTarget;
  /** Opens onto one Parts Sale, as its Quote page does. */
  fixedQuote?: FixedTarget;
  isLoadingParts?: boolean;
  items: readonly StockOnHandRow[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
}) {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isJobPickerOpen, setJobPickerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobPickerOption | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<InventoryQuoteOption | null>(null);
  const [refusedPartId, setRefusedPartId] = useState<string | null>(null);
  const lineCount = useRef(0);
  const postedSuccessfully = useRef(false);
  const acknowledgedWarningLines = useRef<
    readonly (CheckoutBasketLineValues & { warnings: readonly StockMovementWarningCode[] })[]
  >([]);
  const jobId = fixedJob?.id ?? selectedJob?.id ?? '';
  const isFixed = fixedJob !== undefined || fixedQuote !== undefined;
  const validator = useMemo(() => checkoutBasketValidator(parts), [parts]);

  const jobPicker = useInventoryJobPicker({ enabled: !isFixed, movementType: 'checkout' });
  const quotePicker = useInventoryQuotePicker({ enabled: open && !isFixed, movementType: 'checkout' });
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }, { enabled: open && jobId !== '' }));
  const recipientQuery = useQuery(
    trpc.inventory.recipientOptions.queryOptions({ limit: 0, search: '' }, { enabled: open && !isFixed }),
  );
  const basketMutation = useMutation(
    trpc.inventory.postCheckoutBasket.mutationOptions({
      onError: (error) => {
        setRefusedPartId(refusedPartIdFrom(error));
        showMutationError(error, 'Unable to check stock out.');
      },
    }),
  );

  function warningsFor(values: CheckoutBasketFormValues): StockMovementWarningCode[][] {
    if (values.lines.length === 0 || (values.target === 'job' && (values.jobId === '' || jobStockQuery.isPending))) {
      return values.lines.map(() => []);
    }

    return deriveCheckoutBasketWarnings({
      factsFor: (line) => {
        const stock = items.find((item) => item.partId === line.partId);
        const jobStock = jobStockQuery.data?.items.find((item) => item.partId === line.partId);

        return {
          bucketQuantityOnHand: stock?.buckets.find((bucket) => bucket.lengthMm === line.lengthMm)?.quantity ?? 0,
          cfoQuantity: values.target === 'job' ? (jobStock?.cfoQuantity ?? 0) : 0,
          drawnQuantity: values.target === 'job' ? (jobStock?.drawnQuantity ?? 0) : 0,
        };
      },
      lines: values.lines,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (
      !nextOpen &&
      !postedSuccessfully.current &&
      !basketMutation.isPending &&
      lineCount.current > 0 &&
      !window.confirm(`Discard ${lineCount.current} unrecorded ${lineCount.current === 1 ? 'line' : 'lines'}?`)
    ) {
      return;
    }
    onOpenChange(nextOpen);
  }

  return (
    <CreateEntityDialog<CheckoutBasketFormValues, CheckoutBasketPostResult>
      // Only a Job has a CFO whose facts must load first; a Parts Sale judges like a person target.
      canSubmit={(values) => values.target !== 'job' || (values.jobId !== '' && jobStockQuery.isSuccess)}
      defaultValues={{
        jobId: fixedJob?.id ?? '',
        lines: [],
        note: '',
        quoteId: fixedQuote?.id ?? '',
        recipientUserId: '',
        target: fixedQuote ? 'quote' : 'job',
      }}
      contentClassName="sm:max-w-[min(64rem,calc(100%-2rem))]"
      description="Build the lines leaving stores, then record them together."
      disableSubmitWhenInvalid
      onCreate={(values) => {
        const warningLines = warningsFor(values);
        acknowledgedWarningLines.current = values.lines.map((line, index) => ({
          ...line,
          warnings: warningLines[index] ?? [],
        }));
        setRefusedPartId(null);
        return basketMutation.mutateAsync(toCheckoutBasketInput(values));
      }}
      onCreated={async (result) => {
        await invalidateInventory();
        postedSuccessfully.current = true;
        onOpenChange(false);
        toast.success(`${result.lines.length} ${result.lines.length === 1 ? 'Part' : 'Parts'} checked out`);
        for (const warning of unacknowledgedCheckoutBasketWarnings({
          acknowledged: acknowledgedWarningLines.current,
          posted: result.lines.map((line) => ({
            lengthMm: line.movement.lengthMm,
            partId: line.movement.partId,
            warnings: line.warnings,
          })),
        })) {
          const partCode = parts.find((part) => part.partId === warning.partId)?.partCode ?? 'Part';
          toast.warning(`${partCode}: ${warningMessageFor(warning.code)}`);
        }
      }}
      onOpenChange={handleOpenChange}
      open={open}
      submitLabel={(values) => {
        const warnings = warningsFor(values).flat();
        return warnings.length > 0
          ? 'Check out anyway'
          : `Check out ${values.lines.length} ${values.lines.length === 1 ? 'line' : 'lines'}`;
      }}
      title="Check out stock"
      validator={validator}
    >
      {(form) => (
        <form.Subscribe selector={(state) => state.values}>
          {(values) => {
            lineCount.current = values.lines.length;
            const lineWarnings = warningsFor(values);

            return (
              <>
                {!isFixed ? (
                  <Field>
                    <FieldLabel>Movement target</FieldLabel>
                    <Tabs
                      onValueChange={(value) => {
                        const target = value as StockMovementTarget;
                        form.setFieldValue('target', target);
                        form.setFieldValue('jobId', '');
                        form.setFieldValue('quoteId', '');
                        form.setFieldValue('note', '');
                        form.setFieldValue('recipientUserId', target === 'person' ? (session?.user.id ?? '') : '');
                        setSelectedJob(null);
                        setSelectedQuote(null);
                      }}
                      value={values.target}
                    >
                      <TabsList className="w-full">
                        <TabsTrigger className="flex-1" value="job">
                          To a Job
                        </TabsTrigger>
                        <TabsTrigger className="flex-1" value="quote">
                          To a Parts Sale
                        </TabsTrigger>
                        <TabsTrigger className="flex-1" value="person">
                          Without a Job
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </Field>
                ) : null}

                {values.target === 'person' ? (
                  <>
                    <Field>
                      <FieldLabel>Operator</FieldLabel>
                      <div className="rounded-md border px-3 py-2 text-sm">
                        {session?.user.name ?? 'Signed-in user'}
                      </div>
                    </Field>
                    <form.AppField name="recipientUserId">
                      {(field) => (
                        <field.ComboboxField
                          emptyMessage="No active Equipment users found."
                          label="Received by"
                          options={recipientOptions(recipientQuery.data?.items ?? [])}
                          placeholder="Search people"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="note">
                      {(field) => <field.TextareaField label="Purpose" placeholder="Repair factory drill" rows={2} />}
                    </form.AppField>
                  </>
                ) : values.target === 'quote' ? (
                  fixedQuote ? (
                    <Field>
                      <FieldLabel>Parts Sale</FieldLabel>
                      <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedQuote.code}</div>
                    </Field>
                  ) : (
                    <form.AppField name="quoteId">
                      {(field) => (
                        <Field data-invalid={field.state.meta.errors.length > 0}>
                          <FieldLabel htmlFor="checkout-basket-quote">Parts Sale</FieldLabel>
                          <InventoryQuotePicker
                            controller={quotePicker}
                            inputId="checkout-basket-quote"
                            onSelected={(quote) => {
                              setSelectedQuote(quote);
                              field.handleChange(quote?.id ?? '');
                            }}
                            value={selectedQuote}
                          />
                        </Field>
                      )}
                    </form.AppField>
                  )
                ) : fixedJob ? (
                  <Field>
                    <FieldLabel>Job</FieldLabel>
                    <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedJob.code}</div>
                  </Field>
                ) : (
                  <form.AppField name="jobId">
                    {(field) => (
                      <Field data-invalid={field.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor="checkout-basket-job">Job</FieldLabel>
                        <JobPicker
                          controller={jobPicker}
                          nothingPickableMessage="No Jobs are available for Checkout."
                          onOpenChange={setJobPickerOpen}
                          onSelect={(job) => {
                            setSelectedJob(job);
                            field.handleChange(job.id);
                          }}
                          open={isJobPickerOpen}
                          value={selectedJob}
                        >
                          <JobPickerTrigger
                            className="w-full"
                            id="checkout-basket-job"
                            placeholder="Select Job"
                            value={selectedJob}
                          />
                        </JobPicker>
                      </Field>
                    )}
                  </form.AppField>
                )}

                <CheckoutBasketAddStrip
                  isLoading={isLoadingParts}
                  lines={values.lines}
                  onAdd={(line) => {
                    form.setFieldValue('lines', mergeCheckoutBasketLine(values.lines, line));
                    setRefusedPartId(null);
                  }}
                  parts={parts}
                />

                <CheckoutBasketLinesTable
                  items={items}
                  lines={values.lines}
                  onLinesChange={(lines) => {
                    form.setFieldValue('lines', lines);
                    if (!lines.some((line) => line.partId === refusedPartId)) setRefusedPartId(null);
                  }}
                  parts={parts}
                  refusedPartId={refusedPartId}
                  warnings={lineWarnings}
                />

                <StockMovementWarningPrompt
                  lines={values.lines.map((line, index) => ({
                    label: `Line ${index + 1} · ${parts.find((part) => part.partId === line.partId)?.partCode ?? 'Part'}`,
                    warnings: lineWarnings[index] ?? [],
                  }))}
                  warnings={lineWarnings.flat()}
                />
              </>
            );
          }}
        </form.Subscribe>
      )}
    </CreateEntityDialog>
  );
}

function CheckoutBasketAddStrip({
  isLoading,
  lines,
  onAdd,
  parts,
}: {
  isLoading: boolean;
  lines: readonly CheckoutBasketLineValues[];
  onAdd: (line: CheckoutBasketLineValues) => void;
  parts: readonly StockPartOption[];
}) {
  const [partId, setPartId] = useState('');
  const [quantityText, setQuantityText] = useState('1');
  const [lengthText, setLengthText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selectedPart = parts.find((part) => part.partId === partId);

  function focus(id: string) {
    queueMicrotask(() => document.getElementById(id)?.focus());
  }

  function selectPart(nextPartId: string) {
    const nextPart = parts.find((part) => part.partId === nextPartId);
    setPartId(nextPartId);
    setLengthText(nextPart?.unitOfMeasure === 'mm' ? String(nextPart.standardPurchaseLengthMm ?? '') : '');
    setError(null);
    if (nextPartId !== '') focus('checkout-basket-quantity');
  }

  function addLine() {
    if (!selectedPart) return setError('Select a Part');
    const quantity = Number(quantityText);
    if (!StockMovementQuantity.safeParse(quantity).success) return setError('Enter a quantity greater than zero');
    const wholeUnitError = wholeUnitQuantityMessage(quantity, selectedPart.unitOfMeasure);
    if (wholeUnitError) return setError(wholeUnitError);

    const lengthMm = selectedPart.unitOfMeasure === 'mm' ? Number(lengthText) : null;
    if (selectedPart.unitOfMeasure === 'mm' && !StockMovementLengthMm.safeParse(lengthMm).success) {
      return setError('Linear stock needs a piece length');
    }

    const line = { lengthMm, partId: selectedPart.partId, quantity };
    if (!canAddCheckoutBasketLine(lines, line)) return setError('A Basket can hold at most 200 lines');

    onAdd(line);
    setPartId('');
    setQuantityText('1');
    setLengthText('');
    setError(null);
    focus('checkout-basket-part');
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-[minmax(12rem,1fr)_8rem_9rem_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor="checkout-basket-part">Part</FieldLabel>
        <SearchableCombobox
          disabled={isLoading}
          emptyMessage="No Parts found."
          inputId="checkout-basket-part"
          onValueChange={selectPart}
          options={partSelectOptions(parts)}
          placeholder={isLoading ? 'Loading parts...' : 'Scan or search parts'}
          resolveInputOnEnter={(inputValue) => partIdFromScanToken(parts, inputValue)}
          value={partId}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="checkout-basket-quantity">Quantity</FieldLabel>
        <Input
          id="checkout-basket-quantity"
          inputMode="decimal"
          onChange={(event) => setQuantityText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addLine();
            }
          }}
          value={quantityText}
        />
      </Field>
      {selectedPart?.unitOfMeasure === 'mm' ? (
        <Field>
          <FieldLabel htmlFor="checkout-basket-length">Length (mm)</FieldLabel>
          <Input
            id="checkout-basket-length"
            inputMode="numeric"
            onChange={(event) => setLengthText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addLine();
              }
            }}
            value={lengthText}
          />
        </Field>
      ) : (
        <div />
      )}
      <Button disabled={isLoading || partId === ''} onClick={addLine} type="button" variant="outline">
        <IconPlus data-icon="inline-start" />
        Add
      </Button>
      {error ? <p className="text-destructive text-sm md:col-span-4">{error}</p> : null}
    </div>
  );
}

type BasketTableRow = CheckoutBasketLineValues & { index: number; key: string };

function CheckoutBasketLinesTable({
  items,
  lines,
  onLinesChange,
  parts,
  refusedPartId,
  warnings,
}: {
  items: readonly StockOnHandRow[];
  lines: readonly CheckoutBasketLineValues[];
  onLinesChange: (lines: CheckoutBasketLineValues[]) => void;
  parts: readonly StockPartOption[];
  refusedPartId: string | null;
  warnings: readonly StockMovementWarningCode[][];
}) {
  const data = useMemo(
    () => lines.map((line, index) => ({ ...line, index, key: `${line.partId}:${line.lengthMm ?? ''}` })),
    [lines],
  );
  const columns = useMemo<DataTableColumnDef<BasketTableRow>[]>(
    () => [
      {
        cell: ({ row }) => {
          const part = parts.find((candidate) => candidate.partId === row.original.partId);
          return part ? `${part.partCode} · ${part.partName}` : 'Unknown Part';
        },
        header: 'Part',
        id: 'part',
      },
      {
        cell: ({ row }) => row.original.lengthMm ?? '—',
        header: 'Length',
        id: 'length',
      },
      {
        cell: ({ row }) => {
          const part = parts.find((candidate) => candidate.partId === row.original.partId);
          const invalid =
            !StockMovementQuantity.safeParse(row.original.quantity).success ||
            (part ? wholeUnitQuantityMessage(row.original.quantity, part.unitOfMeasure) !== undefined : true);
          return (
            <CheckoutBasketQuantityInput
              invalid={invalid}
              label={`Quantity for ${part?.partCode ?? 'Part'}`}
              onChange={(quantity) =>
                onLinesChange(lines.map((line, index) => (index === row.original.index ? { ...line, quantity } : line)))
              }
              quantity={row.original.quantity}
            />
          );
        },
        header: 'Quantity',
        id: 'quantity',
      },
      {
        cell: ({ row }) =>
          items
            .find((item) => item.partId === row.original.partId)
            ?.buckets.find((bucket) => bucket.lengthMm === row.original.lengthMm)?.quantity ?? 0,
        header: 'On hand',
        id: 'on-hand',
      },
      {
        cell: ({ row }) => {
          const rowWarnings = warnings[row.original.index] ?? [];
          const refused = refusedPartId === row.original.partId;
          return rowWarnings.length > 0 || refused ? (
            <IconAlertTriangle
              aria-label={refused ? 'Checkout refused this Part' : 'Checkout warning'}
              className="text-warning"
              title={refused ? 'Checkout refused this Part' : rowWarnings.map(warningMessageFor).join('\n')}
            />
          ) : null;
        },
        enableSorting: false,
        header: () => <span className="sr-only">Warning</span>,
        id: 'warning',
      },
      {
        cell: ({ row }) => {
          const part = parts.find((candidate) => candidate.partId === row.original.partId);
          return (
            <Button
              aria-label={`Remove ${part?.partCode ?? 'line'}`}
              onClick={() => onLinesChange(lines.filter((_, index) => index !== row.original.index))}
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
    [items, lines, onLinesChange, parts, refusedPartId, warnings],
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
      emptyMessage="Scan or search a Part to add it."
      getRowClassName={(row) => (row.partId === refusedPartId ? 'bg-destructive/10' : undefined)}
      hideGlobalFilter
      paginationMode="complete"
      table={table}
      total={data.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'line' : 'lines'}`}
    />
  );
}

function CheckoutBasketQuantityInput({
  invalid,
  label,
  onChange,
  quantity,
}: {
  invalid: boolean;
  label: string;
  onChange: (quantity: number) => void;
  quantity: number;
}) {
  const [text, setText] = useState(Number.isFinite(quantity) ? String(quantity) : '');
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) setText(Number.isFinite(quantity) ? String(quantity) : '');
  }, [quantity]);

  return (
    <Input
      aria-invalid={invalid}
      aria-label={label}
      className="w-24"
      inputMode="decimal"
      onBlur={() => {
        isFocused.current = false;
        setText(Number.isFinite(quantity) ? String(quantity) : '');
      }}
      onChange={(event) => {
        const nextText = event.target.value;
        setText(nextText);
        onChange(nextText.trim() === '' ? Number.NaN : Number(nextText));
      }}
      onFocus={() => {
        isFocused.current = true;
      }}
      value={text}
    />
  );
}

function recipientOptions(items: readonly InventoryRecipientOption[]) {
  return items.map((item) => ({ label: item.name, value: item.id }));
}

function refusedPartIdFrom(error: unknown): string | null {
  const metadata = getApiErrorMetadata(error);
  if (typeof metadata !== 'object' || metadata === null || !('partId' in metadata)) return null;
  return typeof metadata.partId === 'string' ? metadata.partId : null;
}
