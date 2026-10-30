import {
  CAPTURE_VALUE_INVALID,
  HOURS_EDIT_REASON_REQUIRED,
  hoursEditNeedsReason,
  johnDeereDifference,
  johnDeereDifferenceWarning,
  johnDeereLine,
  judgeStintHours,
  parseCaptureValue,
} from '@pkg/domain/contracting';
import { type AssignmentDetail, type JobDetail, ReadingComment, ReadingReason } from '@pkg/schema/contracting';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { FormPage } from '@/components/FormPage';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { StintOverrideCard, useStintOverrides } from '@/contracting/components/StintOverrideCard';
import { useLatestTelematics } from '@/contracting/readings/use-fleet';
import { useBusyAction } from '@/lib/use-busy-action';
import { useJob, useStintHoursWrites } from './use-jobs';

type Mode = 'arrival' | 'departure' | 'edit';
const TITLES: Record<Mode, string> = {
  arrival: 'Capture arrival',
  departure: 'Capture departure',
  edit: 'Edit hours',
};
const SAVE_FAILED = 'Could not save the hours. Check your connection and try again.';
const COMMENT_ROWS = 3;
const commentOrNull = (comment: string) => comment.trim() || null;
const typed = (hours: number | undefined) => (hours === undefined ? '' : String(hours));

/** `/contracting/jobs/[jobId]/capture`: a stint's arrival or departure hours, or an edit of both. */
export default function StintHoursScreen() {
  const params = useLocalSearchParams<{ jobId: string; assignmentId: string; role?: string; mode?: string }>();
  const mode: Mode = params.mode === 'edit' ? 'edit' : params.role === 'departure' ? 'departure' : 'arrival';
  const jobQuery = useJob(params.jobId);
  const job = jobQuery.data;
  const stint = job?.assignments.find((assignment) => assignment.id === params.assignmentId);
  const leave = () => router.dismissTo(`/contracting/jobs/${params.jobId}` as Href);
  const toolbar = (
    <SecondaryToolbar
      title={TITLES[mode]}
      subtitle={stint?.machineCode ?? 'CONTRACTING'}
      parentLabel="Job"
      onBack={leave}
      helpTopic="contractingMobileJobHours"
    />
  );
  if (!job || !stint)
    return (
      <FormPage toolbar={toolbar} error={null} footer={null}>
        <Text className="text-muted-foreground">
          {jobQuery.gone ? (jobQuery.goneReason ?? 'This Job is no longer open.') : 'Loading Job…'}
        </Text>
      </FormPage>
    );
  return mode === 'edit' ? (
    <EditHours job={job} stint={stint} toolbar={toolbar} onSaved={leave} />
  ) : (
    <CaptureHours side={mode} job={job} stint={stint} toolbar={toolbar} onSaved={leave} />
  );
}

type FormProps = { job: JobDetail; stint: AssignmentDetail; toolbar: ReactNode; onSaved: () => void };

function CaptureHours({ side, job, stint, toolbar, onSaved }: FormProps & { side: 'arrival' | 'departure' }) {
  const writes = useStintHoursWrites();
  const { busy, error, run } = useBusyAction();
  const [hours, setHours] = useState('');
  const [comment, setComment] = useState('');
  const voice = useVoiceSession({ business: 'contracting', purpose: 'capture comment' });
  const planned = {
    implementId: stint.implementId,
    driverUserId: stint.driverUserId,
    implementCode: stint.implementCode,
    driverName: stint.driverName,
  };
  const overrides = useStintOverrides(side === 'arrival' ? planned : null);
  const parsed = parseCaptureValue(hours);
  const refusal =
    side === 'departure' && stint.arrival && parsed !== null
      ? judgeStintHours({ arrival: stint.arrival.hours, departure: parsed })
      : null;
  const canSave = parsed !== null && refusal?.ok !== false && !busy && !voice.busy;
  const save = () => {
    if (!canSave || parsed === null) return;
    void run(async () => {
      await writes.capture.mutateAsync({
        assignmentId: stint.id,
        role: side,
        hours: parsed,
        comment: commentOrNull(comment),
        ...(side === 'arrival' && overrides.value ? { stintOverrides: overrides.value } : {}),
      });
      voice.reportSaved();
      onSaved();
    }, SAVE_FAILED);
  };
  return (
    <FormPage
      toolbar={toolbar}
      error={error}
      footer={<Button primary={canSave} title={busy ? 'Saving…' : 'Save'} disabled={!canSave} onPress={save} />}
    >
      <HoursField
        label={side === 'arrival' ? 'Arrival hours' : 'Departure hours'}
        value={hours}
        onChange={setHours}
        editable={!busy}
        machineId={stint.machineId}
        threshold={job.johnDeereDifferenceThresholdHours}
        refusal={refusal?.ok === false ? refusal.refusal.message : null}
      />
      <FieldShell label="Comment (optional)">
        <VoiceTextArea
          accessibilityLabel="Comment (optional)"
          placeholder="Anything management should know about these hours"
          editable={!busy}
          rows={COMMENT_ROWS}
          value={comment}
          onChangeText={setComment}
          maxLength={ReadingComment.maxLength ?? undefined}
          voice={voice}
        />
      </FieldShell>
      {side === 'arrival' ? <StintOverrideCard planned={planned} overrides={overrides} /> : null}
    </FormPage>
  );
}

function EditHours({ job, stint, toolbar, onSaved }: FormProps) {
  const writes = useStintHoursWrites();
  const { busy, error, run } = useBusyAction();
  const [arrival, setArrival] = useState(typed(stint.arrival?.hours));
  const [departure, setDeparture] = useState(typed(stint.departure?.hours));
  const [arrivalComment, setArrivalComment] = useState(stint.arrival?.comment ?? '');
  const [departureComment, setDepartureComment] = useState(stint.departure?.comment ?? '');
  const [reason, setReason] = useState('');
  const needsReason = hoursEditNeedsReason(job.status);
  const arrivalHours = parseCaptureValue(arrival);
  const departureHours = stint.departure ? parseCaptureValue(departure) : null;
  const verdict = arrivalHours === null ? null : judgeStintHours({ arrival: arrivalHours, departure: departureHours });
  const canSave =
    verdict?.ok === true &&
    (!stint.departure || departureHours !== null) &&
    (!needsReason || ReadingReason.safeParse(reason).success) &&
    !busy;
  const save = () => {
    if (!canSave || arrivalHours === null) return;
    void run(async () => {
      await writes.edit.mutateAsync({
        assignmentId: stint.id,
        arrivalHours,
        departureHours,
        arrivalComment: commentOrNull(arrivalComment),
        departureComment: stint.departure ? commentOrNull(departureComment) : undefined,
        ...(needsReason ? { reason: reason.trim() } : {}),
      });
      onSaved();
    }, SAVE_FAILED);
  };
  return (
    <FormPage
      toolbar={toolbar}
      error={error}
      footer={<Button primary={canSave} title={busy ? 'Saving…' : 'Save'} disabled={!canSave} onPress={save} />}
    >
      <HoursField
        label="Arrival hours"
        value={arrival}
        onChange={setArrival}
        editable={!busy}
        machineId={stint.machineId}
        threshold={job.johnDeereDifferenceThresholdHours}
        refusal={null}
      />
      <CommentInput
        label="Arrival comment (optional)"
        value={arrivalComment}
        onChange={setArrivalComment}
        busy={busy}
      />
      {stint.departure ? (
        <>
          <HoursField
            label="Departure hours"
            value={departure}
            onChange={setDeparture}
            editable={!busy}
            machineId={stint.machineId}
            threshold={job.johnDeereDifferenceThresholdHours}
            refusal={verdict?.ok === false ? verdict.refusal.message : null}
          />
          <CommentInput
            label="Departure comment (optional)"
            value={departureComment}
            onChange={setDepartureComment}
            busy={busy}
          />
        </>
      ) : null}
      {needsReason ? (
        <FieldShell label="Reason">
          <TextInput
            accessibilityLabel="Reason"
            placeholder={HOURS_EDIT_REASON_REQUIRED}
            value={reason}
            editable={!busy}
            onChangeText={setReason}
            multiline
          />
        </FieldShell>
      ) : null}
    </FormPage>
  );
}

/** The hours input, John Deere's latest report under it for a linked Machine, and the amber warning when far off. */
function HoursField({
  label,
  value,
  onChange,
  editable,
  machineId,
  threshold,
  refusal,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
  machineId: string;
  threshold: number;
  refusal: string | null;
}) {
  const telematics = useLatestTelematics(machineId).data ?? null;
  const parsed = parseCaptureValue(value);
  const difference = parsed === null ? null : johnDeereDifference(parsed, telematics, threshold);
  const now = new Date();
  const errors = refusal ? [refusal] : value.trim() && parsed === null ? [CAPTURE_VALUE_INVALID] : [];
  return (
    <FieldShell label={label} errors={errors.map((message) => ({ message }))}>
      <TextInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        placeholder="e.g. 1234.5"
        value={value}
        editable={editable}
        onChangeText={onChange}
      />
      {telematics ? <Text className="text-xs text-muted-foreground">{johnDeereLine(telematics, now)}</Text> : null}
      {telematics && difference?.over ? (
        <View className="rounded-xl border border-warning bg-warning/10 px-4 py-3">
          <Text className="text-foreground">{johnDeereDifferenceWarning(difference.hours, telematics, now)}</Text>
        </View>
      ) : null}
    </FieldShell>
  );
}

function CommentInput({
  label,
  value,
  onChange,
  busy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <FieldShell label={label}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        editable={!busy}
        onChangeText={onChange}
        maxLength={ReadingComment.maxLength ?? undefined}
        multiline
      />
    </FieldShell>
  );
}
