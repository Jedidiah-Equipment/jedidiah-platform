import type { Rate } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { RateEditValues, rateBasisOptions, toRatePatchInput } from './types.js';

export function RateEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingRateCard.rates.get.queryOptions({ id }));
  return (
    <PageLayout description="Rate details" size="md" title={query.data?.name ?? 'Rate'}>
      <QueryContent errorMessage="Unable to load Rate." query={query}>
        {(rate) => <RateForm key={id} rate={rate} />}
      </QueryContent>
    </PageLayout>
  );
}

function RateForm({ rate }: { rate: Rate }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_rate:update').can;
  const { invalidateRateCard } = useQueryInvalidation();
  const measureTypes = useQuery(trpc.contractingRateCard.measureTypes.list.queryOptions());
  const patch = useMutation(trpc.contractingRateCard.rates.patch.mutationOptions({ onSuccess: invalidateRateCard }));
  const remove = useMutation(
    trpc.contractingRateCard.rates.remove.mutationOptions({
      onError: (error) => showError(error, 'Unable to delete Rate.'),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      name: rate.name,
      basis: rate.basis,
      measureTypeId: rate.measureTypeId ?? '',
      amount: rate.amount,
      active: rate.active,
    },
    failureMessage: 'Unable to update Rate.',
    validator: RateEditValues,
    toInput: (values) => toRatePatchInput(rate.id, values),
    save: (input) => patch.mutateAsync(input),
  });
  const measureTypeOptions = (measureTypes.data ?? []).map((row) => ({ value: row.id, label: row.name }));
  return (
    <>
      <AutosaveFormCard autosave={autosave} disabled={!canEdit} formProps={formProps}>
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <form.AppField name="basis">
          {(field) => (
            <field.SelectField
              label="Basis"
              options={rateBasisOptions}
              onValueCommit={(value) => {
                if (value === 'time') form.setFieldValue('measureTypeId', '');
                autosave.commit();
              }}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.basis}>
          {(basis) =>
            basis === 'measure' ? (
              <form.AppField name="measureTypeId">
                {(field) => (
                  <field.SelectField
                    label="Measure type"
                    options={measureTypeOptions}
                    placeholder={
                      measureTypeOptions.length === 0 ? 'No measure types yet — add one under Measure Types' : 'Select…'
                    }
                    onValueCommit={autosave.commit}
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>
        <form.AppField name="amount">
          {(field) => <field.CurrencyField currencyCode="ZAR" label="Amount" />}
        </form.AppField>
        <form.AppField name="active">
          {(field) => <field.SwitchField label="Active" onValueCommit={autosave.commit} />}
        </form.AppField>
        <EditFormFullWidth>
          <p className="text-muted-foreground text-sm">
            Inactive rates leave the Pricing picker; Assignments already priced with one keep it.
          </p>
        </EditFormFullWidth>
      </AutosaveFormCard>
      {canEdit ? (
        <EntityActionsFooter>
          <RemoveEntityButton
            description="Only a Rate no priced job uses can be deleted. Deactivate a used Rate instead."
            isPending={remove.isPending}
            onConfirm={() =>
              remove.mutate(
                { id: rate.id },
                {
                  onSuccess: async () => {
                    autosave.resetToSavedValues(form.state.values);
                    await invalidateRateCard();
                    await navigate({ to: '/contracting/rates' });
                  },
                },
              )
            }
            title="Delete rate"
            triggerLabel="Delete rate"
          />
        </EntityActionsFooter>
      ) : null}
    </>
  );
}
