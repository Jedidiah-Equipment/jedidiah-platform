import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';

/**
 * A keyed quantity. Quantities are never scan-repeated (spec §10) — scanning a label ten times to
 * mean ten is how a mis-read becomes a stock error nobody can reconstruct — so every flow types the
 * number, and every flow types it through this.
 */
export function QuantityField({
  label,
  onChange,
  placeholder,
  unit,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  unit?: string;
  value: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[11px] text-muted-foreground" mono>
        {unit === undefined ? label : `${label} (${unit.toUpperCase()})`}
      </Text>
      <TextInput
        accessibilityLabel={label}
        className="text-xl"
        inputMode="decimal"
        keyboardType="decimal-pad"
        onChangeText={onChange}
        placeholder={placeholder}
        value={value}
      />
    </View>
  );
}

/** `null` for anything that is not a positive, finite number — the shape every post input wants. */
export function parseQuantity(value: string): number | null {
  const parsed = Number(value.trim());

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
