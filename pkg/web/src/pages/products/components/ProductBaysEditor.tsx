import { departmentLabels, JOB_DEPARTMENT_PIPELINE } from '@pkg/domain';
import type { Bay, Product } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DepartmentIcon } from '@/components/departments/index.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { FieldLabel } from '@/components/ui/field.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { emptyProductFormValues, type ProductBayFormInput } from './types.js';

const jobDepartments = JOB_DEPARTMENT_PIPELINE.map((step) => step.department);

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
  const groupedAvailableBays = useMemo(
    () =>
      jobDepartments.map((department) => ({
        bays: enabledBays
          .filter((bay) => bay.department === department && !selectedBayIds.has(bay.id))
          .sort((left, right) => left.name.localeCompare(right.name)),
        department,
      })),
    [enabledBays, selectedBayIds],
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium text-sm">Product Bays</h3>
      </div>
      {selectedProductBays.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Product Bays added.</p>
      ) : (
        <div className="divide-y rounded-md border border-border/70">
          {selectedProductBays.map((row, index) => {
            const bay = baysById.get(row.bayId);
            const isDisabled = Boolean(bay?.disabledAt);

            return (
              <div key={row.bayId} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
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
                  <div className="self-center">
                    <FieldLabel>Default days</FieldLabel>
                    <p className="text-sm">{row.defaultWorkingDays}</p>
                  </div>
                ) : (
                  <productForm.AppField name={`productBays[${index}].defaultWorkingDays`}>
                    {(field) => (
                      <field.NumberField
                        emptyValue={Number.NaN}
                        inputMode="numeric"
                        label="Default days"
                        placeholder="5"
                      />
                    )}
                  </productForm.AppField>
                )}
                <Button
                  aria-label={`Remove Product Bay ${index + 1}`}
                  className="self-end"
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
            );
          })}
        </div>
      )}
      <div className="space-y-2">
        <p className="font-medium text-sm">Add Bay</p>
        {enabledBaysQuery.isLoading ? <Skeleton className="h-24" /> : null}
        {enabledBaysQuery.error ? (
          <ErrorMessage error={enabledBaysQuery.error} fallbackMessage="Unable to load Bays." />
        ) : null}
        {!enabledBaysQuery.isLoading && !enabledBaysQuery.error ? (
          <ScrollArea className="max-h-64 rounded-md border border-border/70">
            <div className="space-y-4 p-3">
              {groupedAvailableBays.map(({ bays, department }) => (
                <div key={department} className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs">
                    <DepartmentIcon className="size-3.5" department={department} />
                    <span>{departmentLabels[department]}</span>
                  </div>
                  {bays.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No available Bays.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {bays.map((bay) => (
                        <Button
                          key={bay.id}
                          onClick={() => {
                            productBaysField.pushValue({ bayId: bay.id, defaultWorkingDays: Number.NaN });
                            onStructuralChange();
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <IconPlus data-icon="inline-start" />
                          {bay.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : null}
      </div>
    </section>
  );
};
