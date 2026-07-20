import Constants from 'expo-constants';
import { Image, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { isStagingRuntimeApp } from '@/lib/runtime-app-identity';
import { useColorMode } from '@/theme/use-color-mode';

// Expo needs local static asset paths; these mirror the shared source in @pkg/domain/assets/brand.
const logoMarkBlack = require('../../assets/brand/jedidiah-mark-black.png');
const logoMarkWhite = require('../../assets/brand/jedidiah-mark-white.png');
const productionAppIcon = require('../../assets/icon.png');
const stagingAppIcon = require('../../assets/icon-staging.png');

export function AppLogo({ centered = false, compact = false }: { centered?: boolean; compact?: boolean }) {
  if (compact) {
    return (
      <View
        accessibilityLabel="JedidiahOps"
        accessibilityRole="image"
        className="min-w-0 flex-row items-center gap-2.5"
      >
        {/* Explicit numeric size: react-native-web inlines a bare Image's intrinsic
            dimensions, which beat NativeWind's h-9/w-9 classes (style > class). */}
        <AppLogoMark size={36} />
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
      <AppLogoMark size={64} />
      <LogoText className={`text-[34px] leading-10 ${centered ? 'text-center' : ''}`} />
    </View>
  );
}

export function AppLogoMark({ size }: { size: number }) {
  const { resolved } = useColorMode();
  const logoMark = resolved === 'dark' ? logoMarkWhite : logoMarkBlack;

  return <Image accessible={false} resizeMode="contain" source={logoMark} style={{ height: size, width: size }} />;
}

/** Uses the icon selected by the native build identity, independent of API environment. */
export function AppIcon({ size }: { size: number }) {
  const source = isStagingRuntimeApp(Constants.expoConfig) ? stagingAppIcon : productionAppIcon;

  return (
    <Image
      accessible={false}
      resizeMode="contain"
      source={source}
      style={{ borderRadius: size / 4, height: size, width: size }}
    />
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
