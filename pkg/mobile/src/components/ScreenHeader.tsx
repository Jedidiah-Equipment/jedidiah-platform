import { View } from 'react-native';

import { AppIcon } from '@/components/AppLogo';
import { AssistantEntryButton } from '@/components/assistant/AssistantEntryButton';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Text } from '@/components/ui/text';

/** Shared landing-screen title bar with a branded mark, title/caption, and profile menu. */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="h-12 flex-row items-center gap-3">
      {/* No rem-sized wrapper: NativeWind rem is 14px on native (16px on web), so an
          h-10/w-10 box is 35pt and clips the 40pt icon. AppIcon sizes and clips itself. */}
      <View className="shrink-0">
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
      <AssistantEntryButton />
      <ProfileMenuButton />
    </View>
  );
}
