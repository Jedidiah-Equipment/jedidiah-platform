import { judgeAssignmentRemoval, REMOVAL_REASON_REQUIRED, removalNeedsReason } from '@pkg/domain/contracting';
import type { AssignmentDetail } from '@pkg/schema/contracting';
import { useState } from 'react';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { Button } from '@/components/ui/button';
import { DialogCard } from '@/components/ui/dialog-card';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useBusyAction } from '@/lib/use-busy-action';
import { useRemoveStint } from './use-jobs';

/** Confirms taking one stint off its Job; once the Machine has arrived its hours go too, so it asks why. */
export function RemoveStintDialog({
  stint,
  open,
  onClose,
}: {
  stint: AssignmentDetail;
  open: boolean;
  onClose: () => void;
}) {
  const remove = useRemoveStint();
  const { busy, error, setError, run } = useBusyAction();
  const [reason, setReason] = useState('');
  const needsReason = removalNeedsReason(stint.state);
  const canRemove = !busy && judgeAssignmentRemoval(stint, reason).ok;
  const close = () => {
    if (busy) return;
    setError(null);
    setReason('');
    onClose();
  };
  return (
    <ThemedModal backdropLabel="Keep the Machine" open={open} onClose={close} dismissDisabled={busy}>
      <DialogCard
        title={`Remove ${stint.machineCode}?`}
        error={error}
        actions={
          <>
            <Button
              primary={canRemove}
              title={busy ? 'Removing…' : 'Remove'}
              disabled={!canRemove}
              onPress={() =>
                void run(async () => {
                  await remove.mutateAsync({ id: stint.id, ...(needsReason ? { reason: reason.trim() } : {}) });
                  setReason('');
                  onClose();
                }, 'Unable to remove the Machine.')
              }
            />
            <Button title="Keep" disabled={busy} onPress={close} />
          </>
        }
      >
        <Text className="text-muted-foreground">
          {needsReason
            ? 'This deletes the stint with its hours, Travel and Measures. It cannot be undone.'
            : 'This takes the planned Machine off the Job.'}
        </Text>
        {needsReason ? (
          <FieldShell label="Reason">
            <TextInput
              accessibilityLabel="Reason"
              placeholder={REMOVAL_REASON_REQUIRED}
              value={reason}
              editable={!busy}
              onChangeText={setReason}
              multiline
            />
          </FieldShell>
        ) : null}
      </DialogCard>
    </ThemedModal>
  );
}
