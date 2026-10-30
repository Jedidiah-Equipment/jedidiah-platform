import { AuthId, emptyStringOr, UUID } from '@pkg/schema';
import { type Assignment, ReadingComment } from '@pkg/schema/contracting';
import { useState } from 'react';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { CaptureWizard } from '@/contracting/components/readings/CaptureWizard.js';
import { useReadingCapture } from '@/contracting/components/readings/use-reading-capture.js';
import { AssignmentEditorDialog, changesAssignment } from './AssignmentEditorDialog.js';
import { useAssignmentOptions } from './use-assignment-options.js';

const ArrivalValues = z.object({
  comment: z.union([z.string().trim().length(0), ReadingComment]),
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});
type ArrivalValues = z.infer<typeof ArrivalValues>;

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  // A refetch can change the live stint mid-capture; the form starts from, and overrides compare against, the opened one.
  const [opened, setOpened] = useState(stint);
  if (stint?.id !== opened?.id) setOpened(stint);
  const capture = useReadingCapture({ role: 'arrival', stint }, (values: ArrivalValues) => ({
    comment: values.comment,
    stintOverrides: changesAssignment(opened, values)
      ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
      : undefined,
  }));
  const options = useAssignmentOptions({
    enabled: !!stint,
    stint,
    noImplementLabel: 'No implement',
    noDriverLabel: 'No driver',
    freeImplementsOnly: true,
  });
  const canCapture = (values: ArrivalValues) =>
    (!changesAssignment(opened, values) || options.ready) && capture.canSubmit(values);

  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          capture.reset();
          onClose();
        }
      }}
      title={<MachineDialogTitle machine={stint}>Capture arrival</MachineDialogTitle>}
      {...capture.dialogProps}
      defaultValues={{
        comment: '',
        implementId: opened?.implementId ?? '',
        driverUserId: opened?.driverUserId ?? '',
      }}
      validator={ArrivalValues}
      canSubmit={canCapture}
      onBeforeCreate={canCapture}
      onCreated={() => {
        capture.reset();
        onClose();
      }}
    >
      {(form) => (
        <CaptureWizard capture={capture}>
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
          <form.Subscribe
            selector={(state) => ({ implementId: state.values.implementId, driverUserId: state.values.driverUserId })}
          >
            {({ implementId, driverUserId }) => {
              const selectedImplement = options.implementOptions.find((entry) => entry.value === implementId);
              const implementLabel = selectedImplement?.label ?? 'No implement';
              const driverLabel =
                options.driverOptions.find((entry) => entry.value === driverUserId)?.label ?? 'No driver';
              return (
                <Card className="bg-muted/30" size="sm">
                  <CardHeader>
                    <CardTitle>Starting assignment</CardTitle>
                    <CardAction>
                      {stint ? (
                        <AssignmentEditorDialog
                          stint={{ ...stint, implementId: implementId || null, driverUserId: driverUserId || null }}
                          implementOptions={options.implementOptions}
                          driverOptions={options.driverOptions}
                          canSave={options.ready}
                          error={options.error}
                          submitLabel="Apply"
                          onSave={async (draft) => {
                            form.setFieldValue('implementId', draft.implementId);
                            form.setFieldValue('driverUserId', draft.driverUserId);
                          }}
                        />
                      ) : null}
                    </CardAction>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-2">
                      <span className="block text-xs text-muted-foreground">Implement</span>
                      <span className="flex min-h-6 items-center gap-2">
                        {selectedImplement?.icon}
                        <span className="truncate" title={implementLabel}>
                          {implementLabel}
                        </span>
                      </span>
                    </div>
                    <div className="min-w-0 space-y-2">
                      <span className="block text-xs text-muted-foreground">Driver</span>
                      <span className="flex min-h-6 items-center truncate" title={driverLabel}>
                        {driverLabel}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            }}
          </form.Subscribe>
        </CaptureWizard>
      )}
    </CreateEntityDialog>
  );
}
