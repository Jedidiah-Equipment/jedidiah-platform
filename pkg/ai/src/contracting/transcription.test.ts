import { promptPlaceholder, SPEECH_KEYTERM_CAP } from '@pkg/domain/contracting';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createOpenAiTranscriptionModel } from '../ai-sdk-model.js';
import { deriveTranscriptionHint, tidyTranscript, transcribeVoiceNote, transcriptionPrompts } from './transcription.js';

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
const M4A = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]);

/** The real provider wiring, answering from `reply` and keeping the form and headers each request sent. */
function speechModel(model: string, reply: unknown = { text: 'heard' }) {
  const requests: { form: FormData; headers: Headers }[] = [];
  return {
    requests,
    model: createOpenAiTranscriptionModel({
      apiKey: 'test-key',
      model,
      fetch: async (_input, init) => {
        requests.push({ form: init?.body as FormData, headers: new Headers(init?.headers) });
        return Response.json(reply);
      },
    }),
  };
}

describe('transcribeVoiceNote', () => {
  it('sends gpt-transcribe the keyterms as keywords, no prompt, and returns the trimmed text', async () => {
    const { model, requests } = speechModel('gpt-transcribe', { text: ' Die hek by Rooikraal is oop. ' });

    const heard = await transcribeVoiceNote({
      audio: M4A,
      keyterms: [
        { keyterm: 'Rooikraal', source: 'hint' },
        { keyterm: 'JD 6155M', source: 'machine' },
      ],
      model,
    });

    expect(heard).toEqual({ text: 'Die hek by Rooikraal is oop.', language: null });
    const [{ form, headers } = { form: new FormData(), headers: new Headers() }] = requests;
    expect(form.get('model')).toBe('gpt-transcribe');
    expect(form.getAll('keywords[]')).toEqual(['Rooikraal', 'JD 6155M']);
    expect(form.has('prompt')).toBe(false);
    expect(form.get('response_format')).toBe('json');
    expect(form.has('timestamp_granularities[]')).toBe(false);
    expect([...headers.keys()].filter((name) => name.startsWith('x-transcription'))).toEqual([]);
  });

  it('sends an older speech model no keywords, which it would refuse', async () => {
    const { model, requests } = speechModel('gpt-4o-transcribe');

    await transcribeVoiceNote({ audio: M4A, keyterms: [{ keyterm: 'Rooikraal', source: 'hint' }], model });

    expect(requests[0]?.form.has('keywords[]')).toBe(false);
  });

  it('returns empty text when nothing was heard, so the caller can say so instead of reporting an outage', async () => {
    const { model } = speechModel('gpt-transcribe', { text: '', languages: [] });

    await expect(transcribeVoiceNote({ audio: M4A, keyterms: [], model })).resolves.toEqual({
      text: '',
      language: null,
    });
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

  const ruled = (rule: string | null, keyterm: string | null = null, retireHintId: string | null = null) => ({
    rule,
    keyterm,
    retireHintId,
  });

  it('asks with a plain object schema OpenAI strict mode accepts and returns a hint per correction', async () => {
    const model = answering({
      action: 'add',
      reason: '',
      hints: [
        ruled("The farm is spelled Bassi's, not Barsey's.", "Bassi's Farm", HINT_ID),
        ruled('Stoneybrook is one word.', 'Stoneybrook'),
      ],
    });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({
      action: 'add',
      hints: [
        { rule: "The farm is spelled Bassi's, not Barsey's.", keyterm: "Bassi's Farm", retireHintId: HINT_ID },
        { rule: 'Stoneybrook is one word.', keyterm: 'Stoneybrook', retireHintId: null },
      ],
    });
    const responseFormat = model.doGenerateCalls[0]?.responseFormat;
    expect(responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    expect(JSON.stringify(responseFormat)).not.toMatch(/oneOf|anyOf|minLength|maxLength|minItems|maxItems/);
  });

  it('keeps the first three usable rules, one per keyterm ignoring case', async () => {
    const model = answering({
      action: 'add',
      reason: '',
      hints: [
        ruled('Bloemhof is one word.', 'Bloemhof'),
        ruled('  '),
        ruled(`Spell it ${'Rooikraal '.repeat(40)}`, 'Rooikraal'),
        ruled('Write BLOEMHOF in capitals.', ' bloemhof '),
        ruled('Say Code Red.', '', 'not-a-hint'),
        ruled('Vaalkop is one word.', `Vaalkop ${'farm '.repeat(12)}`, ''),
        ruled('Rooikraal is one word.', 'Rooikraal'),
      ],
    });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({
      action: 'add',
      hints: [
        { rule: 'Bloemhof is one word.', keyterm: 'Bloemhof', retireHintId: null },
        { rule: 'Say Code Red.', keyterm: null, retireHintId: null },
        { rule: 'Vaalkop is one word.', keyterm: null, retireHintId: null },
      ],
    });
  });

  it('drops a rule whose keyterm is the text the person removed, so a hint never teaches the shown spelling', async () => {
    const model = answering({
      action: 'add',
      reason: '',
      hints: [
        ruled('The place is spelled Stony Brook, not Stoneybrook.', 'Stony Brook'),
        ruled('The place is spelled Stoneybrook, not Stony Brook.', 'stoneybrook'),
      ],
    });

    expect(
      await deriveTranscriptionHint({
        ...input,
        shownText: 'Things are getting crazy down at Stony Brook.',
        savedText: 'Things are getting crazy down at Stoneybrook.',
        model,
      }),
    ).toEqual({
      action: 'add',
      hints: [
        { rule: 'The place is spelled Stoneybrook, not Stony Brook.', keyterm: 'stoneybrook', retireHintId: null },
      ],
    });
  });

  it.each([
    ['a name lengthened', 'Call Jon about the tipper.', 'Call Jonathan about the tipper.', 'Jon', 'Jonathan'],
    ['a name capitalised', 'The gate at rooikraal.', 'The gate at Rooikraal.', 'rooikraal', 'Rooikraal'],
  ])('tells %s apart by whole words and exact case', async (_, shownText, savedText, removed, kept) => {
    const model = answering({
      action: 'add',
      reason: '',
      hints: [ruled(`Spell it ${removed}, not ${kept}.`, removed), ruled(`Spell it ${kept}, not ${removed}.`, kept)],
    });

    expect(await deriveTranscriptionHint({ ...input, shownText, savedText, model })).toEqual({
      action: 'add',
      hints: [{ rule: `Spell it ${kept}, not ${removed}.`, keyterm: kept, retireHintId: null }],
    });
  });

  it('reads an add with no usable rule as none', async () => {
    const model = answering({ action: 'add', reason: '', hints: [ruled(''), ruled(null, 'Rooikraal')] });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({ action: 'none', reason: 'No usable rule.' });
  });

  it('answers none without the hint fields', async () => {
    const model = answering({ action: 'none', reason: 'A rewrite.', hints: [] });

    expect(await deriveTranscriptionHint({ ...input, model })).toEqual({ action: 'none', reason: 'A rewrite.' });
  });
});

describe('transcriptionPrompts', () => {
  const hints = [{ id: HINT_ID, rule: 'The farm is spelled Rooikraal, not Rooi Kraal.' }];
  const keyterms = [
    { keyterm: 'Rooikraal', source: 'hint' as const },
    ...Array.from({ length: SPEECH_KEYTERM_CAP }, (_, index) => ({
      keyterm: `Tractor ${index}`,
      source: 'machine' as const,
    })),
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

  it('shows the speech keyterms the call sends, after the cap', async () => {
    const { model, requests } = speechModel('gpt-transcribe');
    await transcribeVoiceNote({ audio: M4A, keyterms, model });

    expect(shown.speech).toMatchObject({
      model: 'gpt-transcribe',
      keyterms: requests[0]?.form.getAll('keywords[]'),
      maxKeyterms: SPEECH_KEYTERM_CAP,
    });
    expect(shown.speech.cutOff).toEqual([{ keyterm: `Tractor ${SPEECH_KEYTERM_CAP - 1}`, source: 'machine' }]);
  });

  it('shows the tidy and derivation prompts the calls send, with the note in placeholders', async () => {
    const tidy = answering({ text: 'The gate.', language: 'en' });
    const derive = answering({ action: 'none', reason: 'A rewrite.', hints: [] });
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
    expect(shown.derivation.system).toContain('at most 3, most useful first');
    expect(shown.tidy.model).toBe('gpt-chat');
  });
});
