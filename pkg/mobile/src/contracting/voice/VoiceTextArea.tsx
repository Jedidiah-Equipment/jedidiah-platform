import { formatClock } from '@pkg/domain';
import { VOICE_NOTE_MAX_SECONDS } from '@pkg/domain/contracting';
import { IconMicrophone } from '@tabler/icons-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { textareaStyle } from '@/components/form/fields/TextareaField';
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

type Props = Omit<AppTextInputProps, 'value' | 'onChangeText' | 'multiline'> & {
  value: string;
  onChangeText: (text: string) => void;
  voice: VoiceSession;
  rows?: number;
};

/**
 * Contracting's multi-line text area. Online, for a role that may use voice notes, it carries a press-and-hold mic
 * whose transcript is appended to the text; offline and on the web it is a plain text area.
 */
export function VoiceTextArea({ value, onChangeText, voice, rows = 4, editable = true, style, ...inputProps }: Props) {
  const canUse = useSessionPermission('contracting_transcription:use');
  const offline = useIsOffline();
  const recorder = useVoiceRecorder();
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The transcript lands after typing may have carried on, so it appends to the latest text.
  const latest = useRef(value);
  latest.current = value;
  const showMic = canUse && !offline && recorder.supported && editable;
  const busy = transcribing || recorder.recording;

  async function startRecording() {
    if (transcribing) return;
    setMessage(null);
    const started = await recorder.start().catch(() => 'failed' as const);
    if (started === 'allowed') setMessage('Microphone allowed. Hold the mic while you speak.');
    if (started === 'denied') setMessage('Allow the microphone in Settings to record voice notes.');
    if (started === 'failed') setMessage(UNAVAILABLE);
  }

  async function finishRecording() {
    if (transcribing) return;
    const recording = await recorder.stop().catch(() => null);
    if (!recording) return;
    setTranscribing(true);
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

  return (
    <View className="gap-2">
      <TextInput
        {...inputProps}
        value={value}
        onChangeText={onChangeText}
        editable={editable && !transcribing}
        multiline
        numberOfLines={rows}
        textAlignVertical="top"
        style={[textareaStyle(rows), style]}
      />
      {showMic ? (
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold to record a voice note"
            accessibilityState={{ busy, disabled: transcribing }}
            disabled={transcribing}
            onPressIn={() => void startRecording()}
            onPressOut={() => void finishRecording()}
            className={`h-11 w-11 items-center justify-center rounded-full border ${recorder.recording ? 'border-danger bg-danger/10' : 'border-border bg-surface'}`}
          >
            <Icon icon={IconMicrophone} className={recorder.recording ? 'text-danger' : 'text-foreground'} size={22} />
          </Pressable>
          <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-muted-foreground">
            {status}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
