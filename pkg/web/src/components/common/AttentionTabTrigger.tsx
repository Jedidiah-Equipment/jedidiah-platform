import type React from 'react';

import { TabsTrigger } from '@/components/ui/tabs.js';

type AttentionTabTriggerProps = {
  /** Announced to screen readers in place of the dot, e.g. "No documents added". */
  attentionLabel: string;
  label: string;
  needsAttention: boolean;
  value: string;
};

/** A tab trigger that shows a dot when the tab's content needs the user's attention. */
export const AttentionTabTrigger: React.FC<AttentionTabTriggerProps> = ({
  attentionLabel,
  label,
  needsAttention,
  value,
}) => (
  <TabsTrigger value={value}>
    <span>{label}</span>
    {needsAttention ? (
      <>
        <span aria-hidden className="size-2 rounded-full bg-orange-400" />
        <span className="sr-only">{attentionLabel}</span>
      </>
    ) : null}
  </TabsTrigger>
);
