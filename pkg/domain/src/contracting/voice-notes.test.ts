import { describe, expect, it } from 'vitest';
import {
  appendTranscript,
  isHintDerivationLanguage,
  speechKeytermPrompt,
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

describe('speechKeytermPrompt', () => {
  it('trims, drops blanks and over-long terms, and de-duplicates ignoring case', () => {
    const machine = (keyterm: string) => ({ keyterm, source: 'machine' as const });
    expect(
      speechKeytermPrompt([machine('  JD   6155M '), machine(''), machine('jd 6155m'), machine('x'.repeat(51))]).prompt,
    ).toBe('JD 6155M');
  });

  it('joins keyterms in registry order within the budget and names each one cut off with its source', () => {
    const candidates = [
      { keyterm: 'Bloemhof', source: 'hint' as const },
      { keyterm: 'Thabo Nkosi', source: 'person' as const },
      ...Array.from({ length: 400 }, (_, index) => ({ keyterm: `Farm ${index}`, source: 'farm' as const })),
    ];

    const { prompt, cutOff } = speechKeytermPrompt(candidates);

    expect(prompt.startsWith('Bloemhof, Thabo Nkosi, Farm 0, Farm 1')).toBe(true);
    expect(prompt.length).toBeLessThanOrEqual(600);
    const sent = prompt.split(', ').length;
    expect(cutOff[0]).toEqual({ keyterm: `Farm ${sent - 2}`, source: 'farm' });
    expect(cutOff).toHaveLength(402 - sent);
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
