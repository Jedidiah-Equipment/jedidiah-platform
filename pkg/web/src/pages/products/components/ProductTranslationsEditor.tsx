import type { CatalogProductTranslation, CatalogProductTranslationPatchInput, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo } from 'react';

import {
  CatalogTranslationCanonicalStringList,
  CatalogTranslationCanonicalTechnicalDetails,
  CatalogTranslationCanonicalText,
  CatalogTranslationFieldFrame,
  CatalogTranslationRevertDialog,
  CatalogTranslationStringListInputs,
  CatalogTranslationTechnicalDetailsInputs,
} from '@/components/catalog-translations/CatalogTranslationField.js';
import { PRODUCT_TRANSLATION_FIELD_LABELS } from '@/components/catalog-translations/catalog-translation-labels.js';
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
  getProductTranslationTargetState,
  isProductTranslationTargetManual,
  ProductTranslationFormValuesSchema,
  type ProductTranslationTarget,
  toProductTranslationFormValues,
  toProductTranslationPatch,
  toProductTranslationTogglePatch,
} from './product-translations/types.js';

type ProductTranslationsEditorProps = {
  productId: UUID;
};

const PRODUCT_TRANSLATION_TEXT_FIELDS = ['name', 'nameHighlight', 'category', 'description'] as const;

export const ProductTranslationsEditor: React.FC<ProductTranslationsEditorProps> = ({ productId }) => {
  const trpc = useTRPC();
  const { invalidateCatalogTranslations } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const { awaitRegeneration, refetchInterval, settleRegeneration } = useTranslationRegeneration({
    getTargetState: getProductTranslationTargetState,
  });

  const translationQuery = useQuery({
    ...trpc.catalogTranslations.getProduct.queryOptions({ id: productId }),
    refetchInterval: (query) => refetchInterval(query.state.data),
  });

  useEffect(() => settleRegeneration(translationQuery.data), [settleRegeneration, translationQuery.data]);

  const updateMutation = useMutation(
    trpc.catalogTranslations.updateProduct.mutationOptions({
      onSuccess: async () => {
        await invalidateCatalogTranslations();
      },
    }),
  );

  const toggleManual = async (
    target: ProductTranslationTarget,
    isManual: boolean,
    values: ReturnType<typeof toProductTranslationFormValues>,
  ) => {
    try {
      await updateMutation.mutateAsync(toProductTranslationTogglePatch(productId, values, target, isManual));
      if (!isManual) awaitRegeneration(target);
      return true;
    } catch (error) {
      showMutationError(error, 'Unable to update the manual translation setting.');
      return false;
    }
  };

  return (
    <TabsContent className="pt-4" value="translations">
      {translationQuery.isPending ? <ProductTranslationsSkeleton /> : null}
      <ErrorMessage error={translationQuery.error} fallbackMessage="Unable to load Product translations." />
      {translationQuery.data ? (
        <ProductTranslationsForm
          isTogglePending={updateMutation.isPending}
          onSave={(input) => updateMutation.mutateAsync(input)}
          onToggle={toggleManual}
          translation={translationQuery.data}
        />
      ) : null}
    </TabsContent>
  );
};

type ProductTranslationsFormProps = {
  isTogglePending: boolean;
  onSave: (input: CatalogProductTranslationPatchInput) => Promise<unknown>;
  onToggle: (
    target: ProductTranslationTarget,
    isManual: boolean,
    values: ReturnType<typeof toProductTranslationFormValues>,
  ) => Promise<boolean>;
  translation: CatalogProductTranslation;
};

const ProductTranslationsForm: React.FC<ProductTranslationsFormProps> = ({
  isTogglePending,
  onSave,
  onToggle,
  translation,
}) => {
  const initialValues = useMemo(() => toProductTranslationFormValues(translation), [translation]);
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: initialValues,
    failureMessage: 'Unable to save the Afrikaans translation.',
    save: onSave,
    toInput: (values) => toProductTranslationPatch(translation, initialValues, values),
    validator: ProductTranslationFormValuesSchema,
  });

  useAutosaveServerSync({ autosave, initialValues, translation });

  const { confirmRevert, dismissRevert, enable, pendingRevert, requestRevert } = useManualOverrideToggle({
    flush: autosave.flush,
    isPending: isTogglePending,
    onToggle: (target: ProductTranslationTarget, isManual: boolean) => onToggle(target, isManual, form.state.values),
  });

  const fieldControlProps = (target: ProductTranslationTarget) => {
    const isManual = isProductTranslationTargetManual(translation, target);

    return {
      isManual,
      isPending: isTogglePending,
      onEnable: () => enable(target),
      onInteract: () => {
        if (isManual && getProductTranslationTargetState(translation, target) === 'needsReview') {
          form.setFieldValue('reviewedTarget', target);
        }
      },
      onRequestRevert: () => requestRevert(target),
    };
  };

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      <Card>
        <CardHeader>
          <CardTitle>Product translations</CardTitle>
          <CardDescription>
            English is the canonical source. Enable Manual to review or replace an Afrikaans value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {PRODUCT_TRANSLATION_TEXT_FIELDS.map((fieldName) => {
            const target = { field: fieldName, kind: 'product' } as const;
            const fieldTranslation = translation.fields[fieldName];
            const label = PRODUCT_TRANSLATION_FIELD_LABELS[fieldName];
            return (
              <form.Field key={fieldName} name={`fields.${fieldName}`}>
                {(field) => (
                  <CatalogTranslationFieldFrame
                    {...fieldControlProps(target)}
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
                        disabled={!isProductTranslationTargetManual(translation, target)}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        rows={4}
                        value={field.state.value}
                      />
                    ) : (
                      <Input
                        aria-label={`${label} Afrikaans`}
                        disabled={!isProductTranslationTargetManual(translation, target)}
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
          <form.Field name="fields.keyFeatures">
            {(field) => {
              const target = { field: 'keyFeatures', kind: 'product' } as const;
              return (
                <CatalogTranslationFieldFrame
                  {...fieldControlProps(target)}
                  canonical={<CatalogTranslationCanonicalStringList value={translation.fields.keyFeatures.canonical} />}
                  fieldLabel="Key features"
                  state={translation.fields.keyFeatures.state}
                >
                  <CatalogTranslationStringListInputs
                    canonical={translation.fields.keyFeatures.canonical}
                    fieldLabel="Key features"
                    isManual={isProductTranslationTargetManual(translation, target)}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                </CatalogTranslationFieldFrame>
              );
            }}
          </form.Field>
          <form.Field name="fields.technicalDetails">
            {(field) => {
              const target = { field: 'technicalDetails', kind: 'product' } as const;
              return (
                <CatalogTranslationFieldFrame
                  {...fieldControlProps(target)}
                  canonical={
                    <CatalogTranslationCanonicalTechnicalDetails
                      value={translation.fields.technicalDetails.canonical}
                    />
                  }
                  fieldLabel="Technical details"
                  state={translation.fields.technicalDetails.state}
                >
                  <CatalogTranslationTechnicalDetailsInputs
                    canonical={translation.fields.technicalDetails.canonical}
                    isManual={isProductTranslationTargetManual(translation, target)}
                    onValueChange={field.handleChange}
                    value={field.state.value}
                  />
                </CatalogTranslationFieldFrame>
              );
            }}
          </form.Field>
        </CardContent>
      </Card>
      {translation.assemblies.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assembly translations</CardTitle>
            <CardDescription>Assembly names use the same per-field manual override behavior.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {translation.assemblies.map((assembly, index) => {
              const target = { assemblyId: assembly.id, kind: 'assembly' } as const;
              return (
                <form.Field key={assembly.id} name={`assemblies[${index}].name`}>
                  {(field) => (
                    <CatalogTranslationFieldFrame
                      {...fieldControlProps(target)}
                      canonical={<CatalogTranslationCanonicalText value={assembly.fields.name.canonical} />}
                      fieldLabel={`Assembly: ${assembly.fields.name.canonical}`}
                      state={assembly.fields.name.state}
                    >
                      <Input
                        aria-label={`${assembly.fields.name.canonical} Afrikaans`}
                        disabled={!isProductTranslationTargetManual(translation, target)}
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

function getTargetLabel(translation: CatalogProductTranslation, target: ProductTranslationTarget): string {
  if (target.kind === 'product') {
    return PRODUCT_TRANSLATION_FIELD_LABELS[target.field];
  }
  return (
    translation.assemblies.find((assembly) => assembly.id === target.assemblyId)?.fields.name.canonical ?? 'Assembly'
  );
}

function ProductTranslationsSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
