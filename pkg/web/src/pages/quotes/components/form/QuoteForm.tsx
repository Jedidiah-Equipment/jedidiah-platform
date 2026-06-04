import { computeQuoteTotal, resolveEffectiveBom } from '@pkg/domain';
import { type QuoteDetail, type QuoteDocumentGenerationWarning, QuoteStatus, type QuoteUpdateInput } from '@pkg/schema';
import type React from 'react';
import { useMemo, useState } from 'react';

import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';

import { quoteStatusLabels } from '../QuoteStatusBadge.js';
import { QuoteFormValues, resolveSelectedAssemblySnapshots, toQuoteFormValues, toQuoteUpdateInput } from '../types.js';
import { QuoteAssembliesSelector } from './QuoteAssembliesSelector.js';
import { QuoteDocumentsSection } from './QuoteDocumentsSection.js';
import { QuoteFormSection } from './QuoteFormSection.js';
import { type QuoteComputedSummary, QuoteRightPanel } from './QuoteRightPanel.js';

type QuoteFormProps = {
  onSave: (value: QuoteUpdateInput) => Promise<unknown>;
  quote: QuoteDetail;
};

export const QuoteForm: React.FC<QuoteFormProps> = ({ onSave, quote }) => {
  const isLocked = quote.linkedJobs.length > 0;

  const selectedProduct = useMemo(
    () => ({
      assemblies: quote.productAssemblies,
      basePrice: quote.quotedBasePrice,
      currencyCode: quote.productCurrencyCode,
      id: quote.productId,
      modelCode: quote.productModelCode,
      name: quote.productName,
    }),
    [quote],
  );
  const salespeopleOptions = useSalesPersonOptions();
  const [generationWarnings, setGenerationWarnings] = useState<QuoteDocumentGenerationWarning[]>([]);

  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toQuoteFormValues(quote),
    failureMessage: 'Unable to update quote.',
    save: onSave,
    toInput: (value) => toQuoteUpdateInput({ id: quote.id, value }),
    validator: QuoteFormValues,
  });

  const saveCommittedField = () => {
    autosave.markChanged();
    queueMicrotask(() => {
      void autosave.flush();
    });
  };

  return (
    <form {...formProps} className="grid gap-4">
      <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      <FieldGroup className="gap-6">
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Tabs className="min-w-0" defaultValue="details" size="sm">
            <TabsList variant="default">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
            <TabsContent className="pt-4" value="details">
              <div className="grid gap-6">
                <QuoteFormSection title="Quote setup">
                  <div className="grid gap-3 md:grid-cols-2">
                    <form.AppField name="salesPersonId">
                      {(field) => (
                        <field.SelectField
                          label="Salesperson"
                          disabled={isLocked}
                          onValueCommit={saveCommittedField}
                          options={salespeopleOptions.selectOptions}
                          placeholder="Select salesperson"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="status">
                      {(field) => (
                        <field.SelectField
                          label="Status"
                          disabled={isLocked}
                          onValueCommit={saveCommittedField}
                          options={QuoteStatus.options.map((status) => ({
                            label: quoteStatusLabels[status],
                            value: status,
                          }))}
                        />
                      )}
                    </form.AppField>
                  </div>
                </QuoteFormSection>

                <QuoteFormSection title="Dates and delivery">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <form.AppField name="preferredDeliveryDate">
                      {(field) => (
                        <field.DatePickerField label="Preferred delivery date" onValueCommit={saveCommittedField} />
                      )}
                    </form.AppField>
                    <form.AppField name="plannedDeliveryDate">
                      {(field) => (
                        <field.DatePickerField label="Planned delivery date" onValueCommit={saveCommittedField} />
                      )}
                    </form.AppField>
                    <form.AppField name="validUntil">
                      {(field) => <field.DatePickerField label="Valid until" onValueCommit={saveCommittedField} />}
                    </form.AppField>
                    <form.Field name="deliveryIncluded">
                      {(field) => {
                        const fieldErrors = getFieldErrors(field.state.meta.errors);
                        const isInvalid = fieldErrors.length > 0;

                        return (
                          <Field className="justify-end" data-invalid={isInvalid}>
                            <FieldLabel aria-hidden className="invisible">
                              Delivery
                            </FieldLabel>
                            <div className="flex min-h-9 items-center gap-2">
                              <Checkbox
                                aria-invalid={isInvalid}
                                checked={field.state.value}
                                disabled={isLocked}
                                id={field.name}
                                name={field.name}
                                onBlur={field.handleBlur}
                                onCheckedChange={(checked) => {
                                  const isChecked = checked === true;

                                  field.handleChange(isChecked);

                                  if (!isChecked) {
                                    form.setFieldValue('deliveryPrice', 0);
                                  }

                                  saveCommittedField();
                                }}
                              />
                              <FieldLabel htmlFor={field.name}>Delivery included</FieldLabel>
                            </div>
                            <FieldError errors={fieldErrors} />
                          </Field>
                        );
                      }}
                    </form.Field>
                    <form.Subscribe selector={(state) => state.values.deliveryIncluded}>
                      {(deliveryIncluded) =>
                        deliveryIncluded ? (
                          <form.AppField name="deliveryPrice">
                            {(field) => (
                              <field.CurrencyField
                                currencyCode={selectedProduct.currencyCode}
                                disabled={isLocked}
                                label="Delivery price"
                              />
                            )}
                          </form.AppField>
                        ) : null
                      }
                    </form.Subscribe>
                  </div>
                </QuoteFormSection>

                <QuoteFormSection title="Pricing">
                  <div className="grid gap-3 md:grid-cols-2">
                    <form.AppField name="discountAmount">
                      {(field) => (
                        <field.CurrencyField
                          currencyCode={selectedProduct.currencyCode}
                          disabled={isLocked}
                          label="Discount amount"
                        />
                      )}
                    </form.AppField>
                    <form.AppField name="depositPercent">
                      {(field) => (
                        <field.NumberField
                          decimals={2}
                          disabled={isLocked}
                          emptyValue={0}
                          label="Deposit percent"
                          max={100}
                          min={0}
                          step="0.01"
                        />
                      )}
                    </form.AppField>
                  </div>
                </QuoteFormSection>

                <QuoteFormSection title="Internal notes">
                  <form.AppField name="notes">{(field) => <field.TextareaField rows={4} />}</form.AppField>
                </QuoteFormSection>

                <QuoteFormSection
                  description="Standard assemblies are included. Optional assemblies add to the quote."
                  title="Assemblies"
                >
                  <form.Field name="selectedAssemblies">
                    {(field) => (
                      <QuoteAssembliesSelector
                        catalogAssemblies={selectedProduct.assemblies}
                        currencyCode={selectedProduct.currencyCode}
                        initialSelections={quote.selectedAssemblies}
                        onChange={(value) => {
                          field.handleChange(value);
                          saveCommittedField();
                        }}
                        readOnly={isLocked}
                        value={field.state.value}
                      />
                    )}
                  </form.Field>
                </QuoteFormSection>
              </div>
            </TabsContent>
            <TabsContent className="pt-4" value="documents">
              <form.AppField name="documentNotes">
                {(field) => (
                  <field.TextareaField
                    label="Quote Notes"
                    rows={4}
                    placeholder="Notes entered here will be included in the quote document."
                  />
                )}
              </form.AppField>
              <div className="mt-6 grid gap-6">
                <QuoteDocumentsSection
                  generationWarnings={generationWarnings}
                  hasUnsavedChanges={autosave.state.hasUnsavedChanges}
                  onGenerated={(warnings) => setGenerationWarnings(warnings)}
                  quote={quote}
                />
              </div>
            </TabsContent>
          </Tabs>
          <form.Subscribe
            selector={(state): QuoteComputedSummary => {
              const discountAmount = state.values.discountAmount;
              const deliveryIncluded = state.values.deliveryIncluded;
              const deliveryPrice = deliveryIncluded ? state.values.deliveryPrice : 0;
              const quotedBasePrice = quote.quotedBasePrice;
              const selectedSnapshots = resolveSelectedAssemblySnapshots({
                catalogAssemblies: selectedProduct.assemblies,
                formSelections: state.values.selectedAssemblies,
                initialSelections: quote.selectedAssemblies,
              });
              // Stale selections (reference gone from the catalog) are excluded from the on-screen
              // Quote Total so the figure reflects only assemblies that can still be produced.
              const { staleSelections } = resolveEffectiveBom({
                catalogAssemblies: selectedProduct.assemblies,
                selectedAssemblies: selectedSnapshots,
              });
              const staleSnapshots = new Set(staleSelections);
              const selectedAssemblies = selectedSnapshots.filter((snapshot) => !staleSnapshots.has(snapshot));
              const selectedAssemblyTotal = selectedAssemblies.reduce(
                (total, assembly) => total + assembly.quotedPrice,
                0,
              );

              return {
                deliveryIncluded,
                deliveryPrice,
                discountAmount,
                discountPercent: quotedBasePrice > 0 ? (discountAmount / quotedBasePrice) * 100 : 0,
                productPrice: quotedBasePrice,
                currencyCode: selectedProduct.currencyCode,
                selectedAssemblies,
                selectedAssemblyTotal,
                total: computeQuoteTotal({
                  deliveryIncluded,
                  deliveryPrice,
                  discountAmount,
                  quotedBasePrice,
                  selectedAssemblyPrices: selectedAssemblies.map((assembly) => assembly.quotedPrice),
                }),
              };
            }}
          >
            {(summary) => <QuoteRightPanel quote={quote} summary={summary} />}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  );
};
