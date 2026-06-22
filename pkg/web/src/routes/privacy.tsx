import { createFileRoute } from '@tanstack/react-router';

import { PrivacyPolicyPage } from '@/pages/privacy/PrivacyPolicyPage.js';

export const Route = createFileRoute('/privacy')({
  component: PrivacyPolicyPage,
});
