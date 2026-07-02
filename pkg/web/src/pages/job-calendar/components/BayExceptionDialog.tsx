import { formatDate } from '@pkg/domain';
import type { ProjectedBayQueue } from '@pkg/schema';
import { IconLoader2, IconMoon, IconSun, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import { bayOperatorName } from '@/components/bays/bay-label.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { fromJobCalendarDateKey } from '../../jobs/components/job-date-key.js';
import { getBayCalendarException } from '../bay-exceptions.js';
import type { BayExceptionDialogState } from '../types.js';

type BayExceptionDialogProps = {
  state: BayExceptionDialogState | null;
  bays: ProjectedBayQueue[];
  isPending: boolean;
  isAddPending: boolean;
  isRemovePending: boolean;
  onChange: (updater: (current: BayExceptionDialogState | null) => BayExceptionDialogState | null) => void;
  onClose: () => void;
  onAdd: () => void;
  onRemove: () => void;
};

export const BayExceptionDialog: React.FC<BayExceptionDialogProps> = ({
  state,
  bays,
  isPending,
  isAddPending,
  isRemovePending,
  onChange,
  onClose,
  onAdd,
  onRemove,
}) => {
  const selectedBay = state ? (bays.find((bay) => bay.id === state.bayId) ?? null) : null;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={state !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.existingException ? 'Edit' : 'Add'} {state?.direction === 'work' ? 'bay overtime' : 'bay closure'}
          </DialogTitle>
          <DialogDescription>{state ? formatDate(fromJobCalendarDateKey(state.date), 'PPP') : null}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="bay-exception-bay">Bay</FieldLabel>
            <Select
              disabled={isPending}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }

                onChange((current) => {
                  if (!current) return current;

                  const bay = bays.find((item) => item.id === value);
                  const existingException = bay ? getBayCalendarException(bay, current.date) : null;

                  return {
                    ...current,
                    bayId: value,
                    existingException,
                    label: existingException?.label ?? '',
                  };
                });
              }}
              value={state?.bayId ?? ''}
            >
              <SelectTrigger id="bay-exception-bay" className="w-full">
                <SelectValue placeholder="Select bay">
                  {selectedBay
                    ? `${selectedBay.name}${bayOperatorName(selectedBay) ? ` - ${bayOperatorName(selectedBay)}` : ''}`
                    : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectGroup>
                  {bays.map((bay) => (
                    <SelectItem key={bay.id} value={bay.id}>
                      {bay.name}
                      {bayOperatorName(bay) ? ` - ${bayOperatorName(bay)}` : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="bay-exception-label">Reason</FieldLabel>
            <Input
              disabled={isPending}
              id="bay-exception-label"
              onChange={(event) => {
                const nextLabel = event.currentTarget.value;

                onChange((current) => (current ? { ...current, label: nextLabel } : current));
              }}
              value={state?.label ?? ''}
            />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
          {state?.existingException ? (
            <Button disabled={isPending} onClick={onRemove} type="button" variant="outline">
              {isRemovePending ? (
                <IconLoader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <IconTrash data-icon="inline-start" />
              )}
              Remove exception
            </Button>
          ) : null}
          <Button disabled={isPending || !state} onClick={onAdd} type="button">
            {isAddPending ? (
              <IconLoader2 className="animate-spin" data-icon="inline-start" />
            ) : state?.direction === 'work' ? (
              <IconSun data-icon="inline-start" />
            ) : (
              <IconMoon data-icon="inline-start" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
