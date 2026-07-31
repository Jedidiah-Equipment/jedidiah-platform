import { useEffect, useLayoutEffect } from 'react';

// React logs a warning when useLayoutEffect runs during SSR, where it cannot measure anything.
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
