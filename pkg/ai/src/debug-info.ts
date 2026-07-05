import type { AppPermission, UserAccessSummary } from '@pkg/schema';

import type { AiLinkMetadata } from './link-metadata.js';
import { createSystemPrompt } from './prompts.js';
import type { AiToolKind } from './tool-definition.js';
import { AI_TOOL_REGISTRY } from './tool-registry.js';
import { getAuthorizedToolNames, getAuthorizedTools } from './tools.js';

export type AiToolDebugInfo = {
  authorized: boolean;
  doNotUseWhen: readonly string[];
  jsonSchema: Record<string, unknown>;
  kind: AiToolKind;
  linkTarget: AiLinkMetadata | null;
  name: string;
  purpose: string;
  requiredPermission: AppPermission;
  resultIdentifiers: readonly string[];
  searchableIdentifiers: readonly string[];
  useWhen: readonly string[];
};

export type AiDebugInfo = {
  systemPrompt: string;
  tools: AiToolDebugInfo[];
};

export function getAiDebugInfo(access: UserAccessSummary | null): AiDebugInfo {
  const authorizedToolNames = getAuthorizedToolNames(getAuthorizedTools(access));
  const authorizedToolNameSet = new Set<string>(authorizedToolNames);

  return {
    systemPrompt: createSystemPrompt(authorizedToolNames),
    tools: AI_TOOL_REGISTRY.map((definition) => ({
      authorized: authorizedToolNameSet.has(definition.tool.name),
      doNotUseWhen: definition.descriptor.doNotUseWhen,
      jsonSchema: definition.tool.jsonSchema,
      kind: definition.kind,
      linkTarget: definition.descriptor.linkTarget ?? null,
      name: definition.tool.name,
      purpose: definition.descriptor.purpose,
      requiredPermission: definition.tool.requiredPermission,
      resultIdentifiers: definition.descriptor.resultIdentifiers,
      searchableIdentifiers: definition.descriptor.searchableIdentifiers,
      useWhen: definition.descriptor.useWhen,
    })),
  };
}
