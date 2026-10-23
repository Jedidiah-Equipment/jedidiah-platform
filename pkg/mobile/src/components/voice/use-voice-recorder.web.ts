import type { VoiceRecorder } from './use-voice-recorder';

const unsupported: VoiceRecorder = {
  recording: false,
  seconds: 0,
  capped: false,
  start: async () => 'unsupported',
  stop: async () => null,
};

/** The mobile web build cannot record: the mic still shows, and a press explains that voice notes need the app. */
export function useVoiceRecorder(): VoiceRecorder {
  return unsupported;
}
