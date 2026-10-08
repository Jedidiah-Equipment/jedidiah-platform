import { appendTranscript } from '@pkg/domain/contracting';
import { withTranscript } from './voice-text';

/** Where one Transcription's transcript stands in the field: `[start, end)` of `VoiceSpans.text`. */
type Span = { id: string; start: number; end: number };

/** The field's text as the voice session last saw it, and the span each inserted transcript now covers. */
export type VoiceSpans = { text: string; spans: readonly Span[] };

/**
 * Moves the spans through one edit. The common prefix and suffix of the old and new text leave a single edited
 * range: an edit before a span shifts it, one inside resizes it, and one straddling a boundary extends the span over
 * it. An insertion exactly at a boundary stays outside, so typing where a deleted transcript stood never revives it.
 */
export function trackEdit({ text, spans }: VoiceSpans, next: string): VoiceSpans {
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
export function insertTranscript(current: VoiceSpans, id: string, transcript: string, maxLength?: number): VoiceSpans {
  const next = withTranscript(current.text, transcript, maxLength);
  if (next !== appendTranscript(current.text, transcript)) return trackEdit(current, next);
  const start = next.length - transcript.length;
  const before = trackEdit(current, next.slice(0, start));
  return { text: next, spans: [...before.spans, { id, start, end: next.length }] };
}

/** What the person kept in place of each transcript; a deleted transcript kept nothing. */
export function keptTexts({ text, spans }: VoiceSpans): { id: string; text: string }[] {
  return spans.map((span) => ({ id: span.id, text: text.slice(span.start, span.end).trim() }));
}
