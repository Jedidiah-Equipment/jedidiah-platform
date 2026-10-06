import { createContext, useContext } from 'react';

/**
 * Lets a press-and-hold control inside a scrolling page stop it scrolling while held: a native scroll takes the touch
 * over and the hold ends early. Outside such a page it does nothing.
 */
export const ScrollLockContext = createContext<(locked: boolean) => void>(() => undefined);

export function useScrollLock() {
  return useContext(ScrollLockContext);
}
