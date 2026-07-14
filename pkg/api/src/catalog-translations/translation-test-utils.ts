import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { type CatalogSourceHashes, catalogSourceHashes } from '@pkg/domain';
import type { CatalogTranslationEnvelope } from '@pkg/schema';
import type { MockLanguageModelV3 } from 'ai/test';
import { expect } from 'vitest';

export function generatedJson(value: unknown): LanguageModelV3GenerateResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}

export function translationEnvelopes<Canonical extends object>(
  canonical: Canonical,
  translated: Canonical,
  sourceHashOverride?: string,
): { [Field in keyof Canonical]: CatalogTranslationEnvelope<Canonical[Field]> } {
  const sourceHashes: CatalogSourceHashes<Canonical> = catalogSourceHashes(canonical);

  return Object.fromEntries(
    (Object.keys(canonical) as Array<keyof Canonical>).map((field) => [
      field,
      {
        isManual: false,
        sourceHash: sourceHashOverride ?? sourceHashes[field],
        translatedAt: '2026-07-13T10:00:00.000Z',
        value: translated[field],
      },
    ]),
  ) as { [Field in keyof Canonical]: CatalogTranslationEnvelope<Canonical[Field]> };
}

export async function waitForModelCalls(model: MockLanguageModelV3, count: number): Promise<void> {
  for (let attempt = 0; attempt < 200 && model.doGenerateCalls.length < count; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  expect(model.doGenerateCalls).toHaveLength(count);
}

/** Lets queued async work drain when a test asserts that no further model call happens. */
export async function waitForTurns(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

/** Deterministic timer double: nothing fires until `advance` moves the clock past a due time. */
export class ManualTimers {
  readonly #scheduled = new Map<number, { callback: () => void; dueAt: number }>();
  #nextId = 1;
  #now = 0;

  set(callback: () => void, delayMs: number): number {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#scheduled.set(id, { callback, dueAt: this.#now + delayMs });
    return id;
  }

  clear(timer: unknown): void {
    if (typeof timer === 'number') this.#scheduled.delete(timer);
  }

  advance(durationMs: number): void {
    this.#now += durationMs;
    const due = [...this.#scheduled.entries()]
      .filter(([, task]) => task.dueAt <= this.#now)
      .sort((left, right) => left[1].dueAt - right[1].dueAt);
    for (const [id, task] of due) {
      this.#scheduled.delete(id);
      task.callback();
    }
  }
}
