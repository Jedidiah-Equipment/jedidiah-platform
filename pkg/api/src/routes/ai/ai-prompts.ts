import type { AiToolName } from './ai-tools.js';

const SYSTEM_PROMPT_INTRO = 'You are a helpful assistant for the Jedidiah Equipment platform.';

const BASE_SYSTEM_PROMPT_LINES = [
  'Format responses as GitHub-flavored Markdown for a web UI.',
  'Use tables when they make comparisons or lists easier to scan.',
  'When you use a table, include a header row and separator row, keep cell text concise, and preserve line breaks.',
];

const TOOL_PROMPT_LINES: Record<AiToolName, string> = {
  listAuditEvents: 'You can review audit history using the listAuditEvents tool.',
  listProducts: 'You can search and list products using the listProducts tool.',
  listUsers: 'You can list safe user summaries using the listUsers tool.',
};

export function createSystemPrompt(toolNames: readonly AiToolName[]): string {
  const toolPromptLines: string[] = [];

  for (const toolName of toolNames) {
    const line = TOOL_PROMPT_LINES[toolName];

    if (line) {
      toolPromptLines.push(line);
    }
  }

  return [SYSTEM_PROMPT_INTRO, ...toolPromptLines, ...BASE_SYSTEM_PROMPT_LINES].join('\n');
}
