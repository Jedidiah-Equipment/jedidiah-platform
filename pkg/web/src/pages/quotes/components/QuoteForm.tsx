import { computeQuoteTotal } from '@pkg/domain';
import {
  type Assembly,
  type QuoteCreateInput,
  type QuoteDetail,
  type QuoteSelectedAssembly,
  QuoteStatus,
  type QuoteUpdateInput,
} from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon, XIcon } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getFieldErrors } from '@/components/form/field-errors.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { formatCurrency, formatPercent } from '@/utils/number.js';
import { GenerateJobFromQuoteDialog } from './GenerateJobFromQuoteDialog.js';
import { QuoteCustomerCombobox } from './QuoteCustomerCombobox.js';
import { type QuoteProductChoice, QuoteProductCombobox } from './QuoteProductCombobox.js';
import { quoteStatusLabels } from './QuoteStatusBadge.js';
import {
  getOverriddenStandardAssemblyIds,
  QuoteFormValues,
  resolveSelectedAssemblySnapshots,
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
      <FieldGroup>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
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
            <form.AppField name="preferredDeliveryDate">
              {(field) => <field.DatePickerField clearable label="Preferred delivery date" />}
            </form.AppField>
            <form.AppField name="plannedDeliveryDate">
              {(field) => <field.DatePickerField clearable label="Planned delivery date" />}
            </form.AppField>
            <form.AppField name="validUntil">
              {(field) => <field.DatePickerField clearable label="Valid until" />}
            </form.AppField>
            <form.AppField name="discount">
              {(field) => (
                <field.CurrencyField
                  {...(selectedProduct ? { currencyCode: selectedProduct.currencyCode } : {})}
                  disabled={isLocked || !selectedProduct}
                  label="Discount"
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
            <form.Field name="deliveryIncluded">
              {(field) => {
                const fieldErrors = getFieldErrors(field.state.meta.errors);
                const isInvalid = fieldErrors.length > 0;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel aria-hidden className="invisible">
                      Delivery
                    </FieldLabel>
                    <div className="flex min-h-8 items-center gap-2">
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
            <div className="md:col-span-2">
              <form.AppField name="paymentTerms">
                {(field) => <field.TextareaField label="Payment Terms" rows={4} />}
              </form.AppField>
            </div>
            <div className="md:col-span-2">
              <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
            </div>
          </div>
          <form.Subscribe
            selector={(state) => {
              if (!selectedProduct) {
                return null;
              }

              const discount = state.values.discount;
              const deliveryIncluded = state.values.deliveryIncluded;
              const deliveryPrice = deliveryIncluded ? state.values.deliveryPrice : 0;
              const quotedBasePrice =
                initialQuote?.productId === selectedProduct.id
                  ? initialQuote.quotedBasePrice
                  : selectedProduct.basePrice;
              const selectedAssemblies = resolveSelectedAssemblySnapshots({
                catalogAssemblies: selectedProduct.assemblies,
                formSelections: state.values.selectedAssemblies,
                initialSelections: initialQuote?.selectedAssemblies ?? [],
              });
              const selectedAssemblyTotal = selectedAssemblies.reduce(
                (total, assembly) => total + assembly.quotedPrice,
                0,
              );

              return {
                deliveryIncluded,
                deliveryPrice,
                discount,
                discountPercent: quotedBasePrice > 0 ? (discount / quotedBasePrice) * 100 : 0,
                productPrice: quotedBasePrice,
                currencyCode: selectedProduct.currencyCode,
                selectedAssemblies,
                selectedAssemblyTotal,
                total: computeQuoteTotal({
                  deliveryIncluded,
                  deliveryPrice,
                  discount,
                  quotedBasePrice,
                  selectedAssemblyPrices: selectedAssemblies.map((assembly) => assembly.quotedPrice),
                }),
              };
            }}
          >
            {(summary) => (
              <div className="grid h-fit gap-2 rounded-md border p-3 text-sm">
                <QuoteSummaryRow
                  label="Product price"
                  value={summary ? formatCurrency(summary.productPrice, summary.currencyCode) : '-'}
                />
                <QuoteSummaryRow
                  label="Less discount"
                  value={
                    summary
                      ? `${formatCurrency(summary.discount, summary.currencyCode)} (${formatPercent(summary.discountPercent)}%)`
                      : '-'
                  }
                />
                {summary && summary.selectedAssemblyTotal > 0 ? (
                  <div className="grid gap-1">
                    <QuoteSummaryRow
                      label="Optional assemblies"
                      value={formatCurrency(summary.selectedAssemblyTotal, summary.currencyCode)}
                    />
                    <div className="grid gap-1 pl-3">
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
                  <span>{summary ? formatCurrency(summary.total, summary.currencyCode) : 'Select a product'}</span>
                </div>
              </div>
            )}
          </form.Subscribe>
        </div>
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
            ) : null
          }
        </form.Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
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
  const selectedCatalogAssemblyIds = new Set(
    selectedSnapshots
      .map((selection) => selection.productAssemblyId)
      .filter((productAssemblyId): productAssemblyId is string => Boolean(productAssemblyId)),
  );
  const overriddenStandardAssemblyIds = getOverriddenStandardAssemblyIds(catalogAssemblies, selectedCatalogAssemblyIds);
  const staleSelections = selectedSnapshots.filter((selection) => !selection.productAssemblyId);

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
    <div className="grid gap-3 rounded-md border p-3">
      <div className="grid gap-1">
        <h3 className="font-medium text-sm">Assemblies</h3>
        <p className="text-muted-foreground text-sm">
          Standard assemblies are included. Optional assemblies add to the quote.
        </p>
      </div>
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
                    className="flex h-12 items-center justify-between gap-3 rounded-md border px-3 text-sm"
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
                const isSelected = selectedCatalogAssemblyIds.has(assembly.id);

                return (
                  <div
                    className="flex h-12 items-center justify-between gap-3 rounded-md border px-3 text-sm"
                    key={assembly.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={readOnly}
                        onCheckedChange={(checked) => setCatalogSelected(assembly.id, checked === true)}
                      />
                      <span className="truncate">{assembly.name}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatCurrency(assembly.price, currencyCode)}
                    </span>
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
