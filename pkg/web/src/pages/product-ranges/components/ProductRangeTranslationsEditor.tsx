import type {
  CatalogProductRangeTranslation,
  CatalogProductRangeVariantTranslation,
  CatalogTranslationFieldState,
  UUID,
} from '@pkg/schema';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CatalogTranslationCanonicalText,
  CatalogTranslationFieldFrame,
  CatalogTranslationRevertDialog,
} from '@/components/catalog-translations/CatalogTranslationField.js';
import { PRODUCT_RANGE_TRANSLATION_FIELD_LABELS } from '@/components/catalog-translations/catalog-translation-labels.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm, useTypedAppFormContext } from '@/components/form/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { TabsContent } from '@/components/ui/tabs.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  getProductRangeTranslationManualFields,
  type ProductRangeTranslationBundle,
  type ProductRangeTranslationFormValues,
  ProductRangeTranslationFormValuesSchema,
  type ProductRangeTranslationManualFields,
  type ProductRangeTranslationPatch,
  type ProductRangeTranslationTarget,
  toProductRangeTranslationFormValues,
  toProductRangeTranslationPatch,
  toProductRangeTranslationTogglePatch,
} from './product-range-translations/types.js';

type ProductRangeTranslationsEditorProps = {
  rangeId: UUID;
  variantIds: UUID[];
};

type PendingRegeneration = {
  startedAt: number;
  target: ProductRangeTranslationTarget;
};

const REGENERATION_POLL_INTERVAL_MS = 2_000;
const REGENERATION_POLL_LIMIT_MS = 5 * 60_000;
const EMPTY_PRODUCT_RANGE_TRANSLATION_FORM_VALUES: ProductRangeTranslationFormValues = {
  fields: { description: '', name: '' },
  variants: [],
};

export const ProductRangeTranslationsEditor: React.FC<ProductRangeTranslationsEditorProps> = ({
  rangeId,
  variantIds,
}) => {
  const trpc = useTRPC();
  const { invalidateCatalogTranslations } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [pendingRegeneration, setPendingRegeneration] = useState<PendingRegeneration | null>(null);

  const rangeQuery = useQuery({
    ...trpc.catalogTranslations.getRange.queryOptions({ id: rangeId }),
    refetchInterval: (query) =>
      shouldPollRange(query.state.data, pendingRegeneration) ? REGENERATION_POLL_INTERVAL_MS : false,
  });
  const variantQueries = useQueries({
    queries: variantIds.map((id) => ({
      ...trpc.catalogTranslations.getVariant.queryOptions({ id }),
      refetchInterval: (query: { state: { data: CatalogProductRangeVariantTranslation | undefined } }) =>
        shouldPollVariant(query.state.data, id, pendingRegeneration) ? REGENERATION_POLL_INTERVAL_MS : false,
    })),
    combine: combineVariantTranslationQueries,
  });

  const translation = useMemo<ProductRangeTranslationBundle | undefined>(() => {
    if (!rangeQuery.data || variantQueries.data.length !== variantIds.length) return undefined;
    return { range: rangeQuery.data, variants: variantQueries.data };
  }, [rangeQuery.data, variantIds.length, variantQueries.data]);

  useEffect(() => {
    if (pendingRegeneration && translation && getTargetState(translation, pendingRegeneration.target) === 'fresh') {
      setPendingRegeneration(null);
    }
  }, [pendingRegeneration, translation]);

  const updateRangeMutation = useMutation(trpc.catalogTranslations.updateRange.mutationOptions());
  const updateVariantMutation = useMutation(trpc.catalogTranslations.updateVariant.mutationOptions());

  const savePatch = async (patch: ProductRangeTranslationPatch) => {
    await Promise.all([
      ...(patch.range ? [updateRangeMutation.mutateAsync(patch.range)] : []),
      ...patch.variants.map((variant) => updateVariantMutation.mutateAsync(variant)),
    ]);
    await invalidateCatalogTranslations();
  };

  const updateManualState = async (
    target: ProductRangeTranslationTarget,
    isManual: boolean,
    values: ProductRangeTranslationFormValues,
  ) => {
    try {
      await savePatch(toProductRangeTranslationTogglePatch(values, target, isManual, rangeId));
      if (!isManual) setPendingRegeneration({ startedAt: Date.now(), target });
      return true;
    } catch (error) {
      showMutationError(error, 'Unable to update the manual translation setting.');
      return false;
    }
  };

  const isPending = rangeQuery.isPending || variantQueries.isPending;
  const isTogglePending = updateRangeMutation.isPending || updateVariantMutation.isPending;

  return (
    <TabsContent className="pt-4" value="translations">
      {isPending ? <ProductRangeTranslationsSkeleton /> : null}
      <ErrorMessage error={rangeQuery.error} fallbackMessage="Unable to load Product Range translations." />
      <ErrorMessage error={variantQueries.error} fallbackMessage="Unable to load Variant translations." />
      {translation ? (
        <ProductRangeTranslationsForm
          isTogglePending={isTogglePending}
          onSave={savePatch}
          onToggle={updateManualState}
          translation={translation}
        />
      ) : null}
    </TabsContent>
  );
};

type ProductRangeTranslationsFormProps = {
  isTogglePending: boolean;
  onSave: (patch: ProductRangeTranslationPatch) => Promise<unknown>;
  onToggle: (
    target: ProductRangeTranslationTarget,
    isManual: boolean,
    values: ProductRangeTranslationFormValues,
  ) => Promise<boolean>;
  translation: ProductRangeTranslationBundle;
};

const ProductRangeTranslationsForm: React.FC<ProductRangeTranslationsFormProps> = ({
  isTogglePending,
  onSave,
  onToggle,
  translation,
}) => {
  const initialValues = useMemo(() => toProductRangeTranslationFormValues(translation), [translation]);
  const manual = getProductRangeTranslationManualFields(translation);
  const syncedTranslationRef = useRef(translation);
  const [pendingRevert, setPendingRevert] = useState<ProductRangeTranslationTarget | null>(null);
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: initialValues,
    failureMessage: 'Unable to save the Afrikaans translation.',
    save: onSave,
    toInput: (values) => toProductRangeTranslationPatch(translation, initialValues, values),
    validator: ProductRangeTranslationFormValuesSchema,
  });

  useEffect(() => {
    if (
      syncedTranslationRef.current === translation ||
      autosave.state.status === 'saving' ||
      autosave.hasPendingChanges()
    ) {
      return;
    }
    autosave.resetToSavedValues(initialValues);
    syncedTranslationRef.current = translation;
  }, [autosave.hasPendingChanges, autosave.resetToSavedValues, autosave.state.status, initialValues, translation]);

  const persistToggle = async (target: ProductRangeTranslationTarget, isManual: boolean) => {
    if (!(await autosave.flush())) return;
    const didSave = await onToggle(target, isManual, form.state.values);
    if (didSave && !isManual) setPendingRevert(null);
  };

  const toggle = (target: ProductRangeTranslationTarget, isManual: boolean) => {
    if (!isManual) {
      setPendingRevert(target);
      return;
    }
    void persistToggle(target, true);
  };

  const markReviewed = (target: ProductRangeTranslationTarget) => {
    if (isTargetManual(manual, target) && getTargetState(translation, target) === 'needsReview') {
      form.setFieldValue('reviewedTarget', target);
    }
  };

  return (
    <form.AppForm>
      <form {...formProps} className="flex flex-col gap-4">
        <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
        <ProductRangeTranslationFields
          isTogglePending={isTogglePending}
          manual={manual}
          onEnable={(target) => toggle(target, true)}
          onInteract={markReviewed}
          onRequestRevert={(target) => toggle(target, false)}
          translation={translation}
        />
        <CatalogTranslationRevertDialog
          fieldLabel={pendingRevert ? getTargetLabel(translation, pendingRevert) : 'translation'}
          isOpen={pendingRevert !== null}
          isPending={isTogglePending}
          onConfirm={() => {
            if (!pendingRevert) return;
            void persistToggle(pendingRevert, false);
          }}
          onOpenChange={(open) => {
            if (!open && !isTogglePending) setPendingRevert(null);
          }}
        />
      </form>
    </form.AppForm>
  );
};

type ProductRangeTranslationFieldsProps = {
  isTogglePending: boolean;
  manual: ProductRangeTranslationManualFields;
  onEnable: (target: ProductRangeTranslationTarget) => void;
  onInteract: (target: ProductRangeTranslationTarget) => void;
  onRequestRevert: (target: ProductRangeTranslationTarget) => void;
  translation: ProductRangeTranslationBundle;
};

type ProductRangeTranslationFieldsRenderProps = ProductRangeTranslationFieldsProps & {
  onValueChange: (target: ProductRangeTranslationTarget, value: string) => void;
  values: ProductRangeTranslationFormValues;
};

export const ProductRangeTranslationFields: React.FC<ProductRangeTranslationFieldsProps> = ({ ...props }) => {
  const form = useTypedAppFormContext({ defaultValues: EMPTY_PRODUCT_RANGE_TRANSLATION_FORM_VALUES });

  const updateValue = (target: ProductRangeTranslationTarget, value: string) => {
    if (target.kind === 'range') {
      if (target.field === 'name') form.setFieldValue('fields.name', value);
      else form.setFieldValue('fields.description', value);
      return;
    }

    const index = form.state.values.variants.findIndex((variant) => variant.id === target.variantId);
    if (index >= 0) form.setFieldValue(`variants[${index}].name`, value);
  };

  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => renderProductRangeTranslationFields({ ...props, onValueChange: updateValue, values })}
    </form.Subscribe>
  );
};

function renderProductRangeTranslationFields({
  isTogglePending,
  manual,
  onEnable,
  onInteract,
  onRequestRevert,
  onValueChange,
  translation,
  values,
}: ProductRangeTranslationFieldsRenderProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Range translations</CardTitle>
          <CardDescription>
            English is the canonical source. Enable Manual to review or replace an Afrikaans value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['name', 'description'] as const).map((field) => {
            const target = { field, kind: 'range' } as const;
            const fieldTranslation = translation.range.fields[field];
            const label = PRODUCT_RANGE_TRANSLATION_FIELD_LABELS[field];
            return (
              <CatalogTranslationFieldFrame
                fieldLabel={label}
                isManual={manual.fields[field]}
                isPending={isTogglePending}
                key={field}
                onEnable={() => onEnable(target)}
                onInteract={() => onInteract(target)}
                onRequestRevert={() => onRequestRevert(target)}
                state={fieldTranslation.state}
                canonical={
                  <CatalogTranslationCanonicalText
                    multiline={field === 'description'}
                    value={fieldTranslation.canonical}
                  />
                }
              >
                {field === 'description' ? (
                  <Textarea
                    aria-label="Description Afrikaans"
                    disabled={!manual.fields.description}
                    onChange={(event) => onValueChange(target, event.target.value)}
                    rows={4}
                    value={values.fields.description}
                  />
                ) : (
                  <Input
                    aria-label="Name Afrikaans"
                    disabled={!manual.fields.name}
                    onChange={(event) => onValueChange(target, event.target.value)}
                    value={values.fields.name}
                  />
                )}
              </CatalogTranslationFieldFrame>
            );
          })}
        </CardContent>
      </Card>
      {translation.variants.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Variant translations</CardTitle>
            <CardDescription>Variant names use the same per-field manual override behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {translation.variants.map((variant) => {
              const target = { kind: 'variant', variantId: variant.id } as const;
              return (
                <CatalogTranslationFieldFrame
                  canonical={<CatalogTranslationCanonicalText value={variant.fields.name.canonical} />}
                  fieldLabel={`Variant: ${variant.fields.name.canonical}`}
                  isManual={manual.variants[variant.id] ?? false}
                  isPending={isTogglePending}
                  key={variant.id}
                  onEnable={() => onEnable(target)}
                  onInteract={() => onInteract(target)}
                  onRequestRevert={() => onRequestRevert(target)}
                  state={variant.fields.name.state}
                >
                  <Input
                    aria-label={`${variant.fields.name.canonical} Afrikaans`}
                    disabled={!manual.variants[variant.id]}
                    onChange={(event) => onValueChange(target, event.target.value)}
                    value={values.variants.find((value) => value.id === variant.id)?.name ?? ''}
                  />
                </CatalogTranslationFieldFrame>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function isTargetManual(manual: ProductRangeTranslationManualFields, target: ProductRangeTranslationTarget): boolean {
  return target.kind === 'range' ? manual.fields[target.field] : (manual.variants[target.variantId] ?? false);
}

function getTargetLabel(translation: ProductRangeTranslationBundle, target: ProductRangeTranslationTarget): string {
  if (target.kind === 'range') return PRODUCT_RANGE_TRANSLATION_FIELD_LABELS[target.field];
  return translation.variants.find((variant) => variant.id === target.variantId)?.fields.name.canonical ?? 'Variant';
}

function getTargetState(
  translation: ProductRangeTranslationBundle,
  target: ProductRangeTranslationTarget,
): CatalogTranslationFieldState | undefined {
  if (target.kind === 'range') return translation.range.fields[target.field].state;
  return translation.variants.find((variant) => variant.id === target.variantId)?.fields.name.state;
}

function shouldPollRange(
  translation: CatalogProductRangeTranslation | undefined,
  pending: PendingRegeneration | null,
): boolean {
  if (pending?.target.kind !== 'range' || isRegenerationExpired(pending)) return false;
  return translation?.fields[pending.target.field].state !== 'fresh';
}

type VariantTranslationQueryResult = {
  data: CatalogProductRangeVariantTranslation | undefined;
  error: unknown;
  isPending: boolean;
};

function combineVariantTranslationQueries(results: VariantTranslationQueryResult[]) {
  return {
    data: results.flatMap((result) => (result.data ? [result.data] : [])),
    error: results.find((result) => result.error)?.error ?? null,
    isPending: results.some((result) => result.isPending),
  };
}

function shouldPollVariant(
  translation: CatalogProductRangeVariantTranslation | undefined,
  variantId: UUID,
  pending: PendingRegeneration | null,
): boolean {
  if (pending?.target.kind !== 'variant' || pending.target.variantId !== variantId || isRegenerationExpired(pending)) {
    return false;
  }
  return translation?.fields.name.state !== 'fresh';
}

function isRegenerationExpired(pending: PendingRegeneration): boolean {
  return Date.now() - pending.startedAt >= REGENERATION_POLL_LIMIT_MS;
}

function ProductRangeTranslationsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
