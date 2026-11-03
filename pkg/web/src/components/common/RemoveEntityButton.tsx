import { IconLoader2, IconTrash, type Icon as TablerIcon } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';

type RemoveConfirmProps = {
  confirmLabel?: string;
  description: React.ReactNode;
  isPending: boolean;
  onConfirm: () => void;
  title: React.ReactNode;
};

type RemoveEntityButtonProps = RemoveConfirmProps & {
  triggerClassName?: string;
  /** The trigger's glyph; a trash can unless the surface calls for another, such as a close mark on a tile. */
  triggerIcon?: TablerIcon;
  triggerIconOnly?: boolean;
  triggerLabel: string;
  triggerSize?: React.ComponentProps<typeof Button>['size'];
  triggerVariant?: React.ComponentProps<typeof Button>['variant'];
};

function RemoveConfirmContent({
  confirmLabel = 'Remove',
  description,
  isPending,
  onConfirm,
  title,
}: RemoveConfirmProps) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
        <Button disabled={isPending} onClick={onConfirm} type="button" variant="destructive">
          {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** The remove confirmation opened from elsewhere, such as a menu item. */
export function RemoveEntityDialog({
  open,
  onOpenChange,
  ...confirm
}: RemoveConfirmProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <RemoveConfirmContent {...confirm} />
    </Dialog>
  );
}

export const RemoveEntityButton: React.FC<RemoveEntityButtonProps> = ({
  triggerClassName,
  triggerIcon: TriggerIcon = IconTrash,
  triggerIconOnly = false,
  triggerLabel,
  triggerSize,
  triggerVariant = 'destructive',
  ...confirm
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label={triggerIconOnly ? triggerLabel : undefined}
            className={triggerClassName}
            size={triggerSize}
            title={triggerIconOnly ? triggerLabel : undefined}
            type="button"
            variant={triggerVariant}
          />
        }
      >
        <TriggerIcon data-icon={triggerIconOnly ? undefined : 'inline-start'} />
        {triggerIconOnly ? null : triggerLabel}
      </DialogTrigger>
      <RemoveConfirmContent {...confirm} />
    </Dialog>
  );
};
