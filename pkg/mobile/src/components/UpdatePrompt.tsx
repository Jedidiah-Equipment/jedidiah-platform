import { IconCloudDownload, IconRefreshAlert } from '@tabler/icons-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useAppUpdate } from '@/lib/use-app-update';

export const updateDismissLabel = 'Not now';
export const updateInstallLabel = 'Update now';
export const updateRetryLabel = 'Try again';

const promptCopy = {
  failed: {
    message: 'The new version could not be installed. Check your connection and try again.',
    title: "Update didn't install",
  },
  installing: {
    message: 'Installing the update. The app restarts on its own when it is done.',
    title: 'Updating',
  },
  offered: {
    message:
      'A newer version of the app is ready. Installing it restarts the app, so finish what you are busy with first.',
    title: 'Update available',
  },
} as const;

/**
 * The app's update prompt. Mounted once over the navigator in `app/_layout.tsx` next to the offline
 * gate, so a new version is offered wherever the user happens to be. Installing restarts the app,
 * which is why this asks rather than acting: the user picks the moment, and "Not now" holds until a
 * newer version than the one they waved off shows up.
 *
 * The way out stays open even while an install runs — a download on a bad signal must never be able
 * to lock someone out of the app mid-shift.
 */
export function UpdatePrompt() {
  const { dismiss, install, prompt } = useAppUpdate();

  if (prompt.kind === 'hidden') {
    return null;
  }

  const { message, title } = promptCopy[prompt.kind];
  const isInstalling = prompt.kind === 'installing';
  const hasFailed = prompt.kind === 'failed';

  return (
    <ThemedModal backdropLabel={updateDismissLabel} onClose={() => dismiss(prompt.updateKey)} open>
      <View className="w-full max-w-[520px] gap-4 rounded-2xl border border-border bg-surface p-5">
        <View className="flex-row items-center gap-3">
          <View
            className={`h-11 w-11 items-center justify-center rounded-full border ${
              hasFailed ? 'border-danger/25 bg-danger/10' : 'border-primary/25 bg-primary/10'
            }`}
          >
            {isInstalling ? (
              <ActivityIndicator accessibilityLabel={title} size="small" />
            ) : (
              <Icon
                className={hasFailed ? 'text-danger' : 'text-surface-foreground'}
                icon={hasFailed ? IconRefreshAlert : IconCloudDownload}
                size={22}
              />
            )}
          </View>
          <Text className="flex-1 text-xl text-surface-foreground" weight="bold">
            {title}
          </Text>
        </View>
        <Text className="text-base text-muted-foreground">{message}</Text>
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            className="flex-1 items-center rounded-xl border border-border px-4 py-3"
            onPress={() => dismiss(prompt.updateKey)}
          >
            <Text className="text-base text-surface-foreground" weight="semibold">
              {updateDismissLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isInstalling, disabled: isInstalling }}
            className={`flex-1 items-center rounded-xl bg-primary px-4 py-3 ${isInstalling ? 'opacity-40' : ''}`}
            disabled={isInstalling}
            onPress={install}
          >
            <Text className="text-base text-primary-foreground" weight="bold">
              {hasFailed ? updateRetryLabel : updateInstallLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </ThemedModal>
  );
}
