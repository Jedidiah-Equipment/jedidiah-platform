import { createFileRoute } from '@tanstack/react-router';
import { FeedbackPage } from '@/equipment/pages/feedback/FeedbackPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/equipment/feedback')({
  beforeLoad: async ({ context }) => {
    await requireRoutePermission(context, 'equipment_feedback:read');
  },
  staticData: {
    pageLabel: 'Feedback',
  },
  component: FeedbackPage,
});
