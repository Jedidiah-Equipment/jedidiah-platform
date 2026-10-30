import { formatHours } from '@pkg/domain';
import {
  belowLatestSentence,
  capturedAtFor,
  captureRefusals,
  deriveCaptureForm,
  isBackdated,
  READ_AT_NOW,
  type ReadAtChoice,
  readAtAfterRefusal,
  readAtAfterValueEdit,
  readAtOf,
  readAtProposal,
  readAtSuggestionSentence,
  readingProviderSuffix,
} from '@pkg/domain/contracting';
import { ReadingComment, type ReadingErrorCode, type ReadingRole, readingRefusalOf } from '@pkg/schema/contracting';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import { type ScrollViewInstance, View } from 'react-native';
import { FormPage } from '@/components/FormPage';
import { FieldLabel, FieldShell } from '@/components/form/fields/FieldShell';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { ReadAtField, type ReadAtFieldHandle } from '@/contracting/components/ReadAtField';
import { type PlannedStint, StintOverrideCard, useStintOverrides } from '@/contracting/components/StintOverrideCard';
import { recordReadingCaptured } from '@/contracting/observability';
import { type AttemptIdentity, captureAttempt, captureAttemptPayload } from '@/contracting/readings/capture-attempt';
import { CAPTURE_FAILED, captureReading } from '@/contracting/readings/reading-upload';
import { useFleet, useLatestReading } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { UploadRefusedError } from '@/lib/multipart-upload';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

/** Refusals that mean the ledger moved under the form: its latest reading must be fetched again. */
const LEDGER_MOVED = new Set<string>([
  'reading.below_latest',
  'reading.above_next',
  'reading.previous_changed',
] satisfies ReadingErrorCode[]);

type CaptureTarget =
  | { kind: 'machine'; machineId: string }
  | {
      kind: 'stint';
      machineId: string;
      jobId: string;
      assignmentId: string;
      role: 'arrival' | 'departure';
      planned: PlannedStint;
    };

/** `/contracting/machines/[id]/capture`: a spot reading from the Machine screen. */
export default function MachineCaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaptureForm target={{ kind: 'machine', machineId: id }} />;
}

/** `/contracting/jobs/[jobId]/capture`: a stint's arrival or departure from the Job screen. */
export function JobCaptureScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    machineId: string;
    assignmentId: string;
    role?: string;
    overrideImplementId?: string;
    overrideDriverUserId?: string;
    implementCode?: string;
    driverName?: string;
  }>();
  return (
    <CaptureForm
      target={{
        kind: 'stint',
        machineId: params.machineId,
        jobId: params.jobId,
        assignmentId: params.assignmentId,
        role: params.role === 'departure' ? 'departure' : 'arrival',
        planned: {
          implementId: params.overrideImplementId || null,
          driverUserId: params.overrideDriverUserId || null,
          implementCode: params.implementCode || null,
          driverName: params.driverName || null,
        },
      }}
    />
  );
}

function CaptureForm({ target }: { target: CaptureTarget }) {
  const machineId = target.machineId;
  const role: Exclude<ReadingRole, 'baseline'> = target.kind === 'stint' ? target.role : 'spot';
  const assignmentId = target.kind === 'stint' ? target.assignmentId : null;
  const returnTo = (
    target.kind === 'stint' ? `/contracting/jobs/${target.jobId}` : `/contracting/machines/${machineId}`
  ) as Href;
  const leave = () => router.dismissTo(returnTo);
  const navigation = useNavigation();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === machineId);
  const latestQuery = useLatestReading(machineId);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const [readAt, setReadAt] = useState<ReadAtChoice>(READ_AT_NOW);
  const proposal = readAtProposal(readAt);
  const scroll = useRef<ScrollViewInstance>(null);
  const readAtField = useRef<ReadAtFieldHandle>(null);
  const [value, setValue] = useState('');
  // Judged once typing stops, as web does: a half-typed value is not yet below the previous reading.
  const [valueFocused, setValueFocused] = useState(false);
  const [comment, setComment] = useState('');
  const voice = useVoiceSession({ business: 'contracting', purpose: 'capture comment' });
  const [disputedReadingId, setDisputedReadingId] = useState<string | null>(null);
  const overrides = useStintOverrides(target.kind === 'stint' ? target.planned : null);
  const { busy, error, run } = useBusyAction();
  const attempt = useRef<AttemptIdentity | null>(null);
  // Undefined while it loads: the request then names no latest, and the server judges against its own.
  const latest = latestQuery.canRead ? latestQuery.data : undefined;
  const stintOverrides = target.kind === 'stint' && target.role === 'arrival' ? overrides.value : undefined;
  const form = deriveCaptureForm(
    { latest, now: new Date() },
    { role, value, disputedReadingId, comment, readAt, stintOverrides },
  );
  const { parsed, below, disputable, disputeConfirmed, futureReadAt } = form;
  const readEarlier = () => {
    scroll.current?.scrollTo({ y: 0 });
    readAtField.current?.open();
  };
  const canSave = form.request !== null && canCapture && !!machine;
  function save() {
    const request = form.request;
    if (!canSave || voice.busy || !request) return;
    // Only what the Foreman entered: a reconnect refetches the latest, and a retry after it must still replay.
    attempt.current = captureAttempt(
      attempt.current,
      captureAttemptPayload({
        role,
        assignmentId,
        value: request.value,
        comment,
        disputedReadingId,
        stintOverrides: stintOverrides ?? null,
        readAt: readAtOf(readAt),
      }),
    );
    const { localId, attemptedAt } = attempt.current;
    const capturedAt = capturedAtFor(readAtOf(readAt), attemptedAt);
    const captured = {
      role,
      backdated: isBackdated(readAtOf(readAt), attemptedAt),
    };
    return run(async () => {
      try {
        await captureReading({
          localId,
          machineId,
          ...(assignmentId ? { assignmentId } : {}),
          ...request,
          capturedAt,
        });
      } catch (error) {
        // The busy action shows a refusal's sentence and reports anything else; the ledger's own refusals also refetch.
        if (error instanceof UploadRefusedError) {
          recordReadingCaptured({ ...captured, refused: error.data.appCode });
          // Nothing is saved until the person checks the time John Deere puts the value at and saves again.
          const { suggestedReadAt } = readingRefusalOf(error.data);
          setReadAt((current) => readAtAfterRefusal(current, suggestedReadAt));
          if (LEDGER_MOVED.has(error.data.appCode)) {
            setDisputedReadingId(null);
            void queryClient.invalidateQueries({
              queryKey: trpc.contractingReadings.latest.queryKey({ machineId }),
            });
          }
        }
        throw error;
      }
      recordReadingCaptured({ ...captured, refused: null });
      voice.reportSaved();
      // The screens underneath stay mounted, so they refetch in place: the form leaves without waiting on them.
      void queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() });
      if (navigation.isFocused()) leave();
    }, CAPTURE_FAILED);
  }
  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title={
            role === 'arrival' ? 'Capture arrival' : role === 'departure' ? 'Capture departure' : 'Capture reading'
          }
          subtitle={machine?.code ?? 'CONTRACTING'}
          parentLabel={target.kind === 'stint' ? 'Job' : 'Machine'}
          onBack={() => {
            if (!busy) leave();
          }}
          helpTopic="contractingMobileCapture"
        />
      }
      error={error}
      scrollRef={scroll}
      footer={
        <>
          {!canCapture ? <Text className="text-danger">Your role cannot capture readings.</Text> : null}
          {/* In the fixed footer, so the warning never pushes the form's fields while it comes and goes. */}
          {below && !valueFocused && latest ? (
            <View className="gap-3 rounded-xl border border-danger p-4">
              <Text className="text-foreground">{belowLatestSentence(latest)}</Text>
              <Button title="Read earlier…" onPress={readEarlier} disabled={busy} />
              {disputable ? (
                <Button
                  title={disputeConfirmed ? 'Previous reading disputed · undo' : 'The previous reading is wrong'}
                  onPress={() => setDisputedReadingId(disputeConfirmed ? null : latest.id)}
                  disabled={busy}
                />
              ) : null}
            </View>
          ) : null}
          <Button
            primary={canSave && !busy && !voice.busy}
            title={busy ? 'Saving…' : 'Save reading'}
            disabled={busy || voice.busy || !canSave}
            onPress={() => {
              void save();
            }}
          />
        </>
      }
    >
      <FieldShell
        label="When was the meter read?"
        errors={futureReadAt ? [{ message: captureRefusals['future-read-at'].message }] : []}
      >
        <ReadAtField
          ref={readAtField}
          choice={readAt}
          disabled={busy}
          hint={proposal ? readAtSuggestionSentence(proposal) : null}
          onChange={setReadAt}
        />
      </FieldShell>
      <FieldShell
        label={
          <View className="flex-row items-baseline justify-between gap-3">
            <FieldLabel>Current reading</FieldLabel>
            {latest ? (
              <Text className="text-xs text-muted-foreground">
                Previous reading:{' '}
                <Text className="text-xs text-primary" weight="semibold">
                  {formatHours(latest.value)}
                </Text>
                {readingProviderSuffix(latest.telematicsProvider)}
              </Text>
            ) : null}
          </View>
        }
        errors={
          !valueFocused && value && parsed === null
            ? [{ message: 'Enter a non-negative value with at most one decimal place.' }]
            : []
        }
      >
        <TextInput
          accessibilityLabel="Current reading"
          keyboardType="decimal-pad"
          placeholder="e.g. 1234.5"
          value={value}
          editable={!busy}
          onFocus={() => setValueFocused(true)}
          onBlur={() => setValueFocused(false)}
          onChangeText={(text) => {
            setValue(text);
            setDisputedReadingId(null);
            setReadAt(readAtAfterValueEdit);
          }}
        />
      </FieldShell>
      <FieldShell label={COMMENT_LABEL}>
        <VoiceTextArea
          accessibilityLabel={COMMENT_LABEL}
          placeholder="Anything management should know about this reading"
          editable={!busy}
          rows={COMMENT_ROWS}
          value={comment}
          onChangeText={setComment}
          maxLength={ReadingComment.maxLength ?? undefined}
          voice={voice}
        />
      </FieldShell>
      {target.kind === 'stint' && target.role === 'arrival' ? (
        <StintOverrideCard planned={target.planned} overrides={overrides} />
      ) : null}
    </FormPage>
  );
}

const COMMENT_LABEL = 'Comment (optional)';

const COMMENT_ROWS = 3;
