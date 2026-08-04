import { type HelpTopic, helpUrl } from '@pkg/domain';
import { IconHelpCircle } from '@tabler/icons-react-native';
import * as Linking from 'expo-linking';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useAppToast } from '@/components/ui/toast';
import { docsOrigin } from '@/lib/app-env';

/**
 * Opens this screen's docs page in the system browser. The docs site is public, so a shared tablet
 * meets no login wall — nothing about the session is handed off. Renders nothing when no docs site
 * is configured, since there would be nothing to open.
 */
export function HelpButton({ topic }: { topic: HelpTopic }) {
  const showToast = useAppToast();
  // Bound locally so the narrowing survives into the onPress closure.
  const origin = docsOrigin;

  if (!origin) return null;

  return (
    <Pressable
      accessibilityLabel="Open Help"
      accessibilityRole="button"
      className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
      onPress={() => {
        // A restricted tablet can refuse the URL outright; say so rather than looking unresponsive.
        Linking.openURL(helpUrl(origin, topic)).catch(() => {
          showToast('error', 'Could not open Help in the browser');
        });
      }}
    >
      <Icon className="text-muted-foreground" icon={IconHelpCircle} size={20} />
    </Pressable>
  );
}
