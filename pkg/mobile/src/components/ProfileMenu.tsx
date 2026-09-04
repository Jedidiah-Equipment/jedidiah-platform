import { type Business, type HelpTopic, hasBothBusinessAccess, helpUrl } from '@pkg/domain';
import { IconHelpCircle, IconLogout, IconSwitchHorizontal } from '@tabler/icons-react-native';
import * as Linking from 'expo-linking';
import { router, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { docsOrigin } from '@/lib/app-env';
import { signOut } from '@/lib/auth';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { BUSINESS_HOME } from '@/lib/business-home';
import type { ColorModePreference } from '@/theme/ColorModeProvider';
import { useColorMode } from '@/theme/use-color-mode';

const THEME_OPTIONS: { label: string; value: ColorModePreference }[] = [
  { label: 'Dark', value: 'dark' },
  { label: 'Light', value: 'light' },
];

const BUSINESS_LABELS: Record<Business, string> = { contracting: 'Contracting', equipment: 'Equipment' };

function currentBusiness(pathname: string): Business {
  return pathname.startsWith(BUSINESS_HOME.contracting) ? 'contracting' : 'equipment';
}

type ProfileUser = {
  name: string;
  email: string;
  image?: string | null;
};

/**
 * Overflow menu shared across screens: an {@link AnchoredMenu} pinned top-right
 * with optional contextual Help, the theme toggle, and Log out.
 */
export function ProfileMenu({
  helpTopic,
  user,
  onClose,
}: {
  helpTopic?: HelpTopic;
  user: ProfileUser;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const showToast = useAppToast();
  const helpOrigin = docsOrigin;
  const showBusinessSwitcher = hasBothBusinessAccess(getSessionRoleSlots(useAuthSession()));
  const otherBusiness = currentBusiness(usePathname()) === 'contracting' ? 'equipment' : 'contracting';

  return (
    // Anchor below the header's overflow button, clear of the status bar.
    <AnchoredMenu onClose={onClose} style={{ right: 16, top: insets.top + 64, width: 240 }}>
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <Avatar className="h-9 w-9 rounded-lg" name={user.name} uri={user.image} />
        <View className="min-w-0 flex-1">
          <Text className="text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
            {user.name}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
            {user.email}
          </Text>
        </View>
      </View>

      {showBusinessSwitcher ? (
        <View className="border-b border-border p-1.5">
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
            onPress={() => {
              onClose();
              router.replace(BUSINESS_HOME[otherBusiness]);
            }}
          >
            <Icon className="text-muted-foreground" icon={IconSwitchHorizontal} size={18} />
            <Text className="text-sm text-surface-foreground" weight="semibold">
              Switch to {BUSINESS_LABELS[otherBusiness]}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {helpTopic && helpOrigin ? (
        <View className="border-b border-border p-1.5">
          <Pressable
            accessibilityLabel="Open Help"
            accessibilityRole="button"
            className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
            onPress={() => {
              onClose();
              Linking.openURL(helpUrl(helpOrigin, helpTopic)).catch(() => {
                showToast('error', 'Could not open Help in the browser');
              });
            }}
          >
            <Icon className="text-muted-foreground" icon={IconHelpCircle} size={18} />
            <Text className="text-sm text-surface-foreground" weight="semibold">
              Help
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View className="gap-2 p-3">
        <Text className="text-[11px] uppercase tracking-wider text-muted-foreground" weight="semibold">
          Theme
        </Text>
        <ThemeToggle />
      </View>

      <View className="border-t border-border p-1.5">
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
          onPress={() => {
            onClose();
            void signOut();
          }}
        >
          <Icon className="text-danger" icon={IconLogout} size={18} />
          <Text className="text-sm text-danger" weight="semibold">
            Log out
          </Text>
        </Pressable>
      </View>
    </AnchoredMenu>
  );
}

function ThemeToggle() {
  const { preference, setPreference } = useColorMode();

  return (
    <View className="flex-row rounded-xl border border-border bg-muted p-1">
      {THEME_OPTIONS.map((option) => {
        const selected = preference === option.value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 items-center rounded-lg py-2 ${selected ? 'bg-surface' : ''}`}
            key={option.value}
            onPress={() => setPreference(option.value)}
          >
            <Text
              className={`text-xs ${selected ? 'text-surface-foreground' : 'text-muted-foreground'}`}
              weight={selected ? 'semibold' : 'regular'}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
