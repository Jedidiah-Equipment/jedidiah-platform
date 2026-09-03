import { statusBadgeColorClassNames } from '@pkg/domain';
import { expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/status-badge', () => ({ StatusBadge: 'StatusBadge' }));

import { StockBadge } from './StockBadge';

type TestElement = React.ReactElement<{ children?: unknown; [key: string]: unknown }>;

test('uses the same yellow semantic badge treatment as web', () => {
  const frame = StockBadge({ size: 'compact' }) as TestElement;
  const badge = frame.props.children as TestElement;

  expect(frame.props.className).toBe('self-start');
  expect(badge.props).toMatchObject({
    classNames: statusBadgeColorClassNames.yellow,
    label: 'Stock',
    size: 'compact',
  });
});
