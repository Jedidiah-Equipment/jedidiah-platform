import { createOpenAI } from '@ai-sdk/openai';
import { shapeKeyterms } from '@pkg/domain/contracting';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import {
  deriveTranscriptionHint,
  promptPlaceholder,
  tidyTranscript,
  transcribeVoiceNote,
  transcriptionPrompts,
} from './transcription.js';

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
  it('biases the speech model with the keyterms as a json-format prompt and returns the trimmed text', async () => {
    let sent: FormData | undefined;
    const model = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        sent = init?.body as FormData;
        return Response.json({ text: ' Die hek by Rooikraal is oop. ' });
      },
    }).transcription('gpt-transcribe');

    const heard = await transcribeVoiceNote({
      audio: new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]),
      keyterms: ['Rooikraal', 'JD 6155M'],
      model,
    });

    expect(heard).toEqual({ text: 'Die hek by Rooikraal is oop.', language: null });
    expect(sent?.get('model')).toBe('gpt-transcribe');
    expect(sent?.get('prompt')).toBe('Rooikraal, JD 6155M');
    expect(sent?.get('response_format')).toBe('json');
    // Pinned until the provider forwards them (see the TODO on the call).
    expect(sent?.has('keywords')).toBe(false);
    expect(sent?.has('timestamp_granularities[]')).toBe(false);
  });

  it('returns empty text when nothing was heard, so the caller can say so instead of reporting an outage', async () => {
    const model = createOpenAI({
      apiKey: 'test-key',
      fetch: async () => Response.json({ text: '', languages: [] }),
    }).transcription('gpt-transcribe');

    await expect(
      transcribeVoiceNote({ audio: new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]), keyterms: [], model }),
    ).resolves.toEqual({ text: '', language: null });
  });
});

describe('tidyTranscript', () => {
  it('returns the tidied text and spoken language, and tells the model the purpose, language and hints', async () => {
    const model = answering({ text: ' Die hek by Rooikraal is oop. ', language: 'af' });

    const shown = await tidyTranscript({
      rawText: 'die hek by rooi kraal is oop',
      language: 'afr',
      purpose: 'capture comment',
      hints: [{ id: HINT_ID, rule: 'The farm is spelled Rooikraal, not Rooi Kraal.' }],
      model,
    });

    expect(shown).toEqual({ text: 'Die hek by Rooikraal is oop.', language: 'af' });
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

  it('reads a blank or invented hint id to retire as none', async () => {
    const model = answering({ action: 'add', reason: '', rule: 'Say Code Red.', keyterm: '', retireHintId: '' });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({
      action: 'add',
      rule: 'Say Code Red.',
      keyterm: null,
      retireHintId: null,
    });
  });

  it('answers none without the hint fields', async () => {
    const model = answering({ action: 'none', reason: 'A rewrite.', rule: null, keyterm: null, retireHintId: null });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({ action: 'none', reason: 'A rewrite.' });
  });
});

describe('transcriptionPrompts', () => {
  const hints = [{ id: HINT_ID, rule: 'The farm is spelled Rooikraal, not Rooi Kraal.' }];
  const keyterms = [
    { keyterm: 'Rooikraal', source: 'hint' as const },
    ...Array.from({ length: 80 }, (_, index) => ({ keyterm: `Tractor ${index}`, source: 'machine' as const })),
  ];
  const shown = transcriptionPrompts({
    hints,
    keyterms,
    models: { chat: 'gpt-chat', transcription: 'gpt-transcribe' },
  });
  const note = {
    rawText: 'the gate at rooi kraal is open',
    shownText: 'The gate at Rooi Kraal is open.',
    savedText: 'The gate at Rooikraal is open.',
    language: 'eng',
    purpose: 'capture comment',
  };
  const fill = (template: string) =>
    template
      .replace(promptPlaceholder('purpose'), note.purpose)
      .replace(promptPlaceholder('detected language'), note.language)
      .replace(promptPlaceholder('raw transcript'), note.rawText)
      .replace(promptPlaceholder('shown text'), note.shownText)
      .replace(promptPlaceholder('saved text'), note.savedText);
  const sent = (model: MockLanguageModelV4) => {
    const [system, user] = model.doGenerateCalls[0]?.prompt ?? [];
    return { system: system?.content, prompt: user?.role === 'user' ? user.content[0] : undefined };
  };

  it('shows the speech prompt the call sends, after the cut', async () => {
    let prompt: unknown;
    const model = createOpenAI({
      apiKey: 'test-key',
      fetch: async (_input, init) => {
        prompt = (init?.body as FormData).get('prompt');
        return Response.json({ text: 'heard' });
      },
    }).transcription('gpt-transcribe');
    await transcribeVoiceNote({
      audio: new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]),
      keyterms: shapeKeyterms(keyterms.map((candidate) => candidate.keyterm)),
      model,
    });

    expect(shown.speech).toMatchObject({ model: 'gpt-transcribe', prompt, maxChars: 600 });
    expect(shown.speech.cutOff[0]?.source).toBe('machine');
  });

  it('shows the tidy and derivation prompts the calls send, with the note in placeholders', async () => {
    const tidy = answering({ text: 'The gate.', language: 'en' });
    const derive = answering({ action: 'none', reason: 'A rewrite.', rule: null, keyterm: null, retireHintId: null });
    await tidyTranscript({ ...note, hints, model: tidy });
    await deriveTranscriptionHint({ ...note, hints, model: derive });

    expect(sent(tidy)).toEqual({
      system: shown.tidy.system,
      prompt: { type: 'text', text: fill(shown.tidy.prompt) },
    });
    expect(sent(derive)).toEqual({
      system: shown.derivation.system,
      prompt: { type: 'text', text: fill(shown.derivation.prompt) },
    });
    expect(shown.derivation.system).toContain(`- ${HINT_ID}: The farm is spelled Rooikraal`);
    expect(shown.tidy.model).toBe('gpt-chat');
  });
});
