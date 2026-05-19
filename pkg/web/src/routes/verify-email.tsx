import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { VerifyEmailPage } from '@/pages/verify-email/VerifyEmailPage.js';

export const Route = createFileRoute('/verify-email')({
  validateSearch: z.object({ token: z.string().min(1) }),
  component: VerifyEmailPage,
});
