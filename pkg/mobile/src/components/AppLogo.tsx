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
        {/* Explicit numeric size: react-native-web inlines a bare Image's intrinsic
            dimensions, which beat NativeWind's h-9/w-9 classes (style > class). */}
        <Image resizeMode="contain" source={logoMark} style={{ height: 36, width: 36 }} />
        <LogoText className="shrink text-[20px] leading-8" />
      </View>
    );
  }

  return (
    <View
      accessibilityLabel="JedidiahOps"
      accessibilityRole="image"
      className={`gap-2 ${centered ? 'items-center' : 'items-start'}`}
    >
      {/* See compact branch: explicit numeric size so the web build doesn't fall back
          to the asset's intrinsic dimensions. */}
      <Image resizeMode="contain" source={logoMark} style={{ height: 64, width: 64 }} />
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
