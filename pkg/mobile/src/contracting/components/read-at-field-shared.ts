import type { Ref } from 'react';

/** `open` shows the picker, as Read earlier does when the ledger names no date to read at. */
export type ReadAtFieldHandle = { open: () => void };

/**
 * The capture's date step when the date may be changed. A picker dismissed, or iOS's inline picker showing the time it
 * opened on, picks nothing; choosing a day or time in it does. Clearing drops the pick, so the estimate stands again.
 */
export type ReadAtFieldProps = {
  /** The date the form will post; null is now. */
  value: Date | null;
  onPick: (at: Date | null) => void;
  disabled?: boolean;
  ref?: Ref<ReadAtFieldHandle>;
};
