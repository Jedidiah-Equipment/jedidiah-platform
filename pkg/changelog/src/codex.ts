import { execFile } from 'node:child_process';

import type { CodexInput } from './generate.js';

/**
 * Runs the local codex CLI non-interactively and returns its final text output. The prompt (with
 * the commit log appended) is sent on stdin, and the process runs in `cwd` (the repo root) so the
 * model can inspect a vague commit's diff with its own tools. The binary is configurable via
 * `CHANGELOG_CODEX_BIN` so releasers can point at a wrapper; it defaults to `codex`.
 *
 * This is the injected impure adapter for {@link generateChangelog} and is not unit-tested.
 */
export function runCodexCli({ prompt, commitLog }: CodexInput, cwd: string): Promise<string> {
  const bin = process.env.CHANGELOG_CODEX_BIN ?? 'codex';
  const input = `${prompt}\n\n<commits>\n${commitLog}\n</commits>\n`;

  return new Promise((resolve, reject) => {
    const child = execFile(bin, ['exec', '-'], { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`codex generation failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin?.end(input);
  });
}
