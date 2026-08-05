import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainTabToolbar } from '@/components/TopToolbar';
import type { MainTabParent } from '@/lib/toolbar-navigation';
import { loadingSpinnerColor } from '@/theme/brand-colors';

export function TabAccessLoadingScreen({ parent, title }: { parent: MainTabParent; title: string }) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar assistantParent={parent} subtitle="CHECKING ACCESS" title={title} />
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator accessibilityLabel="Checking access" color={loadingSpinnerColor} size="large" />
      </View>
    </SafeAreaView>
  );
}
