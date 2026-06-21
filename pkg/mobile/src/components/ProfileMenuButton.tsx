import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ProfileMenu } from '@/components/ProfileMenu';
import { useAuthSession } from '@/lib/auth-session';

/**
 * The overflow affordance shared by every screen header: a three-dot button that
 * opens the {@link ProfileMenu} (theme toggle + Log out) for the signed-in user.
 */
export function ProfileMenuButton() {
  const session = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = { name: session.user.name, email: session.user.email, image: session.user.image };

  return (
    <>
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
    </>
  );
}
