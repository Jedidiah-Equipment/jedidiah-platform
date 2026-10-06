import { describe, expect, it } from 'vitest';
import { appendTranscript, isHintDerivationLanguage, shapeKeyterms, transcriptionWasCorrected } from './voice-notes.js';

describe('isHintDerivationLanguage', () => {
  it('derives hints from English tags only', () => {
    expect(isHintDerivationLanguage('en')).toBe(true);
    expect(isHintDerivationLanguage('eng')).toBe(true);
    expect(isHintDerivationLanguage('EN-za')).toBe(true);
    expect(isHintDerivationLanguage('af')).toBe(false);
    expect(isHintDerivationLanguage('afr')).toBe(false);
    expect(isHintDerivationLanguage(null)).toBe(false);
  });
});

describe('transcriptionWasCorrected', () => {
  it('counts only a changed, non-empty saved text as a correction', () => {
    expect(transcriptionWasCorrected('Rooi kraal gate', 'Rooikraal gate')).toBe(true);
    expect(transcriptionWasCorrected('Rooikraal gate', ' Rooikraal gate ')).toBe(false);
    expect(transcriptionWasCorrected('Rooikraal gate', '   ')).toBe(false);
  });
});

describe('shapeKeyterms', () => {
  it('cleans terms, drops ones outside the speech service limits, de-duplicates ignoring case, and caps', () => {
    expect(
      shapeKeyterms([
        '  JD   6155M ',
        null,
        '',
        'jd 6155m',
        'x'.repeat(50),
        'one two three four five six',
        'Rooikraal [north]',
        undefined,
      ]),
    ).toEqual(['JD 6155M', 'Rooikraal north']);
    expect(shapeKeyterms(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

describe('appendTranscript', () => {
  it('fills an empty field and appends after typed text with one space', () => {
    expect(appendTranscript('  ', 'Gate is open.')).toBe('Gate is open.');
    expect(appendTranscript('Arrived late. ', 'Gate is open.')).toBe('Arrived late. Gate is open.');
  });
});
