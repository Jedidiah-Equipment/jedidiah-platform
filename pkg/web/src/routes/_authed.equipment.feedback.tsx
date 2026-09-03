import { createFileRoute } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
import { FeedbackPage } from '@/pages/feedback/FeedbackPage.js';

export const Route = createFileRoute('/_authed/feedback')({
  beforeLoad: async ({ context }) => {
    await requireRoutePermission(context, 'feedback:read');
  },
  staticData: {
    pageLabel: 'Feedback',
  },
  component: FeedbackPage,
});
