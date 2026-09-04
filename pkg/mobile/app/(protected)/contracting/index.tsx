import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';

export default function ContractingIndex() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar subtitle="CONTRACTING" title="Jedidiah Contracting" />
      <View className="w-full gap-2 px-4 py-8">
        <Text className="text-lg text-foreground" weight="bold">
          Contracting access is active
        </Text>
        <Text className="text-sm text-muted-foreground">
          Contracting workflows will appear here as they are released.
        </Text>
      </View>
    </SafeAreaView>
  );
}
