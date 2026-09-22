import type { InventoryQuoteOption, JobPickerOption, JobStockMovementType } from '@pkg/schema/equipment';
import { useState } from 'react';

import { JobPicker, JobPickerTrigger } from '@/equipment/components/job-picker/index.js';
import { useInventoryJobPicker, useInventoryQuotePicker } from '@/equipment/hooks/options/index.js';

import { InventoryQuotePicker } from './InventoryQuotePicker.js';
import type { ReturnStockTarget } from './types.js';

/** The Job or Parts Sale a movement is posted against, with the option the picker resolved it from. */
export type SelectedMovementTarget =
  | { kind: 'job'; option: JobPickerOption }
  | { kind: 'quote'; option: InventoryQuoteOption };

type MovementTargetPickerProps = {
  enabled: boolean;
  inputId: string;
  movementType: JobStockMovementType;
  nothingPickableMessage: string;
  onSelected: (target: SelectedMovementTarget | null) => void;
  value: SelectedMovementTarget | null;
};

/**
 * One picker for both movement targets. Each kind reads its own list from its own procedure, so the
 * kind selects which of the two is mounted rather than which of two live controllers is rendered.
 */
export function MovementTargetPicker({ kind, ...props }: MovementTargetPickerProps & { kind: ReturnStockTarget }) {
  return kind === 'quote' ? <QuoteTargetPicker {...props} /> : <JobTargetPicker {...props} />;
}

function JobTargetPicker({
  enabled,
  inputId,
  movementType,
  nothingPickableMessage,
  onSelected,
  value,
}: MovementTargetPickerProps) {
  const [isOpen, setOpen] = useState(false);
  const controller = useInventoryJobPicker({ enabled, movementType });
  const job = value?.kind === 'job' ? value.option : null;

  return (
    <JobPicker
      controller={controller}
      nothingPickableMessage={nothingPickableMessage}
      onOpenChange={setOpen}
      onSelect={(next) => onSelected({ kind: 'job', option: next })}
      open={isOpen}
      value={job}
    >
      <JobPickerTrigger className="w-full" id={inputId} placeholder="Select Job" value={job} />
    </JobPicker>
  );
}

function QuoteTargetPicker({ enabled, inputId, movementType, onSelected, value }: MovementTargetPickerProps) {
  const controller = useInventoryQuotePicker({ enabled, movementType });

  return (
    <InventoryQuotePicker
      controller={controller}
      inputId={inputId}
      onSelected={(quote) => onSelected(quote ? { kind: 'quote', option: quote } : null)}
      value={value?.kind === 'quote' ? value.option : null}
    />
  );
}
