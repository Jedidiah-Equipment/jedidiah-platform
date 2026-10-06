import { type ReactNode, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { ScrollLockContext } from '@/components/scroll-lock';
import { Text } from '@/components/ui/text';
import { useKeyboardBottomPadding } from '@/lib/keyboard-padding';

/**
 * A secondary page that is one form: its toolbar, a scrolling body, and a footer that stays above the keyboard
 * with the action's error over its buttons.
 */
export function FormPage({
  toolbar,
  children,
  footer,
  error,
}: {
  toolbar: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  error: string | null;
}) {
  const { bottom } = useSafeAreaInsets();
  // The footer rides on the keyboard's full height, so Save stays visible while a field is being typed in. The page
  // leaves the bottom edge unpadded, so no safe area comes off it.
  const keyboardPadding = useKeyboardBottomPadding(0);
  const [scrollLocked, setScrollLocked] = useState(false);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {toolbar}
      <View className="flex-1" style={{ paddingBottom: keyboardPadding }}>
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!scrollLocked}
          contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
        >
          <ScrollLockContext.Provider value={setScrollLocked}>{children}</ScrollLockContext.Provider>
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: keyboardPadding > 0 ? 12 : Math.max(bottom, 16) }}
        >
          {error ? (
            <Text className="text-danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {footer}
        </View>
      </View>
    </SafeAreaView>
  );
}
