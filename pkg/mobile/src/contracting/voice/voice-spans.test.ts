import { expect, test } from 'vitest';
import { type FieldSpans, insertTranscript, keptTexts, trackEdit } from './voice-spans';

const EMPTY: FieldSpans = { text: '', spans: [] };

function typed(spans: FieldSpans, text: string) {
  return trackEdit(spans, text);
}

test('typed text before a transcript leaves the transcript as its own kept text', () => {
  let spans = typed(EMPTY, 'Fence down.');
  spans = insertTranscript(spans, 'a', 'Gate is open.');
  spans = typed(spans, `Arrived late. ${spans.text}`);

  expect(spans.text).toBe('Arrived late. Fence down. Gate is open.');
  expect(keptTexts(spans)).toEqual([{ id: 'a', text: 'Gate is open.' }]);
});

test('a correction inside one transcript is kept by that transcript only', () => {
  let spans = insertTranscript(EMPTY, 'a', 'Gate is open.');
  spans = insertTranscript(spans, 'b', 'Borehole at Vrede.');
  spans = typed(spans, spans.text.replace('Vrede', 'Vreede'));

  expect(keptTexts(spans)).toEqual([
    { id: 'a', text: 'Gate is open.' },
    { id: 'b', text: 'Borehole at Vreede.' },
  ]);
});

test('an edit straddling a transcript boundary extends the transcript to cover it', () => {
  let spans = typed(EMPTY, 'Fence');
  spans = insertTranscript(spans, 'a', 'down by dam.');

  spans = typed(spans, 'Fence is down by dam.');
  expect(keptTexts(spans)).toEqual([{ id: 'a', text: 'down by dam.' }]);

  spans = typed(spans, 'Fence is broken by dam.');
  expect(keptTexts(spans)).toEqual([{ id: 'a', text: 'broken by dam.' }]);

  spans = typed(spans, 'Fence was smashed by dam.');
  expect(keptTexts(spans)).toEqual([{ id: 'a', text: 'was smashed by dam.' }]);
});

test('a deleted transcript keeps empty text, and typing where it stood does not revive it', () => {
  let spans = typed(EMPTY, 'Fence down.');
  spans = insertTranscript(spans, 'a', 'Gate is open.');
  spans = typed(spans, 'Fence down. ');
  spans = typed(spans, 'Fence down. Cows out.');

  expect(keptTexts(spans)).toEqual([{ id: 'a', text: '' }]);
});

test('a transcript the field limit cut short is never kept', () => {
  const spans = insertTranscript(typed(EMPTY, 'Arrived late.'), 'a', 'Gate is open.', 20);

  expect(spans.text).toBe('Arrived late. Gate i');
  expect(keptTexts(spans)).toEqual([]);
});
