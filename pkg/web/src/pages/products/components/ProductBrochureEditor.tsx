import { BROCHURE_KEY_FEATURES_MAX_COUNT, BrochureKeyFeature } from '@pkg/schema';
import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { emptyProductFormValues } from './types.js';

const KEY_FEATURE_FIELD_VALIDATORS = validateStructuralFieldOnMount(BrochureKeyFeature);

type ProductBrochureEditorProps = {
  keyFeaturesField: ArrayFieldApi<string>;
  onStructuralChange: () => void;
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductBrochureEditor: React.FC<ProductBrochureEditorProps> = ({
  keyFeaturesField,
  onStructuralChange,
}) => {
  const productForm = useProductForm();
  const keyFeatures = keyFeaturesField.state.value;
  const canAddFeature = keyFeatures.length < BROCHURE_KEY_FEATURES_MAX_COUNT;

  // Key-feature lines are plain strings, so keep a parallel list of stable React keys that moves with
  // the field's add/remove/reorder operations. This keeps each input's identity (and focus) attached
  // to its line rather than its position. The form remounts per product (keyed by id), so the initial
  // length always matches the field value.
  const [rowKeys, setRowKeys] = useState<string[]>(() => keyFeatures.map(() => crypto.randomUUID()));

  const handleAddFeature = () => {
    keyFeaturesField.pushValue('');
    setRowKeys((current) => [...current, crypto.randomUUID()]);
    onStructuralChange();
  };

  const handleRemoveFeature = (index: number) => {
    keyFeaturesField.removeValue(index);
    setRowKeys((current) => current.filter((_, position) => position !== index));
    onStructuralChange();
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= keyFeatures.length) {
      return;
    }

    keyFeaturesField.moveValue(fromIndex, toIndex);
    setRowKeys((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);

      if (moved === undefined) {
        return current;
      }

      next.splice(toIndex, 0, moved);
      return next;
    });
    onStructuralChange();
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Brochure Details</CardTitle>
          <CardDescription>Customer-facing marketing copy used to generate the Product Brochure.</CardDescription>
        </CardHeader>
        <CardSeparator />
        <CardContent>
          <productForm.AppField name="brochureConfig.subtitle">
            {(field) => (
              <field.TextField
                autoComplete="off"
                description="The category line shown under the title, e.g. “Silage & Grain”."
                label="Subtitle"
                placeholder="Silage & Grain"
              />
            )}
          </productForm.AppField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Key Features</CardTitle>
          <CardDescription>
            Freeform lines shown as a checkmark list. Drag-free reorder with the arrows; up to{' '}
            {BROCHURE_KEY_FEATURES_MAX_COUNT} lines.
          </CardDescription>
          <CardAction>
            <Button disabled={!canAddFeature} onClick={handleAddFeature} type="button" variant="outline">
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
            <div className="flex flex-col gap-3">
              {keyFeatures.map((_, index) => (
                <div className="flex items-start gap-2" key={rowKeys[index] ?? index}>
                  <div className="flex shrink-0 flex-col">
                    <Button
                      aria-label={`Move key feature ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => handleReorder(index, index - 1)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <IconChevronUp />
                    </Button>
                    <Button
                      aria-label={`Move key feature ${index + 1} down`}
                      disabled={index === keyFeatures.length - 1}
                      onClick={() => handleReorder(index, index + 1)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <IconChevronDown />
                    </Button>
                  </div>
                  <productForm.Field
                    name={`brochureConfig.keyFeatures[${index}]`}
                    validators={KEY_FEATURE_FIELD_VALIDATORS}
                  >
                    {(field: FieldApi<string>) => {
                      const errors = getFieldErrors(field.state.meta.errors);
                      const isInvalid = errors.length > 0;

                      return (
                        <Field className="flex-1" data-invalid={isInvalid}>
                          <FieldLabel className="sr-only">Key feature {index + 1}</FieldLabel>
                          <Input
                            aria-invalid={isInvalid}
                            aria-label={`Key feature ${index + 1}`}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                            placeholder="Heavy-duty steel construction"
                            value={field.state.value}
                          />
                          <FieldError errors={errors} />
                        </Field>
                      );
                    }}
                  </productForm.Field>
                  <Button
                    aria-label={`Remove key feature ${index + 1}`}
                    onClick={() => handleRemoveFeature(index)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
