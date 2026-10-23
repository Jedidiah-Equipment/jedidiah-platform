import { IconX } from '@tabler/icons-react-native';
import type React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ScrollLockScrollView } from '@/components/scroll-lock';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * A full-screen sheet over the current page: a title with what it is about, a scrolling body its fields can hold
 * still, and a footer pinned above the keyboard. Every in-place form that opens over a page uses it.
 */
export function ModalSheet({
  title,
  subtitle,
  error = null,
  footer,
  onClose,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  error?: string | null;
  footer: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { resolved } = useColorMode();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible>
      {/* RN Modal portals to a native root outside GluestackUIProvider, so re-apply the
          scheme's CSS variables on a wrapping view (semantic classes resolve against the
          parent var context) or the modal's tokens fall back to light. The Modal also sits
          outside the root SafeAreaProvider, so its SafeAreaView would read zero insets and
          slide the header under the notch; a nested provider re-measures insets here. */}
      <SafeAreaProvider>
        <View className="flex-1" style={gluestackConfig[resolved]}>
          <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text className="text-lg text-foreground" weight="bold">
                  {title}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" className="p-1" onPress={onClose}>
                <Icon className="text-muted-foreground" icon={IconX} size={22} />
              </Pressable>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
              <ScrollLockScrollView
                contentContainerClassName="gap-4 px-4 pb-6 pt-4"
                keyboardShouldPersistTaps="handled"
              >
                {error ? (
                  <View className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5">
                    <Text className="text-sm text-danger">{error}</Text>
                  </View>
                ) : null}
                {children}
              </ScrollLockScrollView>
              <View className="border-t border-border px-4 py-3">{footer}</View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

/** The sheet's primary action: a spinner while it submits, and held off while `disabled`. */
export function SheetSubmitButton({
  disabled = false,
  isSubmitting,
  label,
  onPress,
}: {
  disabled?: boolean;
  isSubmitting: boolean;
  label: string;
  onPress: () => void;
}) {
  const inert = isSubmitting || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert }}
      className={`flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 ${inert ? 'opacity-60' : 'active:opacity-90'}`}
      disabled={inert}
      onPress={onPress}
    >
      {isSubmitting ? <ActivityIndicator color="#0a0a0a" size="small" /> : null}
      <Text className="text-sm text-primary-foreground" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}
