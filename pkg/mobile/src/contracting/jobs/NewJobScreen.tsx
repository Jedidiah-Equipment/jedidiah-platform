import { CustomerName, FarmName, JobCreateValues, toJobCreateInput, WorkTypeName } from '@pkg/schema/contracting';
import type { QueryKey } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FormPage } from '@/components/FormPage';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SearchSelect, type SearchSelectCreate } from '@/components/form/fields/SearchSelectField';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';
import { useBusyAction } from '@/lib/use-busy-action';

const CREATE_FAILED = 'The Job could not be created. Try again.';
const EMPTY_DRAFT: JobCreateValues = { customerId: '', farmId: '', workTypeId: '', description: '', foremanUserId: '' };
const backToJobs = () => router.dismissTo('/contracting/jobs' as Href);

/** `/contracting/jobs/new`: the web's New job form for management, online only. */
export default function NewJobScreen() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canCreate = useCan('contracting_job:create').can;
  const canAssign = useCan('contracting_job:assign').can;
  const canUpdateDirectory = useCan('contracting_directory:update').can;
  const [draft, setDraft] = useState<JobCreateValues>(EMPTY_DRAFT);
  const set = (patch: Partial<JobCreateValues>) => setDraft((current) => ({ ...current, ...patch }));
  const voice = useVoiceSession({ business: 'contracting', purpose: 'job description' });
  const { busy: saving, error, run } = useBusyAction();
  // A directory create in flight holds the whole form, so neither the Job nor a changed Customer races it.
  const [creatingDirectory, setCreatingDirectory] = useState(false);
  const busy = saving || creatingDirectory;

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

  // The new option has to be in its list before the field points at it, or the field reads blank.
  const directoryCreate = (
    nameSchema: { safeParse: (value: string) => { data?: string | undefined } },
    create: (name: string) => Promise<{ id: string }>,
    list: QueryKey,
  ): SearchSelectCreate | undefined =>
    canUpdateDirectory
      ? {
          // A refusal rejects, and the field shows its served sentence.
          onCreate: async (name) => {
            setCreatingDirectory(true);
            try {
              const created = await create(name);
              await queryClient.invalidateQueries({ queryKey: list });
              return created.id;
            } finally {
              setCreatingDirectory(false);
            }
          },
          toName: (text) => nameSchema.safeParse(text).data,
        }
      : undefined;

  const parsed = JobCreateValues.safeParse(draft);
  const message = parsed.error?.issues[0]?.message;
  const canSave = parsed.success && canCreate && !busy && !voice.busy;
  const save = () => {
    if (!canSave || !parsed.success) return;
    return run(async () => {
      const job = await createJob.mutateAsync(toJobCreateInput(parsed.data));
      voice.reportSaved();
      // The Job screen reads its own Job, so the lists can refresh behind it.
      void queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() });
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
            primary={canSave}
            title={saving ? 'Creating…' : 'Create job'}
            disabled={!canSave}
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
        create={directoryCreate(
          CustomerName,
          (name) => createCustomer.mutateAsync({ name }),
          trpc.contractingDirectory.customers.list.queryKey(),
        )}
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
        create={directoryCreate(
          FarmName,
          (name) => createFarm.mutateAsync({ customerId: draft.customerId, name }),
          trpc.contractingDirectory.farms.list.queryKey({ customerId: draft.customerId }),
        )}
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
        create={directoryCreate(
          WorkTypeName,
          (name) => createWorkType.mutateAsync({ name }),
          trpc.contractingDirectory.workTypes.options.queryKey(),
        )}
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
          value={draft.description}
          onChangeText={(description) => set({ description })}
          voice={voice}
        />
      </FieldShell>
    </FormPage>
  );
}
