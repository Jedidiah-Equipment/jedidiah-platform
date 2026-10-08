import { appendTranscript } from '@pkg/domain/contracting';

type Span = { id: string; start: number; end: number };

/** The field's text as the voice session last saw it, and the span each inserted transcript now covers. */
export type FieldSpans = { text: string; spans: readonly Span[] };

type Edit = { start: number; end: number };

/** The one edited range of `text`, aligned as far right (common prefix first) or as far left (common suffix first) as it goes. */
function editBetween(text: string, next: string, align: 'right' | 'left'): Edit {
  const shorter = Math.min(text.length, next.length);
  const same = (from: number) => text[from] === next[from];
  const sameFromEnd = (back: number) => text[text.length - 1 - back] === next[next.length - 1 - back];
  let prefix = 0;
  let suffix = 0;
  if (align === 'right') {
    while (prefix < shorter && same(prefix)) prefix++;
    while (suffix < shorter - prefix && sameFromEnd(suffix)) suffix++;
  } else {
    while (suffix < shorter && sameFromEnd(suffix)) suffix++;
    while (prefix < shorter - suffix && same(prefix)) prefix++;
  }
  return { start: prefix, end: text.length - suffix };
}

const isWordCharacter = (character: string | undefined) => character !== undefined && /\S/.test(character);

/**
 * Moves the spans through one edit. The common prefix and suffix of the old and new text leave a single edited
 * range: an edit before a span shifts it, one inside resizes it, and one straddling a boundary extends the span over
 * it. Where an insert or delete could sit on either side of a boundary, it stays outside the span, so typing in front
 * of a transcript or where a deleted one stood never joins it; only letters typed onto its last word do.
 */
export function trackEdit({ text, spans }: FieldSpans, next: string): FieldSpans {
  if (next === text) return { text, spans };
  const delta = next.length - text.length;
  const alignments = [editBetween(text, next, 'right'), editBetween(text, next, 'left')];
  const extendsLastWord = (span: Span, edit: Edit) =>
    edit.start === span.end &&
    edit.end === span.end &&
    span.start < span.end &&
    isWordCharacter(text[span.end - 1]) &&
    isWordCharacter(next[edit.start]);

  return {
    text: next,
    spans: spans.map((span) => {
      for (const edit of alignments) {
        if (edit.end <= span.start) return { ...span, start: span.start + delta, end: span.end + delta };
        if (edit.start >= span.end && !extendsLastWord(span, edit)) return span;
      }
      const [edit] = alignments as [Edit, Edit];
      return { ...span, start: Math.min(span.start, edit.start), end: Math.max(span.end, edit.end) + delta };
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
