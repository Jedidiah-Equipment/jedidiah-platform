import {
  computeQuoteSummary,
  getQuoteDeliveryTermsOptions,
  getQuoteOfferingName,
  isQuoteLocked,
  type QuoteFormField,
  quoteFormFieldAccess,
} from '@pkg/domain/equipment';
import { UUID } from '@pkg/schema';
import { type PriorityQuote, type QuoteDetail, QuoteStatus, type QuoteUpdateInput } from '@pkg/schema/equipment';
import { IconLayoutSidebarRight } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePreventRemove } from 'expo-router/react-navigation';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAutosaveForm } from '@/components/form';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SubTabControl, type SubTabOption } from '@/components/SubTabControl';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { QuoteAssembliesEditor } from '@/equipment/components/quotes/QuoteAssembliesEditor';
import { QuoteCancellationAction } from '@/equipment/components/quotes/QuoteCancellationAction';
import { QuoteCancellationConfirmation } from '@/equipment/components/quotes/QuoteCancellationConfirmation';
import { QuoteDocumentsTab } from '@/equipment/components/quotes/QuoteDocumentsTab';
import { QuotePriorityAlert } from '@/equipment/components/quotes/QuotePriorityAlert';
import { QuoteStageChip } from '@/equipment/components/quotes/QuoteStageChip';
import { QuoteSummaryDrawer } from '@/equipment/components/quotes/QuoteSummaryDrawer';
import { QuoteWorkItemsEditor } from '@/equipment/components/quotes/QuoteWorkItemsEditor';
import { SalespersonSelectField } from '@/equipment/components/quotes/SalespersonSelectField';
import { SecondaryPageToolbar } from '@/equipment/components/TopToolbar';
import {
  getQuoteEditFormValuesValidator,
  quoteStatusEditOptions,
  toQuoteEditFormValues,
  toQuoteUpdateInput,
  toQuoteWorkItemInput,
} from '@/equipment/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';
import { useAccess, useCan } from '@/lib/use-access';

type QuoteDetailTab = 'details' | 'documents';

const QUOTE_DETAIL_TABS: readonly SubTabOption<QuoteDetailTab>[] = [
  { label: 'Details', value: 'details' },
  { label: 'Documents', value: 'documents' },
];

export function QuoteDetailsScreen({ quoteId }: { quoteId: string }) {
  const parsedId = UUID.safeParse(quoteId);

  if (!parsedId.success) return <StateMessage message="Invalid Quote link." />;

  return <QuoteDetailsData id={parsedId.data} />;
}

function QuoteDetailsData({ id }: { id: UUID }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const readAccess = useCan('equipment_quote:read');
  const updateAccess = useCan('equipment_quote:update');
  const cancelAccess = useCan('equipment_quote:cancel');
  const quoteOptions = trpc.quotes.get.queryOptions({ id }, { enabled: readAccess.can });
  const quoteQuery = useQuery(quoteOptions);
  const priorityQuery = useQuery(trpc.quotes.priorityList.queryOptions(undefined, { enabled: readAccess.can }));
  const updateQuote = useMutation(trpc.quotes.update.mutationOptions());
  const cancelQuote = useMutation(trpc.quotes.cancel.mutationOptions());

  if (readAccess.isPending) return <StateMessage loading message="Loading quote…" />;
  if (!readAccess.can) return <StateMessage message="You do not have access to this Quote." />;
  if (quoteQuery.isPending) return <StateMessage loading message="Loading quote…" />;
  if (quoteQuery.isError || !quoteQuery.data) return <StateMessage message="Unable to load quote." />;

  const quote = quoteQuery.data;
  const priorityQuote = priorityQuery.data?.find((item) => item.id === quote.id) ?? null;

  const save = async (input: QuoteUpdateInput) => {
    const updated = await updateQuote.mutateAsync(input);
    queryClient.setQueryData(quoteOptions.queryKey, updated);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.quotes.list.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.priorityList.pathKey() }),
    ]);
    return updated;
  };

  // Its own mutation, never an autosaved status: cancelling settles the Quote's Job and machine, and
  // the update path refuses to be what cancels.
  const cancel = async (cancellationReason: string) => {
    await cancelQuote.mutateAsync({ cancellationReason, id: quote.id });
    // Whole roots, because the cascade reaches past this Quote: the Job is cancelled and the machine's
    // ownership reverses, so a Jobs or Units list opened earlier would otherwise still show both as they
    // were before.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.productUnits.pathKey() }),
    ]);
  };

  return (
    <QuoteEditor
      canCancel={cancelAccess.can}
      canUpdate={updateAccess.can}
      key={quote.id}
      onCancel={cancel}
      onReconcile={async () => (await quoteQuery.refetch()).data}
      onSave={save}
      priorityQuote={priorityQuote}
      quote={quote}
    />
  );
}

function QuoteEditor({
  canCancel,
  canUpdate,
  onCancel,
  onReconcile,
  onSave,
  priorityQuote,
  quote,
}: {
  onCancel: (cancellationReason: string) => Promise<void>;
  canCancel: boolean;
  canUpdate: boolean;
  onReconcile: () => Promise<QuoteDetail | undefined>;
  onSave: (input: QuoteUpdateInput) => Promise<QuoteDetail>;
  priorityQuote: PriorityQuote | null;
  quote: QuoteDetail;
}) {
  const showToast = useAppToast();
  const access = useAccess().data;
  const [activeTab, setActiveTab] = useState<QuoteDetailTab>('details');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const isLocked = isQuoteLocked({
    hasEverSourcedJob: quote.hasEverSourcedJob,
    hasProductUnit: quote.productUnitId !== null,
    kind: quote.kind,
    status: quote.status,
  });
  const validator = useMemo(() => getQuoteEditFormValuesValidator(quote.kind), [quote.kind]);
  const { autosave, form } = useAutosaveForm({
    defaultValues: toQuoteEditFormValues(quote),
    failureMessage: 'Unable to update quote.',
    onSaveError: async (error) => {
      showToast('error', error instanceof Error && error.message ? error.message : 'Unable to update quote.');
      const refreshed = await onReconcile();
      return refreshed ? toQuoteEditFormValues(refreshed) : undefined;
    },
    save: onSave,
    toInput: (values) => toQuoteUpdateInput({ id: quote.id, kind: quote.kind, values }),
    validator,
  });
  // Every way out saves the last edit first.
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(
    !leaving,
    ({ repeat }) =>
      void autosave.flush().finally(() => {
        setLeaving(true);
        repeat();
      }),
  );
  const values = useStore(form.store, (state) => state.values);
  const summary = useMemo(
    () => computeQuoteSummary({ quote, values: { ...values, workItems: values.workItems.map(toQuoteWorkItemInput) } }),
    [quote, values],
  );
  const quoteCurrencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const editable = quoteFormFieldAccess({ actor: access, quote });

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar
        badge={<QuoteStageChip stage={quote.stage} />}
        fallback="/equipment/quotes"
        subtitle={getQuoteOfferingName(quote)}
        title={quote.code}
      />

      <View className="border-b border-border px-4 py-3">
        <View className="w-full flex-row items-center gap-3">
          <SubTabControl activeValue={activeTab} onChange={setActiveTab} tabs={QUOTE_DETAIL_TABS} />
          <View className="flex-1" />
          <Pressable
            accessibilityRole="button"
            className="h-10 flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 active:bg-muted"
            onPress={() => setSummaryOpen(true)}
          >
            <Icon className="text-primary" icon={IconLayoutSidebarRight} size={16} />
            <Text className="text-[10px] uppercase tracking-wide text-foreground" mono weight="semibold">
              Summary
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={SECONDARY_PAGE_CONTENT_STYLE} keyboardShouldPersistTaps="handled">
        <form.AppForm>
          <View className="w-full gap-4">
            <AutosaveStatus canRetry={canUpdate} onRetry={() => void autosave.retry()} state={autosave.state} />
            {activeTab === 'details' ? (
              <>
                {quote.status === 'cancelled' ? (
                  <CancellationReasonBanner cancellationReason={quote.cancellationReason} />
                ) : null}
                {!canUpdate ? (
                  <InfoBanner message="You have read-only access. Quote fields cannot be changed." />
                ) : isLocked ? (
                  <InfoBanner message={describeLockedQuote({ editable, kind: quote.kind })} />
                ) : null}
                {priorityQuote ? <QuotePriorityAlert quote={priorityQuote} /> : null}

                <Section title="Quote setup">
                  <View className="gap-4 md:flex-row">
                    {quote.kind === 'custom' ? (
                      <View className="flex-1">
                        <form.AppField name="workTitle">
                          {(field) => (
                            <field.TextField
                              disabled={!editable.workTitle}
                              label="Work title"
                              onValueCommit={autosave.commit}
                            />
                          )}
                        </form.AppField>
                      </View>
                    ) : null}
                    <View className="flex-1">
                      <form.AppField name="salesPersonId">
                        {(_field) => (
                          <SalespersonSelectField
                            assigned={{ id: quote.salesPersonId, name: quote.salesPersonName }}
                            disabled={!editable.salesPersonId}
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="flex-1">
                      <form.AppField name="status">
                        {(field) => (
                          <field.SelectField
                            disabled={!editable.status}
                            label="Status"
                            onValueCommit={autosave.commit}
                            onValueSelect={(value) => {
                              const status = QuoteStatus.parse(value);
                              if (status !== 'cancelled') return;

                              setCancelConfirmationOpen(true);
                              return false;
                            }}
                            options={quoteStatusEditOptions(quote.status)}
                          />
                        )}
                      </form.AppField>
                    </View>
                  </View>
                </Section>

                {quote.kind === 'product' && quote.productUnit ? (
                  <Section
                    description="This Quote sells a machine we already hold. Allocation is set on web."
                    title="Allocated Product Unit"
                  >
                    <View className="gap-3">
                      <ReadOnlyFact label="Serial number" value={quote.productUnit.productSerialNumber} />
                      <ReadOnlyFact label="VIN" value={quote.productUnit.vinNumber} />
                    </View>
                  </Section>
                ) : null}

                <Section title="Dates & delivery">
                  <View className="gap-4 md:flex-row md:flex-wrap">
                    <View className="md:min-w-[220px] md:flex-1">
                      <form.AppField name="preferredDeliveryDate">
                        {(field) => (
                          <field.DateField
                            disabled={!editable.preferredDeliveryDate}
                            label="Preferred delivery"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="md:min-w-[220px] md:flex-1">
                      <form.AppField name="plannedDeliveryDate">
                        {(field) => (
                          <field.DateField
                            disabled={!editable.plannedDeliveryDate}
                            label="Planned delivery"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="md:min-w-[220px] md:flex-1">
                      <form.AppField name="validUntil">
                        {(field) => (
                          <field.DateField
                            disabled={!editable.validUntil}
                            label="Valid until"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="md:min-w-[220px] md:flex-1">
                      <ReadOnlyFact label="Invoice number" value={quote.invoiceNumber} />
                    </View>
                  </View>
                  <form.AppField name="deliveryTerms">
                    {(field) => (
                      <field.SelectField
                        disabled={!editable.deliveryTerms}
                        label="Delivery terms"
                        onValueCommit={autosave.commit}
                        onValueSelect={(value) => {
                          if (value !== 'additional_charge') form.setFieldValue('deliveryPrice', 0);
                          return undefined;
                        }}
                        options={getQuoteDeliveryTermsOptions(quote.status)}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="deliveryPrice">
                    {(field) => (
                      <field.CurrencyField
                        disabled={!editable.deliveryPrice || values.deliveryTerms !== 'additional_charge'}
                        label="Delivery price"
                        onValueCommit={autosave.commit}
                      />
                    )}
                  </form.AppField>
                </Section>

                <Section title="Pricing">
                  <View className="gap-4 md:flex-row">
                    <View className="flex-1">
                      <form.AppField name="discountPercent">
                        {(field) => (
                          <field.NumberField
                            disabled={!editable.discountPercent}
                            label="Discount percent"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="flex-1">
                      <form.AppField name="depositPercent">
                        {(field) => (
                          <field.NumberField
                            disabled={!editable.depositPercent}
                            label="Deposit percent"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                  </View>
                </Section>

                {quote.kind === 'custom' ? (
                  <QuoteWorkItemsEditor
                    autosave={autosave}
                    currencyCode={quoteCurrencyCode}
                    form={form}
                    readOnly={!editable.workItems}
                  />
                ) : null}

                <Section title="Internal notes">
                  <form.AppField name="notes">
                    {(field) => (
                      <field.TextareaField
                        disabled={!editable.notes}
                        onValueCommit={autosave.commit}
                        placeholder="Internal notes about this quote"
                        rows={4}
                      />
                    )}
                  </form.AppField>
                </Section>

                {quote.kind === 'product' && quote.product ? (
                  <Section
                    description="Standard assemblies are included. Optional assemblies add to the quote."
                    title="Assemblies"
                  >
                    <form.Field name="selectedAssemblies">
                      {(field) => (
                        <QuoteAssembliesEditor
                          catalogAssemblies={quote.product?.assemblies ?? []}
                          currencyCode={quoteCurrencyCode}
                          initialSelections={quote.selectedAssemblies}
                          onChange={(nextValue) => {
                            field.handleChange(nextValue);
                            autosave.commit();
                          }}
                          readOnly={!editable.selectedAssemblies}
                          value={field.state.value}
                        />
                      )}
                    </form.Field>
                  </Section>
                ) : null}

                <QuoteCancellationAction
                  canCancel={canCancel}
                  onPress={() => setCancelConfirmationOpen(true)}
                  quote={quote}
                />
              </>
            ) : (
              <QuoteDocumentsTab
                canUpdate={canUpdate}
                flushAutosave={autosave.flush}
                quote={quote}
                quoteNotesField={
                  <form.AppField name="documentNotes">
                    {(field) => (
                      <field.TextareaField
                        disabled={!editable.documentNotes}
                        onValueCommit={autosave.commit}
                        placeholder="Notes entered here will be included in the quote document."
                        rows={4}
                      />
                    )}
                  </form.AppField>
                }
              />
            )}
          </View>
        </form.AppForm>
      </ScrollView>

      <QuoteSummaryDrawer onClose={() => setSummaryOpen(false)} open={summaryOpen} quote={quote} summary={summary} />
      <QuoteCancellationConfirmation
        onClose={() => setCancelConfirmationOpen(false)}
        onConfirm={async (cancellationReason) => {
          setCancelConfirmationOpen(false);
          try {
            await onCancel(cancellationReason);
            showToast('success', `${quote.code} cancelled`);
          } catch {
            showToast('error', 'Unable to cancel quote.');
          }
        }}
        open={cancelConfirmationOpen}
        quote={quote}
      />
    </SafeAreaView>
  );
}

function Section({
  action,
  children,
  description,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground" mono weight="semibold">
            {title}
          </Text>
          {description ? <Text className="mt-1.5 text-xs text-muted-foreground">{description}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string | null }) {
  return (
    <View>
      <Text className="text-[10px] uppercase tracking-wide text-muted-foreground" mono>
        {label}
      </Text>
      <Text className={`mt-0.5 text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`} mono={Boolean(value)}>
        {value ?? 'Not captured'}
      </Text>
    </View>
  );
}

function AutosaveStatus({
  canRetry,
  onRetry,
  state,
}: {
  canRetry: boolean;
  onRetry: () => void;
  state: { errorMessage: string | null; hasUnsavedChanges: boolean; status: string };
}) {
  // Transient states (saving/unsaved/invalid) render nothing — the row appearing and
  // disappearing pushed the form down on every edit. Only a failed save surfaces.
  if (state.status !== 'error') return null;

  return (
    <View className="flex-row items-center justify-end gap-2">
      <Text className="text-xs text-danger" mono>
        Save failed
      </Text>
      {canRetry ? (
        <Pressable accessibilityRole="button" className="rounded-lg border border-border px-2 py-1" onPress={onRetry}>
          <Text className="text-xs text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Names what this person may still change on a Locked Quote, which depends on its status and their role. */
function describeLockedQuote({
  editable,
  kind,
}: {
  editable: Readonly<Record<QuoteFormField, boolean>>;
  kind: QuoteDetail['kind'];
}) {
  const open = [
    ...(kind === 'custom' && editable.workItems ? ['work items'] : []),
    'notes',
    'delivery dates',
    ...(editable.validUntil ? ['quote document fields'] : []),
    ...(editable.deliveryTerms ? ['delivery terms'] : []),
    ...(editable.discountPercent ? ['discount'] : []),
    ...(editable.depositPercent ? ['deposit'] : []),
  ];
  const last = open.pop();

  return `This Quote is locked. Still editable: ${open.join(', ')}, and ${last}.`;
}

function InfoBanner({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-border bg-muted px-4 py-3">
      <Text className="text-xs text-muted-foreground">{message}</Text>
    </View>
  );
}

function CancellationReasonBanner({ cancellationReason }: { cancellationReason: string | null }) {
  return (
    <View className="gap-1 rounded-xl border border-warning bg-warning/10 px-4 py-3">
      <Text className="text-xs text-foreground" weight="bold">
        Cancellation reason
      </Text>
      <Text className="text-xs text-muted-foreground">{cancellationReason}</Text>
    </View>
  );
}

function StateMessage({ loading = false, message }: { loading?: boolean; message: string }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar fallback={'/equipment/quotes'} subtitle="QUOTE DETAIL" title="Quote" />
      <View className="flex-1 items-center justify-center gap-3 p-6">
        {loading ? <ActivityIndicator size="small" /> : null}
        <Text className="text-center text-sm text-muted-foreground">{message}</Text>
      </View>
    </SafeAreaView>
  );
}
