import { createFileRoute } from '@tanstack/react-router';

import { SupportPage } from '@/pages/support/SupportPage.js';

export const Route = createFileRoute('/support')({
  component: SupportPage,
});
