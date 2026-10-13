import type { UUID } from '@pkg/schema';
import { BreakdownNoteText, JobNoteText } from '@pkg/schema/contracting';
import { IconActivity, IconMessagePlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { ActivityFeed } from '@/contracting/pages/activity/ActivityFeed.js';
import { useTRPC } from '@/lib/trpc.js';

import { ReasonDialog } from './ReasonDialog.js';

type ActivityCardScope = { jobId: UUID } | { breakdownId: UUID };

/** One Job's thread (its Breakdowns included) or one Breakdown's, with Add Note when the record allows one. */
export function ActivityCard({
  scope,
  addNote,
}: {
  scope: ActivityCardScope;
  /** The verdict behind the button: `sheet.action('addNote')`, or null to hide it. */
  addNote: { disabled: boolean; title?: string | undefined } | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconActivity size={18} /> Activity
        </CardTitle>
        {addNote ? (
          <CardAction>
            <Button {...addNote} onClick={() => setOpen(true)} size="sm" variant="outline">
              <IconMessagePlus /> Add Note
            </Button>
            <AddNoteDialog onOpenChange={setOpen} open={open} scope={scope} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ActivityFeed {...scope} />
      </CardContent>
    </Card>
  );
}

function AddNoteDialog({
  open,
  onOpenChange,
  scope,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ActivityCardScope;
}) {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateWorkshop } = useQueryInvalidation();
  const write = useContractingWrite('jobId' in scope ? invalidateJobs : invalidateWorkshop);
  const onSuccess = async () => {
    await write.invalidate();
    toast.success('Note added');
  };
  const addJobNote = useMutation(trpc.contractingJobs.notes.add.mutationOptions({ onSuccess, onError: write.report }));
  const addBreakdownNote = useMutation(
    trpc.contractingBreakdowns.notes.add.mutationOptions({ onSuccess, onError: write.report }),
  );
  const add = 'jobId' in scope ? addJobNote : addBreakdownNote;
  useResetOnOpen(add, open);
  return (
    <ReasonDialog
      error={add.error}
      fallbackMessage="Unable to add the note."
      label="Note"
      onOpenChange={onOpenChange}
      open={open}
      schema={'jobId' in scope ? JobNoteText : BreakdownNoteText}
      submit={(text) =>
        'jobId' in scope
          ? addJobNote.mutateAsync({ jobId: scope.jobId, text })
          : addBreakdownNote.mutateAsync({ breakdownId: scope.breakdownId, text })
      }
      submitLabel="Send"
      title="Add Note"
    />
  );
}
