/** Mobile web receives no pushes, so there is no tap to follow. */
export function usePushResponseNavigation(): void {}

export const pendingPushPath = (): string | null => null;

export function useSettlePendingPushPath(): void {}
