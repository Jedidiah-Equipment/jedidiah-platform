import { formatHours } from '@pkg/domain';
import {
  CAPTURE_STEPS_START,
  CAPTURE_VALUE_INVALID,
  type CaptureFormVerdict,
  type CaptureStepAction,
  type CaptureWhen,
  capturedAtFor,
  captureRefusals,
  captureStepsReducer,
  deriveCaptureForm,
  isBackdated,
  ledgerMoved,
  parseCaptureValue,
  readingProviderSuffix,
} from '@pkg/domain/contracting';
import { ReadingComment, readingRefusalOf } from '@pkg/schema/contracting';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { type Dispatch, type RefObject, useReducer, useRef, useState } from 'react';
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
import { recordReadingCaptured } from '@/contracting/observability';
import { type AttemptIdentity, captureAttempt, captureAttemptPayload } from '@/contracting/readings/capture-attempt';
import { CAPTURE_FAILED, captureReading } from '@/contracting/readings/reading-upload';
import { useFleet, useLatestReading, useReadAtEstimate } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { UploadRefusedError } from '@/lib/multipart-upload';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

/** `/contracting/machines/[id]/capture`: a spot reading from the Machine screen. Job Hours are captured from the Job. */
export default function MachineCaptureScreen() {
  const { id: machineId } = useLocalSearchParams<{ id: string }>();
  const leave = () => router.dismissTo(`/contracting/machines/${machineId}` as Href);
  const navigation = useNavigation();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === machineId);
  const latestQuery = useLatestReading(machineId);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const [steps, dispatch] = useReducer(captureStepsReducer, CAPTURE_STEPS_START);
  const scroll = useRef<ScrollViewInstance>(null);
  const readAtField = useRef<ReadAtFieldHandle>(null);
  const [value, setValue] = useState('');
  // Judged once typing stops, as web does: a half-typed value is not yet a wrong one.
  const [valueFocused, setValueFocused] = useState(false);
  const [comment, setComment] = useState('');
  const voice = useVoiceSession({ business: 'contracting', purpose: 'capture comment' });
  const { busy, error, run } = useBusyAction();
  const attempt = useRef<AttemptIdentity | null>(null);
  const estimateQuery = useReadAtEstimate(machineId, parseCaptureValue(value));
  const { estimate } = estimateQuery;
  const latest = latestQuery.canRead ? latestQuery.data : undefined;
  const form = deriveCaptureForm({ now: new Date() }, { value, estimate, ...steps, comment });
  const { parsed, date, request, answers } = form;
  const readAt = date?.readAt ?? null;
  const canSave = request !== null && canCapture && !!machine;
  function save() {
    if (!canSave || voice.busy || !request || !answers) return;
    // Only what the Foreman entered: a reconnect refetches the latest, and a retry after it must still replay.
    attempt.current = captureAttempt(attempt.current, captureAttemptPayload({ value: request.value, comment, readAt }));
    const { localId, attemptedAt } = attempt.current;
    const capturedAt = capturedAtFor(readAt, attemptedAt);
    const captured = { backdated: isBackdated(readAt, attemptedAt), ...answers };
    return run(async () => {
      try {
        await captureReading({ localId, machineId, ...request, capturedAt });
      } catch (error) {
        // The busy action shows a refusal's sentence and reports anything else; the ledger's own refusals also refetch.
        if (error instanceof UploadRefusedError) {
          const code = error.data.appCode;
          recordReadingCaptured({ ...captured, refused: code });
          // Nothing is saved until the person checks the date the ledger puts the value at and saves again.
          dispatch({ type: 'refused', proposal: readingRefusalOf(error.data).suggestedReadAt });
          if (ledgerMoved(code)) {
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
          title="Capture reading"
          subtitle={machine?.code ?? 'CONTRACTING'}
          parentLabel="Machine"
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
              onPress={() => dispatch({ type: 'date-confirmed', verdict: form })}
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
      <WhenButtons when={steps.when} disabled={busy} onChoose={(when) => dispatch({ type: 'when', when })} />
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
              dispatch({ type: 'value-edited' });
            }}
          />
          <EstimateLine
            line={form.estimateLine}
            impossible={estimate?.kind === 'impossible'}
            working={estimateQuery.working}
            failed={estimateQuery.error !== null}
          />
        </FieldShell>
      ) : null}
      {date ? <DateStep form={form} busy={busy} readAtField={readAtField} dispatch={dispatch} /> : null}
      {form.step === 'details' ? (
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

/** Step 3: the date to vouch for and its warnings. */
function DateStep({
  form,
  busy,
  readAtField,
  dispatch,
}: {
  form: CaptureFormVerdict;
  busy: boolean;
  readAtField: RefObject<ReadAtFieldHandle | null>;
  dispatch: Dispatch<CaptureStepAction>;
}) {
  const { date } = form;
  if (!date) return null;
  return (
    <FieldShell label="Date" errors={date.futureReadAt ? [{ message: captureRefusals['future-read-at'].message }] : []}>
      {date.locked ? (
        <Text className="text-foreground" weight="semibold">
          {date.line}
        </Text>
      ) : date.open ? (
        <ReadAtField
          ref={readAtField}
          value={date.readAt}
          onPick={(at) => dispatch({ type: 'date-picked', readAt: at })}
          disabled={busy}
        />
      ) : (
        <Button title={date.line} onPress={() => dispatch({ type: 'date-opened' })} disabled={busy} />
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
    </FieldShell>
  );
}

const COMMENT_LABEL = 'Comment (optional)';

const COMMENT_ROWS = 3;
