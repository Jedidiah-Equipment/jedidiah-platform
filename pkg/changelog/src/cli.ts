import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { runCodexCli } from './codex.js';
import { deriveChangelogBasename } from './filename.js';
import { existingBasenames, listChangelogFiles, removeFiles, writeChangelogFile } from './files.js';
import { generateChangelog } from './generate.js';
import { readReleaseCommitLog } from './git.js';
import { CHANGELOG_MAX_AGE_DAYS, selectStaleChangelogs } from './prune.js';
import { validateChangelogJson } from './validate.js';

const PROMPT_PATH = new URL('../prompts/generate-changelog.md', import.meta.url);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * `generate --from <ref> --to <ref> --dir <changelogs> [--repo <root>] [--dry-run]`
 * Generates and validates a changelog for the `from..to` release. Prints it. Writes it under
 * `--dir` unless `--dry-run`. Exits non-zero (blocking the release) on generation or validation
 * failure. Exits 0 without writing when the release has no user-visible changes.
 */
async function generate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      dir: { type: 'string' },
      repo: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const from = values.from ?? fail('generate: --from <ref> is required');
  const to = values.to ?? fail('generate: --to <ref> is required');
  const dir = values.dir ?? fail('generate: --dir <changelogs-dir> is required');
  const repo = values.repo ?? process.cwd();

  const commitLog = await readReleaseCommitLog(from, to, repo);
  if (commitLog.length === 0) {
    process.stdout.write('No commits to release; skipping changelog generation.\n');
    return;
  }

  const prompt = readFileSync(PROMPT_PATH, 'utf8');
  const outcome = await generateChangelog(commitLog, {
    runCodex: (input) => runCodexCli(input, repo),
    prompt,
    now: new Date(),
  });

  if (outcome.status === 'invalid') {
    fail(
      `Changelog generation failed schema validation:\n${outcome.errors.map((e) => `  - ${e}`).join('\n')}\n\nModel output:\n${outcome.raw}`,
    );
  }
  if (outcome.status === 'empty') {
    process.stdout.write('No user-visible changes in this release; no changelog written.\n');
    return;
  }

  const json = `${JSON.stringify(outcome.changelog, null, 2)}\n`;
  if (values['dry-run']) {
    process.stdout.write(`Would write changelog:\n${json}`);
    return;
  }

  const basename = deriveChangelogBasename(outcome.changelog.releasedAt, existingBasenames(dir));
  const path = writeChangelogFile(dir, basename, outcome.changelog);
  process.stdout.write(`Wrote ${path}\n\n${json}`);
}

/**
 * `validate <file>` or `validate --dir <changelogs>` — re-validates changelog files after manual
 * review edits. The `--dir` form gates every file in the directory before the release commit.
 */
function validate(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { dir: { type: 'string' } },
  });

  const files = values.dir
    ? existingBasenames(values.dir).map((base) => join(values.dir as string, `${base}.json`))
    : [positionals[0] ?? fail('validate: a changelog file path or --dir is required')];

  for (const file of files) {
    const result = validateChangelogJson(readFileSync(file, 'utf8'));
    if (!result.ok) {
      fail(`${file} is not a valid changelog:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
    }
  }
  process.stdout.write(`Validated ${files.length} changelog file(s).\n`);
}

/** `prune --dir <changelogs>` — removes changelog files past the display window. */
function prune(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { dir: { type: 'string' } } });
  const dir = values.dir ?? fail('prune: --dir <changelogs-dir> is required');

  const stale = selectStaleChangelogs(listChangelogFiles(dir), new Date(), CHANGELOG_MAX_AGE_DAYS);
  removeFiles(stale);
  if (stale.length === 0) process.stdout.write('No stale changelogs to prune.\n');
  else process.stdout.write(`Pruned ${stale.length} stale changelog(s):\n${stale.map((p) => `  - ${p}`).join('\n')}\n`);
}

async function main(): Promise<void> {
  // Tolerate a leading `--` forwarded by package-manager arg separators.
  const args = process.argv.slice(2);
  const [command, ...rest] = args[0] === '--' ? args.slice(1) : args;
  switch (command) {
    case 'generate':
      await generate(rest);
      break;
    case 'validate':
      validate(rest);
      break;
    case 'prune':
      prune(rest);
      break;
    default:
      fail(`Unknown command: ${command ?? '(none)'}\nUsage: changelog <generate|validate|prune> [options]`);
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
