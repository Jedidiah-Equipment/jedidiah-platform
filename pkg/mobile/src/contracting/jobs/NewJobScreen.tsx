import { CustomerName, FarmName, WorkTypeName } from '@pkg/schema/contracting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FormPage } from '@/components/FormPage';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SearchSelect, type SearchSelectCreate } from '@/components/form/fields/SearchSelectField';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';
import { useBusyAction } from '@/lib/use-busy-action';
import { deriveNewJob, EMPTY_JOB_DRAFT, type JobDraft } from './new-job-form';

const CREATE_FAILED = 'The Job could not be created. Try again.';
const backToJobs = () => router.dismissTo('/contracting/jobs' as Href);

/** `/contracting/jobs/new`: the web's New job form for management, online only. */
export default function NewJobScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canCreate = useCan('contracting_job:create').can;
  const canAssign = useCan('contracting_job:assign').can;
  const canUpdateDirectory = useCan('contracting_directory:update').can;
  const [draft, setDraft] = useState<JobDraft>(EMPTY_JOB_DRAFT);
  const set = (patch: Partial<JobDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const voice = useVoiceSession('job description', {
    value: draft.description,
    onChangeText: (description) => set({ description }),
  });
  const { busy, error, setError, run } = useBusyAction();

  const customers = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const farms = useQuery(
    trpc.contractingDirectory.farms.list.queryOptions(
      { customerId: draft.customerId },
      { enabled: !!draft.customerId },
    ),
  );
  const workTypes = useQuery(trpc.contractingDirectory.workTypes.options.queryOptions());
  const foremen = useQuery(trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: canAssign }));
  const createCustomer = useMutation(trpc.contractingDirectory.customers.create.mutationOptions());
  const createFarm = useMutation(trpc.contractingDirectory.farms.create.mutationOptions());
  const createWorkType = useMutation(trpc.contractingDirectory.workTypes.create.mutationOptions());
  const createJob = useMutation(trpc.contractingJobs.jobs.create.mutationOptions());

  // The new option has to be in the list before the field points at it, or the field reads blank.
  const directoryCreate = (
    nameSchema: { safeParse: (value: string) => { data?: string | undefined } },
    create: (name: string) => Promise<{ id: string }>,
  ): SearchSelectCreate | undefined =>
    canUpdateDirectory && !busy
      ? {
          onCreate: async (name) => {
            setError(null);
            try {
              const created = await create(name);
              await queryClient.invalidateQueries({ queryKey: trpc.contractingDirectory.pathKey() });
              return created.id;
            } catch (createError) {
              setError(createError instanceof Error ? createError.message : `Unable to create ${name}.`);
              return undefined;
            }
          },
          toName: (text) => nameSchema.safeParse(text).data,
        }
      : undefined;

  const { input, message } = deriveNewJob(draft, { canCreate, busy: busy || voice.busy });
  const save = () => {
    if (!input) return;
    return run(async () => {
      const job = await createJob.mutateAsync(input);
      voice.reportSaved();
      await queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() });
      router.replace(`/contracting/jobs/${job.id}` as Href);
    }, CREATE_FAILED);
  };
  const searchPlaceholder = (noun: string) => (canUpdateDirectory ? `Search or type a new ${noun}…` : 'Search…');

  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title="New job"
          subtitle="CONTRACTING"
          parentLabel="Jobs"
          onBack={() => {
            if (!busy) backToJobs();
          }}
          helpTopic="contractingMobileNewJob"
        />
      }
      error={error}
      footer={
        <>
          {!canCreate ? <Text className="text-danger">Your role cannot create Jobs.</Text> : null}
          {canCreate && !busy && message ? <Text className="text-sm text-muted-foreground">{message}</Text> : null}
          <Button
            primary={input !== null}
            title={busy ? 'Creating…' : 'Create job'}
            disabled={input === null}
            onPress={() => {
              void save();
            }}
          />
        </>
      }
    >
      <SearchSelect
        label="Customer"
        placeholder="Choose a Customer"
        searchPlaceholder={searchPlaceholder('Customer')}
        emptyMessage="No Customers match."
        disabled={busy}
        value={draft.customerId}
        onChange={(customerId) => set({ customerId, farmId: '' })}
        create={directoryCreate(CustomerName, (name) => createCustomer.mutateAsync({ name }))}
        options={(customers.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
      />
      <SearchSelect
        label="Farm"
        placeholder={draft.customerId ? 'Choose a Farm' : 'Choose the Customer first'}
        searchPlaceholder={searchPlaceholder('Farm')}
        emptyMessage="No Farms match."
        disabled={busy || !draft.customerId}
        value={draft.farmId}
        onChange={(farmId) => set({ farmId })}
        create={directoryCreate(FarmName, (name) => createFarm.mutateAsync({ customerId: draft.customerId, name }))}
        options={(farms.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
      />
      <SearchSelect
        label="Work type"
        placeholder="Choose a Work Type"
        searchPlaceholder={searchPlaceholder('Work type')}
        emptyMessage="No Work types match."
        disabled={busy}
        value={draft.workTypeId}
        onChange={(workTypeId) => set({ workTypeId })}
        create={directoryCreate(WorkTypeName, (name) => createWorkType.mutateAsync({ name }))}
        options={(workTypes.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
      />
      {canAssign ? (
        <SearchSelect
          label="Foreman (optional)"
          placeholder="No Foreman yet"
          searchPlaceholder="Search Foremen…"
          emptyMessage="No Foremen match."
          disabled={busy}
          value={draft.foremanUserId}
          onChange={(foremanUserId) => set({ foremanUserId })}
          options={[
            { value: '', label: 'No Foreman yet' },
            ...(foremen.data ?? []).map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
      ) : null}
      <FieldShell label="Description (optional)">
        <VoiceTextArea
          accessibilityLabel="Description"
          placeholder="What the work is"
          editable={!busy}
          rows={4}
          voice={voice}
        />
      </FieldShell>
    </FormPage>
  );
}
