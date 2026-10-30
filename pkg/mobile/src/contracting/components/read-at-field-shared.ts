import { READ_AT_NOW, type ReadAtChoice, readAtEarlier } from '@pkg/domain/contracting';
import type { Ref } from 'react';

/** Asked before anything else on a capture; the native and web `ReadAtField` share it. */
export const READ_AT_CHOICES = [
  { label: 'Now', value: 'now' },
  { label: 'Earlier…', value: 'earlier' },
] as const;

/** `open` chooses Earlier… and shows the picker, as Read earlier… does from the below-latest warning. */
export type ReadAtFieldHandle = { open: () => void };

/** A move of the Read At choice, applied to whatever it is by then. */
export type ReadAtUpdate = (choice: ReadAtChoice) => ReadAtChoice;

/**
 * Earlier… holds Save until a time is picked on every surface: a picker dismissed, or iOS's inline picker showing the
 * time it opened on, picks nothing. Choosing a day or time in it does.
 */
export type ReadAtFieldProps = {
  choice: ReadAtChoice;
  onChange: (update: ReadAtUpdate) => void;
  disabled?: boolean;
  /** The reports a proposed Read At came from. */
  hint?: string | null;
  ref?: Ref<ReadAtFieldHandle>;
};

/** The segment's answer: Now posts the moment of capture; Earlier… keeps a time already set and opens the picker. */
export function chooseReadAt(next: 'now' | 'earlier', onChange: ReadAtFieldProps['onChange'], openPicker: () => void) {
  if (next === 'now') onChange(() => READ_AT_NOW);
  else {
    onChange(readAtEarlier);
    openPicker();
  }
}
