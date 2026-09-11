import {
  BUSINESSES,
  CHANGELOG_SURFACES_BY_BUSINESS,
  type Changelog,
  ChangelogSection,
  ChangelogSurface,
} from '@pkg/schema';
import { z } from 'zod';

import { parseJson, validateChangelog } from './validate.js';

export interface AgentInput {
  /** The versioned generation prompt. */
  prompt: string;
  /** The released commit log, oldest first, with per-commit business hints. */
  commitLog: string;
}

/** Runs the model and returns its raw text output. Injected so tests supply synthetic output. */
export type AgentRunner = (input: AgentInput) => Promise<string>;

export interface GenerateDeps {
  runAgent: AgentRunner;
  prompt: string;
  /** The release clock. `releasedAt` is stamped from this, never trusted from the model. */
  now: Date;
}

export type GenerateOutcome =
  /** One changelog per business with user-visible changes, in business order. */
  | { status: 'ok'; changelogs: Changelog[] }
  /** The release has no user-visible changes for any business; no file should be written. */
  | { status: 'empty' }
  /** The model output could not be parsed or failed schema validation; the release should block. */
  | { status: 'invalid'; errors: string[]; raw: string };

/** The keys the model may emit: each business, plus `shared` for changes both businesses see. */
const OUTPUT_KEYS = [...BUSINESSES, 'shared'] as const;

/** A block the model emits under one key. Sections are entry-level valid; the per-business rules come later. */
const OutputBlock = z.object({ sections: z.array(ChangelogSection) });

/** The model output: every key optional, so a missing business reads as nothing to say. */
const ModelOutput = z.object(Object.fromEntries(OUTPUT_KEYS.map((key) => [key, OutputBlock.optional()])));

/** The Surfaces every business ships on; a `shared` section may use only these. */
const SHARED_SURFACES = new Set(
  ChangelogSurface.options.filter((surface) =>
    BUSINESSES.every((business) => CHANGELOG_SURFACES_BY_BUSINESS[business].includes(surface)),
  ),
);

/**
 * Strips a surrounding Markdown code fence if the model wrapped its JSON in one, otherwise returns
 * the trimmed text. Pure.
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return fence?.[1]?.trim() ?? trimmed;
}

/** Merges a business's own sections with the shared ones: one section per surface, the business's entries first. */
function mergeSections(own: readonly ChangelogSection[], shared: readonly ChangelogSection[]): ChangelogSection[] {
  const bySurface = new Map<ChangelogSurface, ChangelogSection>();
  for (const section of [...own, ...shared]) {
    const existing = bySurface.get(section.surface);
    if (existing) existing.entries.push(...section.entries);
    else bySurface.set(section.surface, { surface: section.surface, entries: [...section.entries] });
  }
  return [...bySurface.values()];
}

/**
 * Generates the release's Changelogs from the hinted commit log: runs the injected model once, fans
 * its `shared` sections into both businesses, and — for each business with anything to say — stamps
 * the code-controlled release time before gating it against the schema. The model is asked for
 * sections only; any `releasedAt` it emits is ignored. Never throws on bad output — returns an
 * `invalid` outcome so the caller can block the release.
 */
export async function generateChangelogs(commitLog: string, deps: GenerateDeps): Promise<GenerateOutcome> {
  const raw = await deps.runAgent({ prompt: deps.prompt, commitLog });

  const parsed = parseJson(extractJson(raw));
  if (!parsed.ok) return { status: 'invalid', errors: [parsed.error], raw };

  const output = ModelOutput.safeParse(parsed.value);
  if (!output.success) {
    return {
      status: 'invalid',
      errors: output.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      raw,
    };
  }
  if (OUTPUT_KEYS.every((key) => output.data[key] === undefined)) {
    return { status: 'invalid', errors: [`(root): expected at least one of ${OUTPUT_KEYS.join(', ')}`], raw };
  }

  const shared = output.data.shared?.sections ?? [];
  const sharedOnly = shared.map((section) => section.surface).filter((surface) => !SHARED_SURFACES.has(surface));
  if (sharedOnly.length > 0) {
    return {
      status: 'invalid',
      errors: [`shared.sections: the ${sharedOnly.join(', ')} surface does not belong to every business`],
      raw,
    };
  }

  const changelogs: Changelog[] = [];
  const errors: string[] = [];
  for (const business of BUSINESSES) {
    const sections = mergeSections(output.data[business]?.sections ?? [], shared);
    if (sections.length === 0) continue;
    const result = validateChangelog({ business, releasedAt: deps.now.toISOString(), sections });
    if (result.ok) changelogs.push(result.changelog);
    else errors.push(...result.errors.map((error) => `${business}: ${error}`));
  }

  if (errors.length > 0) return { status: 'invalid', errors, raw };
  if (changelogs.length === 0) return { status: 'empty' };
  return { status: 'ok', changelogs };
}
