import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createScribeModel, deriveTranscriptionHint, tidyTranscript, transcribeVoiceNote } from './transcription.js';

function answering(object: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify(object) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

const HINT_ID = '2b8c0a52-6f0e-4d5e-9a43-3f7a0e1c9d11';

describe('transcribeVoiceNote', () => {
  it('sends the keyterms in the Scribe request body and returns the trimmed text and language', async () => {
    let sent: FormData | undefined;
    const model = createScribeModel({
      apiKey: 'test-key',
      model: 'scribe_v2',
      fetch: async (_input, init) => {
        sent = init?.body as FormData;
        return Response.json({
          text: ' Die hek by Rooikraal is oop. ',
          language_code: 'afr',
          language_probability: 0.9,
        });
      },
    });

    const heard = await transcribeVoiceNote({
      audio: new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]),
      keyterms: ['Rooikraal', 'JD 6155M'],
      model,
    });

    expect(heard).toEqual({ text: 'Die hek by Rooikraal is oop.', language: 'afr' });
    expect(sent?.getAll('keyterms')).toEqual(['Rooikraal', 'JD 6155M']);
    expect(sent?.get('model_id')).toBe('scribe_v2');
    expect(sent?.get('tag_audio_events')).toBe('false');
  });
});

describe('tidyTranscript', () => {
  it('returns the tidied text and tells the model the purpose, language and hints', async () => {
    const model = answering({ text: ' Die hek by Rooikraal is oop. ' });

    const shown = await tidyTranscript({
      rawText: 'die hek by rooi kraal is oop',
      language: 'afr',
      purpose: 'capture comment',
      hints: [{ id: HINT_ID, rule: 'The farm is spelled Rooikraal, not Rooi Kraal.' }],
      model,
    });

    expect(shown).toBe('Die hek by Rooikraal is oop.');
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('NEVER translate');
    expect(prompt).toContain('The farm is spelled Rooikraal, not Rooi Kraal.');
    expect(prompt).toContain('Purpose: capture comment');
    expect(prompt).toContain('Detected language: afr');
  });
});

describe('deriveTranscriptionHint', () => {
  const input = {
    rawText: 'the gate at rooi kraal is open',
    shownText: 'The gate at Rooi Kraal is open.',
    savedText: 'The gate at Rooikraal is open.',
    language: 'eng',
    purpose: 'capture comment',
    hints: [{ id: HINT_ID, rule: 'Say Code Red, not code read.' }],
  };

  it('asks with a plain object schema OpenAI strict mode accepts and returns a new hint', async () => {
    const model = answering({
      action: 'add',
      reason: '',
      rule: 'The farm is spelled Rooikraal, not Rooi Kraal.',
      keyterm: 'Rooikraal',
      retireHintId: HINT_ID,
    });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({
      action: 'add',
      rule: 'The farm is spelled Rooikraal, not Rooi Kraal.',
      keyterm: 'Rooikraal',
      retireHintId: HINT_ID,
    });
    const responseFormat = model.doGenerateCalls[0]?.responseFormat;
    expect(responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    expect(JSON.stringify(responseFormat)).not.toMatch(/oneOf|minLength|maxLength/);
  });

  it('answers none without the hint fields', async () => {
    const model = answering({ action: 'none', reason: 'A rewrite.', rule: null, keyterm: null, retireHintId: null });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({ action: 'none', reason: 'A rewrite.' });
  });
});
