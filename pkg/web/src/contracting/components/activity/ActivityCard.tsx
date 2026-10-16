import { canSeeActivity, type presentAction } from '@pkg/domain/contracting';
import { NoteText } from '@pkg/schema/contracting';
import { IconActivity, IconMessagePlus } from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useAccess } from '@/hooks/use-access.js';

import { ReasonDialog } from '../ReasonDialog.js';
import { ActivityFeed } from './ActivityFeed.js';
import { type NoteThreadRef, useAddNote } from './use-add-note.js';

/** One Job's thread (its Breakdowns included) or one Breakdown's, with Add Note when the record allows one. */
export function ActivityCard({
  thread,
  addNote,
}: {
  thread: NoteThreadRef;
  /** The verdict behind the button: `sheet.action('addNote')`, or null to hide it. */
  addNote: ReturnType<typeof presentAction>;
}) {
  const [open, setOpen] = useState(false);
  // Invoicing opens the Job page but has no Activity: a card there could only fail to load.
  const seesActivity = canSeeActivity(useAccess().data);
  if (!seesActivity) return null;
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
            <AddNoteDialog onOpenChange={setOpen} open={open} thread={thread} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <ActivityFeed {...(thread.kind === 'job' ? { jobId: thread.id } : { breakdownId: thread.id })} />
      </CardContent>
    </Card>
  );
}

function AddNoteDialog({
  open,
  onOpenChange,
  thread,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: NoteThreadRef;
}) {
  const addNote = useAddNote(thread);
  useResetOnOpen(addNote, open);
  return (
    <ReasonDialog
      error={addNote.error}
      fallbackMessage="Unable to add the note."
      label="Note"
      onOpenChange={onOpenChange}
      open={open}
      schema={NoteText}
      submit={addNote.send}
      submitLabel="Send"
      title="Add Note"
    />
  );
}
