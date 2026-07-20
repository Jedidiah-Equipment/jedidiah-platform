import type React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';

/**
 * Expandable option list rendered under a picker input. Row content comes from `renderRow`;
 * pass `selectedKey` when rows should expose a selected accessibility state.
 */
export function PickerDropdown<T>({
  emptyMessage,
  keyOf,
  onSelect,
  open,
  pending,
  renderRow,
  rows,
  selectedKey,
}: {
  emptyMessage: string;
  keyOf: (row: T) => string;
  onSelect: (row: T) => void;
  open: boolean;
  pending: boolean;
  renderRow: (row: T) => React.ReactNode;
  rows: readonly T[];
  selectedKey?: string;
}) {
  if (!open) return null;

  return (
    <View className="overflow-hidden rounded-xl border border-border bg-surface" style={{ maxHeight: 220 }}>
      {pending ? (
        <View className="items-center px-3 py-4">
          <ActivityIndicator size="small" />
        </View>
      ) : rows.length === 0 ? (
        <View className="px-3 py-3">
          <Text className="text-sm text-muted-foreground">{emptyMessage}</Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {rows.map((row, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={selectedKey === undefined ? undefined : { selected: keyOf(row) === selectedKey }}
              className={`flex-row items-center gap-3 px-3 py-3 active:bg-muted ${
                index > 0 ? 'border-t border-border' : ''
              }`}
              key={keyOf(row)}
              onPress={() => onSelect(row)}
            >
              {renderRow(row)}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
