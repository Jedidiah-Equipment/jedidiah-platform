import { useStore } from '@tanstack/react-form';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAppForm } from '@/components/form';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { Text } from '@/components/ui/text';
import { implementOption } from '@/contracting/components/implement-option';
import { useDrivers, useImplements } from '@/contracting/jobs/use-jobs';

export type PlannedStint = {
  implementId: string | null;
  driverUserId: string | null;
  implementCode: string | null;
  driverName: string | null;
};

/** The arrival form's "change the planned Implement and Driver" state; `value` is undefined while the plan is kept. */
export function useStintOverrides(planned: PlannedStint | null) {
  const [changing, setChanging] = useState(false);
  const form = useAppForm({
    defaultValues: { implementId: planned?.implementId ?? '', driverUserId: planned?.driverUserId ?? '' },
  });
  const values = useStore(form.store, (state) => state.values);
  const value = changing
    ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
    : undefined;
  return { form, changing, setChanging, value };
}

export function StintOverrideCard({
  planned,
  overrides,
}: {
  planned: PlannedStint;
  overrides: ReturnType<typeof useStintOverrides>;
}) {
  const implementsQuery = useImplements();
  const driversQuery = useDrivers();
  return (
    <FieldShell label="Implement & driver">
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
          {planned.implementCode ?? 'No implement'} · {planned.driverName ?? 'No driver'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            overrides.changing ? 'Keep the planned implement and driver' : 'Change implement or driver'
          }
          hitSlop={8}
          onPress={() => overrides.setChanging(!overrides.changing)}
        >
          <Text className="text-sm text-muted-foreground" weight="semibold">
            {overrides.changing ? 'Keep planned' : 'Change'}
          </Text>
        </Pressable>
      </View>
      {overrides.changing ? (
        <View className="gap-3">
          <overrides.form.AppField name="implementId">
            {(field) => (
              <field.SearchSelectField
                label="Implement"
                placeholder="No implement"
                searchPlaceholder="Search by code or category…"
                emptyMessage="No Implements match."
                options={[
                  { label: 'No implement', value: '' },
                  ...(implementsQuery.data ?? []).map((row) => ({
                    ...implementOption(row),
                    disabled: row.onSiteJobNumber !== null,
                  })),
                ]}
              />
            )}
          </overrides.form.AppField>
          <overrides.form.AppField name="driverUserId">
            {(field) => (
              <field.SearchSelectField
                label="Driver"
                placeholder="No driver"
                searchPlaceholder="Search drivers…"
                emptyMessage="No drivers match."
                options={[
                  { label: 'No driver', value: '' },
                  ...(driversQuery.data ?? []).map((row) => ({ label: row.name, value: row.id })),
                ]}
              />
            )}
          </overrides.form.AppField>
        </View>
      ) : null}
    </FieldShell>
  );
}
