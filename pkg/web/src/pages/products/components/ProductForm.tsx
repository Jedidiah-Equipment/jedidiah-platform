import { departmentLabels } from '@pkg/domain';
import {
  DEPARTMENTS,
  Department,
  Price,
  type Product,
  ProductModelCode,
  ProductName,
  ProductOptionCode,
  ProductOptionName,
  type Station,
  UUID,
} from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';
import { DepartmentIcon } from '@/components/departments/index.js';
import { useAppForm } from '@/components/form/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

type DepartmentConfigFormValues = z.infer<typeof DepartmentConfigFormValues>;
const DepartmentConfigFormValues = z.object({
  department: Department,
  durationDays: z.number().int().min(0),
  defaultStationIds: z.array(UUID),
});

type ProductFormValues = z.infer<typeof ProductFormValues>;
const ProductFormValues = z.object({
  basePrice: Price,
  description: z.string(),
  departmentConfigs: z.array(DepartmentConfigFormValues),
  modelCode: ProductModelCode,
  name: ProductName,
  options: z.array(
    z.object({
      id: UUID.optional(),
      name: ProductOptionName,
      code: ProductOptionCode,
      price: Price,
    }),
  ),
});

type ProductFormProps = {
  initialProduct?: Product;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductFormValues) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({ initialProduct, isPending, submitLabel, onSubmit }) => {
  const trpc = useTRPC();
  const stationsQuery = useQuery(trpc.stations.list.queryOptions({}));

  const defaultValues: ProductFormValues = {
    basePrice: initialProduct?.basePrice ?? NaN,
    description: initialProduct?.description ?? '',
    departmentConfigs: buildDepartmentConfigDefaults(initialProduct),
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
    options:
      initialProduct?.options.map((option) => ({
        id: option.id,
        code: option.code,
        name: option.name,
        price: option.price,
      })) ?? [],
  };

  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: ProductFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
        <form.AppField name="modelCode">
          {(field) => <field.TextField autoComplete="off" label="Model code" />}
        </form.AppField>
        <form.AppField name="basePrice">
          {(field) => (
            <field.CurrencyField autoComplete="off" currencyCode="ZAR" label="Base price" placeholder="1234.56" />
          )}
        </form.AppField>
        <form.AppField name="description">
          {(field) => <field.TextareaField label="Description" rows={4} />}
        </form.AppField>
        <form.Field name="departmentConfigs" mode="array">
          {(field) => (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-medium">Production defaults</h2>
              {stationsQuery.isPending ? <Skeleton className="h-32 w-full" /> : null}
              <div className="grid gap-3 xl:grid-cols-2">
                {field.state.value.map((config, index) => {
                  const activeStations = filterActiveStations(stationsQuery.data ?? [], config.department);

                  return (
                    <DepartmentConfigFields
                      activeStations={activeStations}
                      config={config}
                      key={config.department}
                      renderDurationField={() => (
                        <form.AppField name={`departmentConfigs[${index}].durationDays`}>
                          {(durationField) => (
                            <durationField.NumberField
                              autoComplete="off"
                              emptyValue={0}
                              label="Est. Duration (days)"
                              min={0}
                              placeholder="0"
                            />
                          )}
                        </form.AppField>
                      )}
                      renderStationIdsField={() => (
                        <form.Field name={`departmentConfigs[${index}].defaultStationIds`}>
                          {(stationIdsField) => (
                            <DepartmentStationPicker
                              activeStations={activeStations}
                              allStations={stationsQuery.data ?? []}
                              selectedStationIds={stationIdsField.state.value}
                              onSelectedStationIdsChange={stationIdsField.handleChange}
                            />
                          )}
                        </form.Field>
                      )}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </form.Field>
        <form.Field name="options" mode="array">
          {(field) => (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Options</h2>
                <Button
                  onClick={() => field.pushValue({ name: '', code: '', price: NaN })}
                  type="button"
                  variant="outline"
                >
                  <PlusIcon data-icon="inline-start" />
                  Add option
                </Button>
              </div>
              {field.state.value.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {field.state.value.map((option, index) => (
                    <ProductOptionRow
                      index={index}
                      key={option.id ?? index}
                      onRemove={() => field.removeValue(index)}
                      renderCodeField={() => (
                        <form.AppField name={`options[${index}].code`}>
                          {(optionField) => <optionField.TextField autoComplete="off" label="Code" />}
                        </form.AppField>
                      )}
                      renderNameField={() => (
                        <form.AppField name={`options[${index}].name`}>
                          {(optionField) => <optionField.TextField autoComplete="off" label="Name" />}
                        </form.AppField>
                      )}
                      renderPriceField={() => (
                        <form.AppField name={`options[${index}].price`}>
                          {(optionField) => (
                            <optionField.CurrencyField
                              autoComplete="off"
                              currencyCode="ZAR"
                              label="Price"
                              placeholder="1234.56"
                            />
                          )}
                        </form.AppField>
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </form.Field>
      </FieldGroup>
      <div className="mt-4 flex justify-end gap-2">
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

function buildDepartmentConfigDefaults(initialProduct: Product | undefined): ProductFormValues['departmentConfigs'] {
  const configsByDepartment = new Map(
    (initialProduct?.departmentConfigs ?? []).map((config) => [config.department, config]),
  );

  return DEPARTMENTS.map((department) => ({
    defaultStationIds: configsByDepartment.get(department)?.defaultStationIds ?? [],
    department,
    durationDays: configsByDepartment.get(department)?.durationDays ?? 0,
  }));
}

function filterActiveStations(stations: readonly Station[], department: Department): Station[] {
  return stations.filter((station) => station.department === department && station.isActive);
}

type DepartmentConfigFieldsProps = {
  activeStations: readonly Station[];
  config: DepartmentConfigFormValues;
  renderDurationField: () => React.ReactNode;
  renderStationIdsField: () => React.ReactNode;
};

const DepartmentConfigFields: React.FC<DepartmentConfigFieldsProps> = ({
  activeStations,
  config,
  renderDurationField,
  renderStationIdsField,
}) => (
  <section className="rounded-md border p-3">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <DepartmentIcon className="size-4 shrink-0 text-muted-foreground" department={config.department} />
        <h3 className="truncate text-sm font-medium">{departmentLabels[config.department]}</h3>
      </div>
      <Badge variant="outline">{activeStations.length}</Badge>
    </div>
    <div className="grid gap-3 md:grid-cols-[9rem_minmax(0,1fr)]">
      {renderDurationField()}
      {renderStationIdsField()}
    </div>
  </section>
);

type DepartmentStationPickerProps = {
  activeStations: readonly Station[];
  allStations: readonly Station[];
  selectedStationIds: readonly UUID[];
  onSelectedStationIdsChange: (stationIds: UUID[]) => void;
};

const DepartmentStationPicker: React.FC<DepartmentStationPickerProps> = ({
  activeStations,
  allStations,
  selectedStationIds,
  onSelectedStationIdsChange,
}) => {
  const selectedStationIdSet = new Set(selectedStationIds);
  const inactiveSelectedStations = allStations.filter(
    (station) => selectedStationIdSet.has(station.id) && !station.isActive,
  );

  const setStationSelected = (stationId: UUID, selected: boolean) => {
    const nextStationIds = selected
      ? [...selectedStationIds, stationId]
      : selectedStationIds.filter((selectedStationId) => selectedStationId !== stationId);

    onSelectedStationIdsChange([...new Set(nextStationIds)]);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Default stations</Label>
      <div className="flex min-h-10 flex-wrap gap-2 rounded-md border p-2">
        {activeStations.map((station) => (
          <label
            className="flex items-center gap-2 rounded-sm bg-muted px-2 py-1 text-sm"
            htmlFor={`product-default-station-${station.id}`}
            key={station.id}
          >
            <Checkbox
              checked={selectedStationIdSet.has(station.id)}
              id={`product-default-station-${station.id}`}
              onCheckedChange={(checked) => setStationSelected(station.id, checked === true)}
            />
            <span>{station.name}</span>
          </label>
        ))}
        {activeStations.length === 0 ? <span className="text-sm text-muted-foreground">No active stations</span> : null}
      </div>
      {inactiveSelectedStations.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {inactiveSelectedStations.map((station) => (
            <Badge className="gap-1 pr-1" key={station.id} variant="secondary">
              {station.name} inactive
              <Button
                aria-label={`Remove inactive station ${station.name}`}
                onClick={() => setStationSelected(station.id, false)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
};

type ProductOptionRowProps = {
  index: number;
  onRemove: () => void;
  renderCodeField: () => React.ReactNode;
  renderNameField: () => React.ReactNode;
  renderPriceField: () => React.ReactNode;
};

const ProductOptionRow: React.FC<ProductOptionRowProps> = ({
  index,
  onRemove,
  renderCodeField,
  renderNameField,
  renderPriceField,
}) => {
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.6fr)_minmax(10rem,0.6fr)_auto] md:items-start">
      {renderNameField()}
      {renderCodeField()}
      {renderPriceField()}
      <Button
        aria-label={`Remove option ${index + 1}`}
        className="self-end"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="outline"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
};
