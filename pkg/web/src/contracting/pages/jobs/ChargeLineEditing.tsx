import { requiredTrimmedText } from '@pkg/schema';
import type { ChargeLine } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Input } from '@/components/ui/input.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const ChargeLineValues = z.object({ description: requiredTrimmedText('A description is required') });

export function useChargeLineMutations() {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  return {
    create: useMutation(
      trpc.contractingJobs.chargeLines.create.mutationOptions({
        onSuccess: invalidateJobs,
        onError: (error) => showError(error, 'Unable to add Charge Line.'),
      }),
    ),
    patch: useMutation(
      trpc.contractingJobs.chargeLines.patch.mutationOptions({
        onSuccess: invalidateJobs,
        onError: (error) => showError(error, 'Unable to update Charge Line.'),
      }),
    ),
    remove: useMutation(
      trpc.contractingJobs.chargeLines.remove.mutationOptions({
        onSuccess: invalidateJobs,
        onError: (error) => showError(error, 'Unable to remove Charge Line.'),
      }),
    ),
  };
}

export type ChargeLineMutations = ReturnType<typeof useChargeLineMutations>;

export function AddChargeLineDialog({
  jobId,
  open,
  onOpenChange,
  create,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  create: ChargeLineMutations['create'];
}) {
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add charge line"
      defaultValues={{ description: '' }}
      validator={ChargeLineValues}
      onCreate={(values) => create.mutateAsync({ jobId, description: values.description })}
      onCreated={() => onOpenChange(false)}
    >
      {(form) => (
        <form.AppField name="description">{(field) => <field.TextField label="Description" />}</form.AppField>
      )}
    </CreateEntityDialog>
  );
}

export function ChargeLineDescription({
  line,
  editable,
  onSave,
}: {
  line: ChargeLine;
  editable: boolean;
  onSave: (description: string) => void;
}) {
  const [description, setDescription] = useState(line.description);
  if (!editable) return <span>{line.description}</span>;
  return (
    <Input
      aria-label="Charge Line description"
      value={description}
      onChange={(event) => setDescription(event.target.value)}
      onBlur={() => {
        const trimmed = description.trim();
        if (trimmed && trimmed !== line.description) onSave(trimmed);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
