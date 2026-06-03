import {
  computeQuoteTotal,
  formatBytes,
  formatCurrency,
  formatDate,
  formatPercent,
  hasPermission,
  resolveEffectiveBom,
} from '@pkg/domain';
import {
  type Assembly,
  type QuoteDetail,
  type QuoteDocument,
  type QuoteDocumentGenerationWarning,
  type QuoteSelectedAssembly,
  QuoteStatus,
  type QuoteUpdateInput,
} from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FilePlus2Icon,
  FileTextIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  ReceiptTextIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { getFieldErrors } from '@/components/form/utils/field-errors.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Separator } from '@/components/ui/separator.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useSalesPersonOptions } from '@/hooks/options/index.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { downloadQuoteDocument } from '@/utils/document.js';
import { GenerateJobFromQuoteDialog } from './GenerateJobFromQuoteDialog.js';
import { quoteStatusLabels } from './QuoteStatusBadge.js';
import {
  getDefaultQuoteDocumentLeadTime,
  QuoteFormValues,
  resolveSelectedAssemblySnapshots,
  type SelectedAssemblySnapshot,
  toQuoteFormValues,
  toQuoteUpdateInput,
} from './types.js';

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
          <Tabs className="min-w-0" defaultValue="details">
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
                  <form.AppField name="notes">
                    {(field) => <field.TextareaField label="Notes" rows={4} />}
                  </form.AppField>
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
              <QuoteFormSection title="Customer packet">
                <form.AppField name="documentNotes">
                  {(field) => <field.TextareaField label="Document Notes" rows={4} />}
                </form.AppField>
              </QuoteFormSection>
              <div className="mt-6 grid gap-6">
                <QuoteDocumentActions
                  hasUnsavedChanges={autosave.state.hasUnsavedChanges}
                  onGenerated={(warnings) => setGenerationWarnings(warnings)}
                  quote={quote}
                />
                <QuoteDocumentsSection generationWarnings={generationWarnings} quoteId={quote.id} />
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
      <div className="flex justify-end gap-2 border-t pt-5">
        <GenerateJobFromQuoteDialog quote={quote} />
      </div>
    </form>
  );
};

type QuoteComputedSummary = {
  currencyCode: string;
  deliveryIncluded: boolean;
  deliveryPrice: number;
  discountAmount: number;
  discountPercent: number;
  productPrice: number;
  selectedAssemblies: SelectedAssemblySnapshot[];
  selectedAssemblyTotal: number;
  total: number;
};

function QuoteDocumentActions({
  hasUnsavedChanges,
  onGenerated,
  quote,
}: {
  hasUnsavedChanges: boolean;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
}) {
  return (
    <QuoteFormSection
      description="Generate saved PDF revisions from the latest saved Quote data."
      title="Document generation"
    >
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1 text-sm">
          <span className="font-medium">Quote Document</span>
          <span className="text-muted-foreground">
            {hasUnsavedChanges
              ? 'Waiting for autosave before a new document can be generated.'
              : 'Ready to generate from saved Quote details.'}
          </span>
        </div>
        <GenerateQuoteDocumentDialog hasUnsavedChanges={hasUnsavedChanges} onGenerated={onGenerated} quote={quote} />
      </div>
    </QuoteFormSection>
  );
}

function QuoteRightPanel({ quote, summary }: { quote: QuoteDetail; summary: QuoteComputedSummary }) {
  return (
    <aside className="order-first grid h-fit gap-4 border-b pb-5 text-sm xl:sticky xl:top-4 xl:order-0 xl:border-b-0 xl:border-l xl:pb-0 xl:pl-5">
      <QuoteCustomerCard quote={quote} />
      <QuoteProductCard quote={quote} />
      <QuoteTotalCard summary={summary} />
    </aside>
  );
}

function QuoteCustomerCard({ quote }: { quote: QuoteDetail }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Customer</CardDescription>
        <CardTitle className="min-w-0">
          <span className="block truncate">{quote.customerCompanyName}</span>
        </CardTitle>
        <CardAction>
          <EntityThumbnail
            className="size-10"
            label={quote.customerCompanyName}
            size="lg"
            thumbnailDataUrl={quote.customerThumbnailDataUrl}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <QuotePanelFact
          icon={<ReceiptTextIcon />}
          label="VAT"
          value={quote.customerVatNumber ?? 'Not captured'}
          muted={!quote.customerVatNumber}
        />
        <QuotePanelFact
          icon={<MailIcon />}
          label="Email"
          value={
            quote.customerEmail ? (
              <span className="flex min-w-0 items-center gap-1">
                <span className="min-w-0 truncate">{quote.customerEmail}</span>
                <CopyValueButton label="Copy customer email" value={quote.customerEmail} />
              </span>
            ) : (
              'Not captured'
            )
          }
          muted={!quote.customerEmail}
        />
        <QuotePanelFact
          icon={<PhoneIcon />}
          label={quote.customerContactPerson ? quote.customerContactPerson : 'Phone'}
          value={quote.customerPhone ?? 'Not captured'}
          muted={!quote.customerPhone}
        />
        <QuotePanelFact
          icon={<MapPinIcon />}
          label="Address"
          value={
            quote.customerAddress ? (
              <span className="block max-h-16 overflow-hidden whitespace-pre-line">{quote.customerAddress}</span>
            ) : (
              'Not captured'
            )
          }
          muted={!quote.customerAddress}
        />
      </CardContent>
    </Card>
  );
}

function QuoteProductCard({ quote }: { quote: QuoteDetail }) {
  const standardCount = quote.productAssemblies.filter((assembly) => assembly.kind === 'standard').length;
  const optionalCount = quote.productAssemblies.filter((assembly) => assembly.kind === 'optional').length;

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Product</CardDescription>
        <CardTitle className="min-w-0">
          <span className="block truncate">{quote.productName}</span>
        </CardTitle>
        <CardAction>
          <EntityThumbnail
            className="size-10"
            label={quote.productName}
            size="lg"
            thumbnailDataUrl={quote.productThumbnailDataUrl}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{quote.productModelCode}</Badge>
          <Badge variant={quote.productRequiresVinNumber ? 'secondary' : 'outline'}>
            {quote.productRequiresVinNumber ? 'VIN required' : 'No VIN required'}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <QuoteMiniMetric
            icon={<PackageIcon />}
            label="Base price"
            value={formatCurrency(quote.quotedBasePrice, quote.productCurrencyCode)}
          />
          <QuoteMiniMetric icon={<ClockIcon />} label="Build" value={`${quote.productBuildTimeDays} days`} />
          <QuoteMiniMetric label="Standard" value={String(standardCount)} />
          <QuoteMiniMetric label="Optional" value={String(optionalCount)} />
        </div>
        <Separator />
        <p className={cn('max-h-20 overflow-hidden text-sm', quote.productDescription ? '' : 'text-muted-foreground')}>
          {quote.productDescription ?? 'No product description captured.'}
        </p>
      </CardContent>
    </Card>
  );
}

function QuoteTotalCard({ summary }: { summary: QuoteComputedSummary }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Quote total</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{formatCurrency(summary.total, summary.currencyCode)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <QuoteSummaryRow label="Product price" value={formatCurrency(summary.productPrice, summary.currencyCode)} />
        <QuoteSummaryRow
          label="Less discount"
          value={`${formatCurrency(summary.discountAmount, summary.currencyCode)} (${formatPercent(summary.discountPercent)})`}
        />
        {summary.selectedAssemblyTotal > 0 ? (
          <div className="grid gap-1">
            <QuoteSummaryRow
              label="Optional assemblies"
              value={formatCurrency(summary.selectedAssemblyTotal, summary.currencyCode)}
            />
            <div className="grid gap-1 border-l pl-3">
              {summary.selectedAssemblies.map((assembly) => (
                <QuoteSummaryRow
                  className="text-xs"
                  key={`${assembly.id}:${assembly.productAssemblyId ?? 'stale'}`}
                  label={assembly.quotedName}
                  value={formatCurrency(assembly.quotedPrice, summary.currencyCode)}
                  valueClassName="text-muted-foreground"
                />
              ))}
            </div>
          </div>
        ) : null}
        {summary.deliveryIncluded ? (
          <QuoteSummaryRow label="Delivery" value={formatCurrency(summary.deliveryPrice, summary.currencyCode)} />
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t pt-2 font-medium">
          <span>Total</span>
          <span>{formatCurrency(summary.total, summary.currencyCode)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function QuotePanelFact({
  icon,
  label,
  muted,
  value,
}: {
  icon: React.ReactElement;
  label: string;
  muted?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
      <span className="pt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
      <span className="min-w-0">
        <span className="block text-muted-foreground text-xs">{label}</span>
        <span className={cn('block min-w-0', muted ? 'text-muted-foreground' : 'text-foreground')}>{value}</span>
      </span>
    </div>
  );
}

function QuoteMiniMetric({ icon, label, value }: { icon?: React.ReactElement; label: string; value: string }) {
  return (
    <div className="grid min-h-14 gap-1 rounded-md border bg-muted/20 p-2">
      <span className="flex items-center gap-1 text-muted-foreground text-xs">
        {icon ? <span className="[&>svg]:size-3.5">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function CopyValueButton({ label, value }: { label: string; value: string }) {
  const [isCopied, setIsCopied] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="shrink-0"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => {
              void navigator.clipboard
                .writeText(value)
                .then(() => {
                  setIsCopied(true);
                  setTimeout(() => setIsCopied(false), 2_000);
                })
                .catch(() => {
                  toast.error('Unable to copy value.');
                });
            }}
          />
        }
      >
        {isCopied ? <CheckIcon /> : <CopyIcon />}
      </TooltipTrigger>
      <TooltipContent>{isCopied ? 'Copied' : label}</TooltipContent>
    </Tooltip>
  );
}

function GenerateQuoteDocumentDialog({
  hasUnsavedChanges,
  onGenerated,
  quote,
}: {
  hasUnsavedChanges: boolean;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [isOpen, setIsOpen] = useState(false);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const canGenerateStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canGenerate = canUpdateQuote && canGenerateStatus;
  const trimmedLeadTime = leadTime.trim();
  const generateMutation = useMutation(
    trpc.quotes.generateDocument.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() });
        onGenerated(result.warnings);
        toast.success('Quote Document generated');
        for (const warning of result.warnings) {
          toast.warning(warning.message);
        }
        setIsOpen(false);
      },
      onError: (error) => showMutationError(error, 'Unable to generate Quote Document.'),
    }),
  );

  useEffect(() => {
    if (isOpen) {
      setLeadTime(defaultLeadTime);
    }
  }, [defaultLeadTime, isOpen]);

  if (!canGenerate) {
    return null;
  }

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button aria-label={`Generate Quote Document for quote ${quote.code}`} type="button" variant="outline" />
        }
      >
        <FilePlus2Icon data-icon="inline-start" />
        Generate Quote Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Quote Document</DialogTitle>
          <DialogDescription>
            {hasUnsavedChanges
              ? 'Wait for this Quote to finish saving before generating a Quote Document.'
              : 'Create a saved PDF revision from the current saved Quote.'}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="quote-document-lead-time">Lead Time</FieldLabel>
          <Input
            disabled={generateMutation.isPending || hasUnsavedChanges}
            id="quote-document-lead-time"
            onChange={(event) => setLeadTime(event.target.value)}
            value={leadTime}
          />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button disabled={generateMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={generateMutation.isPending || hasUnsavedChanges || trimmedLeadTime.length === 0}
            onClick={() =>
              generateMutation.mutate({
                leadTime: trimmedLeadTime,
                quoteId: quote.id,
              })
            }
            type="button"
          >
            {generateMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDocumentsSection({
  generationWarnings,
  quoteId,
}: {
  generationWarnings: QuoteDocumentGenerationWarning[];
  quoteId: QuoteDetail['id'];
}) {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId }));
  const [previewDocument, setPreviewDocument] = useState<QuoteDocument | null>(null);
  const documents = documentsQuery.data ?? [];

  return (
    <QuoteFormSection title="Quote Documents">
      {generationWarnings.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Quote Document generated with warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {generationWarnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="overflow-hidden rounded-lg border">
        {documents.length > 0 ? (
          <div className="divide-y">
            {documents.map((document) => (
              <div
                className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_11rem] md:items-center"
                key={document.id}
              >
                <div className="flex min-w-0 items-center gap-2 font-medium">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{document.filename}</span>
                </div>
                <div className="text-muted-foreground">Rev {document.metadata.revision}</div>
                <div className="text-muted-foreground">{formatBytes(document.byteSize)}</div>
                <div className="text-muted-foreground">{formatDate(document.createdAt, 'medium')}</div>
                <div className="flex justify-end gap-2">
                  <PreviewQuoteDocumentButton document={document} onPreviewDocument={setPreviewDocument} />
                  <DownloadQuoteDocumentButton document={document} quoteId={quoteId} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="bg-muted/30 p-3 text-muted-foreground text-sm">
            {documentsQuery.isLoading ? 'Loading documents...' : 'No Quote Documents captured.'}
          </p>
        )}
      </div>
      <DocumentPreviewSheet
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null);
          }
        }}
        open={Boolean(previewDocument)}
        owner={{ id: quoteId, type: 'quote' }}
      />
    </QuoteFormSection>
  );
}

function PreviewQuoteDocumentButton({
  document,
  onPreviewDocument,
}: {
  document: QuoteDocument;
  onPreviewDocument: (document: QuoteDocument) => void;
}) {
  return (
    <Button
      aria-label={`View ${document.filename}`}
      size="sm"
      type="button"
      variant="ghost"
      onClick={() => onPreviewDocument(document)}
    >
      <EyeIcon data-icon="inline-start" />
      View
    </Button>
  );
}

function DownloadQuoteDocumentButton({ document, quoteId }: { document: QuoteDocument; quoteId: QuoteDetail['id'] }) {
  const showMutationError = useApiMutationErrorToast();
  const downloadMutation = useMutation({
    mutationFn: () => downloadQuoteDocument(quoteId, document),
    onError: (error) => {
      showMutationError(error, 'Unable to download document.');
    },
  });

  return (
    <Button
      aria-label={`Download ${document.filename}`}
      disabled={downloadMutation.isPending}
      size="sm"
      type="button"
      variant="ghost"
      onClick={() => void downloadMutation.mutateAsync()}
    >
      {downloadMutation.isPending ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      Download
    </Button>
  );
}

type QuoteAssembliesSelectorProps = {
  catalogAssemblies: Assembly[];
  currencyCode: string;
  initialSelections: QuoteSelectedAssembly[];
  onChange: (value: QuoteFormValues['selectedAssemblies']) => void;
  readOnly: boolean;
  value: QuoteFormValues['selectedAssemblies'];
};

const QuoteAssembliesSelector: React.FC<QuoteAssembliesSelectorProps> = ({
  catalogAssemblies,
  currencyCode,
  initialSelections,
  onChange,
  readOnly,
  value,
}) => {
  const standardAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'standard');
  const optionalAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'optional');
  const selectedSnapshots = resolveSelectedAssemblySnapshots({
    catalogAssemblies,
    formSelections: value,
    initialSelections,
  });
  const { overriddenStandardAssemblyIds, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: selectedSnapshots,
  });
  const staleSnapshots = new Set(staleSelections);
  const selectedSnapshotByCatalogId = new Map<string, SelectedAssemblySnapshot>();
  for (const snapshot of selectedSnapshots) {
    if (snapshot.productAssemblyId && !staleSnapshots.has(snapshot)) {
      selectedSnapshotByCatalogId.set(snapshot.productAssemblyId, snapshot);
    }
  }

  const setCatalogSelected = (assemblyId: string, selected: boolean) => {
    if (selected) {
      onChange([...value, { type: 'catalog', productAssemblyId: assemblyId }]);
      return;
    }

    onChange(
      value.filter((selection) => {
        if (selection.type === 'catalog') {
          return selection.productAssemblyId !== assemblyId;
        }

        const initialSelection = initialSelections.find((item) => item.id === selection.id);
        return initialSelection?.productAssemblyId !== assemblyId;
      }),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Standard</h4>
          {standardAssemblies.length === 0 ? (
            <p className="text-muted-foreground text-sm">No standard assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {standardAssemblies.map((assembly) => {
                const isOverridden = overriddenStandardAssemblyIds.has(assembly.id);

                return (
                  <div
                    className="flex h-12 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 text-sm"
                    key={assembly.id}
                  >
                    <span className={`min-w-0 truncate ${isOverridden ? 'text-muted-foreground line-through' : ''}`}>
                      {assembly.name}
                    </span>
                    {isOverridden ? <span className="text-muted-foreground text-xs">Overridden</span> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Optional</h4>
          {optionalAssemblies.length === 0 && staleSelections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No optional assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {optionalAssemblies.map((assembly) => {
                const snapshot = selectedSnapshotByCatalogId.get(assembly.id);
                const isSelected = Boolean(snapshot);
                // Selected options display their locked snapshot name/price so they don't shift
                // when the catalog assembly is later renamed or repriced.
                const displayName = snapshot?.quotedName ?? assembly.name;
                const displayPrice = snapshot?.quotedPrice ?? assembly.price;

                return (
                  <div
                    className={cn(
                      'flex h-12 items-center justify-between gap-3 rounded-md border px-3 text-sm',
                      isSelected ? 'border-primary/50 bg-primary/5' : 'bg-muted/10',
                    )}
                    key={assembly.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={readOnly}
                        onCheckedChange={(checked) => setCatalogSelected(assembly.id, checked === true)}
                      />
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatCurrency(displayPrice, currencyCode)}</span>
                  </div>
                );
              })}
              {staleSelections.map((selection) => (
                <div
                  className="flex h-12 items-center justify-between gap-3 rounded-md border border-dashed px-3 text-sm"
                  key={selection.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{selection.quotedName}</span>
                    <span className="block text-muted-foreground text-xs">Unavailable</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{formatCurrency(selection.quotedPrice, currencyCode)}</span>
                    {readOnly ? null : (
                      <Button
                        aria-label={`Remove ${selection.quotedName}`}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onChange(value.filter((item) => item.type !== 'existing' || item.id !== selection.id))
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type QuoteFormSectionProps = {
  children: React.ReactNode;
  description?: string;
  title: string;
};

const QuoteFormSection: React.FC<QuoteFormSectionProps> = ({ children, description, title }) => (
  <section className="grid gap-4 border-t pt-6 first:border-t-0 first:pt-0">
    <div className="grid gap-1.5">
      <h3 className="flex items-center gap-2 font-heading font-medium text-base leading-tight">
        <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-primary" />
        <span>{title}</span>
      </h3>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
    {children}
  </section>
);

type QuoteSummaryRowProps = {
  className?: string;
  label: string;
  value: string;
  valueClassName?: string;
};

const QuoteSummaryRow: React.FC<QuoteSummaryRowProps> = ({ className, label, value, valueClassName }) => {
  return (
    <div className={cn('flex items-center justify-between gap-3 text-muted-foreground', className)}>
      <span className="min-w-0 truncate">{label}</span>
      <span className={cn('shrink-0 text-foreground', valueClassName)}>{value}</span>
    </div>
  );
};
