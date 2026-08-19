import { useQuery } from '@tanstack/react-query';
import { expect, test, vi } from 'vitest';

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View' }));
vi.mock('@/components/Avatar', () => ({ Avatar: 'Avatar' }));
vi.mock('@/components/bays/JobAssemblies', () => ({ JobAssemblies: 'JobAssemblies' }));
vi.mock('@/components/bays/JobDocuments', () => ({ JobDocuments: 'JobDocuments' }));
vi.mock('@/components/bays/job-facts', () => ({ FactCard: 'FactCard', JobFactsCard: 'JobFactsCard' }));
vi.mock('@/components/feedback/GiveFeedbackButton', () => ({ GiveFeedbackButton: 'GiveFeedbackButton' }));
vi.mock('@/components/feedback/JobFeedbackList', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/feedback/JobFeedbackList')>()),
}));
vi.mock('@/components/ui/pulse', () => ({ Pulse: 'Pulse' }));
vi.mock('@/components/ui/text', () => ({ Text: 'Text' }));
vi.mock('@/lib/trpc', () => ({ useTRPC: () => ({ feedback: { listJobFeedback: { queryOptions: vi.fn() } } }) }));

import { JobDetailSections } from '@/components/bays/JobDetailSections';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList';

type TestElement = React.ReactElement<{ children?: unknown }>;

function elementChildren(element: TestElement): TestElement[] {
  return [element.props.children].flat(2).filter(Boolean) as TestElement[];
}

test('puts Job resources before Feedback and its submit action before the history', () => {
  vi.mocked(useQuery).mockReturnValue({
    data: {
      items: [
        {
          createdAt: new Date('2026-08-19T08:00:00Z'),
          id: 'feedback-1',
          submitter: { name: 'Ada', thumbnailDataUrl: null },
          text: 'Check the drawing.',
        },
      ],
    },
    error: null,
    isPending: false,
    isSuccess: true,
  } as ReturnType<typeof useQuery>);

  const sections = elementChildren(
    JobDetailSections({
      customerCompanyName: null,
      description: null,
      jobCode: 'JOB-001',
      jobId: 'job-1',
      productSerialNumber: null,
      quoteCode: 'Q-001',
      workName: 'Baler',
    }) as TestElement,
  );
  const sectionTypes = sections.map((section) => section.type);

  expect(sectionTypes.indexOf('JobDocuments')).toBeLessThan(sectionTypes.indexOf(JobFeedbackList));
  expect(sectionTypes.indexOf('JobAssemblies')).toBeLessThan(sectionTypes.indexOf(JobFeedbackList));

  const feedbackCard = JobFeedbackList({ jobCode: 'JOB-001', jobId: 'job-1' }) as TestElement;
  const feedbackContent = elementChildren(feedbackCard)[0] as TestElement;
  const feedbackItems = elementChildren(feedbackContent);

  expect(feedbackItems[0]?.type).toBe('GiveFeedbackButton');
});
