export const AI_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export type AiReasoningEffort = (typeof AI_REASONING_EFFORTS)[number];
