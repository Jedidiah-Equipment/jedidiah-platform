import { IconChevronLeft } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import type React from 'react';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StoresActorHeader } from '@/components/stores/StoresActorHeader';
import { Icon } from '@/components/ui/icon';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { useStoresActor } from '@/lib/stores-actor';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { QuickSwitchModal } from './QuickSwitchModal';

/**
 * The chrome every stores screen below the scan home wears: back, title, and the actor header.
 *
 * The actor header repeats on every screen on purpose. A shift is a chain of scans through several
 * screens, and the one question that must never need a back-navigation to answer is "whose name is
 * about to go on this?" — so it travels with the work rather than living only on the home screen.
 */
export function StoresScreen({
  children,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  subtitle?: string;
  title: string;
}) {
  const router = useRouter();
  const refresh = useGlobalRefresh();
  const { selectActor } = useStoresActor();
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[820px] gap-5 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...refresh} />}
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            className="shrink-0 rounded-xl border border-border bg-surface p-2"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/stores'))}
          >
            <Icon className="text-surface-foreground" icon={IconChevronLeft} size={22} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-xl leading-6 text-foreground" numberOfLines={1} weight="bold">
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text className="mt-0.5 text-[11px] text-muted-foreground" mono numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        <StoresActorHeader onSwitch={() => setQuickSwitchOpen(true)} />

        {children}
      </ScrollView>

      <QuickSwitchModal onClose={() => setQuickSwitchOpen(false)} onSelect={selectActor} open={quickSwitchOpen} />
    </SafeAreaView>
  );
}
