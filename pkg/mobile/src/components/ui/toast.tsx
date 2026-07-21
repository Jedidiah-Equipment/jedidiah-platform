import { createToastHook } from '@gluestack-ui/toast';
import { AnimatePresence, Motion } from '@legendapp/motion';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react-native';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

// gluestack animates each toast's mount/unmount through a Motion view inside an
// AnimatePresence; hand it the Legend Motion primitives the hook expects. The
// matching `ToastProvider` is mounted in `GluestackUIProvider`.
const useGluestackToast = createToastHook(Motion.View, AnimatePresence);

type ToastTone = 'success' | 'error';

const TONE: Record<ToastTone, { accent: string; icon: typeof IconCircleCheck }> = {
  success: { accent: 'text-status-scheduled', icon: IconCircleCheck },
  error: { accent: 'text-danger', icon: IconAlertTriangle },
};

/**
 * App toast helper — the first toast surface in the mobile app. Wraps gluestack's
 * toast context with tone-keyed callbacks that render the standard themed card, so
 * call sites never repeat the render boilerplate. `ToastList` already wraps each
 * toast in a `SafeAreaView`, so the card only needs its own inset margin.
 */
export function useAppToast() {
  const toast = useGluestackToast();

  return useCallback(
    (tone: ToastTone, message: string) =>
      toast.show({
        placement: 'top',
        render: ({ id }) => <ToastCard message={message} nativeID={id} tone={tone} />,
      }),
    [toast],
  );
}

function ToastCard({ message, nativeID, tone }: { message: string; nativeID: string; tone: ToastTone }) {
  const { accent, icon } = TONE[tone];
  const { resolved } = useColorMode();

  return (
    // Toasts render through an overlay outside the themed view, so restore the
    // active variables at the overlay boundary before resolving semantic colours.
    <View style={gluestackConfig[resolved]}>
      <View
        className="mx-4 mt-2 flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg"
        nativeID={`toast-${nativeID}`}
      >
        <Icon className={accent} icon={icon} size={20} />
        <Text className="flex-1 text-sm text-surface-foreground" weight="semibold">
          {message}
        </Text>
      </View>
    </View>
  );
}
