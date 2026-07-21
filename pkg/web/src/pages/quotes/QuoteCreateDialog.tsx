import { quoteStatusLabels } from '@pkg/domain';
import { type Quote, QuoteStatus } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { CreateEntityDialog } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useProductRangeForQuoteOptions, useSalesPersonOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteCustomerCombobox } from './components/QuoteCustomerCombobox.js';
import { QuoteProductCombobox } from './components/QuoteProductCombobox.js';
import { QUOTE_CREATE_DEFAULT_VALUES, QuoteCreateFormValues, toQuoteCreateInput } from './components/types.js';

const ALL_RANGES_SELECT_VALUE = 'all-ranges';

type QuoteCreateDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const QuoteCreateDialog: React.FC<QuoteCreateDialogProps> = ({ onOpenChange, open }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateQuotes } = useQueryInvalidation();
  const currentUserQuery = useQuery(trpc.auth.me.queryOptions());
  const productRangeOptions = useProductRangeForQuoteOptions();
  const salespeopleOptions = useSalesPersonOptions();
  const showMutationError = useApiMutationErrorToast();

  const defaultValues = useMemo((): QuoteCreateFormValues => {
    const currentUser = currentUserQuery.data;

    return {
      ...QUOTE_CREATE_DEFAULT_VALUES,
      salesPersonId: currentUser?.role === 'admin' || currentUser?.role === 'sales' ? currentUser.id : '',
    };
  }, [currentUserQuery.data]);

  const createQuoteMutation = useMutation(
    trpc.quotes.create.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to create quote.');
      },
    }),
  );

  return (
    <CreateEntityDialog
      defaultValues={defaultValues}
      key={open ? 'open' : 'closed'}
      onCreate={(values) => createQuoteMutation.mutateAsync(toQuoteCreateInput(values))}
      onCreated={async (quote: Quote) => {
        await invalidateQuotes();
        onOpenChange(false);
        toast.success('Quote created');
        await navigate({ params: { id: quote.id }, to: '/quotes/$id/edit' });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Save"
      title="New quote"
      validator={QuoteCreateFormValues}
    >
      {(form) => (
        <div className="grid gap-4">
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
          <form.AppField name="kind">
            {(field) => (
              <field.SelectField
                label="Kind"
                options={[
                  { label: 'Product', value: 'product' },
                  { label: 'Custom', value: 'custom' },
                ]}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.kind}>
            {(kind) =>
              kind === 'product' ? (
                <form.Field name="rangeId">
                  {(field) => {
                    const selectedRange = productRangeOptions.items.find((range) => range.id === field.state.value);

                    return (
                      <Field>
                        <FieldLabel htmlFor={field.name}>Range</FieldLabel>
                        <Select
                          disabled={productRangeOptions.isPending}
                          onValueChange={(value) => {
                            field.handleChange(value === ALL_RANGES_SELECT_VALUE ? '' : (value ?? ''));
                          }}
                          value={field.state.value || ALL_RANGES_SELECT_VALUE}
                        >
                          <SelectTrigger id={field.name} className="w-full">
                            <SelectValue
                              placeholder={productRangeOptions.isPending ? 'Loading ranges...' : 'All ranges'}
                            >
                              {field.state.value ? selectedRange?.name : 'All ranges'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value={ALL_RANGES_SELECT_VALUE}>All ranges</SelectItem>
                              {productRangeOptions.items.map((range) => (
                                <SelectItem key={range.id} value={range.id}>
                                  {range.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    );
                  }}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
          <form.Subscribe selector={(state) => ({ kind: state.values.kind, rangeId: state.values.rangeId })}>
            {({ kind, rangeId }) =>
              kind === 'product' ? (
                <form.Field name="productId">
                  {(field) => {
                    const fieldErrors = getFieldErrors(field.state.meta.errors);
                    const isInvalid = fieldErrors.length > 0;

                    return (
                      <Field data-invalid={isInvalid}>
                        <FieldLabel htmlFor={field.name}>Product</FieldLabel>
                        <QuoteProductCombobox
                          disabled={false}
                          onSelected={(product) => field.handleChange(product?.id ?? '')}
                          rangeId={rangeId}
                          value={field.state.value}
                        />
                        <FieldError errors={fieldErrors} />
                      </Field>
                    );
                  }}
                </form.Field>
              ) : (
                <div className="grid gap-4">
                  <form.AppField name="workTitle">
                    {(field) => <field.TextField autoComplete="off" label="Work title" />}
                  </form.AppField>
                  <form.AppField name="basePrice">
                    {(field) => (
                      <field.CurrencyField
                        autoComplete="off"
                        currencyCode="ZAR"
                        label="Base price"
                        placeholder="R120,000"
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="hourlyRate">
                    {(field) => (
                      <field.CurrencyField
                        autoComplete="off"
                        currencyCode="ZAR"
                        label="Hourly rate"
                        placeholder="R850"
                      />
                    )}
                  </form.AppField>
                </div>
              )
            }
          </form.Subscribe>
          <form.AppField name="salesPersonId">
            {(field) => (
              <field.SelectField
                label="Salesperson"
                options={salespeopleOptions.selectOptions}
                placeholder="Select salesperson"
              />
            )}
          </form.AppField>
          <form.AppField name="status">
            {(field) => (
              <field.SelectField
                label="Status"
                options={QuoteStatus.options.map((status) => ({
                  label: quoteStatusLabels[status],
                  value: status,
                }))}
              />
            )}
          </form.AppField>
        </div>
      )}
    </CreateEntityDialog>
  );
};
