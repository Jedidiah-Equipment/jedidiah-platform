import { useStore } from '@tanstack/react-form';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppForm } from '@/components/form';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import {
  getMachineCategories,
  getVisibleMachines,
  type MachineSort,
  normalizeMachineCategory,
} from '@/contracting/lib/machine-catalog';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { newLocalId } from '@/contracting/readings/reading-queue';
import { useFleet } from '@/contracting/readings/use-fleet';
import { MachineCatalogControls } from '../components/MachineCatalogControls';
import { deriveStint } from './derive-stint';
import { useDrivers, useImplements, useJobs } from './use-jobs';

const BUSY_VIEWS = new Set(['starting', 'running', 'stopping']);

export default function AddMachineScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    machineId?: string;
    implementId?: string;
    afterAssignmentId?: string;
  }>();
  const fleet = useFleet();
  const jobs = useJobs();
  const implementQuery = useImplements();
  const drivers = useDrivers();
  const { items } = useReadingQueue();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<MachineSort>('code');
  const [machineId, setMachineId] = useState(params.machineId ?? '');
  const [startLocalId] = useState(newLocalId);
  const form = useAppForm({
    defaultValues: { implementId: params.implementId ?? '', driverUserId: '' },
  });
  const values = useStore(form.store, (state) => state.values);
  const selected = fleet.data?.find((machine) => machine.id === machineId);
  const categories = getMachineCategories(fleet.data ?? []);
  const normalizedCategory = normalizeMachineCategory(
    category,
    categories.map((option) => option.value),
  );
  const machines = getVisibleMachines(fleet.data ?? [], { search, category: normalizedCategory, sort });
  const readdSourceKnown =
    params.afterAssignmentId !== undefined &&
    params.machineId !== undefined &&
    ((jobs.data ?? []).some(
      (job) =>
        job.id === params.jobId &&
        job.stints.some((stint) => stint.id === params.afterAssignmentId && stint.machineId === params.machineId),
    ) ||
      items.some((capture) => {
        const start = capture.startAssignment;
        if (!start) return false;
        return (
          capture.machineId === params.machineId &&
          start.localId === params.afterAssignmentId &&
          start.jobId === params.jobId
        );
      }));
  const readdReady =
    readdSourceKnown &&
    items.some(
      (capture) =>
        capture.role === 'departure' &&
        capture.assignmentId === params.afterAssignmentId &&
        capture.machineId === params.machineId,
    );
  const { machineJobs, implementJobs } = useMemo(() => {
    const machineJobs = new Map<string, string>();
    const implementJobs = new Map<string, string>();
    for (const job of jobs.data ?? []) {
      for (const stint of job.stints.map((row) =>
        deriveStint(row, items, { implements: implementQuery.data ?? [], drivers: drivers.data ?? [] }),
      )) {
        if (!BUSY_VIEWS.has(stint.view)) continue;
        if (readdReady && stint.id === params.afterAssignmentId) continue;
        machineJobs.set(stint.machineId, job.jobNumber);
        if (stint.implementId) implementJobs.set(stint.implementId, job.jobNumber);
      }
      for (const capture of items) {
        if (capture.startAssignment?.jobId !== job.id) continue;
        if (capture.attention) continue;
        if (readdReady && capture.startAssignment.localId === params.afterAssignmentId) continue;
        machineJobs.set(capture.machineId, job.jobNumber);
        if (capture.startAssignment.implementId) implementJobs.set(capture.startAssignment.implementId, job.jobNumber);
      }
    }
    for (const machine of fleet.data ?? []) {
      if (machine.onSiteJobNumber && !machineJobs.has(machine.id) && !(readdReady && machine.id === params.machineId))
        machineJobs.set(machine.id, machine.onSiteJobNumber);
    }
    for (const implement of implementQuery.data ?? []) {
      if (
        implement.onSiteJobNumber &&
        !implementJobs.has(implement.id) &&
        !(readdReady && implement.id === params.implementId)
      )
        implementJobs.set(implement.id, implement.onSiteJobNumber);
    }
    return { machineJobs, implementJobs };
  }, [
    drivers.data,
    fleet.data,
    implementQuery.data,
    items,
    jobs.data,
    params.afterAssignmentId,
    params.implementId,
    params.machineId,
    readdReady,
  ]);

  const selectedImplementBusy = values.implementId !== '' && implementJobs.has(values.implementId);

  const continueToCapture = () => {
    if (!selected || machineJobs.has(selected.id) || selectedImplementBusy) return;
    router.push({
      pathname: '/contracting/machines/[id]/capture',
      params: {
        id: selected.id,
        role: 'arrival',
        jobId: params.jobId,
        startAssignmentJobId: params.jobId,
        startLocalId,
        captureSessionId: startLocalId,
        implementId: values.implementId,
        driverUserId: values.driverUserId,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Add machine"
        subtitle="CONTRACTING"
        parentLabel="Job"
        onBack={() => router.replace(`/contracting/jobs/${params.jobId}` as Href)}
        helpTopic="contractingMobileAddMachine"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        <Text className="text-lg text-foreground" weight="bold">
          1. Choose a Machine
        </Text>
        <MachineCatalogControls
          categories={categories}
          category={normalizedCategory}
          search={search}
          sort={sort}
          onCategoryChange={setCategory}
          onSearchChange={setSearch}
          onSortChange={setSort}
        />
        <View className="gap-2">
          {machines.map((machine) => {
            const onJob = machineJobs.get(machine.id);
            const active = machine.id === machineId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !!onJob, selected: active }}
                className={`gap-1 rounded-xl border bg-surface p-4 ${active ? 'border-primary' : 'border-border'} ${onJob ? 'opacity-50' : ''}`}
                disabled={!!onJob}
                key={machine.id}
                onPress={() => setMachineId(machine.id)}
              >
                <View className="flex-row items-center gap-3">
                  <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={20} />
                  <Text className="text-foreground" weight="bold">
                    {machine.code}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">
                  {machine.make} {machine.model} · {machine.categoryName}
                  {onJob ? ` · On Job · ${onJob}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-lg text-foreground" weight="bold">
          2. Confirm the attachment
        </Text>
        <form.AppField name="implementId">
          {(field) => (
            <field.SelectField
              disabled={!selected}
              label="Implement (optional)"
              options={[
                { label: 'No implement', value: '' },
                ...(implementQuery.data ?? []).map((implement) => {
                  const onJob = implementJobs.get(implement.id);
                  return {
                    label: onJob ? `${implement.code} · On Job · ${onJob}` : implement.code,
                    value: implement.id,
                    disabled: !!onJob,
                  };
                }),
              ]}
              placeholder="No implement"
            />
          )}
        </form.AppField>

        <Text className="text-lg text-foreground" weight="bold">
          3. Confirm the Driver
        </Text>
        <form.AppField name="driverUserId">
          {(field) => (
            <field.SelectField
              disabled={!selected}
              label="Driver"
              options={[
                {
                  label: selected?.currentDriverName
                    ? `Machine's usual driver · ${selected.currentDriverName}`
                    : "Machine's usual driver",
                  value: '',
                },
                ...(drivers.data ?? []).map((driver) => ({ label: driver.name, value: driver.id })),
              ]}
              placeholder="Machine's usual driver"
            />
          )}
        </form.AppField>
        <Button
          primary
          title="Continue — capture arrival"
          disabled={!selected || machineJobs.has(selected.id) || selectedImplementBusy}
          onPress={continueToCapture}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
