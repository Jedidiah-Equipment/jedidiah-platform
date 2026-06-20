import type { BayOperator } from '@pkg/schema';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ProfileMenu } from '@/components/ProfileMenu';
import { Text } from '@/components/ui/text';
import { useAuthSession } from '@/lib/auth-session';

/**
 * Shared top bar for a Bay's schedule: a back button, the Bay operator's avatar,
 * the Bay name over a 'Bay schedule' caption, and the overflow {@link ProfileMenu}
 * (theme toggle + Log out). Mirrors the Bay List's {@link ProfileHeader} layout.
 */
export function ScheduleHeader({
  title,
  subtitle = 'Bay schedule',
  operator,
  onBack,
}: {
  title: string;
  /** Caption under the title — switches to 'Job slot' when a phone shows the detail pane (#520). */
  subtitle?: string;
  operator: BayOperator | null;
  onBack: () => void;
}) {
  const session = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = { name: session.user.name, email: session.user.email, image: session.user.image };

  return (
    <View className="flex-row items-center gap-2 border-b border-border bg-background px-4 py-3">
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={onBack}
      >
        <Text className="text-lg leading-5 text-foreground" weight="semibold">
          ‹
        </Text>
      </Pressable>

      <Avatar
        className="h-10 w-10 rounded-full"
        name={operator?.name ?? 'Unassigned'}
        uri={operator?.thumbnailDataUrl}
      />

      <View className="min-w-0 flex-1">
        <Text className="text-base leading-5 text-foreground" numberOfLines={1} weight="bold">
          {title}
        </Text>
        <Text className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{subtitle}</Text>
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
