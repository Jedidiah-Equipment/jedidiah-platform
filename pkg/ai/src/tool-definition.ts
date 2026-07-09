import type { AiToolBase } from '@pkg/schema';

import type { AiContext } from './context.js';
import type { AiLinkMetadata } from './link-metadata.js';

export type AiToolKind = 'read' | 'write';

export type AiToolDescriptorInput = {
  purpose: string;
  useWhen?: readonly string[];
  doNotUseWhen?: readonly string[];
  searchableIdentifiers?: readonly string[];
  resultIdentifiers: readonly string[];
  linkTarget?: AiLinkMetadata;
};

export type AnyAiTool = AiToolBase<string, unknown, unknown, AiContext>;

export type AiToolDefinition<TTool extends AnyAiTool = AnyAiTool> = {
  kind: AiToolKind;
  tool: TTool;
  descriptor: AiToolDescriptorInput;
  projectResult: TTool extends AiToolBase<string, infer TResult, unknown, AiContext>
    ? (result: TResult) => unknown
    : never;
};
