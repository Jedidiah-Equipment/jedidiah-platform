import type { AiToolDescriptorInput } from './tool-definition.js';

export function createToolDescription(descriptor: AiToolDescriptorInput): string {
  const lines = [descriptor.purpose];

  if (descriptor.useWhen?.length) {
    lines.push(`Use when: ${descriptor.useWhen.join(' ')}`);
  }

  if (descriptor.doNotUseWhen?.length) {
    lines.push(`Do not use when: ${descriptor.doNotUseWhen.join(' ')}`);
  }

  if (descriptor.searchableIdentifiers?.length) {
    lines.push(`Free-text search matches: ${descriptor.searchableIdentifiers.join(', ')}.`);
  }

  lines.push(`Relevant result identifiers: ${descriptor.resultIdentifiers.join(', ')}.`);

  if (descriptor.linkTarget) {
    lines.push(`Links: ${descriptor.linkTarget.entity} records link by ${descriptor.linkTarget.label}.`);
  }

  return lines.join('\n');
}
