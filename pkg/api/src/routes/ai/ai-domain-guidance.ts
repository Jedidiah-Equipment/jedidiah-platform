import { type AiLinkMetadata, aiLinkMetadata } from './ai-link-metadata.js';
import { AI_TOOL_NAMES, type AiToolName } from './ai-tools.js';

type AiDomainRelationship = {
  from: string;
  to: string;
  meaning: string;
};

type AiRetrievalStep = {
  alternatives?: readonly AiToolName[];
  tool: AiToolName;
  instruction: string;
};

type AiRetrievalPlaybook = {
  intent: string;
  appliesWhen: string;
  steps: readonly AiRetrievalStep[];
  disambiguation: readonly string[];
  linkTargets: readonly AiLinkMetadata[];
};

export const AI_DOMAIN_RELATIONSHIPS = [
  {
    from: 'Customer',
    to: 'Quote',
    meaning: 'A Customer reaches Jobs only through Quotes; there is no direct Customer to Job link.',
  },
  {
    from: 'Quote',
    to: 'Job',
    meaning: 'A Quote sources at most one Job; every Job is created from exactly one accepted Quote.',
  },
  {
    from: 'Job',
    to: 'Department',
    meaning:
      'Every Job has five fixed Pipeline Stages, but users experience and label them as Departments: Procurement, Supply, Fabrication, Paint, Assembly.',
  },
  {
    from: 'Assembly',
    to: 'Part',
    meaning:
      'Assemblies specify Part quantities; the Part owns the unit of measure, so bill-of-materials quantities must be read with the Part unit.',
  },
  {
    from: 'Part',
    to: 'Unit of Measure',
    meaning: 'Part.unitOfMeasure is either quantity for counted parts or mm for millimetre-measured parts.',
  },
] satisfies readonly AiDomainRelationship[];

export const AI_RETRIEVAL_PLAYBOOKS = [
  {
    intent: 'customer_job_progress',
    appliesWhen: 'The user asks about Job progress using a Customer or company name.',
    steps: [
      {
        tool: 'listQuoteCustomers',
        alternatives: ['listCustomers'],
        instruction:
          'Find matching Customers by company name. If customer:read is available instead, listCustomers is also valid.',
      },
      {
        tool: 'listQuotes',
        instruction:
          'Find Quotes for the matched Customer; prefer Quotes with linked Jobs when the user asks about production.',
      },
      {
        tool: 'getJob',
        instruction: 'Fetch each relevant linked Job before summarizing production progress.',
      },
    ],
    disambiguation: [
      'If exactly one relevant active or paused Job exists, answer for that Job.',
      'If multiple active or paused Jobs exist, ask the user to choose and show linked Job Codes.',
      'If only complete or cancelled Jobs exist, state that there are no currently active Jobs before summarizing history.',
      'If the Customer has Quotes but no linked Jobs, explain that no Jobs have been created from those Quotes yet.',
      'Do not summarize multiple Jobs as "the job" unless the user asks for a Customer overview.',
    ],
    linkTargets: [aiLinkMetadata.Job, aiLinkMetadata.Quote, aiLinkMetadata.Customer],
  },
] satisfies readonly AiRetrievalPlaybook[];

const REGISTERED_TOOL_NAMES = new Set<AiToolName>(AI_TOOL_NAMES);

export function assertPlaybooksReferenceRegisteredTools(): void {
  for (const playbook of AI_RETRIEVAL_PLAYBOOKS) {
    for (const step of playbook.steps) {
      for (const toolName of [step.tool, ...(step.alternatives ?? [])]) {
        if (!REGISTERED_TOOL_NAMES.has(toolName)) {
          throw new Error(`AI retrieval playbook ${playbook.intent} references unknown tool ${toolName}`);
        }
      }
    }
  }
}

export function createDomainGuidancePrompt(toolNames: readonly AiToolName[]): string {
  const availableTools = new Set(toolNames);
  const playablePlaybooks = AI_RETRIEVAL_PLAYBOOKS.filter((playbook) =>
    playbook.steps.every((step) => getAvailableStepTool(step, availableTools)),
  );
  const lines = [
    '## Domain Context',
    '',
    'Relationships:',
    ...AI_DOMAIN_RELATIONSHIPS.map(
      (relationship) => `- ${relationship.from} -> ${relationship.to}: ${relationship.meaning}`,
    ),
    '',
    'Entity guidance:',
    ...Object.values(aiLinkMetadata as Record<string, AiLinkMetadata>).flatMap((metadata) =>
      (metadata.guidance ?? []).map((guidance) => `- ${metadata.entity}: ${guidance}`),
    ),
    '',
    'Link rules:',
    '- Use public labels in prose: Job Code, Quote Code, Customer company name, Product name, or User name/email.',
    '- Do not show UUIDs in prose unless the user explicitly asks for storage identifiers.',
    '- Render Markdown links only from link metadata returned by tools or code-owned route metadata.',
  ];

  if (playablePlaybooks.length > 0) {
    lines.push('', 'Retrieval playbooks:');

    for (const playbook of playablePlaybooks) {
      lines.push(`- Intent ${playbook.intent}: ${playbook.appliesWhen}`);
      lines.push(
        `  Steps: ${playbook.steps
          .map((step) => `${getAvailableStepTool(step, availableTools) ?? step.tool}: ${step.instruction}`)
          .join(' ')}`,
      );
      lines.push(`  Disambiguation: ${playbook.disambiguation.join(' ')}`);
      lines.push(
        `  Link targets: ${playbook.linkTargets
          .map((target) => `${target.entity} label ${target.label} href ${target.href}`)
          .join('; ')}.`,
      );
    }
  }

  return lines.join('\n');
}

function getAvailableStepTool(step: AiRetrievalStep, availableTools: ReadonlySet<AiToolName>): AiToolName | null {
  if (availableTools.has(step.tool)) {
    return step.tool;
  }

  return step.alternatives?.find((toolName) => availableTools.has(toolName)) ?? null;
}
