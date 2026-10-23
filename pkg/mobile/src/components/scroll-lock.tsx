import { createContext, useContext, useState } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

/**
 * Lets a press-and-hold control inside a scrolling page stop it scrolling while held: a native scroll takes the touch
 * over and the hold ends early. Outside such a page it does nothing.
 */
export const ScrollLockContext = createContext<(locked: boolean) => void>(() => undefined);

export function useScrollLock() {
  return useContext(ScrollLockContext);
}

/** A `ScrollView` its children can hold still with `useScrollLock`. Every scrolling form body is one. */
export function ScrollLockScrollView({ children, ...props }: Omit<ScrollViewProps, 'scrollEnabled'>) {
  const [locked, setLocked] = useState(false);
  return (
    <ScrollView {...props} scrollEnabled={!locked}>
      <ScrollLockContext.Provider value={setLocked}>{children}</ScrollLockContext.Provider>
    </ScrollView>
  );
}
