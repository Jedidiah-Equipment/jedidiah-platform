import type { MeasureType } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { MeasureTypeFormValues } from './types.js';

export function MeasureTypeEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingRateCard.measureTypes.get.queryOptions({ id }));
  return (
    <PageLayout description="Measure Type details" size="md" title={query.data?.name ?? 'Measure Type'}>
      <QueryContent errorMessage="Unable to load Measure Type." query={query}>
        {(measureType) => <MeasureTypeForm key={id} measureType={measureType} />}
      </QueryContent>
    </PageLayout>
  );
}

function MeasureTypeForm({ measureType }: { measureType: MeasureType }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_rate:update').can;
  const { invalidateRateCard } = useQueryInvalidation();
  const patch = useMutation(
    trpc.contractingRateCard.measureTypes.patch.mutationOptions({ onSuccess: invalidateRateCard }),
  );
  const remove = useMutation(
    trpc.contractingRateCard.measureTypes.remove.mutationOptions({
      onError: (error) => showError(error, 'Unable to delete Measure Type.'),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: measureType.name },
    failureMessage: 'Unable to update Measure Type.',
    validator: MeasureTypeFormValues,
    toInput: (values) => ({ id: measureType.id, ...values }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <>
      <AutosaveFormCard autosave={autosave} disabled={!canEdit} formProps={formProps}>
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      </AutosaveFormCard>
      {canEdit ? (
        <EntityActionsFooter>
          <RemoveEntityButton
            description="A Measure Type can be deleted only while no Rate uses it."
            isPending={remove.isPending}
            onConfirm={() =>
              remove.mutate(
                { id: measureType.id },
                {
                  onSuccess: async () => {
                    autosave.resetToSavedValues(form.state.values);
                    await invalidateRateCard();
                    await navigate({ to: '/contracting/measure-types' });
                  },
                },
              )
            }
            title="Delete measure type"
            triggerLabel="Delete measure type"
          />
        </EntityActionsFooter>
      ) : null}
    </>
  );
}
