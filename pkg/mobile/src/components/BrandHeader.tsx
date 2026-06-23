import { View } from 'react-native';

import { AppLogo } from './AppLogo';
import { Text } from './ui/text';

export function BrandHeader({ centered = false, subtitle }: { centered?: boolean; subtitle: string }) {
  return (
    <View className={`mb-7 gap-2 ${centered ? 'items-center' : 'items-start'}`}>
      <AppLogo centered={centered} />
      <Text className={`text-base leading-6 text-muted-foreground ${centered ? 'text-center' : ''}`}>{subtitle}</Text>
    </View>
  );
}
