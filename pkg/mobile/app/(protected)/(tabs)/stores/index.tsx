import { IconChecklist } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { PartSearchList } from '@/components/stores/PartSearchList';
import { QuickSwitchModal } from '@/components/stores/QuickSwitchModal';
import { ScanField } from '@/components/stores/ScanField';
import { StoresActorHeader } from '@/components/stores/StoresActorHeader';
import { Icon } from '@/components/ui/icon';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useStoresActor } from '@/lib/stores-actor';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { useStoresScan } from '@/lib/use-stores-scan';

/**
 * The tablet's home: who is at it, one scan field, and the two places a shift starts somewhere
 * other than a Part label.
 *
 * Everything physical begins with a scan, so this screen deliberately has almost nothing else on
 * it. The counting screens of #1060 mount here as a third destination beside the close-out queue —
 * they take the same actor and the same scan stack, and need no new machinery from this screen.
 */
export default function StoresScanHomeRoute() {
  const router = useRouter();
  const refresh = useGlobalRefresh();
  const { keepAlive, selectActor } = useStoresActor();
  const { clearScanError, scan, scanError } = useStoresScan();
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const [search, setSearch] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[820px] gap-5 px-4 pb-8 pt-4"
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl {...refresh} />}
      >
        <ScreenHeader helpTopic="storesTablet" subtitle="SCAN TO MOVE STOCK" title="Stores" />

        <StoresActorHeader onSwitch={() => setQuickSwitchOpen(true)} />

        <View className="gap-3">
          <ScanField onScan={(raw) => void scan(raw)} />
          {scanError === null ? null : (
            <Text className="text-sm text-danger" weight="semibold">
              {scanError}
            </Text>
          )}
        </View>

        <View className="gap-2">
          <Text className="text-[11px] text-muted-foreground" mono>
            CAN’T SCAN THE LABEL?
          </Text>
          <TextInput
            accessibilityLabel="Search Parts by code or name"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(next) => {
              keepAlive();
              clearScanError();
              setSearch(next);
            }}
            placeholder="Search by Part code or name"
            textSize="toolbar"
            value={search}
          />
          <PartSearchList
            onSelect={(partCode) => {
              setSearch('');
              router.push({ params: { partCode }, pathname: '/stores/parts/[partCode]' });
            }}
            search={search}
          />
        </View>

        <View className="gap-3">
          <Text className="text-[11px] text-muted-foreground" mono>
            OTHER WORK
          </Text>
          {/* The only destination that does not begin at a Part label: it begins at a Job. Receiving,
              both returns, and checkout all hang off a scan, so they are reached from the Part screen. */}
          <DestinationTile
            caption="Return leftovers and end a Job’s stock life"
            icon={IconChecklist}
            onPress={() => router.push('/stores/close-out')}
            title="Close-out queue"
          />
        </View>
      </ScrollView>

      <QuickSwitchModal onClose={() => setQuickSwitchOpen(false)} onSelect={selectActor} open={quickSwitchOpen} />
    </SafeAreaView>
  );
}

function DestinationTile({
  caption,
  icon,
  onPress,
  title,
}: {
  caption: string;
  icon: React.ComponentProps<typeof Icon>['icon'];
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-4"
      onPress={onPress}
    >
      <Icon className="text-surface-foreground" icon={icon} size={26} />
      <View className="min-w-0 flex-1">
        <Text className="text-base text-surface-foreground" weight="semibold">
          {title}
        </Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">{caption}</Text>
      </View>
    </Pressable>
  );
}
