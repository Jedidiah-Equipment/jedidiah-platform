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
  triggerLabel: string;
};

export const RemoveEntityButton: React.FC<RemoveEntityButtonProps> = ({
  confirmLabel = 'Remove',
  description,
  isPending,
  onConfirm,
  title,
  triggerLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        <IconTrash data-icon="inline-start" />
        {triggerLabel}
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
