import { IconSparkles } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useAssistantEnabled } from '@/lib/use-access';

export function AssistantEntryButton() {
  const router = useRouter();
  const assistantEnabled = useAssistantEnabled();

  if (!assistantEnabled) return null;

  return (
    <Pressable
      accessibilityLabel="Open Assistant"
      accessibilityRole="button"
      className="h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface active:bg-muted"
      onPress={() => router.push('/assistant')}
    >
      <Icon className="text-primary" icon={IconSparkles} size={20} />
    </Pressable>
  );
}
