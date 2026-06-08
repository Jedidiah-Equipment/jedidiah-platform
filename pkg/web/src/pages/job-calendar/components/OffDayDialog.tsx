import { formatDate } from '@pkg/domain';
import { IconCalendarCheck, IconLoader2 } from '@tabler/icons-react';
import type React from 'react';
import { useEffect, useState } from 'react';
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
import type { SelectedCalendarDay } from '../types.js';

type OffDayDialogProps = {
  selectedDay: SelectedCalendarDay | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (label: string) => void;
  onMarkWorking: () => void;
};

export const OffDayDialog: React.FC<OffDayDialogProps> = ({
  selectedDay,
  isPending,
  onClose,
  onSave,
  onMarkWorking,
}) => {
  const [label, setLabel] = useState('');

  useEffect(() => {
    setLabel(selectedDay?.offDay?.label ?? '');
  }, [selectedDay]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={selectedDay !== null}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selectedDay?.offDay ? 'Edit Off-Day' : 'Mark Off-Day'}</DialogTitle>
          <DialogDescription>{selectedDay ? formatDate(selectedDay.date, 'PPP') : null}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="job-calendar-label">Reason</FieldLabel>
          <Input
            disabled={isPending}
            id="job-calendar-label"
            onChange={(event) => setLabel(event.currentTarget.value)}
            value={label}
          />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
          {selectedDay?.offDay ? (
            <Button disabled={isPending} onClick={onMarkWorking} type="button" variant="outline">
              Working Day
            </Button>
          ) : null}
          <Button disabled={isPending} onClick={() => onSave(label)} type="button">
            {isPending ? (
              <IconLoader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <IconCalendarCheck data-icon="inline-start" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
