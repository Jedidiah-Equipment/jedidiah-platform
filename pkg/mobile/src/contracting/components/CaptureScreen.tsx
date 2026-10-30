import { formatHours } from '@pkg/domain';
import {
  CAPTURE_STEPS_START,
  CAPTURE_VALUE_INVALID,
  type CaptureFormVerdict,
  type CaptureSteps,
  type CaptureWhen,
  capturedAtFor,
  captureRefusals,
  confirmCaptureDate,
  deriveCaptureForm,
  isBackdated,
  parseCaptureValue,
  readingProviderSuffix,
  stepsAfterReadEarlier,
  stepsAfterRefusal,
  stepsAfterValueEdit,
  stepsAfterWhen,
} from '@pkg/domain/contracting';
import { ReadingComment, type ReadingErrorCode, type ReadingRole, readingRefusalOf } from '@pkg/schema/contracting';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { type RefObject, useRef, useState } from 'react';
import { Pressable, type ScrollViewInstance, View } from 'react-native';
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
import { useFleet, useLatestReading, useReadAtEstimate } from '@/contracting/readings/use-fleet';
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
  const [steps, setSteps] = useState<CaptureSteps>(CAPTURE_STEPS_START);
  const scroll = useRef<ScrollViewInstance>(null);
  const readAtField = useRef<ReadAtFieldHandle>(null);
  const [value, setValue] = useState('');
  // Judged once typing stops, as web does: a half-typed value is not yet a wrong one.
  const [valueFocused, setValueFocused] = useState(false);
  const [comment, setComment] = useState('');
  const voice = useVoiceSession({ business: 'contracting', purpose: 'capture comment' });
  const overrides = useStintOverrides(target.kind === 'stint' ? target.planned : null);
  const { busy, error, run } = useBusyAction();
  const attempt = useRef<AttemptIdentity | null>(null);
  const estimateQuery = useReadAtEstimate({ machineId, role, assignmentId }, parseCaptureValue(value));
  const { estimate } = estimateQuery;
  // Undefined while it loads: the request then names no latest, and the server judges against its own.
  const latest = latestQuery.canRead ? latestQuery.data : undefined;
  const stintOverrides = target.kind === 'stint' && target.role === 'arrival' ? overrides.value : undefined;
  const form = deriveCaptureForm(
    { latest, now: new Date() },
    { role, value, estimate, ...steps, comment, stintOverrides },
  );
  const { parsed, date } = form;
  const readAt = date?.readAt ?? null;
  const readEarlier = () => {
    const next = stepsAfterReadEarlier(steps, estimate);
    setSteps(next);
    // No date to read at: the picker opens on its own once it shows.
    if (next.dateOpened && !steps.dateOpened) requestAnimationFrame(() => readAtField.current?.open());
  };
  const canSave = form.request !== null && canCapture && !!machine;
  function save() {
    const request = form.request;
    if (!canSave || voice.busy || !request || !steps.when || !estimate) return;
    // Only what the Foreman entered: a reconnect refetches the latest, and a retry after it must still replay.
    attempt.current = captureAttempt(
      attempt.current,
      captureAttemptPayload({
        role,
        assignmentId,
        value: request.value,
        comment,
        disputedReadingId: steps.disputedReadingId,
        stintOverrides: stintOverrides ?? null,
        readAt,
      }),
    );
    const { localId, attemptedAt } = attempt.current;
    const capturedAt = capturedAtFor(readAt, attemptedAt);
    const captured = {
      role,
      backdated: isBackdated(readAt, attemptedAt),
      when: steps.when,
      estimateKind: estimate.kind,
      dateEdited: date?.source === 'picked',
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
          // Nothing is saved until the person checks the date the ledger puts the value at and saves again.
          setSteps((current) => stepsAfterRefusal(current, readingRefusalOf(error.data).suggestedReadAt));
          if (LEDGER_MOVED.has(error.data.appCode)) {
            setSteps((current) => ({ ...current, disputedReadingId: null }));
            void queryClient.invalidateQueries({
              queryKey: trpc.contractingReadings.latest.queryKey({ machineId }),
            });
            void queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.estimateReadAt.pathKey() });
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
          {form.step === 'date' && date ? (
            <Button
              primary={date.confirmable && !busy}
              title="Date looks good"
              disabled={busy || !date.confirmable}
              onPress={() => setSteps((current) => ({ ...current, dateConfirmed: confirmCaptureDate(form) }))}
            />
          ) : form.step === 'details' ? (
            <Button
              primary={canSave && !busy && !voice.busy}
              title={busy ? 'Saving…' : 'Save reading'}
              disabled={busy || voice.busy || !canSave}
              onPress={() => {
                void save();
              }}
            />
          ) : null}
        </>
      }
    >
      <WhenButtons
        when={steps.when}
        disabled={busy}
        onChoose={(when) => setSteps((current) => stepsAfterWhen(current, when))}
      />
      {form.step !== 'when' ? (
        <FieldShell
          label={
            <View className="flex-row items-baseline justify-between gap-3">
              <FieldLabel>Hours on the meter</FieldLabel>
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
          errors={!valueFocused && value && parsed === null ? [{ message: CAPTURE_VALUE_INVALID }] : []}
        >
          <TextInput
            accessibilityLabel="Hours on the meter"
            keyboardType="decimal-pad"
            placeholder="e.g. 1234.5"
            value={value}
            editable={!busy}
            onFocus={() => setValueFocused(true)}
            onBlur={() => setValueFocused(false)}
            onChangeText={(text) => {
              setValue(text);
              setSteps(stepsAfterValueEdit);
            }}
          />
          <EstimateLine
            line={form.estimateLine}
            impossible={estimate?.kind === 'impossible'}
            working={estimateQuery.working}
            failed={estimateQuery.isError}
          />
        </FieldShell>
      ) : null}
      {date ? (
        <DateStep
          form={form}
          busy={busy}
          readAtField={readAtField}
          onOpen={() => setSteps((current) => ({ ...current, dateOpened: true }))}
          onPick={(at) => setSteps((current) => ({ ...current, pickedReadAt: at }))}
          onReadEarlier={readEarlier}
          onDispute={(readingId) => setSteps((current) => ({ ...current, disputedReadingId: readingId }))}
        />
      ) : null}
      {form.step === 'details' ? (
        <>
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
        </>
      ) : null}
    </FormPage>
  );
}

/** Step 1: two halves, neither chosen until the person says. */
function WhenButtons({
  when,
  disabled,
  onChoose,
}: {
  when: CaptureWhen | null;
  disabled: boolean;
  onChoose: (when: CaptureWhen) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-base text-foreground" weight="semibold">
        When was the meter read?
      </Text>
      <View className="flex-row gap-2">
        {(['today', 'earlier'] as const).map((choice) => {
          const chosen = when === choice;
          return (
            <Pressable
              key={choice}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen, disabled }}
              disabled={disabled}
              onPress={() => onChoose(choice)}
              className={`min-h-14 flex-1 items-center justify-center rounded-xl border ${
                chosen ? 'border-primary bg-primary' : 'border-border bg-surface active:bg-muted'
              }`}
            >
              <Text className={chosen ? 'text-primary-foreground' : 'text-surface-foreground'} weight="semibold">
                {choice === 'today' ? 'Today' : 'Earlier'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function EstimateLine({
  line,
  impossible,
  working,
  failed,
}: {
  line: string | null;
  impossible: boolean;
  working: boolean;
  failed: boolean;
}) {
  if (working) return <Text className="text-xs text-muted-foreground">Working out the date…</Text>;
  if (failed) return <Text className="text-xs text-danger">Unable to work out when the meter was read.</Text>;
  if (!line) return null;
  return <Text className={impossible ? 'text-sm text-danger' : 'text-xs text-muted-foreground'}>{line}</Text>;
}

/** Step 3: the date to vouch for, its warnings, and below a human latest the fork between reading earlier and disputing. */
function DateStep({
  form,
  busy,
  readAtField,
  onOpen,
  onPick,
  onReadEarlier,
  onDispute,
}: {
  form: CaptureFormVerdict;
  busy: boolean;
  readAtField: RefObject<ReadAtFieldHandle | null>;
  onOpen: () => void;
  onPick: (at: Date | null) => void;
  onReadEarlier: () => void;
  onDispute: (readingId: string | null) => void;
}) {
  const { date } = form;
  if (!date) return null;
  return (
    <FieldShell label="Date" errors={form.futureReadAt ? [{ message: captureRefusals['future-read-at'].message }] : []}>
      {date.awaitsFork ? null : date.locked ? (
        <Text className="text-foreground" weight="semibold">
          {date.line}
        </Text>
      ) : date.open ? (
        <ReadAtField ref={readAtField} value={date.readAt} onPick={onPick} disabled={busy} />
      ) : (
        <Button title={date.line} onPress={onOpen} disabled={busy} />
      )}
      {date.warningLines.length ? (
        <View className="gap-2 rounded-xl border border-warning p-4">
          {date.warningLines.map((line) => (
            <Text className="text-foreground" key={line}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {date.dispute ? (
        <View className="gap-3 rounded-xl border border-danger p-4">
          <Text className="text-foreground">{date.dispute.sentence}</Text>
          {date.dispute.confirmed ? (
            <Button title="Previous reading disputed · undo" onPress={() => onDispute(null)} disabled={busy} />
          ) : (
            <>
              <Button title="Read earlier" onPress={onReadEarlier} disabled={busy} />
              <Button
                title="The previous reading is wrong"
                onPress={() => onDispute(date.dispute?.readingId ?? null)}
                disabled={busy}
              />
            </>
          )}
        </View>
      ) : null}
    </FieldShell>
  );
}

const COMMENT_LABEL = 'Comment (optional)';

const COMMENT_ROWS = 3;
