import { UUID } from '@pkg/schema';
import { type Assignment, Quantity } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { requiredSelection } from '@/components/form/utils/form-schema.js';
import { Button } from '@/components/ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const MeasureValues = z.object({ measureTypeId: requiredSelection(UUID, 'Choose a Measure Type'), quantity: Quantity });

export function AddMeasurePopover({ stint }: { stint: Assignment }) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const types = useQuery(trpc.contractingJobs.options.measureTypes.queryOptions(undefined, { enabled: open }));
  const set = useMutation(
    trpc.contractingJobs.measures.set.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        setOpen(false);
      },
    }),
  );
  const form = useAppForm({
    defaultValues: { measureTypeId: '', quantity: 1 },
    validators: { onSubmit: MeasureValues },
    onSubmit: async ({ value }) => {
      try {
        const input = MeasureValues.parse(value);
        await set.mutateAsync({ assignmentId: stint.id, ...input });
      } catch {
        // The mutation error remains visible so the quantity can be retried.
      }
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" />}>Add measure</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <p className="font-medium">Measure · {stint.machineCode}</p>
          <form.AppField name="measureTypeId">
            {(field) => (
              <field.SelectField
                label="Measure Type"
                options={(types.data ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name}${stint.measures.some((measure) => measure.measureTypeId === item.id) ? ' (editing)' : ''}`,
                }))}
                onValueCommit={(id) =>
                  form.setFieldValue(
                    'quantity',
                    stint.measures.find((measure) => measure.measureTypeId === id)?.quantity ?? 1,
                  )
                }
              />
            )}
          </form.AppField>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Quantity" decimals={2} min={0.01} />}
          </form.AppField>
          <ErrorMessage error={set.error ?? types.error} fallbackMessage="Unable to set Measure." />
          <Button type="submit" disabled={set.isPending}>
            Save measure
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
