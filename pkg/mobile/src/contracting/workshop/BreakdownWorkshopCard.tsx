import { formatHours } from '@pkg/domain';
import { presentAction, reportToSolvedHours } from '@pkg/domain/contracting';
import { type BreakdownDetail, CloseOutNote } from '@pkg/schema/contracting';
import { IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { DateText } from '@/components/DateText';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SearchSelect } from '@/components/form/fields/SearchSelectField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { DetailRow } from '@/contracting/components/DetailRow';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useBusyAction } from '@/lib/use-busy-action';
import { BREAKDOWN_SAVE_FAILED, useBreakdownMutation, useMechanics } from './use-breakdowns';
import { VerdictButton, VerdictGroup } from './VerdictButton';

/** A Fixed Breakdown is settled: who fixed it, when work ran, and the close-out note, with nothing left to press. */
function FixedSummary({ breakdown }: { breakdown: BreakdownDetail }) {
  const hours = reportToSolvedHours(breakdown);
  return (
    <Card>
      <DetailRow label="Mechanic">
        <Text className="text-right text-foreground" weight="semibold">
          {breakdown.mechanicName ?? 'None assigned'}
        </Text>
      </DetailRow>
      <DetailRow label="Started">
        {breakdown.startedAt ? (
          <DateText className="text-right text-foreground" date={breakdown.startedAt} format="medium" />
        ) : (
          <Text className="text-right text-muted-foreground">Went straight to Fixed</Text>
        )}
      </DetailRow>
      <DetailRow label="Fixed">
        <DateText className="text-right text-foreground" date={breakdown.solvedAt} format="medium" />
      </DetailRow>
      {breakdown.solvedByName ? (
        <DetailRow label="Closed out by">
          <Text className="text-right text-foreground">{breakdown.solvedByName}</Text>
        </DetailRow>
      ) : null}
      {hours !== null ? (
        <DetailRow label="Report to Fixed">
          <Text className="text-right text-foreground">{formatHours(hours)}</Text>
        </DetailRow>
      ) : null}
      {breakdown.closeOutNote ? (
        <View className="gap-1 border-l-2 border-emerald-500/60 pl-3">
          <Text className="text-xs text-muted-foreground">Close-out note</Text>
          <Text className="text-foreground">{breakdown.closeOutNote}</Text>
        </View>
      ) : null}
    </Card>
  );
}

export function BreakdownWorkshopCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const assign = useBreakdownMutation((breakdowns) => breakdowns.assignMechanic);
  const start = useBreakdownMutation((breakdowns) => breakdowns.start);
  const mechanics = useMechanics();
  const { busy, error, run } = useBusyAction();
  const [solving, setSolving] = useState(false);
  const { actions } = breakdown;
  // The picker shows the server's Mechanic, so a failed assignment leaves it where it was.
  const assignMechanic = (mechanicUserId: string) =>
    run(async () => {
      await assign.mutateAsync({ id: breakdown.id, mechanicUserId: mechanicUserId || null });
    }, BREAKDOWN_SAVE_FAILED);
  if (breakdown.status === 'solved') return <FixedSummary breakdown={breakdown} />;
  return (
    <Card>
      {presentAction(actions.assignMechanic) ? (
        <VerdictGroup verdict={actions.assignMechanic}>
          {(disabled) => (
            <SearchSelect
              label="Mechanic"
              placeholder="No Mechanic yet"
              searchPlaceholder="Search Mechanics…"
              emptyMessage="No Mechanics match."
              disabled={busy || disabled}
              value={breakdown.primaryMechanicUserId ?? ''}
              onChange={(mechanicUserId) => void assignMechanic(mechanicUserId)}
              options={[
                { label: 'No Mechanic yet', value: '' },
                ...(mechanics.data ?? []).map((mechanic) => ({ label: mechanic.name, value: mechanic.id })),
              ]}
            />
          )}
        </VerdictGroup>
      ) : (
        <Text className="text-foreground">Mechanic: {breakdown.mechanicName ?? 'not assigned yet'}</Text>
      )}
      {breakdown.startedAt ? (
        <DetailRow label="Started">
          <DateText className="text-right text-foreground" date={breakdown.startedAt} format="medium" />
        </DetailRow>
      ) : null}
      {error ? <Text className="text-danger">{error}</Text> : null}
      {breakdown.status === 'open' ? (
        <VerdictButton
          verdict={actions.start}
          title="Start work"
          captureIcon={IconPlayerPlay}
          busy={busy}
          onPress={() =>
            void run(async () => {
              await start.mutateAsync({ id: breakdown.id });
            }, BREAKDOWN_SAVE_FAILED)
          }
        />
      ) : null}
      {/* Completing is the stop moment once work has started; before then it is a plain alternative to starting. */}
      <VerdictButton
        verdict={actions.solve}
        title="Mark completed"
        captureIcon={breakdown.status === 'in-progress' ? IconPlayerStop : undefined}
        busy={busy}
        onPress={() => setSolving(true)}
      />
      <CompleteModal breakdownId={breakdown.id} visible={solving} onClose={() => setSolving(false)} />
    </Card>
  );
}

/** Solving needs a close-out note, so a plain confirm is not enough. */
function CompleteModal({
  breakdownId,
  visible,
  onClose,
}: {
  breakdownId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const solve = useBreakdownMutation((breakdowns) => breakdowns.solve);
  const [note, setNote] = useState('');
  const voice = useVoiceSession('close-out note', {
    value: note,
    onChangeText: setNote,
    maxLength: CloseOutNote.maxLength ?? undefined,
  });
  const { busy, error, run } = useBusyAction();
  const valid = CloseOutNote.safeParse(note).success;
  const close = () => {
    if (busy) return;
    voice.reset();
    setNote('');
    onClose();
  };
  return (
    <ThemedModal backdropLabel="Cancel marking completed" open={visible} onClose={close} dismissDisabled={busy}>
      <View className="w-full gap-3 rounded-2xl border border-border bg-background p-4">
        <Text className="text-lg text-foreground" weight="bold">
          Mark completed
        </Text>
        <FieldShell label="Close-out note">
          <VoiceTextArea
            accessibilityLabel="Close-out note"
            placeholder="What was wrong and what was done"
            editable={!busy}
            rows={4}
            voice={voice}
          />
        </FieldShell>
        {error ? <Text className="text-danger">{error}</Text> : null}
        <Button
          primary={!busy && !voice.busy && valid}
          title={busy ? 'Saving…' : 'Confirm completed'}
          disabled={busy || voice.busy || !valid}
          onPress={() =>
            void run(async () => {
              await solve.mutateAsync({ id: breakdownId, closeOutNote: note });
              voice.reportSaved();
              setNote('');
              onClose();
            }, BREAKDOWN_SAVE_FAILED)
          }
        />
        <Button title="Cancel" disabled={busy} onPress={close} />
      </View>
    </ThemedModal>
  );
}
