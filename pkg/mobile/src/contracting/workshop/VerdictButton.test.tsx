import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/button', () => ({ Button: 'Button' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { VerdictButton } from './VerdictButton';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(verdict: Parameters<typeof VerdictButton>[0]['verdict']) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<VerdictButton verdict={verdict} title="Mark solved" onPress={() => undefined} />);
  });
  return renderer;
}

test('Mark solved is absent for someone without the permission', () => {
  const renderer = render({
    allowed: false,
    reason: 'no-permission',
    message: 'You do not have permission to mark it Solved.',
  });
  expect(renderer.root.findAllByType('Button' as never)).toHaveLength(0);
});

test('a refused Mark solved is disabled with the refusal under it', () => {
  const message = 'This Breakdown is Solved, so nothing on it can change.';
  const renderer = render({ allowed: false, reason: 'solved', message });
  expect(renderer.root.findByType('Button' as never).props).toMatchObject({ title: 'Mark solved', disabled: true });
  expect(renderer.root.findByType('Text' as never).props.children).toBe(message);
});

test('an allowed Mark solved can be pressed', () => {
  const renderer = render({ allowed: true });
  expect(renderer.root.findByType('Button' as never).props.disabled).toBe(false);
  expect(renderer.root.findAllByType('Text' as never)).toHaveLength(0);
});
