import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

const routeParams: Record<string, string> = {
  id: 'machine-1',
  role: 'arrival',
  assignmentId: 'assignment-1',
  jobId: 'job-1',
  captureSessionId: 'capture-1',
};

vi.mock('expo-router', () => ({
  router: { replace: vi.fn() },
  useLocalSearchParams: () => routeParams,
}));
vi.mock('expo-camera', () => ({ CameraView: 'CameraView', useCameraPermissions: () => [{ granted: false }, vi.fn()] }));
vi.mock('react-native', () => ({
  Image: 'Image',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'web' },
  ScrollView: 'ScrollView',
  View: 'View',
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));
vi.mock('@tanstack/react-form', () => ({ useStore: () => ({ implementId: '', driverUserId: '' }) }));
vi.mock('@pkg/domain/contracting', () => ({ fieldJobAccessMode: () => 'own' }));
vi.mock('@/components/form', () => ({ useAppForm: () => ({ store: {}, AppField: () => null }) }));
vi.mock('@/components/TopToolbar', () => ({ SecondaryToolbar: 'SecondaryToolbar' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/components/ui/text-input', () => ({ TextInput: 'TextInput' }));
vi.mock('@/contracting/jobs/use-jobs', () => ({
  useDrivers: () => ({ data: [] }),
  useImplements: () => ({ data: [] }),
}));
vi.mock('@/contracting/readings/derive-capture', () => ({
  deriveCapture: () => ({
    parsed: undefined,
    below: false,
    disputeConfirmed: false,
    missingComment: false,
    canSave: false,
  }),
}));
vi.mock('@/contracting/readings/latest-reading', () => ({ latestKnownReading: () => undefined }));
vi.mock('@/contracting/readings/ReadingQueueProvider', () => ({
  useReadingQueue: () => ({ queue: { enqueue: vi.fn() }, items: [] }),
}));
vi.mock('@/contracting/readings/reading-files', () => ({ keepReadingPhoto: vi.fn(), removeReadingPhoto: vi.fn() }));
vi.mock('@/contracting/readings/reading-queue', () => ({ newLocalId: () => 'local-1' }));
vi.mock('@/contracting/readings/use-fleet', () => ({
  useFleet: () => ({ data: [{ id: 'machine-1', code: 'JD-1' }] }),
  useMachineReadings: () => ({ data: [] }),
}));
vi.mock('@/lib/auth-session', () => ({
  useSessionAccessSummary: () => ({}),
  useSessionPermission: () => true,
}));
vi.mock('@/lib/use-busy-action', () => ({
  useBusyAction: () => ({ busy: false, error: null, setError: vi.fn(), run: vi.fn() }),
}));

import CaptureScreen from './CaptureScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CaptureScreen', () => {
  test('starts each capture session with blank transient fields', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<CaptureScreen />);
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: 'Hour meter value' }).props.onChangeText('100');
      renderer.root.findByProps({ accessibilityLabel: 'Capture comment' }).props.onChangeText('first capture');
    });

    routeParams.role = 'departure';
    routeParams.captureSessionId = 'capture-2';
    act(() => {
      renderer.update(<CaptureScreen />);
    });

    expect(renderer.root.findByProps({ accessibilityLabel: 'Hour meter value' }).props.value).toBe('');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Capture comment' }).props.value).toBe('');
  });
});
