import { Image, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColorMode } from '@/theme/use-color-mode';

// Expo needs local static asset paths; these mirror the shared source in @pkg/domain/assets/brand.
const logoMarkBlack = require('../../assets/brand/jedidiah-mark-black.png');
const logoMarkWhite = require('../../assets/brand/jedidiah-mark-white.png');

export function AppLogo({ centered = false, compact = false }: { centered?: boolean; compact?: boolean }) {
  const { resolved } = useColorMode();
  const logoMark = resolved === 'dark' ? logoMarkWhite : logoMarkBlack;

  if (compact) {
    return (
      <View
        accessibilityLabel="JedidiahOps"
        accessibilityRole="image"
        className="min-w-0 flex-row items-center gap-2.5"
      >
        <Image className="h-10 w-10" resizeMode="contain" source={logoMark} />
        <LogoText className="shrink text-[24px] leading-8" />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="JedidiahOps"
      accessibilityRole="image"
      className={`gap-2 ${centered ? 'items-center' : 'items-start'}`}
    >
      <Image className="h-16 w-16" resizeMode="contain" source={logoMark} />
      <LogoText className={`text-[34px] leading-10 ${centered ? 'text-center' : ''}`} />
    </View>
  );
}

function LogoText({ className }: { className: string }) {
  return (
    <Text className={`text-foreground ${className}`} numberOfLines={1} weight="bold">
      Jedidiah
      <Text className="text-primary" weight="bold">
        Ops
      </Text>
    </Text>
  );
}
