import type { ActivityItem } from '@pkg/schema/contracting';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('@tabler/icons-react-native', () => ({
  IconArrowBarToDown: 'IconArrowBarToDown',
  IconArrowBarUp: 'IconArrowBarUp',
  IconChecks: 'IconChecks',
  IconCircleCheck: 'IconCircleCheck',
  IconFlagFilled: 'IconFlagFilled',
  IconPlayerPlay: 'IconPlayerPlay',
  IconTool: 'IconTool',
  IconUserCheck: 'IconUserCheck',
  IconX: 'IconX',
}));
vi.mock('expo-router', () => ({ router: { push } }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/Avatar', () => ({ Avatar: 'Avatar' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'light' }) }));

import { ActivityEntry, type ActivityScope } from './ActivityEntry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const job = {
  id: '00000000-0000-4000-8000-000000000002',
  jobNumber: 'CJOB-00037',
  farmName: 'Rietvlei',
  customerName: 'Van Wyk Boerdery',
  foremanUserId: 'sipho',
};
const base = {
  id: '00000000-0000-4000-8000-000000000001',
  occurredAt: '2026-10-13T08:00:00.000Z',
  actor: { id: 'sipho', name: 'Sipho', thumbnailDataUrl: null },
};
const note = { ...base, type: 'job-note', job, text: 'Gate code is 4471' } as ActivityItem;
const cancelled = { ...base, type: 'job-cancelled', job, reason: 'Rain' } as ActivityItem;

const opensJobs = { canOpenJob: () => true };

async function render(item: ActivityItem, scope: Partial<ActivityScope> = {}) {
  let renderer: ReactTestRenderer | undefined;
  await act(async () => {
    renderer = create(<ActivityEntry item={item} last scope={{ ...opensJobs, ...scope }} />);
  });
  if (!renderer) throw new Error('Expected a renderer');
  return renderer;
}
const texts = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType('Text' as never).map((node) => [node.props.children].flat().join(''));

describe('ActivityEntry', () => {
  test('a note is a bubble from a person, with a link to its Job', async () => {
    const renderer = await render(note);
    expect(renderer.root.findByType('Avatar' as never).props.name).toBe('Sipho');
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Gate code is 4471', 'CJOB-00037 · Rietvlei']));
    await act(async () => renderer.root.findByProps({ accessibilityRole: 'link' }).props.onPress());
    expect(push).toHaveBeenCalledWith({
      pathname: '/contracting/jobs/[jobId]',
      params: { jobId: job.id, tab: 'activity' },
    });
  });

  test('inside its own Job’s thread a note links nowhere', async () => {
    const renderer = await render(note, { jobId: job.id });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'link' })).toEqual([]);
  });

  test('names a Job this phone does not open without linking to it', async () => {
    const renderer = await render(note, { canOpenJob: () => false });
    expect(renderer.root.findAllByProps({ accessibilityRole: 'link' })).toEqual([]);
    expect(texts(renderer)).toContain('CJOB-00037 · Rietvlei');
    const event = await render(cancelled, { canOpenJob: () => false });
    expect(event.root.findAllByProps({ accessibilityRole: 'button' })).toEqual([]);
  });

  test('an event is a record tile with the domain’s sentence, opening the record’s Details', async () => {
    const renderer = await render(cancelled);
    await act(async () => renderer.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(push).toHaveBeenLastCalledWith({ pathname: '/contracting/jobs/[jobId]', params: { jobId: job.id } });
    expect(renderer.root.findAllByType('Avatar' as never)).toEqual([]);
    expect(renderer.root.find((node) => node.type === ('Icon' as never) && node.props.icon === 'IconX')).toBeDefined();
    expect(texts(renderer)).toEqual(expect.arrayContaining(['Sipho', 'Rain']));
    expect(texts(renderer).some((text) => text.includes(' cancelled CJOB-00037'))).toBe(true);
    expect(
      renderer.root.find((node) => node.type === ('Icon' as never) && node.props.icon === 'IconX').parent?.props
        .className,
    ).toContain('rounded-lg');
  });
});
