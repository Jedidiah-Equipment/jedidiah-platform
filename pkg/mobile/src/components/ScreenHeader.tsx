import { View } from 'react-native';

import { AppIcon } from '@/components/AppLogo';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Text } from '@/components/ui/text';

/** Shared landing-screen title bar with a branded mark, title/caption, and profile menu. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="h-12 flex-row items-center gap-3">
      <View className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
        <AppIcon size={40} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-xl leading-6 text-foreground" numberOfLines={1} weight="bold">
          {title}
        </Text>
        <Text className="mt-0.5 text-[11px] text-muted-foreground" mono numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ProfileMenuButton />
    </View>
  );
}
