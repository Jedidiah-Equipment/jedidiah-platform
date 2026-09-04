import { statusBadgeColorClassNames } from '@pkg/domain';
import { type GeneralFeedbackActivityItem, type JobActivityItem, JobChangeActivityItem } from '@pkg/schema/equipment';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@tabler/icons-react-native', () => ({
  IconCheck: 'IconCheck',
  IconClock: 'IconClock',
  IconFileText: 'IconFileText',
  IconPencil: 'IconPencil',
  IconPlus: 'IconPlus',
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@/components/Avatar', () => ({ Avatar: 'Avatar' }));
vi.mock('@/equipment/components/CustomerName', () => ({ CustomerName: 'CustomerName' }));
vi.mock('@/equipment/components/OfferingAvatar', () => ({ OfferingAvatar: 'OfferingAvatar' }));
vi.mock('@/components/ui/icon', () => ({ Icon: 'Icon' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/theme/use-color-mode', () => ({ useColorMode: () => ({ resolved: 'light' }) }));

import { JobActivityEntry } from './JobActivityEntry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('JobActivityEntry', () => {
  test.each([
    [
      'job-completed',
      statusBadgeColorClassNames.purple.chip,
      statusBadgeColorClassNames.purple.textByScheme.light,
      'IconCheck',
    ],
    [
      'job-work-time-updated',
      statusBadgeColorClassNames.blue.chip,
      statusBadgeColorClassNames.blue.textByScheme.light,
      'IconClock',
    ],
  ] as const)('colors a %s icon by its activity category', async (type, chipClassName, textClassName, icon) => {
    const renderer = await renderEntry(buildChangeItem(type));
    const renderedIcon = renderer.root.findByProps({ icon });

    expect(renderedIcon.props.className).toBe(textClassName);
    expect(renderedIcon.parent?.props.className).toContain(chipClassName);
  });

  test('keeps the event icon and leads the Job row with the offering visual', async () => {
    const item = buildChangeItem('job-completed');
    const renderer = await renderEntry(item);
    const offering = renderer.root.findByProps({
      kind: item.job.offeringKind,
      name: item.job.displayName,
      uri: item.job.thumbnailDataUrl,
    });

    expect(renderer.root.findByProps({ icon: 'IconCheck' })).toBeDefined();
    expect(offering.props).toMatchObject({
      kind: item.job.offeringKind,
      name: item.job.displayName,
      uri: item.job.thumbnailDataUrl,
    });
    const jobCode = renderer.root.findAllByProps({ mono: true }).find((node) => node.props.children === item.job.code);
    expect(jobCode?.props.className).toContain('text-sm');
  });

  test('does not offset the title below the event icon', async () => {
    const item = buildChangeItem('job-completed');
    const renderer = await renderEntry(item);
    const event = renderer.root.findByProps({ accessibilityLabel: `System completed this Job on ${item.job.code}` });

    expect(event.props.className).not.toContain('py-0.5');
  });

  test('does not repeat Work Time state beneath the Job row', async () => {
    const renderer = await renderEntry(buildChangeItem('job-work-time-updated'));

    expect(JSON.stringify(renderer.toJSON())).not.toContain('In progress');
  });

  test('shows a backdated Job completion date beneath the Job row', async () => {
    const renderer = await renderEntry(
      buildChangeItem('job-completed', { completedOn: '2026-08-09', occurredAt: '2026-08-10T09:00:00.000Z' }),
    );

    expect(JSON.stringify(renderer.toJSON())).toContain('Aug 9, 2026');
  });

  test.each([buildChangeItem('job-completed'), buildFeedbackItem()])(
    'does not link back to the Job from a feed already scoped to it',
    async (item) => {
      const renderer = await renderEntry(item, false);

      expect(renderer.root.findAllByProps({ accessibilityHint: 'Opens Job details' })).toHaveLength(0);
    },
  );
});

async function renderEntry(item: JobActivityItem, linkToJob = true): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<JobActivityEntry item={item} last linkToJob={linkToJob} />);
  });
  return renderer;
}

function buildFeedbackItem(): GeneralFeedbackActivityItem {
  return {
    feedback: {
      submitter: {
        email: 'thabo@example.com',
        id: 'user-1' as GeneralFeedbackActivityItem['feedback']['submitter']['id'],
        name: 'Thabo Mokoena',
        thumbnailDataUrl: null,
      },
      text: 'Paint bay handover was missed.' as GeneralFeedbackActivityItem['feedback']['text'],
    },
    id: '10000000-0000-4000-8000-000000000000' as GeneralFeedbackActivityItem['id'],
    job: {
      code: 'JOB-00042' as GeneralFeedbackActivityItem['job']['code'],
      customerCompanyName: 'Acme Mining',
      displayName: 'Cane 8 ton',
      id: '30000000-0000-4000-8000-000000000000' as GeneralFeedbackActivityItem['job']['id'],
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
    occurredAt: '2026-08-10T09:00:00.000Z' as GeneralFeedbackActivityItem['occurredAt'],
    type: 'general-feedback',
  };
}

function buildChangeItem(
  type: 'job-completed' | 'job-work-time-updated',
  overrides: Record<string, unknown> = {},
): JobChangeActivityItem {
  return JobChangeActivityItem.parse({
    actor: null,
    id: '20000000-0000-4000-8000-000000000000',
    job: {
      code: 'JOB-00042',
      customerCompanyName: 'Acme Mining',
      displayName: 'Cane 8 ton',
      id: '30000000-0000-4000-8000-000000000000',
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
    occurredAt: '2026-08-10T09:00:00.000Z',
    ...(type === 'job-completed'
      ? { completedOn: '2026-08-10' }
      : {
          action: 'started',
          department: 'fabrication',
          timing: { completedAt: null, crew: [], startedAt: '2026-08-10T09:00:00.000Z' },
        }),
    ...overrides,
    type,
  });
}
