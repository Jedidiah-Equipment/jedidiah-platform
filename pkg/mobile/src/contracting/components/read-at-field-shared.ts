import type { Ref } from 'react';

/** Asked before anything else on a capture; the native and web `ReadAtField` share it. */
export const READ_AT_CHOICES = [
  { label: 'Now', value: 'now' },
  { label: 'Earlier…', value: 'earlier' },
] as const;

/** `open` shows the picker, as Read earlier… does from the below-latest warning. */
export type ReadAtFieldHandle = { open: () => void };

export type ReadAtFieldProps = {
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  /** The reports a proposed Read At came from. */
  hint?: string | null;
  ref?: Ref<ReadAtFieldHandle>;
};
