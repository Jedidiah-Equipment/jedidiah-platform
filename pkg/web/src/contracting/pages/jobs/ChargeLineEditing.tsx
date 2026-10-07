import { requiredTrimmedText } from '@pkg/schema';
import type { ChargeLine } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useTRPC } from '@/lib/trpc.js';
import type { JobSheet } from './types.js';
import { useJobWrite } from './use-job-write.js';

const ChargeLineValues = z.object({ description: requiredTrimmedText('A description is required') });

export function AddChargeLineButton({
  jobId,
  size,
  action,
}: {
  jobId: string;
  size?: React.ComponentProps<typeof Button>['size'];
  /** From `sheet.action('editChargeLines')`: disabled with the refusal while the Job refuses it. */
  action: NonNullable<ReturnType<JobSheet['action']>>;
}) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const [open, setOpen] = useState(false);
  const create = useMutation(trpc.contractingJobs.chargeLines.create.mutationOptions(write.dialog));
  useResetOnOpen(create, open);
  return (
    <>
      <Button size={size} {...action} onClick={() => setOpen(true)}>
        Add charge line
      </Button>
      <CreateEntityDialog
        open={open}
        onOpenChange={setOpen}
        title="Add charge line"
        defaultValues={{ description: '' }}
        validator={ChargeLineValues}
        onCreate={(values) => create.mutateAsync({ jobId, description: values.description })}
        onCreated={() => setOpen(false)}
      >
        {(form) => (
          <>
            <form.AppField name="description">{(field) => <field.TextField label="Description" />}</form.AppField>
            <ErrorMessage error={create.error} fallbackMessage="Unable to add Charge Line." />
          </>
        )}
      </CreateEntityDialog>
    </>
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
