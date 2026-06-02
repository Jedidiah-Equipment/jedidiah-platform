import { computeQuoteTotal, formatBytes, resolveEffectiveBom } from '@pkg/domain';
import {
  type Assembly,
  type DocumentSummary,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteSelectedAssembly,
  QuoteStatus,
  type QuoteUpdateInput,
} from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DownloadIcon, EyeIcon, FileTextIcon, Loader2Icon, XIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { getFieldErrors } from '@/components/form/field-errors.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { formatDate } from '@/utils/date.js';
import { downloadQuoteDocument } from '@/utils/document.js';
import { formatCurrency, formatPercent } from '@/utils/number.js';
import { GenerateJobFromQuoteDialog } from './GenerateJobFromQuoteDialog.js';
import { QuoteCustomerCombobox } from './QuoteCustomerCombobox.js';
import { type QuoteProductChoice, QuoteProductCombobox } from './QuoteProductCombobox.js';
import { quoteStatusLabels } from './QuoteStatusBadge.js';
import {
  QuoteFormValues,
  resolveSelectedAssemblySnapshots,
  type SelectedAssemblySnapshot,
  toQuoteCreateInput,
  toQuoteFormValues,
  toQuoteUpdateInput,
} from './types.js';

type QuoteFormProps = {
  initialQuote?: QuoteDetail | undefined;
  isPending: boolean;
  onSubmit: (value: QuoteCreateInput | QuoteUpdateInput) => Promise<unknown>;
  submitLabel: string;
};

export const QuoteForm: React.FC<QuoteFormProps> = ({ initialQuote, isPending, onSubmit, submitLabel }) => {
  const trpc = useTRPC();

  const isEditing = Boolean(initialQuote);
  const isLocked = Boolean(initialQuote?.linkedJobs.length);

  const [selectedProduct, setSelectedProduct] = useState<QuoteProductChoice | null>(() =>
    initialQuote
      ? {
          assemblies: initialQuote.productAssemblies,
          basePrice: initialQuote.quotedBasePrice,
          currencyCode: initialQuote.productCurrencyCode,
          id: initialQuote.productId,
          modelCode: initialQuote.productModelCode,
          name: initialQuote.productName,
        }
      : null,
  );
  const currentUserQuery = useQuery(trpc.auth.me.queryOptions());
  const salespeopleOptions = useSalesPersonOptions();

  const fallbackCustomer = useMemo(
    () =>
      initialQuote
        ? {
            companyName: initialQuote.customerCompanyName,
            email: null,
            id: initialQuote.customerId,
          }
        : null,
    [initialQuote],
  );

  const form = useAppForm({
    defaultValues: toQuoteFormValues(initialQuote),
    validators: {
      onSubmit: QuoteFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(initialQuote ? toQuoteUpdateInput({ id: initialQuote.id, value }) : toQuoteCreateInput(value));
    },
  });

  useEffect(() => {
    if (isEditing || form.state.values.salesPersonId) {
      return;
    }

    const currentUser = currentUserQuery.data;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'sales') {
      return;
    }

    form.reset({
      ...form.state.values,
      salesPersonId: currentUser.id,
    });
  }, [currentUserQuery.data, form, isEditing]);

  const onProductSelected = useCallback((product: QuoteProductChoice | null) => {
    setSelectedProduct((current) => {
      if (
        current?.id === product?.id &&
        current?.basePrice === product?.basePrice &&
        current?.currencyCode === product?.currencyCode &&
        current?.modelCode === product?.modelCode &&
        current?.name === product?.name
      ) {
        return current;
      }

      return product;
    });
  }, []);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-6">
            <QuoteFormSection title="Customer and product">
              <div className="grid gap-3 md:grid-cols-2">
                {initialQuote ? (
                  <ReadOnlyQuoteField label="Customer" value={initialQuote.customerCompanyName} />
                ) : (
                  <form.Field name="customerId">
                    {(field) => {
                      const fieldErrors = getFieldErrors(field.state.meta.errors);
                      const isInvalid = fieldErrors.length > 0;

                      return (
                        <form.Subscribe
                          selector={(state) => ({
                            customerMode: state.values.customerMode,
                            inlineCompanyName: state.values.inlineCompanyName,
                          })}
                        >
                          {({ customerMode, inlineCompanyName }) => (
                            <Field data-invalid={isInvalid}>
                              <FieldLabel htmlFor={field.name}>Customer</FieldLabel>
                              <QuoteCustomerCombobox
                                allowCreate
                                disabled={false}
                                fallbackCustomer={fallbackCustomer}
                                inlineValue={inlineCompanyName}
                                mode={customerMode}
                                onSelected={(selection) => {
                                  if (!selection) {
                                    form.setFieldValue('customerMode', 'existing');
                                    form.setFieldValue('inlineCompanyName', '');
                                    field.handleChange('');
                                    return;
                                  }

                                  if (selection.type === 'inline') {
                                    form.setFieldValue('customerMode', 'inline');
                                    form.setFieldValue('inlineCompanyName', selection.companyName);
                                    field.handleChange('');
                                    return;
                                  }

                                  form.setFieldValue('customerMode', 'existing');
                                  form.setFieldValue('inlineCompanyName', '');
                                  field.handleChange(selection.customer.id);
                                }}
                                value={field.state.value}
                              />
                              <FieldError errors={fieldErrors} />
                            </Field>
                          )}
                        </form.Subscribe>
                      );
                    }}
                  </form.Field>
                )}
                {initialQuote ? (
                  <ReadOnlyQuoteField
                    label="Product"
                    value={`${initialQuote.productName} (${initialQuote.productModelCode})`}
                  />
                ) : (
                  <form.Field name="productId">
                    {(field) => {
                      const fieldErrors = getFieldErrors(field.state.meta.errors);
                      const isInvalid = fieldErrors.length > 0;

                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>Product</FieldLabel>
                          <QuoteProductCombobox
                            disabled={false}
                            onSelected={(product) => {
                              const productId = product?.id ?? '';

                              if (field.state.value !== productId) {
                                field.handleChange(productId);
                                form.setFieldValue('selectedAssemblies', []);
                              }

                              onProductSelected(product);
                            }}
                            value={field.state.value}
                          />
                          <FieldError errors={fieldErrors} />
                        </Field>
                      );
                    }}
                  </form.Field>
                )}
                <form.AppField name="salesPersonId">
                  {(field) => (
                    <field.SelectField
                      label="Salesperson"
                      disabled={isLocked}
                      options={salespeopleOptions.selectOptions}
                      placeholder="Select salesperson"
                    />
                  )}
                </form.AppField>
                <form.AppField name="status">
                  {(field) => (
                    <field.SelectField
                      label="Status"
                      disabled={isLocked}
                      options={QuoteStatus.options.map((status) => ({
                        label: quoteStatusLabels[status],
                        value: status,
                      }))}
                    />
                  )}
                </form.AppField>
              </div>
            </QuoteFormSection>

            <QuoteFormSection title="Dates and delivery">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <form.AppField name="preferredDeliveryDate">
                  {(field) => <field.DatePickerField clearable label="Preferred delivery date" />}
                </form.AppField>
                <form.AppField name="plannedDeliveryDate">
                  {(field) => <field.DatePickerField clearable label="Planned delivery date" />}
                </form.AppField>
                <form.AppField name="validUntil">
                  {(field) => <field.DatePickerField clearable label="Valid until" />}
                </form.AppField>
                <form.Field name="deliveryIncluded">
                  {(field) => {
                    const fieldErrors = getFieldErrors(field.state.meta.errors);
                    const isInvalid = fieldErrors.length > 0;

                    return (
                      <Field className="justify-end" data-invalid={isInvalid}>
                        <FieldLabel aria-hidden className="invisible">
                          Delivery
                        </FieldLabel>
                        <div className="flex min-h-9 items-center gap-2">
                          <Checkbox
                            aria-invalid={isInvalid}
                            checked={field.state.value}
                            disabled={isLocked}
                            id={field.name}
                            name={field.name}
                            onBlur={field.handleBlur}
                            onCheckedChange={(checked) => {
                              const isChecked = checked === true;

                              field.handleChange(isChecked);

                              if (!isChecked) {
                                form.setFieldValue('deliveryPrice', 0);
                              }
                            }}
                          />
                          <FieldLabel htmlFor={field.name}>Delivery included</FieldLabel>
                        </div>
                        <FieldError errors={fieldErrors} />
                      </Field>
                    );
                  }}
                </form.Field>
                <form.Subscribe selector={(state) => state.values.deliveryIncluded}>
                  {(deliveryIncluded) =>
                    deliveryIncluded ? (
                      <form.AppField name="deliveryPrice">
                        {(field) => (
                          <field.CurrencyField
                            {...(selectedProduct ? { currencyCode: selectedProduct.currencyCode } : {})}
                            disabled={isLocked || !selectedProduct}
                            label="Delivery price"
                          />
                        )}
                      </form.AppField>
                    ) : null
                  }
                </form.Subscribe>
              </div>
            </QuoteFormSection>

            <QuoteFormSection title="Pricing">
              <div className="grid gap-3 md:grid-cols-2">
                <form.AppField name="discountAmount">
                  {(field) => (
                    <field.CurrencyField
                      {...(selectedProduct ? { currencyCode: selectedProduct.currencyCode } : {})}
                      disabled={isLocked || !selectedProduct}
                      label="Discount amount"
                    />
                  )}
                </form.AppField>
                <form.AppField name="depositPercent">
                  {(field) => (
                    <field.NumberField
                      disabled={isLocked || !selectedProduct}
                      emptyValue={0}
                      label="Deposit percent"
                      max={100}
                      min={0}
                      step="0.01"
                    />
                  )}
                </form.AppField>
              </div>
            </QuoteFormSection>

            <QuoteFormSection title="Terms and notes">
              <div className="grid gap-3">
                <form.AppField name="documentNotes">
                  {(field) => <field.TextareaField label="Document Notes" rows={4} />}
                </form.AppField>
                <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
              </div>
            </QuoteFormSection>

            {initialQuote ? <QuoteDocumentsSection quoteId={initialQuote.id} /> : null}

            <QuoteFormSection
              description="Standard assemblies are included. Optional assemblies add to the quote."
              title="Assemblies"
            >
              <form.Field name="selectedAssemblies">
                {(field) =>
                  selectedProduct ? (
                    <QuoteAssembliesSelector
                      catalogAssemblies={selectedProduct.assemblies}
                      currencyCode={selectedProduct.currencyCode}
                      initialSelections={initialQuote?.selectedAssemblies ?? []}
                      onChange={field.handleChange}
                      readOnly={isLocked}
                      value={field.state.value}
                    />
                  ) : (
                    <p className="text-muted-foreground text-sm">Select a product to see assemblies.</p>
                  )
                }
              </form.Field>
            </QuoteFormSection>
          </div>
          <form.Subscribe
            selector={(state) => {
              if (!selectedProduct) {
                return null;
              }

              const discountAmount = state.values.discountAmount;
              const deliveryIncluded = state.values.deliveryIncluded;
              const deliveryPrice = deliveryIncluded ? state.values.deliveryPrice : 0;
              const quotedBasePrice =
                initialQuote?.productId === selectedProduct.id
                  ? initialQuote.quotedBasePrice
                  : selectedProduct.basePrice;
              const selectedSnapshots = resolveSelectedAssemblySnapshots({
                catalogAssemblies: selectedProduct.assemblies,
                formSelections: state.values.selectedAssemblies,
                initialSelections: initialQuote?.selectedAssemblies ?? [],
              });
              // Stale selections (reference gone from the catalog) are excluded from the on-screen
              // Quote Total so the figure reflects only assemblies that can still be produced.
              const { staleSelections } = resolveEffectiveBom({
                catalogAssemblies: selectedProduct.assemblies,
                selectedAssemblies: selectedSnapshots,
              });
              const staleSnapshots = new Set(staleSelections);
              const selectedAssemblies = selectedSnapshots.filter((snapshot) => !staleSnapshots.has(snapshot));
              const selectedAssemblyTotal = selectedAssemblies.reduce(
                (total, assembly) => total + assembly.quotedPrice,
                0,
              );

              return {
                deliveryIncluded,
                deliveryPrice,
                discountAmount,
                discountPercent: quotedBasePrice > 0 ? (discountAmount / quotedBasePrice) * 100 : 0,
                productPrice: quotedBasePrice,
                currencyCode: selectedProduct.currencyCode,
                selectedAssemblies,
                selectedAssemblyTotal,
                total: computeQuoteTotal({
                  deliveryIncluded,
                  deliveryPrice,
                  discountAmount,
                  quotedBasePrice,
                  selectedAssemblyPrices: selectedAssemblies.map((assembly) => assembly.quotedPrice),
                }),
              };
            }}
          >
            {(summary) => (
              <aside className="order-first grid h-fit gap-4 border-b pb-5 text-sm xl:sticky xl:top-4 xl:order-0 xl:border-b-0 xl:border-l xl:pb-0 xl:pl-5">
                <div className="grid gap-1">
                  <h3 className="font-medium text-sm">Quote total</h3>
                  <p className="font-medium text-2xl tabular-nums">
                    {summary ? formatCurrency(summary.total, summary.currencyCode) : 'Select a product'}
                  </p>
                </div>
                <div className="grid gap-2">
                  <QuoteSummaryRow
                    label="Product price"
                    value={summary ? formatCurrency(summary.productPrice, summary.currencyCode) : '-'}
                  />
                  <QuoteSummaryRow
                    label="Less discount"
                    value={
                      summary
                        ? `${formatCurrency(summary.discountAmount, summary.currencyCode)} (${formatPercent(summary.discountPercent)}%)`
                        : '-'
                    }
                  />
                  {summary && summary.selectedAssemblyTotal > 0 ? (
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
                  {summary?.deliveryIncluded ? (
                    <QuoteSummaryRow
                      label="Delivery"
                      value={formatCurrency(summary.deliveryPrice, summary.currencyCode)}
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t pt-2 font-medium">
                    <span>Total</span>
                    <span>{summary ? formatCurrency(summary.total, summary.currencyCode) : '-'}</span>
                  </div>
                </div>
              </aside>
            )}
          </form.Subscribe>
        </div>
      </FieldGroup>
      <div className="flex justify-end gap-2 border-t pt-5">
        {initialQuote ? <GenerateJobFromQuoteDialog quote={initialQuote} /> : null}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending} type="submit">
              {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
};

function QuoteDocumentsSection({ quoteId }: { quoteId: QuoteDetail['id'] }) {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId }));
  const [previewDocument, setPreviewDocument] = useState<DocumentSummary | null>(null);
  const documents = documentsQuery.data ?? [];

  return (
    <QuoteFormSection title="Quote Documents">
      <div className="overflow-hidden rounded-lg border">
        {documents.length > 0 ? (
          <div className="divide-y">
            {documents.map((document) => (
              <div
                className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_5rem] md:items-center"
                key={document.id}
              >
                <div className="flex min-w-0 items-center gap-2 font-medium">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{document.filename}</span>
                </div>
                <div className="text-muted-foreground">Rev {getQuoteDocumentRevision(document)}</div>
                <div className="text-muted-foreground">{formatBytes(document.byteSize)}</div>
                <div className="text-muted-foreground">{formatDate(document.createdAt, 'medium')}</div>
                <div className="flex justify-end gap-1">
                  <PreviewQuoteDocumentButton document={document} onPreviewDocument={setPreviewDocument} />
                  <DownloadQuoteDocumentButton document={document} quoteId={quoteId} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="bg-muted/30 p-3 text-muted-foreground text-sm">
            {documentsQuery.isLoading ? 'Loading documents...' : 'No Quote Documents captured.'}
          </p>
        )}
      </div>
      <DocumentPreviewSheet
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null);
          }
        }}
        open={Boolean(previewDocument)}
        owner={{ id: quoteId, type: 'quote' }}
      />
    </QuoteFormSection>
  );
}

function PreviewQuoteDocumentButton({
  document,
  onPreviewDocument,
}: {
  document: DocumentSummary;
  onPreviewDocument: (document: DocumentSummary) => void;
}) {
  return (
    <Button
      aria-label={`Preview ${document.filename}`}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={() => onPreviewDocument(document)}
    >
      <EyeIcon />
    </Button>
  );
}

function DownloadQuoteDocumentButton({ document, quoteId }: { document: DocumentSummary; quoteId: QuoteDetail['id'] }) {
  const showMutationError = useApiMutationErrorToast();
  const downloadMutation = useMutation({
    mutationFn: () => downloadQuoteDocument(quoteId, document),
    onError: (error) => {
      showMutationError(error, 'Unable to download document.');
    },
  });

  return (
    <Button
      aria-label={`Download ${document.filename}`}
      disabled={downloadMutation.isPending}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={() => void downloadMutation.mutateAsync()}
    >
      {downloadMutation.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
    </Button>
  );
}

function getQuoteDocumentRevision(document: DocumentSummary): number {
  return 'revision' in document.metadata ? document.metadata.revision : 1;
}

type QuoteAssembliesSelectorProps = {
  catalogAssemblies: Assembly[];
  currencyCode: string;
  initialSelections: QuoteSelectedAssembly[];
  onChange: (value: QuoteFormValues['selectedAssemblies']) => void;
  readOnly: boolean;
  value: QuoteFormValues['selectedAssemblies'];
};

const QuoteAssembliesSelector: React.FC<QuoteAssembliesSelectorProps> = ({
  catalogAssemblies,
  currencyCode,
  initialSelections,
  onChange,
  readOnly,
  value,
}) => {
  const standardAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'standard');
  const optionalAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'optional');
  const selectedSnapshots = resolveSelectedAssemblySnapshots({
    catalogAssemblies,
    formSelections: value,
    initialSelections,
  });
  const { overriddenStandardAssemblyIds, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: selectedSnapshots,
  });
  const staleSnapshots = new Set(staleSelections);
  const selectedSnapshotByCatalogId = new Map<string, SelectedAssemblySnapshot>();
  for (const snapshot of selectedSnapshots) {
    if (snapshot.productAssemblyId && !staleSnapshots.has(snapshot)) {
      selectedSnapshotByCatalogId.set(snapshot.productAssemblyId, snapshot);
    }
  }

  const setCatalogSelected = (assemblyId: string, selected: boolean) => {
    if (selected) {
      onChange([...value, { type: 'catalog', productAssemblyId: assemblyId }]);
      return;
    }

    onChange(
      value.filter((selection) => {
        if (selection.type === 'catalog') {
          return selection.productAssemblyId !== assemblyId;
        }

        const initialSelection = initialSelections.find((item) => item.id === selection.id);
        return initialSelection?.productAssemblyId !== assemblyId;
      }),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Standard</h4>
          {standardAssemblies.length === 0 ? (
            <p className="text-muted-foreground text-sm">No standard assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {standardAssemblies.map((assembly) => {
                const isOverridden = overriddenStandardAssemblyIds.has(assembly.id);

                return (
                  <div
                    className="flex h-12 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 text-sm"
                    key={assembly.id}
                  >
                    <span className={`min-w-0 truncate ${isOverridden ? 'text-muted-foreground line-through' : ''}`}>
                      {assembly.name}
                    </span>
                    {isOverridden ? <span className="text-muted-foreground text-xs">Overridden</span> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Optional</h4>
          {optionalAssemblies.length === 0 && staleSelections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No optional assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {optionalAssemblies.map((assembly) => {
                const snapshot = selectedSnapshotByCatalogId.get(assembly.id);
                const isSelected = Boolean(snapshot);
                // Selected options display their locked snapshot name/price so they don't shift
                // when the catalog assembly is later renamed or repriced.
                const displayName = snapshot?.quotedName ?? assembly.name;
                const displayPrice = snapshot?.quotedPrice ?? assembly.price;

                return (
                  <div
                    className={cn(
                      'flex h-12 items-center justify-between gap-3 rounded-md border px-3 text-sm',
                      isSelected ? 'border-primary/50 bg-primary/5' : 'bg-muted/10',
                    )}
                    key={assembly.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={readOnly}
                        onCheckedChange={(checked) => setCatalogSelected(assembly.id, checked === true)}
                      />
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatCurrency(displayPrice, currencyCode)}</span>
                  </div>
                );
              })}
              {staleSelections.map((selection) => (
                <div
                  className="flex h-12 items-center justify-between gap-3 rounded-md border border-dashed px-3 text-sm"
                  key={selection.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{selection.quotedName}</span>
                    <span className="block text-muted-foreground text-xs">Unavailable</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{formatCurrency(selection.quotedPrice, currencyCode)}</span>
                    {readOnly ? null : (
                      <Button
                        aria-label={`Remove ${selection.quotedName}`}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onChange(value.filter((item) => item.type !== 'existing' || item.id !== selection.id))
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ReadOnlyQuoteField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <div className="flex min-h-9 items-center rounded-md border bg-muted/30 px-3 text-sm">
      <span className="min-w-0 truncate">{value}</span>
    </div>
  </Field>
);

type QuoteFormSectionProps = {
  children: React.ReactNode;
  description?: string;
  title: string;
};

const QuoteFormSection: React.FC<QuoteFormSectionProps> = ({ children, description, title }) => (
  <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0">
    <div className="grid gap-1.5">
      <h3 className="flex items-center gap-2 font-heading font-medium text-base leading-tight">
        <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-primary" />
        <span>{title}</span>
      </h3>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
    {children}
  </section>
);

type QuoteSummaryRowProps = {
  className?: string;
  label: string;
  value: string;
  valueClassName?: string;
};

const QuoteSummaryRow: React.FC<QuoteSummaryRowProps> = ({ className, label, value, valueClassName }) => {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-muted-foreground', className)}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn('shrink-0 text-foreground', valueClassName)}>{value}</span>
    </div>
  );
};
