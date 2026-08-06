import type React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

/**
 * The tablet's "are you sure" surface: a title, whatever evidence the caller wants read, and two
 * buttons — back out, or commit.
 *
 * Shared rather than written per screen because the shape of the decision is what makes it safe.
 * The way out is always on the left and always plain, the commit is always on the right and always
 * the only filled control, and the backdrop dismisses to the same place as the left button. A screen
 * that arranged those differently would be asking a person mid-shift to read before tapping.
 */
export function StoresConfirmModal({
  cancelLabel,
  children,
  confirmLabel,
  isPending = false,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  cancelLabel: string;
  children: React.ReactNode;
  confirmLabel: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  return (
    <ThemedModal backdropLabel={cancelLabel} onClose={onCancel} open={open}>
      <View className="w-full max-w-[520px] gap-4 rounded-2xl border border-border bg-surface p-5">
        <Text className="text-xl text-surface-foreground" weight="bold">
          {title}
        </Text>
        {children}
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            className="flex-1 items-center rounded-xl border border-border px-4 py-3"
            onPress={onCancel}
          >
            <Text className="text-base text-surface-foreground" weight="semibold">
              {cancelLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ busy: isPending, disabled: isPending }}
            className={`flex-1 items-center rounded-xl bg-primary px-4 py-3 ${isPending ? 'opacity-40' : ''}`}
            disabled={isPending}
            onPress={onConfirm}
          >
            <Text className="text-base text-primary-foreground" weight="bold">
              {confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </ThemedModal>
  );
}
