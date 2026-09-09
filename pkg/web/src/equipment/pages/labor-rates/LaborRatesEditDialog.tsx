import { departmentLabels } from '@pkg/domain/equipment';
import type { LaborRateCardView } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { LaborRateFormValues, laborRateFormToInput, laborRateFormValues } from './types.js';

export function LaborRatesEditDialog({ card, onClose }: { card: LaborRateCardView; onClose: () => void }) {
  const trpc = useTRPC();
  const invalidate = useQueryInvalidation();
  const save = useMutation(
    trpc.laborRates.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          invalidate.invalidateLaborRates(),
          invalidate.invalidateProducts(),
          invalidate.invalidateAudit(),
        ]);
        onClose();
      },
    }),
  );
  const form = useAppForm({
    defaultValues: laborRateFormValues(card),
    validators: { onSubmit: LaborRateFormValues },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync(laborRateFormToInput(value));
      } catch {
        // The mutation error stays visible in the dialog so the draft can be retried.
      }
    },
  });
  const close = () => {
    if (!save.isPending) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="sm:max-w-3xl" showCloseButton={!save.isPending}>
        <DialogHeader>
          <DialogTitle>Edit Labor rates</DialogTitle>
          <DialogDescription>
            Save the rates and overheads for all work Departments together. Leave unknown rates blank.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <fieldset disabled={save.isPending} className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="managementOverheadPercentage">
                {(field) => <field.NumberField label="Management overhead (%)" />}
              </form.AppField>
              <form.AppField name="hoursPerWorkingDay">
                {(field) => <field.NumberField label="Hours per working day" />}
              </form.AppField>
            </div>
            {card.rates.map((rate, index) => (
              <fieldset key={rate.department} className="grid gap-4 sm:grid-cols-3">
                <legend className="mb-3 font-medium">{departmentLabels[rate.department]}</legend>
                <form.AppField name={`rates[${index}].costToCompanyRate`}>
                  {(field) => <field.CurrencyField label="Cost to company (R/hour)" placeholder="Not set" />}
                </form.AppField>
                <form.AppField name={`rates[${index}].billingRate`}>
                  {(field) => <field.CurrencyField label="Billing (R/hour)" placeholder="Not set" />}
                </form.AppField>
                <form.AppField name={`rates[${index}].consumablesPercentage`}>
                  {(field) => <field.NumberField label="Consumables (%)" placeholder="Not set" />}
                </form.AppField>
              </fieldset>
            ))}
          </fieldset>
          <ErrorMessage error={save.error} fallbackMessage="Unable to save Labor rates." />
          <form.Subscribe selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}>
            {({ isDirty, isSubmitting }) => (
              <DialogFooter>
                <Button type="button" variant="outline" disabled={isSubmitting} onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            )}
          </form.Subscribe>
        </form>
      </DialogContent>
    </Dialog>
  );
}
