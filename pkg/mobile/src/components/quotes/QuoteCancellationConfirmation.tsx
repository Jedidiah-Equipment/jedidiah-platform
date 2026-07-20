import type { QuoteDetail } from '@pkg/schema';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

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
  const { resolved } = useColorMode();
  if (!open) return null;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <SafeAreaProvider>
        <View className="flex-1 items-center justify-center p-5" style={gluestackConfig[resolved]}>
          <Pressable accessibilityLabel="Keep quote" className="absolute inset-0 bg-black/60" onPress={onClose} />
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
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
