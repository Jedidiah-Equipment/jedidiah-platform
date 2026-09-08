import { type WorkType, WorkTypeName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { useDirectoryInvalidation } from './use-directory-invalidation.js';

const WorkTypeFormValues = z.object({ name: WorkTypeName, active: z.boolean() });
export function WorkTypeEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingDirectory.workTypes.get.queryOptions({ id }));
  return (
    <PageLayout title={query.data?.name ?? 'Work type'} description="Work type details" size="md">
      <ErrorMessage error={query.error} fallbackMessage="Unable to load work type." />
      {query.data ? (
        <WorkTypeForm key={id} workType={query.data} />
      ) : query.isPending ? (
        <p>Loading work type…</p>
      ) : null}
    </PageLayout>
  );
}
function WorkTypeForm({ workType }: { workType: WorkType }) {
  const trpc = useTRPC();
  const invalidate = useDirectoryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const patch = useMutation(trpc.contractingDirectory.workTypes.patch.mutationOptions({ onSuccess: invalidate }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: workType.name, active: workType.active },
    failureMessage: 'Unable to update work type.',
    validator: WorkTypeFormValues,
    toInput: (values) => ({ id: workType.id, ...values }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
      <Card>
        <CardContent>
          <fieldset disabled={!canEdit} className="grid gap-4">
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="active">
              {(field) => <field.SwitchField label="Active" onValueCommit={autosave.commit} />}
            </form.AppField>
            <p className="text-muted-foreground text-sm">
              Inactive Work Types remain on old Jobs and are excluded from pickers.
            </p>
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
