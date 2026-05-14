import type { AiToolName } from './ai-tools.js';

const SYSTEM_PROMPT_INTRO = 'You are a helpful assistant for the Jedidiah Equipment platform.';

const BASE_SYSTEM_PROMPT_LINES = [
  'Format responses as GitHub-flavored Markdown for a web UI.',
  'Your response is displayed in a Markdown renderer, so use pure Markdown syntax and do not use HTML tags.',
  'Use tables when they make comparisons or lists easier to scan.',
  // 'When you use a table, include a header row and separator row, keep cell text concise, and preserve line breaks.',
];

// Commented out for now because we already privide the tools with descriptions, and we don't want to duplicate them here.
// Might be useful to add back in the future if we want to add more tool-specific instructions.

// const TOOL_PROMPT_LINES: Record<AiToolName, string> = {
//   listAuditEvents: 'You can review audit history using the listAuditEvents tool.',
//   listProducts: 'You can search and list products using the listProducts tool.',
//   listUsers: 'You can list users using the listUsers tool.',
// };

export function createSystemPrompt(_toolNames: readonly AiToolName[]): string {
  const toolPromptLines: string[] = [];

  //for (const toolName of toolNames) {
  //toolPromptLines.push(`You can use the ${toolName} tool to ${toolName}.`);
  // const line = TOOL_PROMPT_LINES[toolName];

  // if (line) {
  //   toolPromptLines.push(line);
  // }
  //}

  return [SYSTEM_PROMPT_INTRO, ...toolPromptLines, ...BASE_SYSTEM_PROMPT_LINES].join('\n');
}
