import { Image, View } from 'react-native';

import { Text } from './ui/text';

// Same mark as the web app's <AppBrand> (pkg/web/src/components/common/AppBrand.tsx).
const logo = require('../../assets/logo_small.png');

export function BrandHeader({ centered = false, subtitle }: { centered?: boolean; subtitle: string }) {
  return (
    <View className={`mb-7 gap-2 ${centered ? 'items-center' : 'items-start'}`}>
      <Image className="h-16 w-16 rounded-2xl" resizeMode="cover" source={logo} />
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
