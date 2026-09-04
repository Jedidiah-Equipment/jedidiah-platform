import { closestCenter, DndContext } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PRODUCT_KEY_FEATURES_MAX_COUNT, ProductKeyFeature } from '@pkg/schema/equipment';
import { IconPlus } from '@tabler/icons-react';
import type React from 'react';
import { useSortableFieldRows } from '@/components/form/hooks/use-sortable-field-rows.js';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { validateStructuralFieldOnMount } from '@/components/form/utils/field-validators.js';
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
import { FieldUsageLabel, PRODUCT_FIELD_USAGE } from '@/equipment/components/catalog/index.js';
import { EditorTextField } from './EditorTextField.js';
import { SortableEditorRow } from './SortableEditorRow.js';
import { emptyProductFormValues } from './types.js';

const KEY_FEATURE_FIELD_VALIDATORS = validateStructuralFieldOnMount(ProductKeyFeature);

type ProductKeyFeaturesEditorProps = {
  keyFeaturesField: ArrayFieldApi<string>;
  onStructuralChange: () => void;
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductKeyFeaturesEditor: React.FC<ProductKeyFeaturesEditorProps> = ({
  keyFeaturesField,
  onStructuralChange,
}) => {
  const productForm = useProductForm();
  const keyFeatures = keyFeaturesField.state.value;
  const canAddFeature = keyFeatures.length < PRODUCT_KEY_FEATURES_MAX_COUNT;
  const { rowKeys, sensors, addRow, removeRow, handleDragEnd } = useSortableFieldRows(
    keyFeaturesField,
    onStructuralChange,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FieldUsageLabel usage={PRODUCT_FIELD_USAGE.keyFeatures}>Key Features</FieldUsageLabel>
        </CardTitle>
        <CardDescription>
          Freeform lines shown as a checkmark list. Drag to reorder; up to {PRODUCT_KEY_FEATURES_MAX_COUNT} lines.
        </CardDescription>
        <CardAction>
          <Button disabled={!canAddFeature} onClick={() => addRow('')} type="button" variant="outline">
            <IconPlus data-icon="inline-start" />
            Add feature
          </Button>
        </CardAction>
      </CardHeader>
      <CardSeparator />
      <CardContent>
        {keyFeatures.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyIcon />
              <EmptyTitle>No key features added.</EmptyTitle>
              <EmptyDescription>Add a feature from the header to build the Key Features list.</EmptyDescription>
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
                {keyFeatures.map((_, index) => (
                  <SortableEditorRow
                    id={rowKeys[index] ?? String(index)}
                    key={rowKeys[index] ?? index}
                    onRemove={() => removeRow(index)}
                    removeLabel={`Remove key feature ${index + 1}`}
                    reorderLabel={`Reorder key feature ${index + 1}`}
                  >
                    <productForm.Field name={`keyFeatures[${index}]`} validators={KEY_FEATURE_FIELD_VALIDATORS}>
                      {(field: FieldApi<string>) => (
                        <EditorTextField
                          className="flex-1"
                          field={field}
                          label={`Key feature ${index + 1}`}
                          placeholder="Heavy-duty steel construction"
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
