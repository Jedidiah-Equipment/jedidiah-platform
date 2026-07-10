import { formatCurrency } from '@pkg/domain';

const ASSISTANT_ROLE_PROMPT = ['You are the JedidiahOps assistant.'];

const RESPONSE_STYLE_PROMPT = [
  'Use GitHub-flavored Markdown without HTML tags.',
  'Use Markdown links only when the link comes from tool result metadata.',
  'When a tool result contains `links.app`, render the first mention of that entity as a Markdown link whose label is the entity name and whose URL is exactly `links.app`.',
  'Example: for name "Compact Loader" and links.app "/products/123/edit", write `[Compact Loader](/products/123/edit)`.',
  'Do not show the raw app URL or add a separate "View" link.',
  'Never invent or modify a URL. If `links.app` is absent, use plain text.',
  `When writing ZAR amounts, prefer Rand formatting like "${formatCurrency(20990.2, 'ZAR')}".`,
];

export function createSystemPrompt(): string {
  return [renderSection('Role', ASSISTANT_ROLE_PROMPT), renderSection('Response Style', RESPONSE_STYLE_PROMPT)].join(
    '\n\n',
  );
}

function renderSection(title: string, lines: readonly string[]): string {
  return [`## ${title}`, ...lines.map((line) => `- ${line}`)].join('\n');
}
