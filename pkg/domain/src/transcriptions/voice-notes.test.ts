import { describe, expect, it } from 'vitest';
import {
  appendTranscript,
  HINT_KEYTERM_SOURCE,
  isHintDerivationLanguage,
  keytermCandidates,
  personKeyterms,
  SPEECH_KEYTERM_CAP,
  sourcedKeyterms,
  speechKeyterms,
  transcriptionHintStatus,
  transcriptionWasCorrected,
} from './voice-notes.js';

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

describe('appendTranscript', () => {
  it('fills an empty field and appends after typed text with one space', () => {
    expect(appendTranscript('  ', 'Gate is open.')).toBe('Gate is open.');
    expect(appendTranscript('Arrived late. ', 'Gate is open.')).toBe('Arrived late. Gate is open.');
  });
});

describe('speechKeyterms', () => {
  it('trims, drops blanks, over-long terms and ones the API refuses, and de-duplicates ignoring case', () => {
    const machine = (keyterm: string) => ({ keyterm, source: 'Machine' as const });
    expect(
      speechKeyterms([
        machine('  JD   6155M '),
        machine(''),
        machine('jd 6155m'),
        machine('x'.repeat(51)),
        machine('<Bell>'),
        machine('Line\nbreak'),
      ]).keyterms,
    ).toEqual(['JD 6155M', 'Line break']);
  });

  it('keeps registry order up to the cap and names each one cut off with its source', () => {
    const candidates = [
      { keyterm: 'Bloemhof', source: 'Hint keyterm' as const },
      { keyterm: 'Thabo Nkosi', source: 'Person' as const },
      ...Array.from({ length: SPEECH_KEYTERM_CAP }, (_, index) => ({
        keyterm: `Farm ${index}`,
        source: 'Farm' as const,
      })),
    ];

    const { keyterms, cutOff } = speechKeyterms(candidates);

    expect(keyterms).toHaveLength(SPEECH_KEYTERM_CAP);
    expect(keyterms.slice(0, 3)).toEqual(['Bloemhof', 'Thabo Nkosi', 'Farm 0']);
    expect(cutOff).toEqual([
      { keyterm: `Farm ${SPEECH_KEYTERM_CAP - 2}`, source: 'Farm' },
      { keyterm: `Farm ${SPEECH_KEYTERM_CAP - 1}`, source: 'Farm' },
    ]);
  });
});

describe('transcriptionHintStatus', () => {
  const row = {
    language: 'en',
    shownText: 'The gate at Rooi Kraal.',
    savedText: 'The gate at Rooikraal.',
    hintDerivedAt: new Date(),
    hintOutcome: 'none' as const,
    hintNoneReason: 'Specific to this note.',
    hintIds: [],
  };

  it('walks a Transcription from unsaved to its derivation outcome', () => {
    expect(transcriptionHintStatus({ ...row, savedText: null })).toEqual({ kind: 'not_saved' });
    expect(transcriptionHintStatus({ ...row, savedText: ' The gate at Rooi Kraal. ' })).toEqual({
      kind: 'no_correction',
    });
    expect(transcriptionHintStatus({ ...row, language: 'af' })).toEqual({ kind: 'not_english' });
    expect(transcriptionHintStatus({ ...row, hintDerivedAt: null, hintOutcome: null })).toEqual({ kind: 'pending' });
    expect(transcriptionHintStatus(row)).toEqual({ kind: 'no_hint', reason: 'Specific to this note.' });
    expect(transcriptionHintStatus({ ...row, hintOutcome: 'added', hintNoneReason: null, hintIds: ['h1'] })).toEqual({
      kind: 'hint_added',
      hintIds: ['h1'],
    });
  });

  it('reads a derivation from before outcomes were kept by the hint it left, else as unknown', () => {
    const before = { ...row, hintOutcome: null, hintNoneReason: null };
    expect(transcriptionHintStatus(before)).toEqual({ kind: 'unknown' });
    expect(transcriptionHintStatus({ ...before, hintIds: ['h1', 'h2'] })).toEqual({
      kind: 'hint_added',
      hintIds: ['h1', 'h2'],
    });
  });
});

describe('keytermCandidates', () => {
  it('puts taught hint keyterms first, skips hints with none, then the vocabulary', () => {
    const vocabulary = [{ keyterm: 'CAT320-1', source: 'Machine' }];

    expect(keytermCandidates([{ keyterm: 'Bloemhof' }, { keyterm: null }], vocabulary)).toEqual([
      { keyterm: 'Bloemhof', source: HINT_KEYTERM_SOURCE },
      { keyterm: 'CAT320-1', source: 'Machine' },
    ]);
  });

  it('says people by full name and first name, and drops empty values', () => {
    expect(personKeyterms(['Thabo Nkosi', ''])).toEqual([
      { keyterm: 'Thabo Nkosi', source: 'Person' },
      { keyterm: 'Thabo', source: 'Person' },
    ]);
    expect(sourcedKeyterms('Machine', ['JD 6155M', null, ''])).toEqual([{ keyterm: 'JD 6155M', source: 'Machine' }]);
  });
});
