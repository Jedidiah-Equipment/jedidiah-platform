import { statusBadgeColorClassNames } from '@pkg/domain';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

const resolved = vi.fn();
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: resolved() }) }));

import { StatusBadge } from './status-badge';

type TestElement = React.ReactElement<{ children?: unknown; className?: string }>;

function badgeTextClassName(scheme: 'dark' | 'light'): string {
  resolved.mockReturnValue(scheme);
  const chip = StatusBadge({ classNames: statusBadgeColorClassNames.green, label: 'Scheduled' }) as TestElement;

  return (chip.props.children as TestElement).props.className ?? '';
}

describe('StatusBadge', () => {
  // The bug behind #1356: native resolved every `dark:` half of the shared palette on a light screen.
  test('paints the light half of the palette in light mode', () => {
    expect(badgeTextClassName('light')).toContain('text-emerald-800');
    expect(badgeTextClassName('light')).not.toContain('emerald-200');
  });

  test('paints the dark half in dark mode', () => {
    expect(badgeTextClassName('dark')).toContain('text-emerald-200');
    expect(badgeTextClassName('dark')).not.toContain('emerald-800');
  });
});
