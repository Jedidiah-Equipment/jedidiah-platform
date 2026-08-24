import { departmentLabels, WORK_ITEM_DEPARTMENTS } from '@pkg/domain';
import type { ProductLaborHour, ProductMaterialLine, WorkItemDepartment } from '@pkg/schema';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useMemo, useState } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi } from '@/components/form/types.js';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { usePartOptions } from '@/hooks/options/index.js';
import { formatPurchaseUnitLabel } from '@/utils/part-quantity-format.js';
import { emptyProductFormValues, rawMaterialPlaceholder, toProductRawMaterialOptions } from './types.js';

type ProductCostingEditorProps = {
  laborHoursField: ArrayFieldApi<ProductLaborHour>;
  materialLinesField: ArrayFieldApi<ProductMaterialLine>;
  onStructuralChange: () => void;
};

function useProductForm() {
  return useTypedAppFormContext({ defaultValues: emptyProductFormValues });
}

export const ProductCostingEditor: React.FC<ProductCostingEditorProps> = ({
  laborHoursField,
  materialLinesField,
  onStructuralChange,
}) => {
  const form = useProductForm();
  const partOptions = usePartOptions({ limit: 0, sortBy: 'name', sortDirection: 'asc' });
  const [partToAdd, setPartToAdd] = useState('');
  const [departmentToAdd, setDepartmentToAdd] = useState<WorkItemDepartment | ''>('');
  const partsById = useMemo(() => new Map(partOptions.items.map((part) => [part.id, part])), [partOptions.items]);
  const materialLines = materialLinesField.state.value;
  const hasPeriodicParts = partOptions.items.some((part) => part.stockTrackingMode === 'periodic');
  const availableParts = toProductRawMaterialOptions(partOptions.items, materialLines);
  const partPlaceholder = rawMaterialPlaceholder({
    hasAvailableParts: availableParts.length > 0,
    hasPeriodicParts,
    isError: partOptions.query.isError,
    isLoading: partOptions.isLoading,
  });
  const selectedDepartments = new Set(laborHoursField.state.value.map((line) => line.department));
  const availableDepartments = WORK_ITEM_DEPARTMENTS.filter((department) => !selectedDepartments.has(department));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Raw materials per unit</CardTitle>
          <CardDescription>
            Add the periodic-stock material consumed to build one Product unit. Quantities are always per unit.
          </CardDescription>
          <CardAction className="flex gap-2">
            <div className="w-64 max-w-full">
              <SearchableCombobox
                disabled={partOptions.isLoading || partOptions.query.isError || availableParts.length === 0}
                emptyMessage="No raw materials found."
                inputId="product-costing-raw-material"
                onValueChange={setPartToAdd}
                options={availableParts}
                placeholder={partPlaceholder}
                value={partToAdd}
              />
            </div>
            <Button
              disabled={!partToAdd}
              onClick={() => {
                if (!partToAdd) return;
                materialLinesField.pushValue({ partId: partToAdd, quantityPerUnit: 1 });
                setPartToAdd('');
                onStructuralChange();
              }}
              type="button"
              variant="outline"
            >
              <IconPlus /> Add
            </Button>
          </CardAction>
        </CardHeader>
        <CardSeparator />
        <CardContent className="grid gap-3">
          {partOptions.query.isError ? (
            <div className="flex items-center gap-2">
              <ErrorMessage error={partOptions.query.error} fallbackMessage="Unable to load Parts." />
              <Button onClick={() => void partOptions.query.refetch()} size="sm" type="button" variant="outline">
                Retry
              </Button>
            </div>
          ) : materialLines.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {partOptions.isLoading || hasPeriodicParts
                ? 'No raw materials per unit recorded.'
                : 'No raw materials can be added yet. Open Parts and set each raw material’s Stock tracking to Periodic first.'}
            </p>
          ) : null}
          {materialLines.map((line, index) => {
            const part = partsById.get(line.partId);

            return (
              <div
                className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_18rem_auto]"
                key={line.partId}
              >
                <div>
                  <p className="font-medium text-sm">{part?.name ?? 'Unavailable Part'}</p>
                  <p className="text-muted-foreground text-xs">{part?.code ?? '–'}</p>
                </div>
                <form.AppField name={`materialLines[${index}].quantityPerUnit`}>
                  {(field) => (
                    <field.NumberField
                      inputMode="decimal"
                      label={`Quantity per unit${part ? ` (${formatPurchaseUnitLabel(part)})` : ''}`}
                      min={0.001}
                      step={0.001}
                    />
                  )}
                </form.AppField>
                <Button
                  aria-label={`Remove ${part?.name ?? 'raw material'}`}
                  onClick={() => {
                    materialLinesField.removeValue(index);
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Labor per unit</CardTitle>
          <CardDescription>Record the standard hours required in each Department for one Product unit.</CardDescription>
          <CardAction className="flex gap-2">
            <Select
              onValueChange={(value) =>
                setDepartmentToAdd(WORK_ITEM_DEPARTMENTS.find((department) => department === value) ?? '')
              }
              value={departmentToAdd}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Select Department">
                  {departmentToAdd ? departmentLabels[departmentToAdd] : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableDepartments.map((department) => (
                  <SelectItem key={department} value={department}>
                    {departmentLabels[department]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!departmentToAdd}
              onClick={() => {
                if (!departmentToAdd) return;
                laborHoursField.pushValue({ department: departmentToAdd, hours: 1 });
                setDepartmentToAdd('');
                onStructuralChange();
              }}
              type="button"
              variant="outline"
            >
              <IconPlus /> Add
            </Button>
          </CardAction>
        </CardHeader>
        <CardSeparator />
        <CardContent className="grid gap-3">
          {laborHoursField.state.value.length === 0 ? (
            <p className="text-muted-foreground text-sm">No labor hours per unit recorded.</p>
          ) : null}
          {laborHoursField.state.value.map((line, index) => (
            <div
              className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_18rem_auto]"
              key={line.department}
            >
              <p className="self-center font-medium text-sm">{departmentLabels[line.department]}</p>
              <form.AppField name={`laborHours[${index}].hours`}>
                {(field) => <field.NumberField inputMode="decimal" label="Hours per unit" min={0.01} step={0.01} />}
              </form.AppField>
              <Button
                aria-label={`Remove ${departmentLabels[line.department]} labor`}
                onClick={() => {
                  laborHoursField.removeValue(index);
                  onStructuralChange();
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconTrash />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
