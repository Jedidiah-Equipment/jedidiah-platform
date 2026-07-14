import type { CatalogProductRangeTranslation, CatalogProductRangeTranslationPatchInput, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo } from 'react';

import {
  CatalogTranslationCanonicalText,
  CatalogTranslationFieldFrame,
  CatalogTranslationRevertDialog,
} from '@/components/catalog-translations/CatalogTranslationField.js';
import { PRODUCT_RANGE_TRANSLATION_FIELD_LABELS } from '@/components/catalog-translations/catalog-translation-labels.js';
import {
  useAutosaveServerSync,
  useManualOverrideToggle,
  useTranslationRegeneration,
} from '@/components/catalog-translations/use-translation-overrides.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { TabsContent } from '@/components/ui/tabs.js';
import { Textarea } from '@/components/ui/textarea.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  getProductRangeTranslationTargetState,
  isProductRangeTranslationTargetManual,
  ProductRangeTranslationFormValuesSchema,
  type ProductRangeTranslationTarget,
  toProductRangeTranslationFormValues,
  toProductRangeTranslationPatch,
  toProductRangeTranslationTogglePatch,
} from './product-range-translations/types.js';

type ProductRangeTranslationsEditorProps = {
  rangeId: UUID;
};

export const ProductRangeTranslationsEditor: React.FC<ProductRangeTranslationsEditorProps> = ({ rangeId }) => {
  const trpc = useTRPC();
  const { invalidateCatalogTranslations } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const { awaitRegeneration, refetchInterval, settleRegeneration } = useTranslationRegeneration({
    getTargetState: getProductRangeTranslationTargetState,
  });

  const translationQuery = useQuery({
    ...trpc.catalogTranslations.getRange.queryOptions({ id: rangeId }),
    refetchInterval: (query) => refetchInterval(query.state.data),
  });

  useEffect(() => settleRegeneration(translationQuery.data), [settleRegeneration, translationQuery.data]);

  const updateMutation = useMutation(
    trpc.catalogTranslations.updateRange.mutationOptions({
      onSuccess: async () => {
        await invalidateCatalogTranslations();
      },
    }),
  );

  const toggleManual = async (
    target: ProductRangeTranslationTarget,
    isManual: boolean,
    values: ReturnType<typeof toProductRangeTranslationFormValues>,
  ) => {
    try {
      await updateMutation.mutateAsync(toProductRangeTranslationTogglePatch(rangeId, values, target, isManual));
      if (!isManual) awaitRegeneration(target);
      return true;
    } catch (error) {
      showMutationError(error, 'Unable to update the manual translation setting.');
      return false;
    }
  };

  return (
    <TabsContent className="pt-4" value="translations">
      {translationQuery.isPending ? <ProductRangeTranslationsSkeleton /> : null}
      <ErrorMessage error={translationQuery.error} fallbackMessage="Unable to load Product Range translations." />
      {translationQuery.data ? (
        <ProductRangeTranslationsForm
          isTogglePending={updateMutation.isPending}
          onSave={(input) => updateMutation.mutateAsync(input)}
          onToggle={toggleManual}
          translation={translationQuery.data}
        />
      ) : null}
    </TabsContent>
  );
};

type ProductRangeTranslationsFormProps = {
  isTogglePending: boolean;
  onSave: (input: CatalogProductRangeTranslationPatchInput) => Promise<unknown>;
  onToggle: (
    target: ProductRangeTranslationTarget,
    isManual: boolean,
    values: ReturnType<typeof toProductRangeTranslationFormValues>,
  ) => Promise<boolean>;
  translation: CatalogProductRangeTranslation;
};

export const ProductRangeTranslationsForm: React.FC<ProductRangeTranslationsFormProps> = ({
  isTogglePending,
  onSave,
  onToggle,
  translation,
}) => {
  const initialValues = useMemo(() => toProductRangeTranslationFormValues(translation), [translation]);
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: initialValues,
    failureMessage: 'Unable to save the Afrikaans translation.',
    save: onSave,
    toInput: (values) => toProductRangeTranslationPatch(translation, initialValues, values),
    validator: ProductRangeTranslationFormValuesSchema,
  });

  useAutosaveServerSync({ autosave, initialValues, translation });

  const { confirmRevert, dismissRevert, enable, pendingRevert, requestRevert } =
    useManualOverrideToggle<ProductRangeTranslationTarget>({
      flush: autosave.flush,
      isPending: isTogglePending,
      onToggle: (target, isManual) => onToggle(target, isManual, form.state.values),
    });

  const fieldFrameProps = (target: ProductRangeTranslationTarget) => ({
    isManual: isProductRangeTranslationTargetManual(translation, target),
    isPending: isTogglePending,
    onEnable: () => enable(target),
    onInteract: () => {
      if (
        isProductRangeTranslationTargetManual(translation, target) &&
        getProductRangeTranslationTargetState(translation, target) === 'needsReview'
      ) {
        form.setFieldValue('reviewedTarget', target);
      }
    },
    onRequestRevert: () => requestRevert(target),
  });

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      <Card>
        <CardHeader>
          <CardTitle>Range translations</CardTitle>
          <CardDescription>
            English is the canonical source. Enable Manual to review or replace an Afrikaans value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(['name', 'description'] as const).map((fieldName) => {
            const target = { field: fieldName, kind: 'range' } as const;
            const fieldTranslation = translation.fields[fieldName];
            const label = PRODUCT_RANGE_TRANSLATION_FIELD_LABELS[fieldName];
            return (
              <form.Field key={fieldName} name={`fields.${fieldName}`}>
                {(field) => (
                  <CatalogTranslationFieldFrame
                    {...fieldFrameProps(target)}
                    canonical={
                      <CatalogTranslationCanonicalText
                        multiline={fieldName === 'description'}
                        value={fieldTranslation.canonical}
                      />
                    }
                    fieldLabel={label}
                    state={fieldTranslation.state}
                  >
                    {fieldName === 'description' ? (
                      <Textarea
                        aria-label={`${label} Afrikaans`}
                        disabled={!isProductRangeTranslationTargetManual(translation, target)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        rows={4}
                        value={field.state.value}
                      />
                    ) : (
                      <Input
                        aria-label={`${label} Afrikaans`}
                        disabled={!isProductRangeTranslationTargetManual(translation, target)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        value={field.state.value}
                      />
                    )}
                  </CatalogTranslationFieldFrame>
                )}
              </form.Field>
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
            {translation.variants.map((variant, index) => {
              const target = { kind: 'variant', variantId: variant.id } as const;
              return (
                <form.Field key={variant.id} name={`variants[${index}].name`}>
                  {(field) => (
                    <CatalogTranslationFieldFrame
                      {...fieldFrameProps(target)}
                      canonical={<CatalogTranslationCanonicalText value={variant.fields.name.canonical} />}
                      fieldLabel={`Variant: ${variant.fields.name.canonical}`}
                      state={variant.fields.name.state}
                    >
                      <Input
                        aria-label={`${variant.fields.name.canonical} Afrikaans`}
                        disabled={!isProductRangeTranslationTargetManual(translation, target)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        value={field.state.value}
                      />
                    </CatalogTranslationFieldFrame>
                  )}
                </form.Field>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <CatalogTranslationRevertDialog
        fieldLabel={pendingRevert ? getTargetLabel(translation, pendingRevert) : 'translation'}
        isOpen={pendingRevert !== null}
        isPending={isTogglePending}
        onConfirm={confirmRevert}
        onOpenChange={dismissRevert}
      />
    </form>
  );
};

function getTargetLabel(translation: CatalogProductRangeTranslation, target: ProductRangeTranslationTarget): string {
  if (target.kind === 'range') return PRODUCT_RANGE_TRANSLATION_FIELD_LABELS[target.field];
  return translation.variants.find((variant) => variant.id === target.variantId)?.fields.name.canonical ?? 'Variant';
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
