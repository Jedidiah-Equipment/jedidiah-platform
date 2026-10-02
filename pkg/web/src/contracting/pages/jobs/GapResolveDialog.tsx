import { formatHours } from '@pkg/domain';
import { splitGap } from '@pkg/domain/contracting';
import { type Assignment, GapResolveInput } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const GapValues = GapResolveInput.omit({ id: true });
export function GapResolveDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const resolve = useMutation(
    trpc.contractingJobs.assignments.resolveGap.mutationOptions({
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
      title={<MachineDialogTitle machine={stint}>Resolve {formatHours(gapHours)} gap</MachineDialogTitle>}
      defaultValues={{ travelHours: gapHours, unaccountedHours: 0, reason: '' }}
      validator={GapValues}
      onCreate={(values) => resolve.mutateAsync({ id: stint?.id ?? '', ...values })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField
            name="travelHours"
            listeners={{
              onChange: ({ value }) =>
                form.setFieldValue('unaccountedHours', splitGap(gapHours, value).unaccountedHours, {
                  dontRunListeners: true,
                }),
              onBlur: ({ value }) =>
                form.setFieldValue('travelHours', splitGap(gapHours, value).travelHours, { dontRunListeners: true }),
            }}
          >
            {(field) => <field.NumberField label="Travel Hours" decimals={1} min={0} emptyValue={0} />}
          </form.AppField>
          <form.AppField
            name="unaccountedHours"
            listeners={{
              onChange: ({ value }) =>
                form.setFieldValue('travelHours', splitGap(gapHours, gapHours - value).travelHours, {
                  dontRunListeners: true,
                }),
              onBlur: ({ value }) =>
                form.setFieldValue('unaccountedHours', splitGap(gapHours, gapHours - value).unaccountedHours, {
                  dontRunListeners: true,
                }),
            }}
          >
            {(field) => <field.NumberField label="Unaccounted Interval" decimals={1} min={0} emptyValue={0} />}
          </form.AppField>
          <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
