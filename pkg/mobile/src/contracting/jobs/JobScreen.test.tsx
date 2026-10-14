import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ jobId: 'j1', tab: 'activity' }),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@tabler/icons-react-native', () => ({ IconPlayerPlay: 'Play', IconPlayerStop: 'Stop', IconPlus: 'Plus' }));
vi.mock('@/components/TopToolbar', () => ({ SecondaryToolbar: 'Toolbar' }));
vi.mock('@/components/SubTabControl', () => ({ SubTabControl: 'Tabs' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/status-badge', () => ({ StatusBadge: 'Badge' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/contracting/activity/AddNoteButton', () => ({ AddNoteButton: 'AddNote' }));
vi.mock('@/contracting/activity/ContractingActivityFeed', () => ({ ContractingActivityFeed: 'ActivityFeed' }));
vi.mock('@/contracting/components/BreakdownSubjectIcons', () => ({ BreakdownIcon: 'BreakdownIcon' }));
vi.mock('@/contracting/components/CaptureButton', () => ({ CaptureButton: 'Capture' }));
vi.mock('@/contracting/components/CategoryIcon', () => ({ CategoryIcon: 'CategoryIcon' }));
vi.mock('@/lib/document-actions', () => ({ shareDocument: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('./use-jobs', () => ({ useJob: () => ({ data: undefined, canRead: false }) }));

import JobScreen from './JobScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a Job note deep link opens the authorized Activity feed even when the phone excludes Job details', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<JobScreen />);
  });
  expect(renderer.root.findByType('ActivityFeed' as never).props.jobId).toBe('j1');
  expect(renderer.root.findByType('Toolbar' as never).props.parentLabel).toBe('Activity');
  expect(renderer.root.findAllByType('ScrollView' as never)).toHaveLength(0);
  await act(async () => renderer.unmount());
});
