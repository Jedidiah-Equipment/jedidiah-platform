import type { ReactNode } from 'react';
import { Modal, Pressable, type StyleProp, View, type ViewStyle } from 'react-native';

import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * Floating menu card rendered in a Modal so it sits above scrolling content on
 * every platform; tapping the backdrop dismisses it. Position the card in window
 * coordinates via `style` (e.g. from `measureInWindow` on the anchor control).
 */
export function AnchoredMenu({
  children,
  onClose,
  style,
  dismissLabel = 'Dismiss menu',
}: {
  children: ReactNode;
  onClose: () => void;
  style: StyleProp<ViewStyle>;
  dismissLabel?: string;
}) {
  const { resolved } = useColorMode();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      {/* Modal contents render outside the themed tree, so re-apply the theme vars here. */}
      <Pressable
        accessibilityLabel={dismissLabel}
        className="flex-1"
        onPress={onClose}
        style={gluestackConfig[resolved]}
      >
        <View className="absolute overflow-hidden rounded-2xl border border-border bg-surface shadow-lg" style={style}>
          {/* Capture taps inside the card so they don't reach the dismiss backdrop. */}
          <Pressable onPress={() => {}}>{children}</Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
