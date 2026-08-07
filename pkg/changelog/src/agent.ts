import { execFile } from 'node:child_process';

import type { AgentInput } from './generate.js';

/** The coding-agent CLIs that can generate a Changelog. */
export const AGENT_NAMES = ['codex', 'claude'] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

export function isAgentName(value: string): value is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(value);
}

/** Read-only tools Claude may use to inspect a vague commit before summarising it. */
const CLAUDE_ALLOWED_TOOLS = 'Read,Grep,Glob,Bash(git log:*),Bash(git show:*),Bash(git diff:*)';

export interface AgentCommand {
  bin: string;
  args: string[];
}

/**
 * Builds the non-interactive invocation for an agent. Both agents read the prompt on stdin and
 * print their final text to stdout. Each binary is overridable via `CHANGELOG_<AGENT>_BIN` so
 * releasers can point at a wrapper. Pure — the spawn itself lives in {@link runAgentCli}.
 */
export function agentCommand(agent: AgentName, env: NodeJS.ProcessEnv = process.env): AgentCommand {
  if (agent === 'claude') {
    return {
      bin: env.CHANGELOG_CLAUDE_BIN ?? 'claude',
      // Non-interactive print mode. Tools outside the allowlist are denied rather than prompted for.
      args: ['-p', '--output-format', 'text', '--allowedTools', CLAUDE_ALLOWED_TOOLS],
    };
  }
  return { bin: env.CHANGELOG_CODEX_BIN ?? 'codex', args: ['exec', '-'] };
}

/**
 * Runs the selected agent CLI non-interactively and returns its final text output. The prompt (with
 * the commit log appended) is sent on stdin, and the process runs in `cwd` (the repo root) so the
 * model can inspect a vague commit's diff with its own tools.
 *
 * This is the injected impure adapter for {@link generateChangelog} and is not unit-tested.
 */
export function runAgentCli({ prompt, commitLog }: AgentInput, cwd: string, agent: AgentName): Promise<string> {
  const { bin, args } = agentCommand(agent);
  const input = `${prompt}\n\n<commits>\n${commitLog}\n</commits>\n`;

  return new Promise((resolve, reject) => {
    const child = execFile(bin, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${agent} generation failed: ${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin?.end(input);
  });
}
