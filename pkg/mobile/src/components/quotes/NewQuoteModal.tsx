import { IconX } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { useAppForm } from '@/components/form';
import { getFieldErrors } from '@/components/form/utils/field-errors';
import { CustomerPicker } from '@/components/quotes/CustomerPicker';
import { ProductPicker, type ProductSelection } from '@/components/quotes/ProductPicker';
import { SalespersonSelectField } from '@/components/quotes/SalespersonSelectField';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useAppToast } from '@/components/ui/toast';
import {
  clearQuoteKindFields,
  QUOTE_CREATE_DEFAULT_VALUES,
  QuoteCreateFormValues,
  toQuoteCreateInput,
} from '@/lib/quote-create';
import { QUOTE_STATUS_OPTIONS } from '@/lib/quote-presentation';
import { useTRPC } from '@/lib/trpc';

const KIND_OPTIONS = [
  { label: 'Product', value: 'product' },
  { label: 'Custom', value: 'custom' },
] as const;

export function NewQuoteModal({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const [productSelection, setProductSelection] = useState<ProductSelection | null>(null);
  const currentUser = useQuery(trpc.auth.me.queryOptions());
  const createQuote = useMutation(trpc.quotes.create.mutationOptions());

  const form = useAppForm({
    defaultValues: QUOTE_CREATE_DEFAULT_VALUES,
    validators: { onSubmit: QuoteCreateFormValues },
    onSubmit: async ({ value }) => {
      const created = await createQuote.mutateAsync(toQuoteCreateInput(value)).catch((error: unknown) => {
        showToast('error', quoteCreateErrorMessage(error));
        return null;
      });
      if (!created) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.quotes.list.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.quotes.priorityList.pathKey() }),
      ]);
      onClose();
      showToast('success', 'Quote created');
      router.push({ pathname: '/quotes/[quoteId]', params: { quoteId: created.id } });
    },
  });

  const kind = useStore(form.store, (state) => state.values.kind);
  const salesPersonId = useStore(form.store, (state) => state.values.salesPersonId);
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);

  useEffect(() => {
    const defaultSalesPersonId = currentUser.data?.id ?? '';
    if (!salesPersonId && defaultSalesPersonId) form.setFieldValue('salesPersonId', defaultSalesPersonId);
  }, [currentUser.data, form, salesPersonId]);

  const close = () => {
    if (!isSubmitting) onClose();
  };

  const changeKind = (nextKind: string) => {
    if (nextKind !== 'product' && nextKind !== 'custom') return;

    const cleared = clearQuoteKindFields(form.store.state.values, nextKind);
    form.setFieldValue('basePrice', cleared.basePrice);
    form.setFieldValue('hourlyRate', cleared.hourlyRate);
    form.setFieldValue('productId', cleared.productId);
    form.setFieldValue('rangeId', cleared.rangeId);
    form.setFieldValue('workTitle', cleared.workTitle);
    if (nextKind === 'custom') setProductSelection(null);
  };

  return (
    <ThemedModal backdropLabel="Cancel new quote" dismissDisabled={isSubmitting} onClose={onClose} open>
      <View
        className="w-full overflow-hidden rounded-[20px] border border-border bg-surface shadow-2xl"
        style={{ maxHeight: '92%', maxWidth: 400 }}
      >
        <View className="flex-row items-center justify-between px-5 pb-1 pt-4">
          <Text className="text-lg text-surface-foreground" weight="bold">
            New quote
          </Text>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className="rounded-lg p-2 active:bg-muted"
            disabled={isSubmitting}
            onPress={close}
          >
            <Icon className="text-muted-foreground" icon={IconX} size={20} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerClassName="gap-4 px-5 pb-4 pt-3"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <form.Field name="customer">
            {(field) => (
              <CustomerPicker
                errors={getFieldErrors(field.state.meta.errors)}
                onSelected={field.handleChange}
                selection={field.state.value}
              />
            )}
          </form.Field>

          <form.AppField name="kind">
            {(field) => <field.SegmentedField label="Kind" onValueCommit={changeKind} options={KIND_OPTIONS} />}
          </form.AppField>

          {kind === 'product' ? (
            <form.Subscribe
              selector={(state) => ({ productId: state.values.productId, rangeId: state.values.rangeId })}
            >
              {({ productId, rangeId }) => (
                <form.Field name="productId">
                  {(field) => (
                    <ProductPicker
                      errors={getFieldErrors(field.state.meta.errors)}
                      onProductSelected={(product) => {
                        setProductSelection(product);
                        field.handleChange(product?.id ?? '');
                      }}
                      onRangeChange={(value) => {
                        form.setFieldValue('rangeId', value);
                        if (productId) form.setFieldValue('productId', '');
                      }}
                      product={productSelection}
                      rangeId={rangeId}
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          ) : (
            <View className="gap-4">
              <form.AppField name="workTitle">
                {(field) => <field.TextField label="Work title" placeholder="e.g. On-site repair" />}
              </form.AppField>
              <form.AppField name="basePrice">{(field) => <field.CurrencyField label="Base price" />}</form.AppField>
              <form.AppField name="hourlyRate">{(field) => <field.CurrencyField label="Hourly rate" />}</form.AppField>
            </View>
          )}

          <form.AppField name="salesPersonId">{(_field) => <SalespersonSelectField />}</form.AppField>

          <form.AppField name="status">
            {(field) => <field.SelectField label="Status" options={QUOTE_STATUS_OPTIONS} />}
          </form.AppField>
        </ScrollView>

        <View className="flex-row justify-end gap-2.5 border-t border-border px-5 pb-5 pt-4">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className="rounded-xl border border-border bg-muted px-5 py-3 active:opacity-80"
            disabled={isSubmitting}
            onPress={close}
          >
            <Text className="text-sm text-foreground" weight="semibold">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            className={`min-w-24 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 ${
              isSubmitting ? 'opacity-60' : 'active:opacity-90'
            }`}
            disabled={isSubmitting}
            onPress={() => void form.handleSubmit()}
          >
            {isSubmitting ? <ActivityIndicator className="text-primary-foreground" size="small" /> : null}
            <Text className="text-sm text-primary-foreground" weight="bold">
              Save
            </Text>
          </Pressable>
        </View>
      </View>
    </ThemedModal>
  );
}

function quoteCreateErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Unable to create quote. Please try again.';
}
