import { type HelpTopic, helpUrl } from '@pkg/domain';
import { IconHelpCircle } from '@tabler/icons-react-native';
import * as Linking from 'expo-linking';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { docsOrigin } from '@/lib/app-env';

/**
 * Opens this screen's docs page in the system browser. The docs site is public, so a shared tablet
 * meets no login wall — nothing about the session is handed off.
 */
export function HelpButton({ topic }: { topic: HelpTopic }) {
  return (
    <Pressable
      accessibilityLabel="Open Help"
      accessibilityRole="button"
      className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
      onPress={() => {
        void Linking.openURL(helpUrl(docsOrigin, topic));
      }}
    >
      <Icon className="text-muted-foreground" icon={IconHelpCircle} size={20} />
    </Pressable>
  );
}
