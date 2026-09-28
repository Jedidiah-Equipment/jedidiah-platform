import { deriveJobActions, onSiteElsewhere } from '@pkg/domain/contracting';
import { IconPlus } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppForm } from '@/components/form';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { getVisibleMachines } from '@/contracting/lib/machine-catalog';
import { captureWorld } from '@/contracting/readings/capture-world';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import { useTRPC } from '@/lib/trpc';
import { jobSummary } from './derive-stint';
import { useDrivers, useImplements, useJobs } from './use-jobs';

export default function AddMachineScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    machineId?: string;
    implementId?: string;
  }>();
  const fleet = useFleet();
  const jobs = useJobs();
  const implementQuery = useImplements();
  const drivers = useDrivers();
  const { items } = useReadingQueue();
  const access = useSessionAccessSummary();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const offline = useIsOffline();
  const job = jobs.data?.find((candidate) => candidate.id === params.jobId);
  const canAdd = job
    ? deriveJobActions({ ...job, status: jobSummary(job, items).status }, access).assign.allowed
    : false;
  const backToJob = () => router.replace(`/contracting/jobs/${params.jobId}` as Href);
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
  const world = useMemo(
    () =>
      captureWorld({
        machineId: machineId,
        stintId: null,
        queued: items,
        history: undefined,
        jobs: jobs.data ?? [],
        fleet: fleet.data ?? [],
        implementRows: implementQuery.data ?? [],
        management: false,
        hasPhoto: false,
      }),
    [fleet.data, implementQuery.data, items, jobs.data, machineId],
  );
  const onJob = (busy: ReturnType<typeof onSiteElsewhere>) => (busy ? (busy.jobNumber ?? 'another Job') : null);
  const machineOnJob = (id: string) => onJob(onSiteElsewhere(world, { machineId: id }));
  const implementOnJob = (id: string) => onJob(onSiteElsewhere(world, { implementId: id }));

  const save = () => {
    if (!selected) return;
    add.mutate({
      jobId: params.jobId,
      machineId: selected.id,
      implementId: values.implementId || null,
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <form.AppField name="machineId">
          {(field) => (
            <field.SearchSelectField
              label="Machine"
              placeholder="Choose a Machine"
              searchPlaceholder="Search by code, make, model, or category…"
              emptyMessage="No Machines match."
              options={machines.map((machine) => {
                const onJob = machineOnJob(machine.id);
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
                ...(implementQuery.data ?? []).map((implement) => {
                  const onJob = implementOnJob(implement.id);
                  return {
                    value: implement.id,
                    label: implement.code,
                    description: onJob ? `${implement.categoryName} · On Job ${onJob}` : implement.categoryName,
                    icon: <CategoryIcon icon={implement.categoryIcon} colour={implement.categoryColour} size={16} />,
                  };
                }),
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
        {offline ? <Text className="text-sm text-muted-foreground">Connect to add this Machine.</Text> : null}
        {add.error ? <Text className="text-sm text-danger">{add.error.message}</Text> : null}
        <Button
          primary
          icon={IconPlus}
          title={add.isPending ? 'Adding…' : 'Add machine'}
          disabled={offline || !canAdd || !selected || add.isPending}
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
