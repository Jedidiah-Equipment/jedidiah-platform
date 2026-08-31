import { textClassNameForScheme } from '@pkg/domain';

import { useColorMode } from './use-color-mode';

/**
 * Resolves a shared palette's two-tone `text` class to the half the active scheme paints.
 *
 * Native cannot lean on NativeWind's `dark:` variant for this: it reads an app-wide appearance
 * store that an in-app preference only reaches through a platform echo. Picking the half here keeps
 * a light-mode screen off the dark palette regardless of whether that echo lands.
 */
export function useTextClassNameForScheme(): (text: string) => string {
  const { resolved } = useColorMode();

  return (text) => textClassNameForScheme(text, resolved);
}
