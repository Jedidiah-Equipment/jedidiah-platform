import { computeQuoteSummary, editableLockedQuoteFields, getQuoteOfferingName, isQuoteLocked } from '@pkg/domain';
import { type PriorityQuote, type QuoteDetail, QuoteStatus, type QuoteUpdateInput, UUID } from '@pkg/schema';
import { IconLayoutSidebarRight } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAutosaveForm } from '@/components/form';
import { QuoteAssembliesEditor } from '@/components/quotes/QuoteAssembliesEditor';
import { QuoteCancellationConfirmation } from '@/components/quotes/QuoteCancellationConfirmation';
import { QuoteDocumentsTab } from '@/components/quotes/QuoteDocumentsTab';
import { QuotePriorityAlert } from '@/components/quotes/QuotePriorityAlert';
import { QuoteStatusChip } from '@/components/quotes/QuoteStatusChip';
import { QuoteSummaryDrawer } from '@/components/quotes/QuoteSummaryDrawer';
import { QuoteWorkItemsEditor } from '@/components/quotes/QuoteWorkItemsEditor';
import { SalespersonSelectField } from '@/components/quotes/SalespersonSelectField';
import { SecondaryPageToolbar } from '@/components/TopToolbar';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import {
  getQuoteEditFormValuesValidator,
  QUOTE_STATUS_OPTIONS,
  toQuoteEditFormValues,
  toQuoteUpdateInput,
  toQuoteWorkItemInput,
} from '@/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';

export function QuoteDetailsScreen({ quoteId }: { quoteId: string }) {
  const parsedId = UUID.safeParse(quoteId);

  if (!parsedId.success) return <StateMessage message="Invalid Quote link." />;

  return <QuoteDetailsData id={parsedId.data} />;
}

function QuoteDetailsData({ id }: { id: UUID }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const readAccess = useCan('quote:read');
  const updateAccess = useCan('quote:update');
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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.quotes.get.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.list.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.priorityList.pathKey() }),
    ]);
  };

  return (
    <QuoteEditor
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
  canUpdate,
  onCancel,
  onReconcile,
  onSave,
  priorityQuote,
  quote,
}: {
  onCancel: (cancellationReason: string) => Promise<void>;
  canUpdate: boolean;
  onReconcile: () => Promise<QuoteDetail | undefined>;
  onSave: (input: QuoteUpdateInput) => Promise<QuoteDetail>;
  priorityQuote: PriorityQuote | null;
  quote: QuoteDetail;
}) {
  const router = useRouter();
  const showToast = useAppToast();
  const [activeTab, setActiveTab] = useState<'details' | 'documents'>('details');
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
  const values = useStore(form.store, (state) => state.values);
  const summary = useMemo(
    () => computeQuoteSummary({ quote, values: { ...values, workItems: values.workItems.map(toQuoteWorkItemInput) } }),
    [quote, values],
  );
  const quoteCurrencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const lockEditableFields = editableLockedQuoteFields({
    hasProductUnit: quote.productUnitId !== null,
    kind: quote.kind,
    status: quote.status,
  });
  const canEdit = (field: string) => canUpdate && (!isLocked || lockEditableFields.has(field));
  const setupReadOnly = !canUpdate || isLocked;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar
        badge={<QuoteStatusChip status={values.status} />}
        onBack={() => void autosave.flush().finally(() => router.dismissTo('/quotes'))}
        parentLabel="Quotes"
        subtitle={getQuoteOfferingName(quote)}
        title={quote.code}
      />

      <View className="border-b border-border px-4 py-3">
        <View className="w-full flex-row items-center gap-3">
          <View className="flex-row rounded-xl border border-border bg-muted p-1">
            <QuoteTabButton active={activeTab === 'details'} label="Details" onPress={() => setActiveTab('details')} />
            <QuoteTabButton
              active={activeTab === 'documents'}
              label="Documents"
              onPress={() => setActiveTab('documents')}
            />
          </View>
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

      <ScrollView contentContainerClassName="px-4 pb-12 pt-4" keyboardShouldPersistTaps="handled">
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
                  <InfoBanner message={describeLockedQuote({ canEdit, kind: quote.kind })} />
                ) : null}
                {priorityQuote ? <QuotePriorityAlert quote={priorityQuote} /> : null}

                <Section title="Quote setup">
                  <View className="gap-4 md:flex-row">
                    {quote.kind === 'custom' ? (
                      <View className="flex-1">
                        <form.AppField name="workTitle">
                          {(field) => (
                            <field.TextField
                              disabled={setupReadOnly}
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
                          <SalespersonSelectField disabled={setupReadOnly} onValueCommit={autosave.commit} />
                        )}
                      </form.AppField>
                    </View>
                    <View className="flex-1">
                      <form.AppField name="status">
                        {(field) => (
                          <field.SelectField
                            disabled={setupReadOnly}
                            label="Status"
                            onValueCommit={autosave.commit}
                            onValueSelect={(value) => {
                              const status = QuoteStatus.parse(value);
                              if (status !== 'cancelled') return;

                              setCancelConfirmationOpen(true);
                              return false;
                            }}
                            options={QUOTE_STATUS_OPTIONS}
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
                            disabled={!canEdit('preferredDeliveryDate')}
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
                            disabled={!canEdit('plannedDeliveryDate')}
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
                            disabled={!canEdit('validUntil')}
                            label="Valid until"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                    <View className="md:min-w-[220px] md:flex-1">
                      <form.AppField name="invoiceNumber">
                        {(field) => (
                          <field.TextField
                            disabled={!canEdit('invoiceNumber')}
                            label="Invoice number"
                            onValueCommit={autosave.commit}
                          />
                        )}
                      </form.AppField>
                    </View>
                  </View>
                  <form.Field name="deliveryIncluded">
                    {(field) => (
                      <View
                        className={`flex-row items-center gap-3 rounded-xl py-1 ${setupReadOnly ? 'opacity-55' : ''}`}
                      >
                        <Switch
                          accessibilityLabel="Delivery included in sale price"
                          isDisabled={setupReadOnly}
                          onValueChange={(included) => {
                            field.handleChange(included);
                            if (included) form.setFieldValue('deliveryPrice', 0);
                            autosave.commit();
                          }}
                          value={field.state.value}
                        />
                        <Text className="text-sm text-foreground">Delivery included in sale price</Text>
                      </View>
                    )}
                  </form.Field>
                  <form.AppField name="deliveryPrice">
                    {(field) => (
                      <field.CurrencyField
                        disabled={setupReadOnly || values.deliveryIncluded}
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
                            disabled={!canEdit('discountPercent')}
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
                            disabled={setupReadOnly}
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
                    readOnly={!canEdit('workItems')}
                  />
                ) : null}

                <Section title="Internal notes">
                  <form.AppField name="notes">
                    {(field) => (
                      <field.TextareaField
                        disabled={!canEdit('notes')}
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
                          readOnly={setupReadOnly}
                          value={field.state.value}
                        />
                      )}
                    </form.Field>
                  </Section>
                ) : null}
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
                        disabled={!canUpdate}
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

function QuoteTabButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={`rounded-lg px-4 py-2 ${active ? 'bg-surface' : ''}`}
      onPress={onPress}
    >
      <Text className={`text-xs ${active ? 'text-foreground' : 'text-muted-foreground'}`} weight="semibold">
        {label}
      </Text>
    </Pressable>
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

/**
 * Work Items are always in the locked-editable set, so only a Custom Quote actually renders an
 * editor for them — the field alone cannot tell the two Quote kinds apart here.
 */
function describeLockedQuote({ canEdit, kind }: { canEdit: (field: string) => boolean; kind: QuoteDetail['kind'] }) {
  const editable = [
    ...(kind === 'custom' ? ['work items', 'hourly rate'] : []),
    'invoice number',
    'notes',
    'delivery dates',
    ...(canEdit('discountPercent') ? ['discount'] : []),
  ];
  const last = editable.pop();

  return `This Quote is locked. Still editable: ${editable.join(', ')}, and ${last}.`;
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
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar
        onBack={() => router.dismissTo('/quotes')}
        parentLabel="Quotes"
        subtitle="QUOTE DETAIL"
        title="Quote"
      />
      <View className="flex-1 items-center justify-center gap-3 p-6">
        {loading ? <ActivityIndicator size="small" /> : null}
        <Text className="text-center text-sm text-muted-foreground">{message}</Text>
      </View>
    </SafeAreaView>
  );
}
