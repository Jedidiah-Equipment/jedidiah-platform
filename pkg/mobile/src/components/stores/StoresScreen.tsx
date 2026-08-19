import type { HelpTopic } from '@pkg/domain';
import type React from 'react';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StoresActorHeader } from '@/components/stores/StoresActorHeader';
import { SecondaryPageToolbar } from '@/components/TopToolbar';
import { RefreshControl } from '@/components/ui/refresh-control';
import { isNearVerticalScrollEnd } from '@/lib/scroll-pagination';
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
  helpTopic = 'storesTablet',
  onNearScrollEnd,
  onBack,
  parentLabel,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  helpTopic?: HelpTopic;
  onNearScrollEnd?: () => void;
  onBack: () => void;
  parentLabel: string;
  subtitle: string;
  title: string;
}) {
  const refresh = useGlobalRefresh();
  const { selectActor } = useStoresActor();
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryPageToolbar
        helpTopic={helpTopic}
        onBack={onBack}
        parentLabel={parentLabel}
        subtitle={subtitle}
        title={title}
      />
      <ScrollView
        contentContainerClassName="w-full gap-5 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
        onScroll={
          onNearScrollEnd
            ? (event) => {
                if (isNearVerticalScrollEnd(event.nativeEvent)) onNearScrollEnd();
              }
            : undefined
        }
        refreshControl={<RefreshControl {...refresh} />}
        scrollEventThrottle={onNearScrollEnd ? 100 : undefined}
      >
        <StoresActorHeader onSwitch={() => setQuickSwitchOpen(true)} />

        {children}
      </ScrollView>

      <QuickSwitchModal onClose={() => setQuickSwitchOpen(false)} onSelect={selectActor} open={quickSwitchOpen} />
    </SafeAreaView>
  );
}
