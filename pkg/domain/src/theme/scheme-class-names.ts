const DARK_VARIANT_PREFIX = 'dark:';

/**
 * The half of a two-tone `"<light> dark:<dark>"` palette class that `scheme` paints.
 *
 * Web never needs this: the `.dark` class on `<html>` lets CSS pick. React Native resolves the
 * `dark:` variant from NativeWind's app-wide appearance store, which an explicit in-app theme
 * preference cannot drive on its own — `Appearance.setColorScheme` changes the platform's own
 * appearance and only reports back through a native echo. Native callers therefore choose the half
 * themselves rather than depending on that echo arriving.
 *
 * A class with no `dark:` variant is scheme-independent and comes back unchanged.
 */
export function textClassNameForScheme(text: string, scheme: 'light' | 'dark'): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const wanted = tokens.filter((token) => token.startsWith(DARK_VARIANT_PREFIX) === (scheme === 'dark'));
  const resolved = wanted.length > 0 ? wanted : tokens;

  return resolved.map((token) => token.replace(DARK_VARIANT_PREFIX, '')).join(' ');
}
