import { formatClock } from '@pkg/domain';
import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { IconMicrophone } from '@tabler/icons-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { textareaStyle } from '@/components/form/fields/TextareaField';
import { useScrollLock } from '@/components/scroll-lock';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { type AppTextInputProps, TextInput } from '@/components/ui/text-input';
import { recordVoiceNoteTranscribed } from '@/contracting/observability';
import { useSessionPermission } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import { TranscriptionRefusedError, transcribeRecording } from './transcribe-upload';
import { useVoiceRecorder } from './use-voice-recorder';
import type { VoiceSession } from './use-voice-session';
import { withTranscript } from './voice-text';

const UNAVAILABLE = 'Transcription unavailable — type the note.';
const MAX_CLOCK = formatClock(VOICE_NOTE_MAX_SECONDS);
const FRAMED_INPUT = { borderWidth: 0, backgroundColor: 'transparent' } as const;
// A held finger drifting off the small mic must not end the note; only lifting it does.
const HOLD_RETENTION = 1000;

type Props = Omit<AppTextInputProps, 'value' | 'onChangeText' | 'multiline'> & {
  value: string;
  onChangeText: (text: string) => void;
  voice: VoiceSession;
  rows?: number;
};

/**
 * Contracting's multi-line text area. Online, for a role that may use voice notes, it carries a press-and-hold mic
 * whose transcript is appended to the text; offline it is a plain text area. The web build shows the mic, but a press
 * only says it cannot record there.
 */
export function VoiceTextArea({ value, onChangeText, voice, rows = 4, editable = true, style, ...inputProps }: Props) {
  const canUse = useSessionPermission('contracting_transcription:use');
  const offline = useIsOffline();
  const recorder = useVoiceRecorder();
  const lockScroll = useScrollLock();
  const [holding, setHolding] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The transcript lands after typing may have carried on, so it appends to the latest text.
  const latest = useRef(value);
  latest.current = value;
  const showMic = canUse && !offline && editable;
  const busy = holding || transcribing;
  const { setBusy } = voice;
  const { stop } = recorder;
  // The page's scroll lock is shared, so only the field that took it releases it.
  const scrollHeld = useRef(false);
  const holdScroll = useCallback(
    (held: boolean) => {
      if (scrollHeld.current === held) return;
      scrollHeld.current = held;
      lockScroll(held);
    },
    [lockScroll],
  );

  useEffect(() => {
    setBusy(busy);
  }, [busy, setBusy]);
  useEffect(() => () => setBusy(false), [setBusy]);
  useEffect(() => () => holdScroll(false), [holdScroll]);
  // The mic can vanish mid-hold (the signal drops, the form locks) and its release then never fires: stop and drop it.
  useEffect(() => {
    if (showMic || !holding) return;
    holdScroll(false);
    setHolding(false);
    void stop().catch(() => null);
  }, [showMic, holding, stop, holdScroll]);

  async function startRecording() {
    if (transcribing) return;
    setMessage(null);
    // Locked in the press itself, not an effect: a drag in the frames between would let the page take the touch.
    holdScroll(true);
    setHolding(true);
    const started = await recorder.start().catch(() => 'failed' as const);
    if (started !== 'recording') {
      holdScroll(false);
      setHolding(false);
    }
    if (started === 'allowed') setMessage('Microphone allowed. Hold the mic while you speak.');
    if (started === 'denied') setMessage('Allow the microphone in Settings to record voice notes.');
    if (started === 'unsupported') setMessage('Voice notes are not supported in the browser — use the app.');
    if (started === 'failed') setMessage(UNAVAILABLE);
  }

  async function finishRecording() {
    holdScroll(false);
    if (transcribing) return;
    const recording = await recorder.stop().catch(() => null);
    setTranscribing(recording !== null);
    setHolding(false);
    if (!recording) return;
    const observed = { purpose: voice.purpose, seconds: recording.seconds };
    try {
      const transcription = await transcribeRecording(recording.uri, voice.purpose);
      onChangeText(withTranscript(latest.current, transcription.text, inputProps.maxLength));
      voice.remember(transcription);
      recordVoiceNoteTranscribed({ ...observed, language: transcription.language, outcome: 'transcribed' });
    } catch (error) {
      const refused = error instanceof TranscriptionRefusedError;
      setMessage(refused ? error.message : UNAVAILABLE);
      recordVoiceNoteTranscribed({ ...observed, language: null, outcome: refused ? 'refused' : 'failed' });
    } finally {
      setTranscribing(false);
    }
  }

  const status = transcribing
    ? 'Transcribing…'
    : recorder.recording
      ? `Recording ${formatClock(recorder.seconds)} / ${MAX_CLOCK} · release to stop`
      : (message ?? 'Hold to record a voice note');

  const input = (
    <TextInput
      {...inputProps}
      value={value}
      onChangeText={onChangeText}
      editable={editable && !transcribing}
      multiline
      numberOfLines={rows}
      textAlignVertical="top"
      style={[textareaStyle(rows), showMic ? FRAMED_INPUT : null, style]}
    />
  );
  if (!showMic) return input;

  // The input drops its own frame so it and the mic row read as one field, mic in the bottom-right corner.
  return (
    <View className={`rounded-xl border bg-surface ${recorder.recording ? 'border-danger' : 'border-border'}`}>
      {input}
      <View className="flex-row items-center gap-3 pb-2 pl-3 pr-2">
        <Text accessibilityLiveRegion="polite" className="flex-1 text-xs text-muted-foreground">
          {status}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to record a voice note"
          accessibilityState={{ busy, disabled: transcribing }}
          disabled={transcribing}
          hitSlop={8}
          cancelable={false}
          pressRetentionOffset={HOLD_RETENTION}
          onPressIn={() => void startRecording()}
          onPressOut={() => void finishRecording()}
          className={`h-10 w-10 items-center justify-center rounded-full ${recorder.recording ? 'bg-danger/15' : 'bg-foreground/10'}`}
        >
          <Icon icon={IconMicrophone} className={recorder.recording ? 'text-danger' : 'text-foreground'} size={24} />
        </Pressable>
      </View>
    </View>
  );
}
