import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/login', push: vi.fn() }));
const notifications = vi.hoisted(() => ({
  getLastNotificationResponse: vi.fn(),
  clearLastNotificationResponse: vi.fn(),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
}));
vi.mock('expo-notifications', () => notifications);
vi.mock('expo-router', () => ({ router: { push: navigation.push }, usePathname: () => navigation.pathname }));
vi.mock('../observability', () => ({ addBreadcrumb: vi.fn() }));

import { pendingPushPath, usePushResponseNavigation, useSettlePendingPushPath } from './push-response';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Navigation() {
  usePushResponseNavigation();
  useSettlePendingPushPath();
  return null;
}

test.each([
  ['job', '/contracting/jobs/j1'],
  ['breakdown', '/contracting/workshop/b1'],
] as const)('a %s note tap preserves Activity through sign-in and settles on %s', async (kind, pathname) => {
  navigation.pathname = '/login';
  const path = `${pathname}?tab=activity`;
  notifications.getLastNotificationResponse.mockReturnValue({
    notification: { request: { content: { data: { business: 'contracting', kind, id: 'r1', path } } } },
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Navigation />);
  });
  expect(navigation.push).toHaveBeenLastCalledWith(path);
  expect(pendingPushPath()).toBe(path);
  navigation.pathname = pathname;
  await act(async () => renderer.update(<Navigation />));
  expect(pendingPushPath()).toBeNull();
  await act(async () => renderer.unmount());
});
