import { useLayoutEffect, useRef, useState } from 'react';
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
  useTRPC: () => ({ transcriptions: { saved: { mutationOptions: () => ({}) } } }),
}));
vi.mock('./voice-observability', () => observability);
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

function renderSession(initial = '') {
  const onChangeText = vi.fn();
  let session!: VoiceSession;
  let text = initial;
  let setText!: (text: string) => void;
  let renderer!: ReactTestRenderer;
  // The field owns its text and attaches it after every commit, as VoiceTextArea does.
  function Probe() {
    const [value, setValue] = useState(initial);
    text = value;
    setText = setValue;
    session = useVoiceSession({ business: 'contracting', purpose: 'field note' });
    const { attach } = session;
    const owner = useRef({}).current;
    useLayoutEffect(() =>
      attach(
        {
          value,
          onChangeText: (next) => {
            onChangeText(next);
            setValue(next);
          },
          maxLength: 2000,
        },
        owner,
      ),
    );
    return null;
  }
  act(() => {
    renderer = create(<Probe />);
  });
  const rerender = () =>
    act(() => {
      renderer.update(<Probe />);
    });
  return {
    session: () => session,
    text: () => text,
    rerender,
    onChangeText,
    setText: (next: string) => act(() => setText(next)),
  };
}

beforeEach(() => {
  Object.assign(recorder, { started: 'recording', capped: false });
  stop.mockReset().mockResolvedValue(null);
  transcribe.mockReset();
  mutate.mockClear();
});

async function record(session: () => VoiceSession, transcription: { id: string; text: string }) {
  transcribe.mockResolvedValueOnce({ ...transcription, language: 'eng' });
  stop.mockResolvedValue(RECORDING);
  await act(async () => session().onPressIn());
  await act(async () => session().onPressOut());
}

test('reports each Transcription once with the text kept in place of its own transcript, then forgets them', async () => {
  const { session, text } = renderSession('Fence down.');
  await record(session, { id: 'a', text: 'Gate is open.' });
  await record(session, { id: 'b', text: 'Borehole at Vrede.' });
  act(() => session().onChangeText(text().replace('Vrede', 'Vreede')));

  session().reportSaved();
  session().reportSaved();

  expect(mutate.mock.calls.map(([variables]) => variables)).toEqual([
    { id: 'a', text: 'Gate is open.', purpose: 'field note' },
    { id: 'b', text: 'Borehole at Vreede.', purpose: 'field note' },
  ]);
});

test('a snapshot taken as a save begins reports the saved text, not what was typed since', async () => {
  const { session } = renderSession();
  await record(session, { id: 'a', text: 'Borehole at Vrede.' });
  const reportSaved = session().snapshotSaved();
  act(() => session().onChangeText('Borehole at Vreede.'));

  reportSaved();
  reportSaved();

  expect(mutate.mock.calls.map(([variables]) => variables)).toEqual([
    { id: 'a', text: 'Borehole at Vrede.', purpose: 'field note' },
  ]);
});

test('follows text the form sets itself, so a transcript it removed reports empty', async () => {
  const { session, setText } = renderSession('Fence down.');
  await record(session, { id: 'a', text: 'Gate is open.' });
  setText('Fence down.');

  session().reportSaved();

  expect(mutate).toHaveBeenCalledWith({ id: 'a', text: '', purpose: 'field note' }, expect.anything());
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
    expect.objectContaining({
      business: 'contracting',
      purpose: 'field note',
      seconds: 3,
      durationMs: 3_100,
      peakDb: -20,
    }),
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

test('drops a transcript that lands after its field is gone, and never attributes later text to it', async () => {
  const onChangeText = vi.fn();
  let session!: VoiceSession;
  function Field({ voice, value }: { voice: VoiceSession; value: string }) {
    const { attach } = voice;
    const owner = useRef({}).current;
    useLayoutEffect(() => attach({ value, onChangeText }, owner));
    return null;
  }
  function Screen({ editing }: { editing: boolean }) {
    session = useVoiceSession({ business: 'contracting', purpose: 'close-out note' });
    return editing ? <Field voice={session} value="" /> : null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Screen editing />);
  });
  let land!: (value: unknown) => void;
  transcribe.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
  stop.mockResolvedValue(RECORDING);
  await act(async () => session.onPressIn());
  await act(async () => session.onPressOut());

  // Cancelled while transcribing: the field goes, then the transcript lands.
  act(() => renderer.update(<Screen editing={false} />));
  await act(async () => land({ id: 'late', text: 'Late words.', language: 'eng' }));
  expect(onChangeText).not.toHaveBeenCalled();

  // Reopened and typed into: the typed note is not the late Transcription's, so nothing is reported for it.
  act(() => renderer.update(<Screen editing />));
  act(() => session.onChangeText('A note typed by hand.'));
  session.reportSaved();
  expect(mutate).not.toHaveBeenCalled();
});

test('a transcript recorded in a cancelled field does not land in the field reopened in its place', async () => {
  const onChangeText = vi.fn();
  let session!: VoiceSession;
  function Field({ voice }: { voice: VoiceSession }) {
    const { attach } = voice;
    const owner = useRef({}).current;
    useLayoutEffect(() => attach({ value: 'Reopened draft', onChangeText }, owner));
    return null;
  }
  function Screen({ editing }: { editing: boolean }) {
    session = useVoiceSession({ business: 'contracting', purpose: 'breakdown description' });
    return editing ? <Field key={String(editing)} voice={session} /> : null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Screen editing />);
  });
  let land!: (value: unknown) => void;
  transcribe.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
  stop.mockResolvedValue(RECORDING);
  await act(async () => session.onPressIn());
  await act(async () => session.onPressOut());

  // Cancel, then Edit again before the transcript lands: a new field mounts in the old one's place.
  act(() => renderer.update(<Screen editing={false} />));
  act(() => renderer.update(<Screen editing />));
  await act(async () => land({ id: 'late', text: 'Cancelled words.', language: 'eng' }));

  expect(onChangeText).not.toHaveBeenCalled();
});
