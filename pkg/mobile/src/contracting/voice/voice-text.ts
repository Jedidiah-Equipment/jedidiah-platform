import { appendTranscript } from '@pkg/domain/contracting';

/** The field's text with a transcript added after what was typed, cut to the field's limit. */
export function withTranscript(existing: string, transcript: string, maxLength?: number): string {
  const text = appendTranscript(existing, transcript);
  return maxLength === undefined ? text : text.slice(0, maxLength);
}
