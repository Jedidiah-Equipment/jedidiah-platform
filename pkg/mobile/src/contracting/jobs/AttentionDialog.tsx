import { getFirstName } from '@pkg/domain';
import { type AttentionBadge, type AttentionThresholds, assignmentAttentionSentence } from '@pkg/domain/contracting';
import type { AssignmentDetail } from '@pkg/schema/contracting';
import { DateText } from '@/components/DateText';
import { Button } from '@/components/ui/button';
import { DialogCard } from '@/components/ui/dialog-card';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useBusyAction } from '@/lib/use-busy-action';
import { useDismissAttention } from './use-jobs';

/**
 * One needs-a-look reason on a stint, opened from its row: what it says, who dismissed it if someone did, and the
 * dismiss control for whoever may dismiss it.
 */
export function AttentionDialog({
  stint,
  badge,
  thresholds,
  canDismiss,
  onClose,
}: {
  stint: AssignmentDetail;
  badge: AttentionBadge | null;
  thresholds: AttentionThresholds;
  canDismiss: boolean;
  onClose: () => void;
}) {
  const dismiss = useDismissAttention();
  const { busy, error, setError, run } = useBusyAction();
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  return (
    <ThemedModal backdropLabel="Close the warning" open={badge !== null} onClose={close} dismissDisabled={busy}>
      {badge ? (
        <DialogCard
          title={badge.dismissal ? 'Dismissed' : 'Needs a look'}
          error={error}
          actions={
            <>
              {!badge.dismissal && canDismiss ? (
                <Button
                  primary={!busy}
                  title={busy ? 'Dismissing…' : 'Dismiss for everyone'}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await dismiss.mutateAsync({ assignmentId: stint.id, kind: badge.kind });
                      onClose();
                    }, 'Unable to dismiss the warning.')
                  }
                />
              ) : null}
              <Button title="Close" disabled={busy} onPress={close} />
            </>
          }
        >
          <Text className="text-foreground">{assignmentAttentionSentence(badge.kind, stint, thresholds)}</Text>
          {badge.dismissal ? (
            <Text className="text-sm text-muted-foreground">
              {`Dismissed by ${getFirstName(badge.dismissal.dismissedByName)} · `}
              <DateText className="text-sm text-muted-foreground" date={badge.dismissal.dismissedAt} format="medium" />
            </Text>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {canDismiss
                ? 'Dismissing hides it for everyone, on the phone and the web, until these hours or Travel change.'
                : 'Management dismisses it once it has been looked at.'}
            </Text>
          )}
        </DialogCard>
      ) : null}
    </ThemedModal>
  );
}
