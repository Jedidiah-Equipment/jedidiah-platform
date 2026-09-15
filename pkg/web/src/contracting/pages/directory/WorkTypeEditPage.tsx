import type { WorkType } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { WorkTypeFormValues } from './types.js';

export function WorkTypeEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingDirectory.workTypes.get.queryOptions({ id }));
  return (
    <PageLayout title={query.data?.name ?? 'Work type'} description="Work type details" size="md">
      <QueryContent query={query} errorMessage="Unable to load work type.">
        {(workType) => <WorkTypeForm key={id} workType={workType} />}
      </QueryContent>
    </PageLayout>
  );
}
function WorkTypeForm({ workType }: { workType: WorkType }) {
  const trpc = useTRPC();
  const { invalidateDirectory } = useQueryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const patch = useMutation(
    trpc.contractingDirectory.workTypes.patch.mutationOptions({ onSuccess: invalidateDirectory }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: workType.name, active: workType.active },
    failureMessage: 'Unable to update work type.',
    validator: WorkTypeFormValues,
    toInput: (values) => ({ id: workType.id, ...values }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={!canEdit}>
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      <form.AppField name="active">
        {(field) => <field.SwitchField label="Active" onValueCommit={autosave.commit} />}
      </form.AppField>
      <EditFormFullWidth>
        <p className="text-muted-foreground text-sm">
          Inactive Work Types remain on old Jobs and are excluded from pickers.
        </p>
      </EditFormFullWidth>
    </AutosaveFormCard>
  );
}
