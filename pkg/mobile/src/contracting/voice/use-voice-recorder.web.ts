import type { VoiceRecorder } from './use-voice-recorder';

const unsupported: VoiceRecorder = {
  supported: false,
  recording: false,
  seconds: 0,
  start: async () => 'denied',
  stop: async () => null,
};

/** The mobile web build has no voice notes: the control is a plain text area there. */
export function useVoiceRecorder(): VoiceRecorder {
  return unsupported;
}
