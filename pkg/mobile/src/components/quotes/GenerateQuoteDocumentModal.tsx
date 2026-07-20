import { departmentLabels } from '@pkg/domain';
import type { QuoteDetail, QuoteDocumentGenerationWarning } from '@pkg/schema';
import { IconFilePlus, IconX } from '@tabler/icons-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useAppToast } from '@/components/ui/toast';
import { getDefaultQuoteDocumentLeadTime, resolveQuoteDocumentLeadTime } from '@/lib/quote-documents';
import { useTRPC } from '@/lib/trpc';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

export function GenerateQuoteDocumentModal({
  flushAutosave,
  onClose,
  onGenerated,
  open,
  quote,
}: {
  flushAutosave: () => Promise<boolean>;
  onClose: () => void;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  open: boolean;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const { resolved } = useColorMode();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const [hasUserEditedLeadTime, setHasUserEditedLeadTime] = useState(false);
  const [leadTimeError, setLeadTimeError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const generateDocument = useMutation(trpc.quotes.generateDocument.mutationOptions());
  const hasResolvedProduct = quote.kind === 'product' && quote.product !== null;
  const availabilityQuery = useQuery({
    ...trpc.quotes.productBayAvailability.queryOptions({ quoteId: quote.id }),
    enabled: open && hasResolvedProduct,
  });
  const availability = availabilityQuery.data;
  const isBusy = isSubmitting || generateDocument.isPending;

  useEffect(() => {
    if (!open) return;

    setLeadTime(defaultLeadTime);
    setHasUserEditedLeadTime(false);
    setLeadTimeError(null);
  }, [defaultLeadTime, open]);

  useEffect(() => {
    if (!open) return;

    // Availability may resolve after typing starts; only replace the untouched default.
    setLeadTime((current) =>
      resolveQuoteDocumentLeadTime({
        availability,
        fallbackLeadTime: defaultLeadTime,
        hasUserEditedLeadTime,
        leadTime: current,
      }),
    );
  }, [availability, defaultLeadTime, hasUserEditedLeadTime, open]);

  if (!open) return null;

  const close = () => {
    if (!isBusy) onClose();
  };

  const submit = async () => {
    if (isBusy) return;

    const trimmedLeadTime = leadTime.trim();
    if (!trimmedLeadTime) {
      setLeadTimeError('Lead time is required.');
      return;
    }

    setLeadTimeError(null);
    setIsSubmitting(true);
    try {
      if (!(await flushAutosave())) {
        showToast('error', 'Fix the highlighted quote fields before generating the Quote Document.');
        return;
      }

      const result = await generateDocument.mutateAsync({ quoteId: quote.id, leadTime: trimmedLeadTime });
      await queryClient.invalidateQueries({
        queryKey: trpc.documents.listByQuote.queryOptions({ quoteId: quote.id }).queryKey,
      });
      showToast('success', 'Quote Document generated');
      onGenerated(result.warnings);
      onClose();
    } catch (error) {
      showToast(
        'error',
        error instanceof Error && error.message ? error.message : 'Unable to generate Quote Document.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildTimeDays =
    quote.kind === 'custom' ? null : (availability?.buildTimeDays ?? quote.product?.buildTimeDays ?? null);

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible>
      <SafeAreaProvider>
        <View className="flex-1" style={gluestackConfig[resolved]}>
          <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
              <View className="flex-1 items-center justify-center p-5">
                <Pressable
                  accessibilityLabel="Close Generate Quote Document"
                  className="absolute inset-0 bg-black/60"
                  disabled={isBusy}
                  onPress={close}
                />
                <View className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
                  <View className="flex-row items-center justify-between gap-3 px-5 pb-1 pt-4">
                    <View className="min-w-0 flex-1">
                      <Text className="text-lg text-surface-foreground" weight="bold">
                        Generate Quote Document
                      </Text>
                      <Text className="mt-1 text-xs text-muted-foreground">
                        Create a saved PDF revision from the current saved Quote.
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Close"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isBusy }}
                      className="rounded-lg p-2 active:bg-muted"
                      disabled={isBusy}
                      onPress={close}
                    >
                      <Icon className="text-muted-foreground" icon={IconX} size={20} />
                    </Pressable>
                  </View>

                  <ScrollView contentContainerClassName="gap-4 px-5 pb-4 pt-4" keyboardShouldPersistTaps="handled">
                    <View>
                      <Text className="mb-2 text-sm text-foreground" weight="semibold">
                        Lead time
                      </Text>
                      <TextInput
                        accessibilityLabel="Lead time"
                        className={`h-12 ${leadTimeError ? 'border-danger' : ''}`}
                        editable={!isBusy}
                        onBlur={() => {
                          if (!leadTime.trim()) setLeadTimeError('Lead time is required.');
                        }}
                        onChangeText={(value) => {
                          setHasUserEditedLeadTime(true);
                          setLeadTime(value);
                          if (value.trim()) setLeadTimeError(null);
                        }}
                        value={leadTime}
                      />
                      {leadTimeError ? <Text className="mt-1.5 text-xs text-danger">{leadTimeError}</Text> : null}
                    </View>

                    <View className="gap-2 rounded-xl border border-border bg-muted/20 p-3">
                      <Fact label="Build time" value={buildTimeDays === null ? '—' : `${buildTimeDays} working days`} />
                      {availability?.bays.map((bay) => (
                        <Fact
                          key={bay.bayId}
                          label={`${bay.name} / ${departmentLabels[bay.department]}`}
                          value={`${bay.waitWorkingDays} working days`}
                        />
                      ))}
                      {availabilityQuery.isLoading ? (
                        <Text className="text-xs text-muted-foreground">Loading bay availability…</Text>
                      ) : null}
                    </View>
                  </ScrollView>

                  <View className="flex-row justify-end gap-2 border-t border-border px-5 pb-5 pt-4">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isBusy }}
                      className="rounded-xl border border-border bg-muted px-4 py-3 active:opacity-80"
                      disabled={isBusy}
                      onPress={close}
                    >
                      <Text className="text-sm text-foreground" weight="semibold">
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ busy: isBusy, disabled: isBusy }}
                      className={`flex-row items-center gap-2 rounded-xl bg-primary px-4 py-3 ${isBusy ? 'opacity-60' : 'active:opacity-90'}`}
                      disabled={isBusy}
                      onPress={() => void submit()}
                    >
                      {isBusy ? (
                        <ActivityIndicator className="text-primary-foreground" size="small" />
                      ) : (
                        <Icon className="text-primary-foreground" icon={IconFilePlus} size={17} />
                      )}
                      <Text className="text-sm text-primary-foreground" weight="bold">
                        Generate
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xs text-foreground" weight="semibold">
        {value}
      </Text>
    </View>
  );
}
