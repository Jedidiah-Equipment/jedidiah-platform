import type { AppPermission, UserAccessSummary } from '@pkg/schema';

import { type ContextTokenEstimate, estimateContextTokens } from './context-size.js';
import type { AiLinkMetadata } from './link-metadata.js';
import { createSystemPrompt } from './prompts.js';
import type { AiToolKind } from './tool-definition.js';
import { AI_TOOL_REGISTRY } from './tool-registry.js';
import { AI_TOOL_RESULT_MAX_SERIALIZED_BYTES } from './tools/projections.js';
import { getAuthorizedToolNames, getAuthorizedTools, getToolSuppressedByPrimary } from './tools.js';

export type AiToolDebugInfo = {
  authorized: boolean;
  doNotUseWhen: readonly string[];
  jsonSchema: Record<string, unknown>;
  kind: AiToolKind;
  linkTarget: AiLinkMetadata | null;
  name: string;
  purpose: string;
  requiredPermission: AppPermission | null;
  resultIdentifiers: readonly string[];
  searchableIdentifiers: readonly string[];
  suppressedBy: string | null;
  useWhen: readonly string[];
};

export type AiDebugInfo = {
  estimatedInputTokens: ContextTokenEstimate;
  systemPrompt: string;
  toolResultMaxSerializedBytes: number;
  tools: AiToolDebugInfo[];
};

export function getAiDebugInfo(access: UserAccessSummary | null): AiDebugInfo {
  const authorizedTools = getAuthorizedTools(access);
  const authorizedToolNames = getAuthorizedToolNames(authorizedTools);
  const authorizedToolNameSet = new Set<string>(authorizedToolNames);
  const systemPrompt = createSystemPrompt(authorizedToolNames);

  return {
    estimatedInputTokens: estimateContextTokens(systemPrompt, authorizedTools),
    systemPrompt,
    toolResultMaxSerializedBytes: AI_TOOL_RESULT_MAX_SERIALIZED_BYTES,
    tools: AI_TOOL_REGISTRY.map((definition) => ({
      authorized: authorizedToolNameSet.has(definition.tool.name),
      doNotUseWhen: definition.descriptor.doNotUseWhen ?? [],
      jsonSchema: definition.tool.jsonSchema,
      kind: definition.kind,
      linkTarget: definition.descriptor.linkTarget ?? null,
      name: definition.tool.name,
      purpose: definition.descriptor.purpose,
      requiredPermission: definition.tool.requiredPermission,
      resultIdentifiers: definition.descriptor.resultIdentifiers,
      searchableIdentifiers: definition.descriptor.searchableIdentifiers ?? [],
      suppressedBy: getToolSuppressedByPrimary(definition.tool.name, access),
      useWhen: definition.descriptor.useWhen ?? [],
    })),
  };
}
