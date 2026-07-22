import type { QuoteDetail } from '@pkg/schema';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { ThemedModal } from '@/components/ui/themed-modal';
import { parseQuoteCancellationReason } from '@/lib/quote-presentation';

export function QuoteCancellationConfirmation({
  onClose,
  onConfirm,
  open,
  quote,
}: {
  onClose: () => void;
  onConfirm: (cancellationReason: string) => void;
  open: boolean;
  quote: QuoteDetail;
}) {
  const [cancellationReason, setCancellationReason] = useState('');
  const parsedCancellationReason = parseQuoteCancellationReason(cancellationReason);

  useEffect(() => {
    if (!open) setCancellationReason('');
  }, [open]);

  return (
    <ThemedModal backdropLabel="Keep quote" onClose={onClose} open={open}>
      <View className="w-full max-w-[400px] rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <Text className="text-lg text-surface-foreground" weight="bold">
          Cancel quote {quote.code}?
        </Text>
        <Text className="mt-3 text-sm leading-5 text-muted-foreground">
          This is permanent — a cancelled quote cannot be reopened.
        </Text>
        {quote.job ? (
          <Text className="mt-2 text-sm leading-5 text-danger">
            This will also cancel Job {quote.job.jobCode} and remove its remaining scheduled slots.
          </Text>
        ) : null}
        <View className="mt-4 gap-2">
          <Text className="text-xs text-surface-foreground" weight="semibold">
            Cancellation reason
          </Text>
          <TextInput
            accessibilityLabel="Cancellation reason"
            autoFocus
            className="min-h-24"
            multiline
            onChangeText={setCancellationReason}
            placeholder="Explain why this quote is being cancelled"
            textAlignVertical="top"
            value={cancellationReason}
          />
        </View>
        <View className="mt-5 flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            className="rounded-xl border border-border bg-muted px-4 py-3 active:opacity-80"
            onPress={onClose}
          >
            <Text className="text-sm text-foreground" weight="semibold">
              Keep quote
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !parsedCancellationReason }}
            className={`rounded-xl bg-danger px-4 py-3 ${parsedCancellationReason ? 'active:opacity-80' : 'opacity-50'}`}
            disabled={!parsedCancellationReason}
            onPress={() => {
              if (parsedCancellationReason) onConfirm(parsedCancellationReason);
            }}
          >
            <Text className="text-sm text-danger-foreground" weight="bold">
              Cancel quote
            </Text>
          </Pressable>
        </View>
      </View>
    </ThemedModal>
  );
}
