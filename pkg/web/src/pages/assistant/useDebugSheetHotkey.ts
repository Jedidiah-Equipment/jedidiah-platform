import { useEffect } from 'react';

/**
 * The assistant debug Sheet toggle: Cmd+. on macOS, Ctrl+. elsewhere. Extracted as a pure
 * predicate so the key matching is unit-testable without a DOM.
 */
export function isDebugSheetHotkey(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>): boolean {
  return event.key === '.' && (event.metaKey || event.ctrlKey);
}

/**
 * Installs a window-level keydown listener that toggles the debug Sheet. Listening on `window`
 * (not a specific element) keeps the hotkey working while the chat composer is focused. The
 * listener only exists while the component is mounted, so no hotkey is active on other pages.
 */
export function useDebugSheetHotkey(onToggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isDebugSheetHotkey(event)) {
        event.preventDefault();
        onToggle();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggle]);
}
