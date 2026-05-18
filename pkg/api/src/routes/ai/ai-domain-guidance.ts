import { AI_TOOL_NAMES, type AiToolName } from './ai-tools.js';

type AiDomainRelationship = {
  from: string;
  to: string;
  meaning: string;
};

type AiRetrievalStep = {
  tool: AiToolName;
  instruction: string;
};

type AiRetrievalPlaybook = {
  intent: string;
  appliesWhen: string;
  steps: readonly AiRetrievalStep[];
  disambiguation: readonly string[];
  linkTargets: readonly {
    entity: string;
    label: string;
    href: string;
  }[];
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
    meaning: 'An accepted Quote may be converted into at most one Job; a Job may also exist without a Quote.',
  },
  {
    from: 'Job',
    to: 'Department',
    meaning:
      'Every Job has five fixed Pipeline Stages, but users experience and label them as Departments: Procurement, Fabrication, Assembly, Paint, Dispatch.',
  },
] satisfies readonly AiDomainRelationship[];

export const AI_RETRIEVAL_PLAYBOOKS = [
  {
    intent: 'customer_job_progress',
    appliesWhen: 'The user asks about Job progress using a Customer or company name.',
    steps: [
      {
        tool: 'listQuoteCustomers',
        instruction:
          'Find matching Customers by company name. If customer:read is available instead, listCustomers is also valid.',
      },
      {
        tool: 'listQuotes',
        instruction:
          'Find Quotes for the matched Customer; prefer accepted Quotes and Quotes with linked jobId or Job Code.',
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
      'If the Customer has Quotes but no linked Jobs, explain that no Job has been created from those Quotes yet.',
      'Do not summarize multiple Jobs as "the job" unless the user asks for a Customer overview.',
    ],
    linkTargets: [
      {
        entity: 'Job',
        href: '/jobs/{id}',
        label: 'code',
      },
      {
        entity: 'Quote',
        href: '/quotes/{id}',
        label: 'code',
      },
      {
        entity: 'Customer',
        href: '/customers/{id}/edit',
        label: 'companyName',
      },
    ],
  },
] satisfies readonly AiRetrievalPlaybook[];

const REGISTERED_TOOL_NAMES = new Set<AiToolName>(AI_TOOL_NAMES);

export function assertPlaybooksReferenceRegisteredTools(): void {
  for (const playbook of AI_RETRIEVAL_PLAYBOOKS) {
    for (const step of playbook.steps) {
      if (!REGISTERED_TOOL_NAMES.has(step.tool)) {
        throw new Error(`AI retrieval playbook ${playbook.intent} references unknown tool ${step.tool}`);
      }
    }
  }
}

export function createDomainGuidancePrompt(toolNames: readonly AiToolName[]): string {
  const availableTools = new Set(toolNames);
  const playablePlaybooks = AI_RETRIEVAL_PLAYBOOKS.filter((playbook) =>
    playbook.steps.every((step) => availableTools.has(step.tool)),
  );
  const lines = [
    '## Domain Context',
    '',
    'Relationships:',
    ...AI_DOMAIN_RELATIONSHIPS.map(
      (relationship) => `- ${relationship.from} -> ${relationship.to}: ${relationship.meaning}`,
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
      lines.push(`  Steps: ${playbook.steps.map((step) => `${step.tool}: ${step.instruction}`).join(' ')}`);
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
