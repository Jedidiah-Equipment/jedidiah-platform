import { useContext } from 'react';

import { ColorModeContext } from './ColorModeProvider';

// Read/override the persisted theme preference (system, light, or dark).
export function useColorMode() {
  const context = useContext(ColorModeContext);

  if (!context) {
    throw new Error('useColorMode must be used within a ColorModeProvider');
  }

  return context;
}
