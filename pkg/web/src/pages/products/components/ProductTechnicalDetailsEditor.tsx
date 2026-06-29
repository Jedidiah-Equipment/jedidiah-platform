import { closestCenter, DndContext } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import {
  PRODUCT_TECHNICAL_DETAILS_MAX_COUNT,
  type ProductTechnicalDetail,
  ProductTechnicalDetailLabel,
  ProductTechnicalDetailValue,
} from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import type React from 'react';
import { FieldUsageLabel, PRODUCT_FIELD_USAGE } from '@/components/catalog/index.js';
import { useSortableFieldRows } from '@/components/form/hooks/use-sortable-field-rows.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { validateStructuralFieldOnMount } from '@/components/form/utils/field-validators.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { EditorTextField } from './EditorTextField.js';
import { SortableEditorRow } from './SortableEditorRow.js';
import { emptyProductFormValues } from './types.js';

const VALUE_FIELD_VALIDATORS = validateStructuralFieldOnMount(ProductTechnicalDetailValue);
const LABEL_FIELD_VALIDATORS = validateStructuralFieldOnMount(ProductTechnicalDetailLabel);

type ProductTechnicalDetailsEditorProps = {
  technicalDetailsField: ArrayFieldApi<ProductTechnicalDetail>;
  onStructuralChange: () => void;
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductTechnicalDetailsEditor: React.FC<ProductTechnicalDetailsEditorProps> = ({
  technicalDetailsField,
  onStructuralChange,
}) => {
  const productForm = useProductForm();
  const technicalDetails = technicalDetailsField.state.value;
  const canAddDetail = technicalDetails.length < PRODUCT_TECHNICAL_DETAILS_MAX_COUNT;
  const { rowKeys, sensors, addRow, removeRow, handleDragEnd } = useSortableFieldRows(
    technicalDetailsField,
    onStructuralChange,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FieldUsageLabel usage={PRODUCT_FIELD_USAGE.technicalDetails}>Technical Details</FieldUsageLabel>
        </CardTitle>
        <CardAction>
          <Button
            disabled={!canAddDetail}
            onClick={() => addRow({ label: '', value: '' })}
            type="button"
            variant="outline"
          >
            <IconPlus data-icon="inline-start" />
            Add detail
          </Button>
        </CardAction>
      </CardHeader>
      <CardSeparator />
      <CardContent>
        {technicalDetails.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyIcon />
              <EmptyTitle>No technical details added.</EmptyTitle>
              <EmptyDescription>Add a detail from the header to build the Lander hero tiles.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext items={rowKeys} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {technicalDetails.map((_, index) => (
                  <SortableEditorRow
                    id={rowKeys[index] ?? String(index)}
                    key={rowKeys[index] ?? index}
                    onRemove={() => removeRow(index)}
                    removeLabel={`Remove technical detail ${index + 1}`}
                    reorderLabel={`Reorder technical detail ${index + 1}`}
                  >
                    <productForm.Field name={`technicalDetails[${index}].value`} validators={VALUE_FIELD_VALIDATORS}>
                      {(field: FieldApi<string>) => (
                        <EditorTextField
                          className="flex-1"
                          field={field}
                          label={`Technical detail value ${index + 1}`}
                          placeholder="value"
                        />
                      )}
                    </productForm.Field>
                    <productForm.Field name={`technicalDetails[${index}].label`} validators={LABEL_FIELD_VALIDATORS}>
                      {(field: FieldApi<string>) => (
                        <EditorTextField
                          className="flex-[2]"
                          field={field}
                          label={`Technical detail label ${index + 1}`}
                          placeholder="label"
                        />
                      )}
                    </productForm.Field>
                  </SortableEditorRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
};
