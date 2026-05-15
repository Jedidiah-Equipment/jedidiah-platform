import type React from 'react';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import type { JobTransitionConfirmation } from '../types.js';

type JobTransitionConfirmationDialogProps = {
  confirmation: JobTransitionConfirmation | null;
  isPending: boolean;
  onClose: () => void;
};

export const JobTransitionConfirmationDialog: React.FC<JobTransitionConfirmationDialogProps> = ({
  confirmation,
  isPending,
  onClose,
}) => (
  <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={Boolean(confirmation)}>
    <DialogContent className="sm:max-w-lg">
      {confirmation ? (
        <>
          <DialogHeader>
            <DialogTitle>{confirmation.title}</DialogTitle>
            <DialogDescription className="flex flex-col gap-2">
              {confirmation.body.map((paragraph) => (
                <span key={paragraph}>{paragraph}</span>
              ))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={isPending} onClick={onClose} type="button" variant="outline">
              Keep editing
            </Button>
            <Button
              disabled={isPending}
              onClick={() => {
                const action = confirmation.onConfirm;
                onClose();
                action();
              }}
              type="button"
              variant={confirmation.confirmVariant}
            >
              {confirmation.confirmLabel}
            </Button>
          </DialogFooter>
        </>
      ) : null}
    </DialogContent>
  </Dialog>
);
