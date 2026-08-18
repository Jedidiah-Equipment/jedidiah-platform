import { statusBadgeColorClassNames } from '@pkg/domain';
import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { DaysLeftChip, STATUS_TONE, StatusChip } from './status-chip';

type TestElement = React.ReactElement<{ [key: string]: unknown }>;

describe('Bay status badges', () => {
  test('uses the shared green badge palette without a dot', () => {
    const badge = StatusChip({ label: 'Scheduled', tone: 'next' }) as TestElement;

    expect(badge.props).toMatchObject({
      classNames: {
        chip: statusBadgeColorClassNames.green.chip,
        text: statusBadgeColorClassNames.green.text,
      },
      label: 'Scheduled',
    });
    expect(badge.props).not.toHaveProperty('dotClassName');
  });

  test('matches the days-left badge to its adjacent status palette', () => {
    const badge = DaysLeftChip({ daysLeft: 2, tone: 'in-progress' }) as TestElement;

    expect(badge.props.classNames).toBe(STATUS_TONE['in-progress']);
    expect(badge.props.label).toBe('2 working days left');
  });
});
