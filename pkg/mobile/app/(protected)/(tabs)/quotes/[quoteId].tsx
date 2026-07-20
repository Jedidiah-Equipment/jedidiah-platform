import { IconChevronLeft } from '@tabler/icons-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Temporary destination for Quote cards until the Quote View ticket replaces this scaffold. */
export default function QuoteDetailPlaceholderRoute() {
  const router = useRouter();
  const { quoteId } = useLocalSearchParams<{ quoteId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4">
        <View className="h-11 flex-row items-center gap-3">
          <Pressable
            accessibilityLabel="Back to Quotes"
            accessibilityRole="button"
            className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:opacity-80"
            onPress={() => router.back()}
          >
            <Icon icon={IconChevronLeft} size={19} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-lg text-foreground" numberOfLines={1} weight="bold">
              Quote
            </Text>
            <Text className="text-[10px] text-muted-foreground" mono numberOfLines={1}>
              {quoteId}
            </Text>
          </View>
        </View>
        <View className="rounded-2xl border border-dashed border-border px-4 py-10">
          <Text className="text-center text-sm text-foreground" weight="semibold">
            Quote view coming soon
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
