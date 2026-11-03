import { DEFAULT_DRIVER_LABEL, machineBusyWith } from '@pkg/domain/contracting';
import type { FieldMachine } from '@pkg/schema/contracting';
import { View } from 'react-native';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useDrivers } from '@/contracting/jobs/use-jobs';
import { useChangeMachineDriver } from '@/contracting/readings/use-fleet';
import { useBusyAction } from '@/lib/use-busy-action';

const CHANGE_FAILED = 'Could not change the Driver. Check your connection and try again.';

/** Changes a Machine's default Driver and, unless unticked, the Driver of the stint it is on site on now. */
export function ChangeDriverSheet({ machine, onClose }: { machine: FieldMachine; onClose: () => void }) {
  const change = useChangeMachineDriver();
  const drivers = useDrivers();
  const showToast = useAppToast();
  const { busy, error, setError, run } = useBusyAction();
  const onSiteJobNumber = machineBusyWith(machine)?.jobNumber ?? null;
  const form = useAppForm({
    defaultValues: { driverUserId: machine.currentDriverUserId ?? '', onSite: onSiteJobNumber !== null },
    onSubmit: ({ value }) =>
      run(async () => {
        const { onSite } = await change.mutateAsync({
          machineId: machine.id,
          driverUserId: value.driverUserId || null,
          onSite: value.onSite,
        });
        // The server names the Job it wrote, which may not be the one this screen loaded.
        if (onSite?.refusal) {
          setError(`The default Driver changed, but not on ${onSite.jobNumber}: ${onSite.refusal}`);
          return;
        }
        onClose();
        showToast('success', onSite ? `Driver changed, also on ${onSite.jobNumber}` : 'Driver changed');
      }, CHANGE_FAILED),
  });
  return (
    <ModalSheet
      title="Change default Driver"
      subtitle={`${machine.code}'s default Driver is filled in each time the Machine is added to a Job.`}
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Save" onPress={() => void form.handleSubmit()} />}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form.AppField name="driverUserId">
        {(field) => (
          <field.SearchSelectField
            label={DEFAULT_DRIVER_LABEL}
            placeholder="No driver"
            searchPlaceholder="Search drivers…"
            emptyMessage={drivers.isError ? 'The drivers could not be loaded.' : 'No drivers match.'}
            options={[
              { label: 'No driver', value: '' },
              ...(drivers.data ?? []).map((driver) => ({ label: driver.name, value: driver.id })),
            ]}
          />
        )}
      </form.AppField>
      {onSiteJobNumber ? (
        <form.Field name="onSite">
          {(field) => (
            <View className="flex-row items-center gap-3">
              <Text className="min-w-0 flex-1 text-foreground">
                Also change the Driver on {onSiteJobNumber} (on site now)
              </Text>
              <Switch
                accessibilityLabel={`Also change the Driver on ${onSiteJobNumber}`}
                disabled={busy}
                onValueChange={(on: boolean) => field.handleChange(on)}
                value={field.state.value}
              />
            </View>
          )}
        </form.Field>
      ) : null}
    </ModalSheet>
  );
}
