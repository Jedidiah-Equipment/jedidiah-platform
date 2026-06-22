import { Image, View } from 'react-native';

import { Text } from './ui/text';

// Expo needs local static asset paths; these mirror the shared source in @pkg/domain/assets/brand.
const logoMarkBlack = require('../../assets/brand/jedidiah-mark-black.png');
const logoMarkWhite = require('../../assets/brand/jedidiah-mark-white.png');

export function BrandHeader({ centered = false, subtitle }: { centered?: boolean; subtitle: string }) {
  return (
    <View className={`mb-7 gap-2 ${centered ? 'items-center' : 'items-start'}`}>
      <View className="h-16 w-16">
        <Image className="h-16 w-16 dark:hidden" resizeMode="contain" source={logoMarkBlack} />
        <Image className="hidden h-16 w-16 dark:flex" resizeMode="contain" source={logoMarkWhite} />
      </View>
      <Text className={`text-[34px] leading-10 text-foreground ${centered ? 'text-center' : ''}`} weight="bold">
        Jedidiah
        <Text className="text-primary" weight="bold">
          Ops
        </Text>
      </Text>
      <Text className={`text-base leading-6 text-muted-foreground ${centered ? 'text-center' : ''}`}>{subtitle}</Text>
    </View>
  );
}
