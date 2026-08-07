import { describe, expect, it } from 'vitest';

import { agentCommand, isAgentName } from './agent.js';

describe('agentCommand', () => {
  it('runs codex non-interactively with the prompt on stdin', () => {
    expect(agentCommand('codex', {})).toEqual({ bin: 'codex', args: ['exec', '-'] });
  });

  it('runs claude in print mode with only read-only tools allowed', () => {
    const { bin, args } = agentCommand('claude', {});
    expect(bin).toBe('claude');
    expect(args).toContain('-p');
    const allowed = args[args.indexOf('--allowedTools') + 1];
    expect(allowed).toContain('Bash(git show:*)');
    expect(allowed).not.toContain('Write');
  });

  it('honours the per-agent binary override', () => {
    expect(agentCommand('codex', { CHANGELOG_CODEX_BIN: '/opt/codex' }).bin).toBe('/opt/codex');
    expect(agentCommand('claude', { CHANGELOG_CLAUDE_BIN: '/opt/claude' }).bin).toBe('/opt/claude');
  });
});

describe('isAgentName', () => {
  it('accepts the supported agents and rejects anything else', () => {
    expect(isAgentName('codex')).toBe(true);
    expect(isAgentName('claude')).toBe(true);
    expect(isAgentName('gpt')).toBe(false);
  });
});
