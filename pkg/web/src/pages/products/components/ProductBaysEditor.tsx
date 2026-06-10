import type { Bay, Product } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { AddBaySelect, BayRowCard } from '@/components/bays/index.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardSeparator,
  CardTitle,
} from '@/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { emptyProductFormValues, type ProductBayFormInput } from './types.js';

const DEFAULT_PRODUCT_BAY_WORKING_DAYS = 5;

type ProductBaysEditorProps = {
  onStructuralChange: () => void;
  productBays: Product['productBays'];
  productBaysField: ArrayFieldApi<ProductBayFormInput>;
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductBaysEditor: React.FC<ProductBaysEditorProps> = ({
  onStructuralChange,
  productBays,
  productBaysField,
}) => {
  const trpc = useTRPC();
  const productForm = useProductForm();
  const enabledBaysQuery = useQuery(trpc.jobs.listJobBays.queryOptions({ filters: { isDisabled: false } }));
  const enabledBays = enabledBaysQuery.data?.items ?? [];
  const selectedProductBays = productBaysField.state.value;
  const selectedBayIds = useMemo(() => new Set(selectedProductBays.map((row) => row.bayId)), [selectedProductBays]);
  const baysById = useMemo(() => {
    const next = new Map<string, Bay>();

    for (const productBay of productBays) {
      next.set(productBay.bayId, productBay.bay);
    }

    for (const bay of enabledBays) {
      next.set(bay.id, bay);
    }

    return next;
  }, [enabledBays, productBays]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bay Working Day Defaults</CardTitle>
        <CardDescription>Set the default working days for each Bay, defaults used for new Jobs.</CardDescription>
        <CardAction>
          {enabledBaysQuery.isLoading ? <Skeleton className="h-8 w-72 max-w-full" /> : null}
          {!enabledBaysQuery.isLoading && !enabledBaysQuery.error ? (
            <AddBaySelect
              bays={enabledBays}
              excludeBayIds={selectedBayIds}
              onAdd={(bay) => {
                productBaysField.pushValue({ bayId: bay.id, defaultWorkingDays: DEFAULT_PRODUCT_BAY_WORKING_DAYS });
                onStructuralChange();
              }}
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardSeparator />
      <CardContent>
        <section className="flex flex-col gap-4">
          {enabledBaysQuery.error ? (
            <ErrorMessage error={enabledBaysQuery.error} fallbackMessage="Unable to load Bays." />
          ) : null}
          {selectedProductBays.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIcon />
                <EmptyTitle>No Bay defaults added.</EmptyTitle>
                <EmptyDescription>Select a Bay from the header to add a default working days.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedProductBays.map((row, index) => {
                const bay = baysById.get(row.bayId);
                const isDisabled = Boolean(bay?.disabledAt);

                return (
                  <BayRowCard
                    bay={bay}
                    key={row.bayId}
                    onRemove={() => {
                      productBaysField.removeValue(index);
                      onStructuralChange();
                    }}
                    removeLabel={`Remove Product Bay ${index + 1}`}
                    unavailableHint="Bay must be removed"
                  >
                    {isDisabled ? (
                      <Field orientation="horizontal" className="self-center">
                        <FieldLabel>Days</FieldLabel>
                        <p className="text-sm">{row.defaultWorkingDays}</p>
                      </Field>
                    ) : (
                      <productForm.AppField name={`productBays[${index}].defaultWorkingDays`}>
                        {(field) => (
                          <field.NumberField
                            className="w-20"
                            emptyValue={Number.NaN}
                            inputMode="numeric"
                            label="Days"
                            orientation="horizontal"
                            placeholder="5"
                            fieldClassName="self-center *:data-[slot=field-label]:flex-none"
                          />
                        )}
                      </productForm.AppField>
                    )}
                  </BayRowCard>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};
