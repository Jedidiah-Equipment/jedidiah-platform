import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parseArgs } from 'node:util';

import { AGENT_NAMES, isAgentName, runAgentCli } from './agent.js';
import { deriveChangelogBasename } from './filename.js';
import { existingBasenames, listChangelogFiles, listJsonPaths, removeFiles, writeChangelogFile } from './files.js';
import { generateChangelogs } from './generate.js';
import { readReleaseCommitLog } from './git.js';
import { selectStaleChangelogs } from './prune.js';
import { businessFromDirectoryName, validateChangelogJson } from './validate.js';

const PROMPT_PATH = new URL('../prompts/generate-changelog.md', import.meta.url);

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/**
 * `generate --from <ref> --to <ref> --dir <changelogs> [--repo <root>] [--agent <name>] [--dry-run]`
 * Generates and validates the `from..to` release's changelogs, one per business with user-visible
 * changes. Prints them. Writes each under `--dir/<business>/` unless `--dry-run`. Exits non-zero
 * (blocking the release) on generation or validation failure. Exits 0 without writing when the
 * release has no user-visible changes for either business.
 */
async function generate(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      from: { type: 'string' },
      to: { type: 'string' },
      dir: { type: 'string' },
      repo: { type: 'string' },
      agent: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const from = values.from ?? fail('generate: --from <ref> is required');
  const to = values.to ?? fail('generate: --to <ref> is required');
  const dir = values.dir ?? fail('generate: --dir <changelogs-dir> is required');
  const repo = values.repo ?? process.cwd();
  const requested = values.agent ?? process.env.CHANGELOG_AGENT ?? 'codex';
  if (!isAgentName(requested)) fail(`generate: unknown --agent '${requested}' (expected ${AGENT_NAMES.join(' or ')})`);
  const agent = requested;

  const commitLog = await readReleaseCommitLog(from, to, repo);
  if (commitLog.length === 0) {
    process.stdout.write('No commits to release; skipping changelog generation.\n');
    return;
  }

  const prompt = readFileSync(PROMPT_PATH, 'utf8');
  process.stdout.write(`Generating with ${agent}.\n`);
  const outcome = await generateChangelogs(commitLog, {
    runAgent: (input) => runAgentCli(input, repo, agent),
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

  for (const changelog of outcome.changelogs) {
    const json = `${JSON.stringify(changelog, null, 2)}\n`;
    if (values['dry-run']) {
      process.stdout.write(`Would write ${changelog.business} changelog:\n${json}`);
      continue;
    }
    const basename = deriveChangelogBasename(changelog.releasedAt, existingBasenames(dir, changelog.business));
    const path = writeChangelogFile(dir, basename, changelog);
    process.stdout.write(`Wrote ${path}\n\n${json}`);
  }
}

/**
 * `validate <file>` or `validate --dir <changelogs>` — re-validates changelog files after manual
 * review edits. The `--dir` form gates every file beneath the root before the release commit. Both
 * forms check a file's business against the directory it sits in.
 */
function validate(argv: string[]): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { dir: { type: 'string' } },
  });

  const single = positionals[0];
  const files = values.dir
    ? listJsonPaths(values.dir)
    : single
      ? [{ path: single, business: businessFromDirectoryName(basename(dirname(single))) }]
      : fail('validate: a changelog file path or --dir is required');

  for (const file of files) {
    const result = validateChangelogJson(readFileSync(file.path, 'utf8'), file);
    if (!result.ok) {
      fail(`${file.path} is not a valid changelog:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`);
    }
  }
  process.stdout.write(`Validated ${files.length} changelog file(s).\n`);
}

/** `prune --dir <changelogs>` — removes changelog files past the display window from every business directory. */
function prune(argv: string[]): void {
  const { values } = parseArgs({ args: argv, options: { dir: { type: 'string' } } });
  const dir = values.dir ?? fail('prune: --dir <changelogs-dir> is required');

  const stale = selectStaleChangelogs(listChangelogFiles(dir), new Date());
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
