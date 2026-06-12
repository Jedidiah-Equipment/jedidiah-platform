import { computeQuoteDiscountAmount, computeQuoteTotal, formatDate, resolveEffectiveBom } from '@pkg/domain';
import {
  type PriorityQuote,
  type QuoteDetail,
  type QuoteDocumentGenerationWarning,
  QuoteStatus,
  type QuoteUpdateInput,
} from '@pkg/schema';
import {
  IconAlertTriangle,
  IconComponents,
  IconNotes,
  IconReceipt2,
  IconSettings,
  IconTruckDelivery,
} from '@tabler/icons-react';
import type React from 'react';
import { useMemo, useState } from 'react';

import { AuditTable, useQuoteAuditTableStore } from '@/components/audit/AuditTable.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';
import { useCan } from '@/hooks/use-access.js';

import { quoteStatusLabels } from '../QuoteStatusBadge.js';
import { QuoteFormValues, resolveSelectedAssemblySnapshots, toQuoteFormValues, toQuoteUpdateInput } from '../types.js';
import { QuoteAssembliesSelector } from './QuoteAssembliesSelector.js';
import { QuoteDocumentsSection } from './QuoteDocumentsSection.js';
import { QuoteFormSection } from './QuoteFormSection.js';
import { type QuoteComputedSummary, QuoteRightPanel } from './QuoteRightPanel.js';

type QuoteFormProps = {
  onSave: (value: QuoteUpdateInput) => Promise<unknown>;
  priorityQuote?: PriorityQuote | null | undefined;
  quote: QuoteDetail;
};

export const QuoteForm: React.FC<QuoteFormProps> = ({ onSave, priorityQuote, quote }) => {
  const isLocked = quote.job !== null;

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
  const auditAccess = useCan('audit:read');
  const [generationWarnings, setGenerationWarnings] = useState<QuoteDocumentGenerationWarning[]>([]);
  const quoteAuditFilters = useMemo(
    () => ({
      entityIds: [quote.id],
      entityTypes: ['quote' as const],
    }),
    [quote.id],
  );

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
              {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
            </TabsList>
            <TabsContent className="pt-4" value="details">
              <div className="grid gap-6">
                {priorityQuote ? <QuotePriorityAlert priorityQuote={priorityQuote} /> : null}
                <QuoteFormSection icon={IconSettings} title="Quote setup">
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

                <QuoteFormSection icon={IconTruckDelivery} title="Dates and delivery">
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

                <QuoteFormSection icon={IconReceipt2} title="Pricing">
                  <div className="grid gap-3 md:grid-cols-2">
                    <form.AppField name="discountPercent">
                      {(field) => (
                        <field.NumberField
                          decimals={2}
                          disabled={isLocked}
                          emptyValue={0}
                          label="Discount percent"
                          max={100}
                          min={0}
                          step="0.01"
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

                <QuoteFormSection icon={IconNotes} title="Internal notes">
                  <form.AppField name="notes">{(field) => <field.TextareaField rows={4} />}</form.AppField>
                </QuoteFormSection>

                <QuoteFormSection
                  description="Standard assemblies are included. Optional assemblies add to the quote."
                  icon={IconComponents}
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
              <QuoteFormSection icon={IconNotes} title="Quote Notes">
                <form.AppField name="documentNotes">
                  {(field) => (
                    <field.TextareaField
                      rows={4}
                      placeholder="Notes entered here will be included in the quote document."
                    />
                  )}
                </form.AppField>
              </QuoteFormSection>
              <div className="mt-6 grid gap-6">
                <QuoteDocumentsSection
                  generationWarnings={generationWarnings}
                  hasUnsavedChanges={autosave.state.hasUnsavedChanges}
                  onGenerated={(warnings) => setGenerationWarnings(warnings)}
                  quote={quote}
                />
              </div>
            </TabsContent>
            {auditAccess.can ? (
              <TabsContent className="pt-4" value="audit">
                <AuditTable
                  emptyMessage="No audit events found for this quote."
                  fixedFilters={quoteAuditFilters}
                  showEntityTypeFilter={false}
                  store={useQuoteAuditTableStore}
                />
              </TabsContent>
            ) : null}
          </Tabs>
          <form.Subscribe
            selector={(state): QuoteComputedSummary => {
              const discountPercent = state.values.discountPercent;
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
                discountAmount: computeQuoteDiscountAmount({
                  discountPercent,
                  quotedBasePrice,
                  selectedAssemblyPrices: selectedAssemblies.map((assembly) => assembly.quotedPrice),
                }),
                discountPercent,
                productPrice: quotedBasePrice,
                currencyCode: selectedProduct.currencyCode,
                selectedAssemblies,
                selectedAssemblyTotal,
                total: computeQuoteTotal({
                  deliveryIncluded,
                  deliveryPrice,
                  discountPercent,
                  quotedBasePrice,
                  selectedAssemblyPrices: selectedAssemblies.map((assembly) => assembly.quotedPrice),
                }),
              };
            }}
          >
            {(summary) => <QuoteRightPanel flushAutosave={autosave.flush} quote={quote} summary={summary} />}
          </form.Subscribe>
        </div>
      </FieldGroup>
    </form>
  );
};

const QuotePriorityAlert: React.FC<{
  priorityQuote: PriorityQuote;
}> = ({ priorityQuote }) => {
  const buildDuration = formatWorkingDays(priorityQuote.productBuildTimeDays);

  return (
    <Alert className="border-warning/45 bg-warning/10 text-warning-foreground">
      <IconAlertTriangle className="text-warning" />
      <AlertTitle>Needs job</AlertTitle>
      <AlertDescription className="text-warning-foreground/85">
        This quote is accepted but no Job has been started. {describeDeliveryDates(priorityQuote)} The{' '}
        {priorityQuote.productName} takes {buildDuration} to build, so start a Job soon to reserve Bay capacity in time
        for {formatQuoteDate(priorityQuote.earliestDeliveryDate)}.
      </AlertDescription>
    </Alert>
  );
};

function describeDeliveryDates(quote: PriorityQuote): string {
  const preferred = quote.preferredDeliveryDate ? formatQuoteDate(quote.preferredDeliveryDate) : null;
  const planned = quote.plannedDeliveryDate ? formatQuoteDate(quote.plannedDeliveryDate) : null;

  if (preferred && planned) {
    return `The customer prefers delivery by ${preferred}, and delivery is planned for ${planned}.`;
  }

  if (preferred) {
    return `The customer prefers delivery by ${preferred}.`;
  }

  return planned ? `Delivery is planned for ${planned}.` : '';
}

function formatQuoteDate(value: string): string {
  return formatDate(value, 'MMM d, yyyy');
}

function formatWorkingDays(days: number): string {
  return `${days} working day${days === 1 ? '' : 's'}`;
}
