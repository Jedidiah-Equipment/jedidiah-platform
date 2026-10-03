import { judgeJobAction } from '@pkg/domain/contracting';
import { IconPlus } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppForm } from '@/components/form';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { implementOption } from '@/contracting/components/implement-option';
import { getVisibleMachines } from '@/contracting/lib/machine-catalog';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { useDrivers, useImplements, useJob } from './use-jobs';

export default function AddMachineScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    machineId?: string;
    implementId?: string;
  }>();
  const fleet = useFleet();
  const implementQuery = useImplements();
  const drivers = useDrivers();
  const access = useSessionAccessSummary();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const job = useJob(params.jobId).data;
  const canAdd = job ? judgeJobAction('assign', job, access).allowed : false;
  const backToJob = () => router.dismissTo(`/contracting/jobs/${params.jobId}` as Href);
  const add = useMutation(
    trpc.contractingJobs.assignments.add.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.field.pathKey() });
        backToJob();
      },
    }),
  );
  const form = useAppForm({
    defaultValues: { machineId: params.machineId ?? '', implementId: params.implementId ?? '', driverUserId: '' },
  });
  const values = useStore(form.store, (state) => state.values);
  const machineId = values.machineId;
  const selected = fleet.data?.find((machine) => machine.id === machineId);
  const machines = getVisibleMachines(fleet.data ?? [], { search: '', category: 'all', sort: 'code' });

  // A re-added stint's Implement may since have been retired and left the list; the field then reads No implement.
  const implementId = implementQuery.data?.some((implement) => implement.id === values.implementId)
    ? values.implementId
    : null;

  const save = () => {
    if (!selected) return;
    add.mutate({
      jobId: params.jobId,
      machineId: selected.id,
      implementId,
      ...(values.driverUserId ? { driverUserId: values.driverUserId } : {}),
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Add machine"
        subtitle="CONTRACTING"
        parentLabel="Job"
        onBack={backToJob}
        helpTopic="contractingMobileAddMachine"
      />
      <ScrollView
        contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <form.AppField name="machineId">
          {(field) => (
            <field.SearchSelectField
              label="Machine"
              placeholder="Choose a Machine"
              searchPlaceholder="Search by code, make, model, or category…"
              emptyMessage="No Machines match."
              options={machines.map((machine) => {
                const onJob = machine.onSiteJobNumber;
                return {
                  value: machine.id,
                  label: machine.code,
                  description: [
                    [machine.make, machine.model].filter(Boolean).join(' '),
                    machine.categoryName,
                    onJob ? `On Job ${onJob}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  icon: <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={16} />,
                };
              })}
            />
          )}
        </form.AppField>
        <form.AppField name="implementId">
          {(field) => (
            <field.SearchSelectField
              disabled={!selected}
              label="Implement (optional)"
              placeholder="No implement"
              searchPlaceholder="Search by code or category…"
              emptyMessage="No Implements match."
              options={[
                { label: 'No implement', value: '' },
                ...(implementQuery.data ?? []).map((implement) => implementOption(implement)),
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="driverUserId">
          {(field) => (
            <field.SearchSelectField
              disabled={!selected}
              label="Driver"
              placeholder="Machine's usual driver"
              searchPlaceholder="Search drivers…"
              emptyMessage="No drivers match."
              options={[
                {
                  label: selected?.currentDriverName
                    ? `Machine's usual driver · ${selected.currentDriverName}`
                    : "Machine's usual driver",
                  value: '',
                },
                ...(drivers.data ?? []).map((driver) => ({ label: driver.name, value: driver.id })),
              ]}
            />
          )}
        </form.AppField>
        {add.error ? <Text className="text-sm text-danger">{add.error.message}</Text> : null}
        <Button
          primary
          icon={IconPlus}
          title={add.isPending ? 'Adding…' : 'Add machine'}
          disabled={!canAdd || !selected || add.isPending}
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
