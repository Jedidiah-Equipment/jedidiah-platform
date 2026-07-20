import type React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * RN Modal portals outside the app providers; restoring theme tokens and safe-area measurement
 * here keeps modal content correct on native, web, and both colour schemes. `children` is the
 * card/drawer surface; the backdrop Pressable dismisses unless `dismissDisabled`.
 */
export function ThemedModal({
  backdropLabel,
  children,
  dismissDisabled = false,
  onClose,
  open,
  placement = 'center',
}: {
  backdropLabel: string;
  children: React.ReactNode;
  dismissDisabled?: boolean;
  onClose: () => void;
  open: boolean;
  placement?: 'center' | 'right';
}) {
  const { resolved } = useColorMode();
  const close = () => {
    if (!dismissDisabled) onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={open}>
      <SafeAreaProvider>
        <View className="flex-1" style={gluestackConfig[resolved]}>
          <SafeAreaView className="flex-1" edges={['top', 'bottom', 'left', 'right']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
              <View
                className={
                  placement === 'center' ? 'flex-1 items-center justify-center p-5' : 'flex-1 flex-row justify-end'
                }
              >
                <Pressable
                  accessibilityLabel={backdropLabel}
                  className={`absolute inset-0 ${placement === 'center' ? 'bg-black/60' : 'bg-black/55'}`}
                  disabled={dismissDisabled}
                  onPress={close}
                />
                {children}
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
