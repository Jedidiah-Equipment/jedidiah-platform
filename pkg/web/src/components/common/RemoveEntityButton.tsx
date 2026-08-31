import { IconLoader2, IconTrash } from '@tabler/icons-react';
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

type RemoveEntityButtonProps = {
  confirmLabel?: string;
  description: React.ReactNode;
  isPending: boolean;
  onConfirm: () => void;
  title: string;
  triggerIconOnly?: boolean;
  triggerLabel: string;
  triggerSize?: React.ComponentProps<typeof Button>['size'];
  triggerVariant?: React.ComponentProps<typeof Button>['variant'];
};

export const RemoveEntityButton: React.FC<RemoveEntityButtonProps> = ({
  confirmLabel = 'Remove',
  description,
  isPending,
  onConfirm,
  title,
  triggerIconOnly = false,
  triggerLabel,
  triggerSize,
  triggerVariant = 'destructive',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button
            aria-label={triggerIconOnly ? triggerLabel : undefined}
            size={triggerSize}
            type="button"
            variant={triggerVariant}
          />
        }
      >
        <IconTrash data-icon={triggerIconOnly ? undefined : 'inline-start'} />
        {triggerIconOnly ? null : triggerLabel}
      </DialogTrigger>
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
    </Dialog>
  );
};
