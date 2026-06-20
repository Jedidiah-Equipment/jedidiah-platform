import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/lib/auth-session';

/**
 * Shared screen header: the signed-in manager's avatar and name, the static
 * 'Department Manager' role line, and an overflow button opening the {@link
 * ProfileMenu} (theme toggle + Log out). Used across the Bay Operator screens.
 */
export function ProfileHeader() {
  const session = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = { name: session.user.name, email: session.user.email, image: session.user.image };

  return (
    <View className="flex-row items-center gap-3">
      <Avatar className="h-11 w-11 rounded-full" name={user.name} textClassName="text-sm" uri={user.image} />
      <View className="min-w-0 flex-1">
        <Text className="text-lg leading-6 text-foreground" numberOfLines={1} weight="bold">
          {user.name}
        </Text>
        <Text className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">Department Manager</Text>
      </View>

      <Pressable
        accessibilityLabel="Open menu"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center gap-1 rounded-xl border border-border bg-surface active:bg-muted"
        onPress={() => setMenuOpen(true)}
      >
        {/* Vertical three-dot overflow glyph drawn from View dots (theme-aware fill). */}
        {[0, 1, 2].map((dot) => (
          <View className="h-1 w-1 rounded-full bg-muted-foreground" key={dot} />
        ))}
      </Pressable>

      {menuOpen ? <ProfileMenu onClose={() => setMenuOpen(false)} user={user} /> : null}
    </View>
  );
}
