import type { QuoteDetail } from '@pkg/schema';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

export function QuoteCancellationConfirmation({
  onClose,
  onConfirm,
  open,
  quote,
}: {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  quote: QuoteDetail;
}) {
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
            className="rounded-xl bg-danger px-4 py-3 active:opacity-80"
            onPress={onConfirm}
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
