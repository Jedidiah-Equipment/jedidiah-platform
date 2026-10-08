import { appendTranscript } from '@pkg/domain/contracting';

type Span = { id: string; start: number; end: number };

/** The field's text as the voice session last saw it, and the span each inserted transcript now covers. */
export type FieldSpans = { text: string; spans: readonly Span[] };

/**
 * Moves the spans through one edit. The common prefix and suffix of the old and new text leave a single edited
 * range: an edit before a span shifts it, one inside resizes it, and one straddling a boundary extends the span over
 * it. An insertion exactly at a boundary stays outside, so typing where a deleted transcript stood never revives it.
 */
export function trackEdit({ text, spans }: FieldSpans, next: string): FieldSpans {
  if (next === text) return { text, spans };
  const shorter = Math.min(text.length, next.length);
  let prefix = 0;
  while (prefix < shorter && text[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < shorter - prefix && text[text.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  const editStart = prefix;
  const editEnd = text.length - suffix;
  const delta = next.length - text.length;

  return {
    text: next,
    spans: spans.map((span) => {
      if (editEnd <= span.start) return { ...span, start: span.start + delta, end: span.end + delta };
      if (editStart >= span.end) return span;
      return { ...span, start: Math.min(span.start, editStart), end: Math.max(span.end, editEnd) + delta };
    }),
  };
}

/** Appends a transcript and gives it a span; one the field limit cut short gets none, as the person never saw it whole. */
export function insertTranscript(current: FieldSpans, id: string, transcript: string, maxLength?: number): FieldSpans {
  const appended = appendTranscript(current.text, transcript);
  const next = maxLength === undefined ? appended : appended.slice(0, maxLength);
  if (next !== appended) return trackEdit(current, next);
  const start = next.length - transcript.length;
  const before = trackEdit(current, next.slice(0, start));
  return { text: next, spans: [...before.spans, { id, start, end: next.length }] };
}

export function keptTexts({ text, spans }: FieldSpans): { id: string; text: string }[] {
  return spans.map((span) => ({ id: span.id, text: text.slice(span.start, span.end).trim() }));
}
