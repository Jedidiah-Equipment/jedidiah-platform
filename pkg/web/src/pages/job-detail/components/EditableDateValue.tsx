import type { JobDateEditField, JobDateEditInput, UUID } from '@pkg/schema';
import { EraserIcon, PencilIcon, SaveIcon } from 'lucide-react';
import React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type EditableDateValueProps = {
  canEdit: boolean;
  disabled: boolean;
  emptyValue: string;
  entityId: UUID;
  entityLevel: JobDateEditInput['entityLevel'];
  field: JobDateEditField;
  label: string;
  setManually: boolean;
  value: string | null;
  onEdit: (input: JobDateEditInput) => void;
};

export const EditableDateValue: React.FC<EditableDateValueProps> = ({
  canEdit,
  disabled,
  emptyValue,
  entityId,
  entityLevel,
  field,
  label,
  onEdit,
  setManually,
  value,
}) => {
  const [open, setOpen] = React.useState(false);
  const isActualField = field === 'actual_start' || field === 'actual_end';
  const [draftValue, setDraftValue] = React.useState(() => formatInputValue(value, isActualField));

  React.useEffect(() => {
    if (open) {
      setDraftValue(formatInputValue(value, isActualField));
    }
  }, [isActualField, open, value]);

  const submit = (nextValue: string | null) => {
    onEdit({
      entityId,
      entityLevel,
      field,
      value: nextValue === null ? null : formatSubmitValue(nextValue, isActualField),
    });
    setOpen(false);
  };

  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="min-w-0">
          {isActualField ? (
            <DateDisplay date={value} emptyValue={emptyValue} format="medium" />
          ) : (
            <DateDisplay date={value} emptyValue={emptyValue} />
          )}
        </span>
        {!setManually ? (
          <Badge className="h-5 px-1.5 text-[0.65rem] uppercase" variant="secondary">
            Auto
          </Badge>
        ) : null}
        {canEdit ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={`Edit ${label}`}
                  disabled={disabled}
                  onClick={() => setOpen(true)}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                />
              }
            >
              <PencilIcon />
            </TooltipTrigger>
            <TooltipContent>Edit {label}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {label}</DialogTitle>
            <DialogDescription>Set a manual value, or clear it to return this field to auto.</DialogDescription>
          </DialogHeader>
          <Input
            onChange={(event) => setDraftValue(event.target.value)}
            type={isActualField ? 'datetime-local' : 'date'}
            value={draftValue}
          />
          <DialogFooter>
            <Button disabled={disabled} onClick={() => submit(null)} type="button" variant="outline">
              <EraserIcon data-icon="inline-start" />
              Clear
            </Button>
            <Button disabled={disabled || !draftValue} onClick={() => submit(draftValue)} type="button">
              <SaveIcon data-icon="inline-start" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

function formatInputValue(value: string | null, isActualField: boolean): string {
  if (!value) return '';
  if (!isActualField) return value;

  const date = new Date(value);
  const offsetMilliseconds = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
}

function formatSubmitValue(value: string, isActualField: boolean): string {
  if (!isActualField) return value;

  return new Date(value).toISOString();
}
