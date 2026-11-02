/** Mobile web receives no pushes, so there is no tap to follow. */
import type { PushOpeners } from './push-response';

export function usePushResponseNavigation(_openers?: PushOpeners): void {}

export const pendingPushPath = (): string | null => null;

export function useSettlePendingPushPath(): void {}
