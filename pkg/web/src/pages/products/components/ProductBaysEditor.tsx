import { departmentLabels, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import type { Bay, Product } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { emptyProductFormValues, type ProductBayFormInput } from './types.js';

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);
const jobDepartmentOrder = new Map(jobDepartments.map((department, index) => [department, index]));
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
  const [selectedAddBayId, setSelectedAddBayId] = useState('');
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
  const availableBays = useMemo(
    () =>
      enabledBays
        .filter((bay) => !selectedBayIds.has(bay.id))
        .sort((left, right) => {
          const departmentSort =
            (jobDepartmentOrder.get(left.department) ?? Number.MAX_SAFE_INTEGER) -
            (jobDepartmentOrder.get(right.department) ?? Number.MAX_SAFE_INTEGER);

          if (departmentSort !== 0) {
            return departmentSort;
          }

          return left.name.localeCompare(right.name);
        }),
    [enabledBays, selectedBayIds],
  );
  const selectedAddBay = availableBays.find((bay) => bay.id === selectedAddBayId);
  const handleAddBay = () => {
    if (!selectedAddBayId) {
      return;
    }

    productBaysField.pushValue({ bayId: selectedAddBayId, defaultWorkingDays: DEFAULT_PRODUCT_BAY_WORKING_DAYS });
    setSelectedAddBayId('');
    onStructuralChange();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bay Estimates</CardTitle>
        <CardDescription>Default Job duration estimates by Bay.</CardDescription>
        <CardAction>
          {enabledBaysQuery.isLoading ? <Skeleton className="h-8 w-72 max-w-full" /> : null}
          {!enabledBaysQuery.isLoading && !enabledBaysQuery.error ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Select onValueChange={(value) => setSelectedAddBayId(value ?? '')} value={selectedAddBayId}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder={availableBays.length === 0 ? 'No Bays available' : 'Select Bay'}>
                    {selectedAddBay ? `${selectedAddBay.name} - ${departmentLabels[selectedAddBay.department]}` : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableBays.map((bay) => (
                      <SelectItem key={bay.id} value={bay.id}>
                        {bay.name} - {departmentLabels[bay.department]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button disabled={!selectedAddBayId} onClick={handleAddBay} type="button" variant="outline">
                <IconPlus data-icon="inline-start" />
                Add
              </Button>
            </div>
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
                <EmptyTitle>No Bay estimates added.</EmptyTitle>
                <EmptyDescription>Select a Bay from the header to add a default estimate.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedProductBays.map((row, index) => {
                const bay = baysById.get(row.bayId);
                const isDisabled = Boolean(bay?.disabledAt);

                return (
                  <Card key={row.bayId} size="sm">
                    <CardContent>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem_auto]">
                        <div className="min-w-0 self-center">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{bay?.name ?? 'Unavailable Bay'}</span>
                            {isDisabled ? <Badge variant="outline">Disabled</Badge> : null}
                          </div>
                          <p className="text-muted-foreground text-xs">
                            {bay ? departmentLabels[bay.department] : 'Bay must be removed'}
                          </p>
                        </div>
                        {isDisabled ? (
                          <Field orientation="horizontal" className="self-center">
                            <FieldLabel>Default days</FieldLabel>
                            <p className="text-sm">{row.defaultWorkingDays}</p>
                          </Field>
                        ) : (
                          <productForm.AppField name={`productBays[${index}].defaultWorkingDays`}>
                            {(field) => (
                              <field.NumberField
                                className="w-20"
                                emptyValue={Number.NaN}
                                inputMode="numeric"
                                label="Default days"
                                orientation="horizontal"
                                placeholder="5"
                                fieldClassName="self-center *:data-[slot=field-label]:flex-none"
                              />
                            )}
                          </productForm.AppField>
                        )}
                        <Button
                          aria-label={`Remove Product Bay ${index + 1}`}
                          className="self-center"
                          onClick={() => {
                            productBaysField.removeValue(index);
                            onStructuralChange();
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <IconTrash />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
};
