import { AuthId, CustomerCompanyName, Price, QuoteCreateInput, type QuoteDetail, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';

import { getFieldErrors } from '@/components/form/field-errors.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatCurrency, formatPercent } from '@/utils/number.js';
import { QuoteCustomerCombobox } from './QuoteCustomerCombobox.js';
import { type QuoteProductChoice, QuoteProductCombobox } from './QuoteProductCombobox.js';

const CustomerMode = z.enum(['existing', 'inline']);

type QuoteFormValues = z.infer<typeof QuoteFormValues>;
const QuoteFormValues = z
  .object({
    customerId: z.string(),
    customerMode: CustomerMode,
    discount: Price,
    inlineCompanyName: z.string(),
    notes: z.string(),
    paymentTerms: z.string(),
    productId: z.string(),
    salesPersonId: z.string(),
    validUntil: z.union([z.literal(''), z.iso.date()]),
  })
  .superRefine((value, context) => {
    if (value.customerMode === 'existing' && !UUID.safeParse(value.customerId).success) {
      context.addIssue({
        code: 'custom',
        message: 'Select a customer',
        path: ['customerId'],
      });
    }

    if (value.customerMode === 'inline' && !CustomerCompanyName.safeParse(value.inlineCompanyName).success) {
      context.addIssue({
        code: 'custom',
        message: 'Company name is required',
        path: ['inlineCompanyName'],
      });
    }

    if (value.productId !== '' && !UUID.safeParse(value.productId).success) {
      context.addIssue({
        code: 'custom',
        message: 'Select a product',
        path: ['productId'],
      });
    }

    if (value.salesPersonId !== '' && !AuthId.safeParse(value.salesPersonId).success) {
      context.addIssue({
        code: 'custom',
        message: 'Select a salesperson',
        path: ['salesPersonId'],
      });
    }

    if (value.productId === '' && value.discount !== 0) {
      context.addIssue({
        code: 'custom',
        message: 'Select a product before adding a discount',
        path: ['discount'],
      });
    }
  });

type QuoteFormProps = {
  initialQuote?: QuoteDetail | undefined;
  isPending: boolean;
  onSubmit: (value: QuoteCreateInput) => Promise<unknown>;
  submitLabel: string;
};

export const QuoteForm: React.FC<QuoteFormProps> = ({ initialQuote, isPending, onSubmit, submitLabel }) => {
  const trpc = useTRPC();
  const isEditing = Boolean(initialQuote);
  const isFrozen = initialQuote?.status !== undefined && initialQuote.status !== 'draft';
  const [selectedProduct, setSelectedProduct] = useState<QuoteProductChoice | null>(null);
  const salespeopleQuery = useQuery(trpc.quotes.salespeople.queryOptions());
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
  const salespersonOptions =
    salespeopleQuery.data?.users.map((person) => ({
      label: `${person.name} · ${person.email}`,
      value: person.id,
    })) ?? [];
  const defaultValues: QuoteFormValues = {
    customerId: initialQuote?.customerId ?? '',
    customerMode: 'existing',
    discount: initialQuote?.discount ?? 0,
    inlineCompanyName: '',
    notes: initialQuote?.notes ?? '',
    paymentTerms: initialQuote?.paymentTerms ?? '',
    productId: initialQuote?.productId ?? '',
    salesPersonId: initialQuote?.salesPersonId ?? '',
    validUntil: initialQuote?.validUntil ?? '',
  };
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: QuoteFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(
        QuoteCreateInput.parse({
          customer:
            value.customerMode === 'existing'
              ? {
                  type: 'existing',
                  customerId: value.customerId,
                }
              : {
                  type: 'inline',
                  companyName: value.inlineCompanyName,
                },
          discount: value.discount,
          notes: value.notes,
          paymentTerms: value.paymentTerms,
          productId: value.productId || null,
          salesPersonId: value.salesPersonId || null,
          validUntil: value.validUntil || null,
        }),
      );
    },
  });
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
      {isFrozen ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
          Sent quotes are read-only. Create a new draft quote for revised terms.
        </div>
      ) : null}
      <FieldGroup>
        {isEditing ? (
          <form.Field name="customerId">
            {(field) => {
              const fieldErrors = getFieldErrors(field.state.meta.errors);
              const isInvalid = fieldErrors.length > 0;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Customer</FieldLabel>
                  <QuoteCustomerCombobox
                    disabled={isFrozen}
                    fallbackCustomer={fallbackCustomer}
                    onSelected={(customer) => field.handleChange(customer?.id ?? '')}
                    value={field.state.value}
                  />
                  <FieldError errors={fieldErrors} />
                </Field>
              );
            }}
          </form.Field>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <form.AppField name="customerMode">
              {(field) => (
                <field.SelectField
                  disabled={isFrozen}
                  label="Customer"
                  options={[
                    { label: 'Existing customer', value: 'existing' },
                    { label: 'New company name', value: 'inline' },
                  ]}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.customerMode}>
              {(customerMode) =>
                customerMode === 'existing' ? (
                  <form.Field name="customerId">
                    {(field) => {
                      const fieldErrors = getFieldErrors(field.state.meta.errors);
                      const isInvalid = fieldErrors.length > 0;

                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor={field.name}>Existing customer</FieldLabel>
                          <QuoteCustomerCombobox
                            disabled={isFrozen}
                            fallbackCustomer={fallbackCustomer}
                            onSelected={(customer) => field.handleChange(customer?.id ?? '')}
                            value={field.state.value}
                          />
                          <FieldError errors={fieldErrors} />
                        </Field>
                      );
                    }}
                  </form.Field>
                ) : (
                  <form.AppField name="inlineCompanyName">
                    {(field) => <field.TextField disabled={isFrozen} label="Company name" />}
                  </form.AppField>
                )
              }
            </form.Subscribe>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <form.Field name="productId">
            {(field) => {
              const fieldErrors = getFieldErrors(field.state.meta.errors);
              const isInvalid = fieldErrors.length > 0;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Product</FieldLabel>
                  <QuoteProductCombobox
                    disabled={isFrozen}
                    onSelected={(product) => {
                      const productId = product?.id ?? '';

                      if (field.state.value !== productId) {
                        field.handleChange(productId);
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
          <form.AppField name="salesPersonId">
            {(field) => (
              <field.SelectField
                disabled={isFrozen}
                label="Salesperson"
                options={salespersonOptions}
                placeholder="Select salesperson"
              />
            )}
          </form.AppField>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <form.AppField name="discount">
            {(field) => (
              <field.CurrencyField
                {...(selectedProduct ? { currencyCode: selectedProduct.currencyCode } : {})}
                disabled={isFrozen || !selectedProduct}
                label="Discount"
              />
            )}
          </form.AppField>
          <form.AppField name="validUntil">
            {(field) => <field.DatePickerField clearable disabled={isFrozen} label="Valid until" />}
          </form.AppField>
          <form.Subscribe
            selector={(state) => {
              if (!selectedProduct) {
                return null;
              }

              const discount = state.values.discount;

              return {
                discount,
                discountPercent: selectedProduct.basePrice > 0 ? (discount / selectedProduct.basePrice) * 100 : 0,
                productPrice: selectedProduct.basePrice,
                currencyCode: selectedProduct.currencyCode,
                total: Math.max(0, selectedProduct.basePrice - discount),
              };
            }}
          >
            {(summary) => (
              <div className="grid gap-2 rounded-md border p-3 text-sm">
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
                <div className="flex items-center justify-between gap-3 border-t pt-2 font-medium">
                  <span>Total</span>
                  <span>{summary ? formatCurrency(summary.total, summary.currencyCode) : 'Select a product'}</span>
                </div>
              </div>
            )}
          </form.Subscribe>
        </div>
        <form.AppField name="notes">
          {(field) => <field.TextareaField disabled={isFrozen} label="Notes" rows={4} />}
        </form.AppField>
        <form.AppField name="paymentTerms">
          {(field) => <field.TextareaField disabled={isFrozen} label="Payment Terms" rows={4} />}
        </form.AppField>
      </FieldGroup>
      <div className="flex justify-end">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending || isFrozen} type="submit">
              {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
};

type QuoteSummaryRowProps = {
  label: string;
  value: string;
};

const QuoteSummaryRow: React.FC<QuoteSummaryRowProps> = ({ label, value }) => {
  return (
    <div className="flex items-center justify-between gap-3 text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
};
