import type { StockOnHandBucket } from '@pkg/schema/equipment';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

import { QuantityField } from './QuantityField';

/**
 * Which length off the rack, for linear material (spec §10: labels are per Part; length is asked at
 * scan time).
 *
 * The lengths already on the shelf are offered as taps, because that is what a person is holding —
 * and a typed field stays below them, because the piece in their hands may be an offcut nobody has
 * recorded a bucket for yet.
 */
export function LengthBucketField({
  buckets,
  onChange,
  standardPurchaseLengthMm,
  value,
}: {
  buckets: readonly StockOnHandBucket[];
  onChange: (value: string) => void;
  standardPurchaseLengthMm: number | null;
  value: string;
}) {
  const offered = [
    ...new Set(
      [
        ...buckets.flatMap((bucket) => (bucket.lengthMm === null ? [] : [bucket.lengthMm])),
        ...(standardPurchaseLengthMm === null ? [] : [standardPurchaseLengthMm]),
      ].sort((left, right) => left - right),
    ),
  ];

  return (
    <View className="gap-2">
      {offered.length === 0 ? null : (
        <View className="gap-1.5">
          <Text className="text-[11px] text-muted-foreground" mono>
            LENGTHS ON THE RACK
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {offered.map((lengthMm) => {
              const isSelected = value.trim() === String(lengthMm);

              return (
                <Pressable
                  accessibilityLabel={`${lengthMm} millimetres`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className={`rounded-xl border px-4 py-3 ${
                    isSelected ? 'border-primary bg-primary' : 'border-border bg-surface'
                  }`}
                  key={lengthMm}
                  onPress={() => onChange(String(lengthMm))}
                >
                  <Text
                    className={`text-base ${isSelected ? 'text-primary-foreground' : 'text-surface-foreground'}`}
                    mono
                    weight="semibold"
                  >
                    {lengthMm} mm
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <QuantityField label="Length" onChange={onChange} placeholder="0" unit="mm" value={value} />
    </View>
  );
}
