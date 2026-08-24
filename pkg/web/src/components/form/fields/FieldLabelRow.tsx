import type { HelpTopic } from '@pkg/domain';
import type React from 'react';

import { HelpLink } from '@/components/help/index.js';
import { FieldLabel } from '@/components/ui/field.js';

export type FieldHelp = {
  /** Accessible label describing what the link opens, e.g. "How Estimated Stock on Hand works". */
  label: string;
  topic: HelpTopic;
};

type FieldLabelRowProps = {
  children: React.ReactNode;
  help?: FieldHelp | undefined;
  htmlFor: string;
};

/**
 * A field's label, plus the Help affordance when that field's topic is narrower than its page. Every
 * form field renders its label through here so the link sits in the same place on all of them.
 *
 * The link is the label's sibling rather than its child: a `<label>` may not contain interactive
 * content, and nesting it would make a click on the link also focus the control.
 */
export function FieldLabelRow({ children, help, htmlFor }: FieldLabelRowProps) {
  if (!help) {
    return <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>;
  }

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <FieldLabel htmlFor={htmlFor}>{children}</FieldLabel>
      <HelpLink label={help.label} topic={help.topic} />
    </div>
  );
}
