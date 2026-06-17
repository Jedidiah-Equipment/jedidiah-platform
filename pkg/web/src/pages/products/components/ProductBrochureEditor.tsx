import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { evaluateBrochureCompleteness } from '@pkg/domain';
import {
  BROCHURE_KEY_FEATURES_MAX_COUNT,
  type BrochureImageSlot,
  type BrochureImages,
  BrochureKeyFeature,
  type BrochureRequiredField,
  type UUID,
} from '@pkg/schema';
import { IconAlertTriangle, IconGripVertical, IconPlus, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';
import { useTypedAppFormContext } from '@/components/form/index.js';
import type { ArrayFieldApi, FieldApi } from '@/components/form/types.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { validateStructuralFieldOnMount } from '@/components/form/utils/field-validators.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
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
import { useCan } from '@/hooks/use-access.js';
import { cn } from '@/lib/utils.js';
import { BrochureImageSlotTile } from './BrochureImageSlotTile.js';
import { emptyProductFormValues } from './types.js';

const KEY_FEATURE_FIELD_VALIDATORS = validateStructuralFieldOnMount(BrochureKeyFeature);

type ProductBrochureEditorProps = {
  images: BrochureImages;
  keyFeaturesField: ArrayFieldApi<string>;
  onStructuralChange: () => void;
  productId: UUID;
};

type BrochureImageSlotField = {
  description: string;
  label: string;
  slot: BrochureImageSlot;
};

// Slot order, labels, and guidance copy for the form. Recommended dimensions and fit come from the
// shared schema specs so the form and renderer stay in lockstep.
const BROCHURE_IMAGE_SLOT_FIELDS: BrochureImageSlotField[] = [
  { slot: 'rangeLogo', label: 'Range logo', description: 'Top-right sub-brand logo. Fits without cropping.' },
  { slot: 'hero', label: 'Hero image', description: 'Main product photo. Center-cropped to fill its slot.' },
  {
    slot: 'technicalDrawing',
    label: 'Technical drawing',
    description: 'Dimensioned line drawing. Center-cropped to fill its slot.',
  },
  { slot: 'secondary', label: 'Secondary image', description: 'Additional product photo. Center-cropped to fill.' },
];

// Human labels for the brochure-completeness alert, keyed by the schema's required-field vocabulary.
const BROCHURE_REQUIRED_FIELD_LABELS: Record<BrochureRequiredField, string> = {
  subtitle: 'Subtitle',
  keyFeatures: 'At least one key feature',
  rangeLogo: 'Range logo image',
  hero: 'Hero image',
  technicalDrawing: 'Technical drawing image',
  secondary: 'Secondary image',
  description: 'Product description',
  assemblies: 'At least one assembly',
};

function useProductForm() {
  return useTypedAppFormContext({
    defaultValues: emptyProductFormValues,
  });
}

export const ProductBrochureEditor: React.FC<ProductBrochureEditorProps> = ({
  images,
  keyFeaturesField,
  onStructuralChange,
  productId,
}) => {
  const productForm = useProductForm();
  const canEdit = useCan('product:update').can;
  const keyFeatures = keyFeaturesField.state.value;
  const canAddFeature = keyFeatures.length < BROCHURE_KEY_FEATURES_MAX_COUNT;

  // Key-feature lines are plain strings, so keep a parallel list of stable ids that moves with the
  // field's add/remove/reorder operations. These ids back both the React keys and the dnd-kit sortable
  // ids, keeping each input's identity (and focus) attached to its line rather than its position. The
  // form remounts per product (keyed by id), so the initial length always matches the field value.
  const [rowKeys, setRowKeys] = useState<string[]>(() => keyFeatures.map(() => crypto.randomUUID()));

  // A small distance constraint keeps clicks on the inputs and remove buttons from starting a drag.
  // The keyboard sensor keeps the grip handle operable (focus, Space to pick up, arrows to move) so
  // reordering stays accessible without the previous up/down buttons.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= keyFeatures.length) {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const fromIndex = rowKeys.indexOf(String(active.id));
    const toIndex = rowKeys.indexOf(String(over.id));

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    handleReorder(fromIndex, toIndex);
  };

  return (
    <div className="flex flex-col gap-5">
      <productForm.Subscribe
        selector={(state) =>
          evaluateBrochureCompleteness({
            assemblyCount: state.values.assemblies.length,
            description: state.values.description,
            images,
            keyFeatures: state.values.brochureConfig.keyFeatures,
            subtitle: state.values.brochureConfig.subtitle,
          })
        }
      >
        {(completeness) =>
          completeness.complete ? null : <BrochureCompletenessAlert missingFields={completeness.missingFields} />
        }
      </productForm.Subscribe>
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
            Freeform lines shown as a checkmark list. Drag to reorder; up to {BROCHURE_KEY_FEATURES_MAX_COUNT} lines.
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
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
              sensors={sensors}
            >
              <SortableContext items={rowKeys} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {keyFeatures.map((_, index) => (
                    <KeyFeatureRow
                      id={rowKeys[index] ?? String(index)}
                      index={index}
                      key={rowKeys[index] ?? index}
                      onRemove={() => handleRemoveFeature(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Brochure Images</CardTitle>
          <CardDescription>
            PNG or JPEG only. Each slot replaces in place, so there is always one current image per slot.
          </CardDescription>
        </CardHeader>
        <CardSeparator />
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {BROCHURE_IMAGE_SLOT_FIELDS.map((field) => (
              <BrochureImageSlotTile
                canEdit={canEdit}
                description={field.description}
                image={images[field.slot]}
                key={field.slot}
                label={field.label}
                productId={productId}
                slot={field.slot}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

type BrochureCompletenessAlertProps = {
  missingFields: BrochureRequiredField[];
};

// Surfaces the still-missing required fields so the brochure can be completed before preview/generation.
// The verdict comes from the shared `evaluateBrochureCompleteness` predicate, so this list stays in lockstep
// with the server-side gates that consume the same predicate.
const BrochureCompletenessAlert: React.FC<BrochureCompletenessAlertProps> = ({ missingFields }) => (
  <Alert>
    <IconAlertTriangle />
    <AlertTitle>Brochure incomplete</AlertTitle>
    <AlertDescription>
      <p>Fill in the following before this brochure can be previewed or generated:</p>
      <ul className="list-disc pl-5">
        {missingFields.map((field) => (
          <li key={field}>{BROCHURE_REQUIRED_FIELD_LABELS[field]}</li>
        ))}
      </ul>
    </AlertDescription>
  </Alert>
);

type KeyFeatureRowProps = {
  id: string;
  index: number;
  onRemove: () => void;
};

const KeyFeatureRow: React.FC<KeyFeatureRowProps> = ({ id, index, onRemove }) => {
  const productForm = useProductForm();
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const sortableStyle: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div
      className={cn('flex items-start gap-2', isDragging && 'relative z-10 opacity-80')}
      ref={setNodeRef}
      style={sortableStyle}
    >
      <Button
        aria-label={`Reorder key feature ${index + 1}`}
        className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
        size="icon-sm"
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical />
      </Button>
      <productForm.Field name={`brochureConfig.keyFeatures[${index}]`} validators={KEY_FEATURE_FIELD_VALIDATORS}>
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
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <IconTrash />
      </Button>
    </div>
  );
};
