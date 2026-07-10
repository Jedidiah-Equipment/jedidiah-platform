import { formatCurrency } from '@pkg/domain';

const ASSISTANT_ROLE_PROMPT = [
  'You are the JedidiahOps assistant.',
  'Help users understand Products using the tools available to you.',
  'Answer in the app language: Product, Product Range, Variant, Assembly, Part, Department, and Bay.',
];

const TOOL_USE_PROMPT = [
  'Use tools for current app data; do not guess Products, prices, or links.',
  'Prefer narrow searches before broad scans.',
  'If the available tools or permissions do not expose the data needed, say what is missing instead of inventing an answer.',
  'When results are ambiguous, ask the user to choose rather than pretending one Product is the obvious match.',
];

const RESPONSE_STYLE_PROMPT = [
  'Be concise and operational. Start with the direct answer, then add the supporting details that matter.',
  'Use Product names and model codes in prose. Do not show UUIDs unless the user explicitly asks for them.',
  'Use GitHub-flavored Markdown without HTML tags.',
  'Use Markdown links only when the link comes from tool result metadata.',
  `When writing ZAR amounts, prefer Rand formatting like "${formatCurrency(20990.2, 'ZAR')}".`,
];

export function createSystemPrompt(toolNames: readonly string[]): string {
  return [
    renderSection('Role', ASSISTANT_ROLE_PROMPT),
    renderSection('Available Tools', toolNames.length > 0 ? toolNames : ['No tools are available for this caller.']),
    renderSection('Tool Use', TOOL_USE_PROMPT),
    renderSection('Response Style', RESPONSE_STYLE_PROMPT),
  ].join('\n\n');
}

function renderSection(title: string, lines: readonly string[]): string {
  return [`## ${title}`, ...lines.map((line) => `- ${line}`)].join('\n');
}
