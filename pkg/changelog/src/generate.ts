import type { Changelog } from '@pkg/schema';

import { parseJson, validateChangelog } from './validate.js';

export interface CodexInput {
  /** The versioned generation prompt. */
  prompt: string;
  /** The released commit log, oldest first. */
  commitLog: string;
}

/** Runs the model and returns its raw text output. Injected so tests supply synthetic output. */
export type CodexRunner = (input: CodexInput) => Promise<string>;

export interface GenerateDeps {
  runCodex: CodexRunner;
  prompt: string;
  /** The release clock. `releasedAt` is stamped from this, never trusted from the model. */
  now: Date;
}

export type GenerateOutcome =
  | { status: 'ok'; changelog: Changelog }
  /** The release has no user-visible changes; no changelog file should be written. */
  | { status: 'empty' }
  /** The model output could not be parsed or failed schema validation; the release should block. */
  | { status: 'invalid'; errors: string[]; raw: string };

/**
 * Strips a surrounding Markdown code fence if the model wrapped its JSON in one, otherwise returns
 * the trimmed text. Pure.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fence?.[1]?.trim() ?? trimmed;
}

/**
 * Generates a Changelog from the released commit log: runs the injected model, classifies the
 * output, and — for a real changelog — stamps the code-controlled release time before gating it
 * against the schema. The model is asked for `sections` only; any `releasedAt` it emits is ignored.
 * Never throws on bad output — returns an `invalid` outcome so the caller can block the release.
 */
export async function generateChangelog(commitLog: string, deps: GenerateDeps): Promise<GenerateOutcome> {
  const raw = await deps.runCodex({ prompt: deps.prompt, commitLog });

  const parsed = parseJson(extractJson(raw));
  if (!parsed.ok) return { status: 'invalid', errors: [parsed.error], raw };

  const sections = (parsed.value as { sections?: unknown })?.sections;
  if (Array.isArray(sections) && sections.length === 0) return { status: 'empty' };

  const candidate = { ...(parsed.value as object), releasedAt: deps.now.toISOString() };
  const result = validateChangelog(candidate);
  if (result.ok) return { status: 'ok', changelog: result.changelog };
  return { status: 'invalid', errors: result.errors, raw };
}
