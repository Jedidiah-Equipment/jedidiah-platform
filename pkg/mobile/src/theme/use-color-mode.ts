import { useContext } from 'react';

import { ColorModeContext } from './ColorModeProvider';

// Read/override the light/dark/system preference. The control surface that
// consumes this (a settings toggle) lands in #518.
export function useColorMode() {
  const context = useContext(ColorModeContext);

  if (!context) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }

  return context;
}
