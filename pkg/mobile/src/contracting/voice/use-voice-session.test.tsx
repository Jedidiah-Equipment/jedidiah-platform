import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn());
const recorder = vi.hoisted(() => ({ started: 'recording', capped: false }));
const stop = vi.hoisted(() => vi.fn(async (): Promise<VoiceRecording | null> => null));
const transcribe = vi.hoisted(() => vi.fn());
const observability = vi.hoisted(() => ({
  recordVoiceNoteFailed: vi.fn(),
  recordVoiceNoteTranscribed: vi.fn(),
  recordVoiceRecorderFailed: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useMutation: () => ({ mutate }) }));
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({ contractingTranscriptions: { saved: { mutationOptions: () => ({}) } } }),
}));
vi.mock('@/contracting/observability', () => observability);
vi.mock('@/lib/authed-fetch', () => ({ authedFetch: vi.fn() }));
vi.mock('./transcribe-upload', () => ({ transcribeRecording: transcribe }));
vi.mock('./use-voice-recorder', () => ({
  useVoiceRecorder: () => ({
    recording: false,
    seconds: 0,
    capped: recorder.capped,
    start: async () => recorder.started,
    stop,
  }),
}));

import { UploadRefusedError } from '@/lib/multipart-upload';
import type { VoiceRecording } from './use-voice-recorder';
import { useVoiceSession, type VoiceSession } from './use-voice-session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RECORDING = { uri: 'file://note.m4a', seconds: 3, durationMs: 3_100, peakDb: -20 };

function renderSession(value = '') {
  const onChangeText = vi.fn();
  let session!: VoiceSession;
  let renderer!: ReactTestRenderer;
  function Probe() {
    session = useVoiceSession('field note', { value, onChangeText, maxLength: 2000 });
    return null;
  }
  act(() => {
    renderer = create(<Probe />);
  });
  const rerender = () =>
    act(() => {
      renderer.update(<Probe />);
    });
  return { session: () => session, rerender, onChangeText };
}

beforeEach(() => {
  Object.assign(recorder, { started: 'recording', capped: false });
  stop.mockReset().mockResolvedValue(null);
  transcribe.mockReset();
  mutate.mockClear();
});

test('reports each Transcription that fed the field once with the saved text, then forgets them', async () => {
  const { session } = renderSession('Fence down.');
  transcribe
    .mockResolvedValueOnce({ id: 'a', text: 'one', language: 'eng' })
    .mockResolvedValueOnce({ id: 'b', text: 'two', language: 'eng' });
  stop.mockResolvedValue(RECORDING);
  for (let note = 0; note < 2; note++) {
    await act(async () => session().onPressIn());
    await act(async () => session().onPressOut());
  }

  session().reportSaved('One. Two.');
  session().reportSaved('One. Two. Three.');

  expect(mutate.mock.calls.map(([variables]) => variables)).toEqual([
    { id: 'a', text: 'One. Two.', purpose: 'field note' },
    { id: 'b', text: 'One. Two.', purpose: 'field note' },
  ]);
});

test('holds the form from the press until the transcript lands, then appends it to the field', async () => {
  let land!: (transcription: { id: string; text: string; language: string }) => void;
  transcribe.mockReturnValue(new Promise((resolve) => (land = resolve)));
  stop.mockResolvedValue(RECORDING);
  const { session, onChangeText } = renderSession('Fence down');
  expect(session()).toMatchObject({ busy: false, listening: false, status: 'Hold to record a voice note' });

  await act(async () => session().onPressIn());
  expect(session()).toMatchObject({ busy: true, listening: true, transcribing: false });

  await act(async () => session().onPressOut());
  expect(session()).toMatchObject({ busy: true, listening: false, transcribing: true, status: 'Transcribing…' });

  await act(async () => land({ id: 'a', text: 'by the dam.', language: 'eng' }));
  expect(session()).toMatchObject({ busy: false, transcribing: false });
  expect(onChangeText).toHaveBeenCalledWith('Fence down by the dam.');
  expect(observability.recordVoiceNoteTranscribed).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: 'field note', seconds: 3, durationMs: 3_100, peakDb: -20 }),
    'eng',
  );
});

test('says the web build cannot record, and lets go of the hold', async () => {
  recorder.started = 'unsupported';
  const { session } = renderSession();
  await act(async () => session().onPressIn());

  expect(session()).toMatchObject({
    busy: false,
    status: 'Voice notes are not supported in the browser — use the app.',
  });
});

test('stops listening when the Voice Note limit cuts off a note the finger still holds', async () => {
  const { session, rerender } = renderSession();
  await act(async () => session().onPressIn());
  expect(session().listening).toBe(true);

  recorder.capped = true;
  rerender();
  expect(session()).toMatchObject({ listening: false, busy: true });
});

test('a cancelled hold stops the recorder and sends nothing', async () => {
  const { session } = renderSession();
  await act(async () => session().onPressIn());
  act(() => session().cancel());

  expect(stop).toHaveBeenCalledTimes(1);
  expect(transcribe).not.toHaveBeenCalled();
  expect(session().busy).toBe(false);

  act(() => session().cancel());
  expect(stop).toHaveBeenCalledTimes(1);
});

test('a refusal shows the server’s sentence; anything else says to type the note', async () => {
  stop.mockResolvedValue(RECORDING);
  const { session, onChangeText } = renderSession();

  transcribe.mockRejectedValueOnce(new UploadRefusedError('transcription.nothing_heard', 'Nothing was heard.', 400));
  await act(async () => session().onPressIn());
  await act(async () => session().onPressOut());
  expect(session().status).toBe('Nothing was heard.');

  transcribe.mockRejectedValueOnce(new Error('The recording is no longer available. Record it again.'));
  await act(async () => session().onPressIn());
  await act(async () => session().onPressOut());
  expect(session().status).toBe('Transcription unavailable — type the note.');
  expect(onChangeText).not.toHaveBeenCalled();
  expect(observability.recordVoiceNoteFailed).toHaveBeenCalledTimes(2);
});
