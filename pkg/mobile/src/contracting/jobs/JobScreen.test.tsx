import { assignmentActionNames, jobActionNames } from '@pkg/schema/contracting';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tab: 'activity',
  job: undefined as unknown,
  breakdowns: undefined as unknown,
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ jobId: 'j1', tab: state.tab }),
  router: { push: vi.fn(), replace: vi.fn() },
}));
vi.mock('react-native', () => ({ Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View' }));
vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
vi.mock('@tabler/icons-react-native', () => ({
  IconPencil: 'Pencil',
  IconPlayerPlay: 'Play',
  IconPlayerStop: 'Stop',
  IconPlus: 'Plus',
  IconRuler2: 'Ruler',
  IconTrash: 'Trash',
}));
vi.mock('@/components/TopToolbar', () => ({ SecondaryToolbar: 'Toolbar' }));
vi.mock('@/components/SubTabControl', () => ({ SubTabControl: 'Tabs' }));
vi.mock('@/components/ui/overflow-menu', () => ({ OverflowMenu: 'OverflowMenu' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/status-badge', () => ({ StatusBadge: 'Badge' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/contracting/activity/AddNoteButton', () => ({ AddNoteButton: 'AddNote' }));
vi.mock('@/contracting/activity/ContractingActivityFeed', () => ({ ContractingActivityFeed: 'ActivityFeed' }));
vi.mock('@/contracting/components/BreakdownSubjectIcons', () => ({
  BreakdownIcon: 'BreakdownIcon',
  BreakdownFlagButton: 'BreakdownFlagButton',
  BreakdownStatusBadge: 'BreakdownStatusBadge',
  BreakdownUrgencyIcon: 'BreakdownUrgencyIcon',
  breakdownBorder: () => undefined,
}));
vi.mock('@/contracting/components/CaptureButton', () => ({ CaptureButton: 'Capture' }));
vi.mock('@/contracting/components/CategoryIcon', () => ({ CategoryIcon: 'CategoryIcon', categoryTileSize: () => 28 }));
vi.mock('@/contracting/workshop/BreakdownRow', () => ({ BreakdownRow: 'BreakdownRow' }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'dark' }) }));
vi.mock('@/lib/document-actions', () => ({ shareDocument: vi.fn() }));
vi.mock('@/lib/observability', () => ({ captureException: vi.fn() }));
vi.mock('@/contracting/workshop/use-breakdowns', () => ({ useJobBreakdowns: () => ({ data: state.breakdowns }) }));
vi.mock('./AttentionDialog', () => ({ AttentionDialog: 'AttentionDialog' }));
vi.mock('./ChangeStintResourcesSheet', () => ({ ChangeStintResourcesSheet: 'ChangeStintResourcesSheet' }));
vi.mock('./TravelHoursSheet', () => ({ TravelHoursSheet: 'TravelHoursSheet' }));
vi.mock('./MeasuresSheet', () => ({ MeasuresSheet: 'MeasuresSheet' }));
vi.mock('./RemoveStintDialog', () => ({ RemoveStintDialog: 'RemoveStintDialog' }));
vi.mock('./use-jobs', () => ({ useJob: () => ({ data: state.job, canRead: state.job !== undefined }) }));

import JobScreen from './JobScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

test('a Job note deep link opens the authorized Activity feed even when the phone excludes Job details', async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<JobScreen />);
  });
  expect(renderer.root.findByType('ActivityFeed' as never).props.thread).toEqual({ kind: 'job', id: 'j1' });
  expect(renderer.root.findByType('Toolbar' as never).props.fallback).toBe('/contracting/(activity)/activity');
  expect(renderer.root.findAllByType('ScrollView' as never)).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('every open Breakdown on a Machine opens from its card, and one on no Machine still shows', async () => {
  const allowed = { allowed: true };
  state.tab = 'details';
  state.job = {
    id: 'j1',
    status: 'active',
    seesMoney: false,
    customerName: 'William Anderson',
    farmName: 'Home',
    workTypeName: 'Destumping',
    actions: Object.fromEntries(jobActionNames.map((name) => [name, allowed])),
    assignments: [
      {
        id: 's1',
        machineId: 'm1',
        machineCode: 'SUM210-1',
        implementId: null,
        implementCode: null,
        categoryName: 'Excavator',
        driverName: null,
        state: 'on-site',
        createdAt: '2026-10-25T13:39:00Z',
        arrival: { at: '2026-10-25T13:40:00Z', hours: 6928.2 },
        departure: null,
        travelHours: null,
        workHours: null,
        measures: [],
        attention: [],
        dismissedAttention: [],
        actions: Object.fromEntries(assignmentActionNames.map((name) => [name, allowed])),
      },
    ],
  };
  const breakdown = (
    id: string,
    urgency: string,
    reportedAt: string,
    subject: { kind: string; id: string; code: string },
  ) => ({
    id,
    urgency,
    status: 'open',
    reportedAt,
    firstLine: `Problem ${id}`,
    subject,
  });
  state.breakdowns = {
    items: [
      breakdown('green', 'code-green', '2026-10-29T18:03:00Z', { kind: 'machine', id: 'm1', code: 'SUM210-1' }),
      breakdown('red', 'code-red', '2026-11-06T07:04:00Z', { kind: 'machine', id: 'm1', code: 'SUM210-1' }),
      breakdown('swapped', 'code-green', '2026-11-01T08:00:00Z', { kind: 'implement', id: 'i9', code: 'DS-2' }),
    ],
  };
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<JobScreen />);
  });
  const opened = renderer.root
    .findAll((node) => node.props.accessibilityHint === 'Opens the Breakdown' && node.type === ('Pressable' as never))
    .map((node) => node.props.accessibilityLabel);
  expect(opened).toEqual(['Code Red on SUM210-1: Problem red', 'Code Green on SUM210-1: Problem green']);
  expect(renderer.root.findAllByType('BreakdownRow' as never).map((node) => node.props.breakdown.id)).toEqual([
    'swapped',
  ]);
  await act(async () => renderer.unmount());
});
