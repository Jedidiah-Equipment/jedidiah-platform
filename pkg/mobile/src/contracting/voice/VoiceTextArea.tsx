import { IconMicrophone } from '@tabler/icons-react-native';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { textareaStyle } from '@/components/form/fields/TextareaField';
import { useScrollLock } from '@/components/scroll-lock';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { type AppTextInputProps, TextInput } from '@/components/ui/text-input';
import { useSessionPermission } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import type { VoiceSession } from './use-voice-session';
import { VoiceFrame } from './VoiceFrame';

const FRAMED_INPUT = { borderWidth: 0, backgroundColor: 'transparent' } as const;
// A held finger drifting off the small mic must not end the note; only lifting it does.
const HOLD_RETENTION = 1000;

type Props = Omit<AppTextInputProps, 'value' | 'onChangeText' | 'maxLength' | 'multiline'> & {
  voice: VoiceSession;
  rows?: number;
};

/**
 * Contracting's multi-line text area over a voice session, which owns its text. Online, for a role that may use
 * voice notes, it carries a press-and-hold mic whose transcript is appended to the text; offline it is a plain text
 * area. The web build shows the mic, but a press only says it cannot record there.
 */
export function VoiceTextArea({ voice, rows = 4, editable = true, style, ...inputProps }: Props) {
  const canUse = useSessionPermission('contracting_transcription:use');
  const offline = useIsOffline();
  const showMic = canUse && !offline && editable;
  const { busy, cancel } = voice;
  // The page's scroll lock is shared, so only the field that took it releases it.
  const lockScroll = useScrollLock();
  const scrollHeld = useRef(false);
  const holdScroll = useCallback(
    (held: boolean) => {
      if (scrollHeld.current === held) return;
      scrollHeld.current = held;
      lockScroll(held);
    },
    [lockScroll],
  );
  // A press the recorder could not take ends without a release; the lock goes with the hold either way.
  useEffect(() => {
    if (!busy) holdScroll(false);
  }, [busy, holdScroll]);
  // The mic can vanish mid-hold (the signal drops, the form locks) and its release then never fires: drop the note.
  useEffect(() => {
    if (showMic) return;
    holdScroll(false);
    cancel();
  }, [showMic, holdScroll, cancel]);
  useEffect(
    () => () => {
      holdScroll(false);
      cancel();
    },
    [holdScroll, cancel],
  );

  const input = (
    <TextInput
      {...inputProps}
      value={voice.value}
      onChangeText={voice.onChangeText}
      maxLength={voice.maxLength}
      editable={editable && !voice.transcribing}
      multiline
      numberOfLines={rows}
      textAlignVertical="top"
      style={[textareaStyle(rows), showMic ? FRAMED_INPUT : null, style]}
    />
  );
  if (!showMic) return input;

  // The input drops its own frame so it and the mic row read as one field, mic in the bottom-right corner.
  return (
    <VoiceFrame animating={voice.listening || voice.transcribing}>
      {input}
      <View className="flex-row items-center gap-3 pb-2 pl-3 pr-2">
        <Text accessibilityLiveRegion="polite" className="flex-1 text-xs text-muted-foreground">
          {voice.status}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to record a voice note"
          accessibilityState={{ busy: voice.busy, disabled: voice.transcribing }}
          disabled={voice.transcribing}
          hitSlop={8}
          cancelable={false}
          pressRetentionOffset={HOLD_RETENTION}
          onPressIn={() => {
            // Locked in the press itself, not an effect: a drag in the frames between would let the page take the touch.
            holdScroll(true);
            voice.onPressIn();
          }}
          onPressOut={() => {
            holdScroll(false);
            voice.onPressOut();
          }}
          className={`h-10 w-10 items-center justify-center rounded-full ${voice.listening ? 'bg-primary/15' : 'bg-foreground/10'}`}
        >
          <Icon icon={IconMicrophone} className={voice.listening ? 'text-primary' : 'text-foreground'} size={24} />
        </Pressable>
      </View>
    </VoiceFrame>
  );
}
