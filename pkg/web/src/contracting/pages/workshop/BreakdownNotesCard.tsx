import { type BreakdownDetail, BreakdownNoteText } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import type { BreakdownSheet } from './types.js';

const NoteValues = z.object({ text: BreakdownNoteText });

export function BreakdownNotesCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const add = useMutation(trpc.contractingBreakdowns.notes.add.mutationOptions(write.card('Unable to add note.')));
  const addAction = sheet.action('addNote');
  const form = useAppForm({
    defaultValues: { text: '' },
    validators: { onSubmit: NoteValues },
    onSubmit: async ({ value, formApi }) => {
      await add.mutateAsync({ breakdownId: breakdown.id, text: value.text }).then(
        () => {
          formApi.reset();
          toast.success('Note added');
        },
        () => undefined,
      );
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.notes.length ? (
          <ol className="space-y-3">
            {breakdown.notes.map((note) => (
              <li key={note.id} className="space-y-1 border-l-2 pl-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{note.authorName}</span>
                  <DateDisplay date={note.createdAt} format="medium" />
                </div>
                <p className="whitespace-pre-wrap text-sm">{note.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        {addAction ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <form.AppField name="text">
              {(field) => <field.TextareaField label="Add a note" disabled={addAction.disabled} />}
            </form.AppField>
            <Button type="submit" disabled={addAction.disabled || add.isPending} title={addAction.title}>
              Add note
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
