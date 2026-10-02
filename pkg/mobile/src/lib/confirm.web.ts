import type { ConfirmOptions } from './confirm';

export type { ConfirmOptions } from './confirm';

/** React Native Web has no Alert; the browser's own dialog stands in for the confirm sheet. */
export async function confirm({ title, message }: ConfirmOptions): Promise<boolean> {
  return window.confirm(message ? `${title}\n\n${message}` : title);
}
