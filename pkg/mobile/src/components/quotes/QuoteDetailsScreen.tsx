import { EDITABLE_LOCKED_QUOTE_FIELDS, formatCurrency, getQuoteOfferingName, isQuoteLocked } from '@pkg/domain';
import { type PriorityQuote, type QuoteDetail, QuoteStatus, type QuoteUpdateInput, UUID } from '@pkg/schema';
import { IconChevronLeft, IconLayoutSidebarRight, IconPlus, IconTrash } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAutosaveForm } from '@/components/form';
import { SelectField } from '@/components/form/fields/SelectField';
import { createStableRowKeys } from '@/components/form/utils/create-stable-row-keys';
import { QuoteAssembliesEditor } from '@/components/quotes/QuoteAssembliesEditor';
import { QuoteCancellationConfirmation } from '@/components/quotes/QuoteCancellationConfirmation';
import { QuotePriorityAlert } from '@/components/quotes/QuotePriorityAlert';
import { QuoteStatusChip } from '@/components/quotes/QuoteStatusChip';
import { QuoteSummaryDrawer } from '@/components/quotes/QuoteSummaryDrawer';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import {
  computeQuoteSummary,
  getQuoteEditFormValuesValidator,
  quoteStatusLabels,
  toQuoteEditFormValues,
  toQuoteUpdateInput,
} from '@/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';

const STATUS_OPTIONS = QuoteStatus.options.map((status) => ({ label: quoteStatusLabels[status], value: status }));
const getLineItemKey = createStableRowKeys<{ name: string; quantity: number; unitPrice: number }>('quote-line-item');

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

  return (
    <QuoteEditor
      canUpdate={updateAccess.can}
      key={quote.id}
      onReconcile={async () => (await quoteQuery.refetch()).data}
      onSave={save}
      priorityQuote={priorityQuote}
      quote={quote}
    />
  );
}

function QuoteEditor({
  canUpdate,
  onReconcile,
  onSave,
  priorityQuote,
  quote,
}: {
  canUpdate: boolean;
  onReconcile: () => Promise<QuoteDetail | undefined>;
  onSave: (input: QuoteUpdateInput) => Promise<QuoteDetail>;
  priorityQuote: PriorityQuote | null;
  quote: QuoteDetail;
}) {
  const router = useRouter();
  const showToast = useAppToast();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const isLocked = isQuoteLocked({ hasJob: quote.job !== null, kind: quote.kind, status: quote.status });
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
  const summary = useMemo(() => computeQuoteSummary({ quote, values }), [quote, values]);
  const quoteCurrencyCode = quote.product?.currencyCode ?? quote.quotedCurrencyCode;
  const canEdit = (field: string) => canUpdate && (!isLocked || EDITABLE_LOCKED_QUOTE_FIELDS.has(field));
  const setupReadOnly = !canUpdate || isLocked;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="border-b border-border bg-background px-4 py-3">
        <View className="mx-auto w-full max-w-[1180px] flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Back to Quotes"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:opacity-80"
            onPress={() => void autosave.flush().finally(() => router.replace('/quotes'))}
          >
            <Icon className="text-foreground" icon={IconChevronLeft} size={19} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-base text-foreground" mono numberOfLines={1} weight="bold">
              {quote.code}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {getQuoteOfferingName(quote)}
            </Text>
          </View>
          <QuoteStatusChip status={values.status} />
        </View>
      </View>

      <View className="border-b border-border px-4 py-3">
        <View className="mx-auto w-full max-w-[1180px] flex-row items-center gap-3">
          <View className="flex-row rounded-xl border border-border bg-muted p-1">
            <View className="rounded-lg bg-surface px-4 py-2">
              <Text className="text-xs text-foreground" weight="semibold">
                Details
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Documents coming next"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              className="px-4 py-2 opacity-45"
              disabled
            >
              <Text className="text-xs text-muted-foreground" weight="semibold">
                Documents
              </Text>
            </Pressable>
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
          <View className="mx-auto w-full max-w-[760px] gap-4">
            <AutosaveStatus canRetry={canUpdate} onRetry={() => void autosave.retry()} state={autosave.state} />
            {!canUpdate ? (
              <InfoBanner message="You have read-only access. Quote fields cannot be changed." />
            ) : isLocked ? (
              <InfoBanner message="This Quote is locked. Only notes and delivery dates remain editable." />
            ) : null}
            {priorityQuote ? <QuotePriorityAlert quote={priorityQuote} /> : null}

            <Section title="Quote setup">
              <View className="gap-4 md:flex-row">
                {quote.kind === 'custom' ? (
                  <View className="flex-1">
                    <form.AppField name="workTitle">
                      {(field) => (
                        <field.TextField disabled={setupReadOnly} label="Work title" onValueCommit={autosave.commit} />
                      )}
                    </form.AppField>
                  </View>
                ) : null}
                <View className="flex-1">
                  <form.AppField name="salesPersonId">
                    {(_field) => <SalespersonField disabled={setupReadOnly} onValueCommit={autosave.commit} />}
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
                        options={STATUS_OPTIONS}
                      />
                    )}
                  </form.AppField>
                </View>
              </View>
            </Section>

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
              </View>
              <form.Field name="deliveryIncluded">
                {(field) => (
                  <View className={`flex-row items-center gap-3 rounded-xl py-1 ${setupReadOnly ? 'opacity-55' : ''}`}>
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
                        disabled={setupReadOnly}
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
              <Section title="Custom work">
                <form.AppField name="basePrice">
                  {(field) => (
                    <field.CurrencyField disabled={setupReadOnly} label="Base price" onValueCommit={autosave.commit} />
                  )}
                </form.AppField>
              </Section>
            ) : null}

            <form.Field name="lineItems" mode="array">
              {(lineItemsField) => (
                <Section
                  action={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: setupReadOnly }}
                      className={`flex-row items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 ${
                        setupReadOnly ? 'opacity-50' : 'active:bg-surface'
                      }`}
                      disabled={setupReadOnly}
                      onPress={() => {
                        lineItemsField.pushValue({ name: '', quantity: 1, unitPrice: 0 });
                        autosave.markChanged();
                      }}
                    >
                      <Icon className="text-primary" icon={IconPlus} size={15} />
                      <Text className="text-xs text-foreground" weight="semibold">
                        Add line item
                      </Text>
                    </Pressable>
                  }
                  title="Line items"
                >
                  {lineItemsField.state.value.length === 0 ? (
                    <View className="rounded-xl border border-dashed border-border px-4 py-7">
                      <Text className="text-center text-sm text-muted-foreground">No line items.</Text>
                    </View>
                  ) : (
                    <View className="gap-3">
                      {lineItemsField.state.value.map((lineItem, index) => (
                        <View
                          className="gap-3 rounded-xl border border-border bg-muted/10 p-3"
                          key={getLineItemKey(lineItem)}
                        >
                          <form.AppField name={`lineItems[${index}].name`}>
                            {(field) => (
                              <field.TextField disabled={setupReadOnly} label="Name" onValueCommit={autosave.commit} />
                            )}
                          </form.AppField>
                          <View className="gap-3 md:flex-row">
                            <View className="flex-1">
                              <form.AppField name={`lineItems[${index}].quantity`}>
                                {(field) => (
                                  <field.NumberField
                                    disabled={setupReadOnly}
                                    label="Quantity"
                                    onValueCommit={autosave.commit}
                                  />
                                )}
                              </form.AppField>
                            </View>
                            <View className="flex-1">
                              <form.AppField name={`lineItems[${index}].unitPrice`}>
                                {(field) => (
                                  <field.CurrencyField
                                    disabled={setupReadOnly}
                                    label="Unit price"
                                    onValueCommit={autosave.commit}
                                  />
                                )}
                              </form.AppField>
                            </View>
                          </View>
                          <View className="flex-row items-center justify-between gap-3">
                            <View>
                              <Text className="text-xs text-muted-foreground">Total</Text>
                              <Text className="mt-1 text-sm text-foreground" mono weight="semibold">
                                {formatCurrency(lineItem.quantity * lineItem.unitPrice, quoteCurrencyCode)}
                              </Text>
                            </View>
                            <Pressable
                              accessibilityLabel={`Remove line item ${index + 1}`}
                              accessibilityRole="button"
                              accessibilityState={{ disabled: setupReadOnly }}
                              className={`h-10 w-10 items-center justify-center rounded-lg ${
                                setupReadOnly ? 'opacity-0' : 'active:bg-muted'
                              }`}
                              disabled={setupReadOnly}
                              onPress={() => {
                                lineItemsField.removeValue(index);
                                autosave.commit();
                              }}
                            >
                              <Icon className="text-danger" icon={IconTrash} size={17} />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </Section>
              )}
            </form.Field>

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
          </View>
        </form.AppForm>
      </ScrollView>

      <QuoteSummaryDrawer onClose={() => setSummaryOpen(false)} open={summaryOpen} quote={quote} summary={summary} />
      <QuoteCancellationConfirmation
        onClose={() => setCancelConfirmationOpen(false)}
        onConfirm={() => {
          form.setFieldValue('status', 'cancelled');
          setCancelConfirmationOpen(false);
          autosave.commit();
        }}
        open={cancelConfirmationOpen}
        quote={quote}
      />
    </SafeAreaView>
  );
}

function SalespersonField({ disabled, onValueCommit }: { disabled: boolean; onValueCommit: () => void }) {
  const trpc = useTRPC();
  const salespeople = useQuery(trpc.quotes.salespeople.queryOptions(undefined));

  return (
    <SelectField
      disabled={disabled || salespeople.isPending}
      emptyMessage={salespeople.isError ? 'Couldn’t load salespeople.' : 'No salespeople available.'}
      label="Salesperson"
      onValueCommit={onValueCommit}
      options={(salespeople.data?.users ?? []).map((user) => ({ label: user.name, value: user.id }))}
      placeholder={salespeople.isPending ? 'Loading salespeople…' : 'Select salesperson'}
    />
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

function AutosaveStatus({
  canRetry,
  onRetry,
  state,
}: {
  canRetry: boolean;
  onRetry: () => void;
  state: { errorMessage: string | null; hasUnsavedChanges: boolean; status: string };
}) {
  if (state.status === 'idle' && !state.hasUnsavedChanges) return null;

  const label =
    state.status === 'saving'
      ? 'Saving…'
      : state.status === 'saved'
        ? 'Saved'
        : state.status === 'invalid'
          ? 'Fix highlighted fields'
          : state.status === 'error'
            ? 'Save failed'
            : 'Unsaved changes';

  return (
    <View className="flex-row items-center justify-end gap-2">
      {state.status === 'saving' ? <ActivityIndicator size="small" /> : null}
      <Text className={`text-xs ${state.status === 'error' ? 'text-danger' : 'text-muted-foreground'}`} mono>
        {label}
      </Text>
      {state.status === 'error' && canRetry ? (
        <Pressable accessibilityRole="button" className="rounded-lg border border-border px-2 py-1" onPress={onRetry}>
          <Text className="text-xs text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InfoBanner({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-border bg-muted px-4 py-3">
      <Text className="text-xs text-muted-foreground">{message}</Text>
    </View>
  );
}

function StateMessage({ loading = false, message }: { loading?: boolean; message: string }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center gap-3 bg-background p-6">
      {loading ? <ActivityIndicator size="small" /> : null}
      <Text className="text-center text-sm text-muted-foreground">{message}</Text>
    </SafeAreaView>
  );
}
