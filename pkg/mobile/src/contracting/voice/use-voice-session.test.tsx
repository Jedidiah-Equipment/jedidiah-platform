import { act, create } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

const mutate = vi.fn();
vi.mock('@tanstack/react-query', () => ({ useMutation: () => ({ mutate }) }));
vi.mock('@/lib/trpc', () => ({
  useTRPC: () => ({ contractingTranscriptions: { saved: { mutationOptions: () => ({}) } } }),
}));

import { useVoiceSession, type VoiceSession } from './use-voice-session';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('reports each remembered Transcription once with the saved text, then forgets them', () => {
  let session!: VoiceSession;
  function Probe() {
    session = useVoiceSession('field note');
    return null;
  }
  act(() => {
    create(<Probe />);
  });

  session.remember({ id: 'a', text: 'one', language: 'eng' });
  session.remember({ id: 'b', text: 'two', language: 'eng' });
  session.reportSaved('One. Two.');
  session.reportSaved('One. Two. Three.');

  expect(mutate.mock.calls.map(([variables]) => variables)).toEqual([
    { id: 'a', text: 'One. Two.', purpose: 'field note' },
    { id: 'b', text: 'One. Two.', purpose: 'field note' },
  ]);
});
