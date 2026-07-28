import { useDebouncedValue } from '@mantine/hooks';
import { getPlantDateNow } from '@pkg/domain';
import type { ProductUnitDetail } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox.js';
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { type CustomerOption, useCustomerOptions } from '@/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  createUnitTransferFormValues,
  toProductUnitTransferInput,
  UnitTransferFormValues,
} from './unit-transfer-form.js';

type UnitTransferDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  unit: ProductUnitDetail;
};

/**
 * Records a machine changing hands with no sale by us behind it. The date is the day it happened, which
 * can be long past, but never earlier than the machine's last known move and never later than today.
 */
export const UnitTransferDialog: React.FC<UnitTransferDialogProps> = ({ onOpenChange, open, unit }) => {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateProductUnits } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const transferMutation = useMutation(
    trpc.productUnits.transfer.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to record transfer.');
      },
    }),
  );
  const latestTransferDate = unit.ownershipHistory.at(-1)?.occurredOn;

  return (
    <CreateEntityDialog
      defaultValues={createUnitTransferFormValues()}
      description="Records that this machine changed hands. No quote, price, or salesperson is involved, and nothing reaches sales figures."
      key={open ? 'open' : 'closed'}
      onCreate={(values) => transferMutation.mutateAsync(toProductUnitTransferInput(unit.id, values))}
      onCreated={async () => {
        // Every Job bound to the machine displays its Owner, so they go stale the moment it moves.
        await Promise.all([invalidateProductUnits(), invalidateJobs()]);
        onOpenChange(false);
        toast.success('Transfer recorded');
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Record transfer"
      title="Record ownership transfer"
      validator={UnitTransferFormValues}
    >
      {(form) => (
        <div className="grid gap-4">
          {/* A machine we already hold can only move out to a Customer, so it is offered no destination. */}
          {unit.owner ? (
            <form.AppField name="destination">
              {(field) => (
                <field.SelectField
                  label="Transfer to"
                  options={[
                    { label: 'Another customer', value: 'customer' },
                    { label: 'Stock — returned to us', value: 'stock' },
                  ]}
                />
              )}
            </form.AppField>
          ) : null}
          <form.Subscribe selector={(state) => state.values.destination}>
            {(destination) =>
              destination === 'customer' ? (
                <form.Field name="toCustomerId">
                  {(field) => {
                    const fieldErrors = getFieldErrors(field.state.meta.errors);

                    return (
                      <Field data-invalid={fieldErrors.length > 0}>
                        <FieldLabel htmlFor="unit-transfer-customer">New owner</FieldLabel>
                        <UnitTransferCustomerCombobox
                          onSelected={(customer) => field.handleChange(customer?.id ?? '')}
                          value={field.state.value}
                        />
                        <FieldError errors={fieldErrors} />
                      </Field>
                    );
                  }}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
          <form.AppField name="occurredOn">
            {(field) => (
              <field.DatePickerField
                label="Date it happened"
                maxValue={getPlantDateNow()}
                {...(latestTransferDate ? { minValue: latestTransferDate } : {})}
              />
            )}
          </form.AppField>
          <form.AppField name="note">
            {(field) => <field.TextareaField label="Note" placeholder="How we learned of this transfer…" rows={3} />}
          </form.AppField>
        </div>
      )}
    </CreateEntityDialog>
  );
};

const UnitTransferCustomerCombobox: React.FC<{
  onSelected: (customer: CustomerOption | null) => void;
  value: string;
}> = ({ onSelected, value }) => {
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const customers = useCustomerOptions({ pageSize: 20, search: debouncedSearch, value });
  const selected = customers.itemsWithSelected.find((customer) => customer.id === value) ?? null;

  return (
    <Combobox
      filter={null}
      inputValue={search || (selected?.companyName ?? '')}
      itemToStringLabel={(customer: CustomerOption) => customer.companyName}
      itemToStringValue={(customer: CustomerOption) => customer.id}
      items={customers.itemsWithSelected}
      onInputValueChange={(nextInputValue, eventDetails) => {
        if (eventDetails.reason === 'item-press') return;

        setSearch(nextInputValue);
      }}
      onValueChange={(customer: CustomerOption | null) => {
        onSelected(customer);
        setSearch('');
      }}
      value={selected}
    >
      <ComboboxInput
        className="w-full"
        id="unit-transfer-customer"
        placeholder={customers.isFetching ? 'Searching customers...' : 'Search customers'}
        showClear
      />
      <ComboboxContent>
        <ComboboxEmpty>No customers found</ComboboxEmpty>
        <ComboboxList>
          {(customer: CustomerOption) => (
            <ComboboxItem key={customer.id} value={customer}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{customer.companyName}</span>
                {customer.email ? (
                  <span className="truncate text-muted-foreground text-xs">{customer.email}</span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
};
