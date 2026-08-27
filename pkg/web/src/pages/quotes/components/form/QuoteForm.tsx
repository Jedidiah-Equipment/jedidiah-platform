import {
  computeQuoteSummary,
  editableLockedQuoteFields,
  formatDate,
  isQuoteLocked,
  quoteKindLabels,
  quoteStatusLabels,
} from '@pkg/domain';
import {
  type JobListInput,
  type PriorityQuote,
  type QuoteDetail,
  type QuoteDocumentGenerationWarning,
  QuoteStatus,
  type QuoteUpdateInput,
} from '@pkg/schema';
import {
  IconAlertTriangle,
  IconComponents,
  IconListDetails,
  IconNotes,
  IconReceipt2,
  IconSettings,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';

import { AuditTable, useQuoteAuditTableStore } from '@/components/audit/AuditTable.js';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobSheet } from '@/pages/jobs/components/JobSheet.js';
import { QuoteCancellationDialog } from '../QuoteCancellationAction.js';
import { getQuoteFormValuesValidator, toQuoteFormValues, toQuoteUpdateInput, toQuoteWorkItemInput } from '../types.js';
import { QuoteAssembliesSelector } from './QuoteAssembliesSelector.js';
import { QuoteDocumentsSection } from './QuoteDocumentsSection.js';
import { QuoteFormSection } from './QuoteFormSection.js';
import { QuoteRightPanel } from './QuoteRightPanel.js';
import { QuoteAddWorkItemButton, QuoteWorkItemsEditor } from './QuoteWorkItemsEditor.js';

type QuoteFormProps = {
  onSave: (value: QuoteUpdateInput) => Promise<unknown>;
  priorityQuote?: PriorityQuote | null | undefined;
  quote: QuoteDetail;
};

export const QuoteForm: React.FC<QuoteFormProps> = ({ onSave, priorityQuote, quote }) => {
  const isCustom = quote.kind === 'custom';
  const isLocked = isQuoteLocked({
    hasEverSourcedJob: quote.hasEverSourcedJob,
    hasProductUnit: quote.productUnitId !== null,
    kind: quote.kind,
    status: quote.status,
  });
  const lockEditableFields = editableLockedQuoteFields({
    hasProductUnit: quote.productUnitId !== null,
    kind: quote.kind,
    status: quote.status,
  });
  const canEdit = (field: string) => !isLocked || lockEditableFields.has(field);
  const quoteCurrencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const catalogAssemblies = quote.product?.assemblies ?? [];
  const salespeopleOptions = useSalesPersonOptions();
  const auditAccess = useCan('audit:read');
  const jobReadAccess = useCan('job:read');
  const canOpenJobs = jobReadAccess.can;
  const trpc = useTRPC();
  const [generationWarnings, setGenerationWarnings] = useState<QuoteDocumentGenerationWarning[]>([]);
  const [cancellationDialogOpen, setCancellationDialogOpen] = useState(false);
  const [jobSheetOpen, setJobSheetOpen] = useState(false);
  const quoteAuditFilters = useMemo(
    () => ({
      entityIds: [quote.id],
      entityTypes: ['quote' as const],
    }),
    [quote.id],
  );
  const linkedJobInput = useMemo(
    () =>
      ({
        columnFilters: {},
        filters: quote.job ? { jobId: quote.job.jobId } : {},
        include: { scheduleState: true },
        cursor: 0,
        limit: 1,
        search: '',
        sortBy: 'createdAt',
        sortDirection: 'asc',
      }) satisfies JobListInput,
    [quote.job],
  );
  const linkedJobQuery = useQuery(
    trpc.jobs.list.queryOptions(linkedJobInput, {
      enabled: canOpenJobs && quote.job !== null,
    }),
  );

  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toQuoteFormValues(quote),
    failureMessage: 'Unable to update quote.',
    save: onSave,
    toInput: (value) => toQuoteUpdateInput({ id: quote.id, kind: quote.kind, value }),
    validator: getQuoteFormValuesValidator(quote.kind),
  });

  return (
    <form.AppForm>
      <form {...formProps} className="grid gap-4">
        {quote.status === 'cancelled' ? (
          <Alert>
            <IconAlertTriangle />
            <AlertTitle>Cancellation reason</AlertTitle>
            <AlertDescription>{quote.cancellationReason}</AlertDescription>
          </Alert>
        ) : null}
        <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
        <FieldGroup className="gap-6">
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <Tabs className="min-w-0" defaultValue="details" size="sm">
              <div className="flex items-center justify-between gap-2">
                <TabsList variant="default">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="documents">Documents</TabsTrigger>
                  {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
                </TabsList>
                <GiveFeedbackButton subject={{ subjectType: 'quote', quoteId: quote.id }} subjectLabel={quote.code} />
              </div>
              <TabsContent className="pt-4" value="details">
                <div className="grid gap-6">
                  {priorityQuote ? <QuotePriorityAlert priorityQuote={priorityQuote} /> : null}
                  <QuoteFormSection icon={IconSettings} title="Quote setup">
                    <div className="grid gap-3 md:grid-cols-2">
                      {isCustom ? (
                        <form.AppField name="workTitle">
                          {(field) => <field.TextField autoComplete="off" disabled={isLocked} label="Work title" />}
                        </form.AppField>
                      ) : null}
                      <form.AppField name="salesPersonId">
                        {(field) => (
                          <field.SelectField
                            label="Salesperson"
                            disabled={isLocked}
                            onValueCommit={autosave.commit}
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
                            onValueCommit={autosave.commit}
                            onValueSelect={(value) => {
                              const status = QuoteStatus.parse(value);
                              if (status !== 'cancelled') return;

                              setCancellationDialogOpen(true);
                              return false;
                            }}
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
                          <field.DatePickerField label="Preferred delivery date" onValueCommit={autosave.commit} />
                        )}
                      </form.AppField>
                      <form.AppField name="plannedDeliveryDate">
                        {(field) => (
                          <field.DatePickerField label="Planned delivery date" onValueCommit={autosave.commit} />
                        )}
                      </form.AppField>
                      <form.AppField name="validUntil">
                        {(field) => <field.DatePickerField label="Valid until" onValueCommit={autosave.commit} />}
                      </form.AppField>
                      <form.AppField name="invoiceNumber">
                        {(field) => (
                          <field.TextField
                            autoComplete="off"
                            disabled={!canEdit('invoiceNumber')}
                            label="Invoice number"
                          />
                        )}
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

                                    if (isChecked) {
                                      form.setFieldValue('deliveryPrice', 0);
                                    }

                                    autosave.commit();
                                  }}
                                />
                                <FieldLabel htmlFor={field.name}>Delivery included in sale price</FieldLabel>
                              </div>
                              <FieldError errors={fieldErrors} />
                            </Field>
                          );
                        }}
                      </form.Field>
                      <form.Subscribe selector={(state) => state.values.deliveryIncluded}>
                        {(deliveryIncluded) =>
                          !deliveryIncluded ? (
                            <form.AppField name="deliveryPrice">
                              {(field) => (
                                <field.CurrencyField
                                  currencyCode={quoteCurrencyCode}
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
                            disabled={!canEdit('discountPercent')}
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

                  {isCustom ? (
                    <form.Field name="workItems" mode="array">
                      {(workItemsField) => (
                        <QuoteFormSection
                          action={
                            <QuoteAddWorkItemButton readOnly={!canEdit('workItems')} workItemsField={workItemsField} />
                          }
                          icon={IconListDetails}
                          title="Work items"
                        >
                          <QuoteWorkItemsEditor
                            currencyCode={quoteCurrencyCode}
                            onRemoveWorkItem={autosave.commit}
                            readOnly={!canEdit('workItems')}
                            workItemsField={workItemsField}
                          />
                        </QuoteFormSection>
                      )}
                    </form.Field>
                  ) : null}

                  <QuoteFormSection icon={IconNotes} title="Internal notes">
                    <form.AppField name="notes">{(field) => <field.TextareaField rows={4} />}</form.AppField>
                  </QuoteFormSection>

                  {isCustom ? null : (
                    <QuoteFormSection
                      description="Standard assemblies are included. Optional assemblies add to the quote."
                      icon={IconComponents}
                      title="Assemblies"
                    >
                      <form.Field name="selectedAssemblies">
                        {(field) => (
                          <QuoteAssembliesSelector
                            catalogAssemblies={catalogAssemblies}
                            currencyCode={quoteCurrencyCode}
                            initialSelections={quote.selectedAssemblies}
                            onChange={(value) => {
                              field.handleChange(value);
                              autosave.commit();
                            }}
                            readOnly={isLocked}
                            value={field.state.value}
                          />
                        )}
                      </form.Field>
                    </QuoteFormSection>
                  )}
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
                    flushAutosave={autosave.flush}
                    generationWarnings={generationWarnings}
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
              selector={(state) =>
                computeQuoteSummary({
                  quote,
                  values: { ...state.values, workItems: state.values.workItems.map(toQuoteWorkItemInput) },
                })
              }
            >
              {(summary) => (
                <QuoteRightPanel
                  canOpenJobs={canOpenJobs}
                  jobScheduleError={linkedJobQuery.error}
                  jobScheduleState={linkedJobQuery.data?.items[0]?.scheduleState ?? null}
                  onOpenJob={() => setJobSheetOpen(true)}
                  quote={quote}
                  summary={summary}
                />
              )}
            </form.Subscribe>
          </div>
        </FieldGroup>
      </form>
      {/* Cancelling settles the Job and the machine too, so the status field hands the whole act to
          the one mutation that knows how rather than autosaving a status change. */}
      <QuoteCancellationDialog onOpenChange={setCancellationDialogOpen} open={cancellationDialogOpen} quote={quote} />
      {jobSheetOpen && quote.job ? <JobSheet jobId={quote.job.jobId} onClose={() => setJobSheetOpen(false)} /> : null}
    </form.AppForm>
  );
};

const QuotePriorityAlert: React.FC<{
  priorityQuote: PriorityQuote;
}> = ({ priorityQuote }) => {
  if (priorityQuote.kind === 'custom') {
    return (
      <Alert className="border-warning/45 bg-warning/10 text-warning-foreground">
        <IconAlertTriangle className="text-warning" />
        <AlertTitle>Accepted {quoteKindLabels.custom} quote</AlertTitle>
        <AlertDescription className="text-warning-foreground/85">
          This {quoteKindLabels.custom} quote is accepted and not linked to a Job.{' '}
          {describeDeliveryDates(priorityQuote)} Keep the delivery commitment visible for{' '}
          {formatQuoteDate(priorityQuote.earliestDeliveryDate)}.
        </AlertDescription>
      </Alert>
    );
  }

  const buildDuration = priorityQuote.product ? formatWorkingDays(priorityQuote.product.buildTimeDays) : '—';
  const productName = priorityQuote.product?.name ?? '—';

  return (
    <Alert className="border-warning/45 bg-warning/10 text-warning-foreground">
      <IconAlertTriangle className="text-warning" />
      <AlertTitle>Needs job</AlertTitle>
      <AlertDescription className="text-warning-foreground/85">
        This quote is accepted but no Job has been started. {describeDeliveryDates(priorityQuote)} The {productName}{' '}
        takes {buildDuration} to build, so start a Job soon to reserve Bay capacity in time for{' '}
        {formatQuoteDate(priorityQuote.earliestDeliveryDate)}.
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
