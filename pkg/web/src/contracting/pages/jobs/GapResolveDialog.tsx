import { formatHours } from '@pkg/domain';
import { type Assignment, GapResolveInput } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Input } from '@/components/ui/input.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { complementGap } from './types.js';

const GapValues = GapResolveInput.omit({ id: true });
export function GapResolveDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const resolve = useMutation(
    trpc.contractingJobs.stints.resolveGap.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to resolve Gap Flag.'),
    }),
  );
  const gapHours = stint?.gapHours ?? 0;
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${formatHours(gapHours)} gap on ${stint?.machineCode ?? 'Machine'}`}
      defaultValues={{ travelHours: gapHours, unaccountedHours: 0, reason: '' }}
      validator={GapValues}
      onCreate={(values) => resolve.mutateAsync({ id: stint?.id ?? '', ...values })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <>
                <label className="space-y-1" htmlFor="gap-travel-hours">
                  Travel Hours
                  <Input
                    id="gap-travel-hours"
                    type="number"
                    step="0.1"
                    min="0"
                    value={values.travelHours}
                    onChange={(event) => {
                      const split = complementGap(gapHours, Number(event.target.value));
                      form.setFieldValue('travelHours', split.travelHours);
                      form.setFieldValue('unaccountedHours', split.unaccountedHours);
                    }}
                  />
                </label>
                <label className="space-y-1" htmlFor="gap-unaccounted-hours">
                  Unaccounted Interval
                  <Input
                    id="gap-unaccounted-hours"
                    type="number"
                    step="0.1"
                    min="0"
                    value={values.unaccountedHours}
                    onChange={(event) => {
                      const split = complementGap(gapHours, gapHours - Number(event.target.value));
                      form.setFieldValue('travelHours', split.travelHours);
                      form.setFieldValue('unaccountedHours', split.unaccountedHours);
                    }}
                  />
                </label>
              </>
            )}
          </form.Subscribe>
          <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
