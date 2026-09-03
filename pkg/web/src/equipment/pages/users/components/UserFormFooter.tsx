import { IconLoader2 } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { DialogFooter } from '@/components/ui/dialog.js';

type SubmitFooterProps = {
  form?: string;
  isPending: boolean;
  label: string;
};

export const SubmitFooter: React.FC<SubmitFooterProps> = ({ form, isPending, label }) => (
  <DialogFooter className="mt-4" showCloseButton>
    <Button disabled={isPending} form={form} type="submit">
      {isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
      {label}
    </Button>
  </DialogFooter>
);
