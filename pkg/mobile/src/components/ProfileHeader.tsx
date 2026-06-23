import { View } from 'react-native';

import { AppLogo } from '@/components/AppLogo';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';

/**
 * Shared screen header: the app brand on the left and the overflow
 * {@link ProfileMenuButton} (theme toggle + Log out) on the right.
 */
export function ProfileHeader() {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <AppLogo compact />
      </View>
      <ProfileMenuButton />
    </View>
  );
}
