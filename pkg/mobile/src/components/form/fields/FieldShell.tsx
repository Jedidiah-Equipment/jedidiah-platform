import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { FormFieldError } from '../utils/field-errors';

/**
 * Shared layout for a mobile form field: an optional label above the control and
 * the first validation message below it. Keeps every field's spacing, label, and
 * error treatment identical without each one re-declaring it.
 */
export function FieldShell({
  children,
  errors,
  label,
}: {
  children: ReactNode;
  errors: FormFieldError[];
  label?: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-sm text-foreground" weight="semibold">
          {label}
        </Text>
      ) : null}
      {children}
      {errors.length > 0 ? <Text className="text-xs text-danger">{errors[0]?.message}</Text> : null}
    </View>
  );
}
