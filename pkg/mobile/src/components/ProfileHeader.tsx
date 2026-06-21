import { roleLabels } from '@pkg/domain';
import type { AppRole } from '@pkg/schema';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/lib/auth-session';

/**
 * Shared screen header: the signed-in user's avatar and name, their role label,
 * and the overflow {@link ProfileMenuButton} (theme toggle + Log out). Used
 * across the Bay Operator screens.
 */
export function ProfileHeader() {
  const { user } = useAuthSession();
  const roleLabel = user.role && user.role in roleLabels ? roleLabels[user.role as AppRole] : null;

  return (
    <View className="flex-row items-center gap-3">
      <Avatar className="h-11 w-11 rounded-full" name={user.name} textClassName="text-sm" uri={user.image} />
      <View className="min-w-0 flex-1">
        <Text className="text-lg leading-6 text-foreground" numberOfLines={1} weight="bold">
          {user.name}
        </Text>
        {roleLabel ? (
          <Text className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{roleLabel}</Text>
        ) : null}
      </View>

      <ProfileMenuButton />
    </View>
  );
}
