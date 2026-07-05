import type { AiToolDescriptorInput } from './tool-definition.js';

export function createToolDescription(descriptor: AiToolDescriptorInput): string {
  const lines = [
    descriptor.purpose,
    `Use when: ${descriptor.useWhen.join(' ')}`,
    `Do not use when: ${descriptor.doNotUseWhen.join(' ')}`,
    `Searchable identifiers: ${descriptor.searchableIdentifiers.join(', ')}.`,
    `Relevant result identifiers: ${descriptor.resultIdentifiers.join(', ')}.`,
  ];

  if (descriptor.linkTarget) {
    lines.push(
      `Link target: ${descriptor.linkTarget.entity} links use label ${descriptor.linkTarget.label} and href pattern ${descriptor.linkTarget.href}.`,
    );
  }

  return lines.join('\n');
}
