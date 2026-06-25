import { IconChevronLeft } from '@tabler/icons-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * Job Detail route, keyed by Job id and opened from a Job List card (#614). The full
 * production-route + documents screen lands in #615; this is the navigable tap target it
 * builds on. Back goes to the previous screen, or home when there is no history (deep-link safe).
 */
export default function JobDetailRoute() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3.5">
        <Pressable
          accessibilityRole="button"
          className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:opacity-70"
          onPress={onBack}
        >
          <Icon className="text-foreground" icon={IconChevronLeft} size={18} />
        </Pressable>
        <Text className="text-lg text-foreground" weight="bold">
          Job detail
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">
          The production route and documents for this Job are coming soon.
        </Text>
        <Text className="mt-1 text-center text-xs text-muted-foreground" mono>
          {jobId}
        </Text>
      </View>
    </SafeAreaView>
  );
}
