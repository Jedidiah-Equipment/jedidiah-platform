import { IconDots } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { ProfileMenu } from '@/components/ProfileMenu';
import { Icon } from '@/components/ui/icon';
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
        className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
        onPress={() => setMenuOpen(true)}
      >
        <Icon className="text-muted-foreground" icon={IconDots} size={20} />
      </Pressable>

      {menuOpen ? <ProfileMenu onClose={() => setMenuOpen(false)} user={user} /> : null}
    </>
  );
}
