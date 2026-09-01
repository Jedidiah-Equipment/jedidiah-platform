import { describe, expect, test, vi } from 'vitest';

vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));

import { DaysLeftChip, STATUS_TONE } from './status-chip';

type TestElement = React.ReactElement<{ [key: string]: unknown }>;

describe('Bay status badges', () => {
  test('matches the days-left badge to its adjacent status palette', () => {
    const badge = DaysLeftChip({ daysLeft: 2, tone: 'in-progress' }) as TestElement;

    expect(badge.props.classNames).toBe(STATUS_TONE['in-progress']);
    expect(badge.props.label).toBe('2 working days left');
  });
});
